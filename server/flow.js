// Akış özeti: seçilen günün (24 saat) kuş bakışı haritası. TV'nin sıralama kurallarının sunucu tarafı benzetimi (TAHMİNİ).
// Gerçek akışı TV belirler (public/tv.html next/advance + kampanya/büyük maç zamanlayıcıları).
// Sıra: ana döngü (medya + kitap + Instagram + platform reklamı) sunucuda dizilir; kampanya, büyük maç ve
// fragman TV'de araya girer: büyük maç > kampanya > fragman, hepsi o anki içerik bittikten sonra.
// Zamanlı içerik (sch), zamanlı kampanya/indirim saati ve özel yayın her dakika yeniden değerlendirilir.
const SCH = require('./sched');
const { publicState } = require('./state');

const TRAILER_SEC = 90;          // fragman süresi YouTube'dan gelir; sunucu bilmez, ortalama
const VIDEO_UNKNOWN_SEC = 30;    // süresi henüz ölçülmemiş video
const DAY = 86400;
const TOP_N = 8;

function kindOf(v) {
  if (String(v.id || '').startsWith('pad:')) return 'ad';
  if (v.tpl === 'kitap') return 'book';
  if (v.tpl === 'insta') return 'insta';
  if (v.type === 'youtube') return 'youtube';
  if (v.type === 'poster') return 'poster';
  if (v.type === 'image') return 'image';
  return 'video';
}
const isStill = k => k === 'image' || k === 'poster' || k === 'book' || k === 'insta';

// dayOffset: 0 = bugün … 6
function summary(t, screenId, dayOffset = 0) {
  dayOffset = Math.max(0, Math.min(6, Math.round(Number(dayOffset)) || 0));
  const s = publicState(t, screenId);
  const empty = extra => ({ day: dayOffset, hours: [], totals: [], top: [], rules: {}, ...extra });
  if (s.blocked) return empty({ blocked: s.blocked });
  const imgSec = Number(s.imageSeconds) || 10;
  const toItem = v => {
    const k = kindOf(v), given = Number(v.dur) || 0;
    return { kind: k, name: String(v.name || ''), dur: given || (isStill(k) ? imgSec : VIDEO_UNKNOWN_SEC), est: !given && !isStill(k), sch: v.sch || null };
  };
  const all = (s.videos || []).map(toItem);

  const trailers = s.showTrailers !== false && s.movies && Array.isArray(s.movies.items) ? s.movies.items.filter(m => m.trailer) : [];
  const trEvery = Math.max(1, Number(s.trailerEvery) || 4), trGap = (Number(s.trailerGapMin) || 8) * 60;
  const campsAll = s.campaigns || [];
  const bigsAll = s.bigMatches || [];
  const bigGap = ((s.bigCfg || {}).everyMin || 6) * 60, bigDur = (s.bigCfg || {}).durSec || 15;
  const specials = (t.db.special || []).filter(r => r.on && r.sch);

  // Günün başlangıcı (işletme saat dilimine göre 00:00)
  const now = new Date(), [hh, mm] = SCH.parts(now).hm.split(':').map(Number);
  const start = now.getTime() - ((hh * 60 + mm) * 60 + now.getSeconds()) * 1000 + dayOffset * DAY * 1000;
  const date = SCH.parts(new Date(start + 12 * 3600 * 1000)).ymd;

  // Dakika başına bir kez: o dakikada geçerli içerik, kampanya ve özel yayın
  let ctxMin = -1, ctx = null;
  const context = at => {
    const m = Math.floor(at / 60);
    if (m === ctxMin) return ctx;
    ctxMin = m;
    const d = new Date(start + m * 60000);
    let sp = null;
    for (const r of specials) {
      if (!SCH.active(r.sch, d)) continue;
      const items = (r.items || []).map(id => (t.db.videos || []).find(v => v.id === id)).filter(v => v && !(v.status === 'processing' && !v.reopt)).map(v => toItem({ ...v, sch: null }));
      if (items.length) { sp = { name: r.name || '', items }; break; }
    }
    ctx = sp
      ? { sp, items: sp.items, camps: [], bigs: [] }
      : { sp: null, items: all.filter(v => !v.sch || SCH.active(v.sch, d)), camps: campsAll.filter(c => !c.sch || SCH.active(c.sch, d)), bigs: bigsAll };
    return ctx;
  };

  const hours = Array.from({ length: 24 }, () => ({ strip: [], counts: {}, n: 0, round: 0, special: null, seq: [] }));
  const SEQ_MAX = 40; // saate tıklayınca gösterilen ilk gösterimler (sıra)
  const totals = {}, top = new Map();
  let at = 0, idx = 0, plays = 0, trAt = -Infinity, trK = 0, bigLast = null;
  const campLast = {};

  const addEv = (kind, name, dur) => {
    dur = Math.max(1, Math.round(dur));
    const h0 = Math.floor(at / 3600);
    if (h0 < 24) { hours[h0].counts[kind] = (hours[h0].counts[kind] || 0) + 1; if (hours[h0].seq.length < SEQ_MAX) hours[h0].seq.push([at - h0 * 3600, kind, name, dur]); }
    const tt = totals[kind] || (totals[kind] = { kind, plays: 0, sec: 0 }); tt.plays++; tt.sec += dur;
    const key = kind + '|' + name, tp = top.get(key) || { kind, name, plays: 0, sec: 0 }; tp.plays++; tp.sec += dur; top.set(key, tp);
    let a = at, rem = dur, first = true;
    while (rem > 0 && a < DAY) {
      const H = hours[Math.floor(a / 3600)], take = Math.min(rem, (Math.floor(a / 3600) + 1) * 3600 - a), last = H.strip[H.strip.length - 1];
      if (last && last[0] === kind) { last[1] += take; if (first) last[2]++; } else H.strip.push([kind, take, 1]);
      first = false; a += take; rem -= take;
    }
    at += dur;
  };

  while (at < DAY) {
    const c = context(at), H = hours[Math.floor(at / 3600)];
    if (!c.items.length) { at = (Math.floor(at / 60) + 1) * 60; continue; } // o dakikada oynayacak içerik yok
    if (!H.n) { H.n = c.items.length; H.round = c.items.reduce((a, b) => a + b.dur, 0); }
    if (c.sp) H.special = c.sp.name || true;
    const it = c.items[idx++ % c.items.length];
    addEv(it.kind, it.name, it.dur);
    if (c.sp) continue; // özel yayında araya bir şey girmez
    // O an dolmuş araya girenler (TV her 5 sn'de bakar, içerik bitince gösterir)
    if (c.bigs.length && at >= (bigLast == null ? -bigGap + 60 : bigLast) + bigGap) {
      bigLast = at;
      for (const m of c.bigs) addEv('big', m.name || (m.home && m.away ? m.home + ' – ' + m.away : 'Büyük maç'), bigDur);
      continue;
    }
    const camp = c.camps.find(k => at >= (campLast[k.id] == null ? -(k.everyMin || 3) * 60 + 25 : campLast[k.id]) + (k.everyMin || 3) * 60);
    if (camp) { campLast[camp.id] = at; addEv('camp', camp.headline || 'Kampanya', camp.durSec || 15); continue; }
    if (trailers.length && ++plays >= trEvery && at - trAt > trGap) {
      const m = trailers[trK++ % trailers.length];
      addEv('trailer', m.title || m.name || 'Fragman', TRAILER_SEC); trAt = at; plays = 0;
    }
  }

  const loopNow = context(Math.max(0, Math.min(DAY - 1, dayOffset === 0 ? (hh * 60 + mm) * 60 : 12 * 3600)));
  return {
    day: dayOffset, date, nowHour: dayOffset === 0 ? hh : null,
    hours,
    totals: Object.values(totals).sort((a, b) => b.sec - a.sec),
    top: [...top.values()].sort((a, b) => b.plays - a.plays || b.sec - a.sec).slice(0, TOP_N),
    loopCount: loopNow.items.length,
    rules: {
      trailer: trailers.length ? { every: trEvery, gapMin: Math.round(trGap / 60), count: trailers.length } : null,
      camps: campsAll.map(c => ({ name: c.headline || 'Kampanya', everyMin: c.everyMin || 3, durSec: c.durSec || 15 })),
      big: bigsAll.length ? { everyMin: Math.round(bigGap / 60), durSec: bigDur, count: bigsAll.length } : null,
    },
  };
}

module.exports = { summary, kindOf };
