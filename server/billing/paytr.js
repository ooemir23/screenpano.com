// PayTR iFrame API: tek seferlik dönem ödemesi (aylık/yıllık). Otomatik yenileme yok: süre bitince işletme yeniden öder.
// Belirteç: base64(HMAC-SHA256(merchant_key, hash_str + merchant_salt)). Bildirim imzası:
// base64(HMAC-SHA256(merchant_key, merchant_oid + merchant_salt + status + total_amount)). Bildirime düz "OK" dönülmeli.
const crypto = require('crypto');
const { env } = require('./env');

const cfg = () => env().paytr;
const configured = () => { const c = cfg(); return !!(c.merchantId && c.key && c.salt); };
const b64hmac = (key, s) => crypto.createHmac('sha256', key).update(s).digest('base64');
const safeEq = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); };

async function initCheckout({ order, baseUrl, ip, customer, label }) {
  const c = cfg();
  const basket = Buffer.from(JSON.stringify([[label, (order.amount / 100).toFixed(2), 1]])).toString('base64');
  const noInst = '1', maxInst = '0', currency = 'TL', test = c.testMode ? '1' : '0';
  const hashStr = c.merchantId + ip + order.id + customer.email + String(order.amount) + basket + noInst + maxInst + currency + test;
  const body = new URLSearchParams({
    merchant_id: c.merchantId, user_ip: ip, merchant_oid: order.id, email: customer.email, payment_amount: String(order.amount),
    paytr_token: b64hmac(c.key, hashStr + c.salt), user_basket: basket, debug_on: c.testMode ? '1' : '0', no_installment: noInst, max_installment: maxInst,
    user_name: `${customer.name} ${customer.surname}`.trim(), user_address: `${customer.address} ${customer.city}`.trim(), user_phone: customer.gsm,
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
module.exports = { configured, initCheckout, verifyNotify, b64hmac };
