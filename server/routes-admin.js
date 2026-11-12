// İşletme paneli API'si (/api/admin/*). Her istek oturumdaki kullanıcının işletmesine (req.t) bağlıdır.
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');
const config = require('./config');
const store = require('./store');
const auth = require('./auth');
const tenants = require('./tenants');
const hub = require('./hub');
const F = require('./feeds');
const media = require('./media');
const { PLANS, plan, access } = require('./plans');
const W = require('./widgets');
const { publicState, CAMP_QR, pubCamp } = require('./state');

const r = express.Router();
const HOUR = F.HOUR;

// Çoklu şube: işletme sahibi aynı zincirdeki (org_id) başka bir şubeye geçmiş olabilir
function activeTenantId(u) {
  if (u.role === 'super') return u.imp;
  const imp = auth.impOf(u); if (imp) return imp; // süper yetkili işletme sahibi başka işletmeye girmiş
  if (u.br && u.br !== u.tenant_id && u.role === 'owner') {
    const home = tenants.get(u.tenant_id), br = tenants.get(u.br);
    if (home && br && home.org_id && br.org_id === home.org_id) return br.id;
  }
  return u.tenant_id;
}
// ---- kimlik: işletme sahibi/personeli ya da "işletme olarak giren" süper yönetici ----
r.use((req, res, next) => {
  const u = auth.sessionUser(req);
  const tid = u && activeTenantId(u);
  const t = tid && tenants.get(tid);
  if (!u || !t) return res.status(401).json({ error: 'Giriş gerekli' });
  req.user = u; req.t = t;
  next();
});
const ownerOnly = (req, res, next) => (req.user.role === 'staff' ? res.status(403).json({ error: 'Bu işlem için işletme sahibi yetkisi gerekir' }) : next());
const changed = t => { tenants.save(t); hub.pushTenant(t.id); };
// Yüklenen SVG içinde betik çalışabilir: PNG'ye çevrilir (sharp/librsvg betik çalıştırmaz), asıl dosya silinir.
// Çevrilemezse SVG reddedilir.
async function svgToPng(t, f) {
  if (!/\.svg$/i.test(f.originalname)) return f.filename;
  let sharp; try { sharp = require('sharp'); } catch (e) { sharp = null; }
  const src = path.join(t.dirs.uploads, f.filename);
  if (!sharp) { rmUpload(t, f.filename); return null; }
  const name = f.filename.replace(/\.[^.]+$/, '') + '.png';
  try { await sharp(src, { density: 300 }).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: false }).png().toFile(path.join(t.dirs.uploads, name)); }
  catch (e) { rmUpload(t, f.filename); return null; }
  rmUpload(t, f.filename);
  return name;
}
const sendTo = (t, msg) => hub.send(x => x.id === t.id, msg);

// ---- yükleme: işletmenin kendi klasörü + paket kotası ----
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, f, cb) => cb(null, req.t.dirs.uploads),
    filename: (_, f, cb) => cb(null, auth.uid(16) + path.extname(f.originalname).toLowerCase().slice(0, 6)),
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 50 },
});
const quota = (req, res, next) => {
  const lim = plan(req.t).storageMB * 1024 * 1024, used = media.usedBytes(req.t);
  const incoming = Number(req.headers['content-length']) || 0;
  if (used + incoming > lim) return res.status(413).json({ error: `Depolama kotası doldu (${Math.round(used / 1048576)} / ${plan(req.t).storageMB} MB). Eski dosyaları silin ya da paketinizi yükseltin.` });
  next();
};
// Video/fotoğraf yüklemesi (küçültülecek): kota küçültülmüş dosyalara göre. Ham dosya için geçici pay:
// bekleyen ham yüklemeler + yeni gelen en çok RAW_MAX (diski korur); asıl kontrol küçültme bittikten sonra (media.js).
const RAW_MAX = 4 * 1024 * 1024 * 1024;
const quotaMsg = t => `Depolama kotası doldu (${Math.round(media.settledBytes(t) / 1048576)} / ${plan(t).storageMB} MB). Eski dosyaları silin ya da paketinizi yükseltin.`;
const quotaMedia = (req, res, next) => {
  const t = req.t, incoming = Number(req.headers['content-length']) || 0;
  if (media.settledBytes(t) >= media.limitBytes(t)) return res.status(413).json({ error: quotaMsg(t) });
  if (media.pendingRawBytes(t) + incoming > RAW_MAX) return res.status(413).json({ error: 'Önceki yüklemeler hâlâ hazırlanıyor. Birkaç dakika sonra tekrar deneyin.' });
  next();
};
const postQuotaMedia = (req, res, next) => {
  const t = req.t, files = req.files || (req.file ? [req.file] : []);
  if (!files.length) return next();
  const fresh = new Set(files.map(f => f.filename)), size = files.reduce((n, f) => n + (f.size || 0), 0);
  const raw = new Set([...(t.db.videos || []).filter(v => v.status === 'processing' && !v.reopt && v.file).map(v => v.file), ...fresh]);
  const settled = require('./storage').usedBytes(t, raw);
  if (settled >= media.limitBytes(t) || media.pendingRawBytes(t) + size > RAW_MAX) {
    for (const f of files) rmUpload(t, f.filename);
    return res.status(413).json({ error: settled >= media.limitBytes(t) ? quotaMsg(t) : 'Önceki yüklemeler hâlâ hazırlanıyor. Birkaç dakika sonra tekrar deneyin.' });
  }
  next();
};
// multer diske yazdıktan sonra gerçek boyutla kota: Content-Length yoksa (chunked yükleme) aşım burada yakalanır.
// Kullanım hesabı yeni dosyaları zaten içerdiğinde gelen dosyalar silinir — çift sayım yapılmaz.
const postQuota = (req, res, next) => {
  const files = req.files || (req.file ? [req.file] : []);
  if (!files.length) return next();
  const used = media.usedBytes(req.t), lim = plan(req.t).storageMB * 1024 * 1024;
  if (used > lim) {
    for (const f of files) rmUpload(req.t, f.filename);
    return res.status(413).json({ error: `Depolama kotası doldu (${Math.round(used / 1048576)} / ${plan(req.t).storageMB} MB). Eski dosyaları silin ya da paketinizi yükseltin.` });
  }
  next();
};
const fileSize = (t, f) => { try { return fs.statSync(path.join(t.dirs.uploads, f)).size; } catch { const o = store.q.objGet.get(t.id, f); if (o) return o.size; throw new Error('yok'); } };
const rmUpload = (t, file) => require('./storage').remove(t, file);

// ================= HESAP, İŞLETME, PAKET =================
r.get('/me', (req, res) => {
  const t = req.t, p = plan(t), acc = access(t);
  res.json({
    user: { id: req.user.id, username: req.user.username, role: req.user.role, name: req.user.name, impersonating: !!auth.impOf(req.user) },
    tenant: { id: t.id, name: t.name, plan: p, status: t.status, access: acc, trialUntil: t.trial_until, paidUntil: t.paid_until, location: t.db.location, menuCount: ((t.db.menu || {}).categories || []).length, logo: t.db.logo ? t.upBase + t.db.logo : null, theme: t.db.theme, notifyEmail: (t.db.notify && t.db.notify.email) || '', emailVerified: !!(t.db.notify && t.db.notify.verified) },
    upBase: t.upBase, brand: config.BRAND, plans: PLANS,
    usage: { devices: store.q.devicesOf.all(t.id).length, storageBytes: media.usedBytes(t), users: store.q.usersOf.all(t.id).length },
  });
});
r.put('/profile', ownerOnly, (req, res) => {
  const t = req.t, b = req.body || {};
  if (typeof b.name === 'string' && b.name.trim()) { store.updateTenant(t.id, { name: b.name.trim().slice(0, 80) }); tenants.refreshRow(t.id); }
  if (b.location && typeof b.location.city === 'string') {
    const lat = Number(b.location.lat), lon = Number(b.location.lon);
    if (isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      t.db.location = { city: b.location.city.trim().slice(0, 60), lat, lon, custom: true };
      F.refreshWeather();
      F.resolvePharmacy(t).then(ok => ok && F.refreshPharmacies()).catch(() => {});
    }
  }
  changed(t); res.json({ ok: true });
});
// şehir arama (Open-Meteo geocoding, ücretsiz; Türkiye ve dünya şehirleri)
r.get('/geo', async (req, res) => {
  const qy = String(req.query.q || '').trim();
  if (qy.length < 2) return res.json([]);
  try {
    const cp = req.query.tr ? '&countryCode=TR' : '';
    const j = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(qy)}&count=10&language=tr${cp}`)).json();
    res.json((j.results || []).map(x => ({ city: x.name, country: x.country || '', admin: x.admin1 || '', lat: x.latitude, lon: x.longitude })));
  } catch (e) { res.status(502).json({ error: 'Şehir araması yapılamadı' }); }
});
// hava durumu sorgusu (panel önizlemesi ve widget konum testi için)
r.get('/weather', async (req, res) => {
  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return res.status(400).json({ error: 'Geçersiz koordinat' });
  const w = await F.getWeather(lat, lon);
  if (!w) return res.status(502).json({ error: 'Hava durumu alınamadı' });
  res.json(w);
});
// tarayıcı konumundan şehir adı bul (koordinat ~1 km'ye yuvarlanıp gönderilir; yalnız işletme konumu, kişisel veri değil)
r.get('/geo/reverse', async (req, res) => {
  const lat = Math.round(Number(req.query.lat) * 100) / 100, lon = Math.round(Number(req.query.lon) * 100) / 100;
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return res.status(400).json({ error: 'Geçersiz konum' });
  let city = '', admin = '';
  try {
    const j = await (await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=tr`, { signal: AbortSignal.timeout(6000) })).json();
    city = j.locality || j.city || ''; admin = j.principalSubdivision || '';
  } catch (e) { /* ad bulunamasa da koordinat yeter; hava durumu koordinatla çalışır */ }
  res.json({ city: city || 'Konumum', admin, lat, lon });
});
r.put('/password', (req, res) => {
  const { current, next: nw } = req.body || {};
  const u = store.q.userGet.get(req.user.id);
  if (!auth.checkPassword(current, u.pass)) return res.status(400).json({ error: 'Mevcut şifre yanlış' });
  if (String(nw || '').length < 8) return res.status(400).json({ error: 'Yeni şifre en az 8 karakter olmalı' });
  store.q.userPass.run(auth.hashPassword(nw), u.id);
  // parola değişti: tüm oturumlar düşer; bu tarayıcı kalmaya devam etsin diye oturum tazelenir
  store.bumpEpoch(u.id);
  auth.setSession(req, res, store.q.userGet.get(u.id), { ...(req.user.imp ? { imp: req.user.imp } : {}), ...(req.user.br ? { br: req.user.br } : {}) });
  res.json({ ok: true });
});
r.get('/users', (req, res) => res.json(store.q.usersOf.all(req.t.id)));
r.post('/users', ownerOnly, (req, res) => {
  const t = req.t, b = req.body || {};
  const username = String(b.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) return res.status(400).json({ error: 'Kullanıcı adı 3-32 karakter; harf, rakam, nokta, tire' });
  if (String(b.password || '').length < 8) return res.status(400).json({ error: 'Şifre en az 8 karakter olmalı' });
  if (store.q.usersOf.all(t.id).length >= plan(t).users) return res.status(400).json({ error: `Paketinizde en çok ${plan(t).users} kullanıcı var` });
  if (store.q.userByName.get(username)) return res.status(400).json({ error: 'Bu kullanıcı adı alınmış' });
  store.q.userIns.run({ id: auth.uid(), tenant_id: t.id, username, pass: auth.hashPassword(b.password), role: 'staff', name: String(b.name || '').slice(0, 60), created: Date.now() });
  res.json({ ok: true });
});
r.delete('/users/:id', ownerOnly, (req, res) => {
  const u = store.q.userGet.get(req.params.id);
  if (!u || u.tenant_id !== req.t.id || u.role === 'owner') return res.status(400).json({ error: 'Bu kullanıcı silinemez' });
  store.q.userDel.run(u.id, req.t.id); res.json({ ok: true });
});

// ================= GÖRÜNÜM: tema, logo, katalog =================
r.get('/catalog', (req, res) => res.json({ world: require('./world').CITIES, worldMax: require('./world').MAX, cols: W.COLS, rows: W.ROWS, widgets: W.WIDGETS, templates: W.TEMPLATES, themes: W.THEMES, fonts: W.FONTS, starters: require('./starters').list(), pro: plan(req.t).pro, designs: designList(), canDesigns: designCan(req) }));
// Ortak tasarımlar: süper yönetim yetkisi olan işletme düzen + renk tasarımını kalıcı kaydeder, tüm işletmeler uygular.
// İşletmeye özel içerik (QR seçimi, görsel adresi, metinler) kaydedilmez; medya, logo ve fiyat listesi hiç dokunulmaz.
const designAll = () => { try { return JSON.parse(store.setting('sharedDesigns', '[]')) || []; } catch { return []; } };
const designList = () => designAll().map(({ id, name, desc, by, at, layout, theme }) => ({ id, name, desc, by, at, layout, theme }));
const designCan = req => auth.superOk(req.user);
const designStrip = l => { // işletmeye özel props alanları atılır; cleanLayout eksikleri varsayılanla doldurur
  const out = W.cleanLayout(l);
  for (const w of out.widgets) if (w.props) for (const k of ['qr', 'qrs', 'url', 'i18n', 'body', 'title']) delete w.props[k];
  return W.cleanLayout(out);
};
r.post('/designs', (req, res) => {
  if (!designCan(req)) return res.status(403).json({ error: 'Bu işlem için süper yönetim yetkisi gerekir' });
  const t = req.t, b = req.body || {}, name = String(b.name || '').trim().slice(0, 40);
  if (!name) return res.status(400).json({ error: 'Tasarıma bir ad verin' });
  const sc = tenants.mainScreen(t), cur = store.J(sc.layout);
  if (!cur || !Array.isArray(cur.widgets)) return res.status(400).json({ error: 'Kaydedilmiş düzen yok' });
  const all = designAll();
  if (all.length >= 40) return res.status(400).json({ error: 'En çok 40 ortak tasarım kaydedilebilir; birini silin' });
  const { name: _n, ...th } = t.db.theme || {};
  all.push({ id: 'd' + Date.now().toString(36), name, desc: String(b.desc || '').trim().slice(0, 140), by: t.name, at: Date.now(), layout: designStrip(cur), theme: W.cleanTheme(th, {}) });
  store.setSetting('sharedDesigns', JSON.stringify(all)); res.json({ ok: true, designs: designList() });
});
r.delete('/designs/:id', (req, res) => {
  if (!designCan(req)) return res.status(403).json({ error: 'Bu işlem için süper yönetim yetkisi gerekir' });
  store.setSetting('sharedDesigns', JSON.stringify(designAll().filter(d => d.id !== req.params.id))); res.json({ ok: true, designs: designList() });
});
r.post('/designs/:id/apply', ownerOnly, (req, res) => {
  const t = req.t, d = designAll().find(x => x.id === req.params.id);
  if (!d) return res.status(404).json({ error: 'Tasarım bulunamadı' });
  const l = W.cleanLayout(d.layout);
  // Pro'ya özel kutular kayıtta silinmez; ekrana Başlangıç'ta saat olarak gider (widgets.forPlan), Pro'ya geçince geri gelir
  store.updateScreen(tenants.mainScreen(t).id, t.id, { layout: JSON.stringify(W.cleanLayout(l)) });
  t.db.theme = W.cleanTheme({ ...t.db.theme, ...d.theme }, t.db.theme);
  changed(t); res.json({ ok: true });
});
// Başlangıç paketleri: düzen + renk + (isteğe bağlı) örnek fiyat listesi. Medya, logo ve diğer içerikler korunur.
r.get('/starters', (req, res) => res.json({ list: require('./starters').list(), hasMenu: (req.t.db.menu.categories || []).length > 0 }));
r.post('/starter', ownerOnly, (req, res) => { // düzeni ve (istenirse) fiyat listesini ezer: ortak tasarım uygulama gibi yalnız sahip
  const t = req.t, b = req.body || {}, st = require('./starters').build(String(b.key || ''), plan(t).pro);
  if (!st) return res.status(400).json({ error: 'Geçersiz paket' });
  store.updateScreen(tenants.mainScreen(t).id, t.id, { layout: JSON.stringify(st.layout) });
  t.db.theme = { ...t.db.theme, ...st.doc.theme };
  const hadMenu = (t.db.menu.categories || []).length > 0;
  if (st.doc.menu && (!hadMenu || b.replaceMenu === true)) t.db.menu = st.doc.menu; // dolu fiyat listesi yalnız açıkça istenirse ezilir
  changed(t); res.json({ ok: true, menuReplaced: !!(st.doc.menu && (!hadMenu || b.replaceMenu === true)) });
});
// Tasarımı varsayılana döndür: layout (düzen), colors (renk/tema; logo kalır), tv (kenar payı, efekt), all
r.post('/design/reset', ownerOnly, (req, res) => {
  const t = req.t, scope = String((req.body || {}).scope || 'all'), all = scope === 'all';
  if (!['layout', 'colors', 'tv', 'all'].includes(scope)) return res.status(400).json({ error: 'Geçersiz kapsam' });
  if (all || scope === 'layout') {
    const sc = tenants.mainScreen(t), cur = store.J(sc.layout) || {}, or = !all && [90, 270].includes(Number(cur.orient)) ? Number(cur.orient) : 0;
    const l = W.cleanLayout({ ...W.defaultLayout(or ? 'dikey_menu' : 'spor'), ...(or ? { orient: or } : {}) });
    store.updateScreen(sc.id, t.id, { layout: JSON.stringify(l) });
  }
  if (all || scope === 'colors') { const { name, ...th } = W.THEMES.kahve; t.db.theme = W.cleanTheme(th, {}); }
  if (all || scope === 'tv') {
    t.db.safeInset = 0; t.db.safeGuide = false; t.db.fxMode = 'auto';
    for (const k of ['L', 'R', 'T', 'B']) delete t.db['safe' + k];
    if (scope === 'tv') {
      const sc = tenants.mainScreen(t), cur = W.cleanLayout(store.J(sc.layout) || W.defaultLayout());
      delete cur.orient; store.updateScreen(sc.id, t.id, { layout: JSON.stringify(cur) });
    }
  }
  changed(t); res.json({ ok: true });
});
r.put('/theme', (req, res) => { req.t.db.theme = W.cleanTheme(req.body || {}, req.t.db.theme); changed(req.t); res.json({ ok: true, theme: req.t.db.theme }); });
r.post('/logo', quota, upload.single('file'), postQuota, async (req, res) => {
  const f = req.file, t = req.t;
  try {
    if (!f) return res.status(400).json({ error: 'dosya yok' });
    if (!/\.(png|jpe?g|webp|svg)$/i.test(f.originalname) || f.size > 5 * 1024 * 1024) { rmUpload(t, f.filename); return res.status(400).json({ error: 'PNG/JPG/WEBP/SVG ve en çok 5 MB olmalı' }); }
    // beyaz zeminli (alfasız) logolarda zemini kenardan şeffaf yap; şeffaf dosyalara ve SVG'ye dokunulmaz
    let name = await svgToPng(t, f), bg = '';
    if (!name) return res.status(400).json({ error: 'SVG dosyası okunamadı; PNG olarak yükleyin' });
    if (/\.(png|jpe?g|webp)$/i.test(f.originalname)) {
      try {
        const c = await require('./logobg').clean(path.join(t.dirs.uploads, f.filename), t.dirs.uploads);
        if (c.ok) { rmUpload(t, f.filename); name = c.name; bg = 'removed'; }
        else if (c.mode === 'transparent' || c.mode === 'opaque') bg = c.mode;
      } catch (e) { /* temizleme başarısızsa logo olduğu gibi kullanılır */ }
    }
    rmUpload(t, t.db.logo); t.db.logo = name;
    changed(t); res.json({ ok: true, url: t.upBase + name, bg });
  } catch (e) { res.status(500).json({ error: 'Logo kaydedilemedi' }); }
});
r.delete('/logo', (req, res) => { rmUpload(req.t, req.t.db.logo); req.t.db.logo = null; changed(req.t); res.json({ ok: true }); });
// görsel widget'ı için resim
r.post('/assets', quota, upload.single('file'), postQuota, async (req, res) => {
  const f = req.file, t = req.t;
  if (!f) return res.status(400).json({ error: 'dosya yok' });
  if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(f.originalname) || f.size > 15 * 1024 * 1024) { rmUpload(t, f.filename); return res.status(400).json({ error: 'Resim dosyası ve en çok 15 MB olmalı' }); }
  const file = await svgToPng(t, f);
  if (!file) return res.status(400).json({ error: 'SVG dosyası okunamadı; PNG olarak yükleyin' });
  t.db.assets = (t.db.assets || []).concat({ id: auth.uid(), file, name: f.originalname.slice(0, 80) }).slice(-50);
  changed(t); res.json({ ok: true, url: t.upBase + file });
});

// ================= EKRAN VE CİHAZLAR =================
// Çoklu TV / bağımsız ekran: varsayılan "Ana Ekran" dışında ek ekranlar (ör. Menü Ekranı, Salon 2) oluşturulup kutulara atanabilir.
r.get('/screen', (req, res) => {
  const t = req.t, m0 = tenants.mainScreen(t), online = hub.onlineDeviceIds();
  const rows = store.q.screensOf.all(t.id);
  const enrich = l => {
    const out = l || W.defaultLayout();
    if (Array.isArray(out.widgets)) {
      out.widgets = out.widgets.map(w => w.type === 'worldclock' ? { ...w, props: { ...(w.props || {}), cities: require('./world').cities((w.props || {}).zones || W.WIDGETS.worldclock.props.zones) } } : w);
    }
    return out;
  };
  const screens = rows.map(x => ({ id: x.id, name: x.name, layout: enrich(store.J(x.layout)), sort: x.sort }));
  const qid = String(req.query.screen || req.query.screenId || '').trim();
  const active = (qid && screens.find(x => x.id === qid)) || screens[0] || { id: m0.id, name: m0.name, layout: enrich(store.J(m0.layout)) };
  res.json({
    layout: active.layout,
    activeScreenId: active.id,
    screens,
    devices: store.q.devicesOf.all(t.id).map(d => ({ ...d, online: online.has(d.id) })),
    limit: plan(t).devices,
    offlineMin: require('./monitor').offlineMin(t),
  });
});
r.put('/screen', (req, res) => {
  const t = req.t, b = req.body || {}, l = W.cleanLayout(b.layout);
  if (!l.widgets.some(w => w.type === 'media' || w.type === 'menu')) return res.status(400).json({ error: 'Düzende en az bir Medya oynatıcı ya da Fiyat listesi olmalı' });
  const rows = store.q.screensOf.all(t.id);
  const target = (b.screenId && rows.find(x => x.id === b.screenId)) || tenants.mainScreen(t);
  store.updateScreen(target.id, t.id, { layout: JSON.stringify(l) }); hub.pushTenant(t.id); res.json({ ok: true, screenId: target.id });
});
r.post('/screens', (req, res) => {
  const t = req.t, b = req.body || {}, name = String(b.name || '').trim().slice(0, 40) || 'Yeni Ekran';
  const rows = store.q.screensOf.all(t.id);
  if (rows.length >= 10) return res.status(400).json({ error: 'En çok 10 ayrı ekran profili oluşturulabilir' });
  const baseSc = (b.fromId && rows.find(x => x.id === b.fromId)) || rows[0] || tenants.mainScreen(t);
  const layout = b.template ? JSON.stringify(W.cleanLayout(W.defaultLayout(b.template))) : baseSc.layout;
  const row = { id: auth.uid(12), tenant_id: t.id, name, layout, sort: rows.length, created: Date.now() };
  store.q.screenIns.run(row);
  res.json({ ok: true, screen: { id: row.id, name: row.name, layout: store.J(row.layout) || W.defaultLayout(), sort: row.sort } });
});
r.put('/screens/:id', (req, res) => {
  const t = req.t, name = String((req.body || {}).name || '').trim().slice(0, 40);
  if (!name) return res.status(400).json({ error: 'Ekran adı boş olamaz' });
  store.updateScreen(req.params.id, t.id, { name });
  hub.pushTenant(t.id);
  res.json({ ok: true });
});
r.delete('/screens/:id', (req, res) => {
  const t = req.t, rows = store.q.screensOf.all(t.id);
  if (rows.length <= 1) return res.status(400).json({ error: 'En az bir ekran kalmalıdır' });
  store.q.screenDel.run(req.params.id, t.id);
  hub.pushTenant(t.id);
  res.json({ ok: true });
});
// TV'de görünen 6 haneli kodla cihazı bağla
r.post('/pair', (req, res) => {
  const tv = require('./routes-tv');
  const err = tv.claimPair(String((req.body || {}).code || '').replace(/\D/g, ''), req.t, req.headers['user-agent']);
  if (err) return res.status(400).json({ error: err });
  res.json({ ok: true });
});
r.put('/devices/:id', (req, res) => {
  const b = req.body || {};
  if (typeof b.name === 'string') store.q.deviceRename.run(b.name.trim().slice(0, 40), req.params.id, req.t.id);
  if (typeof b.native === 'boolean' && store.q.devicesOf.all(req.t.id).some(d => d.id === req.params.id)) { store.q.deviceNative.run(b.native ? 1 : 0, req.params.id, req.t.id); hub.setNative(req.params.id, b.native); }
  if (b.screen_id !== undefined && store.q.devicesOf.all(req.t.id).some(d => d.id === req.params.id)) {
    const sid = b.screen_id && store.q.screensOf.all(req.t.id).some(s => s.id === b.screen_id) ? String(b.screen_id) : null;
    store.q.deviceMove.run(sid, req.params.id, req.t.id);
    if (hub.setScreen) hub.setScreen(req.params.id, sid);
  }
  res.json({ ok: true });
});
r.delete('/devices/:id', (req, res) => { store.q.deviceDel.run(req.params.id, req.t.id); hub.kickDevice(req.params.id); require('./monitor').forgetDevice(req.params.id); res.json({ ok: true }); });
// TV uygulamasından uzaktan çıkış: kutu oturumunu kapatıp giriş ekranına döner (token geçersiz olur)
r.post('/devices/:id/logout', (req, res) => { store.q.deviceDel.run(req.params.id, req.t.id); hub.kickDevice(req.params.id); require('./monitor').forgetDevice(req.params.id); res.json({ ok: true }); });
r.post('/devices/reload', (req, res) => { sendTo(req.t, { type: 'reload' }); res.json({ ok: true }); });

// ================= FİYAT TARİFESİ =================
// Ürün adından kalori: aynı ad bir daha API'ye gitmez (sonuç süresiz önbellekte)
r.post('/calories', async (req, res) => {
  try {
    const q = String((req.body || {}).query || '').trim().slice(0, 60);
    const r2 = await F.calories(q);
    res.json(r2 ? { ok: true, kcal: r2.kcal, name: r2.name } : { ok: false, error: 'Bu ürün için kalori bilgisi bulunamadı' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
r.put('/menu', (req, res) => {
  const b = req.body || {}, s = (v, n) => String(v ?? '').trim().slice(0, n), SCH = require('./sched'), LANGS = require('./state').LANGS;
  // çeviriler: { en: 'Hot drinks' } ya da { en: { name, desc } }
  const tr = (o, fn) => { const out = {}; if (o && typeof o === 'object') for (const l of LANGS) if (l !== 'tr' && o[l] != null) { const v = fn(o[l]); if (v) out[l] = v; } return Object.keys(out).length ? out : undefined; };
  // indirim saatleri: saat aralığı olmadan kaydedilmez; eski istemci tek `happy` + `c.happy` gönderirse 'h1' olarak çevrilir
  const rawHours = Array.isArray(b.happies) ? b.happies : (b.happy ? [{ ...b.happy, id: 'h1' }] : []), seen = new Set();
  const happies = rawHours.slice(0, 6).map(h => {
    const sch = h && SCH.clean(h.sch); if (!sch) return null;
    let id = String(h.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 10); if (!id || seen.has(id)) id = 'h' + Math.random().toString(36).slice(2, 8); seen.add(id);
    return { id, label: s(h.label, 24) || 'Happy Hour', pct: Math.max(0, Math.min(90, Math.round(Number(h.pct) || 0))), sch };
  }).filter(Boolean);
  const hhOf = c => Array.isArray(c.hh) ? [...new Set(c.hh.map(String))].filter(x => seen.has(x)) : (c.happy === true && !Array.isArray(b.happies) && seen.has('h1') ? ['h1'] : []);
  const cats = (Array.isArray(b.categories) ? b.categories : []).slice(0, 20).map(c => ({
    name: s(c.name, 40), sch: SCH.clean(c.sch) || undefined, t: tr(c.t, v => s(v, 40)), hh: hhOf(c).length ? hhOf(c) : undefined,
    items: (Array.isArray(c.items) ? c.items : []).slice(0, 60).map(i => ({
      name: s(i.name, 60), price: s(i.price, 16), hp: s(i.hp, 16) || undefined, desc: s(i.desc, 90), off: i.off === true || undefined, kcal: s(i.kcal, 14) || undefined,
      img: s(i.img, 180) || undefined,
      t: tr(i.t, v => { const n = s(v && v.name, 60), d = s(v && v.desc, 90); return n || d ? { name: n, desc: d } : null; }),
    })).filter(i => i.name),
  })).filter(c => c.name || c.items.length);
  req.t.db.menu = { title: s(b.title, 40) || 'Fiyat Listesi', currency: s(b.currency, 4) || '₺', categories: cats, t: tr(b.t, v => s(v, 40)), happies: happies.length ? happies : undefined };
  const hc = req.t.db.happyCard; if (hc) { if (!happies.length) hc.on = false; if (hc.hid && !seen.has(hc.hid)) hc.hid = undefined; }
  changed(req.t); res.json({ ok: true });
});

// ================= DURUM (önizleme ve genel bakış için) =================
r.get('/state', (req, res) => res.json(publicState(req.t, req.query.screen ? String(req.query.screen) : undefined)));
r.get('/vidlen', (req, res) => res.json(typeof require('./vidlen').dump === 'function' ? require('./vidlen').dump() : {})); // video süresi ölçümleri (tanılama)

// ======================================================================
// Aşağısı eski tek-kafe sürümünün yönetim uçları; davranış aynı, veri işletmeye ait.
// ======================================================================
r.get('/db', (req, res) => {
  const { trafficSecret, instagram, ytAuth, oauthApps, music, ...rest } = req.t.db; // gizli anahtarlar panele gönderilmez
  if (instagram) { const { token, ...ig } = instagram; rest.instagram = { ...ig, connected: !!token }; }
  // müzik: panele yalnız TV'de çalması için gereken accessToken gider; uzun ömürlü refreshToken dışarı sızmaz
  if (music) rest.music = { ...music, spotify: { ...(music.spotify || {}), refreshToken: undefined } };
  if (Array.isArray(rest.videos)) {
    rest.videos = rest.videos.map(v => v.status === 'processing' ? { ...v, job: media.jobInfo ? media.jobInfo(v.id) : null } : v);
  }
  res.json(rest);
});
r.get('/leagues', (req, res) => res.json({
  catalog: F.CATALOG.map(([code, label, group]) => ({ code, label, group })),
  enabled: F.enabledLeagues(req.t).map(([code]) => code),
  tables: F.CATALOG.filter(([code, , group]) => group !== 'Avrupa Kupaları' && !F.NO_TABLE.has(code)).map(([code]) => code),
  hideTables: req.t.db.hideTables || [],
}));
function qrText(b) {
  if (b.kind === 'wifi') {
    if (!b.ssid) throw new Error('Ağ adı (SSID) gerekli');
    const esc = v => String(v).replace(/([\\;,:"])/g, '\\$1');
    const sec = ['WPA', 'WEP', 'nopass'].includes(b.security) ? b.security : 'WPA';
    return `WIFI:T:${sec};S:${esc(b.ssid)};${sec === 'nopass' ? '' : 'P:' + esc(b.password || '') + ';'};`;
  }
  const t = String(b.text || '').trim();
  if (!t) throw new Error('Link ya da metin gerekli');
  return /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(t) && !/^https?:\/\//i.test(t) ? 'https://' + t : t;
}
// Önizleme: kaydetmeden QR üretir (panelde yazarken canlı görünür)
r.post('/qrs/preview', async (req, res) => {
  try {
    const text = req.body && req.body.kind === 'hub' ? require('./qrtrack').trackUrl('onizleme') : qrText(req.body); if (text.length > 400) throw new Error('İçerik çok uzun');
    res.json({ svg: await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#14100c', light: '#ffffff' } }) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// QR kartının hangi içeriklerde gizlenebileceği ("Her zaman üstte" kapalıyken seçilir)
const QR_HIDE = ['video', 'image', 'poster', 'trailer', 'camp', 'big', 'goal'];
const qrHide = v => Array.isArray(v) ? QR_HIDE.filter(k => v.includes(k)) : [];
const QR_SVG = text => QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#14100c', light: '#ffffff' } });
// QR'ın içeriği (tür, etiket, bağlantı/Wi-Fi bilgisi) gövdeden okunur ve doğrulanır; bağlantı QR'ları sayılabilmesi için kısa adres (/q/kod) taşır
const req_db = tid => (require('./tenants').get(tid) || { db: {} }).db;
// Tek QR sayfasının butonları: menü, Wi-Fi (işletmenin Wi-Fi QR'larından biri) ve en çok 5 bağlantı
function hubClean(h, db) {
  h = h || {}; const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n), tq = require('./qrtrack');
  const links = (Array.isArray(h.links) ? h.links : []).slice(0, 5).map(l => {
    let u = s(l && l.url, 300); if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(u) && !/^https?:\/\//i.test(u)) u = 'https://' + u;
    return { label: s(l && l.label, 30), url: u };
  }).filter(l => l.label && tq.isUrl(l.url));
  const wifi = (db.qrs || []).some(x => x.id === h.wifi && x.kind === 'wifi') ? h.wifi : '';
  let mu = s(h.menuUrl, 300); if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(mu) && !/^https?:\/\//i.test(mu)) mu = 'https://' + mu;
  return { title: s(h.title, 50), menu: h.menu === true && !tq.isUrl(mu), menuUrl: tq.isUrl(mu) ? mu : '', wifi, links };
}
async function qrFields(b, tid, id, oldCode) {
  const kind = b.kind === 'wifi' ? 'wifi' : b.kind === 'hub' ? 'hub' : 'link';
  const label = (String(b.label || '').trim() || (kind === 'wifi' ? 'Wi-Fi Şifresi' : '')).slice(0, 40); // Wi-Fi için etiket boşsa varsayılan
  if (!label) throw new Error('Etiket gerekli (örn. "Menü için okutun")');
  if (kind === 'hub') {
    const hub = hubClean(b.hub, req_db(tid), id);
    if (!hub.menu && !hub.menuUrl && !hub.wifi && !hub.links.length) throw new Error('En az bir buton seçin (menü, Wi-Fi ya da bağlantı)');
    return { kind, label, hub, ...(await require('./qrtrack').buildHub(tid, id, oldCode)) };
  }
  const text = qrText({ ...b, kind });
  if (text.length > 400) throw new Error('İçerik çok uzun');
  const { code, svg } = kind === 'wifi' ? { code: '', svg: await QR_SVG(text) } : await require('./qrtrack').build(tid, id, 'qr', text, oldCode);
  return { kind, label, text, svg, code, hub: undefined };
}
r.post('/qrs', async (req, res) => {
  try {
    const db = req.t.db;
    db.qrs = db.qrs || [];
    if (db.qrs.length >= 6) throw new Error('En fazla 6 QR kod eklenebilir');
    const id = auth.uid(), f = await qrFields(req.body, req.t.id, id, '');
    db.qrs.push({ id, ...f, pin: req.body.pin !== false, hide: qrHide(req.body.hide) });
    changed(req.t); res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
r.patch('/qrs/:id', async (req, res) => {
  try {
    const q = (req.t.db.qrs || []).find(x => x.id === req.params.id);
    if (!q) return res.status(404).json({ error: 'bulunamadı' });
    const b = req.body || {};
    if (b.kind !== undefined) Object.assign(q, await qrFields(b, req.t.id, q.id, q.code)); // düzenleme: içerik yeniden üretilir (kısa adres korunur, sayaç sürer)
    if (typeof b.pin === 'boolean') q.pin = b.pin;
    if (b.hide !== undefined) q.hide = qrHide(b.hide);
    changed(req.t); res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
r.delete('/qrs/:id', (req, res) => { req.t.db.qrs = (req.t.db.qrs || []).filter(x => x.id !== req.params.id); changed(req.t); res.json({ ok: true }); });
r.put('/pharmacy', async (req, res) => {
  const t = req.t, b = req.body || {}, cur = t.db.pharmacy || {};
  const districts = Array.isArray(b.districts) ? b.districts.map(x => String(x).trim()).filter(Boolean).slice(0, 2) : cur.districts || [];
  const mode = b.mode === 'auto' || b.mode === 'manual' ? b.mode : F.pharmMode(cur);
  t.db.pharmacy = { ...cur, mode, enabled: typeof b.enabled === 'boolean' ? b.enabled : cur.enabled !== false, il: typeof b.il === 'string' && b.il.trim() ? b.il.trim().slice(0, 40) : cur.il || 'İstanbul', districts };
  let warn = '';
  if (mode === 'auto') {
    const loc = t.db.location || {};
    if (!loc.custom) warn = 'Önce Ayarlar > İşletme bölümünden konumunuzu seçin';
    else try { await F.resolvePharmacy(t); if (!((t.db.pharmacy || {}).auto || {}).district) warn = 'Konumunuzdan ilçe bulunamadı; elle seçin'; } catch (e) { warn = 'Konumdan ilçe bulunamadı; biraz sonra deneyin ya da elle seçin'; }
  }
  changed(t); res.json({ ok: true, warn });
  F.refreshPharmacies();
});
r.post('/pharmacy/test', async (req, res) => {
  const b = req.body || {}, cur = req.t.db.pharmacy || {};
  const key = store.setting('collect_key');
  if (!key) return res.status(400).json({ error: 'Nöbetçi eczane servisi henüz platformda etkin değil' });
  const eff = F.pharmCfg(req.t), auto = F.pharmMode(cur) === 'auto' && b.mode !== 'manual';
  const il = ((auto ? eff.il : b.il || cur.il) || 'İstanbul').trim(), districts = (auto ? eff.districts || [] : Array.isArray(b.districts) && b.districts.length ? b.districts : cur.districts || []).map(x => String(x).trim()).filter(Boolean).slice(0, 2);
  if (!districts.length) return res.status(400).json({ error: 'En az bir ilçe girin' });
  try { const items = await F.fetchPharmacies(il, districts, key); res.json({ ok: true, count: items.length, sample: items.slice(0, 3) }); }
  catch (e) { res.status(502).json({ error: e.message }); }
});
r.get('/bigmatch', (req, res) => res.json({ items: F.activeBig(req.t), all: F.bigMatches.length, error: F.bigError, photos: (req.t.db.bigPhotos || []).map(p => ({ id: p.id, name: p.name, url: req.t.upBase + p.file })) }));
r.put('/bigmatch', (req, res) => {
  const t = req.t, b = req.body || {}, cur = F.bigCfg(t);
  const num = (v, lo, hi, d) => isFinite(Number(v)) && v !== '' ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : d;
  t.db.bigMatch = {
    enabled: typeof b.enabled === 'boolean' ? b.enabled : cur.enabled,
    note: typeof b.note === 'string' ? b.note.trim().slice(0, 140) : cur.note,
    info: Array.isArray(b.info) ? b.info.slice(0, 3).map(x => String(x || '').trim().slice(0, 60)) : cur.info,
    style: F.BIG_STYLES.includes(b.style) ? b.style : cur.style,
    days: num(b.days, 1, 7, cur.days), everyMin: num(b.everyMin, 2, 60, cur.everyMin), durSec: num(b.durSec, 5, 60, cur.durSec),
  };
  changed(t); res.json({ ok: true });
  F.refreshBigMatches();
});
r.post('/bigmatch/photo', quota, upload.single('file'), postQuota, (req, res) => {
  const t = req.t, f = req.file, name = String((req.body && req.body.team) || '').trim().slice(0, 40);
  if (!f) return res.status(400).json({ error: 'dosya yok' });
  const bad = msg => { rmUpload(t, f.filename); return res.status(400).json({ error: msg }); };
  if (!name || !F.norm(name)) return bad('takım adı yazın');
  if (!/\.(jpe?g|png|webp)$/i.test(f.originalname) || f.size > 8 * 1024 * 1024) return bad('JPG/PNG/WEBP ve en çok 8 MB olmalı');
  t.db.bigPhotos = (t.db.bigPhotos || []).filter(p => { if (p.key !== F.norm(name)) return true; rmUpload(t, p.file); return false; });
  t.db.bigPhotos.push({ id: auth.uid(), key: F.norm(name), name, file: f.filename });
  changed(t); res.json({ ok: true });
});
r.delete('/bigmatch/photo/:id', (req, res) => {
  const t = req.t, p = (t.db.bigPhotos || []).find(x => x.id === req.params.id);
  if (p) { rmUpload(t, p.file); t.db.bigPhotos = t.db.bigPhotos.filter(x => x !== p); }
  changed(t); res.json({ ok: true });
});
r.post('/bigmatch/test', (req, res) => {
  const t = req.t, items = F.activeBig(t), cfg = F.bigCfg(t);
  const m = items[0] || { id: 'ornek', league: 'Süper Lig', ll: '/logo/l-18.png?v=2', home: 'Fenerbahçe', away: 'Beşiktaş', ts: Date.now() + 3 * 24 * HOUR, hl: '/logo/436.png?v=2', al: '/logo/1895.png?v=2', hc: F.TEAM_COLORS.fenerbahce, ac: F.TEAM_COLORS.besiktas, hp: F.teamPhoto(t, 'Fenerbahçe'), ap: F.teamPhoto(t, 'Beşiktaş'), derby: true };
  // seçili tasarımla gönderilir; force: TV'de başka kart açıksa beklemeden bu gösterilir
  sendTo(t, { type: 'bigmatch', force: true, match: m, cfg: { note: cfg.note, info: cfg.info, durSec: cfg.durSec, style: cfg.style } });
  const on = hub.onlineDeviceIds(), online = store.q.devicesOf.all(t.id).filter(d => on.has(d.id)).length;
  res.json({ ok: true, sample: !items.length, online });
});
r.put('/movies', (req, res) => {
  const t = req.t, b = req.body || {}, cur = t.db.movies || {};
  const every = Math.max(2, Math.min(20, Math.round(Number(b.every)) || cur.every || 4)); // kaç içerikte bir fragman
  const gapMin = Math.max(5, Math.min(180, Math.round(Number(b.gapMin)) || cur.gapMin || 8)); // fragmanlar arası en az kaç dakika
  t.db.movies = { enabled: typeof b.enabled === 'boolean' ? b.enabled : cur.enabled !== false, trailers: typeof b.trailers === 'boolean' ? b.trailers : cur.trailers !== false, every, gapMin };
  changed(t); res.json({ ok: true }); F.refreshMovies();
});
// Bilgi bandı: her içerik türünün ekranda kalma süresi (sn) ve en çok kaç öğe gösterileceği
const INFO_TYPES = ['league', 'table', 'pharm', 'breaking', 'news', 'movies', 'books', 'otd', 'traffic'];
const INFO_MAX = { news: [1, 20], breaking: [1, 12], movies: [1, 20], books: [1, 40], otd: [1, 12], pharm: [1, 12] };
r.put('/infocfg', (req, res) => {
  const t = req.t, b = req.body || {}, cur = t.db.infoCfg || {};
  const n = (v, lo, hi, d) => v === '' || v === null || v === undefined || !isFinite(Number(v)) ? d : Math.max(lo, Math.min(hi, Math.round(Number(v))));
  const dur = { ...(cur.dur || {}) }, max = { ...(cur.max || {}) };
  if (b.dur && typeof b.dur === 'object') for (const k of INFO_TYPES) if (k in b.dur) { const v = n(b.dur[k], 5, 60, 0); if (v) dur[k] = v; else delete dur[k]; }
  if (b.max && typeof b.max === 'object') for (const k of Object.keys(INFO_MAX)) if (k in b.max) { const v = n(b.max[k], INFO_MAX[k][0], INFO_MAX[k][1], 0); if (v) max[k] = v; else delete max[k]; }
  t.db.infoCfg = { pageSec: n(b.pageSec, 5, 60, cur.pageSec || 12), dur, max };
  changed(t); res.json({ ok: true });
});
r.post('/movies/test', async (req, res) => {
  const key = store.setting('tmdb_key');
  if (!key) return res.status(400).json({ error: 'Sinema servisi henüz platformda etkin değil' });
  try { const x = await F.fetchMovies(key); res.json({ count: x.items.length, trailers: x.items.filter(i => i.trailer).length, sample: x.items.slice(0, 3).map(i => i.title) }); }
  catch (e) { res.status(502).json({ error: e.message }); }
});
r.put('/news', (req, res) => {
  const t = req.t, b = req.body || {}, cur = t.db.news || {};
  t.db.news = { enabled: typeof b.enabled === 'boolean' ? b.enabled : cur.enabled !== false, tag: F.NEWS_TAGS.includes(b.tag) ? b.tag : cur.tag || F.NEWS_DEFAULT };
  changed(t); res.json({ ok: true }); F.refreshNews();
});
r.put('/breaking', (req, res) => {
  const t = req.t, b = req.body || {}, cur = t.db.breaking || {};
  const srcs = Array.isArray(b.sources) ? [...new Set(b.sources.map(String).filter(x => x === 'trt' || x === 'aa' || x === 'ntv'))] : (cur.sources || ['trt']);
  t.db.breaking = { enabled: typeof b.enabled === 'boolean' ? b.enabled : cur.enabled !== false, banner: typeof b.banner === 'boolean' ? b.banner : cur.banner !== false, sources: srcs.length ? srcs : ['trt'] };
  changed(t); res.json({ ok: true }); F.refreshBreaking();
});
r.post('/news/test', async (req, res) => {
  const key = store.setting('collect_key'), tag = F.NEWS_TAGS.includes((req.body || {}).tag) ? req.body.tag : F.NEWS_DEFAULT;
  if (!key && !F.RSS_TAGS.includes(tag)) return res.status(400).json({ error: 'Haber servisi henüz platformda etkin değil' });
  try { const items = await F.fetchNews(key, tag); res.json({ ok: true, count: items.length, sample: items.slice(0, 2) }); }
  catch (e) { res.status(502).json({ error: e.message }); }
});
r.get('/storage', (req, res) => {
  const t = req.t, files = {}; let mediaB = 0;
  for (const v of t.db.videos) {
    const f = v.file || v.image;
    if (f) { try { files[f] = fileSize(t, f); mediaB += files[f]; } catch {} }
  }
  const used = media.usedBytes(t), lim = plan(t).storageMB * 1048576;
  const celeb = [...(t.db.celebPhotos || []), ...(t.db.bigPhotos || [])].reduce((a, p) => { try { return a + fileSize(t, p.file); } catch { return a; } }, 0);
  res.json({ files, mediaBytes: mediaB, mediaCount: t.db.videos.length, celebBytes: celeb, otherBytes: Math.max(0, used - mediaB - celeb), otherCount: 0, uploadsBytes: used, totalBytes: used, limitBytes: lim, disk: { total: lim, free: Math.max(0, lim - used) } });
});
r.get('/cache', (req, res) => {
  const t = req.t, age = k => { const a = F.cacheAge(k); return isFinite(a) ? Math.round(a / 60000) : null; };
  const ph = F.pharmFor(t), nw = F.newsFor(t), bk = F.books;
  res.json({
    hava: F.weatherFor(t) ? 'güncel' : null, doviz: age('rates:fx'), altin: age('rates:gold'), maclar: age('matches'),
    tarihteBugun: F.onThisDay ? F.onThisDay.date : null,
    harita: { dk: F.mapAt ? Math.round((Date.now() - F.mapAt) / 60000) : null, hata: F.mapErr },
    haber: nw ? { adet: nw.items.length, hata: F.newsError } : (F.newsError ? { hata: F.newsError } : null),
    kitap: bk ? { adet: bk.items.length, dk: age('books'), hata: F.booksError, kapak: bk.items.filter(b => b.image).length + '/' + bk.items.length, kapakHata: F.coverErr } : null,
    nobetci: ph ? { adet: ph.items.length, guncel: true } : null, nobetciHata: F.pharmError,
    puanDurumu: Object.fromEntries([...F.standings.keys()].map(c => [c, age('standings:' + c)])),
  });
});
r.post('/media/optimize-all', (req, res) => {
  const force = !!(req.body || {}).force; // kalite ayarı değiştiğinde eskiden işlenmiş videolar da yeniden küçültülür
  let n = 0;
  for (const v of req.t.db.videos) if (v.type !== 'youtube' && (force || !v.optimized) && v.status !== 'processing') { v.status = 'processing'; v.reopt = true; media.enqueue(req.t.id, v.id); n++; }
  changed(req.t); res.json({ ok: true, count: n });
});
r.get('/system', (req, res) => res.json({ ffmpeg: media.ffmpegOk, queue: media.queueLength }));

// ---- yedekler: işletmenin kendi klasöründe, en yeni 30 ----
const BACKUP_NAME = /^db-[A-Za-z0-9_.-]+\.json$/;
function listBackups(t) {
  return fs.readdirSync(t.dirs.backups).filter(n => BACKUP_NAME.test(n)).map(n => { const st = fs.statSync(path.join(t.dirs.backups, n)); return { name: n, size: st.size, time: st.mtimeMs }; }).sort((a, b) => b.time - a.time);
}
// Yedeğin türü (adın sonundaki etiket): oto, manuel, geri-yukleme-oncesi, silme-talebi
const backupTag = n => n.replace(/\.json$/, '').replace(/^db-\d{4}-?\d{2}-?\d{2}_\d{4,6}(-[0-9a-f]{4})?-/, ''); // ek: auth.uid(4) onaltılık
// Otomatik günlük yedekler ayrı tutulur: elle alınan (ya da geri yükleme öncesi) yedekler onları sırayla silemesin
const KEEP_AUTO = 14, KEEP_OTHER = 16;
function backupNow(t, tag) {
  const now = new Date(), ss = String(now.getSeconds()).padStart(2, '0');
  // saniye + kısa rastgele ek: aynı dakikada alınan yedekler birbirinin üstüne yazılmaz
  const name = `db-${F.ymd(now)}_${F.hm(now).replace(':', '')}${ss}-${auth.uid(4)}-${tag}.json`;
  // ekran düzeni veritabanında ayrı tutulur (screens): geri yüklemede içerikle birlikte dönsün diye yedeğe eklenir
  const sc = store.q.screensOf.all(t.id)[0];
  fs.writeFileSync(path.join(t.dirs.backups, name), JSON.stringify({ ...t.db, _screenLayout: sc ? store.J(sc.layout) : undefined }, null, 2));
  const all = listBackups(t), auto = all.filter(b => backupTag(b.name) === 'oto'), other = all.filter(b => backupTag(b.name) !== 'oto');
  for (const old of [...auto.slice(KEEP_AUTO), ...other.slice(KEEP_OTHER)]) fs.rmSync(path.join(t.dirs.backups, old.name), { force: true });
  return name;
}
function autoBackupAll() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: config.TZ, hour: '2-digit', hour12: false }).format(new Date())), today = F.ymd(new Date());
  if (hour < 4) return;
  for (const t of tenants.all()) {
    try { if (!listBackups(t).some(b => b.name.startsWith('db-' + today) && b.name.endsWith('-oto.json'))) backupNow(t, 'oto'); } catch (e) { console.error('Yedek alınamadı', t.id, e.message); }
  }
}
r.get('/backups', (req, res) => res.json(listBackups(req.t)));
const manualAt = new Map(); // işletme -> son elle yedek zamanı
r.post('/backups', (req, res) => {
  if (Date.now() - (manualAt.get(req.t.id) || 0) < 60000) return res.status(429).json({ error: 'Az önce yedek alındı; bir dakika sonra tekrar deneyin' });
  manualAt.set(req.t.id, Date.now());
  try { res.json({ ok: true, name: backupNow(req.t, 'manuel') }); } catch (e) { res.status(500).json({ error: e.message }); } });
r.get('/backups/:name/download', ownerOnly, (req, res) => { // ham işletme yedeği OAuth sırlarını içerir: yalnız sahip
  if (!BACKUP_NAME.test(req.params.name)) return res.status(400).send('geçersiz ad');
  res.download(path.join(req.t.dirs.backups, req.params.name));
});
r.post('/backups/:name/restore', ownerOnly, (req, res) => {
  const t = req.t;
  if (!BACKUP_NAME.test(req.params.name)) return res.status(400).json({ error: 'geçersiz ad' });
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(t.dirs.backups, req.params.name), 'utf8'));
    if (!parsed || !Array.isArray(parsed.videos)) throw new Error('yedek dosyası geçerli değil');
    backupNow(t, 'geri-yukleme-oncesi');
    const keep = {}; for (const k of ['superAccess', 'unlimited', 'canTest', 'deletion', 'consent']) { if (t.db[k] !== undefined) keep[k] = t.db[k]; }
    for (const k of ['superAccess', 'unlimited', 'canTest']) delete parsed[k]; // yetki alanları yedekten geri gelmez
    const lay = parsed._screenLayout; delete parsed._screenLayout;
    t.db = { ...t.db, ...parsed, ...keep };
    // düzen de yedekteyse (yeni yedekler) geri gelir; eski yedeklerde mevcut düzen korunur
    if (lay && Array.isArray(lay.widgets)) store.updateScreen(tenants.mainScreen(t).id, t.id, { layout: JSON.stringify(W.cleanLayout(lay)) });
    const missing = t.db.videos.filter(v => (v.file || v.image) && !require('./storage').exists(t, v.file || v.image)).length;
    changed(t); res.json({ ok: true, missingFiles: missing });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---- resmî günler ----
r.get('/celebrate', (req, res) => { const t = req.t; res.json({ enabled: t.db.showCelebrations !== false, holidays: F.HOLIDAYS.map(h => ({ id: h.id, md: h.md, title: h.title, mourn: !!h.mourn, mode: F.celebMode(t, h.id), photos: F.celebPhotos(t, h) })), active: (F.activeCelebration(t) || {}).id || null, preview: t.db.celebPreview && t.db.celebPreviewUntil > Date.now() ? t.db.celebPreview : null }); });
r.put('/celebrate/mode', (req, res) => {
  const t = req.t, { id, mode } = req.body || {};
  if (!F.HOLIDAYS.some(h => h.id === id) || !['auto', 'on', 'off'].includes(mode)) return res.status(400).json({ error: 'geçersiz istek' });
  t.db.celebMode = { ...(t.db.celebMode || {}), [id]: mode };
  if (mode === 'on') t.db.celebPreview = null;
  changed(t); res.json({ ok: true });
});
r.post('/celebrate/preview', (req, res) => {
  const t = req.t, id = req.body && req.body.id;
  if (!id) { t.db.celebPreview = null; t.db.celebPreviewUntil = 0; }
  else if (F.HOLIDAYS.some(h => h.id === id)) { t.db.celebPreview = id; t.db.celebPreviewUntil = Date.now() + 3 * 60 * 1000; }
  else return res.status(400).json({ error: 'bilinmeyen gün' });
  changed(t); res.json({ ok: true });
  if (id) setTimeout(() => hub.pushTenant(t.id), 3 * 60 * 1000 + 500);
});
r.post('/celebrate/photos', quota, upload.single('file'), postQuota, (req, res) => {
  const t = req.t, f = req.file, day = req.body && req.body.day;
  if (!f) return res.status(400).json({ error: 'dosya yok' });
  if (!F.HOLIDAYS.some(h => h.id === day)) { rmUpload(t, f.filename); return res.status(400).json({ error: 'geçersiz gün' }); }
  if (!/\.(jpe?g|png|webp)$/i.test(f.originalname) || f.size > 8 * 1024 * 1024) { rmUpload(t, f.filename); return res.status(400).json({ error: 'JPG/PNG/WEBP ve en çok 8 MB olmalı' }); }
  t.db.celebPhotos = t.db.celebPhotos || [];
  if (t.db.celebPhotos.filter(x => x.day === day).length >= 12) { rmUpload(t, f.filename); return res.status(400).json({ error: 'Bir güne en fazla 12 fotoğraf eklenebilir' }); }
  t.db.celebPhotos.push({ id: auth.uid(), file: f.filename, day });
  changed(t); res.json({ ok: true });
});
r.delete('/celebrate/photos/:id', (req, res) => {
  const t = req.t, p = (t.db.celebPhotos || []).find(x => x.id === req.params.id);
  if (p) { rmUpload(t, p.file); t.db.celebPhotos = t.db.celebPhotos.filter(x => x !== p); }
  changed(t); res.json({ ok: true });
});

// ---- kampanyalar ----
r.put('/campaigns/:id', async (req, res) => {
  try {
    const t = req.t, c = (t.db.campaigns || []).find(x => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: 'bulunamadı' });
    const b = req.body || {}, str = (v, n) => String(v).trim().slice(0, n);
    for (const [k, n] of [
      ['headline', 120], ['sub', 180], ['note', 220], ['qrLabel', 80],
      ['emoji', 16], ['font', 40], ['textAlign', 20], ['style', 30], ['pos', 30]
    ]) {
      if (typeof b[k] === 'string') c[k] = str(b[k], n);
    }
    for (const [k, lo, hi, def] of [['qrX', 0, 100, 85], ['qrY', 0, 100, 75], ['qrSize', 10, 50, 26]]) {
      if (b[k] !== undefined && b[k] !== '') { const n = Number(b[k]); c[k] = Math.round(Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : def)) * 10) / 10; }
    }
    if (b.image !== undefined) c.image = typeof b.image === 'string' && b.image ? b.image : null;
    if (b.everyMin !== undefined) c.everyMin = Math.max(1, Math.min(60, Math.round(Number(b.everyMin)) || 3));
    if (b.durSec !== undefined) c.durSec = Math.max(8, Math.min(60, Math.round(Number(b.durSec)) || 15));
    if (typeof b.url === 'string' && b.url.trim() !== c.url) {
      const u = b.url.trim();
      if (u && (!/^https?:\/\/\S+$/i.test(u) || u.length > 300)) throw new Error('Geçerli bir web adresi (https://...) girin');
      c.url = u; Object.assign(c, u ? await require('./qrtrack').build(req.t.id, c.id, 'camp', u, c.code) : { code: '', svg: '' });
    }
    if (typeof b.enabled === 'boolean') {
      if (b.enabled && !c.url) throw new Error('Önce kampanyanın bağlantısını (örn. Google yorum linki) girin');
      if (b.enabled && !c.image) throw new Error('Önce kampanya fotoğrafını yükleyin');
      c.enabled = b.enabled;
    }
    if (c.enabled && !c.svg && c.url) Object.assign(c, await require('./qrtrack').build(req.t.id, c.id, 'camp', c.url, c.code));
    changed(t); res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

r.post('/campaigns/:id/image', quota, upload.single('file'), postQuota, async (req, res) => {
  const f = req.file, t = req.t;
  try {
    const c = (t.db.campaigns || []).find(x => x.id === req.params.id);
    if (!c) { if (f) rmUpload(t, f.filename); return res.status(404).json({ error: 'Kampanya bulunamadı' }); }
    if (!f) return res.status(400).json({ error: 'Görsel dosyası seçilmedi' });
    if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(f.originalname) || f.size > 15 * 1024 * 1024) {
      rmUpload(t, f.filename); return res.status(400).json({ error: 'Görsel PNG/JPG/WEBP ve en çok 15 MB olmalı' });
    }
    const file = await svgToPng(t, f);
    if (!file) return res.status(400).json({ error: 'Görsel yüklenemedi' });
    if (c.imageFile) rmUpload(t, c.imageFile);
    c.imageFile = file;
    c.image = t.upBase + file;
    changed(t);
    res.json({ ok: true, url: c.image });
  } catch (e) { res.status(500).json({ error: 'Görsel yüklenemedi: ' + e.message }); }
});

r.delete('/campaigns/:id/image', (req, res) => {
  const t = req.t, c = (t.db.campaigns || []).find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Kampanya bulunamadı' });
  if (c.imageFile) rmUpload(t, c.imageFile);
  c.imageFile = null;
  c.image = null;
  changed(t);
  res.json({ ok: true });
});

// ---- Özel yayın: seçili gün/saatlerde yalnız seçilen içerikler oynar ----
r.get('/special', (req, res) => { const { activeSpecial } = require('./state'), sp = activeSpecial(req.t); res.json({ rules: req.t.db.special || [], activeId: sp ? sp.rule.id : null }); });
// Şimdi durdur: yayın dilimi bitene dek (en çok 2 gün) bu kural susturulur; sonraki dilimde kendiliğinden devam eder. resume: yeniden başlat
r.post('/special/:id/stop', (req, res) => {
  const t = req.t, r0 = (t.db.special || []).find(x => x.id === req.params.id); if (!r0) return res.status(404).json({ error: 'bulunamadı' });
  if (req.body && req.body.resume) delete r0.stopUntil;
  else { const SCH = require('./sched'); let k = 1; while (k < 2880 && SCH.active(r0.sch, new Date(Date.now() + k * 60000))) k++; r0.stopUntil = Math.floor(Date.now() / 60000) * 60000 + k * 60000; }
  changed(t); res.json({ ok: true, stopUntil: r0.stopUntil || null });
});
r.put('/special', (req, res) => {
  const t = req.t, src = Array.isArray((req.body || {}).rules) ? req.body.rules.slice(0, 10) : [], vids = new Set((t.db.videos || []).map(v => v.id)), out = [];
  for (const x of src) {
    const sch = require('./sched').clean(x.sch);
    if (!sch || (!sch.from && !sch.days && !sch.start && !sch.end)) return res.status(400).json({ error: 'Her özel yayın için gün ya da saat seçin' });
    const items = [...new Set((Array.isArray(x.items) ? x.items : []).map(String).filter(id => vids.has(id)))].slice(0, 60);
    if (x.on && !items.length) return res.status(400).json({ error: 'Açık bir özel yayında en az bir içerik seçili olmalı' });
    const old = (t.db.special || []).find(o => o.id === x.id);
    out.push({ id: /^[a-z0-9]{4,16}$/i.test(x.id || '') ? x.id : Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ...(old && old.stopUntil && JSON.stringify(old.sch) === JSON.stringify(sch) ? { stopUntil: old.stopUntil } : {}), name: String(x.name || '').trim().slice(0, 40) || 'Özel yayın', on: !!x.on, sch, items, full: x.full !== false });
  }
  t.db.special = out; changed(t); res.json({ ok: true });
});
// ---- Happy Hours kartı (fotoğraf + gizlenebilir ad/saat/rozet + gösterim süresi) ----
const clampN = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Math.round(Number(v)) || d));
r.put('/happy-card', (req, res) => {
  const b = req.body || {}, t = req.t, c = t.db.happyCard || (t.db.happyCard = {});
  if (b.on !== undefined) c.on = !!b.on;
  for (const k of ['showTitle', 'showTime', 'showPct']) if (b[k] !== undefined) c[k] = !!b[k];
  if (b.durSec !== undefined) c.durSec = clampN(b.durSec, 5, 300, 15);
  if (b.everyMin !== undefined) c.everyMin = clampN(b.everyMin, 1, 120, 4);
  if (c.on && !c.image) { c.on = false; changed(t); return res.status(400).json({ error: 'Önce Happy Hours fotoğrafını yükleyin' }); }
  if (b.hid !== undefined) { const ok = require('./state').hoursOf(t.db.menu).some(h => h.id === String(b.hid)); c.hid = ok ? String(b.hid) : undefined; }
  if (c.on && !require('./state').hoursOf(t.db.menu).length) { c.on = false; changed(t); return res.status(400).json({ error: 'Önce Fiyat Listesi\'nde indirim saatini seçin' }); }
  changed(t); res.json({ ok: true });
});
r.post('/happy-card/image', quota, upload.single('file'), postQuota, async (req, res) => {
  const f = req.file, t = req.t;
  try {
    if (!f) return res.status(400).json({ error: 'Görsel dosyası seçilmedi' });
    if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(f.originalname) || f.size > 15 * 1024 * 1024) { rmUpload(t, f.filename); return res.status(400).json({ error: 'Görsel PNG/JPG/WEBP ve en çok 15 MB olmalı' }); }
    const file = await svgToPng(t, f);
    if (!file) return res.status(400).json({ error: 'Görsel yüklenemedi' });
    const c = t.db.happyCard || (t.db.happyCard = {});
    if (c.imageFile) rmUpload(t, c.imageFile);
    c.imageFile = file; c.image = t.upBase + file; changed(t); res.json({ ok: true, url: c.image });
  } catch (e) { res.status(500).json({ error: 'Görsel yüklenemedi: ' + e.message }); }
});
r.delete('/happy-card/image', (req, res) => {
  const t = req.t, c = t.db.happyCard; if (!c) return res.json({ ok: true });
  if (c.imageFile) rmUpload(t, c.imageFile); c.imageFile = null; c.image = null; c.on = false; changed(t); res.json({ ok: true });
});
r.post('/happy-card/test', (req, res) => {
  const cs = require('./state').publicState(req.t).campaigns.filter(c => c.id === 'happy');
  if (!cs.length) return res.status(400).json({ error: 'Önce fotoğrafı yükleyip kartı açın ve indirim saatini seçin' });
  sendTo(req.t, { type: 'campaign', camp: cs[0] }); res.json({ ok: true });
});

r.post('/campaigns/:id/test', (req, res) => {
  const c = (req.t.db.campaigns || []).find(x => x.id === req.params.id && x.svg);
  if (!c) return res.status(404).json({ error: 'Önce bağlantıyı kaydedin' });
  sendTo(req.t, { type: 'campaign', camp: pubCamp(c) }); res.json({ ok: true });
});

// ---- genel seçenekler ----
r.put('/options', (req, res) => {
  const db = req.t.db, b = req.body || {};
  if (b.videoMaxH != null) db.videoMaxH = [480, 720, 1080].includes(Number(b.videoMaxH)) ? Number(b.videoMaxH) : 1080; // video çözünürlük tavanı (işletmeye bağlı)
  if (typeof b.showStandings === 'boolean') db.showStandings = b.showStandings;
  if (Array.isArray(b.hideTables)) db.hideTables = b.hideTables.filter(c => F.CATALOG.some(([k]) => k === c));
  if (typeof b.showQr === 'boolean') db.showQr = b.showQr;
  if (b.qrSize != null) db.qrSize = Math.max(10, Math.min(30, Number(b.qrSize) || 17));
  if (typeof b.wifiText === 'string') db.wifiText = b.wifiText.trim().slice(0, 120);
  if (typeof b.showOnThisDay === 'boolean') db.showOnThisDay = b.showOnThisDay;
  if (typeof b.showCelebrations === 'boolean') db.showCelebrations = b.showCelebrations;
  if (typeof b.showBooks === 'boolean') { db.showBooks = b.showBooks; if (db.showBooks) F.refreshBooks(); }
  if (typeof b.showTraffic === 'boolean') db.showTraffic = b.showTraffic;
  if (typeof b.showBookSlides === 'boolean') db.showBookSlides = b.showBookSlides;
  if (b.bookEvery != null && isFinite(Number(b.bookEvery))) db.bookEvery = Math.max(1, Math.min(50, Math.round(Number(b.bookEvery))));
  if (b.videoGapSec != null && isFinite(Number(b.videoGapSec))) db.videoGapSec = Math.max(0, Math.min(30, Math.round(Number(b.videoGapSec))));
  if (b.xfadeSec != null && isFinite(Number(b.xfadeSec))) db.xfadeSec = Math.max(0.4, Math.min(4, Math.round(Number(b.xfadeSec) * 10) / 10));
  if (b.bookGapMin != null && isFinite(Number(b.bookGapMin))) db.bookGapMin = Math.max(0, Math.min(120, Math.round(Number(b.bookGapMin))));
  if (['auto', 'lite', 'ultra', 'full'].includes(b.fxMode)) db.fxMode = b.fxMode;
  if (b.safeInset !== undefined && isFinite(Number(b.safeInset))) db.safeInset = Math.max(0, Math.min(12, Math.round(Number(b.safeInset) * 2) / 2));
  for (const k of ['L', 'R', 'T', 'B']) { const v = b['safe' + k]; if (v !== undefined && isFinite(Number(v))) db['safe' + k] = Math.max(0, Math.min(20, Math.round(Number(v) * 2) / 2)); }
  if (typeof b.safeGuide === 'boolean') db.safeGuide = b.safeGuide;
  if (b.orient !== undefined) {
    const sc = tenants.mainScreen(req.t), cur = W.cleanLayout(store.J(sc.layout) || W.defaultLayout());
    const o = [90, 270].includes(Number(b.orient)) ? Number(b.orient) : 0;
    const prevOr = cur.orient || 0;
    if (o) {
      cur.orient = o;
      if (!prevOr) {
        const tplKey = 'dikey_menu';
        const tpl = W.TEMPLATES[tplKey];
        if (tpl && Array.isArray(tpl.widgets)) cur.widgets = JSON.parse(JSON.stringify(tpl.widgets));
      }
    } else {
      delete cur.orient;
      if (prevOr) {
        const tplKey = 'spor';
        const tpl = W.TEMPLATES[tplKey];
        if (tpl && Array.isArray(tpl.widgets)) cur.widgets = JSON.parse(JSON.stringify(tpl.widgets));
      }
    }
    store.updateScreen(sc.id, req.t.id, { layout: JSON.stringify(cur) });
  }
  changed(req.t); res.json({ ok: true });
});
r.put('/leagues', (req, res) => {
  const valid = new Set(F.CATALOG.map(([code]) => code));
  req.t.db.leagues = (req.body.enabled || []).filter(c => valid.has(c));
  changed(req.t); res.json({ ok: true });
  F.refreshMatches(); F.refreshStandings();
});

// ---- medya ----
r.post('/videos', quotaMedia, upload.array('files'), postQuotaMedia, (req, res) => {
  const t = req.t, ids = [], only = req.query.only === '1'; // only: yalnız özel yayında oynasın (normal döngüde gizli)
  for (const f of req.files || []) {
    if (!/^(video|image)\//.test(f.mimetype)) { rmUpload(t, f.filename); continue; }
    const rec = { id: auth.uid(), file: f.filename, name: f.originalname, type: f.mimetype.startsWith('image/') ? 'image' : 'video', status: 'processing' };
    if (only) rec.hidden = true;
    t.db.videos.push(rec); ids.push(rec.id);
    media.enqueue(t.id, rec.id);
  }
  changed(t); res.json({ ok: true, ids });
});
// YouTube bağlantısı: dosya yok; TV'de gömülü oynatıcıyla belirtilen süre boyunca (döngülü) oynar
r.post('/videos/youtube', async (req, res) => {
  const yt = require('./ytlink'), id = yt.parse((req.body || {}).url);
  if (!id) return res.status(400).json({ error: 'Geçerli bir YouTube bağlantısı girin (örn. https://www.youtube.com/watch?v=...)' });
  if (req.t.db.videos.length >= 300) return res.status(400).json({ error: 'En fazla 300 içerik eklenebilir' });
  const name = (await yt.title(id)) || 'YouTube videosu';
  const rec = { id: auth.uid(), type: 'youtube', yt: id, name: String((req.body || {}).name || '').trim().slice(0, 80) || name, dur: yt.clampDur((req.body || {}).dur), status: 'ready', optimized: true };
  if ((req.body || {}).sound === true) rec.sound = true;
  if ((req.body || {}).only) rec.hidden = true;
  req.t.db.videos.push(rec);
  changed(req.t); res.json({ ok: true, ids: [rec.id] });
});
r.delete('/videos/:id', (req, res) => {
  const t = req.t, v = t.db.videos.find(x => x.id === req.params.id);
  if (v) {
    media.cancel(t.id, v.id);
    if (v.file) rmUpload(t, v.file);
    if (v.image) rmUpload(t, v.image);
    if (v.design && v.design.photo) rmUpload(t, v.design.photo); // afiş stüdyosunun kaynak fotoğrafı
    if (v.qrCode) { try { require('./qrtrack').unregister(v.qrCode); } catch (e) {} }
    t.db.assets = (t.db.assets || []).filter(a => a.file !== v.file && a.file !== v.image);
  }
  t.db.videos = t.db.videos.filter(x => x.id !== req.params.id);
  media.rebalance(t); // yer açıldıysa kotaya takılan içerikler ekrana döner
  changed(t); res.json({ ok: true });
});
r.post('/videos/reorder', (req, res) => {
  const t = req.t, ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : [];
  const byId = new Map(t.db.videos.map(v => [v.id, v]));
  const ordered = ids.map(id => byId.get(id)).filter(Boolean), rest = t.db.videos.filter(v => !ids.includes(v.id));
  t.db.videos = [...new Set([...ordered, ...rest])];
  changed(t); res.json({ ok: true });
});
r.post('/videos/:id/move', (req, res) => {
  const v = req.t.db.videos, i = v.findIndex(x => x.id === req.params.id), j = i + (req.body.dir === 'up' ? -1 : 1);
  if (i >= 0 && j >= 0 && j < v.length) [v[i], v[j]] = [v[j], v[i]];
  changed(req.t); res.json({ ok: true });
});
// görsel süresi: üst sınır içerik süresiyle aynı (120 sn)
r.put('/settings', (req, res) => { req.t.db.imageSeconds = Math.max(3, Math.min(120, Number((req.body || {}).imageSeconds) || 10)); changed(req.t); res.json({ ok: true }); });

// ---- doğum günleri (elle yorum uçları kaldırıldı: TV yalnız Google yorumlarını gösterir) ----
r.post('/birthdays', (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'isim gerekli' });
  const text = String(req.body.text || '').trim().slice(0, 200);
  if (!text) return res.status(400).json({ error: 'kutlama yazısı gerekli' });
  req.t.db.birthdays.push({ id: auth.uid(), name: String(req.body.name).slice(0, 60), text, selected: true });
  changed(req.t); res.json({ ok: true });
});
r.patch('/birthdays/:id', (req, res) => {
  const b = req.t.db.birthdays.find(x => x.id === req.params.id);
  if (b && typeof req.body.selected === 'boolean') b.selected = req.body.selected;
  if (b && typeof req.body.text === 'string' && req.body.text.trim()) b.text = req.body.text.trim().slice(0, 200);
  changed(req.t); res.json({ ok: true });
});
r.delete('/birthdays/:id', (req, res) => { req.t.db.birthdays = req.t.db.birthdays.filter(x => x.id !== req.params.id); changed(req.t); res.json({ ok: true }); });
r.put('/schedule', (req, res) => {
  req.t.db.times = (req.body.times || []).filter(t => /^\d{2}:\d{2}$/.test(t)).slice(0, 12);
  req.t.db.duration = Math.max(5, Math.min(300, Number(req.body.duration) || 40));
  changed(req.t); res.json({ ok: true });
});
r.post('/goal/test', (req, res) => {
  // gerçek gol olayıyla aynı biçim: takım renkleri de içinde (yoksa ekran eski tema renklerine düşer)
  sendTo(req.t, { type: 'goal', goal: { id: 'test', league: 'La Liga', home: 'Barcelona', away: 'Real Madrid', hs: 1, as: 2, side: 'away', minute: "67'", player: 'Kylian Mbappé', own: false, pen: false, hc: '#a50044', hc2: '#edbb00', ac: '#00529f', ac2: '#febe10' } });
  res.json({ ok: true });
});
function fireBirthday(t) {
  if (!plan(t).pro || !access(t).ok) return;
  const texts = t.db.birthdays.filter(b => b.selected && b.text).map(b => b.text);
  if (texts.length) sendTo(t, { type: 'birthday', texts, duration: t.db.duration });
}
r.post('/birthday/fire', (req, res) => { fireBirthday(req.t); res.json({ ok: true }); });

// doğum günü saatleri: her işletmenin kendi saatleri
let lastFired = '';
function birthdayTick() {
  const now = F.hm(new Date());
  if (now === lastFired) return;
  lastFired = now;
  for (const t of tenants.all()) if ((t.db.times || []).includes(now)) fireBirthday(t);
}

function startJobs() {
  setTimeout(autoBackupAll, 8000); setInterval(autoBackupAll, 30 * 60 * 1000);
  setInterval(birthdayTick, 15000);
  // kutlama ve büyük maç başlangıç/bitişini ekranlara yansıt
  const sig = new Map();
  setInterval(() => {
    for (const t of tenants.all()) {
      const s = JSON.stringify([(F.activeCelebration(t) || {}).id, F.activeBig(t).map(m => m.id), access(t).ok]);
      if (sig.get(t.id) !== s) { if (sig.has(t.id)) hub.pushTenant(t.id); sig.set(t.id, s); }
    }
  }, 30000);
}

require('./routes-ext')(r, { changed, sendTo, upload, quota, postQuota, ownerOnly, rmUpload, backupNow });
module.exports = { router: r, startJobs, activeTenantId };
