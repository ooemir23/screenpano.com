// Namaz vakitleri ve güneş doğuş/batış: işletmenin konumundan hesaplanır (adhan, Diyanet yöntemi); dış servis gerekmez.
// Hesaplanan değerler Diyanet'in yerel takvimiyle 1-2 dakika ayrışabilir.
const adhan = require('adhan');
const config = require('./config');
const KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
const cache = new Map();
const dayKey = (d, tz) => d.toLocaleDateString('en-CA', { timeZone: tz });
function day(lat, lon, d, tz) {
  const dk = dayKey(d, tz), k = `${lat.toFixed(2)},${lon.toFixed(2)},${dk}`;
  if (cache.has(k)) return cache.get(k);
  const [y, m, dd] = dk.split('-').map(Number); // adhan sistem saatine bakar: işletmenin takvim gününü yerel tarih olarak ver
  const pt = new adhan.PrayerTimes(new adhan.Coordinates(lat, lon), new Date(y, m - 1, dd), adhan.CalculationMethod.Turkey());
  const v = { date: dk, t: Object.fromEntries(KEYS.map(x => [x, pt[x].getTime()])) };
  if (cache.size > 200) cache.clear();
  cache.set(k, v); return v;
}
// bugün ve yarın (TV gece yarısını geçince kendi saatine göre doğru günü seçer)
function forTenant(t) {
  const l = (t.db && t.db.location) || {}, lat = Number(l.lat), lon = Number(l.lon), tz = config.TZ;
  const la = isFinite(lat) && l.lat !== undefined && l.lat !== null && l.lat !== '' ? lat : 41.01, lo = isFinite(lon) && l.lon !== undefined && l.lon !== null && l.lon !== '' ? lon : 28.98;
  const now = Date.now();
  return { tz, city: l.city || '', days: [now - 864e5, now, now + 864e5].map(ms => day(la, lo, new Date(ms), tz)) };
}
module.exports = { forTenant, KEYS };
