// Bir ekrana gönderilen tam durum: düzen, tema, marka + içerik. Paket ve abonelik kısıtları burada uygulanır.
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const config = require('./config');
const store = require('./store');
const F = require('./feeds');
const tenantMediaSync = new Map(); // tid -> { sig: string, at: number }
function getTenantMediaAt(t, ml) {
  const msig = ml.map(v => v.id + ':' + (v.dur || '') + ':' + (v.url || v.image || '')).join('|');
  let cur = tenantMediaSync.get(t.id);
  if (!cur || cur.sig !== msig) {
    cur = { sig: msig, at: Date.now() };
    tenantMediaSync.set(t.id, cur);
  }
  return cur.at;
}
function resetTenantMediaAt(tid) {
  const now = Date.now();
  let cur = tenantMediaSync.get(tid);
  if (cur) cur.at = now;
  else tenantMediaSync.set(tid, { sig: '', at: now });
  return now;
}
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
// Medya kaydı -> ekrana giden öğe (reklam görselleri de aynı biçimle gider)
function mediaItem(t, v) {
  if (v.type === 'poster') return { id: v.id, name: v.name, type: 'poster', tpl: v.tpl, fields: v.fields || {}, i18n: v.i18n || null, image: v.image ? t.upBase + v.image : null, dur: v.dur || null, sch: v.sch || null };
  return { id: v.id, name: v.name, url: t.upBase + v.file, type: v.type || 'video', dur: v.dur || (v.type === 'image' ? null : require('./vidlen').get(t, v.file, () => { try { require('./hub').pushTenant(t.id); } catch (e) {} })) || null, sch: v.sch || null };
}
// Reklamlar (server/ads.js) son hâlin arasına serpiştirilir
const mediaList = t => require('./ads').inject(t, baseMediaList(t), v => mediaItem(t, v));
function baseMediaList(t) {
  const db = t.db, out = [];
  for (const v of db.videos) {
    if (v.status === 'processing' && !v.reopt) continue;
    if (v.ad || v.hidden || SCH.expired(v.sch)) continue; // reklam görselleri normal sırada oynamaz
    out.push(mediaItem(t, v));
  }
  const bk = F.booksView();
  const covers = require('./plans').plan(t).pro && db.showBooks !== false && db.showBookSlides !== false && bk && Date.now() - Date.parse(bk.updated) < 72 * F.HOUR
    ? (() => { // her slaytta 4 kitap (2x2: kapak, ad, yazar, yayınevi, açıklama)
      const cards = bk.items.map(b => ({ title: b.title, author: b.author || '', publisher: b.publisher || '', desc: b.desc || '', image: b.image && F.coverReady(b.image) ? '/cover/' + F.coverHash(b.image) + '.jpg' : null }));
      const out2 = [];
      for (let i = 0; i < cards.length; i += 4) { const pair = cards.slice(i, i + 4); out2.push({ id: 'bk' + F.coverHash(pair.map(x => x.title).join('|')), name: 'Yeni kitap', type: 'poster', tpl: 'kitap', fields: { title: pair[0].title, sub: pair[0].author, note: pair[0].publisher }, books: pair, image: pair[0].image, dur: 12 }); }
      return out2;
    })() : [];
  const withBooks = list => { // her 6 içerikte bir yeni çıkan kitap kapağı (kısa listede döngüde en çok bir kez; 1-2 içerikte hiç: kitap sürekli araya girmesin)
    if (!covers.length) return list;
    if (!list.length) return covers.slice(0, 1);
    const m = []; let k = 0;
    list.forEach((v, i) => { m.push(v); if ((i + 1) % 6 === 0 && i + 1 < list.length) m.push(covers[k++ % covers.length]); });
    if (list.length >= 3) m.push(covers[k++ % covers.length]);
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

// Hazır "Türkçe Pop" listesi önceden yanlış Spotify listesine gidiyordu; eklenmiş olanlar doğru listeye çevrilir
function fixMusic(m) {
  if (!m || !Array.isArray(m.playlists)) return m || null;
  for (const x of m.playlists) if (x.spotifyId === '37i9dQZF1DX4Wsb4d7NKfP') Object.assign(x, { spotifyId: '7uGniGmKxD4fmxGJWPqZAl', url: 'https://open.spotify.com/playlist/7uGniGmKxD4fmxGJWPqZAl', thumb: '' });
  return m;
}
// İndirim saati (happy hour): menu.happy = { label, pct, sch }. Saat içindeyse "İndirim saatine dahil" kategorilerdeki
// ürünlerin fiyatı indirimli fiyata (ürünün kendi indirimli fiyatı ya da %pct) çevrilir, eski fiyat "was" olarak gider.
// Hesap sunucuda yapılır: eski APK'lar da indirimli fiyatı gösterir; sınır anında happy.js ekranlara yeni durumu iter.
const parsePrice = v => { const x = String(v || '').replace(/\s|₺|TL/gi, ''); if (!/^\d[\d.,]*$/.test(x)) return null; const n = Number(/,\d{1,2}$/.test(x) ? x.replace(/\./g, '').replace(',', '.') : x.replace(/[.,](?=\d{3}(\D|$))/g, '')); return isFinite(n) ? n : null; };
const fmtNum = (n, dec) => dec ? n.toFixed(2).replace('.', ',') : String(Math.round(n));
const happyOn = m => !!(m && m.happy && m.happy.sch && (m.categories || []).some(c => c.happy) && SCH.active(m.happy.sch));
function menuView(m) {
  if (!m || !happyOn(m)) return m;
  const h = m.happy, pct = Math.max(0, Math.min(90, Number(h.pct) || 0));
  const out = { ...m, happyNow: h.label || 'Happy Hour', title: `${m.title || 'Fiyat Listesi'} · ${h.label || 'Happy Hour'}` };
  out.categories = m.categories.map(c => !c.happy ? c : { ...c, items: (c.items || []).map(i => {
    if (i.off) return i;
    let np = i.hp ? String(i.hp) : null;
    if (!np && pct) { const n = parsePrice(i.price); if (n != null) np = fmtNum(n * (1 - pct / 100), /,\d{1,2}$/.test(String(i.price)) && n % 1 !== 0); }
    return np && np !== i.price ? { ...i, was: i.price, price: np } : i;
  }) });
  return out;
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
  const books = F.booksView();
  // çalma listesi değişince saat ankışı yenilenir: tüm ekranlar sunucu saatine göre aynı anda aynı içeriği gösterir
  const ic = db.infoCfg || {}, imax = ic.max || {};
  // bilgi bandı: öğe sayısı sınırı (hem sayfalarda hem kayan bantta geçerli)
  const cap = (o, n) => o && n && Array.isArray(o.items) ? { ...o, items: o.items.slice(0, n) } : o;
  const ml = mediaList(t);
  const mediaAt = getTenantMediaAt(t, ml);
  return {
    ...base,
    videos: ml,
    mediaAt,
    imageSeconds: db.imageSeconds,
    reviews: pro && has('reviews') ? reviewList(db) : [],
    googleRating: pro && db.google && db.google.rating ? { rating: db.google.rating, count: db.google.count } : null,
    langs: langList(db), langSec: Math.max(5, Math.min(60, Number((db.lang || {}).sec) || 12)),
    tz: config.TZ,
    matches: pro ? [
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
    onThisDay: pro && F.onThisDay && F.onThisDay.date === F.ymd(new Date()) ? cap(F.onThisDay, imax.otd) : null,
    showNews: pro && (db.news || {}).enabled !== false,
    news: pro ? cap(F.newsFor(t), imax.news) : null,
    showBreaking: pro && F.breakingOn(t),
    breakingBanner: (db.breaking || {}).banner !== false,
    breaking: pro && F.breakingOn(t) ? cap(F.breakingFor(), imax.breaking) : null,
    showBooks: pro && db.showBooks !== false,
    books: pro && books && Date.now() - Date.parse(books.updated) < 72 * F.HOUR ? { items: books.items.slice(0, imax.books || 999).map(b => ({ ...b, image: b.image && F.coverReady(b.image) ? '/cover/' + F.coverHash(b.image) + '.jpg' : '' })) } : null,
    showMovies: pro && (db.movies || {}).enabled !== false,
    showTrailers: pro && (db.movies || {}).trailers !== false,
    trailerEvery: (db.movies || {}).every || 4, trailerGapMin: (db.movies || {}).gapMin || 8, // fragman sıklığı: kaç içerikte bir / en az kaç dakika arayla
    movies: pro && movies && movies.items && Date.now() - Date.parse(movies.updated) < 4 * 24 * F.HOUR ? { items: movies.items.slice(0, imax.movies || 999) } : null,
    showPharmacy: pro && (db.pharmacy || {}).enabled !== false,
    pharmacies: pro ? cap(F.pharmFor(t), imax.pharm) : null,
    infoCfg: { pageSec: Math.max(5, Math.min(60, Number(ic.pageSec) || 12)), dur: ic.dur || {} }, // sayfa başına ekranda kalma süresi (sn)
    bigMatches: pro && F.bigCfg(t).enabled ? F.activeBig(t) : [],
    bigCfg: (({ note, info, everyMin, durSec, style }) => ({ note, info, everyMin, durSec, style }))(F.bigCfg(t)),
    celebration: F.activeCelebration(t),
    campaigns: (db.campaigns || []).filter(c => c.enabled && c.svg).map(pubCamp),
    safeInset: Math.max(0, Math.min(12, Number(db.safeInset) || 0)),
    safe: ['L', 'R', 'T', 'B'].reduce((o, k) => { const v = db['safe' + k]; o[k] = Math.max(0, Math.min(20, Number(v !== undefined && v !== null ? v : db.safeInset) || 0)); return o; }, {}),
    safeGuide: !!db.safeGuide,
    qrSize: 17, // QR boyutu ayarı kaldırıldı: tüm QR'lar aynı boyutta
    qrs: (db.qrs || []).map(({ id, label, svg, kind, text, pin, hide }) => ({ id, label, svg, pin: pin !== false, hide: Array.isArray(hide) ? hide : [], marquee: kind === 'wifi' ? wifiMarquee(db, text) : '' })),
    menu: pro && has('menu') ? menuView(db.menu) : null,
    music: fixMusic(db.music),
    rates: F.rates,
    weather: F.weatherFor(t),
  };
}

module.exports = { happyOn, menuView, parsePrice, publicState, layoutFor, appVersion, CAMP_QR, pubCamp, mediaList, resetTenantMediaAt, LANGS };
