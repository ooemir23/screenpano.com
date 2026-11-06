// Panel girişi, çıkış ve işletmenin kendi kendine kaydı (/api/auth/*)
const express = require('express');
const config = require('./config');
const store = require('./store');
const auth = require('./auth');
const { createTenant } = require('./accounts');

const r = express.Router();
const LEGAL_VERSION = require('./legal').VERSION;

r.post('/login', async (req, res) => {
  const ip = auth.clientIp(req);
  const { username, password } = req.body || {};
  if (auth.tooMany(ip, username)) return res.status(429).json({ error: 'Çok fazla hatalı deneme. 10 dakika sonra tekrar deneyin.' });
  const u = store.q.userByName.get(String(username || '').trim());
  if (!u || !(await auth.checkPasswordAsync(password, u.pass))) { auth.noteFail(ip, username); return res.status(401).json({ error: 'Kullanıcı adı ya da şifre yanlış' }); }
  auth.clearFails(ip, username);
  store.q.userLogin.run(Date.now(), u.id);
  auth.setSession(req, res, u);
  res.json({ ok: true, role: u.role, next: u.role === 'super' ? '/super' : '/panel' });
});
r.post('/logout', (req, res) => { auth.clearSession(res); res.json({ ok: true }); });
r.get('/config', (req, res) => res.json({ brand: config.BRAND, signup: config.ALLOW_SIGNUP, trialDays: config.TRIAL_DAYS, starters: require('./starters').list().map(({ key, name }) => ({ key, name })) }));
r.post('/signup', (req, res) => {
  if (!config.ALLOW_SIGNUP) return res.status(403).json({ error: 'Yeni kayıt şu an kapalı' });
  const ip = auth.clientIp(req);
  if (auth.tooMany(ip)) return res.status(429).json({ error: 'Çok fazla deneme. Biraz sonra tekrar deneyin.' });
  try {
    const b = req.body || {};
    const email = String(b.email || '').trim().slice(0, 120);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Geçerli bir e-posta adresi girin');
    if (b.accept !== true) throw new Error('Devam etmek için Kullanım Koşulları ve KVKK Aydınlatma Metni\'ni onaylayın');
    const t = createTenant({ name: b.business, username: b.username, password: b.password, phone: b.phone, plan: 'pro', starter: require('./starters').STARTERS[b.starter] ? b.starter : null });
    t.db.notify = { email, offline: true, online: true }; // ekran durumu uyarıları kayıttaki adrese gider
    t.db.consent = { terms: LEGAL_VERSION, kvkk: LEGAL_VERSION, at: Date.now(), ip, marketing: b.marketing === true }; require('./tenants').saveNow(t);
    auth.noteFail(ip); // kayıtlar da sayılır: tek IP'den seri hesap açılmasın
    const u = store.q.userByName.get(String(b.username).trim().toLowerCase());
    auth.setSession(req, res, u);
    res.json({ ok: true, tenant: t.id, next: '/panel' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = r;
