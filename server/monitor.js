// Uzaktan durum izleme: TV kutuları dakikada bir durum raporu gönderir (sürüm, çözünürlük, çalışma süresi,
// oynayan içerik, son hata, çevrimdışı önbellek). Bir kutu 10 dakikadan uzun süre bağlantı vermezse işletmeye
// (panel + isteğe bağlı e-posta) ve platform yöneticisine (isteğe bağlı webhook) uyarı gider.
const config = require('./config');
const store = require('./store');
const hub = require('./hub');

const OFFLINE_MIN = Number(process.env.OFFLINE_ALERT_MIN) || 10;
const live = new Map();    // cihaz -> son durum (bellekte; veritabanına da yazılır)
const snaps = new Map();   // cihaz -> { at, data } ekran görüntüsü

// ---- e-posta (SMTP ayarlıysa) ----
let mailer = null;
function mail() {
  if (mailer !== null) return mailer;
  const e = process.env;
  if (!e.SMTP_HOST) { mailer = false; return mailer; }
  try {
    mailer = require('nodemailer').createTransport({ host: e.SMTP_HOST, port: Number(e.SMTP_PORT) || 587, secure: e.SMTP_SECURE === 'true' || Number(e.SMTP_PORT) === 465, auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined });
  } catch (err) { console.error('SMTP kurulamadı', err.message); mailer = false; }
  return mailer;
}
const mailEnabled = () => !!mail();
async function sendMail(to, subject, text) {
  const m = mail(); if (!m || !to) return false;
  try { await m.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text }); return true; }
  catch (e) { console.error('E-posta gönderilemedi', e.message); return false; }
}
// Platform yöneticisi için webhook (Slack, Discord, Telegram köprüsü vb.: {"text": "..."} gönderilir)
async function webhook(text) {
  const url = store.setting('alert_webhook', '') || process.env.ALERT_WEBHOOK || '';
  if (!/^https:\/\//.test(url)) return;
  try { await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, content: text }) }); } catch (e) {}
}

function pushAlert(t, a) {
  const list = t.db.alerts || (t.db.alerts = []);
  list.unshift({ id: require('crypto').randomBytes(5).toString('hex'), at: Date.now(), ...a });
  t.db.alerts = list.slice(0, 50);
  require('./tenants').save(t);
}

// TV'den gelen rapor
function report(tid, deviceId, s) {
  const clean = {
    at: Date.now(),
    app: String(s.app || '').slice(0, 20), build: String(s.build || '').slice(0, 40),
    screen: String(s.screen || '').slice(0, 20), ua: String(s.ua || '').slice(0, 160),
    uptime: Math.max(0, Math.round(Number(s.uptime) || 0)), playing: String(s.playing || '').slice(0, 120),
    errors: Math.max(0, Math.round(Number(s.errors) || 0)), lastError: String(s.lastError || '').slice(0, 200),
    cached: Math.max(0, Math.round(Number(s.cached) || 0)), cacheMB: Math.max(0, Math.round(Number(s.cacheMB) || 0)),
    online: s.online !== false, mem: Math.round(Number(s.mem) || 0) || undefined,
  };
  live.set(deviceId, clean);
  store.q.deviceStatus.run(JSON.stringify(clean), deviceId);
}

// Cihaz yeniden bağlandığında: daha önce çevrimdışı uyarısı gittiyse "geri geldi" bildirimi
function connected(t, d) {
  if (d.alerted) {
    store.q.deviceAlerted.run(0, d.id);
    pushAlert(t, { kind: 'online', device: d.name || 'TV kutusu', text: `${d.name || 'TV kutusu'} yeniden bağlandı.` });
    const n = t.db.notify || {};
    if (n.email && n.online !== false) sendMail(n.email, `${config.BRAND}: ekranınız yeniden açık`, `${t.name} – ${d.name || 'TV kutusu'} yeniden bağlandı (${new Date().toLocaleString('tr-TR', { timeZone: config.TZ })}).`);
  }
}

function tick() {
  const online = hub.onlineDeviceIds(), now = Date.now(), tenants = require('./tenants');
  for (const d of store.q.devicesAll.all()) {
    if (online.has(d.id) || d.alerted || !d.last_seen) continue;
    const gone = now - d.last_seen;
    if (gone < OFFLINE_MIN * 60000 || gone > 7 * 86400000) continue; // bir haftadır kapalı cihaz için tekrar tekrar uyarma
    const t = tenants.get(d.tenant_id); if (!t) continue;
    if (!require('./plans').access(t).ok) continue;
    store.q.deviceAlerted.run(1, d.id);
    const name = d.name || 'TV kutusu', since = new Date(d.last_seen).toLocaleString('tr-TR', { timeZone: config.TZ, dateStyle: 'short', timeStyle: 'short' });
    pushAlert(t, { kind: 'offline', device: name, text: `${name} ${since} saatinden beri çevrimdışı.` });
    const n = t.db.notify || {};
    if (n.email && n.offline !== false) sendMail(n.email, `${config.BRAND}: ekranınız çevrimdışı`, `${t.name} – ${name} ${since} saatinden beri bağlantı vermiyor.\n\nKontrol edin: kutunun elektriği, internet bağlantısı, uygulamanın açık olması.\n\nPanel: ${process.env.PUBLIC_URL || ''}/panel#settings/devices`);
    webhook(`⚠️ ${t.name}: ${name} ${since} saatinden beri çevrimdışı`);
  }
}

function deviceView(d, online) {
  const st = live.get(d.id) || (d.status ? (() => { try { return JSON.parse(d.status); } catch { return null; } })() : null);
  const { status, ...rest } = d;
  return { ...rest, online, report: st, snapshot: snaps.has(d.id) ? snaps.get(d.id).at : null };
}

function overview() { // süper yönetim: çevrimdışı cihazlar
  const online = hub.onlineDeviceIds(), tenants = require('./tenants'), now = Date.now();
  return store.q.devicesAll.all().filter(d => !online.has(d.id) && d.last_seen && now - d.last_seen > OFFLINE_MIN * 60000 && now - d.last_seen < 30 * 86400000)
    .map(d => ({ id: d.id, name: d.name, tenant: (tenants.get(d.tenant_id) || {}).name || '?', tenantId: d.tenant_id, lastSeen: d.last_seen }))
    .sort((a, b) => b.lastSeen - a.lastSeen);
}

function start() { setInterval(tick, 60000); }

module.exports = { report, connected, tick, start, deviceView, overview, snaps, live, sendMail, mailEnabled, pushAlert, OFFLINE_MIN };
