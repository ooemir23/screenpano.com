// TV tarafı (/api/tv/*): kullanıcı adı/şifre ile giriş, ekran seçimi, telefondan 6 haneli kodla eşleştirme.
// Başarılı girişte cihaza uzun ömürlü bir token verilir; şifre cihazda saklanmaz.
const express = require('express');
const QRCode = require('qrcode');
const store = require('./store');
const auth = require('./auth');
const tenants = require('./tenants');
const { plan } = require('./plans');

const r = express.Router();
const MIN = 60 * 1000;

const limitError = t => {
  const n = store.q.devicesOf.all(t.id).length, lim = plan(t).devices;
  return n >= lim ? `Paketinizde en çok ${lim} cihaz bağlanabilir. Panelde Ayarlar → Cihazlar bölümünden kullanılmayan cihazı kaldırın.` : null;
};
function issueDevice(t, agent, name) {
  const token = auth.newDeviceToken(), id = auth.uid(), s = tenants.mainScreen(t);
  store.q.deviceIns.run({ id, tenant_id: t.id, screen_id: s.id, token_hash: auth.hashToken(token), name: String(name || '').slice(0, 40) || 'TV kutusu', agent: String(agent || '').slice(0, 160), created: Date.now() });
  return token;
}

// Kullanıcı adı ve şifreyle giriş: doğrudan cihaz token'ı
r.post('/login', async (req, res) => {
  const ip = auth.clientIp(req);
  const { username, password } = req.body || {};
  if (auth.tooMany(ip, username)) return res.status(429).json({ error: 'Çok fazla hatalı deneme. 10 dakika sonra tekrar deneyin.' });
  const release = auth.begin(ip, username); // paralel denemeler de sınıra sayılır
  const u = store.q.userByName.get(String(username || '').trim());
  const pwOk = !!u && !!u.tenant_id && await auth.checkPasswordAsync(password, u.pass).finally(release);
  release();
  if (!pwOk) { auth.noteFail(ip, username); return res.status(401).json({ error: 'Kullanıcı adı ya da şifre yanlış' }); }
  auth.clearFails(ip, username);
  let t = tenants.get(u.tenant_id);
  if (!t) return res.status(404).json({ error: 'İşletme bulunamadı' });
  // çoklu şube: işletme sahibinin birden çok şubesi varsa TV hangi şubeye bağlanacağını sorar
  const branches = u.role === 'owner' && t.org_id ? store.q.orgTenants.all(t.org_id) : [];
  if (branches.length > 1) {
    const want = String((req.body || {}).branch || '');
    if (!want) return res.json({ choose: branches.map(b => ({ id: b.id, name: b.name })) });
    if (!branches.some(b => b.id === want)) return res.status(400).json({ error: 'Şube bulunamadı' });
    t = tenants.get(want);
  }
  const err = limitError(t); if (err) return res.status(400).json({ error: err });
  res.json({ deviceToken: issueDevice(t, req.headers['user-agent']), tenant: t.name });
});

// Telefonla eşleştirme: TV kod ister, işletme panelde kodu girer, TV sorarak token'ı alır
const pairs = new Map(); // pid -> { code, created, tid, agent }
const byCode = new Map(); // code -> pid
setInterval(() => { for (const [pid, p] of pairs) if (Date.now() - p.created > 15 * MIN) { pairs.delete(pid); byCode.delete(p.code); } }, MIN);
r.post('/pair/start', async (req, res) => {
  if (pairs.size > 5000) return res.status(503).json({ error: 'meşgul' });
  let code; do { code = String(require('crypto').randomInt(100000, 1000000)); } while (byCode.has(code));
  const pid = auth.uid(24);
  pairs.set(pid, { code, created: Date.now(), tid: null });
  byCode.set(code, pid);
  // telefonla okutulunca panelin eşleştirme ekranı kod dolu açılır
  const url = `${req.protocol}://${req.get('host')}/panel#pair=${code}`;
  const qr = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } });
  res.json({ pid, code, qr, expiresIn: 15 * 60 });
});
r.get('/pair/:pid', (req, res) => {
  const p = pairs.get(req.params.pid);
  if (!p) return res.status(404).json({ status: 'expired' });
  if (!p.tid) return res.json({ status: 'waiting' });
  pairs.delete(req.params.pid); byCode.delete(p.code);
  // cihaz kaydı TV jetonu aldığı anda açılır: panelden kod girilip TV hiç sormazsa yetim cihaz kalmaz, kota dolmaz
  const t = tenants.get(p.tid);
  const err = t ? limitError(t) : 'İşletme bulunamadı';
  if (err) return res.status(409).json({ status: 'expired', error: err });
  res.json({ status: 'done', deviceToken: issueDevice(t, req.headers['user-agent'] || p.agent, 'TV kutusu') });
});
// panelden kod girilince: hata metni ya da null
// Kod tahminini engelle: işletme başına 10 dakikada en çok 8 hatalı deneme
const claimFails = new Map(); // tenantId -> { n, t }
function claimPair(code, t, agent) {
  const f = claimFails.get(t.id);
  if (f && Date.now() - f.t < 10 * MIN && f.n >= 8) return 'Çok fazla hatalı kod denendi. 10 dakika sonra tekrar deneyin.';
  const pid = byCode.get(code), p = pid && pairs.get(pid);
  if (!p || p.tid || Date.now() - p.created > 15 * MIN) {
    const g = claimFails.get(t.id); claimFails.set(t.id, g && Date.now() - g.t < 10 * MIN ? { n: g.n + 1, t: g.t } : { n: 1, t: Date.now() });
    return 'Kod bulunamadı ya da süresi doldu. TV ekranındaki güncel kodu girin.';
  }
  const err = limitError(t); if (err) return err;
  p.tid = t.id; p.agent = String(agent || '').slice(0, 160); // TV sorunca cihaz bu işletmeye açılır
  return null;
}
// Cihaz kendini çıkarır (TV menüsündeki "Bu ekrandan çık")
r.post('/logout', (req, res) => {
  const d = store.q.deviceByHash.get(auth.hashToken((req.body || {}).deviceToken || ''));
  if (d) store.q.deviceDel.run(d.id, d.tenant_id);
  res.json({ ok: true });
});

// TV veya önizleme ekranında özel konumlu hava durumu widget'ı için
r.get('/weather', async (req, res) => {
  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  if (!isFinite(lat) || !isFinite(lon)) return res.status(400).json({ error: 'Geçersiz koordinat' });
  const F = require('./feeds');
  const wx = await F.getWeather(lat, lon);
  res.json(wx);
});

module.exports = { router: r, claimPair };
