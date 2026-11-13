// Ödeme çekirdeği: sağlayıcıdan bağımsız. Fiyat hesabı, sipariş kaydı, olayın TEK seferlik işlenmesi ve
// işletmenin süresinin uzatılması burada. Mevcut akışa tek köprü: settlePaid → store.updateTenant (süper yönetimdeki
// "süre uzat" ile aynı alanlar: plan, status, paid_until; zincirdeki tüm şubelere).
// Varsayılan KAPALI: payments_mode = off | pilot (yalnız t.db.canPay işaretli işletmeler) | all.
const crypto = require('crypto');
const store = require('../store');
const pricing = require('../pricing');
const plans = require('../plans');
const tenants = require('../tenants');
const { env } = require('./env');

const sql = store.sql;
sql.exec(`
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,                 -- sipariş no (PayTR merchant_oid / iyzico conversationId): yalnız harf+rakam
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL,              -- iyzico | paytr
  kind TEXT NOT NULL,                  -- sub (otomatik yenileme) | oneoff (tek seferlik)
  plan TEXT NOT NULL,
  period TEXT NOT NULL,                -- monthly | yearly
  amount INTEGER NOT NULL,             -- kuruş, KDV dahil: sunucuda hesaplanır, istemciden alınmaz
  currency TEXT NOT NULL DEFAULT 'TRY',
  status TEXT NOT NULL,                -- pending | paid | failed | canceled | mismatch | orphan
  token TEXT DEFAULT '',               -- sağlayıcı ödeme formu belirteci
  provider_ref TEXT DEFAULT '',        -- iyzico abonelik referansı
  pay_data TEXT DEFAULT '',            -- ödeme sayfası içeriği (iyzico form HTML'i / PayTR iframe belirteci)
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS payments_tenant ON payments (tenant_id, created);
CREATE INDEX IF NOT EXISTS payments_ref ON payments (provider, provider_ref);
-- olay tekrarları (webhook yeniden gönderimi) aynı ödemeyi iki kez saymasın
CREATE TABLE IF NOT EXISTS payment_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  kind TEXT NOT NULL,                  -- paid | failed
  at INTEGER NOT NULL,
  PRIMARY KEY (provider, event_id)
);
`);

const PERIODS = { monthly: 1, yearly: 12 };
const DAY = 24 * 3600 * 1000;

function mode() {
  const m = String(process.env.PAYMENTS_MODE || store.setting('payments_mode', 'off'));
  return ['off', 'pilot', 'all'].includes(m) ? m : 'off';
}
function setMode(m) { if (!['off', 'pilot', 'all'].includes(m)) throw new Error('Geçersiz mod'); store.setSetting('payments_mode', m); return m; }
function enabledFor(t) {
  if (!t || plans.isUnlimited(t)) return false; // kendi (sınırsız) işletmelerimiz ödeme yapmaz
  const m = mode();
  return m === 'all' || (m === 'pilot' && !!(t.db && t.db.canPay));
}

// Tahsil edilecek tutar: pricing.js'ten, KDV dahil, kuruş. Yalnız TL ve yalnız tanımlı (>0) fiyatlar satılır.
function quote(planKey, period) {
  if (!plans.PLANS[planKey]) throw new Error('Geçersiz paket');
  if (!PERIODS[period]) throw new Error('Geçersiz dönem');
  const p = pricing.get();
  if (p.currency !== 'TRY') throw new Error('Çevrimiçi ödeme yalnız TL fiyatlarla çalışır');
  const net = (p[planKey] || {})[period] || 0;
  if (!(net > 0)) throw new Error('Bu paket/dönem için fiyat tanımlı değil');
  const vat = env().VAT;
  const gross = p.vat === 'incl' ? net : Math.round(net * (100 + vat) / 100);
  return { plan: planKey, period, net, gross, amount: gross * 100, vat: p.vat === 'incl' ? null : vat, currency: 'TRY' };
}

// Takvim ayı ekler; ayın sonunu taşırmaz (31 Ocak + 1 ay = 28/29 Şubat)
function addMonths(ms, n) {
  const d = new Date(ms), day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.getTime();
}

const newOrderId = () => 'SP' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(5).toString('hex').toUpperCase();
const getPay = id => sql.prepare('SELECT * FROM payments WHERE id = ?').get(String(id || ''));
const payByRef = (provider, ref) => (ref ? sql.prepare('SELECT * FROM payments WHERE provider = ? AND provider_ref = ?').get(provider, String(ref)) : null);
const setPay = (id, f) => {
  const keys = Object.keys(f).filter(k => ['status', 'token', 'provider_ref', 'pay_data'].includes(k));
  if (!keys.length) return;
  sql.prepare(`UPDATE payments SET ${keys.map(k => k + ' = @' + k).join(', ')}, updated = @updated WHERE id = @id`).run({ ...f, id, updated: Date.now() });
};

function createOrder({ tenantId, provider, kind, q }) {
  const id = newOrderId(), now = Date.now();
  sql.prepare('INSERT INTO payments (id, tenant_id, provider, kind, plan, period, amount, currency, status, created, updated) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, tenantId, provider, kind, q.plan, q.period, q.amount, q.currency, 'pending', now, now);
  return getPay(id);
}

// Ödeme başarılı: süreyi uzat. Aynı olay ikinci kez gelirse hiçbir şey yapmaz ({ dup: true }).
// Tutar sağlayıcıdan geliyorsa (PayTR) kayıttaki tutarla birebir eşleşmeli; eşleşmezse süre UZATILMAZ, ödeme "mismatch" olur.
function settlePaid({ provider, eventId, paymentId, amount }) {
  const out = sql.transaction(() => {
    const pay = getPay(paymentId);
    if (!pay || pay.provider !== provider) return { ok: false, code: 'unknown_order' };
    if (sql.prepare('INSERT OR IGNORE INTO payment_events (provider, event_id, payment_id, kind, at) VALUES (?,?,?,?,?)').run(provider, String(eventId), pay.id, 'paid', Date.now()).changes === 0) return { ok: true, dup: true };
    if (amount != null && Number(amount) !== pay.amount) { setPay(pay.id, { status: 'mismatch' }); return { ok: false, code: 'amount_mismatch' }; }
    // durum ve süre önbellekten değil veritabanından okunur (eşzamanlı süper yönetim değişikliği eskimiş veriyle ezilmesin)
    const rowOf = id => sql.prepare('SELECT id, status, paid_until, org_id FROM tenants WHERE id = ?').get(id);
    const t = rowOf(pay.tenant_id);
    if (!t) { setPay(pay.id, { status: 'orphan' }); return { ok: false, code: 'no_tenant' }; }
    const now = Date.now(), until = addMonths(Math.max(now, t.paid_until || 0), PERIODS[pay.period]);
    // zincirin tüm şubeleri aynı paket ve süreyi alır (süper yönetimdeki "zincire uygula" ile aynı)
    const ids = t.org_id ? store.q.orgTenants.all(t.org_id).map(x => x.id) : [t.id];
    if (!ids.includes(t.id)) ids.push(t.id);
    for (const id of ids) {
      const x = rowOf(id) || t;
      store.updateTenant(id, { plan: pay.plan, paid_until: until, status: x.status === 'suspended' ? 'suspended' : 'active' }); // askıyı ödeme kaldırmaz: karar süper yönetimde
    }
    setPay(pay.id, { status: 'paid' });
    return { ok: true, until, ids, suspended: t.status === 'suspended' };
  })();
  if (out.ids) {
    const hub = require('../hub');
    for (const id of out.ids) { try { tenants.refreshRow(id); hub.pushTenant(id); } catch (e) { console.error('Ödeme sonrası yayın:', e.message); } }
  }
  return out;
}

// Tahsilat başarısız (yenileme reddedildi vb.): süre uzatılmaz, yalnız kayıt tutulur. Süre doğal olarak biter, mevcut access() kapatır.
function settleFailed({ provider, eventId, paymentId }) {
  return sql.transaction(() => {
    const pay = getPay(paymentId);
    if (!pay || pay.provider !== provider) return { ok: false, code: 'unknown_order' };
    if (sql.prepare('INSERT OR IGNORE INTO payment_events (provider, event_id, payment_id, kind, at) VALUES (?,?,?,?,?)').run(provider, String(eventId), pay.id, 'failed', Date.now()).changes === 0) return { ok: true, dup: true };
    if (pay.status !== 'canceled') setPay(pay.id, { status: pay.kind === 'sub' && pay.status === 'paid' ? 'failed' : (pay.status === 'pending' ? 'failed' : pay.status) });
    console.warn('[ödeme] tahsilat başarısız:', provider, pay.id, 'işletme', pay.tenant_id);
    return { ok: true };
  })();
}

function history(tenantId, n = 12) {
  return sql.prepare('SELECT id, provider, kind, plan, period, amount, status, created FROM payments WHERE tenant_id = ? AND status != ? ORDER BY created DESC LIMIT ?').all(tenantId, 'pending', n);
}

module.exports = { sql, PERIODS, DAY, mode, setMode, enabledFor, quote, addMonths, createOrder, getPay, payByRef, setPay, settlePaid, settleFailed, history };
