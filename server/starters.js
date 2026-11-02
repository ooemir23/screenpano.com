// Başlangıç paketleri: işletme türüne göre ekran düzeni + renk teması + örnek fiyat listesi.
// Kayıtta ya da panelden (Tasarım → Düzen) seçilir. Fiyatlar BİLEREK boştur: gerçek fiyatı işletme girer,
// uydurma fiyat müşterilere gösterilmesin (Fiyat Etiketi Yönetmeliği).
const c = (name, en, items) => ({ name, t: { en }, items: items.map(([n, e, d]) => ({ name: n, price: '', desc: d || '', t: { en: { name: e, desc: '' } } })) });

const STARTERS = {
  kafe: {
    name: 'Kafe / kahveci', desc: 'Medya, yanda fiyat tarifesi, saat ve hava. Sıcak sıcak kahve renkleri.',
    layout: 'kahve', theme: 'kahve',
    menu: { title: 'Menü', categories: [
      c('Sıcak İçecekler', 'Hot Drinks', [['Türk Kahvesi', 'Turkish Coffee'], ['Filtre Kahve', 'Filter Coffee'], ['Latte', 'Latte'], ['Cappuccino', 'Cappuccino'], ['Çay', 'Tea']]),
      c('Soğuk İçecekler', 'Cold Drinks', [['Ice Latte', 'Iced Latte'], ['Limonata', 'Lemonade'], ['Soğuk Çay', 'Iced Tea']]),
      c('Tatlılar', 'Desserts', [['Cheesecake', 'Cheesecake'], ['Brownie', 'Brownie'], ['Sufle', 'Soufflé']]),
    ] },
  },
  spor: {
    name: 'Spor barı', desc: 'Büyük medya, sağda maçlar ve kurlar, altta yorumlar ve kayan bant. Canlı skor için.',
    layout: 'spor', theme: 'spor',
    menu: { title: 'Menü', categories: [
      c('İçecekler', 'Drinks', [['Kola', 'Cola'], ['Ayran', 'Ayran'], ['Soda', 'Soda'], ['Su', 'Water']]),
      c('Atıştırmalıklar', 'Snacks', [['Nachos', 'Nachos'], ['Soğan Halkası', 'Onion Rings'], ['Kanat', 'Wings'], ['Patates Kızartması', 'French Fries']]),
      c('Maç Menüleri', 'Match Menus', [['Maç Menüsü', 'Match Menu', 'İçecek ve atıştırmalık']]),
    ] },
  },
  restoran: {
    name: 'Restoran', desc: 'Büyük fiyat listesi, logo ve QR menü. Koyu bordo renkler.',
    layout: 'vitrin', theme: 'bordo',
    menu: { title: 'Menü', categories: [
      c('Başlangıçlar', 'Starters', [['Çorba', 'Soup'], ['Mevsim Salata', 'Seasonal Salad'], ['Humus', 'Hummus']]),
      c('Ana Yemekler', 'Main Courses', [['Izgara Köfte', 'Grilled Meatballs'], ['Tavuk Şiş', 'Chicken Skewers'], ['Makarna', 'Pasta']]),
      c('Tatlılar', 'Desserts', [['Künefe', 'Kunafa'], ['Sütlaç', 'Rice Pudding']]),
      c('İçecekler', 'Drinks', [['Ayran', 'Ayran'], ['Gazlı İçecek', 'Soft Drink'], ['Su', 'Water']]),
    ] },
  },
  lounge: {
    name: 'Bar / lounge', desc: 'Medya ve fiyat listesi, mor neon renkler. Akşam mekânları için.',
    layout: 'kahve', theme: 'gece',
    menu: { title: 'Menü', categories: [
      c('Kokteyller', 'Cocktails', [['Mojito', 'Mojito'], ['Margarita', 'Margarita'], ['Long Island', 'Long Island']]),
      c('Alkolsüz', 'Non-alcoholic', [['Limonata', 'Lemonade'], ['Soda', 'Soda'], ['Gazlı İçecek', 'Soft Drink']]),
      c('Atıştırmalıklar', 'Snacks', [['Karışık Tabak', 'Mixed Platter'], ['Patates Kızartması', 'French Fries']]),
    ] },
  },
  vitrin: {
    name: 'Vitrin / giriş ekranı', desc: 'Kapı önü ekranı: büyük fiyat listesi, logo, saat ve QR. Siyah altın.',
    layout: 'vitrin', theme: 'altin',
    menu: { title: 'Fiyat Listesi', categories: [c('Ürünler', 'Products', [['Ürün 1', 'Product 1'], ['Ürün 2', 'Product 2'], ['Ürün 3', 'Product 3']])] },
  },
  bos: {
    name: 'Boş başlangıç', desc: 'Yalnızca sade düzen. Her şeyi kendiniz kurarsınız.',
    layout: 'temel', theme: 'kahve', menu: null,
  },
};

const W = require('./widgets');
const list = () => Object.entries(STARTERS).map(([k, v]) => ({ key: k, name: v.name, desc: v.desc, theme: W.THEMES[v.theme], widgets: W.TEMPLATES[v.layout].widgets, menu: !!v.menu }));
const clone = o => JSON.parse(JSON.stringify(o));

// Paketin içeriğini bir işletme dokümanına ve ekran düzenine dönüştürür. pro=false ise Pro'ya özel kutular olmayan 'temel' düzen kullanılır.
function build(key, pro) {
  const s = STARTERS[key]; if (!s) return null;
  const { name, ...theme } = W.THEMES[s.theme];
  return {
    doc: { theme: W.cleanTheme(theme, {}), ...(s.menu ? { menu: { currency: '₺', ...clone(s.menu) } } : {}) },
    layout: W.cleanLayout(W.defaultLayout(pro ? s.layout : 'temel')),
  };
}
module.exports = { STARTERS, list, build };
