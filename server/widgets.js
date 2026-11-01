// Widget kataloğu, hazır düzen şablonları ve temalar. Panel bunu /api/admin/catalog'dan okur.
// Izgara 24 sütun x 24 satır; her widget {type, x, y, w, h, props}.
const COLS = 24, ROWS = 24;

const WIDGETS = {
  media:   { name: 'Medya oynatıcı', desc: 'Video ve fotoğraf döngüsü; kampanya, büyük maç ve fragmanlar da burada çıkar', pro: false, required: true, min: [8, 8] },
  logo:    { name: 'Logo', desc: 'İşletme logosu', pro: false, min: [3, 2] },
  clock:   { name: 'Saat ve tarih', desc: 'Büyük saat ve tarih', pro: false, min: [4, 3], props: { seconds: false } },
  rates:   { name: 'Hava ve piyasalar', desc: 'Hava durumu, döviz, altın, BIST, Bitcoin', pro: false, min: [5, 4], props: { weather: true, rates: true } },
  ticker:  { name: 'Kayan bant', desc: 'Skorlar, haberler, kurlar ve bilgiler kayar', pro: false, min: [10, 2], props: { clock: true } },
  text:    { name: 'Duyuru metni', desc: 'Başlık ve kısa metin', pro: false, min: [4, 2], props: { title: 'Hoş geldiniz', body: '', align: 'center', size: 'm' } },
  image:   { name: 'Görsel', desc: 'Sabit afiş veya fotoğraf', pro: false, min: [3, 3], props: { url: '', fit: 'cover' } },
  qr:      { name: 'QR kart', desc: 'QR kodlarınız sırayla döner (Wi-Fi, menü, Instagram)', pro: false, min: [4, 5] },
  info:    { name: 'Maçlar ve bilgi sayfaları', desc: 'Maçlar, puan durumu, nöbetçi eczane, haber, sinema, tarihte bugün, trafik', pro: true, min: [5, 8] },
  reviews: { name: 'Google yorumları', desc: 'Müşteri yorumları şeridi', pro: true, min: [8, 2] },
  menu:    { name: 'Fiyat tarifesi', desc: 'Kategori, ürün ve fiyat listesi (Fiyat Etiketi Yönetmeliği için)', pro: true, min: [5, 6], props: { title: 'Fiyat Listesi' } },
};

const W = (type, x, y, w, h, props) => ({ type, x, y, w, h, ...(props ? { props } : {}) });

const TEMPLATES = {
  spor: {
    name: 'Spor kafe (klasik)', desc: 'Büyük medya, sağda maçlar ve kurlar, altta yorumlar ve kayan bant',
    widgets: [W('media', 0, 0, 17, 19), W('reviews', 0, 19, 17, 3), W('logo', 17, 0, 7, 3), W('info', 17, 3, 7, 13), W('rates', 17, 16, 7, 6), W('ticker', 0, 22, 24, 2)],
  },
  kahve: {
    name: 'Kahveci / pastane', desc: 'Medya, yanda fiyat tarifesi, saat ve hava',
    widgets: [W('media', 0, 0, 16, 22), W('logo', 16, 0, 8, 3), W('menu', 16, 3, 8, 13), W('clock', 16, 16, 8, 6), W('ticker', 0, 22, 24, 2)],
  },
  vitrin: {
    name: 'Vitrin / fiyat tarifesi', desc: 'Giriş kapısı ekranı: büyük fiyat listesi, logo ve QR',
    widgets: [W('logo', 0, 0, 8, 4), W('clock', 16, 0, 8, 4), W('text', 8, 0, 8, 4, { title: 'Hoş geldiniz', body: '', align: 'center', size: 'm' }), W('menu', 0, 4, 16, 20), W('qr', 16, 4, 8, 10), W('rates', 16, 14, 8, 10)],
  },
  temel: {
    name: 'Temel', desc: 'Medya, logo, saat, hava ve kurlar, QR ve kayan bant (Başlangıç paketine uygun)',
    widgets: [W('media', 0, 0, 17, 22), W('logo', 17, 0, 7, 4), W('clock', 17, 4, 7, 5), W('rates', 17, 9, 7, 7), W('qr', 17, 16, 7, 6), W('ticker', 0, 22, 24, 2)],
  },
  sade: {
    name: 'Sade', desc: 'Tam ekran medya ve altta kayan bant',
    widgets: [W('media', 0, 0, 24, 22), W('ticker', 0, 22, 24, 2)],
  },
};

const THEMES = {
  kahve:  { name: 'Koyu Kahve', bg: '#151717', accent: '#906538', accent2: '#c9955c', text: '#fbfbfb', font: 'Montserrat' },
  spor:   { name: 'Spor Bar', bg: '#0e1420', accent: '#1f6f43', accent2: '#3ecf7a', text: '#f5f7fa', font: 'Montserrat' },
  gece:   { name: 'Neon Lounge', bg: '#120d1c', accent: '#6b2fb3', accent2: '#c77dff', text: '#f6f0ff', font: 'Montserrat' },
  bordo:  { name: 'Bordo', bg: '#160e10', accent: '#7a1f2b', accent2: '#d0606d', text: '#fbf6f4', font: 'Montserrat' },
  deniz:  { name: 'Deniz', bg: '#0b1519', accent: '#1d5f73', accent2: '#4fb3cf', text: '#f2fafc', font: 'Montserrat' },
  altin:  { name: 'Siyah Altın', bg: '#0c0c0c', accent: '#8a6d1f', accent2: '#e2bd52', text: '#fffaf0', font: 'Montserrat' },
};
const FONTS = ['Montserrat', 'Poppins', 'Oswald', 'Nunito', 'Playfair Display', 'Roboto Condensed'];

const DEFAULT_TEMPLATE = 'spor';
const defaultLayout = (tpl = DEFAULT_TEMPLATE) => ({ cols: COLS, rows: ROWS, widgets: JSON.parse(JSON.stringify((TEMPLATES[tpl] || TEMPLATES[DEFAULT_TEMPLATE]).widgets)) });

// Panelden gelen düzeni doğrula: bilinmeyen tür, taşan kutu, tekrar eden widget ayıklanır
const HEX = /^#[0-9a-f]{6}$/i;
function cleanLayout(l) {
  const seen = new Set(), out = [];
  for (const w of (l && Array.isArray(l.widgets) ? l.widgets : []).slice(0, 20)) {
    if (!w || !WIDGETS[w.type] || seen.has(w.type)) continue;
    const n = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
    const x = n(w.x, 0, COLS - 1), y = n(w.y, 0, ROWS - 1);
    const item = { type: w.type, x, y, w: n(w.w, 1, COLS - x), h: n(w.h, 1, ROWS - y) };
    const def = WIDGETS[w.type].props;
    if (def) {
      const p = w.props || {}; item.props = {};
      for (const [k, dv] of Object.entries(def)) {
        if (typeof dv === 'boolean') item.props[k] = typeof p[k] === 'boolean' ? p[k] : dv;
        else item.props[k] = typeof p[k] === 'string' ? p[k].slice(0, k === 'body' ? 400 : 200) : dv;
      }
    }
    seen.add(w.type); out.push(item);
  }
  return { cols: COLS, rows: ROWS, widgets: out };
}
function cleanTheme(t, cur = {}) {
  const o = { ...THEMES.kahve, ...cur };
  delete o.name;
  for (const k of ['bg', 'accent', 'accent2', 'text']) if (HEX.test(t && t[k] || '')) o[k] = t[k];
  if (t && FONTS.includes(t.font)) o.font = t.font;
  if (t && typeof t.plate === 'boolean') o.plate = t.plate; // koyu logolar için açık zemin
  return o;
}

module.exports = { COLS, ROWS, WIDGETS, TEMPLATES, THEMES, FONTS, defaultLayout, cleanLayout, cleanTheme };
