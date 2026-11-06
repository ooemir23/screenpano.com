// Sunucu girişi: sayfalar, statik dosyalar, API'ler ve WebSocket.
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const config = require('./config');
const auth = require('./auth');
const tenants = require('./tenants');
const feeds = require('./feeds');
const media = require('./media');
const realtime = require('./realtime');
const { ensureSuper } = require('./accounts');

ensureSuper();
tenants.all();
require('./qrtrack').migrate().catch(e => console.error('QR geçişi:', e.message)); // eski bağlantı QR'larına sayaç kodu ver

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // önde tek vekil (Traefik); istemci IP'si için auth.clientIp kullanılır
// www.screenpano.com -> screenpano.com (tek adres; arama motorları için kalıcı yönlendirme)
app.use((req, res, next) => {
  const host = String(req.headers.host || '');
  if (/^www\./i.test(host)) return res.redirect(301, `https://${host.slice(4)}${req.originalUrl}`);
  next();
});
// Alt alan adları: admin.* panel, tv.* TV ekranı, music.* yalnız müzik sayfası, sadmin.* süper yönetim. Ana adres (ve eski yollar) olduğu gibi çalışır;
// yalnız kök adres ("/") ve girişten sonra gidilecek sayfa alt alana göre seçilir. Test ortamında taban adres test.screenpano.com olur (admin.test.screenpano.com ...).
const SUBS = { admin: 1, tv: 1, music: 1, sadmin: 1 };
const baseHost = (() => { try { return new URL(config.BASE_URL).hostname.toLowerCase(); } catch (e) { return 'screenpano.com'; } })();
function subOf(req) {
  const h = String(req.headers.host || '').split(':')[0].toLowerCase();
  if (!h.endsWith('.' + baseHost)) return '';
  const l = h.slice(0, -baseHost.length - 1);
  return SUBS[l] ? l : '';
}
auth.subOf = subOf;
app.use(require('compression')());
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin'); next(); });

// TV sayfasına sunucu sürümü pişirilir: önbellekten açılan bayat kopya, WS sürüm mesajıyla karşılaştırıp
// kendini yenileyebilir (pişmiş sürüm yoksa taze açılan sayfa "uyumlu" sanılır ve asla güncellenmezdi)
const page = (file, only) => (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  if (only) { // müzik sayfası: panel, yalnız Müzik bölümüyle açılır
    return fs.readFile(path.join(config.PUBLIC_DIR, file), 'utf8', (err, html) => err ? res.sendStatus(404) : res.type('html').send(String(html).replace('<head>', '<head><script>window.__ONLY=' + JSON.stringify(only) + ';</script>')));
  }
  if (file !== 'tv.html') return res.sendFile(path.join(config.PUBLIC_DIR, file));
  require('fs').readFile(path.join(config.PUBLIC_DIR, file), 'utf8', (err, html) => {
    if (err) return res.sendStatus(404);
    res.type('html').send(String(html).replace('<head>', '<head><script>window.__pageBuild="' + require('./realtime').build + '";</script>'));
  });
};
app.get('/', (req, res, next) => {
  const sub = subOf(req);
  if (sub) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (sub === 'tv') return res.redirect('/tv');
    const u = auth.sessionUser(req);
    if (!u) return res.redirect('/login');
    if (sub === 'music') return res.redirect('/music');
    if (sub === 'sadmin') return res.redirect(u.role === 'super' ? '/super' : '/panel');
    return res.redirect(u.role === 'super' && !u.imp ? '/super' : '/panel'); // admin
  }
  next();
});
app.get('/', (req, res) => {
  // eski APK'lar kök adresi açar: Android WebView'dan gelen istek TV sayfasına gider
  if (/; wv\)/.test(String(req.headers['user-agent'] || ''))) return res.redirect('/tv');
  const u = auth.sessionUser(req);
  if (u && req.query.site === undefined) return res.redirect(u.role === 'super' && !u.imp ? '/super' : '/panel');
  res.setHeader('Cache-Control', 'no-cache'); res.type('html').send(sitePage('tr'));
});
// diğer diller: /en, /de, /ar (giriş yapmış kullanıcı da siteyi görür)
app.get(/^\/(en|de|ar)\/?$/, (req, res) => {
  if (req.path.endsWith('/')) return res.redirect(301, req.path.slice(0, -1));
  res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Content-Language', req.params[0]);
  res.type('html').send(sitePage(req.params[0]));
});
// Arama motorları: panel, TV ve API sayfaları dizine girmez; site ve hukuki sayfalar girer
app.use((req, res, next) => { if (/^\/(panel|super|tv|api|login|music)(\/|$)/.test(req.path)) res.setHeader('X-Robots-Tag', 'noindex, nofollow'); next(); });
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /panel\nDisallow: /super\nDisallow: /music\nDisallow: /tv\nDisallow: /api/\nDisallow: /login\n\nSitemap: ${require('./site').BASE}/sitemap.xml\n`);
});
app.get('/sitemap.xml', (req, res) => {
  const { LANGS, BASE, PATH } = require('./site'), fs = require('fs');
  const mtime = f => { try { return fs.statSync(path.join(config.PUBLIC_DIR, f)).mtime.toISOString().slice(0, 10); } catch (e) { return undefined; } };
  const last = mtime('site/features.json') || require('./legal').VERSION;
  const alt = LANGS.map(l => `<xhtml:link rel="alternate" hreflang="${l}" href="${BASE}${PATH(l)}"/>`).join('') + `<xhtml:link rel="alternate" hreflang="x-default" href="${BASE}/"/>`;
  const home = LANGS.map(l => `<url><loc>${BASE}${PATH(l)}</loc><lastmod>${last}</lastmod><changefreq>weekly</changefreq><priority>${l === 'tr' ? '1.0' : '0.9'}</priority>${alt}</url>`);
  const legal = require('./legal').KEYS.map(k => `<url><loc>${BASE}/${k}</loc><lastmod>${require('./legal').VERSION}</lastmod><changefreq>yearly</changefreq><priority>0.3</priority></url>`);
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${[...home, ...legal].join('\n')}\n</urlset>\n`);
});
// Tanıtım sitesi: şablon + public/site/features.json (server/site.js)
const sitePage = lang => require('./site').render(require('./store'), tenants, require('./plans').access, lang);
for (const k of require('./legal').KEYS) app.get('/' + k, (req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.type('html').send(require('./legal').render(k)); });
// TV çevrimdışı önbelleği: service worker kök kapsamda ve her zaman taze
app.get('/sw.js', (req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Service-Worker-Allowed', '/'); res.type('js').sendFile(path.join(config.PUBLIC_DIR, 'sw.js')); });
// QR okutma sayacı: kısa adres sayar ve asıl adrese yönlendirir
app.get('/q/:code', require('./qrtrack').handler);
// Reklam verene gönderilen rapor (giriş istemez, adres tahmin edilemez)
app.get('/r/:token', require('./ads').page);
app.get('/login', page('login.html'));
app.get('/tv', page('tv.html'));
app.get('/panel', (req, res, next) => (auth.sessionUser(req) ? page('panel.html')(req, res, next) : res.redirect('/login')));
app.get('/music', (req, res, next) => (auth.sessionUser(req) ? page('panel.html', 'music')(req, res, next) : res.redirect('/login')));
app.get('/super', (req, res, next) => { const u = auth.sessionUser(req); return u && u.role === 'super' ? page('super.html')(req, res, next) : res.redirect('/login'); });

app.use('/api/auth', require('./routes-auth'));
app.get('/api/oauth/google/callback', require('./youtube').callback); // YouTube hesabı bağlantısı dönüşü
app.get('/api/oauth/spotify/callback', require('./spotify').callback); // Spotify hesabı bağlantısı dönüşü
app.use('/api/tv', require('./routes-tv').router);
app.use('/api/admin', require('./routes-admin').router);
app.use('/api/transfer', require('./transfer').pub);
app.use('/api/super', require('./routes-super'));

// İBB trafik değeri (Cloudflare Worker imzalı)
app.post('/api/traffic/report', (req, res) => { const [code, msg] = feeds.reportTraffic(req.body || {}); res.status(code).json(code === 200 ? { ok: true } : { error: msg }); });
app.get('/traffic-map.jpg', (req, res) => { if (!feeds.mapAt) return res.status(404).end(); res.set('Cache-Control', 'no-cache'); res.sendFile(feeds.MAP_FILE); });
const logoJobs = new Map();
// Kitap kapakları: TV'ler dış sitelere doğrudan gitmesin; yalnız listedeki adresler sunucudan alınır
app.get('/cover/:h.jpg', async (req, res) => {
  const b = ((feeds.books || {}).items || []).find(x => x.image && feeds.coverHash(x.image) === req.params.h);
  const c = b && await feeds.coverGet(b.image);
  if (!c) return res.status(404).end();
  res.set({ 'Content-Type': c.type, 'Cache-Control': 'public, max-age=86400' }).send(c.buf);
});
app.get('/logo/:id.png', async (req, res) => {
  if (!/^(?:l-)?\d{1,8}$/.test(req.params.id)) return res.status(400).end();
  try {
    if (!logoJobs.has(req.params.id)) logoJobs.set(req.params.id, feeds.makeLogo(req.params.id).finally(() => setTimeout(() => logoJobs.delete(req.params.id), 1000)));
    const file = await logoJobs.get(req.params.id);
    res.set('Cache-Control', 'public, max-age=86400'); res.sendFile(file);
  } catch (e) { res.status(404).end(); }
});

// İşletme medyası: rastgele dosya adlarıyla, uzun süreli önbellek (TV videoyu başlıksız isteyebilsin diye herkese açık)
app.get('/u/:tid/:file', (req, res) => {
  const { tid, file } = req.params;
  if (!/^[a-f0-9]{6,32}$/.test(tid) || !/^[\w-]+\.[a-z0-9]{1,5}$/i.test(file)) return res.status(400).end();
  const t = tenants.get(tid); if (!t) return res.status(404).end();
  // yüklenen dosya hiçbir zaman sayfa gibi çalışamaz (SVG içi betik vb.): sandbox + tür tahmini kapalı
  res.set('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  res.set('X-Content-Type-Options', 'nosniff');
  require('./storage').serve(req, res, t, file);
});
function makeApkFilename(name) {
  if (!name) return `${config.BRAND}.apk`;
  const tr = { 'ç':'c', 'Ç':'C', 'ğ':'g', 'Ğ':'G', 'ı':'i', 'I':'I', 'İ':'I', 'ö':'o', 'Ö':'O', 'ş':'s', 'Ş':'S', 'ü':'u', 'Ü':'U' };
  let clean = String(name).replace(/[çÇğĞıIİöÖşŞüÜ]/g, m => tr[m] || m);
  clean = clean.replace(/[^a-zA-Z0-9]/g, '');
  if (!clean) return `${config.BRAND}.apk`;
  if (!/tv$/i.test(clean)) clean += 'TV';
  return `${clean}.apk`;
}

// Windows uygulaması: GitHub Releases'teki son sürüme yönlendirir (derleme: .github/workflows/desktop.yml)
const DESKTOP_URL = process.env.DESKTOP_URL || 'https://github.com/ooemir23/screenpano.com/releases/latest/download/ScreenPano-Setup.exe';
app.get('/app.exe', (req, res) => { res.set('Cache-Control', 'no-cache'); res.redirect(302, DESKTOP_URL); });
app.get('/app.apk', (req, res) => {
  const f = path.join(config.PUBLIC_DIR, 'app.apk');
  if (!fs.existsSync(f)) return res.status(404).send('APK henüz yüklenmedi');

  let bizName = req.query.name || req.query.biz || '';
  if (!bizName) {
    const u = auth.sessionUser(req);
    if (u) {
      const tid = u.imp || u.tenant_id;
      if (tid) {
        const t = tenants.get(tid);
        if (t && t.name) bizName = t.name;
      }
    }
  }

  const downloadName = makeApkFilename(bizName);
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.download(f, downloadName);
});
app.use(express.static(config.PUBLIC_DIR, {
  index: false,
  setHeaders: (res, file) => {
    if (/\.(woff2|png|jpe?g|webp)$/.test(file)) res.setHeader('Cache-Control', 'public, max-age=2592000');
    else if (/\.svg$/.test(file)) res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  },
}));
app.use('/api', (req, res) => res.status(404).json({ error: 'bulunamadı' }));
// Beklenmeyen hatalar (dosya boyutu, bozuk JSON vb.): süreç düşmez, anlaşılır yanıt döner
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const code = err.status || err.statusCode || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (code >= 500) console.error('İstek hatası:', req.method, req.path, err.message);
  res.status(code).json({ error: code === 413 ? 'Dosya çok büyük' : code === 400 ? 'Geçersiz istek' : 'Sunucu hatası' });
});

const server = http.createServer(app);
realtime.attach(server);
feeds.start();
media.resumeAll();
media.backfillDurations(); // eski videoların süresi ölçülür: ekranlar arası senkron için
require('./routes-admin').startJobs();
require('./storage').start();
require('./backup').start();
require('./monitor').start();
require('./stats').start();
require('./weekly').start();
require('./happy').start();
require('./social').start();
// Sağlık kontrolü (Dokploy/izleme)
app.get('/health', (req, res) => res.json({ ok: true, up: Math.round(process.uptime()) }));
process.on('unhandledRejection', e => console.error('Yakalanmamış söz:', e && e.message ? e.message : e));
// Kapatma (deploy/docker stop): bekleyen kayıtlar diske yazılır, WAL birleştirilir, bağlantılar kapanır
let closing = false;
function shutdown(sig) {
  if (closing) return; closing = true;
  console.log(sig + ': kapanıyor, bekleyen kayıtlar yazılıyor');
  try { tenants.flushAll(); } catch (e) { console.error('Kayıt yazılamadı:', e.message); }
  try { require('./store').sql.pragma('wal_checkpoint(TRUNCATE)'); } catch (e) {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
server.listen(config.PORT, () => console.log(`${config.BRAND} çalışıyor: http://localhost:${config.PORT}`));
