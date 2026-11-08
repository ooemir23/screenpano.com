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
const { plan, access } = require('./plans');
const { WIDGETS, defaultLayout } = require('./widgets');

// apk-version.json her yayında diskten okunmaz: 30 sn önbellek (deploy'da dosya değişince en geç 30 sn'de görülür)
let _apkV = null, _apkAt = 0;
const appVersion = () => {
  if (Date.now() - _apkAt < 30000) return _apkV;
  _apkAt = Date.now();
  try { const v = JSON.parse(fs.readFileSync(path.join(config.PUBLIC_DIR, 'apk-version.json'), 'utf8')); _apkV = { versionCode: Number(v.versionCode) || 0, versionName: String(v.versionName || ''), url: '/app.apk' }; } catch { _apkV = null; }
  return _apkV;
};

const CAMP_QR = url => QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#14100c', light: '#ffffff' } });
const pubCamp = ({ id, headline, sub, note, qrLabel, svg, everyMin, durSec, sch, image, emoji, textAlign, font, style, pos, qrX, qrY, qrSize, ovTitle, ovSub, ovBadge }) => ({
  ovTitle: ovTitle || undefined, ovSub: ovSub || undefined, ovBadge: ovBadge || undefined,
  id, headline, sub, note, qrLabel, svg, everyMin, durSec, sch: sch || null,
  image: image || null,
  // Fotoğraflı kampanya: tam ekran fotoğraf + sürüklenip yerleştirilen QR (konum/boyut yüzde)
  photo: !!image,
  qrX: qrX != null ? qrX : 85, qrY: qrY != null ? qrY : 75, qrSize: qrSize || 26,
  emoji: emoji !== undefined ? emoji : '☕',
  textAlign: textAlign || 'left',
  font: font || 'Montserrat',
  style: style || 'coffee',
  pos: pos || 'qr-right',
});

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
  // Hava durumu ve Finans ayrı widget; TV'ye (eski APK'lar dahil) ayarları kısılmış 'rates' kutusu olarak gider
  const toRates = w => w.type === 'weather' ? { ...w, type: 'rates', props: { ...(w.props || {}), weather: true, rates: false, qr: false, qrs: '' } }
    : w.type === 'finance' ? { ...w, type: 'rates', props: { valSize: 'xl', ...(w.props || {}), weather: false, rates: true, qr: false, qrs: '' } } : w;
  return { ...l, widgets: l.widgets.filter(w => WIDGETS[w.type] && (pro || !WIDGETS[w.type].pro)).map(toRates) };
}

const SCH = require('./sched');
const LANGS = ['tr', 'en', 'de', 'ru', 'ar', 'fr', 'es'];
const langList = db => ['tr', ...(((db.lang || {}).list) || []).filter(l => l !== 'tr' && LANGS.includes(l))].slice(0, 4);

// Medya döngüsü: videolar, fotoğraflar, hazır afişler (+ Instagram paylaşımları araya serpiştirilir)
// Medya kaydı -> ekrana giden öğe (reklam görselleri de aynı biçimle gider)
function mediaItem(t, v) {
  // YouTube bağlantısı: TV gömülü oynatıcıyla gösterir; url eski uygulamalar için kapak görseli (süre boyunca fotoğraf gibi görünür)
  if (v.type === 'youtube') return { id: v.id, name: v.name, type: 'youtube', yt: v.yt, url: require('./ytlink').thumb(v.yt), dur: v.dur || 30, sch: v.sch || null };
  if (v.type === 'poster') return { id: v.id, name: v.name, type: 'poster', tpl: v.tpl, fields: v.fields || {}, i18n: v.i18n || null, image: v.image ? t.upBase + v.image : null, dur: v.dur || null, sch: v.sch || null };
  return { id: v.id, name: v.name, url: t.upBase + v.file, type: v.type || 'video', dur: v.dur || (v.type === 'image' ? null : require('./vidlen').get(t, v.file, () => { try { require('./hub').pushTenant(t.id); } catch (e) {} })) || null, sch: v.sch || null };
}
// Platform reklamları (server/platformads.js) son hâlin arasına serpiştirilir
const mediaList = t => require('./platformads').inject(t, baseMediaList(t));
function baseMediaList(t) {
  const db = t.db, out = [];
  for (const v of db.videos) {
    if (v.status === 'processing' && !v.reopt) continue;
    if (v.hidden || SCH.expired(v.sch)) continue;
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
  const withBooks = list => { // kitap slaytı: her N içerikte bir (varsayılan 6) ve istenirse son slayttan en az X dakika sonra (süre, içeriklerin süresinden kestirilir); 1-2 içerikte hiç: kitap sürekli araya girmesin
    if (!covers.length) return list;
    if (!list.length) return covers.slice(0, 1);
    const every = Math.max(1, Math.min(50, Math.round(Number(db.bookEvery)) || 6)), gapSec = Math.max(0, Math.min(120, Math.round(Number(db.bookGapMin)) || 0)) * 60;
    const m = []; let k = 0, cnt = 0, acc = 0;
    list.forEach((v, i) => {
      m.push(v); cnt++; acc += Number(v.dur) || Number(db.imageSeconds) || 10;
      if (cnt >= every && acc >= gapSec && i + 1 < list.length) { m.push(covers[k++ % covers.length]); cnt = 0; acc = 0; }
    });
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
// Yorumlar: Google'dan gelenler (yalnız 4-5 yıldız)
function reviewList(db) {
  const g = db.google && db.google.show !== false ? (db.google.reviews || []) : [];
  return g.filter(r => r.rating >= 4)
    .map(({ id, author, rating, text, source }) => ({ id, author, rating, text, source: source || 'google' }));
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
// Happy Hours kartı: fotoğraf tam ekran, istenirse üstünde ad / saat / indirim rozeti (hazır tasarım fotoğrafı için hepsi gizlenebilir); kampanya mekanizmasıyla (sıklık, süre, zamanlama) gösterilir
const hhmm = sc => sc && sc.from ? `${sc.from} – ${sc.to}` : '';
function happyCamp(db) {
  const c = db.happyCard, h = db.menu && db.menu.happy;
  if (!c || !c.on || !c.image || !h || !h.sch) return [];
  return [pubCamp({ id: 'happy', headline: h.label || 'Happy Hour', svg: '', everyMin: c.everyMin || 4, durSec: c.durSec || 15, sch: h.sch, image: c.image,
    ovTitle: c.showTitle !== false ? (h.label || 'Happy Hour') : '', ovSub: c.showTime !== false ? hhmm(h.sch) : '', ovBadge: c.showPct !== false && h.pct ? `%${h.pct} İNDİRİM` : '' })];
}
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
// TV'ye giden müzik: uzun ömürlü Spotify refreshToken kutulara (fiziksel erişime açık) gitmez
function tvMusic(m) {
  const x = fixMusic(m);
  if (!x || !x.spotify) return x;
  const { refreshToken, ...sp } = x.spotify;
  // ext: müziği TV kutusundaki Spotify uygulaması (ya da başka bir Spotify cihazı) çalar; TV yalnız çalanı gösterir
  sp.ext = !!(refreshToken && !sp.expired && sp.target && sp.target !== 'screenpano');
  return { ...x, spotify: sp };
}
// Özel yayın: seçili gün/saatlerde yalnız seçilen içerikler oynar; kampanya, kutlama, maç, fragman, haber bandı ve reklam çıkmaz.
// Seçilen içerik gizli ya da kendi zamanlaması dışında olsa da bu saatlerde oynar. Seçili içerik kalmadıysa kural yok sayılır (ekran boş kalmaz).
function activeSpecial(t) {
  for (const r of (t.db.special || [])) {
    if (!r.on || !r.sch || !SCH.active(r.sch)) continue;
    const items = (r.items || []).map(id => (t.db.videos || []).find(v => v.id === id)).filter(v => v && !(v.status === 'processing' && !v.reopt)).map(v => ({ ...mediaItem(t, v), sch: null }));
    if (items.length) return { rule: r, items };
  }
  return null;
}
function publicState(t) {
  const screen = require('./tenants').mainScreen(t);
  const db = t.db, p = plan(t), acc = access(t), pro = p.pro;
  const sp = access(t).ok ? activeSpecial(t) : null;
  let layout = layoutFor(t, screen);
  if (sp && sp.rule.full) layout = { ...layout, widgets: [{ type: 'media', x: 0, y: 0, w: layout.cols || 24, h: layout.rows || 24 }] }; // tam ekran: kenar kutular gizli
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
  const ml = sp ? sp.items : mediaList(t);
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
    videoGapSec: Math.max(0, Math.min(30, Number.isFinite(Number(db.videoGapSec)) && db.videoGapSec !== undefined ? Math.round(Number(db.videoGapSec)) : 3)), xfadeSec: Math.max(0.4, Math.min(4, Number.isFinite(Number(db.xfadeSec)) && db.xfadeSec !== undefined ? Number(db.xfadeSec) : 1.2)),
    showStandings: pro && db.showStandings !== false,
    standings: pro ? Object.fromEntries(enabled.filter(([code]) => F.standings.has(code) && !(db.hideTables || []).includes(code)).map(([code, label]) => [label, F.standings.get(code).map(r => ({ ...r, logo: F.localLogo(r.logo) }))])) : {},
    trafficApi: pro && F.wantsTraffic(t) ? store.setting('traffic_api', '') : '',
    mapAt: pro && F.wantsTraffic(t) && F.mapAt ? Math.round(F.mapAt) : null,
    traffic: pro && F.wantsTraffic(t) ? F.traffic : null,
    showQr: db.showQr !== false,
    env: config.APP_ENV, canTest: !!db.canTest, // menüdeki "Test ortamına geç" düğmesi yalnız canTest açık işletmelerde görünür
    fxMode: ['auto', 'lite', 'ultra', 'full'].includes(db.fxMode) ? db.fxMode : 'auto',
    showOnThisDay: pro && db.showOnThisDay !== false,
    onThisDay: pro && F.onThisDay && F.onThisDay.date === F.ymd(new Date()) ? cap(F.onThisDay, imax.otd) : null,
    showNews: pro && (db.news || {}).enabled !== false,
    news: pro ? cap(F.newsFor(t), imax.news) : null,
    showBreaking: !sp && pro && F.breakingOn(t),
    breakingBanner: !sp && (db.breaking || {}).banner !== false,
    breaking: pro && F.breakingOn(t) ? cap(F.breakingFor(), imax.breaking) : null,
    showBooks: pro && db.showBooks !== false,
    books: pro && books && Date.now() - Date.parse(books.updated) < 72 * F.HOUR ? { items: books.items.slice(0, imax.books || 999).map(b => ({ ...b, image: b.image && F.coverReady(b.image) ? '/cover/' + F.coverHash(b.image) + '.jpg' : '' })) } : null,
    showMovies: pro && (db.movies || {}).enabled !== false,
    showTrailers: !sp && pro && (db.movies || {}).trailers !== false,
    trailerEvery: (db.movies || {}).every || 4, trailerGapMin: (db.movies || {}).gapMin || 8, // fragman sıklığı: kaç içerikte bir / en az kaç dakika arayla
    movies: pro && movies && movies.items && Date.now() - Date.parse(movies.updated) < 4 * 24 * F.HOUR ? { items: movies.items.slice(0, imax.movies || 999) } : null,
    showPharmacy: pro && (db.pharmacy || {}).enabled !== false,
    pharmacies: pro ? cap(F.pharmFor(t), imax.pharm) : null,
    infoCfg: { pageSec: Math.max(5, Math.min(60, Number(ic.pageSec) || 12)), dur: ic.dur || {} }, // sayfa başına ekranda kalma süresi (sn)
    bigMatches: !sp && pro && F.bigCfg(t).enabled ? F.activeBig(t) : [],
    bigCfg: (({ note, info, everyMin, durSec, style }) => ({ note, info, everyMin, durSec, style }))(F.bigCfg(t)),
    celebration: sp ? null : F.activeCelebration(t),
    campaigns: sp ? [] : [...(db.campaigns || []).filter(c => c.enabled && c.svg).map(pubCamp), ...happyCamp(db)],
    special: sp ? { name: sp.rule.name || '', full: !!sp.rule.full } : null,
    safeInset: Math.max(0, Math.min(12, Number(db.safeInset) || 0)),
    safe: ['L', 'R', 'T', 'B'].reduce((o, k) => { const v = db['safe' + k]; o[k] = Math.max(0, Math.min(20, Number(v !== undefined && v !== null ? v : db.safeInset) || 0)); return o; }, {}),
    safeGuide: !!db.safeGuide,
    qrSize: 17, // QR boyutu ayarı kaldırıldı: tüm QR'lar aynı boyutta
    qrs: (db.qrs || []).map(({ id, label, svg, kind, text, pin, hide }) => ({ id, label, svg, pin: pin !== false, hide: Array.isArray(hide) ? hide : [], marquee: kind === 'wifi' ? wifiMarquee(db, text) : '' })),
    menu: pro && has('menu') ? menuView(db.menu) : null,
    music: tvMusic(db.music),
    rates: F.rates,
    weather: F.weatherFor(t),
  };
}

module.exports = { activeSpecial, happyOn, menuView, parsePrice, publicState, layoutFor, appVersion, CAMP_QR, pubCamp, mediaList, LANGS };
