// QR okutma sayacı: bağlantı QR'larının içine doğrudan hedef adres yerine kısa adres (/q/kod) yazılır.
// Biri okutunca sayaç artar ve kişi hemen asıl adrese yönlendirilir. Wi-Fi ve düz metin QR'ları sayılamaz.
// Yalnızca sayı tutulur: ad, IP ya da telefon bilgisi saklanmaz.
const crypto = require('crypto');
const QRCode = require('qrcode');
const config = require('./config');
const tenants = require('./tenants');
const stats = require('./stats');
const { clientIp } = require('./auth');

const svgOf = text => QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#14100c', light: '#ffffff' } });
const isUrl = t => /^https?:\/\/\S+$/i.test(String(t || ''));
const trackUrl = code => `${config.BASE_URL}/q/${code}`;
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';

// kod -> { tid, id, kind: 'qr' | 'camp' }
let idx = new Map(), idxAt = 0;
function rebuild() {
  idx = new Map();
  for (const t of tenants.all()) {
    for (const q of t.db.qrs || []) if (q.code) idx.set(q.code, { tid: t.id, id: q.id, kind: 'qr' });
    for (const c of t.db.campaigns || []) if (c.code) idx.set(c.code, { tid: t.id, id: c.id, kind: 'camp' });
  }
  idxAt = Date.now();
}
function newCode() {
  if (!idxAt) rebuild();
  for (;;) {
    const b = crypto.randomBytes(7); let c = ''; for (const x of b) c += ALPHA[x % ALPHA.length];
    if (!idx.has(c)) return c;
  }
}
const register = (code, tid, id, kind) => idx.set(code, { tid, id, kind });
function find(code) {
  if (!idx.has(code) && Date.now() - idxAt > 10000) rebuild();
  return idx.get(code);
}

// QR'ın içeriği: URL ise kısa adres (sayılır), değilse metnin kendisi. Eski kodu korur.
async function build(tid, id, kind, target, oldCode) {
  if (!isUrl(target)) return { code: '', svg: await svgOf(target) };
  const code = oldCode || newCode(); register(code, tid, id, kind);
  return { code, svg: await svgOf(trackUrl(code)) };
}

// Kodsuz (eski) ya da başka işletmeden kopyalanmış (aynı kod iki yerde) QR ve kampanyalara kod verir; değişen varsa true döner
async function ensure(t) {
  if (!idxAt) rebuild();
  let changed = false;
  const bad = (code, kind, id) => { const e = code && idx.get(code); return !code || (e && (e.tid !== t.id || e.id !== id)); };
  for (const q of t.db.qrs || []) {
    if (q.kind === 'wifi' || !isUrl(q.text)) continue;
    if (bad(q.code, 'qr', q.id)) { Object.assign(q, await build(t.id, q.id, 'qr', q.text, '')); changed = true; }
  }
  for (const c of t.db.campaigns || []) {
    if (!c.url || !isUrl(c.url)) continue;
    if (bad(c.code, 'camp', c.id)) { Object.assign(c, await build(t.id, c.id, 'camp', c.url, '')); changed = true; }
  }
  return changed;
}
// Açılışta tüm işletmeler için bir kez
async function migrate() {
  const hub = require('./hub');
  for (const t of tenants.all()) {
    try { if (await ensure(t)) { tenants.save(t); hub.pushTenant(t.id); } } catch (e) { console.error('QR kısa adresi:', e.message); }
  }
}

// Bot, bağlantı önizleyici ve kısa sürede tekrarlanan açılışlar sayılmaz
const BOT = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|curl|wget|python|headless|monitor|uptime/i;
const recent = new Map();
function dupe(req, code) {
  // clientIp (son XFF) kullanılır: req.ip trust proxy ile soldaki, istemcinin uydurabildiği değerdir
  const k = crypto.createHash('sha1').update(`${clientIp(req)}|${req.headers['user-agent'] || ''}|${code}`).digest('hex').slice(0, 16), now = Date.now();
  if (recent.size > 5000) for (const [x, at] of recent) if (now - at > 60000) recent.delete(x);
  const last = recent.get(k); recent.set(k, now);
  return !!last && now - last < 30000;
}
const deviceOf = ua => /iPhone|iPad|iPod/i.test(ua) ? 'ios' : /Android/i.test(ua) ? 'android' : 'other';

function handler(req, res) {
  const code = String(req.params.code || '').toLowerCase();
  const e = /^[a-z0-9]{5,12}$/.test(code) ? find(code) : null;
  const t = e && tenants.get(e.tid);
  const item = t && (e.kind === 'qr' ? (t.db.qrs || []).find(x => x.id === e.id) : (t.db.campaigns || []).find(x => x.id === e.id));
  const target = item && (e.kind === 'qr' ? item.text : item.url);
  res.set('Cache-Control', 'no-store'); res.set('X-Robots-Tag', 'noindex, nofollow');
  if (!target || !isUrl(target)) return res.status(404).type('text/plain; charset=utf-8').send('Bağlantı bulunamadı');
  const ua = String(req.headers['user-agent'] || '');
  if (req.method === 'GET' && ua && !BOT.test(ua) && !dupe(req, code)) {
    try { stats.scan(e.tid, e.kind === 'qr' ? e.id : 'camp:' + e.id, deviceOf(ua)); } catch (err) { /* sayaç hatası yönlendirmeyi engellemez */ }
  }
  res.redirect(302, target);
}

module.exports = { build, ensure, migrate, handler, isUrl };
