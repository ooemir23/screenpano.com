// Zamanlama kuralı: { days: [1..7] (Pzt=1), from: 'HH:MM', to: 'HH:MM', start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }
// Hepsi isteğe bağlı; boş kural "her zaman" demektir. "to" "from"dan küçükse gece yarısını aşar (22:00–02:00).
const config = require('./config');
const HM = /^([01]\d|2[0-3]):[0-5]\d$/, YMD = /^\d{4}-\d{2}-\d{2}$/;

function clean(s) {
  if (!s || typeof s !== 'object') return null;
  const o = {};
  if (Array.isArray(s.days)) { const d = [...new Set(s.days.map(Number).filter(n => n >= 1 && n <= 7))].sort(); if (d.length && d.length < 7) o.days = d; }
  if (HM.test(s.from || '') && HM.test(s.to || '') && s.from !== s.to) { o.from = s.from; o.to = s.to; }
  if (YMD.test(s.start || '')) o.start = s.start;
  if (YMD.test(s.end || '')) o.end = s.end;
  return Object.keys(o).length ? o : null;
}

function parts(d = new Date(), tz = config.TZ) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(d);
  const g = t => (p.find(x => x.type === t) || {}).value;
  return { ymd: `${g('year')}-${g('month')}-${g('day')}`, hm: `${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`, dow: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(g('weekday')) + 1 };
}
function active(s, d = new Date()) {
  if (!s) return true;
  const n = parts(d);
  if (s.start && n.ymd < s.start) return false;
  if (s.end && n.ymd > s.end) return false;
  if (s.from && s.to) {
    const inside = s.from < s.to ? n.hm >= s.from && n.hm < s.to : n.hm >= s.from || n.hm < s.to;
    if (!inside) return false;
    // gece yarısını aşan aralıkta gün, aralığın başladığı gündür
    const dow = s.from > s.to && n.hm < s.to ? (n.dow + 5) % 7 + 1 : n.dow;
    if (s.days && !s.days.includes(dow)) return false;
  } else if (s.days && !s.days.includes(n.dow)) return false;
  return true;
}
// Takvim tarihi geçmiş (bir daha hiç görünmeyecek) mi?
const expired = (s, d = new Date()) => !!(s && s.end && parts(d).ymd > s.end);

module.exports = { clean, active, expired, parts };
