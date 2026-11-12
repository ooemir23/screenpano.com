// Fiyatlandırma: süper yönetimden değiştirilir, tek yerde saklanır (ayar anahtarı "pricing", JSON).
// Site (paket kartları, karşılaştırma), işletme paneli (Paketler kartı) ve ek şube ücreti buradan okur.
// Kalemler: Başlangıç, Pro, ek TV kutusu, ek şube; her biri aylık ve yıllık. Tutarlar tam sayı (kuruş yok).
// Boş (0) aylık fiyat sitede "Fiyat için bize ulaşın" olarak görünür. Yıllık boşsa yıllık satırı çıkmaz.
const store = require('./store');

const KEY = 'pricing';
const ITEMS = ['baslangic', 'pro', 'extraBox', 'extraBranch'];
const CURRENCIES = { TRY: '₺', USD: '$', EUR: '€' };
const LOCALE = { tr: 'tr-TR', en: 'en-GB', de: 'de-DE', ar: 'ar-u-nu-latn' };

const amount = v => {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.min(Math.round(v), 10000000) : 0;
  if (/^\s*-/.test(String(v ?? ''))) return 0; // eksi tutar yok
  const n = Math.round(Number(String(v ?? '').replace(/[^\d.,]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10000000) : 0;
};

// Eski ayarlar (serbest metin site_price_* ve fee_extra_branch) ilk okumada yeni yapıya taşınır
function legacy() {
  const fee = amount(store.setting('fee_extra_branch', ''));
  return {
    currency: 'TRY', vat: 'excl', annualNote: '',
    baslangic: { monthly: amount(store.setting('site_price_baslangic', '')), yearly: 0 },
    pro: { monthly: amount(store.setting('site_price_pro', '')), yearly: 0 },
    extraBox: { monthly: 0, yearly: 0 },
    extraBranch: { monthly: fee, yearly: 0 },
  };
}

function clean(b) {
  const src = b && typeof b === 'object' ? b : {};
  const out = {
    currency: CURRENCIES[src.currency] ? src.currency : 'TRY',
    vat: src.vat === 'incl' ? 'incl' : 'excl',
    annualNote: String(src.annualNote || '').trim().slice(0, 60), // ör. "2 ay hediye"; boşsa yıllık indirim otomatik hesaplanır
  };
  for (const k of ITEMS) {
    const x = src[k] && typeof src[k] === 'object' ? src[k] : {};
    out[k] = { monthly: amount(x.monthly), yearly: amount(x.yearly) };
  }
  return out;
}

function get() {
  const raw = store.setting(KEY, '');
  if (raw) { try { return clean(JSON.parse(raw)); } catch (e) { /* bozuk kayıt: eski ayarlara düş */ } }
  return clean(legacy());
}
function set(b) { const p = clean(b); store.setSetting(KEY, JSON.stringify(p)); return p; }

const sym = p => CURRENCIES[p.currency] || '₺';
function fmt(n, p, lang = 'tr') {
  if (!n) return '';
  const s = n.toLocaleString(LOCALE[lang] || 'tr-TR');
  return p.currency === 'TRY' ? `${s} ${sym(p)}` : `${sym(p)}${s}`;
}
// Yıllık ödemede kaç aylık bedel kazanılır (ör. 12 × 2000 − 20000 = 4000 → 2 ay)
function monthsFree(x) {
  if (!x.monthly || !x.yearly) return 0;
  const m = (x.monthly * 12 - x.yearly) / x.monthly;
  return m >= 0.5 ? Math.round(m * 2) / 2 : 0;
}
// Ek şube ücreti (aylık): şube açarken ücret kaydı için. Ayar yoksa 500 (şube ücretsiz açılmasın).
const extraBranchFee = () => get().extraBranch.monthly || amount(store.setting('fee_extra_branch', '')) || 500;

module.exports = { ITEMS, CURRENCIES, get, set, clean, fmt, monthsFree, extraBranchFee };
