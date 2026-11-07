// Platform yedeği: tüm veritabanı (işletmeler, kullanıcılar, cihazlar, içerik ayarları, istatistikler) her gece
// sıkıştırılıp DATA_DIR/backups'a yazılır; R2 ayarlıysa R2'ye de gönderilir. Medya dosyaları R2'de zaten kalıcıdır.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const config = require('./config');
const store = require('./store');
const s3 = require('./s3');

const DIR = path.join(config.DATA_DIR, 'backups');
const KEEP_LOCAL = Number(process.env.BACKUP_KEEP_LOCAL) || 14;   // gün
const KEEP_REMOTE = Number(process.env.BACKUP_KEEP_REMOTE) || 60; // gün
const NAME = /^platform-\d{8}-\d{4}(-[a-z]+)?\.db\.gz$/;
fs.mkdirSync(DIR, { recursive: true });
// R2 kovası medya için herkese açık okunur: yedekler tahmin edilemez bir önek altına yazılır (önek oturum sırrından türetilir, sunucu dışına çıkmaz)
const RP = 'backups-' + require('crypto').createHmac('sha256', require('./auth').secretFor('r2-backups')).update('r2-backups').digest('hex').slice(0, 32) + '/';
const OLD_RP = 'backups/';

let last = { at: 0, name: '', remote: false, error: '' };
try { last = { ...last, ...JSON.parse(store.setting('backup_last', '{}')) }; } catch {}
const remember = () => store.setSetting('backup_last', JSON.stringify(last));

const stamp = d => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: config.TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const g = t => p.find(x => x.type === t).value;
  return `${g('year')}${g('month')}${g('day')}-${g('hour')}${g('minute')}`;
};

let running = null;
async function run(tag = '') {
  if (running) return running;
  running = (async () => {
    const name = `platform-${stamp(new Date())}${tag ? '-' + tag : ''}.db.gz`, raw = path.join(DIR, name.replace(/\.gz$/, '')), out = path.join(DIR, name);
    try {
      require('./tenants').all().forEach(t => require('./tenants').saveNow(t)); // bellekteki son değişiklikler de girsin
      await store.sql.backup(raw);
      await new Promise((ok, bad) => fs.createReadStream(raw).pipe(zlib.createGzip({ level: 9 })).pipe(fs.createWriteStream(out)).on('finish', ok).on('error', bad));
      fs.rmSync(raw, { force: true });
      let remote = false;
      if (s3.enabled) { await s3.putFile(RP + name, out, 'application/gzip', 'no-store'); remote = true; }
      last = { at: Date.now(), name, remote, error: '', autoName: tag === 'oto' ? name : (last.autoName || '') }; remember();
      prune().catch(e => console.error('Eski yedekler silinemedi', e.message));
      return name;
    } catch (e) {
      fs.rmSync(raw, { force: true });
      last = { ...last, error: e.message, errorAt: Date.now() }; remember();
      console.error('Platform yedeği alınamadı:', e.message);
      throw e;
    } finally { running = null; }
  })();
  return running;
}

function listLocal() {
  return fs.readdirSync(DIR).filter(n => NAME.test(n)).map(n => { const st = fs.statSync(path.join(DIR, n)); return { name: n, size: st.size, time: st.mtimeMs }; }).sort((a, b) => b.time - a.time);
}
async function listRemote() {
  if (!s3.enabled) return [];
  return (await s3.list(RP)).filter(o => NAME.test(o.key.slice(RP.length))).map(o => ({ name: o.key.slice(RP.length), size: o.size, time: o.modified })).sort((a, b) => b.time - a.time);
}
async function prune() {
  const now = Date.now();
  for (const b of listLocal()) if (now - b.time > KEEP_LOCAL * 86400000) fs.rmSync(path.join(DIR, b.name), { force: true });
  if (s3.enabled) for (const b of await listRemote()) if (now - b.time > KEEP_REMOTE * 86400000) await s3.del(RP + b.name);
}

// Her gece 04:00'ten sonra günde bir kez (gündüz alınan manuel yedek otomatiği engellemez)
function tick() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: config.TZ, hour: '2-digit', hour12: false }).format(new Date()));
  const today = stamp(new Date()).slice(0, 8);
  if (h >= 4 && !String(last.autoName || '').includes(today) && (!last.errorAt || Date.now() - last.errorAt > 3600000)) run('oto').catch(() => {});
}
// Eski (herkese açık, tahmin edilebilir) 'backups/' önekindeki kopyalar: yerel yedekler yeni önekle yüklenir, eskiler silinir
async function migrateRemote() {
  if (!s3.enabled) return;
  const old = (await s3.list(OLD_RP)).filter(o => NAME.test(o.key.slice(OLD_RP.length)));
  if (!old.length) return;
  const have = new Set((await listRemote()).map(b => b.name));
  for (const b of listLocal()) if (!have.has(b.name)) await s3.putFile(RP + b.name, path.join(DIR, b.name), 'application/gzip', 'no-store');
  for (const o of old) await s3.del(o.key);
  console.log(`R2 yedekleri gizli öneke taşındı (${old.length} eski kopya silindi)`);
}
function start() { setTimeout(() => migrateRemote().catch(e => console.error('R2 yedek taşıma', e.message)), 30000); setTimeout(tick, 20000); setInterval(tick, 15 * 60 * 1000); }
const status = () => ({ ...last, dir: DIR, remoteEnabled: s3.enabled, keepLocal: KEEP_LOCAL, keepRemote: KEEP_REMOTE });
const filePath = name => (NAME.test(name) ? path.join(DIR, name) : null);

module.exports = { run, start, status, listLocal, listRemote, filePath, NAME };
