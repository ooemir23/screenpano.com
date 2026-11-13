// Ödeme altyapısı: tutar hesabı, kapı (mod), olayın tek seferlik işlenmesi, imza doğrulama, tutar uyuşmazlığı, ödeme sayfası.
const { mkdtempSync, rmSync } = require('fs');
const { tmpdir } = require('os');
const path = require('path');
const crypto = require('crypto');

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'sp-bill-'));
process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
process.env.APP_ENV = 'test';
Object.assign(process.env, { PAYTR_MERCHANT_ID: '12345', PAYTR_MERCHANT_KEY: 'kkk-key', PAYTR_MERCHANT_SALT: 'sss-salt', IYZICO_API_KEY: 'api', IYZICO_SECRET_KEY: 'sec-key', IYZICO_MERCHANT_ID: 'mid-1' });

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
