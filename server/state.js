// Bir ekrana gönderilen tam durum: düzen, tema, marka + içerik. Paket ve abonelik kısıtları burada uygulanır.
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const config = require('./config');
const store = require('./store');
const F = require('./feeds');
const { plan, access } = require('./plans');
const { WIDGETS, defaultLayout } = require('./widgets');

const appVersion = () => { try { const v = JSON.parse(fs.readFileSync(path.join(config.PUBLIC_DIR, 'apk-version.json'), 'utf8')); return { versionCode: Number(v.versionCode) || 0, versionName: String(v.versionName || ''), url: '/app.apk' }; } catch { return null; } };

const CAMP_QR = url => QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#14100c', light: '#ffffff' } });
const pubCamp = ({ id, headline, sub, note, qrLabel, svg, everyMin, durSec, sch }) => ({ id, headline, sub, note, qrLabel, svg, everyMin, durSec, sch: sch || null });

function wifiMarquee(db, text) {
  if (db.wifiText) return db.wifiText;
  const m = /P:((?:\\.|[^;])*);/.exec(String(text || ''));
  return m && m[1] ? m[1].replace(/\\(.)/g, '$1') : '';
}

// Ekranın düzeni; paket izin vermiyorsa Pro widget'lar çıkarılır
function layoutFor(t, screen) {
  let l = screen && store.J(screen.layout);
  if (!l || !Array.isArray(l.widgets)) l = defaultLayout();
  const pro = plan(t).pro;
  return { ...l, widgets: l.widgets.filter(w => WIDGETS[w.type] && (pro || !WIDGETS[w.type].pro)) };
}

const SCH = require('./sched');
const LANGS = ['tr', 'en', 'de', 'ru', 'ar', 'fr', 'es'];
const langList = db => ['tr', ...(((db.lang || {}).list) || []).filter(l => l !== 'tr' && LANGS.includes(l))].slice(0, 4);

// Medya döngüsü: videolar, fotoğraflar, hazır afişler (+ Instagram paylaşımları araya serpiştirilir)
function mediaList(t) {
  const db = t.db, out = [];
  for (const v of db.videos) {
    if (v.status === 'processing' && !v.reopt) continue;
    if (v.hidden || SCH.expired(v.sch)) continue;
    if (v.type === 'poster') out.push({ id: v.id, name: v.name, type: 'poster', tpl: v.tpl, fields: v.fields || {}, i18n: v.i18n || null, image: v.image ? t.upBase + v.image : null, dur: v.dur || null, sch: v.sch || null });
    else out.push({ id: v.id, name: v.name, url: t.upBase + v.file, type: v.type || 'video', sch: v.sch || null });
  }
  const bk = F.books;
  const covers = require('./plans').plan(t).pro && db.showBooks !== false && db.showBookSlides !== false && bk && Date.now() - Date.parse(bk.updated) < 72 * F.HOUR
    ? bk.items.filter(b => b.image).slice(0, 6).map(b => ({ id: 'bk' + F.coverHash(b.image), name: 'Yeni kitap', type: 'poster', tpl: 'kitap', fields: { title: b.title, sub: b.author || '', note: b.publisher || '' }, image: '/cover/' + F.coverHash(b.image) + '.jpg', dur: 10 })) : [];
  const withBooks = list => { // her 4 içerikte bir yeni çıkan kitap kapağı
    if (!covers.length) return list;
    if (!list.length) return covers.slice(0, 1);
    const m = []; let k = 0;
    list.forEach((v, i) => { m.push(v); if ((i + 1) % 4 === 0) m.push(covers[k++ % covers.length]); });
    if (list.length < 4) m.push(covers[0]);
    return m;
  };
  const ig = db.instagram;
  if (ig && ig.enabled !== false && (ig.posts || []).length && require('./plans').plan(t).pro) {
    const every = Math.max(1, Math.min(20, Number(ig.every) || 3)), posts = ig.posts.map(p => ({ id: p.id, name: 'Instagram', type: 'poster', tpl: 'insta', fields: { title: p.caption, sub: '@' + (ig.user || '') }, image: t.upBase + p.file, dur: Number(ig.dur) || 10 }));
    if (!out.length) return withBooks(posts);
    const mixed = []; let k = 0;
    out.forEach((v, i) => { mixed.push(v); if ((i + 1) % every === 0) mixed.push(posts[k++ % posts.length]); });
    if (out.length < every) mixed.push(posts[0]);
    return withBooks(mixed);
  }
  return withBooks(out);
}
// Yorumlar: elle girilenler + Google'dan gelenler (yalnız 4-5 yıldız)
function reviewList(db) {
  const g = db.google && db.google.show !== false ? (db.google.reviews || []) : [];
  return [...(db.reviews || []).map(r => ({ ...r, source: r.source || 'manual' })), ...g].filter(r => r.rating >= 4)
    .map(({ id, author, rating, text, source }) => ({ id, author, rating, text, source }));
}

function publicState(t) {
  const screen = require('./tenants').mainScreen(t);
  const db = t.db, p = plan(t), acc = access(t), pro = p.pro;
  const layout = layoutFor(t, screen);
  const has = type => layout.widgets.some(w => w.type === type);
  const base = {
    brand: { product: config.BRAND, name: t.name, logo: db.logo ? t.upBase + db.logo : null, badge: !!p.badge },
    theme: db.theme, layout, city: (db.location || {}).city || '',
    blocked: acc.ok ? null : acc.reason,
    app: appVersion(),
  };
  if (!acc.ok) return { ...base, videos: [], matches: [], standings: {}, qrs: [], campaigns: [], bigMatches: [], reviews: [], rates: {}, weather: null };
  const enabled = F.enabledLeagues(t);
  const movies = F.movies;
  const books = F.books;
  return {
    ...base,
    videos: mediaList(t),
    imageSeconds: db.imageSeconds,
    reviews: pro && has('reviews') ? reviewList(db) : [],
    googleRating: pro && db.google && db.google.rating ? { rating: db.google.rating, count: db.google.count } : null,
    langs: langList(db), langSec: Math.max(5, Math.min(60, Number((db.lang || {}).sec) || 12)),
    tz: config.TZ,
    matches: pro ? [
      ...db.matches.slice().sort((a, b) => a.time.localeCompare(b.time)).map(m => ({ ...m, day: 'Bugün' })),
      ...F.autoMatches.filter(m => enabled.some(([, label]) => label === m.league)),
    ].slice(0, 30).map(m => ({ ...m, hl: F.localLogo(m.hl), al: F.localLogo(m.al) })) : [],
    showStandings: pro && db.showStandings !== false,
    standings: pro ? Object.fromEntries(enabled.filter(([code]) => F.standings.has(code) && !(db.hideTables || []).includes(code)).map(([code, label]) => [label, F.standings.get(code).map(r => ({ ...r, logo: F.localLogo(r.logo) }))])) : {},
    trafficApi: pro && F.wantsTraffic(t) ? store.setting('traffic_api', '') : '',
    mapAt: pro && F.wantsTraffic(t) && F.mapAt ? Math.round(F.mapAt) : null,
    traffic: pro && F.wantsTraffic(t) ? F.traffic : null,
    showQr: db.showQr !== false,
    fxMode: ['auto', 'lite', 'full'].includes(db.fxMode) ? db.fxMode : 'auto',
    showOnThisDay: pro && db.showOnThisDay !== false,
    onThisDay: pro && F.onThisDay && F.onThisDay.date === F.ymd(new Date()) ? F.onThisDay : null,
    showNews: pro && (db.news || {}).enabled !== false,
    news: pro ? F.newsFor(t) : null,
    showBooks: pro && db.showBooks !== false,
    books: pro && books && Date.now() - Date.parse(books.updated) < 72 * F.HOUR ? { items: books.items.map(b => ({ ...b, image: b.image ? '/cover/' + F.coverHash(b.image) + '.jpg' : '' })) } : null,
    showMovies: pro && (db.movies || {}).enabled !== false,
    showTrailers: pro && (db.movies || {}).trailers !== false,
    movies: pro && movies && movies.items && Date.now() - Date.parse(movies.updated) < 4 * 24 * F.HOUR ? { items: movies.items } : null,
    showPharmacy: pro && (db.pharmacy || {}).enabled !== false,
    pharmacies: pro ? F.pharmFor(t) : null,
    bigMatches: pro && F.bigCfg(t).enabled ? F.activeBig(t) : [],
    bigCfg: (({ note, info, everyMin, durSec }) => ({ note, info, everyMin, durSec }))(F.bigCfg(t)),
    celebration: F.activeCelebration(t),
    campaigns: (db.campaigns || []).filter(c => c.enabled && c.svg).map(pubCamp),
    safeInset: Math.max(0, Math.min(12, Number(db.safeInset) || 0)),
    safe: ['L', 'R', 'T', 'B'].reduce((o, k) => { const v = db['safe' + k]; o[k] = Math.max(0, Math.min(20, Number(v !== undefined && v !== null ? v : db.safeInset) || 0)); return o; }, {}),
    safeGuide: !!db.safeGuide,
    qrSize: Math.max(10, Math.min(30, Number(db.qrSize) || 17)),
    qrs: (db.qrs || []).map(({ id, label, svg, side, kind, text }) => ({ id, label, svg, side: side === 'left' ? 'left' : 'right', marquee: kind === 'wifi' ? wifiMarquee(db, text) : '' })),
    menu: pro && has('menu') ? db.menu : null,
    rates: F.rates,
    weather: F.weatherFor(t),
  };
}

module.exports = { publicState, layoutFor, appVersion, CAMP_QR, pubCamp, mediaList, LANGS };
