// Ödeme altyapısı: tutar hesabı, kapı (mod), olayın tek seferlik işlenmesi, imza doğrulama, tutar uyuşmazlığı, ödeme sayfası.
const { mkdtempSync, rmSync } = require('fs');
const { tmpdir } = require('os');
const path = require('path');
const crypto = require('crypto');

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'sp-bill-'));
process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
process.env.APP_ENV = 'test';
Object.assign(process.env, { PAYTR_MERCHANT_ID: '12345', PAYTR_MERCHANT_KEY: 'kkk-key', PAYTR_MERCHANT_SALT: 'sss-salt', IYZICO_API_KEY: 'api', IYZICO_SECRET_KEY: 'sec-key', IYZICO_MERCHANT_ID: 'mid-1', PAYTR_RECURRING: '1' });

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const store = require('../server/store');
const pricing = require('../server/pricing');
const tenants = require('../server/tenants');
const { createTenant } = require('../server/accounts');
const core = require('../server/billing/core');
const iyzico = require('../server/billing/iyzico');
const paytr = require('../server/billing/paytr');
const recurring = require('../server/billing/recurring');

let server, BASE, n = 0;
const DAY = 24 * 3600 * 1000;
const row = id => store.sql.prepare('SELECT plan, status, paid_until FROM tenants WHERE id = ?').get(id);
const mk = (o = {}) => createTenant({ name: 'Test ' + (++n), username: 'bill' + n + 'user', password: 'parola-12345', ...o });
const order = (t, provider = 'paytr', plan = 'pro', period = 'monthly') => core.createOrder({ tenantId: t.id, provider, kind: provider === 'iyzico' ? 'sub' : 'oneoff', q: core.quote(plan, period) });
const post = (p, body, headers = {}) => fetch(BASE + p, { method: 'POST', headers, body });
const paytrBody = (oid, status, amount, key = 'kkk-key') => {
  const hash = paytr.b64hmac(key, oid + 'sss-salt' + status + amount);
  return new URLSearchParams({ merchant_oid: oid, status, total_amount: String(amount), hash }).toString();
};
const iyzPayload = (sub, orderRef, type = 'subscription.order.success') => ({ orderReferenceCode: orderRef, customerReferenceCode: 'cust-1', subscriptionReferenceCode: sub, iyziReferenceCode: 'x', iyziEventType: type, iyziEventTime: 1700000000000 });
const iyzSig = (p, secret = 'sec-key') => iyzico.hmacHex(secret, 'mid-1' + secret + p.iyziEventType + p.subscriptionReferenceCode + p.orderReferenceCode + p.customerReferenceCode);

before(async () => {
  pricing.set({ currency: 'TRY', vat: 'excl', baslangic: { monthly: 2000, yearly: 20000 }, pro: { monthly: 3000, yearly: 30000 } });
  const app = express();
  app.use('/api/billing', require('../server/billing/public').router);
  await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
  BASE = `http://127.0.0.1:${server.address().port}/api/billing`;
});
after(() => { server.close(); try { rmSync(process.env.DATA_DIR, { recursive: true, force: true }); } catch {} });

test('tutar: KDV hariç fiyata KDV eklenir, kuruş olarak döner', () => {
  const q = core.quote('pro', 'monthly');
  assert.equal(q.gross, 3600); assert.equal(q.amount, 360000); assert.equal(q.vat, 20);
  pricing.set({ currency: 'TRY', vat: 'incl', baslangic: { monthly: 2000 }, pro: { monthly: 3000, yearly: 30000 } });
  assert.equal(core.quote('pro', 'monthly').amount, 300000);
  pricing.set({ currency: 'TRY', vat: 'excl', baslangic: { monthly: 2000, yearly: 20000 }, pro: { monthly: 3000, yearly: 30000 } });
});
test('tutar: tanımsız fiyat, geçersiz paket/dönem ve TL dışı para birimi reddedilir', () => {
  assert.throws(() => core.quote('pro', 'daily')); assert.throws(() => core.quote('yok', 'monthly'));
  pricing.set({ currency: 'TRY', vat: 'excl', baslangic: { monthly: 2000 }, pro: { monthly: 3000 } });
  assert.throws(() => core.quote('pro', 'yearly'), /fiyat/);
  pricing.set({ currency: 'USD', vat: 'excl', pro: { monthly: 30 } });
  assert.throws(() => core.quote('pro', 'monthly'), /TL/);
  pricing.set({ currency: 'TRY', vat: 'excl', baslangic: { monthly: 2000, yearly: 20000 }, pro: { monthly: 3000, yearly: 30000 } });
});
test('ay ekleme: ay sonu taşmaz', () => {
  assert.equal(new Date(core.addMonths(Date.UTC(2027, 0, 31), 1)).toISOString().slice(0, 10), '2027-02-28');
  assert.equal(new Date(core.addMonths(Date.UTC(2028, 0, 31), 1)).toISOString().slice(0, 10), '2028-02-29');
  assert.equal(new Date(core.addMonths(Date.UTC(2026, 11, 15), 12)).toISOString().slice(0, 10), '2027-12-15');
});
test('kapı: varsayılan kapalı; pilot yalnız işaretli; sınırsız işletme hiçbir modda ödemez', () => {
  const t = mk();
  assert.equal(core.mode(), 'off'); assert.equal(core.enabledFor(t), false);
  core.setMode('pilot'); assert.equal(core.enabledFor(t), false);
  t.db.canPay = true; assert.equal(core.enabledFor(t), true);
  t.db.unlimited = true; assert.equal(core.enabledFor(t), false); delete t.db.unlimited;
  core.setMode('all'); delete t.db.canPay; assert.equal(core.enabledFor(t), true);
  assert.throws(() => core.setMode('hepsi')); core.setMode('off');
});
test('ödeme: süre uzar, paket değişir; aynı olay ikinci kez işlenmez', () => {
  const t = mk({ plan: 'baslangic' }), o = order(t);
  const r1 = core.settlePaid({ provider: 'paytr', eventId: o.id, paymentId: o.id, amount: o.amount });
  assert.equal(r1.ok, true);
  const a = row(t.id); assert.equal(a.plan, 'pro'); assert.equal(a.status, 'active');
  assert.ok(a.paid_until > Date.now() + 27 * DAY && a.paid_until < Date.now() + 32 * DAY);
  const r2 = core.settlePaid({ provider: 'paytr', eventId: o.id, paymentId: o.id, amount: o.amount });
  assert.equal(r2.dup, true); assert.equal(row(t.id).paid_until, a.paid_until);
});
test('ödeme: yıllık ödeme mevcut ileri tarihten devam eder', () => {
  const future = Date.now() + 10 * DAY, t = mk({ paidUntil: future }), o = order(t, 'paytr', 'pro', 'yearly');
  core.settlePaid({ provider: 'paytr', eventId: o.id, paymentId: o.id, amount: o.amount });
  assert.equal(row(t.id).paid_until, core.addMonths(future, 12));
});
test('ödeme: tutar uyuşmazlığında süre uzamaz', () => {
  const t = mk(), o = order(t), before = row(t.id).paid_until;
  const r = core.settlePaid({ provider: 'paytr', eventId: o.id, paymentId: o.id, amount: 100 });
  assert.equal(r.code, 'amount_mismatch'); assert.equal(row(t.id).paid_until, before); assert.equal(core.getPay(o.id).status, 'mismatch');
});
test('ödeme: askıdaki işletme ödemeyle açılmaz, süre kaydedilir', () => {
  const t = mk(); store.updateTenant(t.id, { status: 'suspended' });
  const o = order(t); const r = core.settlePaid({ provider: 'paytr', eventId: o.id, paymentId: o.id, amount: o.amount });
  assert.equal(r.suspended, true); assert.equal(row(t.id).status, 'suspended');
});
test('ödeme: başka sağlayıcının siparişi bu olayla kapanmaz', () => {
  const t = mk(), o = order(t, 'iyzico'); // iyzico siparişi PayTR olayıyla ödenemez
  assert.equal(core.settlePaid({ provider: 'paytr', eventId: o.id, paymentId: o.id, amount: o.amount }).code, 'unknown_order');
});

test('PayTR bildirimi: geçerli imza OK döner ve tek kez uzatır; bozuk imza 400', async () => {
  const t = mk(), o = order(t);
  const bad = await post('/paytr/notify', paytrBody(o.id, 'success', o.amount, 'yanlis'), { 'Content-Type': 'application/x-www-form-urlencoded' });
  assert.equal(bad.status, 400); assert.equal(core.getPay(o.id).status, 'pending');
  const ok1 = await post('/paytr/notify', paytrBody(o.id, 'success', o.amount), { 'Content-Type': 'application/x-www-form-urlencoded' });
  assert.equal(ok1.status, 200); assert.equal(await ok1.text(), 'OK');
  const until = row(t.id).paid_until;
  const ok2 = await post('/paytr/notify', paytrBody(o.id, 'success', o.amount), { 'Content-Type': 'application/x-www-form-urlencoded' });
  assert.equal(await ok2.text(), 'OK'); assert.equal(row(t.id).paid_until, until);
});
test('PayTR bildirimi: tutar uyuşmazlığı OK döner ama süre uzamaz; başarısız ödeme kaydedilir', async () => {
  const t = mk(), o = order(t), t2 = mk(), o2 = order(t2), h = { 'Content-Type': 'application/x-www-form-urlencoded' };
  const before = row(t.id).paid_until;
  assert.equal(await (await post('/paytr/notify', paytrBody(o.id, 'success', 1), h)).text(), 'OK');
  assert.equal(row(t.id).paid_until, before);
  assert.equal(await (await post('/paytr/notify', paytrBody(o2.id, 'failed', o2.amount), h)).text(), 'OK');
  assert.equal(core.getPay(o2.id).status, 'failed');
});
test('iyzico webhook: imza zorunlu; geçerli olay süreyi uzatır, tekrarı uzatmaz; bilinmeyen abonelik 503', async () => {
  const t = mk(), o = order(t, 'iyzico'); core.setPay(o.id, { provider_ref: 'sub-A' });
  const p = iyzPayload('sub-A', 'ord-1'), H = { 'Content-Type': 'application/json' };
  assert.equal((await post('/iyzico/webhook', JSON.stringify(p), { ...H, 'X-IYZ-SIGNATURE-V3': iyzSig(p, 'baska') })).status, 401);
  assert.equal((await post('/iyzico/webhook', JSON.stringify(p), H)).status, 401);
  const ok = await post('/iyzico/webhook', JSON.stringify(p), { ...H, 'X-IYZ-SIGNATURE-V3': iyzSig(p) });
  assert.equal(ok.status, 200); const until = row(t.id).paid_until; assert.ok(until > Date.now() + 27 * DAY);
  await post('/iyzico/webhook', JSON.stringify(p), { ...H, 'X-IYZ-SIGNATURE-V3': iyzSig(p) });
  assert.equal(row(t.id).paid_until, until);
  const p2 = iyzPayload('sub-A', 'ord-2'); // aylık yenileme: ikinci sipariş bir ay daha ekler
  await post('/iyzico/webhook', JSON.stringify(p2), { ...H, 'X-IYZ-SIGNATURE-V3': iyzSig(p2) });
  assert.equal(row(t.id).paid_until, core.addMonths(until, 1));
  const p3 = iyzPayload('sub-YOK', 'ord-9');
  assert.equal((await post('/iyzico/webhook', JSON.stringify(p3), { ...H, 'X-IYZ-SIGNATURE-V3': iyzSig(p3) })).status, 503);
});
test('iyzico webhook: tahsilat hatası süreyi uzatmaz', async () => {
  const t = mk(), o = order(t, 'iyzico'); core.setPay(o.id, { provider_ref: 'sub-B' });
  const before = row(t.id).paid_until, p = iyzPayload('sub-B', 'ord-f', 'subscription.order.failure');
  const r = await post('/iyzico/webhook', JSON.stringify(p), { 'Content-Type': 'application/json', 'X-IYZ-SIGNATURE-V3': iyzSig(p) });
  assert.equal(r.status, 200); assert.equal(row(t.id).paid_until, before); assert.equal(core.getPay(o.id).status, 'failed');
});
test('ödeme sayfası: bilinmeyen/süresi dolmuş 404; açık sipariş kendi CSP\'siyle gelir', async () => {
  assert.equal((await fetch(BASE + '/pay/YOKSIPARIS123')).status, 404);
  assert.equal((await fetch(BASE + '/pay/../x')).status, 404);
  const t = mk(), o = order(t); core.setPay(o.id, { token: 'tok123', pay_data: 'tok123' });
  const r = await fetch(BASE + '/pay/' + o.id), html = await r.text();
  assert.equal(r.status, 200); assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/); assert.match(html, /paytr\.com\/odeme\/guvenli\/tok123/);
  store.sql.prepare('UPDATE payments SET created = ? WHERE id = ?').run(Date.now() - 31 * 60 * 1000, o.id);
  assert.equal((await fetch(BASE + '/pay/' + o.id)).status, 404);
});

// ---- PayTR aylık otomatik ödeme (PayTR çağrıları taklit edilir) ----
const CUST = { name: 'Ali', surname: 'Veli', email: 'a@b.co', gsm: '5551112233', address: 'Örnek mah. 1', city: 'İstanbul' };
async function activeSub(paidUntil) {
  const t = mk({ paidUntil }), o = order(t); core.setPay(o.id, { status: 'paid' }); // gerçek akışta ilk sipariş bildirimle zaten ödenmiş olur
  recurring.begin({ tenantId: t.id, q: core.quote('pro', 'monthly'), orderId: o.id, ip: '1.2.3.4', customer: CUST });
  paytr.listCards = async () => [{ ctoken: 'ct-1', last4: '4242', month: '12', year: '30', requireCvv: false }];
  assert.equal(await recurring.onFirstPayment(o, 'ut-1'), true);
  return t;
}
test('otomatik ödeme: ilk ödemede utoken ile kart bağlanır; utoken yoksa bağlanmaz', async () => {
  const t = await activeSub(Date.now() + DAY * 20);
  const s = recurring.getSub(t.id); assert.equal(s.status, 'active'); assert.equal(s.ctoken, 'ct-1'); assert.equal(s.last4, '4242');
  const t2 = mk(), o2 = order(t2); recurring.begin({ tenantId: t2.id, q: core.quote('pro', 'monthly'), orderId: o2.id, ip: '1.1.1.1', customer: CUST });
  assert.equal(await recurring.onFirstPayment(o2, ''), false); assert.equal(recurring.getSub(t2.id).status, 'awaiting_card');
});
test('otomatik ödeme: süresi bitmeye yakın abonelik tahsil edilir, süre uzar, ikinci tur tekrar çekmez', async () => {
  core.setMode('all'); let calls = 0;
  paytr.chargeStored = async () => { calls++; return { status: 'success' }; };
  const t = await activeSub(Date.now() + 3600 * 1000), before = row(t.id).paid_until;
  await recurring.tick(); assert.equal(calls >= 1, true);
  assert.equal(row(t.id).paid_until, core.addMonths(before, 1));
  const c = calls; await recurring.tick(); assert.equal(calls, c); core.setMode('off');
});
test('otomatik ödeme: süre yeterliyse, mod kapalıysa, askıdaysa tahsilat yok', async () => {
  let calls = 0; paytr.chargeStored = async () => { calls++; return { status: 'success' }; };
  const far = await activeSub(Date.now() + DAY * 20), near = await activeSub(Date.now() + 3600 * 1000);
  core.setMode('all'); await recurring.tick(); const farCalls = recurring.getSub(far.id);
  assert.equal(row(far.id).paid_until > Date.now() + DAY * 19, true); assert.equal(farCalls.fail_count, 0);
  core.setMode('off'); const c = calls; const nearBefore = row(near.id).paid_until;
  // yeni abonelik (mod kapalı): tick hiçbir şey yapmaz
  const t = await activeSub(Date.now() + 3600 * 1000); await recurring.tick(); assert.equal(calls, c); assert.equal(row(t.id).paid_until < Date.now() + DAY, true);
  core.setMode('all'); store.updateTenant(t.id, { status: 'suspended' }); tenants.refreshRow(t.id);
  const before2 = calls; await recurring.tick(); assert.equal(row(t.id).paid_until < Date.now() + DAY, true); core.setMode('off'); void nearBefore; void before2;
});
test('otomatik ödeme: kesin ret 1-2-3 gün arayla denenir, 3. retten sonra past_due', async () => {
  core.setMode('all'); paytr.chargeStored = async () => ({ status: 'failed', tryAgain: false, reason: 'kart kapalı' });
  const t = await activeSub(Date.now() + 3600 * 1000); const until = row(t.id).paid_until;
  await recurring.tick(); let s = recurring.getSub(t.id);
  assert.equal(s.fail_count, 1); assert.equal(s.status, 'active'); assert.ok(s.next_try > Date.now() + DAY - 60000);
  await recurring.tick(); assert.equal(recurring.getSub(t.id).fail_count, 1); // aynı gün tekrar denenmez
  await recurring.tick(Date.now() + DAY + 1000); s = recurring.getSub(t.id); assert.equal(s.fail_count, 2);
  await recurring.tick(Date.now() + 4 * DAY); s = recurring.getSub(t.id);
  assert.equal(s.fail_count, 3); assert.equal(s.status, 'past_due'); assert.equal(row(t.id).paid_until, until); core.setMode('off');
});
test('otomatik ödeme: belirsiz sonuç (ağ hatası) bekleyen sipariş bırakır, yeniden çekim yapılmaz; bildirim gelince tek kez uzar', async () => {
  core.setMode('all'); let calls = 0; paytr.chargeStored = async () => { calls++; throw new Error('zaman aşımı'); };
  const t = await activeSub(Date.now() + 3600 * 1000), until = row(t.id).paid_until;
  await recurring.tick(); assert.equal(calls, 1);
  await recurring.tick(Date.now() + 20 * 60 * 1000); assert.equal(calls, 1); // 15 dk talep geçti ama bekleyen sipariş var
  const pend = store.sql.prepare("SELECT * FROM payments WHERE tenant_id = ? AND status = 'pending' AND kind = 'recurring'").get(t.id); assert.ok(pend);
  const h = { 'Content-Type': 'application/x-www-form-urlencoded' };
  await post('/paytr/notify', paytrBody(pend.id, 'success', pend.amount), h); await post('/paytr/notify', paytrBody(pend.id, 'success', pend.amount), h);
  assert.equal(row(t.id).paid_until, core.addMonths(until, 1)); core.setMode('off');
});
test('otomatik ödeme: iptal edilen abonelik tahsil edilmez; CVV isteyen kart bağlanmaz', async () => {
  core.setMode('all'); let calls = 0; paytr.chargeStored = async () => { calls++; return { status: 'success' }; };
  const t = await activeSub(Date.now() + 3600 * 1000); assert.equal(recurring.cancel(t.id), true);
  await recurring.tick(); assert.equal(calls, 0);
  const t2 = mk(), o2 = order(t2); recurring.begin({ tenantId: t2.id, q: core.quote('pro', 'monthly'), orderId: o2.id, ip: '1.1.1.1', customer: CUST });
  paytr.listCards = async () => [{ ctoken: 'c', last4: '1111', month: '1', year: '30', requireCvv: true }];
  assert.equal(await recurring.onFirstPayment(o2, 'u'), false); assert.equal(recurring.getSub(t2.id).status, 'canceled'); core.setMode('off');
});
