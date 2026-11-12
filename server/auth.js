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
// Giriş yolunda kullanılır: hesaplama iş parçacığı havuzunda yapılır, sunucu (TV bağlantıları) beklemez
function checkPasswordAsync(pw, stored) {
  const [alg, salt, h] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !h) return Promise.resolve(false);
  return new Promise(ok => crypto.scrypt(String(pw), salt, 64, (err, got) => {
    if (err) return ok(false);
    const exp = Buffer.from(h, 'hex');
    ok(got.length === exp.length && crypto.timingSafeEqual(got, exp));
  }));
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
    if (i > 0) {
      const v = part.slice(i + 1).trim();
      try { out[part.slice(0, i).trim()] = decodeURIComponent(v); } catch (e) { out[part.slice(0, i).trim()] = v; } // bozuk % dizisi çerezi tüm isteği 500'e düşürmesin
    }
  }
  return out;
}
function isHttps(req) { return req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https'; }
// Oturum çerezi: ana adres ve alt alan adları (admin., music., sadmin.) aynı oturumu paylaşsın diye Domain=taban adres.
// Test ortamı ayrı ada sahip (sid_test): canlının Domain çerezi test.screenpano.com'a da gider, ikisi karışmasın.
const COOKIE = config.APP_ENV === 'test' ? 'sid_test' : 'sid';
const BASE_HOST = (() => { try { return new URL(config.BASE_URL).hostname.toLowerCase(); } catch (e) { return ''; } })();
function cookieDomain(req) {
  const h = String(req.headers.host || '').split(':')[0].toLowerCase();
  return BASE_HOST && BASE_HOST.includes('.') && (h === BASE_HOST || h.endsWith('.' + BASE_HOST)) ? `; Domain=${BASE_HOST}` : '';
}
function setSession(req, res, user, extra = {}) {
  const token = sign({ uid: user.id, ep: user.token_epoch || 0, exp: Date.now() + 30 * DAY, ...extra });
  const sec = isHttps(req) ? '; Secure' : '';
  const list = [`${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${cookieDomain(req)}${sec}`];
  if (cookieDomain(req)) list.push(`${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${sec}`); // eski, yalnız bu adrese ait çerezi sil (Domain çerezle çakışmasın)
  res.setHeader('Set-Cookie', list);
}
function clearSession(res, req) {
  const list = [`${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`];
  if (req && cookieDomain(req)) list.push(`${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieDomain(req)}`);
  res.setHeader('Set-Cookie', list);
}

// Oturumdaki kullanıcı (+ süper yöneticinin "işletme olarak gir" bilgisi).
// ep (token_epoch) uyuşmazsa çerez reddedilir: parola değişimi/askıya alma eski oturumları düşürür.
function sessionUser(req) {
  const p = verify(parseCookies(req)[COOKIE]);
  if (!p) return null;
  const u = store.q.userGet.get(p.uid);
  if (!u || (p.ep || 0) !== (u.token_epoch || 0)) return null;
  return { ...u, imp: p.imp || null, br: p.br || null };
}

// Süper yönetim yetkisi: süper yönetici ya da (süper yönetimde "Süper yönetim yetkisi" işaretlenmiş) işletmenin sahibi.
// Dönen kullanıcının role'ü 'super' olur; yalnız süper yönetim sayfası/API'si ve sadmin.* korumasında kullanılır.
function superOk(u) {
  if (!u) return false;
  if (u.role === 'super') return true;
  if (u.role !== 'owner' || !u.tenant_id) return false;
  const t = require('./tenants').get(u.tenant_id);
  return !!(t && t.db && t.db.superAccess);
}
// "İşletme olarak gir" ile açılan işletme: süper yönetici ya da süper yetkisi hâlâ açık işletme sahibi için geçerlidir
// (yetki kaldırılınca çerezdeki imp yok sayılır, kişi kendi işletmesine döner)
function impOf(u) { return u && u.imp && (u.role === 'super' || superOk(u)) ? u.imp : null; }
// trueSuper: gerçek süper yönetici hesabı mı (superAccess yetkili işletme sahibi değil)? Gizli anahtar ve
// işletme yönetimi uçları yalnız gerçek süper hesaba açılır.
function superUser(req) { const u = sessionUser(req); return superOk(u) ? { ...u, role: 'super', trueSuper: u.role === 'super' } : null; }

// Cihaz token'ı: TV'de saklanır, veritabanında yalnızca özeti tutulur
const newDeviceToken = () => crypto.randomBytes(32).toString('hex');
const hashToken = t => crypto.createHash('sha256').update(String(t)).digest('hex');

// Deneme sınırı: aynı IP'den ya da aynı kullanıcı adına 10 dakikada en çok 8 hatalı giriş.
// Varsayılan açık; kapatmak için ortam değişkeni LOGIN_LIMIT=off. Sınır dolunca 10 dakika beklenir; doğru girişte kullanıcı sayacı sıfırlanır.
const fails = new Map();
const LIMIT_ON = process.env.LOGIN_LIMIT !== 'off';
const MAX_FAILS = Number(process.env.LOGIN_MAX_FAILS) || 8, WINDOW = 10 * 60 * 1000;
const keys = (ip, user) => [ip && 'ip:' + ip, user && 'u:' + String(user).trim().toLowerCase()].filter(Boolean);
// Sürmekte olan denemeler de sayılır: şifre kontrolü (scrypt) beklerken gelen paralel istekler sınırı aşamasın
const inflight = new Map(); // anahtar -> sonucu henüz belli olmayan deneme sayısı
function tooMany(ip, user) {
  if (!LIMIT_ON) return false;
  return keys(ip, user).some(k => { const r = fails.get(k), n = r && Date.now() - r.at < WINDOW ? r.n : 0; return n + (inflight.get(k) || 0) >= MAX_FAILS; });
}
// Denemeyi başlat: tooMany ile aynı anda (araya await girmeden) çağrılır; dönen işlev deneme bitince çağrılır
function begin(ip, user) {
  if (!LIMIT_ON) return () => {};
  const ks = keys(ip, user); for (const k of ks) inflight.set(k, (inflight.get(k) || 0) + 1);
  let done = false;
  return () => { if (done) return; done = true; for (const k of ks) { const n = (inflight.get(k) || 1) - 1; if (n > 0) inflight.set(k, n); else inflight.delete(k); } };
}
function noteFail(ip, user) {
  if (!LIMIT_ON) return;
  for (const k of keys(ip, user)) {
    const r = fails.get(k);
    if (!r || Date.now() - r.at > WINDOW) fails.set(k, { n: 1, at: Date.now() }); else r.n++;
  }
}
function clearFails(ip, user) { for (const k of keys(ip, user)) fails.delete(k); }
setInterval(() => { const t = Date.now(); for (const [k, r] of fails) if (t - r.at > WINDOW) fails.delete(k); }, 5 * 60 * 1000).unref();
// Traefik/Dokploy gerçek istemci IP'sini X-Forwarded-For'un SONUNA ekler; baştaki değer istemci tarafından uydurulabilir
const clientIp = req => { const x = String(req.headers['x-forwarded-for'] || '').split(',').map(v => v.trim()).filter(Boolean); return x.length ? x[x.length - 1] : String(req.socket.remoteAddress || ''); };

const secretFor = label => crypto.createHash('sha256').update(label + ':' + SECRET).digest('hex'); // başka amaçlar için türetilmiş sır
module.exports = { secretFor, superOk, impOf, superUser, uid, hashPassword, checkPassword, checkPasswordAsync, sign, verify, setSession, clearSession, sessionUser, newDeviceToken, hashToken, tooMany, begin, noteFail, clearFails, clientIp, parseCookies };
