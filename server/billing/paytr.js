// PayTR iFrame API: tek seferlik dönem ödemesi (aylık/yıllık). Otomatik yenileme yok: süre bitince işletme yeniden öder.
// Belirteç: base64(HMAC-SHA256(merchant_key, hash_str + merchant_salt)). Bildirim imzası:
// base64(HMAC-SHA256(merchant_key, merchant_oid + merchant_salt + status + total_amount)). Bildirime düz "OK" dönülmeli.
const crypto = require('crypto');
const { env } = require('./env');

const cfg = () => env().paytr;
const configured = () => { const c = cfg(); return !!(c.merchantId && c.key && c.salt); };
const b64hmac = (key, s) => crypto.createHmac('sha256', key).update(s).digest('base64');
const safeEq = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); };

async function initCheckout({ order, baseUrl, ip, customer, label, storeCard = false, utoken = '' }) {
  const c = cfg();
  const basket = Buffer.from(JSON.stringify([[label, (order.amount / 100).toFixed(2), 1]])).toString('base64');
  const noInst = '1', maxInst = '0', currency = 'TL', test = c.testMode ? '1' : '0';
  const hashStr = c.merchantId + ip + order.id + customer.email + String(order.amount) + basket + noInst + maxInst + currency + test;
  const body = new URLSearchParams({
    merchant_id: c.merchantId, user_ip: ip, merchant_oid: order.id, email: customer.email, payment_amount: String(order.amount),
    paytr_token: b64hmac(c.key, hashStr + c.salt), user_basket: basket, debug_on: c.testMode ? '1' : '0', no_installment: noInst, max_installment: maxInst,
    user_name: `${customer.name} ${customer.surname}`.trim(), user_address: `${customer.address} ${customer.city}`.trim(), user_phone: customer.gsm,
    ...(storeCard ? { store_card: '1', ...(utoken ? { utoken } : {}) } : {}), // kart saklama alanları imzaya girmez (PayTR örnekleri)
    merchant_ok_url: baseUrl + '/panel?odeme=ok', merchant_fail_url: baseUrl + '/panel?odeme=hata', timeout_limit: '30', currency, test_mode: test, lang: 'tr',
  });
  const res = await fetch('https://www.paytr.com/odeme/api/get-token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(20000) });
  const j = await res.json().catch(() => ({}));
  if (j.status !== 'success' || !j.token) throw new Error('PayTR: ' + (j.reason || res.status));
  return { token: j.token };
}
function verifyNotify(p) {
  const c = cfg(); if (!c.key || !c.salt || !p) return false;
  return safeEq(p.hash, b64hmac(c.key, String(p.merchant_oid || '') + c.salt + String(p.status || '') + String(p.total_amount || '')));
}

// ---- Kart saklama: kayıtlı kartlar (utoken → ctoken) ve kayıtlı karttan tekrarlayan ödeme ----
// Önkoşul: PayTR'den "Kart Saklama" ve "Non3D" izinleri istenmiş olmalı (mağaza paneli / destek).
async function listCards(utoken) {
  const c = cfg();
  const res = await fetch('https://www.paytr.com/odeme/capi/list', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(20000),
    body: new URLSearchParams({ merchant_id: c.merchantId, utoken, paytr_token: b64hmac(c.key, utoken + c.salt) }),
  });
  const j = await res.json().catch(() => null);
  if (!j || j.status === 'error') throw new Error('PayTR kart listesi: ' + ((j && j.err_msg) || res.status));
  // Yanıt tek kart nesnesi ya da kart dizisi olabilir; en yeni (son) kart alınır
  const list = Array.isArray(j) ? j : (j.ctoken ? [j] : Object.values(j).filter(x => x && typeof x === 'object' && x.ctoken));
  return list.filter(x => x && x.ctoken).map(x => ({ ctoken: String(x.ctoken), last4: String(x.last_4 || ''), month: String(x.month || ''), year: String(x.year || ''), bank: String(x.c_bank || ''), requireCvv: String(x.require_cvv) === '1' }));
}
// Sunucudan tetiklenen aylık tahsilat (kullanıcı yok, 3D yok). Yanıt: success | wait_callback | failed (+try_again)
async function chargeStored({ order, ip, customer, utoken, ctoken, label }) {
  const c = cfg();
  const amount = (order.amount / 100).toFixed(2), test = c.testMode ? '1' : '0', basket = Buffer.from(JSON.stringify([[label, amount, 1]])).toString('base64');
  const hashStr = c.merchantId + ip + order.id + customer.email + amount + 'card' + '0' + 'TL' + test + '1';
  const res = await fetch('https://www.paytr.com/odeme', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(30000),
    body: new URLSearchParams({
      merchant_id: c.merchantId, user_ip: ip, merchant_oid: order.id, email: customer.email, payment_amount: amount, payment_type: 'card', installment_count: '0',
      currency: 'TL', test_mode: test, non_3d: '1', recurring_payment: '1', paytr_token: b64hmac(c.key, hashStr + c.salt), utoken, ctoken,
      user_name: `${customer.name} ${customer.surname}`.trim(), user_address: `${customer.address} ${customer.city}`.trim(), user_phone: customer.gsm, user_basket: basket,
      merchant_ok_url: require('../config').BASE_URL + '/panel?odeme=ok', merchant_fail_url: require('../config').BASE_URL + '/panel?odeme=hata', client_lang: 'tr', debug_on: c.testMode ? '1' : '0',
    }),
  });
  const j = await res.json().catch(() => null);
  if (!j || !j.status) throw new Error('PayTR yanıtı anlaşılamadı (' + res.status + ')'); // belirsiz: tahsil edilmiş olabilir, çağıran bekleyen sipariş bırakır
  return { status: String(j.status), tryAgain: j.try_again === true || String(j.try_again) === 'true', reason: String(j.reason || j.err_msg || '') };
}
const recurringEnabled = () => process.env.PAYTR_RECURRING === '1' && configured();
module.exports = { configured, initCheckout, verifyNotify, b64hmac, listCards, chargeStored, recurringEnabled };
