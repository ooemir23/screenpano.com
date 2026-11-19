// Ek abonelik (Tahmin Ligi) yetkisi ve Google Play abonelik durumunun yorumlanması
const { test } = require('node:test');
const assert = require('node:assert');
const os = require('os'), path = require('path'), fs = require('fs');
process.env.DATA_DIR = process.env.DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'addon-'));
const stub = (rel, exports) => { const p = require.resolve(rel); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
stub('../server/plans', { isUnlimited: t => !!(t.db && t.db.unlimited), plan: () => ({ pro: false }), access: () => ({ ok: true }) });
const A = require('../server/addons');

test('ek abonelik: kayıt yoksa kapalı, süreli kayıt süresince açık, süresiz kayıt açık, sınırsız işletmede hep açık', () => {
  const t = { db: {} };
  assert.equal(A.active(t, 'tahmin_ligi'), false);
  A.grant(t, 'tahmin_ligi', { until: Date.now() + 86400e3, source: 'play', ref: 'x' });
  assert.equal(A.active(t, 'tahmin_ligi'), true);
  t.db.addons.tahmin_ligi.until = Date.now() - 1; assert.equal(A.active(t, 'tahmin_ligi'), false);
  A.grant(t, 'tahmin_ligi', { until: null, source: 'admin', force: true }); assert.equal(A.active(t, 'tahmin_ligi'), true);
  assert.equal(A.active({ db: { unlimited: true } }, 'tahmin_ligi'), true);
  assert.equal(A.active(t, 'yok'), false);
  assert.equal(A.summary(t).tahmin_ligi.active, true);
});
test('elle verilen daha uzun süre Play yenilemesiyle kısalmaz; aynı kaynak kısaltabilir', () => {
  const t = { db: {} }, far = Date.now() + 365 * 86400e3, near = Date.now() + 30 * 86400e3;
  A.grant(t, 'tahmin_ligi', { until: far, source: 'admin', force: true });
  A.grant(t, 'tahmin_ligi', { until: near, source: 'play', ref: 'r' });
  assert.equal(t.db.addons.tahmin_ligi.until, far);
  A.grant(t, 'tahmin_ligi', { until: near, source: 'admin', force: true });
  assert.equal(t.db.addons.tahmin_ligi.until, near);
});
test('Google Play abonelik durumu: etkin / iptal (süre sonuna kadar) / süresi bitmiş / bilinmeyen ürün', () => {
  const P = require('../server/play');
  const sub = (state, ms, pid = 'tahmin_ligi') => ({ subscriptionState: state, acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING', externalAccountIdentifiers: { obfuscatedExternalAccountId: 'T1' }, lineItems: [{ productId: pid, expiryTime: new Date(Date.now() + ms).toISOString() }] });
  let v = P.readSub(sub('SUBSCRIPTION_STATE_ACTIVE', 86400e3));
  assert.equal(v.entitled, true); assert.equal(v.product, 'tahmin_ligi'); assert.equal(v.account, 'T1'); assert.equal(v.acked, false);
  assert.equal(P.readSub(sub('SUBSCRIPTION_STATE_CANCELED', 86400e3)).entitled, true, 'iptal edildi ama süresi var');
  assert.equal(P.readSub(sub('SUBSCRIPTION_STATE_EXPIRED', -1000)).entitled, false);
  assert.equal(P.readSub(sub('SUBSCRIPTION_STATE_ON_HOLD', 86400e3)).entitled, false, 'ödeme askıda');
  assert.equal(P.readSub(sub('SUBSCRIPTION_STATE_ACTIVE', 86400e3, 'baska')).product, '');
});

test('Play fiyatı: Türkçe/İngilizce yazımlar kuruşa doğru çevrilir, Google para nesnesi gidiş-dönüş bozulmaz', () => {
  const P = require('../server/play');
  for (const [v, k] of [['1199,99', 119999], ['1.199,99', 119999], ['1199.99', 119999], ['1,199.99', 119999], ['1.199', 119900], ['1000', 100000], [1199.99, 119999], ['999.999', 99999900], ['1.000.001', 0], ['1199,9', 119990]]) assert.equal(P._parseTry(v), k, String(v));
  for (const v of ['', '0', '-5', 'abc', '2000000']) assert.equal(P._parseTry(v), 0, v);
  assert.deepEqual(P._fromKurus(119999), { currencyCode: 'TRY', units: '1199', nanos: 990000000 });
  assert.equal(P._toKurus({ units: '1199', nanos: 990000000 }), 119999);
  assert.equal(P._toKurus(P._fromKurus(250000)), 250000);
});
