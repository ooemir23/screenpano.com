// Bellekteki işletme kayıtları. Her işletme: veritabanı satırı + içerik dokümanı (db) + kendi klasörü.
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');
const store = require('./store');
const { THEMES } = require('./widgets');

// Eski tek-kafe sürümündeki db.json yapısı + yeni alanlar (konum, tema, fiyat tarifesi, varlıklar)
const defaultDoc = () => ({
  videos: [], matches: [], birthdays: [], times: ['13:00', '19:00'], duration: 40, imageSeconds: 10, reviews: [], leagues: null,
  channels: {}, leagueChannels: {}, showStandings: true, qrs: [], showQr: true, fxMode: 'auto', safeInset: 0, safeGuide: false,
  showOnThisDay: true, pharmacy: { enabled: true, il: 'İstanbul', districts: [] }, news: { enabled: true, tag: 'general' },
  movies: { enabled: true, trailers: true }, showBooks: true, showTraffic: true,
  bigMatch: { enabled: true, note: 'Rezervasyon yaptırmayı unutmayın!', days: 3, everyMin: 6, durSec: 15, info: ['', '', ''] }, bigPhotos: [],
  campaigns: [{ id: 'google-yorum', kind: 'review', enabled: false, url: '', headline: 'Yorumunuz bizim için çok değerli!', sub: 'İlk yorumunuzda sıcak içecek ikramımızdır ☕', note: 'Yorum yaptıktan sonra lütfen bir yetkiliye haber verin.', qrLabel: "Google'da bizi değerlendirin", everyMin: 3, durSec: 15 }],
  location: { city: 'İstanbul', lat: 41.01, lon: 28.98 },
  theme: (({ name, ...t }) => t)(THEMES.kahve),
  logo: null,          // yüklenen logo dosya adı
  menu: { title: 'Fiyat Listesi', currency: '₺', categories: [] },
  assets: [],          // görsel widget'ı için yüklenen resimler
});

const cache = new Map(); // id -> tenant

function dirsFor(id) {
  const base = path.join(DATA_DIR, 'tenants', id);
  const d = { base, uploads: path.join(base, 'uploads'), backups: path.join(base, 'backups') };
  fs.mkdirSync(d.uploads, { recursive: true }); fs.mkdirSync(d.backups, { recursive: true });
  return d;
}

function hydrate(row) {
  const parsed = store.J(row.data) || {};
  const doc = { ...defaultDoc(), ...parsed };
  const t = cache.get(row.id) || {};
  Object.assign(t, row, { db: doc, dirs: dirsFor(row.id) });
  delete t.data;
  t.upBase = `/u/${row.id}/`;
  cache.set(row.id, t);
  return t;
}

function get(id) {
  if (cache.has(id)) return cache.get(id);
  const row = store.q.tenantGet.get(id);
  return row ? hydrate(row) : null;
}
function all() {
  for (const row of store.q.tenantAll.all()) if (!cache.has(row.id)) hydrate(row);
  return [...cache.values()];
}
// Plan/durum gibi satır alanları değişince belleği tazele (içerik dokümanı korunur)
function refreshRow(id) {
  const row = store.q.tenantGet.get(id);
  if (!row) { cache.delete(id); return null; }
  const t = cache.get(id);
  if (!t) return hydrate(row);
  const { data, ...rest } = row;
  Object.assign(t, rest);
  return t;
}
const saveTimers = new Map();
function save(t) { // aynı anda çok değişiklik gelirse tek yazım
  clearTimeout(saveTimers.get(t.id));
  saveTimers.set(t.id, setTimeout(() => { saveTimers.delete(t.id); store.q.tenantData.run(JSON.stringify(t.db), t.id); }, 200));
}
function saveNow(t) { clearTimeout(saveTimers.get(t.id)); saveTimers.delete(t.id); store.q.tenantData.run(JSON.stringify(t.db), t.id); }
function remove(id) {
  require('./storage').removeTenant(id).catch(() => {});
  store.q.tenantDel.run(id); cache.delete(id);
  fs.rmSync(path.join(DATA_DIR, 'tenants', id), { recursive: true, force: true });
}
function flushAll() { for (const [id] of [...saveTimers]) { const t = cache.get(id); if (t) saveNow(t); } }
process.on('exit', flushAll);

// İşletme başına tek ekran (düzen). Yoksa varsayılan düzenle oluşturulur.
function mainScreen(t) {
  const s = store.q.screensOf.all(t.id)[0];
  if (s) return s;
  const W = require('./widgets'), { plan } = require('./plans');
  const row = { id: require('crypto').randomBytes(6).toString('hex'), tenant_id: t.id, name: 'Ana Ekran', layout: JSON.stringify(W.cleanLayout(W.defaultLayout(plan(t).pro ? 'spor' : 'temel'))), sort: 0, created: Date.now() };
  store.q.screenIns.run(row);
  return row;
}

module.exports = { defaultDoc, get, all, refreshRow, save, saveNow, flushAll, remove, dirsFor, mainScreen };
