// Ödeme ayarları ortam değişkenlerinden okunur (anahtarlar veritabanına/koda yazılmaz).
// Her çağrıda okunur: testler ve yeniden yapılandırma için önbellek yok.
const config = require('../config');

function env() {
  const e = process.env, live = config.APP_ENV === 'live';
  return {
    // KDV oranı (%). Fiyatlar "KDV hariç" tutuluyorsa tahsilat tutarına eklenir.
    VAT: e.BILLING_VAT !== undefined && e.BILLING_VAT !== '' && Number.isFinite(Number(e.BILLING_VAT)) ? Number(e.BILLING_VAT) : 20,
    iyzico: {
      apiKey: e.IYZICO_API_KEY || '', secretKey: e.IYZICO_SECRET_KEY || '', merchantId: e.IYZICO_MERCHANT_ID || '',
      baseUrl: (e.IYZICO_BASE_URL || (live ? 'https://api.iyzipay.com' : 'https://sandbox-api.iyzipay.com')).replace(/\/+$/, ''),
    },
    paytr: {
      merchantId: e.PAYTR_MERCHANT_ID || '', key: e.PAYTR_MERCHANT_KEY || '', salt: e.PAYTR_MERCHANT_SALT || '',
      testMode: e.PAYTR_TEST_MODE === '1' || (e.PAYTR_TEST_MODE !== '0' && !live),
    },
  };
}
module.exports = { env };
