// Tanıtım sitesi (/): public/site.html şablonu + public/site/features.json.
// Özellik gezgini, "ve dahası" kartları ve paket karşılaştırma tablosu features.json ve plans.js'ten çizilir;
// uygulamaya özellik eklenince yalnız features.json'a kayıt eklemek yeter. Fiyat ve iletişim süper yönetimden gelir.
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { PLANS } = require('./plans');

const TPL = path.join(config.PUBLIC_DIR, 'site.html');
const DATA = path.join(config.PUBLIC_DIR, 'site', 'features.json');
const NEW_DAYS = 60;

const e = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// dosyalar değişince kendiliğinden yeniden okunur (sunucuyu yeniden başlatmak gerekmez)
const cache = {};
function read(file, parse) {
  const m = fs.statSync(file).mtimeMs, c = cache[file];
  if (c && c.m === m) return c.v;
  const raw = fs.readFileSync(file, 'utf8'), v = parse ? JSON.parse(raw) : raw;
  cache[file] = { m, v }; return v;
}

// görsel adı -> boyut (önekten): tv-* 16:9, p-* panel masaüstü, m-* telefon
function img(name, alt, cls = 'zoom') {
  const [w, h] = name === 'tv-eslestir' ? [1200, 675] : name.startsWith('tv-') ? [1600, 900] : name.startsWith('m-') ? [780, 1688] : [1440, 900];
  return `<img class="${cls}" src="/site/${e(name)}.webp" width="${w}" height="${h}" alt="${e(alt)}" loading="lazy" decoding="async">`;
}

const SCHEDULE = [
  ['Serpme Kahvaltı', 'Cmt–Paz · 09:00–13:00', 3, 7, ''], ['Günün Menüsü', 'Hafta içi · 12:00–15:00', 6, 9, ''],
  ['Happy Hour', 'Her gün · 17:00–19:00', 11, 13, 'c2'], ['Canlı Müzik', 'Cuma · 21:00–24:00', 15, 18, 'c3'],
  ['Kokteyl listesi', 'Her gün · 18:00 sonrası', 12, 18, 'c2'], ['Fıstıklı Latte', 'Her zaman', 0, 18, 'c4'],
];
function visual(f) {
  const v = f.visual || {}, t = f.title;
  const phone = v.phone ? `<div class="phone side">${img(v.phone, t + ' (telefonda panel)')}</div>` : '';
  const tv = inner => `<div class="tvf flat"><div class="bezel"><div class="scr${inner ? ' poster' : ''}"${inner ? ' data-poster' : ''}>${inner ? '' : img(v.img, t)}</div></div></div>`;
  if (v.type === 'poster') return `<div class="fx-v has-phone">${tv(true)}${phone}</div>`;
  if (v.type === 'schedule') return `<div class="fx-v"><div class="sched" aria-label="Örnek zamanlama"><div class="sc-h"><span></span><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>21</span><span>24</span></div>${
    SCHEDULE.map(([n, s, a, b, c]) => `<div class="sc-r"><b>${n}<small>${s}</small></b><div class="sc-t"><i${c ? ` class="${c}"` : ''} style="--s:${a};--e:${b}"></i></div></div>`).join('')}</div></div>`;
  if (v.type === 'win') return `<div class="fx-v${phone ? ' has-phone' : ''}"><div class="win">${img(v.img, t)}</div>${phone}</div>`;
  const win = v.win ? `<div class="win under">${img(v.win, t + ' (panel)')}</div>` : '';
  return `<div class="fx-v${phone ? ' has-phone' : ''}">${tv(false)}${phone}${win}</div>`;
}

const isNew = f => f.added && (Date.now() - Date.parse(f.added)) / 864e5 < NEW_DAYS;
const badges = f => (isNew(f) ? '<span class="nb">Yeni</span>' : '') + (f.plan === 'pro' ? '<span class="pb">PRO</span>' : '');

function features(data) {
  const list = data.features.filter(f => !f.hidden && f.title);
  const nav = list.map((f, i) => `<button role="tab" id="fxt-${e(f.id)}" aria-controls="fx-${e(f.id)}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"><span class="i" aria-hidden="true">${f.icon || '•'}</span><span class="n">${e(f.short || f.title)}</span>${badges(f)}</button>`).join('');
  const panels = list.map((f, i) => `<article class="fx-p${i === 0 ? ' on' : ''}" role="tabpanel" id="fx-${e(f.id)}" aria-labelledby="fxt-${e(f.id)}">
  <div class="fx-t"><h3><span class="ic" aria-hidden="true">${f.icon || ''}</span>${e(f.title)} ${badges(f)}</h3><p>${e(f.text)}</p>${
    f.points ? `<ul class="pts">${f.points.map(p => `<li>${e(p)}</li>`).join('')}</ul>` : ''}${
    f.tags ? `<ul class="tags">${f.tags.map(p => `<li>${e(p)}</li>`).join('')}</ul>` : ''}</div>
  ${visual(f)}</article>`).join('\n');
  return `<div class="fx" id="fx"><div class="fx-nav" role="tablist" aria-label="Özellikler">${nav}</div><div class="fx-panels">${panels}</div>
  <div class="fx-step"><button class="fx-prev" aria-label="Önceki özellik">‹</button><span class="fx-c" aria-live="polite">1 / ${list.length}</span><button class="fx-next" aria-label="Sonraki özellik">›</button></div></div>`;
}

const extras = data => (data.extras || []).map(x => `<li><b>${x.icon || ''} ${e(x.title)}${isNew(x) ? ' <span class="nb">Yeni</span>' : ''}</b>${e(x.text)}</li>`).join('');

function compare(data) {
  const b = PLANS.baslangic, p = PLANS.pro, gb = mb => (mb >= 1024 ? Math.round(mb / 1024) + ' GB' : mb + ' MB');
  const row = (k, x, y) => `<tr><th scope="row">${e(k)}</th>${[x, y].map(v => v === true ? '<td class="y">Var</td>' : v === false ? '<td class="n">Yok</td>' : `<td>${e(v)}</td>`).join('')}</tr>`;
  return [
    row('TV kutusu', b.devices, p.devices), row('Medya alanı', gb(b.storageMB), gb(p.storageMB)), row('Kullanıcı', b.users, p.users),
    row('Şube', b.branches, b.branches === p.branches ? p.branches : `${p.branches}'a kadar`),
    ...data.features.filter(f => f.compare).map(f => row(f.compare, f.plan !== 'pro', true)),
    row('Ekranda ürün ibaresi', b.badge ? 'Köşede küçük' : 'Yok', p.badge ? 'Köşede küçük' : 'Yok'),
  ].join('');
}

function render(store, tenants, access) {
  const st = k => store.setting(k, '');
  const price = v => v ? e(v) : '<small>Fiyat için bize ulaşın</small>';
  const phone = st('site_phone'), wa = st('site_whatsapp').replace(/\D/g, ''), mail = st('site_email') || st('legal_email');
  const contact = [wa && `<a class="btn" href="https://wa.me/${wa}" rel="noopener">WhatsApp'tan yazın</a>`, phone && `<a class="btn ghost" href="tel:${e(phone.replace(/\s/g, ''))}">${e(phone)}</a>`, mail && `<a class="btn ghost" href="mailto:${e(mail)}">${e(mail)}</a>`].filter(Boolean).join('');
  const live = tenants.all().filter(t => access(t).ok).length;
  const data = read(DATA, true);
  const vals = {
    PRICE_BASLANGIC: price(st('site_price_baslangic')), PRICE_PRO: price(st('site_price_pro')), CONTACT: contact, YEAR: new Date().getFullYear(),
    LIVE: live >= 10 ? `${live} işletmede şu an yayında` : 'Kafe, restoran ve spor barlar için',
    FEATURES: features(data), EXTRAS: extras(data), COMPARE: compare(data),
    FEATURE_COUNT: data.features.filter(f => !f.hidden && f.title).length,
  };
  // görseller 30 gün önbellekte kalır; dosya değişince adresi de değişsin
  const ver = n => { try { return Math.round(fs.statSync(path.join(config.PUBLIC_DIR, 'site', n + '.webp')).mtimeMs / 1000).toString(36); } catch (er) { return '0'; } };
  return read(TPL).replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in vals ? vals[k] : m))
    .replace(/\/site\/([\w-]+)\.webp/g, (m, n) => `${m}?v=${ver(n)}`);
}

module.exports = { render };
