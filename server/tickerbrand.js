// Kayan panonun en altındaki marka yazısı (örn. www.screenpano.com). Yalnız süper yönetim ayarlar.
const store = require('./store');
const KEY = 'ticker_brand';
const ALIGN = ['left', 'center', 'right'];
const clean = b => {
  b = b || {};
  return { text: String(b.text == null ? '' : b.text).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60), align: ALIGN.includes(b.align) ? b.align : 'center' };
};
function get() { try { return clean(JSON.parse(store.setting(KEY, '{}'))); } catch { return clean({}); }
}
function set(b) { const p = clean(b); store.setSetting(KEY, JSON.stringify(p)); return p; }
module.exports = { get, set, clean };
