// Şifreler (scrypt), imzalı oturum çerezleri, TV giriş biletleri ve cihaz token'ları.
const crypto = require('crypto');
const config = require('./config');
const store = require('./store');

let SECRET = config.SESSION_SECRET || store.setting('session_secret');
if (!SECRET) { SECRET = crypto.randomBytes(48).toString('hex'); store.setSetting('session_secret', SECRET); }

const uid = (n = 12) => crypto.randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n);

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `scrypt$${salt}$${h}`;
}
function checkPassword(pw, stored) {
  const [alg, salt, h] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !h) return false;
  const got = crypto.scryptSync(String(pw), salt, 64);
  const exp = Buffer.from(h, 'hex');
  return got.length === exp.length && crypto.timingSafeEqual(got, exp);
}

// "yük.imza" biçiminde kısa, imzalı token (JWT benzeri, bağımlılıksız)
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
function verify(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const exp = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (p.exp && Date.now() > p.exp) return null;
    return p;
  } catch { return null; }
}

const DAY = 24 * 3600 * 1000;
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function isHttps(req) { return req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https'; }
function setSession(req, res, user, extra = {}) {
  const token = sign({ uid: user.id, exp: Date.now() + 30 * DAY, ...extra });
  res.setHeader('Set-Cookie', `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${isHttps(req) ? '; Secure' : ''}`);
}
function clearSession(res) { res.setHeader('Set-Cookie', 'sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'); }

// Oturumdaki kullanıcı (+ süper yöneticinin "işletme olarak gir" bilgisi)
function sessionUser(req) {
  const p = verify(parseCookies(req).sid);
  if (!p) return null;
  const u = store.q.userGet.get(p.uid);
  if (!u) return null;
  return { ...u, imp: p.imp || null, br: p.br || null };
}

// Cihaz token'ı: TV'de saklanır, veritabanında yalnızca özeti tutulur
const newDeviceToken = () => crypto.randomBytes(32).toString('hex');
const hashToken = t => crypto.createHash('sha256').update(String(t)).digest('hex');

// Basit deneme sınırı: aynı IP'den 10 dakikada en çok 12 hatalı giriş
const fails = new Map();
function tooMany(ip) {
  const r = fails.get(ip);
  return r && r.n >= 12 && Date.now() - r.at < 10 * 60 * 1000;
}
function noteFail(ip) {
  const r = fails.get(ip);
  if (!r || Date.now() - r.at > 10 * 60 * 1000) fails.set(ip, { n: 1, at: Date.now() });
  else r.n++;
}
const clientIp = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

module.exports = { uid, hashPassword, checkPassword, sign, verify, setSession, clearSession, sessionUser, newDeviceToken, hashToken, tooMany, noteFail, clientIp, parseCookies };
