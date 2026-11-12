// Tanıtım sitesi: / (Türkçe), /en, /de, /ar. Şablon public/site.html; metinler public/site/i18n/<dil>.json;
// özellikler public/site/features.json (her kaydın "i18n" alanında çevirileri). Paket sınırları plans.js'ten,
// fiyat ve iletişim süper yönetimden gelir. Uygulamaya özellik eklenince features.json'a kayıt eklemek yeter;
// başka dilde eksik metin Türkçeye düşer. Dosyalar değişince sunucuyu yeniden başlatmak gerekmez.
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { PLANS } = require('./plans');

const TPL = path.join(config.PUBLIC_DIR, 'site.html');
const DATA = path.join(config.PUBLIC_DIR, 'site', 'features.json');
const I18N = l => path.join(config.PUBLIC_DIR, 'site', 'i18n', l + '.json');
const LANGS = ['tr', 'en', 'de', 'ar'];
const RTL = new Set(['ar']);
const BASE = 'https://screenpano.com';
const NEW_DAYS = 30; // D8: "Yeni" rozeti yalnız son 30 günde eklenenlerde
const PATH = l => (l === 'tr' ? '/' : `/${l}`);

const e = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const cache = {};
function read(file, parse) {
  const m = fs.statSync(file).mtimeMs, c = cache[file];
  if (c && c.m === m) return c.v;
  const raw = fs.readFileSync(file, 'utf8'), v = parse ? JSON.parse(raw) : raw;
  cache[file] = { m, v }; return v;
}
// dil sözlüğü: eksik anahtar Türkçeye düşer
// deneme süresi: metinlerde {trial} (sayı) ve {trialDays} (birimiyle) yer tutucuları kullanılır; süre config.TRIAL_DAYS'ten gelir
function trialText(lang, n) {
  if (lang === 'en') return n === 1 ? '1 day' : `${n} days`;
  if (lang === 'de') return n === 1 ? '1 Tag' : `${n} Tage`;
  if (lang === 'ar') return n === 1 ? 'يوم واحد' : n === 2 ? 'يومان' : n <= 10 ? `${n} أيام` : `${n} يومًا`;
  return `${n} gün`;
}
function dict(lang) {
  const tr = read(I18N('tr'), true), d = lang === 'tr' ? tr : read(I18N(lang), true);
  const n = config.TRIAL_DAYS;
  return k => {
    const v = d[k] !== undefined && d[k] !== null ? d[k] : tr[k] !== undefined ? tr[k] : k;
    const fill = x => typeof x === 'string' ? x.replace(/\{trialDays\}/g, trialText(lang, n)).replace(/\{trial\}/g, n) : Array.isArray(x) ? x.map(fill) : x;
    return fill(v); // dizi değerler de (ör. hero.ticks) süre yer tutucusunu alır
  };
}
// özellik kaydının çevirisi
const loc = (f, lang) => (lang === 'tr' || !f.i18n || !f.i18n[lang] ? f : { ...f, ...f.i18n[lang] });

function img(name, alt, cls = 'zoom') {
  if (!name || typeof name !== 'string') return '';
  const [w, h] = name === 'tv-eslestir' ? [1200, 675] : name.startsWith('tv-') ? [1600, 900] : name.startsWith('m-') ? [780, 1688] : [1440, 900];
  return `<img class="${cls}" src="/site/${e(name)}.webp" width="${w}" height="${h}" alt="${e(alt)}" loading="lazy" decoding="async">`;
}

const SCHED_POS = [[3, 7, ''], [6, 9, ''], [11, 13, 'c2'], [15, 18, 'c3'], [12, 18, 'c2'], [0, 18, 'c4']];
function visual(f, t) {
  const v = f.visual || {}, title = f.title;
  if (!v.type && !v.img && !v.phone) return '';
  const phone = v.phone ? `<div class="phone side">${img(v.phone, `${title} (${t('s.onPhone')})`)}</div>` : '';
  const tv = inner => `<div class="tvf flat"><div class="bezel"><div class="scr${inner ? ' poster' : ''}"${inner ? ' data-poster dir="auto"' : ''}>${inner ? '' : (v.img ? img(v.img, title) : '')}</div></div></div>`;
  if (v.type === 'poster') return `<div class="fx-v has-phone">${tv(true)}${phone}</div>`;
  if (v.type === 'schedule') {
    const rows = t('s.sched');
    return `<div class="fx-v"><div class="sched" aria-label="${e(t('s.schedAria'))}"><div class="sc-h" dir="ltr"><span></span><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>21</span><span>24</span></div>${
      SCHED_POS.map(([a, b, c], i) => `<div class="sc-r"><b>${e((rows[i] || [])[0])}<small>${e((rows[i] || [])[1])}</small></b><div class="sc-t" dir="ltr"><i${c ? ` class="${c}"` : ''} style="--s:${a};--e:${b}"></i></div></div>`).join('')}</div></div>`;
  }
  if (v.type === 'win') return `<div class="fx-v${phone ? ' has-phone' : ''}"><div class="win">${img(v.img, title)}</div>${phone}</div>`;
  const win = v.win ? `<div class="win under">${img(v.win, `${title} (${t('s.onPanel')})`)}</div>` : '';
  return `<div class="fx-v${phone ? ' has-phone' : ''}">${tv(false)}${phone}${win}</div>`;
}

// D1: features.json'daki emoji simgeleri tek tip çizgi ikona çevrilir (/icons.svg); eşlemesi olmayan emoji olduğu gibi kalır
const EMO = { '🎧': 'headphones', '🚨': 'siren', '🎞': 'film', '🧾': 'receipt-text', '⚽': 'trophy', '📣': 'megaphone', '🎉': 'party-popper', '📰': 'newspaper', '⏱': 'timer', '📡': 'radio-tower', '📊': 'chart-column', '🏬': 'store', '💼': 'briefcase', '📷': 'camera', '🎨': 'palette', '💻': 'monitor', '🔒': 'lock', '💾': 'hard-drive', '📺': 'tv', '⚡': 'zap', '🔑': 'key-round', '🧩': 'puzzle', '🌐': 'globe', '📚': 'book-open', '🔥': 'flame', '📥': 'download', '🏟': 'trophy', '🔳': 'scan-line', '🧭': 'compass', '🔎': 'search', '🎯': 'target', '🍹': 'clock' };
const ico = em => { const k = String(em || '').replace(/\uFE0F/g, ''); return EMO[k] ? `<svg class="si" aria-hidden="true"><use href="/icons.svg#i-${EMO[k]}"></use></svg>` : e(em || ''); };
const isNew = f => f.added && (Date.now() - Date.parse(f.added)) / 864e5 < NEW_DAYS;
const badges = (f, t) => (isNew(f) ? `<span class="nb">${e(t('s.new'))}</span>` : '') + (f.plan === 'pro' ? '<span class="pb">PRO</span>' : '');

// özellikler: kart ortada, sekmeler sol/sağ kolonlara eşit bölünür (alt satır yok)
function features(data, lang, t) {
  const list = data.features.filter(f => !f.hidden && f.title).map(f => loc(f, lang));
  const chip = (f, i) => `<button role="tab" id="fxt-${e(f.id)}" aria-controls="fx-${e(f.id)}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"><span class="i" aria-hidden="true">${f.icon ? ico(f.icon) : '•'}</span><span class="n">${e(f.short || f.title)}</span>${badges(f, t)}</button>`;
  const half = Math.max(1, Math.ceil(list.length / 2));
  const groups = [list.slice(0, half), list.slice(half)].map(g => g.map(f => chip(f, list.indexOf(f))).join(''));
  const panels = list.map((f, i) => `<article class="fx-p${i === 0 ? ' on' : ''}" role="tabpanel" id="fx-${e(f.id)}" aria-labelledby="fxt-${e(f.id)}">
  <div class="fx-t"><h3><span class="ic" aria-hidden="true">${ico(f.icon)}</span>${e(f.title)} ${badges(f, t)}</h3><p>${e(f.text)}</p>${
    f.points ? `<ul class="pts">${f.points.map(p => `<li>${e(p)}</li>`).join('')}</ul>` : ''}${
    f.tags ? `<ul class="tags">${f.tags.map(p => `<li>${e(p)}</li>`).join('')}</ul>` : ''}</div>
  ${visual(f, t)}</article>`).join('\n');
  const navAria = e(t('s.featuresAria'));
  return `<div class="fx" id="fx">
  <div class="fx-nav fx-n2" role="tablist" aria-label="${navAria}">${groups[0]}</div>
  <div class="fx-panels">${panels}</div>
  <div class="fx-nav fx-n3" role="tablist" aria-label="${navAria}">${groups[1]}</div>
  <div class="fx-step" hidden><button class="fx-prev" aria-label="${e(t('s.prev'))}"><span>‹</span></button><span class="fx-c" aria-live="polite">1 / ${list.length}</span><button class="fx-next" aria-label="${e(t('s.next'))}"><span>›</span></button></div></div>`;
}

const extras = (data, lang, t) => (data.extras || []).map(x0 => { const x = loc(x0, lang); return `<li><b>${ico(x.icon)} ${e(x.title)}${isNew(x) ? ` <span class="nb">${e(t('s.new'))}</span>` : ''}</b>${e(x.text)}</li>`; }).join('');

function compare(data, lang, t) {
  const b = PLANS.baslangic, p = PLANS.pro, gb = mb => (mb >= 1024 ? Math.round(mb / 1024) + ' GB' : mb + ' MB');
  const row = (k, x, y) => `<tr><th scope="row">${e(k)}</th>${[x, y].map(v => v === true ? `<td class="y">${e(t('s.yes'))}</td>` : v === false ? `<td class="n">${e(t('s.no'))}</td>` : `<td>${e(v)}</td>`).join('')}</tr>`;
  return [
    row(t('s.cmp.devices'), b.devices, p.devices), row(t('s.cmp.storage'), gb(b.storageMB), gb(p.storageMB)), row(t('s.cmp.users'), b.users, p.users),
    row(t('s.cmp.branches'), false, t('s.cmp.branchesPro').replace('{n}', p.includedBranches || p.branches)),
    ...data.features.filter(f => f.compare).map(f => loc(f, lang)).map(f => row(f.compare, f.plan !== 'pro', true)),
    row(t('s.cmp.badge'), b.badge ? t('s.cmp.badgeSmall') : t('s.no'), p.badge ? t('s.cmp.badgeSmall') : t('s.no')),
  ].join('');
}

const list = v => (Array.isArray(v) ? v.map(x => `<li>${x}</li>`).join('') : v);

function langMenu(lang) {
  const names = Object.fromEntries(LANGS.map(l => [l, read(I18N(l), true)['meta.name']]));
  return `<details class="lang"><summary aria-label="${e(dict(lang)('lang.label'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5c2.6 2.8 3.9 6 3.9 9.5s-1.3 6.7-3.9 9.5c-2.6-2.8-3.9-6-3.9-9.5s1.3-6.7 3.9-9.5z"/></svg><span>${lang.toUpperCase()}</span></summary><div class="lang-l">${
    LANGS.map(l => `<a href="${PATH(l)}" hreflang="${l}" lang="${l}" data-lang="${l}"${l === lang ? ' aria-current="true"' : ''}>${e(names[l])}</a>`).join('')}</div></details>`;
}

function render(store, tenants, access, lang = 'tr') {
  if (!LANGS.includes(lang)) lang = 'tr';
  const t = dict(lang);
  const st = k => store.setting(k, '');
  // D9: fiyat yazılmadıysa iletişim bölümüne giden "Teklif al" bağlantısı öne çıkar
  const price = v => v ? e(v) : `<small>${e(t('s.priceAsk'))}</small><a class="ask" href="#contact">${e(t('s.quote'))} →</a>`;
  const phone = st('site_phone'), wa = st('site_whatsapp').replace(/\D/g, ''), mail = st('site_email') || st('legal_email');
  const contact = [wa && `<a class="btn" href="https://wa.me/${wa}" rel="noopener">${e(t('contact.wa'))}</a>`, phone && `<a class="btn ghost" href="tel:${e(phone.replace(/\s/g, ''))}" dir="ltr">${e(phone)}</a>`, mail && `<a class="btn ghost" href="mailto:${e(mail)}">${e(mail)}</a>`].filter(Boolean).join('');
  const live = tenants.all().filter(x => access(x).ok).length;
  const data = read(DATA, true);
  const faq = (t('faq.items') || []).map(([q, a], i) => `<details${i === 0 ? ' open' : ''}><summary>${q}</summary><p>${a}</p></details>`).join('');
  const widgets = (t('widgets') || []).map(([ic, n, pro]) => `<li${pro ? ' class="pro"' : ''}>${ic} ${e(n)}</li>`).join('');
  const canonical = BASE + PATH(lang);
  const hreflang = LANGS.map(l => `<link rel="alternate" hreflang="${l}" href="${BASE}${PATH(l)}">`).join('\n') + `\n<link rel="alternate" hreflang="x-default" href="${BASE}/">`;
  const ld = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'ScreenPano', applicationCategory: 'BusinessApplication', operatingSystem: 'Android, Windows, Web', inLanguage: lang, description: t('ld.desc'), url: canonical, offers: { '@type': 'Offer', price: '0', priceCurrency: 'TRY', description: t('ld.offer') } };
  const jsT = { menuOpen: t('menu.open'), menuClose: t('menu.close'), posters: t('js.posters') };
  const vals = {
    LANG: lang, DIR: RTL.has(lang) ? 'rtl' : 'ltr', HOME: PATH(lang), CANONICAL: canonical, HREFLANG: hreflang,
    LDJSON: JSON.stringify(ld).replace(/</g, '\\u003c'), JS_T: JSON.stringify(jsT).replace(/</g, '\\u003c'),
    FONT_PRELOAD: RTL.has(lang) ? '<link rel="preload" href="/fonts/noto-kufi-arabic.woff2" as="font" type="font/woff2" crossorigin>' : '',
    LANG_MENU: langMenu(lang), LANG_LINKS: LANGS.map(l => `<a href="${PATH(l)}" hreflang="${l}" lang="${l}" data-lang="${l}"${l === lang ? ' aria-current="true"' : ''}>${e(read(I18N(l), true)['meta.name'])}</a>`).join(''),
    PRICE_BASLANGIC: price(st('site_price_baslangic')), PRICE_PRO: price(st('site_price_pro')), CONTACT: contact, YEAR: new Date().getFullYear(),
    LIVE: live >= 10 ? e(t('s.live').replace('{n}', live)) : e(t('s.liveDefault')),
    FEATURES: features(data, lang, t), EXTRAS: extras(data, lang, t), COMPARE: compare(data, lang, t), FAQ: faq, WIDGETS: widgets,
  };
  const ver = n => { try { return Math.round(fs.statSync(path.join(config.PUBLIC_DIR, 'site', n + '.webp')).mtimeMs / 1000).toString(36); } catch (er) { return '0'; } };
  return read(TPL)
    .replace(/\{\{t:([\w.]+)\}\}/g, (m, k) => list(t(k)))
    .replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in vals ? vals[k] : m))
    .replace(/\/site\/([\w-]+)\.webp/g, (m, n) => `${m}?v=${ver(n)}`);
}

module.exports = { render, LANGS, BASE, PATH };
