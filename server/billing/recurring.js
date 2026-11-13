// PayTR aylık otomatik ödeme (kayıtlı kart). Akış:
//  1) Panel "otomatik ödeme" seçerek ilk ödemeyi yapar (iFrame, kart saklama istenir) → billing_subs 'awaiting_card'.
//  2) İlk ödeme bildirimi utoken getirirse kart listesinden ctoken alınır → 'active'.
//  3) Süre bitimine 1 günden az kalınca her ay kayıtlı karttan Non3D tahsilat; her deneme KENDİ sipariş numarasıyla (merchant_oid).
//  4) Başarısızlıkta 1, 2, 3 gün arayla yeniden dener; 3. başarısızlıktan sonra 'past_due' (tahsilat durur, süre bitince ekran kapanır).
// Güvenlik: mod kapalıysa/işletme pilotta değilse hiç tahsilat yapılmaz (kill switch). Aynı işletmeye 2 saat içinde bekleyen
// (sonucu belirsiz) sipariş varsa yeni tahsilat denenmez: çift çekimi önler. Tutar, abonelik kurulurken kabul edilen tutardır.
const store = require('../store');
const tenants = require('../tenants');
const core = require('./core');
const paytr = require('./paytr');

core.sql.exec(`
CREATE TABLE IF NOT EXISTS billing_subs (
  tenant_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'paytr',
  plan TEXT NOT NULL,
  amount INTEGER NOT NULL,             -- kuruş, KDV dahil: kurulumda kabul edilen tutar
  status TEXT NOT NULL,                -- awaiting_card | active | past_due | canceled
  order_id TEXT DEFAULT '',            -- kartı saklayan ilk sipariş
  utoken TEXT DEFAULT '', ctoken TEXT DEFAULT '', last4 TEXT DEFAULT '', card_exp TEXT DEFAULT '',
  user_ip TEXT DEFAULT '',
  customer TEXT NOT NULL DEFAULT '{}', -- {name,surname,email,gsm,address,city}
  fail_count INTEGER NOT NULL DEFAULT 0,
  next_try INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL, updated INTEGER NOT NULL
);
`);

const HOUR = 3600 * 1000, DAY = 24 * HOUR, MAX_FAILS = 3;
const getSub = tid => core.sql.prepare('SELECT * FROM billing_subs WHERE tenant_id = ?').get(tid);
const setSub = (tid, f) => {
  const keys = Object.keys(f).filter(k => ['plan', 'amount', 'status', 'order_id', 'utoken', 'ctoken', 'last4', 'card_exp', 'user_ip', 'customer', 'fail_count', 'next_try'].includes(k));
  if (keys.length) core.sql.prepare(`UPDATE billing_subs SET ${keys.map(k => k + ' = @' + k).join(', ')}, updated = @updated WHERE tenant_id = @tid`).run({ ...f, tid, updated: Date.now() });
};

// Otomatik ödemeli ilk ödeme açılırken: abonelik kaydı (kart henüz yok). Önceki kayıt (iptal/gecikmiş) sıfırlanır.
function begin({ tenantId, q, orderId, ip, customer }) {
  const now = Date.now();
  core.sql.prepare(`INSERT INTO billing_subs (tenant_id, provider, plan, amount, status, order_id, user_ip, customer, fail_count, next_try, created, updated)
    VALUES (?,?,?,?,?,?,?,?,0,0,?,?) ON CONFLICT(tenant_id) DO UPDATE SET plan = excluded.plan, amount = excluded.amount, status = 'awaiting_card', order_id = excluded.order_id,
    utoken = '', ctoken = '', last4 = '', card_exp = '', user_ip = excluded.user_ip, customer = excluded.customer, fail_count = 0, next_try = 0, updated = excluded.updated`)
    .run(tenantId, 'paytr', q.plan, q.amount, 'awaiting_card', orderId, String(ip || ''), JSON.stringify(customer), now, now);
}
const cancel = tid => { const s = getSub(tid); if (!s || s.status === 'canceled') return false; setSub(tid, { status: 'canceled' }); return true; };
const publicView = tid => { const s = getSub(tid); return s ? { status: s.status, last4: s.last4, exp: s.card_exp, amount: s.amount, failCount: s.fail_count } : null; };

// İlk ödeme bildirimi: utoken geldiyse kartı bağla. Başarısızsa abonelik 'awaiting_card' kalır (tek seferlik ödeme zaten işlendi).
async function onFirstPayment(pay, utoken) {
  const s = getSub(pay.tenant_id);
  if (!s || s.status !== 'awaiting_card' || s.order_id !== pay.id) return false;
  if (!utoken) { console.warn('[ödeme] PayTR bildirimi utoken getirmedi (kart saklama izni/alanı?):', pay.id); return false; }
  const cards = await paytr.listCards(String(utoken));
  const card = cards[cards.length - 1];
  if (!card) { console.warn('[ödeme] PayTR kart listesi boş:', pay.id); return false; }
  if (card.requireCvv) { console.warn('[ödeme] kart CVV istiyor, otomatik tahsilat yapılamaz:', pay.id); setSub(pay.tenant_id, { status: 'canceled' }); return false; }
  setSub(pay.tenant_id, { status: 'active', utoken: String(utoken), ctoken: card.ctoken, last4: card.last4, card_exp: card.month && card.year ? `${card.month}/${card.year}` : '', fail_count: 0, next_try: 0 });
  return true;
}

function notify(tid, subject, text) {
  try {
    const t = tenants.get(tid), to = (t && t.db.notify && t.db.notify.email) || (JSON.parse((getSub(tid) || {}).customer || '{}')).email;
    if (to) require('../mailer').send({ to, subject, text }).catch(e => console.error('[ödeme] e-posta:', e.message));
  } catch (e) { console.error('[ödeme] e-posta:', e.message); }
}

// Bir abonelik için tek tahsilat denemesi
async function charge(s) {
  const t = tenants.get(s.tenant_id);
  const dueAt = Date.now() + 15 * 60 * 1000;
  setSub(s.tenant_id, { next_try: dueAt }); // talep: çöküş/çift tetik durumunda aynı abonelik 15 dk tekrar denenmez
  const q = { plan: s.plan, period: 'monthly', amount: s.amount, currency: 'TRY' };
  const order = core.createOrder({ tenantId: s.tenant_id, provider: 'paytr', kind: 'recurring', q });
  let r;
  try {
    r = await paytr.chargeStored({ order, ip: s.user_ip || '127.0.0.1', customer: JSON.parse(s.customer), utoken: s.utoken, ctoken: s.ctoken, label: `ScreenPano ${s.plan} aylık` });
  } catch (e) {
    console.error('[ödeme] otomatik tahsilat belirsiz (bekleyen sipariş bırakıldı):', order.id, e.message);
    return { ok: false, unknown: true };
  }
  if (r.status === 'success') { core.settlePaid({ provider: 'paytr', eventId: order.id, paymentId: order.id, amount: order.amount }); setSub(s.tenant_id, { fail_count: 0, next_try: 0 }); return { ok: true }; }
  if (r.status === 'wait_callback') return { ok: true, waiting: true }; // sonuç bildirimle gelir (notify → settlePaid)
  // kesin ret
  core.setPay(order.id, { status: 'failed' });
  const fails = s.fail_count + 1;
  if (fails >= MAX_FAILS) {
    setSub(s.tenant_id, { status: 'past_due', fail_count: fails, next_try: 0 });
    notify(s.tenant_id, 'ScreenPano: otomatik ödeme alınamadı', 'Kayıtlı kartınızdan aylık ödeme birkaç denemeye rağmen alınamadı. Hizmetiniz süre sonunda duracaktır. Panelden Paketler bölümünden yeniden ödeme yapabilirsiniz.');
  } else {
    setSub(s.tenant_id, { fail_count: fails, next_try: Date.now() + fails * DAY });
    notify(s.tenant_id, 'ScreenPano: otomatik ödeme alınamadı', `Kayıtlı kartınızdan aylık ödeme alınamadı. ${fails} gün sonra yeniden denenecek. Kartınızın limitini/geçerliliğini kontrol edin.`);
  }
  return { ok: false, reason: r.reason };
}

let running = false;
// Süresi 1 günden az kalan etkin abonelikler. Dönen: denenen abonelik sayısı
async function tick(now = Date.now()) {
  if (running || core.mode() === 'off' || !paytr.recurringEnabled()) return 0;
  running = true; let n = 0;
  try {
    const subs = core.sql.prepare("SELECT * FROM billing_subs WHERE status = 'active' AND next_try <= ? ORDER BY next_try LIMIT 50").all(now);
    for (const s of subs) {
      const t = tenants.get(s.tenant_id);
      if (!t) { setSub(s.tenant_id, { status: 'canceled' }); continue; }
      if (!core.enabledFor(t) || t.status === 'suspended') continue;             // pilot dışı / askıda: dokunma
      const row = core.sql.prepare('SELECT paid_until FROM tenants WHERE id = ?').get(s.tenant_id);
      if ((row.paid_until || 0) > now + DAY) continue;                           // süre yeterli
      const pend = core.sql.prepare("SELECT 1 FROM payments WHERE tenant_id = ? AND status = 'pending' AND created > ?").get(s.tenant_id, now - 2 * HOUR);
      if (pend) continue;                                                         // belirsiz/bekleyen ödeme var: çift çekim olmasın
      n++; try { await charge(s); } catch (e) { console.error('[ödeme] tahsilat hatası:', s.tenant_id, e.message); }
    }
  } finally { running = false; }
  return n;
}
function start() { setInterval(() => tick().catch(e => console.error('[ödeme] zamanlayıcı:', e.message)), 30 * 60 * 1000).unref(); }

module.exports = { begin, cancel, publicView, onFirstPayment, tick, start, getSub, MAX_FAILS };
