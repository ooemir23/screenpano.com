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

// Deneme sınırı: aynı IP'den ya da aynı kullanıcı adına 10 dakikada en çok 5 hatalı giriş.
// Kapatmak için LOGIN_LIMIT=off. Sınır dolunca 10 dakika beklenir; doğru girişte kullanıcı sayacı sıfırlanır.
const fails = new Map();
const LIMIT_ON = process.env.LOGIN_LIMIT !== 'off';
const MAX_FAILS = Number(process.env.LOGIN_MAX_FAILS) || 5, WINDOW = 10 * 60 * 1000;
const keys = (ip, user) => [ip && 'ip:' + ip, user && 'u:' + String(user).trim().toLowerCase()].filter(Boolean);
function tooMany(ip, user) {
  if (!LIMIT_ON) return false;
  return keys(ip, user).some(k => { const r = fails.get(k); return r && r.n >= MAX_FAILS && Date.now() - r.at < WINDOW; });
}
function noteFail(ip, user) {
  if (!LIMIT_ON) return;
  for (const k of keys(ip, user)) {
    const r = fails.get(k);
    if (!r || Date.now() - r.at > WINDOW) fails.set(k, { n: 1, at: Date.now() }); else r.n++;
  }
}
function clearFails(ip, user) { for (const k of keys(null, user)) fails.delete(k); }
setInterval(() => { const t = Date.now(); for (const [k, r] of fails) if (t - r.at > WINDOW) fails.delete(k); }, 5 * 60 * 1000).unref();
// Traefik/Dokploy gerçek istemci IP'sini X-Forwarded-For'un SONUNA ekler; baştaki değer istemci tarafından uydurulabilir
const clientIp = req => { const x = String(req.headers['x-forwarded-for'] || '').split(',').map(v => v.trim()).filter(Boolean); return x.length ? x[x.length - 1] : String(req.socket.remoteAddress || ''); };

module.exports = { uid, hashPassword, checkPassword, sign, verify, setSession, clearSession, sessionUser, newDeviceToken, hashToken, tooMany, noteFail, clearFails, clientIp, parseCookies };
