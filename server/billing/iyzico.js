// iyzico abonelik (otomatik yenileme). Kart verisi bizde durmaz: iyzico'nun barındırılan ödeme formu kullanılır.
// İstek imzası IYZWSv2: HMAC-SHA256(secretKey, rnd + uriYolu + gövde) hex → "apiKey:..&randomKey:..&signature:.." base64.
// Webhook imzası X-IYZ-SIGNATURE-V3 (abonelik biçimi): HMAC-SHA256(secretKey, merchantId + secretKey + eventType +
// subscriptionReferenceCode + orderReferenceCode + customerReferenceCode) hex. Dokümanda eventType/iyziEventType belirsiz → ikisi de denenir.
const crypto = require('crypto');
const store = require('../store');
const { env } = require('./env');

const cfg = () => env().iyzico;
const configured = () => { const c = cfg(); return !!(c.apiKey && c.secretKey); };
const hmacHex = (key, s) => crypto.createHmac('sha256', key).update(s).digest('hex');
const safeEq = (a, b) => { const x = Buffer.from(String(a || '').toLowerCase()), y = Buffer.from(String(b || '').toLowerCase()); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); };

function authHeaders(uriPath, bodyStr) {
  const c = cfg(), rnd = Date.now() + crypto.randomBytes(6).toString('hex');
  const auth = Buffer.from(`apiKey:${c.apiKey}&randomKey:${rnd}&signature:${hmacHex(c.secretKey, rnd + uriPath + bodyStr)}`).toString('base64');
  return { Authorization: 'IYZWSv2 ' + auth, 'x-iyzi-rnd': rnd, 'Content-Type': 'application/json', Accept: 'application/json' };
}
async function call(method, uri, body) {
  if (!configured()) throw new Error('iyzico yapılandırılmadı');
  const bodyStr = body ? JSON.stringify(body) : '';
  const res = await fetch(cfg().baseUrl + uri, { method, headers: authHeaders(uri.split('?')[0], bodyStr), body: bodyStr || undefined, signal: AbortSignal.timeout(20000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || String(j.status).toLowerCase() === 'failure') throw new Error('iyzico: ' + (j.errorMessage || j.errorCode || res.status));
  return j;
}

// Ürün ve plan iyzico'da bir kez açılır, referansları ayarda saklanır. Plan fiyatı sonradan değişmez (yalnız ad/deneme günü):
// tutar değişirse anahtar değişir ve yeni plan açılır; eski abonelikler eski fiyatla sürer.
async function ensurePlan(planKey, period, grossTL) {
  const key = `${planKey}:${period}:${grossTL}`;
  let map = {}; try { map = JSON.parse(store.setting('billing_iyzico_plans', '{}')) || {}; } catch { map = {}; }
  if (map[key]) return map[key];
  let product = store.setting('billing_iyzico_product', '');
  if (!product) {
    const r = await call('POST', '/v2/subscription/products', { name: 'ScreenPano', description: 'ScreenPano dijital ekran aboneliği' });
    product = r.data && r.data.referenceCode; if (!product) throw new Error('iyzico ürün referansı alınamadı');
    store.setSetting('billing_iyzico_product', product);
  }
  const r = await call('POST', `/v2/subscription/products/${encodeURIComponent(product)}/pricing-plans`, {
    name: `${planKey} ${period} ${grossTL} TL`, price: grossTL, currencyCode: 'TRY',
    paymentInterval: period === 'yearly' ? 'YEARLY' : 'MONTHLY', paymentIntervalCount: 1, trialPeriodDays: 0, planPaymentType: 'RECURRING',
  });
  const ref = r.data && r.data.referenceCode; if (!ref) throw new Error('iyzico plan referansı alınamadı');
  map[key] = ref; store.setSetting('billing_iyzico_plans', JSON.stringify(map));
  return ref;
}

async function initCheckout({ order, gross, callbackUrl, customer }) {
  const planRef = await ensurePlan(order.plan, order.period, gross);
  const r = await call('POST', '/v2/subscription/checkoutform/initialize', {
    locale: 'tr', conversationId: order.id, callbackUrl, pricingPlanReferenceCode: planRef, subscriptionInitialStatus: 'ACTIVE',
    customer: {
      name: customer.name, surname: customer.surname, email: customer.email, gsmNumber: customer.gsm, identityNumber: customer.identityNumber,
      billingAddress: { contactName: `${customer.name} ${customer.surname}`, city: customer.city, country: 'Turkey', address: customer.address },
    },
  });
  if (!r.token || !r.checkoutFormContent) throw new Error('iyzico ödeme formu alınamadı');
  return { token: r.token, html: r.checkoutFormContent };
}
// Dönüşte abonelik referansını al (kullanıcı sekmeyi kapatsa da sweep() ile yakalanır)
async function checkoutResult(token) {
  const r = await call('GET', `/v2/subscription/checkoutform/${encodeURIComponent(token)}`);
  const d = r.data || {};
  return { ref: d.referenceCode || '', status: d.subscriptionStatus || '' };
}
const cancel = ref => call('POST', `/v2/subscription/subscriptions/${encodeURIComponent(ref)}/cancel`, { subscriptionReferenceCode: ref });

function verifyWebhook(headerSig, p) {
  const c = cfg(); if (!c.secretKey || !c.merchantId || !p || typeof p !== 'object') return false;
  const base = [p.subscriptionReferenceCode, p.orderReferenceCode, p.customerReferenceCode].map(v => v || '').join('');
  return [p.iyziEventType, p.eventType].filter(Boolean).some(ev => safeEq(headerSig, hmacHex(c.secretKey, c.merchantId + c.secretKey + ev + base)));
}

module.exports = { configured, initCheckout, checkoutResult, cancel, verifyWebhook, hmacHex, safeEq };
