// Akış özeti: TV'nin sıralama kurallarının sunucu tarafı benzetimi (TAHMİNİ).
// Gerçek akışı TV belirler (public/tv.html next/advance + kampanya/büyük maç zamanlayıcıları).
// Sıra: ana döngü (medya + kitap + Instagram + platform reklamı) sunucuda dizilir; kampanya, büyük maç ve
// fragman TV'de araya girer: büyük maç > kampanya > fragman, hepsi o anki içerik bittikten sonra.
const SCH = require('./sched');
const { publicState } = require('./state');

const TRAILER_SEC = 90;          // fragman süresi YouTube'dan gelir; sunucu bilmez, ortalama
const VIDEO_UNKNOWN_SEC = 30;    // süresi henüz ölçülmemiş video
const HORIZON_SEC = 20 * 60;     // gösterilecek zaman çizelgesi
const MAX_EVENTS = 120;

function kindOf(v) {
  if (String(v.id || '').startsWith('pad:')) return 'ad';
  if (v.tpl === 'kitap') return 'book';
  if (v.tpl === 'insta') return 'insta';
  if (v.type === 'youtube') return 'youtube';
  if (v.type === 'poster') return 'poster';
  if (v.type === 'image') return 'image';
  return 'video';
}

function summary(t, screenId) {
  const s = publicState(t, screenId);
  if (s.blocked) return { blocked: s.blocked, loop: [], loopSec: 0, timeline: [], rules: {}, horizonSec: HORIZON_SEC };
  const imgSec = Number(s.imageSeconds) || 10;
  const items = (s.videos || []).filter(v => !v.sch || SCH.active(v.sch)).map(v => {
    const k = kindOf(v), still = k === 'image' || k === 'poster' || k === 'book' || k === 'insta';
    const given = Number(v.dur) || 0;
    return { kind: k, name: String(v.name || ''), dur: given || (still ? imgSec : VIDEO_UNKNOWN_SEC), est: !given && !still };
  });
  const loopSec = items.reduce((a, b) => a + b.dur, 0);

  // Araya girenler (özel yayında hiçbiri çıkmaz; TV de böyle davranır)
  const sp = !!s.special;
  const trailers = !sp && s.showTrailers !== false && s.movies && Array.isArray(s.movies.items) ? s.movies.items.filter(m => m.trailer) : [];
  const trEvery = Math.max(1, Number(s.trailerEvery) || 4), trGap = (Number(s.trailerGapMin) || 8) * 60;
  const camps = (sp ? [] : (s.campaigns || [])).filter(c => !c.sch || SCH.active(c.sch));
  const bigs = sp ? [] : (s.bigMatches || []);
  const bigGap = ((s.bigCfg || {}).everyMin || 6) * 60, bigDur = (s.bigCfg || {}).durSec || 15;

  const timeline = [];
  if (items.length) {
    let now = 0, idx = 0, plays = 0, trAt = -Infinity, trK = 0, bigLast = null;
    const campLast = {};
    const push = (kind, name, dur, est) => timeline.push({ at: Math.round(now), kind, name, dur: Math.round(dur), est: !!est });
    while (now < HORIZON_SEC && timeline.length < MAX_EVENTS) {
      const it = items[idx++ % items.length];
      push(it.kind, it.name, it.dur, it.est); now += it.dur;
      // O an dolmuş araya girenler (TV her 5 sn'de bakar, içerik bitince gösterir)
      if (bigs.length && now >= (bigLast == null ? -bigGap + 60 : bigLast) + bigGap) {
        bigLast = now;
        for (const m of bigs) { push('big', m.name || (m.home && m.away ? m.home + ' – ' + m.away : 'Büyük maç'), bigDur); now += bigDur; }
        continue;
      }
      const c = camps.find(c => now >= (campLast[c.id] == null ? -(c.everyMin || 3) * 60 + 25 : campLast[c.id]) + (c.everyMin || 3) * 60);
      if (c) { campLast[c.id] = now; push('camp', c.headline || 'Kampanya', c.durSec || 15); now += c.durSec || 15; continue; }
      if (trailers.length && ++plays >= trEvery && now - trAt > trGap) {
        const m = trailers[trK++ % trailers.length];
        push('trailer', m.title || m.name || 'Fragman', TRAILER_SEC, true); now += TRAILER_SEC; trAt = now; plays = 0;
      }
    }
  }
  return {
    loop: items, loopSec: Math.round(loopSec), timeline, horizonSec: HORIZON_SEC, special: sp ? (s.special.name || true) : null,
    rules: {
      trailer: trailers.length ? { every: trEvery, gapMin: Math.round(trGap / 60), count: trailers.length } : null,
      camps: camps.map(c => ({ name: c.headline || 'Kampanya', everyMin: c.everyMin || 3, durSec: c.durSec || 15 })),
      big: bigs.length ? { everyMin: Math.round(bigGap / 60), durSec: bigDur, count: bigs.length } : null,
    },
  };
}

module.exports = { summary, kindOf };
