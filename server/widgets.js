// Widget kataloğu, hazır düzen şablonları ve temalar. Panel bunu /api/admin/catalog'dan okur.
// Izgara 24 sütun x 24 satır; her widget {type, x, y, w, h, props}.
const COLS = 24, ROWS = 24;

const WIDGETS = {
  media:   { name: 'Medya oynatıcı', desc: 'Video ve fotoğraf döngüsü; kampanya, büyük maç ve fragmanlar da burada çıkar', pro: false, required: true, min: [8, 8], props: { fit: 'auto' } },
  logo:    { name: 'Logo', desc: 'İşletme logosu; kutuya sığdırma, hizalama ve iç boşluk ayarlanır', pro: false, min: [3, 2], props: { fit: 'contain', align: 'center', pad: 'none' }, enums: { fit: ['contain', 'cover', 'fill'], align: ['left', 'center', 'right'], pad: ['none', 'sm', 'lg'] } },
  clock:   { name: 'Saat ve tarih', desc: 'Saat, tarih ya da ikisi birden; her kutuda ayrı gösterim seçilir (birden çok eklenebilir)', pro: false, min: [2, 1], multi: 4, props: { seconds: false, show: 'both' }, enums: { show: ['both', 'time', 'date'] } },
  rates:   { name: 'Hava ve piyasalar', desc: 'Hava durumu, döviz, altın, BIST, Bitcoin ve istenirse QR kodlar; hava ve piyasa ayrı kutulara konabilir (birden çok eklenebilir)', pro: false, min: [3, 2], multi: 3, props: { weather: true, rates: true, qr: false, qrs: '' } },
  ticker:  { name: 'Kayan bant', desc: 'Skorlar, haberler, kurlar ve bilgiler kayar', pro: false, min: [10, 2], props: { clock: true } },
  text:    { name: 'Duyuru metni', desc: 'Başlık ve kısa metin', pro: false, min: [4, 2], props: { title: 'Hoş geldiniz', body: '', align: 'center', size: 'm' } },
  image:   { name: 'Görsel', desc: 'Sabit afiş veya fotoğraf', pro: false, min: [3, 3], props: { url: '', fit: 'cover' } },
  qr:      { name: 'QR kart', desc: 'Seçtiğiniz QR kodu ya da tüm QR kodlarınızı sırayla gösterir; birden çok eklenebilir ve diğer kutuların üstüne konabilir', pro: false, min: [2, 3], multi: 6, props: { qr: '', style: 'below', size: 'auto', text: 'm', look: 'classic' }, enums: { look: ['classic', 'card', 'soft'], style: ['below', 'right', 'left', 'plain'], size: ['xs', 's', 'auto', 'l', 'xl', 'box'], text: ['s', 'm', 'l'] } },
  info:    { name: 'Maçlar ve bilgi sayfaları', desc: 'Maçlar, puan durumu, nöbetçi eczane, haber, sinema, tarihte bugün, trafik', pro: true, min: [5, 8] },
  reviews: { name: 'Google yorumları', desc: 'Müşteri yorumları şeridi', pro: true, min: [8, 2] },
  menu:    { name: 'Fiyat tarifesi', desc: 'Kategori, ürün ve fiyat listesi (Fiyat Etiketi Yönetmeliği için)', pro: true, min: [5, 6], props: { title: 'Fiyat Listesi' } },
  music:   { name: 'Müzik', desc: 'Spotify / YouTube Müzik: şarkı değişince kapak ve ad açılır, birkaç saniye sonra yalnız kapak görseline küçülür', pro: false, min: [3, 3] },
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
  lounge: {
    name: 'Lüks lounge (cam)', desc: 'Üstte logo ve saat, solda geniş medya, sağda maçlar ile hava/kurlar ve QR, altta kayan bant',
    widgets: [W('logo', 0, 0, 8, 3), W('clock', 17, 0, 7, 3), W('media', 0, 3, 16, 19), W('info', 16, 3, 8, 9), W('rates', 16, 12, 8, 6), W('qr', 16, 18, 8, 4), W('ticker', 0, 22, 24, 2)],
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
  obsidyen: { name: 'Obsidiyen Altın (cam)', bg: '#07090d', accent: '#be9322', accent2: '#ecd067', text: '#f8fafc', font: 'Plus Jakarta Sans', glass: true },
  altin:  { name: 'Siyah Altın', bg: '#0c0c0c', accent: '#8a6d1f', accent2: '#e2bd52', text: '#fffaf0', font: 'Montserrat' },
};
const FONTS = ['Montserrat', 'Plus Jakarta Sans', 'Poppins', 'Oswald', 'Nunito', 'Playfair Display', 'Roboto Condensed'];

const DEFAULT_TEMPLATE = 'spor';
const defaultLayout = (tpl = DEFAULT_TEMPLATE) => ({ cols: COLS, rows: ROWS, widgets: JSON.parse(JSON.stringify((TEMPLATES[tpl] || TEMPLATES[DEFAULT_TEMPLATE]).widgets)) });

// Panelden gelen düzeni doğrula: bilinmeyen tür, taşan kutu, tekrar eden widget ayıklanır (QR kartı en çok 6 kez olabilir)
const HEX = /^#[0-9a-f]{6}$/i;
const BOXES = ['accent', 'glass', 'dark', 'outline', 'none']; // kutu stili: tema geneli + widget başına
function cleanLayout(l) {
  const FC = l && Number(l.cols) === 48 ? 48 : COLS; // 48 = ince ızgara (koordinatlar iki katı hassas)
  const seen = new Set(), count = {}, out = [];
  for (const w of (l && Array.isArray(l.widgets) ? l.widgets : []).slice(0, 20)) {
    if (!w || !WIDGETS[w.type] || seen.has(w.type)) continue;
    if ((count[w.type] = (count[w.type] || 0) + 1) > (WIDGETS[w.type].multi || 1)) continue;
    const n = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
    const x = n(w.x, 0, FC - 1), y = n(w.y, 0, FC - 1);
    const item = { type: w.type, x, y, w: n(w.w, 1, FC - x), h: n(w.h, 1, FC - y) };
    const def = WIDGETS[w.type].props;
    if (def) {
      const p = w.props || {}; item.props = {};
      for (const [k, dv] of Object.entries(def)) {
        if (typeof dv === 'boolean') item.props[k] = typeof p[k] === 'boolean' ? p[k] : dv;
        else {
          const en = WIDGETS[w.type].enums && WIDGETS[w.type].enums[k];
          item.props[k] = typeof p[k] === 'string' && (!en || en.includes(p[k])) ? p[k].slice(0, k === 'body' ? 400 : 200) : dv;
        }
      }
      // çeviriler: { en: { title, body } }
      if (p.i18n && typeof p.i18n === 'object') {
        const tr = {};
        for (const [l, v] of Object.entries(p.i18n)) if (/^(en|de|ru|ar|fr|es)$/.test(l) && v && typeof v === 'object') {
          const o = {}; for (const k of ['title', 'body']) if (typeof v[k] === 'string' && v[k].trim()) o[k] = v[k].slice(0, k === 'body' ? 400 : 200);
          if (Object.keys(o).length) tr[l] = o;
        }
        if (Object.keys(tr).length) item.props.i18n = tr;
      }
    }
    // kutu görünümü (her widget için): boş = tema stili; renk (tint) boşsa tema vurgu rengi
    if (w.type !== 'media' && w.props && typeof w.props === 'object') {
      const bx = BOXES.includes(w.props.box) ? w.props.box : '', tn = HEX.test(w.props.tint || '') ? w.props.tint : '';
      if (bx || tn) { item.props = item.props || {}; if (bx) item.props.box = bx; if (tn) item.props.tint = tn; }
    }
    if (!WIDGETS[w.type].multi) seen.add(w.type);
    out.push(item);
  }
  return { cols: FC, rows: FC, widgets: out };
}
function cleanTheme(t, cur = {}) {
  const o = { ...THEMES.kahve, ...cur };
  delete o.name;
  for (const k of ['bg', 'accent', 'accent2', 'text']) if (HEX.test(t && t[k] || '')) o[k] = t[k];
  if (t && FONTS.includes(t.font)) o.font = t.font;
  if (t && typeof t.plate === 'boolean') o.plate = t.plate; // koyu logolar için açık zemin
  if (t && BOXES.includes(t.box)) o.box = t.box; // tüm widget kutularının ortak stili
  else if (t && typeof t.glass === 'boolean') o.box = t.glass ? 'glass' : 'accent'; // eski kayıtlar
  if (o.box === undefined && o.glass) o.box = 'glass';
  o.glass = o.box === 'glass'; // cam kart stili (yarı saydam koyu kartlar, ince çerçeve)
  return o;
}

module.exports = { COLS, ROWS, WIDGETS, TEMPLATES, THEMES, FONTS, defaultLayout, cleanLayout, cleanTheme };
