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
  if (config.BASE_URL && /^https?:\/\//i.test(config.BASE_URL)) return config.BASE_URL.replace(/\/+$/, '');
  const proto = (req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https') ? 'https' : 'http';
  return `${proto}://${req.headers.host || 'localhost:3000'}`;
}

function sendVerifyEmail(req, t, email) {
  const tpl = require('./mailtpl');
  const tok = auth.sign({ kind: 'verify_email', tid: t.id, email, exp: Date.now() + 7 * 86400 * 1000 });
  const link = `${baseOrigin(req)}/api/auth/verify-email?token=${encodeURIComponent(tok)}`;
  if (mailer.enabled()) {
    mailer.send({
      to: email,
      subject: `${config.BRAND || 'ScreenPano'} — E-posta Adresinizi Doğrulayın`,
      text: `Merhaba ${t.name},\n\nEkran bildirimlerini ve şifre sıfırlama bağlantılarını sorunsuz alabilmek için aşağıdaki bağlantıya tıklayarak e-posta adresinizi doğrulayın:\n\n${link}\n\nBu bağlantı 7 gün geçerlidir.`,
      html: tpl.html({
        title: 'E-posta Adresinizi Doğrulayın',
        body: tpl.p(`Merhaba <b>${tpl.e(t.name)}</b>,`) +
          tpl.p('ScreenPano hesabınızı açtınız. Ekran çevrimdışı uyarılarını, haftalık özetleri ve şifre sıfırlama bağlantılarını sorunsuz alabilmek için e-posta adresinizi doğrulayın.') +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px">${tpl.kv('İşletme', tpl.e(t.name))}${tpl.kv('E-posta', tpl.e(email))}</table>`,
        cta: link, ctaLabel: 'E-posta Adresimi Doğrula',
        small: 'Bağlantı 7 gün geçerlidir. Bu kaydı siz yapmadıysanız bu e-postayı dikkate almayın.',
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
r.post('/logout', (req, res) => { auth.clearSession(res, req); res.json({ ok: true }); });
r.get('/config', (req, res) => res.json({ env: config.APP_ENV, brand: config.BRAND, signup: config.ALLOW_SIGNUP, trialDays: config.TRIAL_DAYS, smtp: mailer.enabled(), starters: require('./starters').list().map(({ key, name }) => ({ key, name })) }));
r.post('/signup', (req, res) => {
  if (!config.ALLOW_SIGNUP) return res.status(403).json({ error: 'Yeni kayıt şu an kapalı' });
  const ip = auth.clientIp(req);
  if (auth.tooMany(ip)) return res.status(429).json({ error: 'Çok fazla deneme. Biraz sonra tekrar deneyin.' });
  try {
    const b = req.body || {};
    if (b.website) throw new Error('Geçersiz istek'); // honeypot alanı
    if (b.captchaToken !== undefined) {
      const cp = auth.verify(b.captchaToken);
      if (!cp || cp.kind !== 'captcha' || String(b.captchaAns || '').trim() !== cp.ans) {
        throw new Error('Güvenlik sorusunun cevabı hatalı, lütfen tekrar deneyin');
      }
    }
    const email = String(b.email || '').trim().slice(0, 120);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Geçerli bir e-posta adresi girin');
    if (b.accept !== true) throw new Error('Devam etmek için Kullanım Koşulları ve KVKK Aydınlatma Metni\'ni onaylayın');
    const t = createTenant({ name: b.business, username: b.username, password: b.password, phone: b.phone, plan: 'pro', starter: require('./starters').STARTERS[b.starter] ? b.starter : null });
    t.db.notify = { email, offline: true, online: true, verified: false, verifySentAt: Date.now() }; // ekran durumu uyarıları kayıttaki adrese gider
    t.db.consent = { terms: LEGAL_VERSION, kvkk: LEGAL_VERSION, at: Date.now(), ip, marketing: b.marketing === true };
    tenants.saveNow(t);
    sendVerifyEmail(req, t, email);
    auth.noteFail(ip); // kayıtlar da sayılır: tek IP'den seri hesap açılmasın
    const u = store.q.userByName.get(String(b.username).trim().toLowerCase());
    auth.setSession(req, res, u);
    res.json({ ok: true, tenant: t.id, next: auth.subOf && auth.subOf(req) === 'music' ? '/music' : auth.homeFor(req, { ...u, role: 'owner' }) });
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
        subject: `${config.BRAND || 'ScreenPano'} — Şifre Sıfırlama Talebi (${u.username})`,
        text: `Merhaba${t ? ' ' + t.name : ''},\n\n"${u.username}" (${isStaff ? 'Personel' : 'İşletme Sahibi'}) hesabı için şifre sıfırlama talebinde bulunuldu (${talepZamanı}).\n\nYeni şifre belirlemek için aşağıdaki bağlantıya tıklayın (30 dakika geçerlidir):\n${resetUrl}\n\nBu talebi siz yapmadıysanız bu e-postayı dikkate almayın; şifreniz değişmeden kalır.`,
        html: tpl.html({
          title: 'Şifre Sıfırlama Talebi',
          body: tpl.p(`Merhaba <b>${tpl.e((t && t.name) || u.username)}</b>,`) +
            tpl.p(`<b>${tpl.e(u.username)}</b> ${isStaff ? 'personel' : 'işletme'} hesabı için yeni şifre talebinde bulunuldu. Aşağıdaki düğme tek kullanımlık şifre belirleme ekranını açar.`) +
            `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px">
              ${tpl.kv('Hesap', tpl.e(u.username) + (isStaff ? ' · Personel' : ' · İşletme Sahibi'))}
              ${tpl.kv('Talep zamanı', tpl.e(talepZamanı))}
              ${tpl.kv('Geçerlilik', '30 dakika · tek kullanım')}
            </table>`,
          cta: resetUrl, ctaLabel: 'Yeni Şifre Belirle',
          small: 'Bu talebi siz oluşturmadıysanız e-postayı dikkate almayın; bağlantı kullanılmadığı sürece şifreniz değişmez.',
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
  auth.clearFails(ip, u.username);
  store.q.userLogin.run(Date.now(), u.id);
  auth.setSession(req, res, u);
  res.json({ ok: true, username: u.username, next: auth.subOf && auth.subOf(req) === 'music' ? '/music' : auth.homeFor(req, u) });
});

module.exports = r;
