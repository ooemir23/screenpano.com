// Kullanım istatistiği: TV her içerik bittiğinde "oynatıldı" bildirir; sunucu bağlı cihazların açık kalma
// süresini dakika dakika sayar. Veriler günlük toplam olarak SQLite'ta tutulur (kişisel veri içermez), 400 günden eskisi silinir.
const config = require('./config');
const store = require('./store');

const dayOf = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: config.TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const shiftDay = (n, from = new Date()) => dayOf(new Date(from.getTime() - n * 86400000));

const hourOf = (d = new Date()) => { const h = new Intl.DateTimeFormat('en-GB', { timeZone: config.TZ, hour: '2-digit', hour12: false }).format(d); return (h === '24' ? '00' : h).padStart(2, '0'); };

function play(tid, id, sec) {
  if (!tid || typeof id !== 'string' || !/^[\w:-]{1,64}$/.test(id)) return;
  const day = dayOf(), s = Math.max(0, Math.min(3600, Math.round(Number(sec) || 0)));
  store.q.statAdd.run(tid, day, 'play', id, 1);
  store.q.statAdd.run(tid, day, 'playh', hourOf(), 1); // saat bazında yoğunluk
  if (s) store.q.statAdd.run(tid, day, 'sec', id, s);
}
// QR okutma: kısa adres (/q/kod) her açıldığında bir kez; yalnızca sayı tutulur (ad, IP, telefon bilgisi saklanmaz)
function scan(tid, key, dev) {
  const day = dayOf(), h = hourOf(), d = ['ios', 'android'].includes(dev) ? dev : 'other';
  store.q.statAdd.run(tid, day, 'qr', key, 1);
  store.q.statAdd.run(tid, day, 'qrh', key + ':' + h, 1);
  store.q.statAdd.run(tid, day, 'qrd', key + ':' + d, 1);
}
// Özel kartların ekranda gösterilme sayısı: kampanya kartı, büyük maç kartı, gol bildirimi
function shown(tid, kind) { if (tid && ['camp', 'big', 'goal'].includes(kind)) store.q.statAdd.run(tid, dayOf(), 'shown', kind, 1); }
// Kesinti: cihazın bağlantısı koptu, 2 dakikadan uzun sürede geri geldi
const downAt = new Map();
function deviceDown(tid, deviceId) { downAt.set(deviceId, Date.now()); }
function deviceUp(tid, deviceId) {
  const t0 = downAt.get(deviceId); if (!t0) return; downAt.delete(deviceId);
  const sec = Math.round((Date.now() - t0) / 1000);
  if (sec < 120) return;
  const day = dayOf(new Date(t0)); store.q.statAdd.run(tid, day, 'drop', deviceId, 1); store.q.statAdd.run(tid, day, 'dropsec', deviceId, Math.min(sec, 86400));
}
function online(tid, deviceId, minutes = 1) { store.q.statAdd.run(tid, dayOf(), 'online', deviceId, minutes); }

// Panel için özet: son N günün günlük ekran süresi, içerik bazında oynatma, QR okutma, saat yoğunluğu, kesintiler ve önceki dönemle karşılaştırma
function summary(t, days = 30) {
  const from = shiftDay(days - 1), prevFrom = shiftDay(2 * days - 1), rows = store.q.statRange.all(t.id, prevFrom);
  const daily = {}; for (let i = days - 1; i >= 0; i--) daily[shiftDay(i)] = { online: 0, plays: 0, sec: 0, scans: 0, drops: 0, dropsec: 0 };
  const items = {}, prev = { online: 0, plays: 0, scans: 0, drops: 0, dropsec: 0 }, shown = { camp: 0, big: 0, goal: 0 };
  const heat = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const qr = {}; const Q = id => qr[id] || (qr[id] = { scans: 0, daily: {}, hours: new Array(24).fill(0), dev: { ios: 0, android: 0, other: 0 } });
  for (const r of rows) {
    if (r.day < from) { // önceki dönem: yalnız toplamlar
      if (r.kind === 'online') prev.online += r.value; else if (r.kind === 'play') prev.plays += r.value; else if (r.kind === 'qr') prev.scans += r.value; else if (r.kind === 'drop') prev.drops += r.value; else if (r.kind === 'dropsec') prev.dropsec += r.value;
      continue;
    }
    const d = daily[r.day]; if (!d) continue;
    if (r.kind === 'online') d.online += r.value;
    else if (r.kind === 'playh') { const wd = (new Date(r.day + 'T12:00:00Z').getUTCDay() + 6) % 7; heat[wd][Number(r.key)] += r.value; }
    else if (r.kind === 'qr') { d.scans += r.value; const q = Q(r.key); q.scans += r.value; q.daily[r.day] = (q.daily[r.day] || 0) + r.value; }
    else if (r.kind === 'qrh') { const [id, h] = r.key.split(/:(?=\d\d$)/); Q(id).hours[Number(h)] += r.value; }
    else if (r.kind === 'qrd') { const m = /^(.*):(ios|android|other)$/.exec(r.key); if (m) Q(m[1]).dev[m[2]] += r.value; }
    else if (r.kind === 'shown') { if (r.key in shown) shown[r.key] += r.value; }
    else if (r.kind === 'drop') d.drops += r.value;
    else if (r.kind === 'dropsec') d.dropsec += r.value;
    else {
      const it = items[r.key] || (items[r.key] = { id: r.key, plays: 0, sec: 0, last: '' });
      if (r.kind === 'play') { it.plays += r.value; d.plays += r.value; } else if (r.kind === 'sec') { it.sec += r.value; d.sec += r.value; }
      if (r.day > it.last) it.last = r.day;
    }
  }
  // içerik adları: medya, hazır afiş, Instagram
  const names = new Map(t.db.videos.map(v => [v.id, { name: v.name, type: v.type || 'video' }]));
  for (const p of t.db.posters || []) names.set(p.id, { name: p.name || 'Hazır içerik', type: 'poster' });
  const list = Object.values(items).map(it => {
    const n = names.get(it.id) || (it.id.startsWith('ig:') ? { name: 'Instagram paylaşımı', type: 'instagram' } : it.id.startsWith('tr:') ? { name: 'Film fragmanı', type: 'trailer' } : { name: 'Silinmiş içerik', type: '' });
    return { ...it, ...n };
  }).sort((a, b) => b.plays - a.plays);
  const dayList = Object.keys(daily);
  const qrList = [];
  for (const q of t.db.qrs || []) {
    if (q.code) { const s = qr[q.id] || Q(q.id); qrList.push({ id: q.id, label: q.label, kind: 'qr', tracked: true, scans: s.scans, daily: dayList.map(d => s.daily[d] || 0), hours: s.hours, dev: s.dev }); }
    else qrList.push({ id: q.id, label: q.label, kind: q.kind === 'wifi' ? 'wifi' : 'text', tracked: false });
  }
  for (const c of t.db.campaigns || []) if (c.code) { const s = qr['camp:' + c.id] || Q('camp:' + c.id); qrList.push({ id: c.id, label: c.headline || 'Kampanya', kind: 'camp', tracked: true, enabled: !!c.enabled, scans: s.scans, daily: dayList.map(d => s.daily[d] || 0), hours: s.hours, dev: s.dev }); }
  const tot = Object.values(daily).reduce((a, d) => ({ online: a.online + d.online, plays: a.plays + d.plays, sec: a.sec + d.sec, scans: a.scans + d.scans, drops: a.drops + d.drops, dropsec: a.dropsec + d.dropsec }), { online: 0, plays: 0, sec: 0, scans: 0, drops: 0, dropsec: 0 });
  return { days, from, daily: Object.entries(daily).map(([day, v]) => ({ day, ...v })), items: list, totals: tot, prev, heat, qr: qrList, shown };
}
// Dışa aktarma (Excel için ; ayraçlı, UTF-8 BOM'lu)
function csv(t, days = 30) {
  const j = summary(t, days), q = v => '"' + String(v).replace(/"/g, '""') + '"';
  const out = [['Tarih', 'Ekran açık (dk)', 'İçerik oynatma', 'QR okutma', 'Kesinti sayısı', 'Kesinti süresi (dk)'].map(q).join(';')];
  for (const d of j.daily) out.push([d.day, d.online, d.plays, d.scans, d.drops, Math.round(d.dropsec / 60)].join(';'));
  out.push('', ['QR', 'Okutma', 'iPhone', 'Android', 'Diğer'].map(q).join(';'));
  for (const x of j.qr) out.push(x.tracked ? [q(x.label), x.scans, x.dev.ios, x.dev.android, x.dev.other].join(';') : [q(x.label), q('sayılamaz'), '', '', ''].join(';'));
  out.push('', ['İçerik', 'Oynatma', 'Süre (sn)'].map(q).join(';'));
  for (const it of j.items) out.push([q(it.name), it.plays, it.sec].join(';'));
  return '\ufeff' + out.join('\r\n') + '\r\n';
}

function purge() { store.q.statPurge.run(shiftDay(400)); }
function start() { setInterval(purge, 24 * 3600 * 1000); setTimeout(purge, 60000); }

module.exports = { play, online, scan, shown, deviceDown, deviceUp, summary, csv, start, dayOf };
