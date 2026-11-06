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
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
});
const quota = (req, res, next) => {
  const lim = plan(req.t).storageMB * 1024 * 1024, used = media.usedBytes(req.t);
  const incoming = Number(req.headers['content-length']) || 0;
  if (used + incoming > lim) return res.status(413).json({ error: `Depolama kotası doldu (${Math.round(used / 1048576)} / ${plan(req.t).storageMB} MB). Eski dosyaları silin ya da paketinizi yükseltin.` });
  next();
};
const fileSize = (t, f) => { try { return fs.statSync(path.join(t.dirs.uploads, f)).size; } catch { const o = store.q.objGet.get(t.id, f); if (o) return o.size; throw new Error('yok'); } };
const rmUpload = (t, file) => require('./storage').remove(t, file);

// ================= HESAP, İŞLETME, PAKET =================
r.get('/me', (req, res) => {
  const t = req.t, p = plan(t), acc = access(t);
  res.json({
    user: { id: req.user.id, username: req.user.username, role: req.user.role, name: req.user.name, impersonating: req.user.role === 'super' },
    tenant: { id: t.id, name: t.name, plan: p, status: t.status, access: acc, trialUntil: t.trial_until, paidUntil: t.paid_until, location: t.db.location, menuCount: ((t.db.menu || {}).categories || []).length, logo: t.db.logo ? t.upBase + t.db.logo : null, theme: t.db.theme },
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
// şehir arama (Open-Meteo geocoding, ücretsiz)
r.get('/geo', async (req, res) => {
  const qy = String(req.query.q || '').trim();
  if (qy.length < 2) return res.json([]);
  try {
    const j = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(qy)}&count=8&language=tr&countryCode=TR`)).json();
    res.json((j.results || []).map(x => ({ city: x.name, admin: x.admin1 || '', lat: x.latitude, lon: x.longitude })));
  } catch (e) { res.status(502).json({ error: 'Şehir araması yapılamadı' }); }
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
  store.q.userPass.run(auth.hashPassword(nw), u.id); res.json({ ok: true });
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
r.get('/catalog', (req, res) => res.json({ cols: W.COLS, rows: W.ROWS, widgets: W.WIDGETS, templates: W.TEMPLATES, themes: W.THEMES, fonts: W.FONTS, starters: require('./starters').list(), pro: plan(req.t).pro }));
// Başlangıç paketleri: düzen + renk + (isteğe bağlı) örnek fiyat listesi. Medya, logo ve diğer içerikler korunur.
r.get('/starters', (req, res) => res.json({ list: require('./starters').list(), hasMenu: (req.t.db.menu.categories || []).length > 0 }));
r.post('/starter', (req, res) => {
  const t = req.t, b = req.body || {}, st = require('./starters').build(String(b.key || ''), plan(t).pro);
  if (!st) return res.status(400).json({ error: 'Geçersiz paket' });
  store.updateScreen(tenants.mainScreen(t).id, t.id, { layout: JSON.stringify(st.layout) });
  t.db.theme = { ...t.db.theme, ...st.doc.theme };
  const hadMenu = (t.db.menu.categories || []).length > 0;
  if (st.doc.menu && (!hadMenu || b.replaceMenu === true)) t.db.menu = st.doc.menu; // dolu fiyat listesi yalnız açıkça istenirse ezilir
  changed(t); res.json({ ok: true, menuReplaced: !!(st.doc.menu && (!hadMenu || b.replaceMenu === true)) });
});
// Tasarımı varsayılana döndür: layout (düzen), colors (renk/tema; logo kalır), tv (kenar payı, efekt), all
r.post('/design/reset', (req, res) => {
  const t = req.t, scope = String((req.body || {}).scope || 'all'), all = scope === 'all';
  if (!['layout', 'colors', 'tv', 'all'].includes(scope)) return res.status(400).json({ error: 'Geçersiz kapsam' });
  if (all || scope === 'layout') {
    const l = W.cleanLayout(W.defaultLayout(plan(t).pro ? 'spor' : 'temel'));
    store.updateScreen(tenants.mainScreen(t).id, t.id, { layout: JSON.stringify(l) });
  }
  if (all || scope === 'colors') { const { name, ...th } = W.THEMES.kahve; t.db.theme = W.cleanTheme(th, {}); }
  if (all || scope === 'tv') {
    t.db.safeInset = 0; t.db.safeGuide = false; t.db.fxMode = 'auto';
    for (const k of ['L', 'R', 'T', 'B']) delete t.db['safe' + k];
  }
  changed(t); res.json({ ok: true });
});
r.put('/theme', (req, res) => { req.t.db.theme = W.cleanTheme(req.body || {}, req.t.db.theme); changed(req.t); res.json({ ok: true, theme: req.t.db.theme }); });
r.post('/logo', quota, upload.single('file'), async (req, res) => {
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
r.post('/assets', quota, upload.single('file'), async (req, res) => {
  const f = req.file, t = req.t;
  if (!f) return res.status(400).json({ error: 'dosya yok' });
  if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(f.originalname) || f.size > 15 * 1024 * 1024) { rmUpload(t, f.filename); return res.status(400).json({ error: 'Resim dosyası ve en çok 15 MB olmalı' }); }
  const file = await svgToPng(t, f);
  if (!file) return res.status(400).json({ error: 'SVG dosyası okunamadı; PNG olarak yükleyin' });
  t.db.assets = (t.db.assets || []).concat({ id: auth.uid(), file, name: f.originalname.slice(0, 80) }).slice(-50);
  changed(t); res.json({ ok: true, url: t.upBase + file });
});

// ================= EKRAN VE CİHAZLAR =================
// İşletme başına tek ekran: mekândaki kutu HDMI ile tüm TV'lere aynı görüntüyü verir.
r.get('/screen', (req, res) => {
  const t = req.t, s = tenants.mainScreen(t), online = hub.onlineDeviceIds();
  res.json({ layout: store.J(s.layout) || W.defaultLayout(), devices: store.q.devicesOf.all(t.id).map(d => ({ ...d, online: online.has(d.id) })), limit: plan(t).devices, offlineMin: require('./monitor').offlineMin(t) });
});
r.put('/screen', (req, res) => {
  const t = req.t, s = tenants.mainScreen(t), l = W.cleanLayout((req.body || {}).layout);
  if (!l.widgets.some(w => w.type === 'media' || w.type === 'menu')) return res.status(400).json({ error: 'Düzende en az bir Medya oynatıcı ya da Fiyat listesi olmalı' });
  store.updateScreen(s.id, t.id, { layout: JSON.stringify(l) }); hub.pushTenant(t.id); res.json({ ok: true });
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
  res.json({ ok: true });
});
r.delete('/devices/:id', (req, res) => { store.q.deviceDel.run(req.params.id, req.t.id); hub.kickDevice(req.params.id); res.json({ ok: true }); });
// TV uygulamasından uzaktan çıkış: kutu oturumunu kapatıp giriş ekranına döner (token geçersiz olur)
r.post('/devices/:id/logout', (req, res) => { store.q.deviceDel.run(req.params.id, req.t.id); hub.kickDevice(req.params.id); res.json({ ok: true }); });
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
  const cats = (Array.isArray(b.categories) ? b.categories : []).slice(0, 20).map(c => ({
    name: s(c.name, 40), sch: SCH.clean(c.sch) || undefined, t: tr(c.t, v => s(v, 40)), happy: c.happy === true || undefined,
    items: (Array.isArray(c.items) ? c.items : []).slice(0, 60).map(i => ({
      name: s(i.name, 60), price: s(i.price, 16), hp: s(i.hp, 16) || undefined, desc: s(i.desc, 90), off: i.off === true || undefined, kcal: s(i.kcal, 14) || undefined,
      t: tr(i.t, v => { const n = s(v && v.name, 60), d = s(v && v.desc, 90); return n || d ? { name: n, desc: d } : null; }),
    })).filter(i => i.name),
  })).filter(c => c.name || c.items.length);
  const hs = b.happy && SCH.clean(b.happy.sch); // indirim saati: saat aralığı olmadan kaydedilmez
  const happy = b.happy && hs ? { label: s(b.happy.label, 24) || 'Happy Hour', pct: Math.max(0, Math.min(90, Math.round(Number(b.happy.pct) || 0))), sch: hs } : undefined;
  req.t.db.menu = { title: s(b.title, 40) || 'Fiyat Listesi', currency: s(b.currency, 4) || '₺', categories: cats, t: tr(b.t, v => s(v, 40)), happy };
  changed(req.t); res.json({ ok: true });
});

// ================= DURUM (önizleme ve genel bakış için) =================
r.get('/state', (req, res) => res.json(publicState(req.t)));
r.get('/vidlen', (req, res) => res.json(require('./vidlen').dump())); // video süresi ölçümleri (tanılama)

// ======================================================================
// Aşağısı eski tek-kafe sürümünün yönetim uçları; davranış aynı, veri işletmeye ait.
// ======================================================================
r.get('/db', (req, res) => {
  const { trafficSecret, instagram, ytAuth, oauthApps, music, ...rest } = req.t.db; // gizli anahtarlar panele gönderilmez
  if (instagram) { const { token, ...ig } = instagram; rest.instagram = { ...ig, connected: !!token }; }
  // müzik: panele yalnız TV'de çalması için gereken accessToken gider; uzun ömürlü refreshToken dışarı sızmaz
  if (music) rest.music = { ...music, spotify: { ...(music.spotify || {}), refreshToken: undefined } };
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
    const text = qrText(req.body); if (text.length > 400) throw new Error('İçerik çok uzun');
    res.json({ svg: await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#14100c', light: '#ffffff' } }) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// QR kartının hangi içeriklerde gizlenebileceği ("Her zaman üstte" kapalıyken seçilir)
const QR_HIDE = ['video', 'image', 'poster', 'trailer', 'camp', 'big', 'goal'];
const qrHide = v => Array.isArray(v) ? QR_HIDE.filter(k => v.includes(k)) : [];
const QR_SVG = text => QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#14100c', light: '#ffffff' } });
// QR'ın içeriği (tür, etiket, bağlantı/Wi-Fi bilgisi) gövdeden okunur ve doğrulanır; bağlantı QR'ları sayılabilmesi için kısa adres (/q/kod) taşır
async function qrFields(b, tid, id, oldCode) {
  const kind = b.kind === 'wifi' ? 'wifi' : 'link';
  const label = (String(b.label || '').trim() || (kind === 'wifi' ? 'Wi-Fi Şifresi' : '')).slice(0, 40); // Wi-Fi için etiket boşsa varsayılan
  if (!label) throw new Error('Etiket gerekli (örn. "Menü için okutun")');
  const text = qrText({ ...b, kind });
  if (text.length > 400) throw new Error('İçerik çok uzun');
  const { code, svg } = kind === 'wifi' ? { code: '', svg: await QR_SVG(text) } : await require('./qrtrack').build(tid, id, 'qr', text, oldCode);
  return { kind, label, text, svg, code };
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
r.post('/bigmatch/photo', quota, upload.single('file'), (req, res) => {
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
  for (const v of req.t.db.videos) if ((force || !v.optimized) && v.status !== 'processing') { v.status = 'processing'; v.reopt = true; media.enqueue(req.t.id, v.id); n++; }
  changed(req.t); res.json({ ok: true, count: n });
});
r.get('/system', (req, res) => res.json({ ffmpeg: media.ffmpegOk, queue: media.queueLength }));

// ---- yedekler: işletmenin kendi klasöründe, en yeni 30 ----
const BACKUP_NAME = /^db-[A-Za-z0-9_.-]+\.json$/;
function listBackups(t) {
  return fs.readdirSync(t.dirs.backups).filter(n => BACKUP_NAME.test(n)).map(n => { const st = fs.statSync(path.join(t.dirs.backups, n)); return { name: n, size: st.size, time: st.mtimeMs }; }).sort((a, b) => b.time - a.time);
}
function backupNow(t, tag) {
  const now = new Date(), name = `db-${F.ymd(now)}_${F.hm(now).replace(':', '')}-${tag}.json`;
  fs.writeFileSync(path.join(t.dirs.backups, name), JSON.stringify(t.db, null, 2));
  for (const old of listBackups(t).slice(30)) fs.rmSync(path.join(t.dirs.backups, old.name), { force: true });
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
r.post('/backups', (req, res) => { try { res.json({ ok: true, name: backupNow(req.t, 'manuel') }); } catch (e) { res.status(500).json({ error: e.message }); } });
r.get('/backups/:name/download', (req, res) => {
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
    t.db = { ...t.db, ...parsed };
    const missing = t.db.videos.filter(v => (v.file || v.image) && !require('./storage').exists(t, v.file || v.image)).length;
    changed(t); res.json({ ok: true, missingFiles: missing });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---- resmî günler ----
r.get('/celebrate', (req, res) => { const t = req.t; res.json({ enabled: t.db.showCelebrations !== false, holidays: F.HOLIDAYS.map(h => ({ id: h.id, md: h.md, title: h.title, mourn: !!h.mourn, mode: F.celebMode(t, h.id), photos: F.celebPhotos(t, h) })), active: (F.activeCelebration(t) || {}).id || null }); });
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
  setTimeout(() => hub.pushTenant(t.id), 3 * 60 * 1000 + 500);
});
r.post('/celebrate/photos', quota, upload.single('file'), (req, res) => {
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
    for (const [k, n] of [['headline', 90], ['sub', 140], ['note', 160], ['qrLabel', 60]]) if (typeof b[k] === 'string') c[k] = str(b[k], n);
    if (b.everyMin !== undefined) c.everyMin = Math.max(1, Math.min(60, Math.round(Number(b.everyMin)) || 3));
    if (b.durSec !== undefined) c.durSec = Math.max(8, Math.min(60, Math.round(Number(b.durSec)) || 15));
    if (typeof b.url === 'string' && b.url.trim() !== c.url) {
      const u = b.url.trim();
      if (u && (!/^https?:\/\/\S+$/i.test(u) || u.length > 300)) throw new Error('Geçerli bir web adresi (https://...) girin');
      c.url = u; Object.assign(c, u ? await require('./qrtrack').build(req.t.id, c.id, 'camp', u, c.code) : { code: '', svg: '' });
    }
    if (typeof b.enabled === 'boolean') {
      if (b.enabled && !c.url) throw new Error('Önce kampanyanın bağlantısını (örn. Google yorum linki) girin');
      c.enabled = b.enabled;
    }
    if (c.enabled && !c.svg && c.url) Object.assign(c, await require('./qrtrack').build(req.t.id, c.id, 'camp', c.url, c.code));
    changed(t); res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
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
  if (b.bookGapMin != null && isFinite(Number(b.bookGapMin))) db.bookGapMin = Math.max(0, Math.min(120, Math.round(Number(b.bookGapMin))));
  if (['auto', 'lite', 'ultra', 'full'].includes(b.fxMode)) db.fxMode = b.fxMode;
  if (b.safeInset !== undefined && isFinite(Number(b.safeInset))) db.safeInset = Math.max(0, Math.min(12, Math.round(Number(b.safeInset) * 2) / 2));
  for (const k of ['L', 'R', 'T', 'B']) { const v = b['safe' + k]; if (v !== undefined && isFinite(Number(v))) db['safe' + k] = Math.max(0, Math.min(20, Math.round(Number(v) * 2) / 2)); }
  if (typeof b.safeGuide === 'boolean') db.safeGuide = b.safeGuide;
  changed(req.t); res.json({ ok: true });
});
r.put('/leagues', (req, res) => {
  const valid = new Set(F.CATALOG.map(([code]) => code));
  req.t.db.leagues = (req.body.enabled || []).filter(c => valid.has(c));
  changed(req.t); res.json({ ok: true });
  F.refreshMatches(); F.refreshStandings();
});

// ---- medya ----
r.post('/videos', quota, upload.array('files'), (req, res) => {
  const t = req.t;
  for (const f of req.files || []) {
    if (!/^(video|image)\//.test(f.mimetype)) { rmUpload(t, f.filename); continue; }
    const rec = { id: auth.uid(), file: f.filename, name: f.originalname, type: f.mimetype.startsWith('image/') ? 'image' : 'video', status: 'processing' };
    t.db.videos.push(rec);
    media.enqueue(t.id, rec.id);
  }
  changed(t); res.json({ ok: true });
});
r.delete('/videos/:id', (req, res) => {
  const t = req.t, v = t.db.videos.find(x => x.id === req.params.id);
  if (v) {
    if (v.file) rmUpload(t, v.file);
    if (v.image) rmUpload(t, v.image);
    if (v.design && v.design.photo) rmUpload(t, v.design.photo); // afiş stüdyosunun kaynak fotoğrafı
  }
  t.db.videos = t.db.videos.filter(x => x.id !== req.params.id);
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
r.put('/settings', (req, res) => { req.t.db.imageSeconds = Math.max(3, Number(req.body.imageSeconds) || 10); changed(req.t); res.json({ ok: true }); });

// ---- yorumlar, elle maçlar, doğum günleri ----
r.post('/reviews', (req, res) => {
  const { author, rating, text } = req.body, n = Number(rating);
  if (!author || !text || ![4, 5].includes(n)) return res.status(400).json({ error: 'isim, metin ve 4 veya 5 yıldız gerekli' });
  req.t.db.reviews.push({ id: auth.uid(), author: String(author).slice(0, 60), rating: n, text: String(text).slice(0, 400) });
  changed(req.t); res.json({ ok: true });
});
r.delete('/reviews/:id', (req, res) => { req.t.db.reviews = req.t.db.reviews.filter(x => x.id !== req.params.id); changed(req.t); res.json({ ok: true }); });
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

require('./routes-ext')(r, { changed, sendTo, upload, quota, ownerOnly, rmUpload, backupNow });
module.exports = { router: r, startJobs, activeTenantId };
