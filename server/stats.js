// Kullanım istatistiği: TV her içerik bittiğinde "oynatıldı" bildirir; sunucu bağlı cihazların açık kalma
// süresini dakika dakika sayar. Veriler günlük toplam olarak SQLite'ta tutulur (kişisel veri içermez), 400 günden eskisi silinir.
const config = require('./config');
const store = require('./store');

const dayOf = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: config.TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const shiftDay = (n, from = new Date()) => dayOf(new Date(from.getTime() - n * 86400000));

function play(tid, id, sec) {
  if (!tid || typeof id !== 'string' || !/^[\w:-]{1,64}$/.test(id)) return;
  const day = dayOf(), s = Math.max(0, Math.min(3600, Math.round(Number(sec) || 0)));
  store.q.statAdd.run(tid, day, 'play', id, 1);
  if (s) store.q.statAdd.run(tid, day, 'sec', id, s);
}
function online(tid, deviceId, minutes = 1) { store.q.statAdd.run(tid, dayOf(), 'online', deviceId, minutes); }

// Panel için özet: son N günün günlük ekran süresi, içerik bazında oynatma sayısı ve süresi
function summary(t, days = 30) {
  const from = shiftDay(days - 1), rows = store.q.statRange.all(t.id, from);
  const daily = {}; for (let i = days - 1; i >= 0; i--) daily[shiftDay(i)] = { online: 0, plays: 0, sec: 0 };
  const items = {};
  for (const r of rows) {
    const d = daily[r.day]; if (!d) continue;
    if (r.kind === 'online') d.online += r.value;
    else {
      const it = items[r.key] || (items[r.key] = { id: r.key, plays: 0, sec: 0, last: '' });
      if (r.kind === 'play') { it.plays += r.value; d.plays += r.value; } else { it.sec += r.value; d.sec += r.value; }
      if (r.day > it.last) it.last = r.day;
    }
  }
  // içerik adları: medya, hazır afiş, Instagram
  const names = new Map(t.db.videos.map(v => [v.id, { name: v.name, type: v.type || 'video' }]));
  for (const p of t.db.posters || []) names.set(p.id, { name: p.name || 'Hazır içerik', type: 'poster' });
  const list = Object.values(items).map(it => {
    const n = names.get(it.id) || (it.id.startsWith('ig:') ? { name: 'Instagram paylaşımı', type: 'instagram' } : it.id.startsWith('tr:') ? { name: 'Film fragmanı', type: 'trailer' } : { name: 'Silinmiş içerik', type: 'gone' });
    return { ...it, ...n };
  }).sort((a, b) => b.plays - a.plays);
  const tot = Object.values(daily).reduce((a, d) => ({ online: a.online + d.online, plays: a.plays + d.plays, sec: a.sec + d.sec }), { online: 0, plays: 0, sec: 0 });
  return { days, from, daily: Object.entries(daily).map(([day, v]) => ({ day, ...v })), items: list, totals: tot };
}

function purge() { store.q.statPurge.run(shiftDay(400)); }
function start() { setInterval(purge, 24 * 3600 * 1000); setTimeout(purge, 60000); }

module.exports = { play, online, summary, start, dayOf };
