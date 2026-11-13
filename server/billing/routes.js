// İşletme paneli ödeme uçları (/api/admin/billing/*). routes-admin kimlik ara katmanından SONRA bağlanır (req.user, req.t hazır).
// Mod kapalıysa ya da işletme pilotta değilse hiçbiri çalışmaz; panel de düğmeyi göstermez (status.enabled).
const auth = require('../auth');
const accounts = require('../accounts');
const core = require('./core');
const iyzico = require('./iyzico');
const paytr = require('./paytr');
const config = require('../config');

const providers = () => ({ iyzico: iyzico.configured(), paytr: paytr.configured() });

function customerOf(b) {
  const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const c = { name: s(b.name, 40), surname: s(b.surname, 40), email: s(b.email, 120), gsm: s(b.gsm, 20).replace(/[^\d+]/g, ''), identityNumber: s(b.identityNumber, 11), address: s(b.address, 200), city: s(b.city, 60) };
  if (c.name.length < 2 || c.surname.length < 2) return { error: 'Ad ve soyad gerekli' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) return { error: 'Geçerli e-posta gerekli' };
  if (c.gsm.replace(/\D/g, '').length < 10) return { error: 'Geçerli telefon gerekli' };
  if (!/^\d{11}$/.test(c.identityNumber)) return { error: 'T.C. kimlik / vergi numarası 11 haneli olmalı' };
  if (c.address.length < 10 || c.city.length < 2) return { error: 'Fatura adresi ve şehir gerekli' };
  return { c };
}

module.exports = function mount(r, { ownerOnly }) {
  // Yalnız ana işletme (sahibi olan) öder; şubeler aynı süreyi zincirden alır. Süper yönetici başkası adına ödemez.
  const guard = (req, res, next) => {
    if (!core.enabledFor(req.t)) return res.status(404).json({ error: 'Çevrimiçi ödeme bu işletme için açık değil' });
    if (req.user.role === 'super' || auth.impOf(req.user)) return res.status(403).json({ error: 'Başka işletme adına ödeme yapılamaz' });
    if (!accounts.isHome(req.t)) return res.status(403).json({ error: 'Ödemeyi zincirin ana işletmesi yapar' });
    next();
  };

  r.get('/billing', (req, res) => {
    const enabled = core.enabledFor(req.t) && accounts.isHome(req.t) && req.user.role !== 'super';
    const out = { enabled, providers: providers(), paidUntil: req.t.paid_until || null, history: core.history(req.t.id), quotes: [] };
    if (enabled) for (const plan of ['baslangic', 'pro']) for (const period of Object.keys(core.PERIODS)) { try { out.quotes.push(core.quote(plan, period)); } catch (e) { /* fiyat tanımsız */ } }
    res.json(out);
  });

  // body: { provider: 'iyzico'|'paytr', plan, period, customer: {...} }
  r.post('/billing/checkout', ownerOnly, guard, async (req, res) => {
    const b = req.body || {}, prov = providers();
    const provider = b.provider === 'paytr' || b.provider === 'iyzico' ? b.provider : (prov.iyzico ? 'iyzico' : 'paytr');
    if (!prov[provider]) return res.status(503).json({ error: 'Seçilen ödeme yöntemi yapılandırılmadı' });
    let q; try { q = core.quote(String(b.plan || ''), String(b.period || '')); } catch (e) { return res.status(400).json({ error: e.message }); }
    const cu = customerOf(b.customer || {}); if (cu.error) return res.status(400).json({ error: cu.error });
    // aynı işletmenin kullanılmamış eski siparişleri: yeni ödeme açılırken iptal (kart çift çekilmesin)
    core.sql.prepare("UPDATE payments SET status = 'canceled', updated = ? WHERE tenant_id = ? AND status = 'pending'").run(Date.now(), req.t.id);
    const order = core.createOrder({ tenantId: req.t.id, provider, kind: provider === 'iyzico' ? 'sub' : 'oneoff', q });
    try {
      if (provider === 'iyzico') {
        const r1 = await iyzico.initCheckout({ order, gross: q.gross, callbackUrl: config.BASE_URL + '/api/billing/iyzico/return', customer: cu.c });
        core.setPay(order.id, { token: r1.token, pay_data: r1.html });
      } else {
        const r1 = await paytr.initCheckout({ order, baseUrl: config.BASE_URL, ip: auth.clientIp(req), customer: cu.c, label: `ScreenPano ${q.plan} ${q.period === 'yearly' ? 'yıllık' : 'aylık'}` });
        core.setPay(order.id, { token: r1.token, pay_data: r1.token });
      }
      res.json({ ok: true, url: config.BASE_URL + '/api/billing/pay/' + order.id });
    } catch (e) {
      core.setPay(order.id, { status: 'failed' });
      console.error('[ödeme] checkout:', provider, e.message);
      res.status(502).json({ error: 'Ödeme sayfası açılamadı, birazdan tekrar deneyin' });
    }
  });

  // otomatik yenilemeyi durdur (süre dönem sonuna kadar açık kalır)
  r.post('/billing/cancel', ownerOnly, guard, async (req, res) => {
    const sub = core.sql.prepare("SELECT * FROM payments WHERE tenant_id = ? AND kind = 'sub' AND provider_ref != '' AND status IN ('paid','failed') ORDER BY created DESC LIMIT 1").get(req.t.id);
    if (!sub) return res.status(404).json({ error: 'Aktif abonelik bulunamadı' });
    try { await iyzico.cancel(sub.provider_ref); core.setPay(sub.id, { status: 'canceled' }); res.json({ ok: true }); }
    catch (e) { console.error('[ödeme] iptal:', e.message); res.status(502).json({ error: 'Abonelik iptal edilemedi, tekrar deneyin' }); }
  });
};
