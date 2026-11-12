// Panel girişi, çıkış, şifre sıfırlama, e-posta doğrulama ve işletmenin kendi kendine kaydı (/api/auth/*)
const express = require('express');
const crypto = require('crypto');
const config = require('./config');
const store = require('./store');
const auth = require('./auth');
const mailer = require('./mailer');
const tenants = require('./tenants');
const { createTenant } = require('./accounts');

const r = express.Router();
const LEGAL_VERSION = require('./legal').VERSION;

function baseOrigin(req) {
  const proto = (req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https') ? 'https' : 'http';
  const rawHost = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000');
  const reqHost = rawHost.split(':')[0].toLowerCase();
  if (config.BASE_URL && /^https?:\/\//i.test(config.BASE_URL)) {
    try {
      const baseHost = new URL(config.BASE_URL).hostname.toLowerCase();
      // Ana alan adı ve alt alan adları için tek yetkili dönüş adresi kullanılır
      if (reqHost === baseHost || reqHost.endsWith('.' + baseHost)) return config.BASE_URL.replace(/\/+$/, '');
    } catch {}
  }
  return `${proto}://${rawHost}`;
}

function postAuthUrl(req, u, sub = '', pair = '') {
  const hash = /^\d{6}$/.test(String(pair || '')) ? `#pair=${pair}` : '';
  let target;
  if (sub === 'music') {
    let baseHost = '';
    try { baseHost = new URL(config.BASE_URL).hostname.toLowerCase(); } catch {}
    const reqHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0].toLowerCase();
    const sameBase = baseHost && baseHost.includes('.') && (reqHost === baseHost || reqHost.endsWith('.' + baseHost));
    target = (config.APP_ENV === 'live' && sameBase) ? `https://music.${baseHost}/music` : '/music';
  } else {
    target = auth.homeFor(req, u);
  }
  return (/^https?:\/\//i.test(target) ? target : `${baseOrigin(req)}${target}`) + hash;
}

function sendVerifyEmail(req, t, email) {
  const tpl = require('./mailtpl');
  const tok = auth.sign({ kind: 'verify_email', tid: t.id, email, exp: Date.now() + 7 * 86400 * 1000 });
  const link = `${baseOrigin(req)}/api/auth/verify-email?token=${encodeURIComponent(tok)}`;
  if (mailer.enabled()) {
    mailer.send({
      to: email,
      subject: `${config.BRAND || 'ScreenPano'} — E-posta Adresinizi Doğrulayın`,
      text: `Merhaba ${t.name},\n\nScreenPano dijital ekran yönetim sistemine hoş geldiniz. Ekranınız çevrimdışı kaldığında anlık uyarı alabilmek, haftalık performans raporlarına erişebilmek ve hesap güvenliğinizi sağlamak için aşağıdaki bağlantıya tıklayarak e-posta adresinizi doğrulayın:\n\n${link}\n\nBu bağlantı 7 gün geçerlidir. Bu kaydı siz yapmadıysanız iletiyi dikkate almayın.`,
      html: tpl.html({
        title: 'E-posta Adresinizi Doğrulayın',
        badge: 'E-posta Doğrulama',
        badgeColor: 'brand',
        preheader: 'ScreenPano bildirimleri ve hesap güvenliği için e-postanızı doğrulayın.',
        body: tpl.p(`Merhaba <b>${tpl.e(t.name)}</b>,`) +
          tpl.p('ScreenPano dijital ekran yönetim sistemine hoş geldiniz. Ekranınız çevrimdışı kaldığında anında uyarı alabilmek, haftalık performans raporlarınıza erişebilmek ve hesap güvenliğinizi sağlamak için lütfen e-posta adresinizi onaylayın.') +
          tpl.panelTable([
            ['İşletme Adı', tpl.e(t.name)],
            ['Doğrulanacak E-posta', tpl.e(email)],
            ['Bağlantı Geçerliliği', '7 Gün'],
          ]),
        cta: link, ctaLabel: 'E-posta Adresimi Doğrula',
        small: 'Bu kaydı siz veya işletmeniz oluşturmadıysa bu e-postayı dikkate almayın; bağlantı tıklanmadığı sürece hiçbir işlem yapılmaz.',
      }),
    }).catch(e => console.error('[VERIFY MAIL]', e && e.message));
  }
  return { tok, link };
}

r.get('/captcha', (req, res) => {
  const a = 2 + crypto.randomInt(8);
  const b = 1 + crypto.randomInt(9);
  const token = auth.sign({ kind: 'captcha', ans: String(a + b), exp: Date.now() + 15 * 60 * 1000 });
  res.json({ question: `${a} + ${b} = ?`, token });
});

r.post('/login', async (req, res) => {
  const ip = auth.clientIp(req);
  const { username, password } = req.body || {};
  if (auth.tooMany(ip, username)) return res.status(429).json({ error: 'Çok fazla hatalı deneme. 10 dakika sonra tekrar deneyin.' });
  const release = auth.begin(ip, username); // paralel denemeler de sınıra sayılır
  const u = store.q.userByName.get(String(username || '').trim());
  const pwOk = !!u && await auth.checkPasswordAsync(password, u.pass).finally(release);
  if (!u) release();
  if (!pwOk) { auth.noteFail(ip, username); return res.status(401).json({ error: 'Kullanıcı adı ya da şifre yanlış' }); }
  if (auth.subOf && auth.subOf(req) === 'sadmin' && !auth.superOk(u)) { auth.noteFail(ip, username); return res.status(401).json({ error: 'Kullanıcı adı ya da şifre yanlış' }); } // işletme hesapları süper yönetim adresinden girmez
  auth.clearFails(ip, username);
  store.q.userLogin.run(Date.now(), u.id);
  auth.setSession(req, res, u);
  res.json({ ok: true, role: u.role, next: auth.subOf && auth.subOf(req) === 'music' ? '/music' : auth.subOf(req) === 'sadmin' && auth.superOk(u) ? '/super' : auth.homeFor(req, u) });
});
// all:true gelirse kullanıcının tüm cihazlardaki oturumları da düşer (token_epoch artar)
r.post('/logout', (req, res) => {
  const u = auth.sessionUser(req);
  if ((req.body || {}).all && u) store.bumpEpoch(u.id);
  auth.clearSession(res, req); res.json({ ok: true });
});

// ---- Google ile giriş (OAuth 2.0 / OIDC) ----
// Anahtarlar süper yönetimden gelir (google_oauth_client_id/secret); yoksa düğme hiç görünmez.
const gCfg = () => ({
  id: store.setting('google_oauth_client_id', '') || process.env.GOOGLE_OAUTH_CLIENT_ID || '',
  secret: store.setting('google_oauth_secret', '') || process.env.GOOGLE_OAUTH_SECRET || '',
});
// Google ile doğrudan süper yönetime girebilecek e-postalar (Süper Yönetim veya SUPER_EMAIL ortam değişkeni)
const gSuperEmails = () => String(store.setting('google_super_emails', '') || process.env.SUPER_EMAIL || '')
  .split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
const gNonces = new Map(); // state nonce -> bitiş (tek kullanım; yeniden oynatma önlenir)
const gStarts = new Map(); // ip -> { n, at }: OAuth başlatma hız sınırı (şifre deneme sınırını kirletmez)
const G_START_LIMIT = 20, G_START_WIN = 10 * 60 * 1000;
function pruneGState() {
  const now = Date.now();
  for (const [k, exp] of gNonces) if (exp < now) gNonces.delete(k);
  for (const [k, r] of gStarts) if (now - r.at > G_START_WIN) gStarts.delete(k);
}
setInterval(pruneGState, 5 * 60 * 1000).unref();
const gHome = (req, res, hash) => res.redirect(`${baseOrigin(req)}/login${hash}`);
r.get('/google/start', (req, res) => {
  const reqSub = auth.subOf ? auth.subOf(req) : '';
  if (reqSub === 'sadmin' && !gSuperEmails().length) return gHome(req, res, '#gerr=1');
  const g = gCfg();
  if (!g.id || !g.secret) return gHome(req, res, '#gerr=1');
  const ip = auth.clientIp(req);
  if (auth.tooMany(ip)) return gHome(req, res, '#gerr=limit');
  const now = Date.now();
  const sr = gStarts.get(ip);
  if (sr && now - sr.at < G_START_WIN && sr.n >= G_START_LIMIT) return gHome(req, res, '#gerr=limit');
  if (!sr || now - sr.at >= G_START_WIN) gStarts.set(ip, { n: 1, at: now }); else sr.n++;
  if (gNonces.size > 1000) pruneGState();
  if (gNonces.size > 5000) return gHome(req, res, '#gerr=limit');
  const n = crypto.randomBytes(16).toString('hex');
  gNonces.set(n, now + 10 * 60 * 1000);
  const sub = (reqSub === 'music' || reqSub === 'sadmin') ? reqSub : '';
  const pair = /^\d{6}$/.test(String(req.query.pair || '')) ? String(req.query.pair) : '';
  const q = new URLSearchParams({
    client_id: g.id, redirect_uri: `${baseOrigin(req)}/api/auth/google/callback`, response_type: 'code',
    scope: 'openid email', state: auth.sign({ kind: 'g_state', n, sub, pair, exp: now + 10 * 60 * 1000 }), prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
});
let gJwks = null, gJwksAt = 0; // Google imza anahtarları (1 saat önbellek)
async function gFetchJwks() {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('Google imza anahtarları alınamadı: ' + r.status);
  const j = await r.json();
  if (!j || !Array.isArray(j.keys)) throw new Error('Google imza anahtarları geçersiz');
  gJwks = j; gJwksAt = Date.now();
  return gJwks;
}
async function gVerifyIdToken(idToken, clientId) {
  const [h, p, s] = String(idToken || '').split('.');
  if (!h || !p || !s) throw new Error('bozuk kimlik belirteci');
  const head = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
  if (head.alg !== 'RS256' || !head.kid) throw new Error('beklenmeyen imza algoritması');
  if (!gJwks || Date.now() - gJwksAt > 3600 * 1000) await gFetchJwks();
  let k = (gJwks.keys || []).find(x => x.kid === head.kid);
  if (!k) {
    // Google anahtar döndürmüş olabilir: önbelleği bir kez yenile
    await gFetchJwks();
    k = (gJwks.keys || []).find(x => x.kid === head.kid);
  }
  if (!k) throw new Error('imza anahtarı bulunamadı');
  const pub = crypto.createPublicKey({ key: { kty: k.kty, n: k.n, e: k.e }, format: 'jwk' });
  const imzalı = crypto.createVerify('RSA-SHA256').update(`${h}.${p}`).verify(pub, Buffer.from(s, 'base64url'));
  if (!imzalı) throw new Error('imza doğrulanamadı');
  const c = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(c.iss)) throw new Error('geçersiz sağlayıcı');
  if (c.aud !== clientId) throw new Error('belirteç bu uygulamaya ait değil');
  if (!c.exp || c.exp * 1000 < Date.now()) throw new Error('belirtecin süresi dolmuş');
  return c;
}
r.get('/google/callback', async (req, res) => {
  const g = gCfg();
  const ip = auth.clientIp(req);
  const fail = (msg, code = '1', countFail = true) => {
    console.error('[Google OAuth]', msg);
    if (countFail) auth.noteFail(ip);
    return gHome(req, res, `#gerr=${code}`);
  };
  try {
    if (!g.id || !g.secret) return fail('anahtar yok', '1', false);
    const st = auth.verify(String(req.query.state || ''));
    if (!st || st.kind !== 'g_state' || !st.n) return fail('state geçersiz');
    const nb = gNonces.get(st.n);
    gNonces.delete(st.n);
    if (!nb || nb < Date.now()) return fail('state süresi dolmuş');
    if (req.query.error) {
      return fail('google error: ' + req.query.error, req.query.error === 'access_denied' ? 'cancel' : '1', false);
    }
    const code = String(req.query.code || '');
    if (!code) return fail('kod yok');
    const tr = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(8000),
      body: new URLSearchParams({ code, client_id: g.id, client_secret: g.secret, redirect_uri: `${baseOrigin(req)}/api/auth/google/callback`, grant_type: 'authorization_code' }),
    });
    const tj = await tr.json();
    if (!tj.id_token) return fail('token alınamadı: ' + (tj.error || tr.status));
    const c = await gVerifyIdToken(tj.id_token, g.id);
    if (!c.email || c.email_verified !== true) return fail('e-posta doğrulanmamış', 'unverified');
    const emLow = String(c.email).toLowerCase();
    if (gSuperEmails().includes(emLow)) {
      const su = store.sql.prepare("SELECT * FROM users WHERE role = 'super' ORDER BY created ASC LIMIT 1").get();
      if (su) {
        auth.clearFails(ip, su.username);
        store.q.userLogin.run(Date.now(), su.id);
        auth.setSession(req, res, su);
        return res.redirect(postAuthUrl(req, su, st.sub === 'music' ? 'music' : '', st.pair || ''));
      }
    }
    // kayıtlı işletme: doğrulanmış olanlar önce, ardından son girişe göre bildirim e-postası eşleşen sahip hesabı
    const hit = tenants.all()
      .filter(t => String((t.db.notify || {}).email || '').toLowerCase() === emLow)
      .map(t => ({ t, u: (store.q.usersOf.all(t.id).find(x => x.role === 'owner') || {}) }))
      .filter(x => x.u.id)
      .sort((a, b) => ((b.t.db.notify || {}).verified ? 1 : 0) - ((a.t.db.notify || {}).verified ? 1 : 0) || (b.u.last_login || 0) - (a.u.last_login || 0))[0];
    if (st.sub === 'sadmin') {
      if (!hit || !auth.superOk(hit.u)) return fail('süper yönetim yetkisi yok', '1', true);
    }
    if (hit) {
      if (!(hit.t.db.notify || {}).verified) {
        hit.t.db.notify = { ...(hit.t.db.notify || {}), verified: true, verifiedAt: Date.now() };
        tenants.saveNow(hit.t); // Google doğrulaması yeterli
      }
      auth.clearFails(ip, hit.u.username);
      store.q.userLogin.run(Date.now(), hit.u.id);
      auth.setSession(req, res, hit.u);
      return res.redirect(postAuthUrl(req, hit.u, st.sub === 'music' ? 'music' : '', st.pair || ''));
    }
    if (!config.ALLOW_SIGNUP) return fail('kayıt kapalı', 'nosignup', false);
    // eşleşme yok: kayıt ekranına güvenli e-posta taşı (imzalı belirteçle)
    const gt = auth.sign({ kind: 'g_signup', email: c.email, sub: st.sub || '', pair: st.pair || '', exp: Date.now() + 15 * 60 * 1000 });
    gHome(req, res, `#gsignup=${encodeURIComponent(gt)}`);
  } catch (e) { fail(e.message); }
});
r.post('/google/prefill', (req, res) => {
  const p = auth.verify(String((req.body || {}).token || ''));
  if (!p || p.kind !== 'g_signup' || !p.email) return res.status(400).json({ error: 'Google oturum belirteci geçersiz veya süresi dolmuş' });
  res.json({ email: p.email, pair: p.pair || '' });
});

r.get('/config', (req, res) => {
  const g = gCfg();
  const isSadmin = auth.subOf && auth.subOf(req) === 'sadmin';
  const hasG = !!(g.id && g.secret);
  res.json({ env: config.APP_ENV, brand: config.BRAND, signup: isSadmin ? false : config.ALLOW_SIGNUP, trialDays: config.TRIAL_DAYS, smtp: mailer.enabled(), google: isSadmin ? (hasG && gSuperEmails().length > 0) : hasG, starters: require('./starters').list().map(({ key, name }) => ({ key, name })) });
});
r.post('/signup', (req, res) => {
  if (!config.ALLOW_SIGNUP) return res.status(403).json({ error: 'Yeni kayıt şu an kapalı' });
  const ip = auth.clientIp(req);
  if (auth.tooMany(ip)) return res.status(429).json({ error: 'Çok fazla deneme. Biraz sonra tekrar deneyin.' });
  try {
    const b = req.body || {};
    if (b.website) throw new Error('Geçersiz istek'); // honeypot alanı
    let email = String(b.email || '').trim().slice(0, 120);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Geçerli bir e-posta adresi girin');
    let gVerified = false, gp = null;
    if (b.gtoken) { // Google ile açılan kayıt: e-posta Google tarafından doğrulanmış sayılır, alan kilitli gelir
      gp = auth.verify(String(b.gtoken));
      if (!gp || gp.kind !== 'g_signup' || !gp.email) throw new Error('Google oturumu süresi dolmuş; sayfayı yenileyip tekrar deneyin');
      if (gp.email.toLowerCase() !== email.toLowerCase()) throw new Error('E-posta adresi değiştirilemez: kaydı Google hesabınızdaki adresle açın');
      gVerified = true;
    } else {
      const cp = auth.verify(b.captchaToken);
      if (!cp || cp.kind !== 'captcha' || String(b.captchaAns || '').trim() !== cp.ans) {
        throw new Error('Güvenlik sorusunun cevabı hatalı, lütfen tekrar deneyin');
      }
    }
    if (b.accept !== true) throw new Error('Devam etmek için Kullanım Koşulları ve KVKK Aydınlatma Metni\'ni onaylayın');
    const t = createTenant({ name: b.business, username: b.username, password: b.password, phone: b.phone, plan: 'pro', starter: require('./starters').STARTERS[b.starter] ? b.starter : null });
    t.db.notify = { email, offline: true, online: true, verified: gVerified, verifiedAt: gVerified ? Date.now() : undefined, verifySentAt: gVerified ? 0 : Date.now() }; // ekran durumu uyarıları kayıttaki adrese gider
    t.db.consent = { terms: LEGAL_VERSION, kvkk: LEGAL_VERSION, at: Date.now(), ip, marketing: b.marketing === true };
    tenants.saveNow(t);
    if (!gVerified) sendVerifyEmail(req, t, email); // Google'dan gelen adrese ayrıca doğrulama postası gerekmez
    auth.noteFail(ip); // kayıtlar da sayılır: tek IP'den seri hesap açılmasın
    const u = store.q.userByName.get(String(b.username).trim().toLowerCase());
    auth.setSession(req, res, u);
    const sub = (gp && gp.sub) || (auth.subOf && auth.subOf(req)) || '';
    res.json({ ok: true, tenant: t.id, next: postAuthUrl(req, { ...u, role: 'owner' }, sub, gp && gp.pair) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// E-posta doğrulama bağlantısı (GET: e-postadan tıklama → panele yönlendirir, POST: API doğrulaması)
function handleVerifyEmail(req, res) {
  const token = String((req.query && req.query.token) || (req.body && req.body.token) || '').trim();
  const p = auth.verify(token);
  if (!p || p.kind !== 'verify_email' || !p.tid) {
    if (req.method === 'GET') return res.status(400).type('html').send('<!doctype html><meta charset="utf-8"><title>Geçersiz Bağlantı</title><body style="font:16px system-ui;background:#0e1012;color:#f3f5f6;padding:40px;text-align:center"><h2>Doğrulama bağlantısı geçersiz veya süresi dolmuş</h2><p><a href="/panel" style="color:#e0b262">Panele dön</a></p></body>');
    return res.status(400).json({ error: 'Doğrulama bağlantısı geçersiz veya süresi dolmuş' });
  }
  const t = tenants.get(p.tid);
  if (!t) return res.status(404).json({ error: 'İşletme bulunamadı' });
  t.db.notify = { ...(t.db.notify || {}), email: p.email || (t.db.notify && t.db.notify.email) || '', verified: true, verifiedAt: Date.now() };
  tenants.saveNow(t);
  if (req.method === 'GET') return res.redirect('/panel?verified=1');
  res.json({ ok: true, email: t.db.notify.email });
}
r.get('/verify-email', handleVerifyEmail);
r.post('/verify-email', handleVerifyEmail);

r.post('/resend-verify', (req, res) => {
  const u = auth.sessionUser(req);
  if (!u) return res.status(401).json({ error: 'Oturum gerekli' });
  const tid = auth.impOf(u) || u.tenant_id;
  const t = tid && tenants.get(tid);
  if (!t) return res.status(404).json({ error: 'İşletme bulunamadı' });
  const email = String((req.body && req.body.email) || (t.db.notify && t.db.notify.email) || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin' });
  if (!t.db.notify) t.db.notify = { offline: true, online: true };
  if (t.db.notify.email !== email) { t.db.notify.email = email; t.db.notify.verified = false; }
  t.db.notify.verifySentAt = Date.now();
  tenants.saveNow(t);
  const { link } = sendVerifyEmail(req, t, email);
  res.json({ ok: true, sent: mailer.enabled(), verifyUrl: !mailer.enabled() ? link : undefined });
});

// Şifremi unuttum: kullanıcı adı veya kayıtlı e-posta ile sıfırlama bağlantısı gönderir (owner ve staff destekli)
r.post('/forgot', async (req, res) => {
  const ip = auth.clientIp(req);
  const idRaw = String((req.body && (req.body.identifier || req.body.username || req.body.email)) || '').trim();
  if (!idRaw) return res.status(400).json({ error: 'Kullanıcı adınızı veya kayıtlı e-posta adresinizi girin' });
  if (auth.tooMany(ip, idRaw)) return res.status(429).json({ error: 'Çok fazla deneme. Lütfen 10 dakika sonra tekrar deneyin.' });
  auth.noteFail(ip, idRaw);

  let u = store.q.userByName.get(idRaw.toLowerCase());
  let t = u && u.tenant_id ? tenants.get(u.tenant_id) : null;
  if (!u && idRaw.includes('@')) {
    const emLow = idRaw.toLowerCase();
    t = tenants.all().find(x => x.db && x.db.notify && String(x.db.notify.email || '').toLowerCase() === emLow) || null;
    if (t) {
      const users = store.q.usersOf.all(t.id);
      u = users.find(x => x.role === 'owner') || users[0] || null;
    }
  }
  const genericMsg = 'Bilgiler eşleşiyorsa şifre sıfırlama bağlantısı işletmenin kayıtlı e-posta adresine gönderildi.';
  if (!u) return res.json({ ok: true, message: genericMsg });

  const email = (t && t.db && t.db.notify && t.db.notify.email) || '';
  const rtok = auth.sign({ kind: 'pwreset', uid: u.id, ph: String(u.pass || '').slice(-12), exp: Date.now() + 30 * 60 * 1000 });
  const resetUrl = `${baseOrigin(req)}/login#reset=${encodeURIComponent(rtok)}`;

  if (mailer.enabled() && email) {
    try {
      const isStaff = u.role === 'staff';
      const tpl = require('./mailtpl');
      const talepZamanı = new Date().toLocaleString('tr-TR', { timeZone: config.TZ, dateStyle: 'long', timeStyle: 'short' });
      await mailer.send({
        to: email,
        subject: `🔒 ${config.BRAND || 'ScreenPano'} — Şifre Sıfırlama Talebi (${u.username})`,
        text: `Merhaba${t ? ' ' + t.name : ''},\n\nScreenPano yönetim panelinde "${u.username}" (${isStaff ? 'Personel Hesabı' : 'İşletme Yöneticisi'}) için yeni şifre talebinde bulunuldu (${talepZamanı}).\n\nYeni şifrenizi belirlemek için aşağıdaki bağlantıya tıklayın (30 dakika geçerlidir):\n${resetUrl}\n\nBu talebi siz veya yetkili personeliniz başlatmadıysa bu iletiyi dikkate almayın; şifreniz değişmeden güvende kalır.`,
        html: tpl.html({
          title: 'Şifre Sıfırlama Talebi',
          badge: 'Güvenlik Bildirimi',
          badgeColor: 'warning',
          preheader: `${u.username} hesabı için yeni şifre belirleme bağlantısı.`,
          body: tpl.p(`Merhaba <b>${tpl.e((t && t.name) || u.username)}</b>,`) +
            tpl.p(`ScreenPano yönetim panelinde <b>${tpl.e(u.username)}</b> (${isStaff ? 'personel hesabı' : 'işletme yöneticisi'}) için yeni şifre talebinde bulunuldu. Aşağıdaki tek kullanımlık güvenli bağlantıya tıklayarak yeni şifrenizi belirleyebilirsiniz.`) +
            tpl.panelTable([
              ['Kullanıcı Hesabı', tpl.e(u.username) + (isStaff ? ' · Personel' : ' · İşletme Yöneticisi')],
              ['Talep Zamanı', tpl.e(talepZamanı)],
              ['Geçerlilik Süresi', '30 Dakika · Tek Kullanımlık'],
            ]) +
            tpl.callout('<b>Güvenlik Hatırlatması:</b> Bu şifre sıfırlama talebini siz veya yetkili personeliniz başlatmadıysa bu iletiyi dikkate almayın. Bağlantı kullanılmadığı takdirde mevcut şifreniz değişmez ve hesabınız güvende kalır.', 'warning'),
          cta: resetUrl, ctaLabel: 'Yeni Şifre Belirle',
          small: 'Bu bağlantı tek kullanımlıktır ve 30 dakika sonra kendiliğinden geçersiz hale gelir.',
        }),
      });
      return res.json({ ok: true, sent: true, message: genericMsg });
    } catch (e) {
      return res.status(500).json({ error: 'E-posta gönderilemedi: ' + (e.message || 'SMTP hatası') });
    }
  }

  // SMTP ayarlı değilse veya e-posta yoksa: yalnızca test ortamında doğrudan sıfırlama bağlantısını dön, canlıda asla gövdede bağlantı dönme
  if (config.APP_ENV === 'test' && !mailer.enabled()) {
    return res.json({ ok: true, sent: false, resetUrl, message: 'Test ortamında SMTP ayarlı olmadığı için doğrudan sıfırlama ekranı açılıyor.' });
  }
  return res.json({ ok: true, sent: false, message: email ? genericMsg : 'Bu hesapta kayıtlı e-posta adresi bulunamadı. İşletme sahibinden (Ayarlar → Kullanıcılar) veya destek hattından şifre sıfırlama isteyebilirsiniz.' });
});

r.post('/reset', (req, res) => {
  const ip = auth.clientIp(req);
  if (auth.tooMany(ip)) return res.status(429).json({ error: 'Çok fazla deneme. 10 dakika sonra tekrar deneyin.' });
  const { token, password } = req.body || {};
  const pw = String(password || '');
  if (pw.length < 8) return res.status(400).json({ error: 'Yeni şifre en az 8 karakter olmalı' });
  const p = auth.verify(String(token || '').trim());
  if (!p || p.kind !== 'pwreset' || !p.uid) {
    auth.noteFail(ip);
    return res.status(400).json({ error: 'Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş' });
  }
  const u = store.q.userGet.get(p.uid);
  if (!u || String(u.pass || '').slice(-12) !== p.ph) {
    auth.noteFail(ip);
    return res.status(400).json({ error: 'Bu sıfırlama bağlantısı daha önce kullanılmış veya geçersiz' });
  }
  store.q.userPass.run(auth.hashPassword(pw), u.id);
  store.bumpEpoch(u.id); // sıfırlamayla tüm eski oturumlar düşer
  auth.clearFails(ip, u.username);
  store.q.userLogin.run(Date.now(), u.id);
  auth.setSession(req, res, store.q.userGet.get(u.id));
  res.json({ ok: true, username: u.username, next: auth.subOf && auth.subOf(req) === 'music' ? '/music' : auth.homeFor(req, u) });
});

module.exports = r;
module.exports.baseOrigin = baseOrigin; // routes-tv gibi başka modüller de yetkili kaynak adresini kullanır
