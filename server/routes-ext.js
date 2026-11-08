// Panel API'sinin yeni bölümleri (aynı /api/admin yönlendiricisine eklenir; req.t ve req.user hazırdır):
// zamanlama, hazır içerikler, durum izleme ve uyarılar, istatistik, şubeler, Google/Instagram, çoklu dil, KVKK.
const fs = require('fs');
const path = require('path');
const config = require('./config');
const store = require('./store');
const auth = require('./auth');
const tenants = require('./tenants');
const hub = require('./hub');
const SCH = require('./sched');
const monitor = require('./monitor');
const stats = require('./stats');
const social = require('./social');
const storage = require('./storage');
const { plan, access } = require('./plans');
const { LANGS } = require('./state');

const DAY = 86400000;
const s = (v, n) => String(v ?? '').trim().slice(0, n);

module.exports = function (r, { changed, sendTo, upload, quota, ownerOnly, rmUpload, backupNow }) {
  const err = (res, e, code = 400) => res.status(code).json({ error: e.message || String(e) });

  // ================= ZAMANLAMA =================
  // medya/afiş: zamanlama, gizleme, süre, ad
  r.put('/videos/:id', (req, res) => {
    const v = req.t.db.videos.find(x => x.id === req.params.id); if (!v) return res.status(404).json({ error: 'bulunamadı' });
    const b = req.body || {};
    if ('sch' in b) { const c = SCH.clean(b.sch); if (c) v.sch = c; else delete v.sch; }
    if (typeof b.hidden === 'boolean') v.hidden = b.hidden || undefined;
    if (typeof b.full === 'boolean') v.full = b.full || undefined;
    if (b.dur !== undefined) v.dur = b.dur ? Math.max(3, Math.min(v.type === 'youtube' ? 3600 : 120, Math.round(Number(b.dur)) || 10)) : undefined;
    if (typeof b.name === 'string' && b.name.trim()) v.name = s(b.name, 80);
    changed(req.t); res.json({ ok: true });
  });
  r.put('/campaigns/:id/sch', (req, res) => {
    const c = (req.t.db.campaigns || []).find(x => x.id === req.params.id); if (!c) return res.status(404).json({ error: 'bulunamadı' });
    const v = SCH.clean((req.body || {}).sch); if (v) c.sch = v; else delete c.sch;
    changed(req.t); res.json({ ok: true });
  });

  // ================= HAZIR İÇERİKLER (afişler medya döngüsünde durur) =================
  const POSTERS = ['happy', 'kahvalti', 'indirim', 'yeni', 'gunun', 'muzik', 'etkinlik', 'wifi', 'tesekkur'];
  const FIELDS = { badge: 20, title: 90, sub: 90, price: 20, note: 120, body: 400 };
  const cleanFields = f => { const o = {}; for (const [k, n] of Object.entries(FIELDS)) if (f && typeof f[k] === 'string') o[k] = f[k].slice(0, n); return o; };
  const cleanI18n = x => { const o = {}; if (x && typeof x === 'object') for (const l of LANGS) if (l !== 'tr' && x[l]) { const f = cleanFields(x[l]); if (Object.values(f).some(Boolean)) o[l] = f; } return Object.keys(o).length ? o : undefined; };
  function applyPoster(p, b, t) {
    if (POSTERS.includes(b.tpl)) p.tpl = b.tpl;
    if (b.fields) p.fields = cleanFields(b.fields);
    if ('i18n' in b) p.i18n = cleanI18n(b.i18n);
    if ('sch' in b) { const c = SCH.clean(b.sch); if (c) p.sch = c; else delete p.sch; }
    if (b.dur !== undefined) p.dur = b.dur ? Math.max(3, Math.min(120, Math.round(Number(b.dur)) || 10)) : undefined;
    if (b.image === null || b.image === '') { if (p.image) rmUpload(t, p.image); p.image = undefined; }
    else if (typeof b.image === 'string' && b.image !== p.image && claimLoose(t, b.image)) { if (p.image) rmUpload(t, p.image); p.image = b.image; } // yalnız yeni yüklenmiş fotoğraf
    p.name = s(b.name, 80) || (p.fields && p.fields.title) || 'Hazır içerik';
  }
  r.post('/posters', (req, res) => {
    const b = req.body || {}; if (!POSTERS.includes(b.tpl)) return res.status(400).json({ error: 'Şablon seçin' });
    const p = { id: auth.uid(), type: 'poster', status: 'ready', optimized: true, file: '' };
    applyPoster(p, b, req.t);
    if (b.position === 'first') req.t.db.videos.unshift(p); else req.t.db.videos.push(p);
    changed(req.t); res.json({ ok: true, id: p.id });
  });
  r.put('/posters/:id', (req, res) => {
    const p = req.t.db.videos.find(x => x.id === req.params.id && x.type === 'poster'); if (!p) return res.status(404).json({ error: 'bulunamadı' });
    applyPoster(p, req.body || {}, req.t);
    changed(req.t); res.json({ ok: true });
  });
  // Afiş / stüdyo fotoğrafı önce yüklenir, sonra afiş kaydında adıyla anılır. Kayıt yalnız bu yolla yüklenmiş ve henüz
  // bir afişe bağlanmamış dosyayı kabul eder: aksi hâlde başka bir dosyanın (medya, logo) adı verilip afişten
  // kaldırılınca o dosya silinirdi. 24 saat içinde hiçbir afişe bağlanmayan yükleme silinir.
  const LOOSE_TTL = 24 * 3600 * 1000;
  function pruneLoose(t) {
    const now = Date.now(), keep = [];
    for (const x of t.db.looseUp || []) { if (now - x.at > LOOSE_TTL) rmUpload(t, x.f); else keep.push(x); }
    if (keep.length) t.db.looseUp = keep.slice(-30); else delete t.db.looseUp;
  }
  // Afişe yeni bir dosya bağlanıyor: yalnız bekleyen yüklemelerden biriyse kabul edilir (ve bekleyenlerden çıkar)
  function claimLoose(t, f) {
    if (typeof f !== 'string' || !/^[\w.-]+$/.test(f)) return false;
    const list = t.db.looseUp || [], i = list.findIndex(x => x.f === f);
    if (i < 0) return false;
    list.splice(i, 1); if (!list.length) delete t.db.looseUp;
    return true;
  }
  r.post('/posters/image', quota, upload.single('file'), (req, res) => {
    const f = req.file; if (!f) return res.status(400).json({ error: 'dosya yok' });
    if (!/^image\/(jpeg|png|webp|gif)$/.test(f.mimetype) || !/\.(jpe?g|png|webp|gif)$/i.test(f.filename)) { rmUpload(req.t, f.filename); return res.status(400).json({ error: 'Yalnız JPG, PNG, WEBP ya da GIF fotoğraf yüklenebilir' }); }
    pruneLoose(req.t);
    (req.t.db.looseUp || (req.t.db.looseUp = [])).push({ f: f.filename, at: Date.now() });
    tenants.save(req.t);
    res.json({ ok: true, file: f.filename, url: req.t.upBase + f.filename });
  });

  // ================= REKLAM ALANI =================

  // ================= FOTOĞRAFTAN AFİŞ (stüdyo) =================
  // Afiş panelde (tarayıcıda) 1920x1080 JPG olarak çizilir ve fotoğraf gibi medyaya girer: eski ve yeni TV
  // uygulamalarında aynı görünür. Tasarım (yazılar, düzen, renkler, kaynak fotoğraf) yeniden düzenlemek için saklanır.
  // QR eklenirse içine kısa adres yazılır (okutma sayılır, Kampanya etkisi raporunda görünür).
  const QRT = require('./qrtrack');
  const LAYOUTS = ['tam', 'bolunmus', 'cerceve', 'vitrin'];
  const codeFree = (code, id) => { for (const t of tenants.all()) { if ((t.db.qrs || []).some(q => q.code === code) || (t.db.campaigns || []).some(c => c.code === code) || (t.db.videos || []).some(v => v.qrCode === code && v.id !== id)) return false; } return true; };
  r.post('/studio/qr', async (req, res) => {
    const url = s((req.body || {}).url, 300), old = s((req.body || {}).code, 12);
    if (!QRT.isUrl(url)) return res.status(400).json({ error: 'Geçerli bir web adresi (https://...) girin' });
    const code = /^[a-z0-9]{5,12}$/.test(old) ? old : QRT.newCode();
    const png = await require('qrcode').toDataURL(QRT.trackUrl(code), { margin: 1, errorCorrectionLevel: 'M', width: 480, color: { dark: '#14100c', light: '#ffffff' } });
    res.json({ ok: true, code, png });
  });
  r.post('/studio', quota, upload.single('file'), (req, res) => {
    const t = req.t, f = req.file;
    let m; try { m = JSON.parse((req.body || {}).meta || '{}'); } catch { m = {}; }
    if (!f || !/^image\/(jpeg|png)$/.test(f.mimetype)) { if (f) rmUpload(t, f.filename); return res.status(400).json({ error: 'Afiş görseli alınamadı' }); }
    const d = m.design || {}, fields = {};
    for (const [k, n] of Object.entries({ badge: 24, title: 90, sub: 120, price: 20, note: 140, qrLabel: 40 })) if (typeof (d.fields || {})[k] === 'string') fields[k] = d.fields[k].slice(0, n);
    const hexc = v => /^#[0-9a-f]{6}$/i.test(v || '') ? v : undefined;
    const design = { layout: LAYOUTS.includes(d.layout) ? d.layout : 'tam', fields, colors: d.colors && { bg: hexc(d.colors.bg), accent: hexc(d.colors.accent), text: hexc(d.colors.text) }, palette: d.palette === 'theme' ? 'theme' : 'photo', photo: /^[\w.-]+$/.test(d.photo || '') ? d.photo : undefined, qrUrl: QRT.isUrl(d.qrUrl) ? s(d.qrUrl, 300) : undefined };
    let v = m.id && t.db.videos.find(x => x.id === m.id && x.design);
    // kaynak fotoğraf: aynı afişin mevcut fotoğrafı ya da yeni yüklenmiş (bekleyen) bir fotoğraf; başka dosya adı kabul edilmez
    const oldPhoto = v && v.design && v.design.photo;
    if (design.photo && design.photo !== oldPhoto && !claimLoose(t, design.photo)) design.photo = oldPhoto || undefined;
    if (v) {
      if (v.file) rmUpload(t, v.file);
      if (v.design.photo && v.design.photo !== design.photo) rmUpload(t, v.design.photo);
      Object.assign(v, { file: f.filename, status: 'processing', optimized: false, reopt: true }); // reopt: küçültülürken de ekranda kalır
    } else {
      v = { id: auth.uid(), file: f.filename, type: 'image', status: 'processing', reopt: true };
      t.db.videos.push(v);
    }
    v.name = s(m.name, 80) || fields.title || 'Afiş'; v.design = design;
    const code = s(m.qrCode, 12);
    if (design.qrUrl && /^[a-z0-9]{5,12}$/.test(code) && codeFree(code, v.id)) { v.qrCode = code; v.qrUrl = design.qrUrl; QRT.register(code, t.id, v.id, 'media'); }
    else { delete v.qrCode; delete v.qrUrl; }
    require('./media').enqueue(t.id, v.id);
    changed(t); res.json({ ok: true, id: v.id });
  });

  // ================= DURUM İZLEME VE UYARILAR =================
  r.get('/devices/status', (req, res) => {
    const online = hub.onlineDeviceIds();
    res.json({
      devices: store.q.devicesOf.all(req.t.id).map(d => monitor.deviceView(d, online.has(d.id))),
      alerts: (req.t.db.alerts || []).slice(0, 30), notify: req.t.db.notify || {}, mail: monitor.mailEnabled(), offlineMin: monitor.offlineMin(req.t),
      build: require('./realtime').build,
    });
  });
  r.delete('/alerts', (req, res) => { req.t.db.alerts = []; changed(req.t); res.json({ ok: true }); });
  r.put('/notify', ownerOnly, (req, res) => {
    const b = req.body || {}, email = s(b.email, 120);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin' });
    const om = Math.round(Number(b.offlineMin));
    const old = req.t.db.notify || {};
    req.t.db.notify = { email, offline: b.offline !== false, online: b.online !== false, offlineMin: om >= 1 && om <= 1440 ? om : undefined, weekly: typeof b.weekly === 'boolean' ? b.weekly : !!old.weekly, weeklyAt: old.weeklyAt };
    changed(req.t); res.json({ ok: true });
  });
  r.post('/notify/test', ownerOnly, async (req, res) => {
    const n = req.t.db.notify || {};
    if (!monitor.mailEnabled()) return res.status(400).json({ error: 'E-posta gönderimi sunucuda ayarlı değil (SMTP)' });
    if (!n.email) return res.status(400).json({ error: 'Önce e-posta adresinizi kaydedin' });
    const ok = await monitor.sendMail(n.email, `${config.BRAND}: deneme bildirimi`, `${req.t.name} için uyarılar bu adrese gelecek.`);
    ok ? res.json({ ok: true }) : res.status(502).json({ error: 'E-posta gönderilemedi' });
  });
  // haftalık özetin şimdi bir örneğini gönder
  r.post('/notify/weekly-test', ownerOnly, async (req, res) => {
    const n = req.t.db.notify || {};
    if (!monitor.mailEnabled()) return res.status(400).json({ error: 'E-posta gönderimi sunucuda ayarlı değil (SMTP)' });
    if (!n.email) return res.status(400).json({ error: 'Önce e-posta adresinizi kaydedin' });
    const ok = await monitor.sendMail(n.email, `${config.BRAND}: haftalık özet · ${req.t.name}`, require('./weekly').text(req.t));
    ok ? res.json({ ok: true }) : res.status(502).json({ error: 'E-posta gönderilemedi' });
  });
  r.get('/notify/weekly-preview', (req, res) => res.type('text/plain; charset=utf-8').send(require('./weekly').text(req.t)));
  r.post('/devices/:id/snapshot', (req, res) => {
    const d = store.q.devicesOf.all(req.t.id).find(x => x.id === req.params.id); if (!d) return res.status(404).json({ error: 'bulunamadı' });
    const n = hub.sendDevice(d.id, { type: 'snap' });
    n ? res.json({ ok: true }) : res.status(409).json({ error: 'Cihaz şu an çevrimdışı' });
  });
  // performans testi: kutu sayfanın parçalarını sırayla kapatıp kare hızını ölçer (~1,5 dk), sonuç GET ile okunur
  r.post('/devices/:id/perf', (req, res) => {
    const d = store.q.devicesOf.all(req.t.id).find(x => x.id === req.params.id); if (!d) return res.status(404).json({ error: 'bulunamadı' });
    const sec = Math.max(5, Math.min(30, Number((req.body || {}).sec) || 12));
    const n = hub.sendDevice(d.id, { type: 'perf', sec });
    n ? res.json({ ok: true, sec }) : res.status(409).json({ error: 'Cihaz şu an çevrimdışı' });
  });
  r.get('/devices/:id/perf', (req, res) => {
    const d = store.q.devicesOf.all(req.t.id).find(x => x.id === req.params.id); const p = d && monitor.perf.get(d.id);
    if (!p) return res.status(404).json({ error: 'henüz yok' });
    res.json(p);
  });
  r.get('/devices/:id/snapshot', (req, res) => {
    const d = store.q.devicesOf.all(req.t.id).find(x => x.id === req.params.id); const sn = d && monitor.snaps.get(d.id);
    if (!sn) return res.status(404).json({ error: 'henüz yok' });
    res.json({ at: sn.at, data: sn.data });
  });

  // ================= İSTATİSTİK =================
  r.get('/stats.csv', (req, res) => { const d = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30; res.set('Content-Disposition', `attachment; filename="istatistik-${d}-gun.csv"`).type('text/csv; charset=utf-8').send(stats.csv(req.t, d)); });
  r.get('/stats', (req, res) => res.json(stats.summary(req.t, [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30)));

  // ================= ŞUBELER =================
  const homeOf = u => tenants.get(auth.impOf(u) || u.tenant_id);
  function orgList(t) { return t.org_id ? store.q.orgTenants.all(t.org_id) : [{ id: t.id, name: t.name }]; }
  r.get('/branches', (req, res) => {
    const home = homeOf(req.user), online = hub.onlineDeviceIds();
    const list = orgList(req.t).map(b => { const bt = tenants.get(b.id), devs = store.q.devicesOf.all(b.id); return { id: b.id, name: bt.name, devices: devs.length, online: devs.filter(d => online.has(d.id)).length, access: access(bt), media: bt.db.videos.length, home: home && b.id === home.id }; });
    res.json({ current: req.t.id, list, limit: plan(home || req.t).branches || 1, canManage: req.user.role !== 'staff' });
  });
  r.post('/branches', ownerOnly, (req, res) => {
    const home = homeOf(req.user); if (!home) return res.status(400).json({ error: 'işletme bulunamadı' });
    const name = s((req.body || {}).name, 80); if (name.length < 2) return res.status(400).json({ error: 'Şube adı gerekli' });
    // askıdaki ya da süresi dolmuş hesap şube açamaz (şube ayrı bir işletme olarak ekran yayınına başlardı)
    const acc = access(home); if (!acc.ok) return res.status(403).json({ error: acc.reason === 'suspended' ? 'Hesabınız askıda; şube açılamaz' : 'Aboneliğiniz sona erdi; şube açmak için paketinizi yenileyin' });
    const lim = plan(home).branches || 1, cur = orgList(home).length;
    if (cur >= lim) return res.status(400).json({ error: lim <= 1 ? 'Şube açmak Pro pakette. Paketinizi yükseltin.' : `Paketinizde en çok ${lim} şube olabilir` });
    const org = home.org_id || home.id;
    if (!home.org_id) { store.updateTenant(home.id, { org_id: org }); tenants.refreshRow(home.id); }
    const id = auth.uid(), now = Date.now(), W = require('./widgets');
    const doc = { ...tenants.defaultDoc(), location: home.db.location, theme: home.db.theme };
    store.sql.transaction(() => {
      store.q.tenantIns.run({ id, name, plan: home.plan, status: home.status, trial_until: home.trial_until, paid_until: home.paid_until, phone: home.phone || '', created: now, data: JSON.stringify(doc) });
      store.updateTenant(id, { org_id: org, note: `Şube: ${home.name}` });
      store.q.screenIns.run({ id: auth.uid(), tenant_id: id, name: 'Ana Ekran', layout: store.q.screensOf.all(home.id)[0] ? store.q.screensOf.all(home.id)[0].layout : JSON.stringify(W.cleanLayout(W.defaultLayout())), sort: 0, created: now });
    })();
    const t = tenants.get(id);
    if (home.db.logo) { try { const f = auth.uid(16) + path.extname(home.db.logo); storage.copy(home, home.db.logo, t, f).then(() => { t.db.logo = f; tenants.save(t); }).catch(() => {}); } catch (e) {} }
    res.json({ ok: true, id });
  });
  r.post('/branches/switch', (req, res) => {
    const id = String((req.body || {}).id || ''), list = orgList(homeOf(req.user) || req.t);
    if (!list.some(b => b.id === id)) return res.status(404).json({ error: 'Şube bulunamadı' });
    if (auth.impOf(req.user)) auth.setSession(req, res, req.user, { imp: id }); // işletme olarak girilmişse o zincirin şubesine geçer
    else if (req.user.role === 'owner') auth.setSession(req, res, req.user, { br: id === req.user.tenant_id ? undefined : id });
    else return res.status(403).json({ error: 'Şube değiştirmek için işletme sahibi yetkisi gerekir' });
    res.json({ ok: true });
  });
  r.put('/branches/:id', ownerOnly, (req, res) => {
    if (!orgList(homeOf(req.user) || req.t).some(b => b.id === req.params.id)) return res.status(404).json({ error: 'Şube bulunamadı' });
    const name = s((req.body || {}).name, 80); if (name.length < 2) return res.status(400).json({ error: 'Şube adı gerekli' });
    store.updateTenant(req.params.id, { name }); tenants.refreshRow(req.params.id); hub.pushTenant(req.params.id); res.json({ ok: true });
  });
  // İçeriği diğer şubelere kopyala: düzen, renk ve logo, medya ve afişler, fiyat listesi, duyurular (kampanya + QR)
  const PARTS = ['layout', 'theme', 'media', 'menu', 'promo', 'lang'];
  r.post('/branches/copy', ownerOnly, async (req, res) => {
    const b = req.body || {}, src = req.t, list = orgList(homeOf(req.user) || src).map(x => x.id);
    const targets = (Array.isArray(b.targets) ? b.targets : []).filter(id => id !== src.id && list.includes(id));
    const parts = (Array.isArray(b.parts) ? b.parts : []).filter(p => PARTS.includes(p));
    if (!targets.length || !parts.length) return res.status(400).json({ error: 'Şube ve kopyalanacak içerik seçin' });
    const mode = b.media === 'replace' ? 'replace' : 'append';
    let copiedFiles = 0;
    try {
      for (const id of targets) {
        const t = tenants.get(id), lim = plan(t).storageMB * 1048576;
        if (parts.includes('layout')) { const l = store.q.screensOf.all(src.id)[0]; if (l) store.updateScreen(tenants.mainScreen(t).id, t.id, { layout: l.layout }); }
        if (parts.includes('theme')) {
          t.db.theme = JSON.parse(JSON.stringify(src.db.theme));
          if (src.db.logo) { const f = auth.uid(16) + path.extname(src.db.logo); await storage.copy(src, src.db.logo, t, f); if (t.db.logo) rmUpload(t, t.db.logo); t.db.logo = f; copiedFiles++; }
        }
        if (parts.includes('menu')) t.db.menu = JSON.parse(JSON.stringify(src.db.menu));
        if (parts.includes('lang')) t.db.lang = JSON.parse(JSON.stringify(src.db.lang || {}));
        if (parts.includes('promo')) { t.db.campaigns = JSON.parse(JSON.stringify(src.db.campaigns || [])); t.db.qrs = JSON.parse(JSON.stringify(src.db.qrs || [])); await require('./qrtrack').ensure(t); } // kopyalanan QR'lar yeni sayaç kodu alır
        if (parts.includes('media')) {
          // Önce kopyalanır, sonra (değiştir modunda) eskiler silinir: kopyalama ortada kesilirse şube içeriksiz kalmaz.
          // Kota, kopyalanacak dosyaların toplamıyla baştan denetlenir (değiştir modunda boşalacak yer de hesaba katılır).
          const sizeOf = (tt, f) => { try { return fs.statSync(storage.localPath(tt, f)).size; } catch { const o = store.q.objGet.get(tt.id, f); return o ? o.size : 0; } };
          const filesOf = v => [v.file, v.image, v.design && v.design.photo].filter(Boolean);
          const items = src.db.videos.filter(v => v.status !== 'processing');
          const need = items.reduce((a, v) => a + filesOf(v).reduce((b, f) => b + sizeOf(src, f), 0), 0);
          const freed = mode === 'replace' ? t.db.videos.reduce((a, v) => a + filesOf(v).reduce((b, f) => b + sizeOf(t, f), 0), 0) : 0;
          if (storage.usedBytes(t) - freed + need > lim) throw new Error(`${t.name}: depolama kotası yetmiyor`);
          const fresh = [], made = [];
          try {
            for (const v of items) {
              const c = JSON.parse(JSON.stringify(v)); c.id = auth.uid();
              for (const k of ['file', 'image']) if (c[k]) { const f = auth.uid(16) + path.extname(c[k]); await storage.copy(src, c[k], t, f); made.push(f); c[k] = f; copiedFiles++; }
              if (c.design && c.design.photo) { const f = auth.uid(16) + path.extname(c.design.photo); try { await storage.copy(src, c.design.photo, t, f); made.push(f); c.design.photo = f; } catch (e) { delete c.design.photo; } }
              fresh.push(c);
            }
          } catch (e) { for (const f of made) rmUpload(t, f); throw e; } // yarım kopya bırakma
          if (mode === 'replace') { for (const v of t.db.videos) { for (const f of filesOf(v)) rmUpload(t, f); } t.db.videos = fresh; }
          else t.db.videos.push(...fresh);
          await require('./qrtrack').ensure(t); // QR'lı afişin kısa kodu kaynağınkiyle çakışmasın (okutmalar yanlış işletmeye yazılmasın)
        }
        tenants.save(t); hub.pushTenant(t.id);
      }
      res.json({ ok: true, targets: targets.length, files: copiedFiles });
    } catch (e) { err(res, e, 500); }
  });

  // ================= GOOGLE YORUMLARI VE INSTAGRAM =================
  r.get('/google/search', async (req, res) => { try { res.json(await social.googleSearch(req.query.q)); } catch (e) { err(res, e, 502); } });
  r.put('/google', async (req, res) => {
    const b = req.body || {}, g = req.t.db.google || (req.t.db.google = {});
    if (typeof b.placeId === 'string' && b.placeId !== g.placeId) { Object.assign(g, { placeId: s(b.placeId, 300), name: s(b.name, 120), reviews: [], updated: 0, tried: 0, error: '' }); }
    if (typeof b.show === 'boolean') g.show = b.show;
    changed(req.t);
    if (g.placeId && !g.updated) await social.googleRefresh(req.t);
    res.json({ ok: true, google: req.t.db.google });
  });
  r.post('/google/refresh', async (req, res) => { const g0 = req.t.db.google || {}; if (!g0.placeId) return res.status(400).json({ error: 'Önce işletmenizi seçin' }); if (Date.now() - (g0.manualAt || 0) < 10 * 60000) return res.status(429).json({ error: 'Yorumlar az önce yenilendi; 10 dakika sonra tekrar deneyin' }); g0.manualAt = Date.now(); await social.googleRefresh(req.t); res.json({ ok: true, google: req.t.db.google }); });
  r.delete('/google', (req, res) => { delete req.t.db.google; changed(req.t); res.json({ ok: true }); });

  r.put('/instagram', async (req, res) => {
    const b = req.body || {}, ig = req.t.db.instagram || (req.t.db.instagram = { enabled: true, every: 3, count: 8, dur: 10 });
    if (typeof b.token === 'string' && b.token.trim()) { ig.token = s(b.token, 600); ig.tokenAt = 0; ig.updated = 0; ig.tried = 0; ig.error = ''; }
    if (typeof b.enabled === 'boolean') ig.enabled = b.enabled;
    for (const [k, lo, hi] of [['every', 1, 20], ['count', 1, 20], ['dur', 5, 60]]) if (b[k] !== undefined) ig[k] = Math.max(lo, Math.min(hi, Math.round(Number(b[k])) || lo));
    changed(req.t);
    if (ig.token && !ig.updated) await social.igRefresh(req.t, true);
    const { token, ...pub } = req.t.db.instagram; res.json({ ok: !pub.error, instagram: { ...pub, connected: !!token }, error: pub.error || undefined });
  });
  r.post('/instagram/refresh', async (req, res) => { const ig = req.t.db.instagram; if (!ig || !ig.token) return res.status(400).json({ error: 'Önce Instagram hesabınızı bağlayın' }); await social.igRefresh(req.t, true); res.json({ ok: !ig.error, error: ig.error || undefined }); });
  r.delete('/instagram', (req, res) => { const ig = req.t.db.instagram; if (ig) for (const p of ig.posts || []) rmUpload(req.t, p.file); delete req.t.db.instagram; changed(req.t); res.json({ ok: true }); });

  // ================= ÇOKLU DİL =================
  r.put('/lang', (req, res) => {
    const b = req.body || {}, cur = req.t.db.lang || {};
    const list = Array.isArray(b.list) ? [...new Set(b.list.filter(l => LANGS.includes(l) && l !== 'tr'))].slice(0, 3) : cur.list || [];
    req.t.db.lang = { list, sec: b.sec !== undefined ? Math.max(5, Math.min(60, Math.round(Number(b.sec)) || 12)) : cur.sec || 12 };
    changed(req.t); res.json({ ok: true });
  });

  // ================= MÜZİK (SPOTIFY & YOUTUBE MUSIC & UZAKTAN KUMANDA) =================
  const SP = require('./spotify');
  SP.setOnChange(t => changed(t)); // erişim anahtarı yenilenince TV'lere yeni durum gider
  // ScreenPano'nun kendi Spotify oynatıcısı (TV'de) kısa ömürlü anahtarla çalışır: süresi dolmadan sunucu yeniler
  setInterval(() => {
    for (const t of tenants.all()) {
      const m = t.db.music, a = m && m.spotify;
      if (!a || !a.refreshToken || a.expired || !m.enabled || SP.external(t)) continue;
      if (!(m.playlists || []).some(x => x.provider === 'spotify')) continue;
      if (!a.expiresAt || a.expiresAt - Date.now() < 15 * 60000) SP.access(t).catch(() => {});
    }
  }, 5 * 60000).unref();
  // Harici Spotify cihazında çalan şarkı TV'lerdeki "şu an çalıyor" çubuğuna gider (değişince)
  const spNowSig = new Map();
  setInterval(async () => {
    for (const t of tenants.all()) {
      const m = t.db.music; if (!m || !m.enabled || !SP.external(t)) { spNowSig.delete(t.id); continue; }
      const cur = (m.playlists || []).find(x => x.id === m.activeId); if (!cur || cur.provider !== 'spotify') continue;
      const n = await SP.nowPlaying(t).catch(() => null), now = n && n.title ? { title: n.title, artist: n.artist, thumb: n.thumb, playing: n.playing } : null;
      const sig = JSON.stringify(now), last = spNowSig.get(t.id); // değişince, değişmese de dakikada bir (yeni açılan TV de görsün)
      if (last && last.sig === sig && Date.now() - last.at < 60000) continue;
      spNowSig.set(t.id, { sig, at: Date.now() }); sendTo(t, { type: 'music_now', now });
    }
  }, 8000).unref();
  function ensureMusic(db) {
    if (!db.music || typeof db.music !== 'object') {
      db.music = { enabled: false, playing: true, volume: 75, muteVideo: true, showNowPlaying: true, activeId: '', playlists: [], spotify: {} };
    }
    if (!Array.isArray(db.music.playlists)) db.music.playlists = [];
    if (!db.music.spotify || typeof db.music.spotify !== 'object') db.music.spotify = {};
    // Hazır "Türkçe Pop" listesi yanlış Spotify listesine gidiyordu; eklenmiş olanlar doğru listeye çevrilir
    for (const x of db.music.playlists) {
      if (x.spotifyId === '37i9dQZF1DX4Wsb4d7NKfP') Object.assign(x, { spotifyId: '7uGniGmKxD4fmxGJWPqZAl', url: 'https://open.spotify.com/playlist/7uGniGmKxD4fmxGJWPqZAl', thumb: '' });
      if (x.videoId === 'jfKfPfyJRdk' || x.videoId === '5qap5aO4i9A') Object.assign(x, { videoId: 'lTRiuFIWV54', url: 'https://music.youtube.com/watch?v=lTRiuFIWV54', thumb: 'https://i.ytimg.com/vi/lTRiuFIWV54/hqdefault.jpg' });
    }
    return db.music;
  }
  function parseMusicUrl(raw) {
    const u = String(raw || '').trim();
    if (!u) return null;
    // Spotify URI: spotify:playlist:37i9dQZF1DX4WYpdgoIcn6
    const spUri = /^spotify:(playlist|album|track|artist):([a-zA-Z0-9]+)$/i.exec(u);
    if (spUri) {
      const spotifyType = spUri[1].toLowerCase(), spotifyId = spUri[2];
      return { provider: 'spotify', spotifyType, spotifyId, url: `https://open.spotify.com/${spotifyType}/${spotifyId}` };
    }
    // Spotify Web URL: https://open.spotify.com/intl-tr/playlist/37i9dQZF1DX4WYpdgoIcn6?...
    const spUrl = /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(playlist|album|track|artist)\/([a-zA-Z0-9]+)/i.exec(u);
    if (spUrl) {
      const spotifyType = spUrl[1].toLowerCase(), spotifyId = spUrl[2];
      return { provider: 'spotify', spotifyType, spotifyId, url: `https://open.spotify.com/${spotifyType}/${spotifyId}` };
    }
    // YouTube / YouTube Music URL
    if (/(?:youtube\.com|youtu\.be)/i.test(u)) {
      let videoId = '', listId = '';
      const lm = /[?&]list=([a-zA-Z0-9_-]+)/.exec(u);
      if (lm) listId = lm[1];
      const vm = /(?:[?&]v=|youtu\.be\/|youtube\.com\/(?:embed|shorts|live)\/)([a-zA-Z0-9_-]{11})/.exec(u);
      if (vm) videoId = vm[1];
      if (videoId || listId) {
        const isYtm = /music\.youtube\.com/i.test(u);
        return { provider: isYtm ? 'ytm' : 'yt', videoId, listId, url: u };
      }
    }
    // Doğrudan radyo / ses akışı (MP3, AAC, M3U8, Icecast/Shoutcast)
    if (/^https?:\/\/.+/i.test(u)) {
      return { provider: 'radio', url: u };
    }
    return null;
  }
  async function fetchMusicMeta(parsed) {
    try {
      if (parsed.provider === 'spotify') {
        const r2 = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(parsed.url)}`, { signal: AbortSignal.timeout(4000) });
        if (r2.ok) { const j = await r2.json(); return { title: s(j.title, 90), thumb: s(j.thumbnail_url, 300) }; }
      } else if (parsed.provider === 'yt' || parsed.provider === 'ytm') {
        const target = parsed.videoId ? `https://www.youtube.com/watch?v=${parsed.videoId}` : `https://www.youtube.com/playlist?list=${parsed.listId}`;
        const r2 = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(target)}&format=json`, { signal: AbortSignal.timeout(4000) });
        if (r2.ok) { const j = await r2.json(); return { title: s(j.title, 90), thumb: s(j.thumbnail_url, 300) }; }
      }
    } catch (e) {}
    return {};
  }
  r.put('/music', (req, res) => {
    const m = ensureMusic(req.t.db), b = req.body || {};
    if (typeof b.enabled === 'boolean') m.enabled = b.enabled;
    if (typeof b.playing === 'boolean') m.playing = b.playing;
    if (b.volume !== undefined) m.volume = Math.max(0, Math.min(100, Math.round(Number(b.volume)) || 0));
    if (typeof b.muteVideo === 'boolean') m.muteVideo = b.muteVideo;
    if (typeof b.showNowPlaying === 'boolean') m.showNowPlaying = b.showNowPlaying;
    if (typeof b.activeId === 'string') m.activeId = s(b.activeId, 40);
    // Spotify anahtarları yalnız hesap bağlantısıyla (OAuth) gelir; panelden elle girilmez
    if (b.spotify && typeof b.spotify === 'object' && typeof b.spotify.deviceName === 'string') m.spotify.deviceName = s(b.spotify.deviceName, 60);
    changed(req.t);
    res.json({ ok: true, music: m });
  });
  r.post('/music/playlist', async (req, res) => {
    const m = ensureMusic(req.t.db), b = req.body || {};
    const parsed = parseMusicUrl(b.url);
    if (!parsed) return res.status(400).json({ error: 'Geçerli bir Spotify, YouTube Music, YouTube veya Radyo bağlantısı girin' });
    let title = s(b.title, 90), thumb = s(b.thumb, 300), category = s(b.category, 40);
    if (!title || !thumb) {
      const meta = await fetchMusicMeta(parsed);
      if (!title) title = meta.title || (parsed.provider === 'spotify' ? 'Spotify Listesi' : parsed.provider === 'ytm' ? 'YouTube Music Listesi' : parsed.provider === 'yt' ? 'YouTube Müzik' : 'Canlı Radyo');
      if (!thumb && meta.thumb) thumb = meta.thumb;
    }
    const item = { id: auth.uid(10), title, category: category || '', thumb: thumb || '', ...parsed, addedAt: Date.now() };
    m.playlists.unshift(item);
    m.playlists = m.playlists.slice(0, 50);
    if (b.playNow || !m.activeId) { m.activeId = item.id; m.enabled = true; m.playing = true; }
    changed(req.t);
    if (b.playNow) sendTo(req.t, { type: 'music_cmd', cmd: 'select', id: item.id, music: m });
    let warn = '';
    if (b.playNow && item.provider === 'spotify' && SP.external(req.t)) { try { await SP.play(req.t, item, null, m.volume); } catch (e) { warn = e.message; } }
    res.json({ ok: true, item, music: m, warn });
  });
  r.delete('/music/playlist/:id', (req, res) => {
    const m = ensureMusic(req.t.db);
    m.playlists = m.playlists.filter(x => x.id !== req.params.id);
    if (m.activeId === req.params.id) m.activeId = (m.playlists[0] && m.playlists[0].id) || '';
    changed(req.t);
    res.json({ ok: true, music: m });
  });
  // Müzik komutu (panelden HTTP ile, TV menüsünden WebSocket ile gelir; aynı mantık)
  const musicCmd = async (t, b) => {
    const req = { t }, m = ensureMusic(t.db); b = b || {}; let cmd = String(b.cmd || '');
    if (!['play', 'pause', 'toggle', 'next', 'prev', 'volume', 'select', 'enabled', 'source'].includes(cmd)) return { code: 400, body: { error: 'Geçersiz komut' } };
    // Kaynak değiştir (YouTube ↔ Spotify): o kaynağın son çalan ya da ilk listesi seçilir; diğer kaynak aşağıda susturulur
    if (cmd === 'source') {
      const want = b.source === 'spotify', grp = x => (x.provider === 'spotify') === want, key = want ? 'spotify' : 'yt';
      let it = m.playlists.find(x => x.id === (m.lastBy || {})[key]);
      if (!it || !grp(it)) it = m.playlists.find(grp);
      if (!it) return { code: 400, body: { error: want ? 'Önce kitaplığa bir Spotify listesi ekleyin' : 'Önce kitaplığa bir YouTube listesi ekleyin' } };
      b.id = it.id; cmd = 'select';
    }
    if (cmd === 'play') { m.enabled = true; m.playing = true; }
    else if (cmd === 'pause') { m.playing = false; }
    else if (cmd === 'toggle') { m.enabled = true; m.playing = !m.playing; }
    else if (cmd === 'enabled') { m.enabled = !!b.enabled; if (m.enabled) m.playing = true; }
    else if (cmd === 'volume' && b.volume !== undefined) { m.volume = Math.max(0, Math.min(100, Math.round(Number(b.volume)) || 0)); }
    else if (cmd === 'select' && typeof b.id === 'string') {
      m.activeId = b.id; m.enabled = true; m.playing = true;
      const it0 = m.playlists.find(x => x.id === b.id); if (it0) m.lastBy = { ...(m.lastBy || {}), [it0.provider === 'spotify' ? 'spotify' : 'yt']: it0.id };
    }
    // listede belirli şarkıdan başlat (YouTube listeleri): TV'ye bir kerelik gider, kalıcı kaydedilmez
    const start = cmd === 'select' && (Number.isInteger(b.index) || typeof b.videoId === 'string') ? { index: Math.max(0, Math.min(500, Number(b.index) || 0)), videoId: /^[A-Za-z0-9_-]{11}$/.test(b.videoId || '') ? b.videoId : '' } : null;
    // Sonraki/önceki liste: YouTube çalma listesi ve bağlı Spotify kendi içinde şarkı atlar; diğerlerinde liste sunucuda değişir,
    // böylece seçim kalıcı olur (sonraki durum güncellemesinde eski listeye dönmez) ve tüm ekranlar aynı listeyi çalar
    let rotated = false;
    if ((cmd === 'next' || cmd === 'prev') && m.playlists.length > 1) {
      const i0 = Math.max(0, m.playlists.findIndex(x => x.id === m.activeId)), cur = m.playlists[i0];
      const inner = (cur.provider === 'yt' || cur.provider === 'ytm') && cur.listId || cur.provider === 'ytmix' && (cur.tracks || []).length || cur.provider === 'spotify' && (m.spotify.accessToken || SP.connected(req.t));
      if (!inner) { m.activeId = m.playlists[(i0 + (cmd === 'next' ? 1 : m.playlists.length - 1)) % m.playlists.length].id; rotated = true; }
    }
    // Spotify (TV kutusundaki Spotify uygulaması gibi harici cihaz seçiliyse): komut Spotify Web API ile o cihaza gider
    let warn = '';
    const curIt = m.playlists.find(x => x.id === m.activeId);
    // başka bir listeye geçilince Spotify uygulaması susturulur (iki müzik üst üste çalmasın)
    if (SP.external(req.t) && ['select', 'play', 'toggle', 'enabled', 'next', 'prev'].includes(cmd) && m.playing && curIt && curIt.provider !== 'spotify') { try { await SP.control(req.t, 'pause'); } catch (e) { warn = 'Spotify durdurulamadı: ' + e.message; } }
    if (SP.external(req.t) && curIt && curIt.provider === 'spotify') {
      const spStart = cmd === 'select' && typeof b.uri === 'string' && /^spotify:track:[A-Za-z0-9]{10,40}$/.test(b.uri) ? { uri: b.uri } : null;
      try {
        if (cmd === 'select' || cmd === 'play' || (cmd === 'enabled' && m.enabled)) await SP.play(req.t, curIt, spStart, m.volume);
        else if (cmd === 'pause' || (cmd === 'enabled' && !m.enabled) || (cmd === 'toggle' && !m.playing)) await SP.control(req.t, 'pause');
        else if (cmd === 'toggle' && m.playing) await SP.control(req.t, 'resume');
        else if (cmd === 'next' || cmd === 'prev') await SP.control(req.t, cmd);
        else if (cmd === 'volume') await SP.control(req.t, 'volume', { volume: m.volume });
      } catch (e) { warn = e.message; }
    }
    tenants.save(req.t);
    sendTo(req.t, { type: 'music_cmd', cmd, rotated, start, volume: m.volume, id: m.activeId, playing: m.playing, enabled: m.enabled, music: m });
    hub.pushTenant(req.t.id);
    return { code: 200, body: { ok: true, music: m, warn } };
  };
  hub.musicCmd = musicCmd;
  r.post('/music/cmd', async (req, res) => { const o = await musicCmd(req.t, req.body || {}); res.status(o.code).json(o.body); });

  // ================= YOUTUBE HESABI (Google OAuth, yalnız okuma) =================
  const yt = require('./youtube');
  r.get('/music/google', (req, res) => res.json(yt.status(req.t)));
  // panelde bağlantıya tıklanınca tarayıcı buraya gelir ve Google'ın giriş sayfasına yönlendirilir
  r.get('/music/google/connect', ownerOnly, (req, res) => {
    if (!yt.configured(req.t)) return res.redirect('/panel?yt=nocfg#music');
    res.redirect(yt.authUrl(req.t.id));
  });
  r.get('/music/google/playlists', async (req, res) => {
    try { res.json({ items: await yt.playlists(req.t, req.query.force === '1') }); }
    catch (e) { res.status(e.code === 'reconnect' ? 409 : 502).json({ error: e.message, reconnect: e.code === 'reconnect' }); }
  });
  r.get('/music/tracks', async (req, res) => {
    try { res.json({ items: await yt.tracks(req.t, String(req.query.list || '')) }); }
    catch (e) { res.status(e.code === 'reconnect' ? 409 : 502).json({ error: e.message, reconnect: e.code === 'reconnect' }); }
  });
  // Şarkı arama (panelin "Şarkı ara" sekmesi): InnerTube üzerinden, anahtar gerekmez
  const searchHits = new Map();
  r.get('/music/search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ items: [] });
    const h = searchHits.get(req.t.id) || { n: 0, at: Date.now() };
    if (Date.now() - h.at > 60000) { h.n = 0; h.at = Date.now(); }
    if (++h.n > 20) return res.status(429).json({ error: 'Çok sık arama yapıyorsunuz; biraz bekleyin' });
    searchHits.set(req.t.id, h);
    try { res.json({ items: await yt.search(q) }); }
    catch (e) { res.status(502).json({ error: 'Arama yapılamadı; tekrar deneyin' }); }
  });
  // Kendi çalma listesi: şarkılar işletmenin kendi verisinde durur (YouTube hesabına yazılmaz),
  // TV listedeki videoId'leri sırayla çalar. tracks: [{ v, t, c, th, d }]
  const cleanTracks = list => (Array.isArray(list) ? list : []).slice(0, 200).map(t => t && typeof t === 'object' ? {
    v: /^[A-Za-z0-9_-]{11}$/.test(t.v || '') ? t.v : '',
    t: s(t.t, 120), c: s(t.c, 80), th: s(t.th, 300), d: Math.max(0, Math.min(86400, Math.round(Number(t.d)) || 0)),
  } : null).filter(t => t && t.v);
  r.post('/music/custom', (req, res) => {
    const m = ensureMusic(req.t.db), b = req.body || {}, tracks = cleanTracks(b.tracks);
    if (!tracks.length) return res.status(400).json({ error: 'Listeye en az bir şarkı ekleyin' });
    const item = { id: auth.uid(10), title: s(b.title, 90) || 'Listem', category: 'Kendi listem', thumb: tracks[0].th || '', provider: 'ytmix', videoId: '', listId: '', url: '', tracks, addedAt: Date.now() };
    m.playlists.unshift(item);
    m.playlists = m.playlists.slice(0, 50);
    if (b.playNow || !m.activeId) { m.activeId = item.id; m.enabled = true; m.playing = true; }
    changed(req.t);
    if (b.playNow) sendTo(req.t, { type: 'music_cmd', cmd: 'select', id: item.id, music: m });
    res.json({ ok: true, item, music: m });
  });
  r.put('/music/custom/:id', (req, res) => {
    const m = ensureMusic(req.t.db), it = m.playlists.find(x => x.id === req.params.id);
    if (!it || it.provider !== 'ytmix') return res.status(404).json({ error: 'Liste bulunamadı' });
    const b = req.body || {};
    if (typeof b.title === 'string' && b.title.trim()) it.title = s(b.title, 90);
    if (Array.isArray(b.tracks)) {
      const tracks = cleanTracks(b.tracks);
      if (!tracks.length) return res.status(400).json({ error: 'Listeye en az bir şarkı ekleyin' });
      it.tracks = tracks;
      it.thumb = tracks[0].th || it.thumb;
    }
    if (b.playNow) { m.activeId = it.id; m.enabled = true; m.playing = true; }
    changed(req.t);
    if (b.playNow) sendTo(req.t, { type: 'music_cmd', cmd: 'select', id: it.id, music: m });
    res.json({ ok: true, item: it, music: m });
  });
  // TV'nin bildirdiği o an çalan şarkı (panelin "Şimdi çalıyor" çubuğu için)
  r.get('/music/now', async (req, res) => {
    const m = ensureMusic(req.t.db), cur = m.playlists.find(x => x.id === m.activeId);
    if (cur && cur.provider === 'spotify' && SP.external(req.t) && m.enabled) { const n = await SP.nowPlaying(req.t); return res.json(n ? { ...n, itemId: cur.id } : {}); }
    const n = require('./musicnow').get(req.t.id); res.json(n || {});
  });

  // ================= SPOTIFY HESABI (OAuth; listeler, arama, cihaz seçimi) =================
  // ---- İşletmenin kendi uygulama anahtarı (Google / Spotify): yönetimden bağımsız hesap bağlama ----
  const APPS = {
    google: { ok: id => /^[\w-]{10,}\.apps\.googleusercontent\.com$/.test(id), bad: 'Client ID “…apps.googleusercontent.com” ile bitmelidir', off: async t => { await yt.disconnect(t); } },
    spotify: { ok: id => /^[0-9a-f]{32}$/i.test(id), bad: 'Spotify Client ID 32 karakterlik bir koddur', off: async t => { await SP.disconnect(t); } },
  };
  r.put('/music/app/:k', ownerOnly, async (req, res) => {
    const A = APPS[req.params.k]; if (!A) return res.status(404).json({ error: 'Bilinmeyen kaynak' });
    const id = String((req.body || {}).id || '').trim(), secret = String((req.body || {}).secret || '').trim();
    if (!A.ok(id)) return res.status(400).json({ error: A.bad });
    if (secret.length < 12 || secret.length > 200 || /\s/.test(secret)) return res.status(400).json({ error: 'Client Secret geçersiz görünüyor' });
    const apps = req.t.db.oauthApps || (req.t.db.oauthApps = {});
    const changed0 = !apps[req.params.k] || apps[req.params.k].id !== id;
    apps[req.params.k] = { id, secret };
    if (changed0) await A.off(req.t); // eski uygulamayla alınmış bağlantı yeni uygulamada geçmez
    changed(req.t); res.json({ ok: true });
  });
  r.delete('/music/app/:k', ownerOnly, async (req, res) => {
    const A = APPS[req.params.k]; if (!A) return res.status(404).json({ error: 'Bilinmeyen kaynak' });
    if (req.t.db.oauthApps && req.t.db.oauthApps[req.params.k]) { delete req.t.db.oauthApps[req.params.k]; await A.off(req.t); changed(req.t); }
    res.json({ ok: true });
  });
  const spErr = (res, e) => res.status(e.code === 'reconnect' ? 409 : e.code === 'hidden' ? 404 : 502).json({ error: e.message, reconnect: e.code === 'reconnect', hidden: e.code === 'hidden' });
  r.get('/music/spotify', (req, res) => res.json({ ...SP.status(req.t), redirect: SP.redirectUri() }));
  r.get('/music/spotify/connect', ownerOnly, (req, res) => {
    if (!SP.configured(req.t)) return res.redirect('/panel?sp=nocfg#music/accounts');
    res.redirect(SP.authUrl(req.t.id));
  });
  r.get('/music/spotify/playlists', async (req, res) => { try { res.json({ items: await SP.playlists(req.t, req.query.force === '1') }); } catch (e) { spErr(res, e); } });
  r.get('/music/spotify/tracks', async (req, res) => { try { res.json({ items: await SP.tracks(req.t, String(req.query.type || 'playlist'), String(req.query.id || '')) }); } catch (e) { spErr(res, e); } });
  r.get('/music/spotify/search', async (req, res) => {
    const h = searchHits.get('sp' + req.t.id) || { n: 0, at: Date.now() };
    if (Date.now() - h.at > 60000) { h.n = 0; h.at = Date.now(); }
    if (++h.n > 20) return res.status(429).json({ error: 'Çok sık arama yapıyorsunuz; biraz bekleyin' });
    searchHits.set('sp' + req.t.id, h);
    try { res.json(await SP.search(req.t, req.query.q)); } catch (e) { spErr(res, e); }
  });
  r.get('/music/spotify/devices', async (req, res) => { try { res.json({ items: await SP.devices(req.t, true) }); } catch (e) { spErr(res, e); } });
  // çalınacak cihaz: 'screenpano' = ScreenPano'nun kendi oynatıcısı; diğerleri Spotify Connect cihaz kimliği
  r.put('/music/spotify/device', (req, res) => {
    const b = req.body || {}, a = SP.sp(req.t), id = s(b.id, 80);
    if (id && id !== 'screenpano' && !/^[A-Za-z0-9_-]{6,80}$/.test(id)) return res.status(400).json({ error: 'Geçersiz cihaz' });
    a.target = id; a.targetName = id === 'screenpano' ? '' : s(b.name, 60);
    changed(req.t);
    res.json({ ok: true, music: ensureMusic(req.t.db), status: SP.status(req.t) });
  });
  r.delete('/music/spotify', ownerOnly, async (req, res) => { await SP.disconnect(req.t); changed(req.t); res.json({ ok: true, music: ensureMusic(req.t.db) }); });
  r.delete('/music/google', ownerOnly, async (req, res) => { await yt.disconnect(req.t); res.json({ ok: true }); });

  // ================= KVKK: verilerim, hesap silme =================
  r.get('/privacy/export', ownerOnly, (req, res) => {
    const t = req.t, { trafficSecret, ytAuth, oauthApps, ...db } = t.db;
    if (db.music && db.music.spotify) db.music = { ...db.music, spotify: { ...db.music.spotify, refreshToken: undefined, accessToken: undefined } };
    if (db.instagram) db.instagram = { ...db.instagram, token: db.instagram.token ? '(gizli)' : '' };
    const out = {
      exportedAt: new Date().toISOString(), product: config.BRAND,
      business: { id: t.id, name: t.name, phone: t.phone, plan: t.plan, status: t.status, created: new Date(t.created).toISOString(), trialUntil: t.trial_until, paidUntil: t.paid_until },
      users: store.q.usersOf.all(t.id), devices: store.q.devicesOf.all(t.id).map(({ status, ...d }) => d),
      content: db, files: storage.status().enabled ? store.q.objOf.all(t.id).map(o => o.file) : fs.readdirSync(t.dirs.uploads),
    };
    res.setHeader('Content-Disposition', `attachment; filename="${config.BRAND}-verilerim-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(out);
  });
  r.post('/privacy/delete', ownerOnly, (req, res) => {
    const u = store.q.userGet.get(req.user.id);
    if (req.user.role !== 'super' && !auth.checkPassword((req.body || {}).password, u.pass)) return res.status(400).json({ error: 'Şifre yanlış' });
    const t = req.t; t.db.deletion = { requestedAt: Date.now(), executeAt: Date.now() + 30 * DAY, by: req.user.username };
    backupNow(t, 'silme-talebi'); changed(t);
    monitor.pushAlert(t, { kind: 'deletion', text: 'Hesap silme talebi alındı. 30 gün sonra tüm veriler kalıcı olarak silinecek.' });
    res.json({ ok: true, executeAt: t.db.deletion.executeAt });
  });
  r.delete('/privacy/delete', ownerOnly, (req, res) => { delete req.t.db.deletion; changed(req.t); res.json({ ok: true }); });

  // 30 günü dolan silme talepleri: işletme, kullanıcılar, cihazlar, medya ve yedekler kalıcı olarak silinir
  setInterval(() => {
    for (const t of tenants.all()) if (t.db.deletion && t.db.deletion.executeAt < Date.now()) {
      console.log('KVKK silme talebi uygulandı:', t.id, t.name);
      require('./accounts').deleteTenant(t.id); // ana işletmeyse zincirin tüm şubeleri de gider
    }
  }, 3600000);
};
