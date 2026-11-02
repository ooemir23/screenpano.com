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

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
// www.screenpano.com -> screenpano.com (tek adres; arama motorları için kalıcı yönlendirme)
app.use((req, res, next) => {
  const host = String(req.headers.host || '');
  if (/^www\./i.test(host)) return res.redirect(301, `https://${host.slice(4)}${req.originalUrl}`);
  next();
});
app.use(require('compression')());
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin'); next(); });

const page = file => (req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(config.PUBLIC_DIR, file)); };
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
// Tanıtım sitesi: şablon + public/site/features.json (server/site.js)
const sitePage = lang => require('./site').render(require('./store'), tenants, require('./plans').access, lang);
for (const k of require('./legal').KEYS) app.get('/' + k, (req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.type('html').send(require('./legal').render(k)); });
// TV çevrimdışı önbelleği: service worker kök kapsamda ve her zaman taze
app.get('/sw.js', (req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Service-Worker-Allowed', '/'); res.type('js').sendFile(path.join(config.PUBLIC_DIR, 'sw.js')); });
app.get('/login', page('login.html'));
app.get('/tv', page('tv.html'));
app.get('/panel', (req, res, next) => (auth.sessionUser(req) ? page('panel.html')(req, res, next) : res.redirect('/login')));
app.get('/super', (req, res, next) => { const u = auth.sessionUser(req); return u && u.role === 'super' ? page('super.html')(req, res, next) : res.redirect('/login'); });

app.use('/api/auth', require('./routes-auth'));
app.use('/api/tv', require('./routes-tv').router);
app.use('/api/admin', require('./routes-admin').router);
app.use('/api/super', require('./routes-super'));

// İBB trafik değeri (Cloudflare Worker imzalı)
app.post('/api/traffic/report', (req, res) => { const [code, msg] = feeds.reportTraffic(req.body || {}); res.status(code).json(code === 200 ? { ok: true } : { error: msg }); });
app.get('/traffic-map.jpg', (req, res) => { if (!feeds.mapAt) return res.status(404).end(); res.set('Cache-Control', 'no-cache'); res.sendFile(feeds.MAP_FILE); });
const logoJobs = new Map();
app.get('/logo/:id.png', async (req, res) => {
  if (!/^\d{1,8}$/.test(req.params.id)) return res.status(400).end();
  try {
    if (!logoJobs.has(req.params.id)) logoJobs.set(req.params.id, feeds.makeLogo(req.params.id).finally(() => setTimeout(() => logoJobs.delete(req.params.id), 1000)));
    const file = await logoJobs.get(req.params.id);
    res.set('Cache-Control', 'public, max-age=2592000, immutable'); res.sendFile(file);
  } catch (e) { res.status(404).end(); }
});

// İşletme medyası: rastgele dosya adlarıyla, uzun süreli önbellek (TV videoyu başlıksız isteyebilsin diye herkese açık)
app.get('/u/:tid/:file', (req, res) => {
  const { tid, file } = req.params;
  if (!/^[a-f0-9]{6,32}$/.test(tid) || !/^[\w-]+\.[a-z0-9]{1,5}$/i.test(file)) return res.status(400).end();
  const t = tenants.get(tid); if (!t) return res.status(404).end();
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

const server = http.createServer(app);
realtime.attach(server);
feeds.start();
media.resumeAll();
require('./routes-admin').startJobs();
require('./storage').start();
require('./backup').start();
require('./monitor').start();
require('./stats').start();
require('./social').start();
server.listen(config.PORT, () => console.log(`${config.BRAND} çalışıyor: http://localhost:${config.PORT}`));
