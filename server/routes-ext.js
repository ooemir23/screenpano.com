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

module.exports = function (r, { changed, upload, quota, ownerOnly, rmUpload, backupNow }) {
  const err = (res, e, code = 400) => res.status(code).json({ error: e.message || String(e) });

  // ================= ZAMANLAMA =================
  // medya/afiş: zamanlama, gizleme, süre, ad
  r.put('/videos/:id', (req, res) => {
    const v = req.t.db.videos.find(x => x.id === req.params.id); if (!v) return res.status(404).json({ error: 'bulunamadı' });
    const b = req.body || {};
    if ('sch' in b) { const c = SCH.clean(b.sch); if (c) v.sch = c; else delete v.sch; }
    if (typeof b.hidden === 'boolean') v.hidden = b.hidden || undefined;
    if (b.dur !== undefined) v.dur = b.dur ? Math.max(3, Math.min(120, Math.round(Number(b.dur)) || 10)) : undefined;
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
    if (typeof b.image === 'string' || b.image === null) { if (p.image && p.image !== b.image) rmUpload(t, p.image); p.image = b.image && /^[\w.-]+$/.test(b.image) ? b.image : undefined; }
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
  r.post('/posters/image', quota, upload.single('file'), (req, res) => {
    const f = req.file; if (!f) return res.status(400).json({ error: 'dosya yok' });
    if (!/^image\//.test(f.mimetype)) { rmUpload(req.t, f.filename); return res.status(400).json({ error: 'Yalnız fotoğraf yüklenebilir' }); }
    res.json({ ok: true, file: f.filename, url: req.t.upBase + f.filename });
  });

  // ================= DURUM İZLEME VE UYARILAR =================
  r.get('/devices/status', (req, res) => {
    const online = hub.onlineDeviceIds();
    res.json({
      devices: store.q.devicesOf.all(req.t.id).map(d => monitor.deviceView(d, online.has(d.id))),
      alerts: (req.t.db.alerts || []).slice(0, 30), notify: req.t.db.notify || {}, mail: monitor.mailEnabled(), offlineMin: monitor.OFFLINE_MIN,
    });
  });
  r.delete('/alerts', (req, res) => { req.t.db.alerts = []; changed(req.t); res.json({ ok: true }); });
  r.put('/notify', ownerOnly, (req, res) => {
    const b = req.body || {}, email = s(b.email, 120);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin' });
    req.t.db.notify = { email, offline: b.offline !== false, online: b.online !== false };
    changed(req.t); res.json({ ok: true });
  });
  r.post('/notify/test', ownerOnly, async (req, res) => {
    const n = req.t.db.notify || {};
    if (!monitor.mailEnabled()) return res.status(400).json({ error: 'E-posta gönderimi sunucuda ayarlı değil (SMTP)' });
    if (!n.email) return res.status(400).json({ error: 'Önce e-posta adresinizi kaydedin' });
    const ok = await monitor.sendMail(n.email, `${config.BRAND}: deneme bildirimi`, `${req.t.name} için uyarılar bu adrese gelecek.`);
    ok ? res.json({ ok: true }) : res.status(502).json({ error: 'E-posta gönderilemedi' });
  });
  r.post('/devices/:id/snapshot', (req, res) => {
    const d = store.q.devicesOf.all(req.t.id).find(x => x.id === req.params.id); if (!d) return res.status(404).json({ error: 'bulunamadı' });
    const n = hub.sendDevice(d.id, { type: 'snap' });
    n ? res.json({ ok: true }) : res.status(409).json({ error: 'Cihaz şu an çevrimdışı' });
  });
  r.get('/devices/:id/snapshot', (req, res) => {
    const d = store.q.devicesOf.all(req.t.id).find(x => x.id === req.params.id); const sn = d && monitor.snaps.get(d.id);
    if (!sn) return res.status(404).json({ error: 'henüz yok' });
    res.json({ at: sn.at, data: sn.data });
  });

  // ================= İSTATİSTİK =================
  r.get('/stats', (req, res) => res.json(stats.summary(req.t, [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30)));

  // ================= ŞUBELER =================
  const homeOf = u => tenants.get(u.role === 'super' ? u.imp : u.tenant_id);
  function orgList(t) { return t.org_id ? store.q.orgTenants.all(t.org_id) : [{ id: t.id, name: t.name }]; }
  r.get('/branches', (req, res) => {
    const home = homeOf(req.user), online = hub.onlineDeviceIds();
    const list = orgList(req.t).map(b => { const bt = tenants.get(b.id), devs = store.q.devicesOf.all(b.id); return { id: b.id, name: bt.name, devices: devs.length, online: devs.filter(d => online.has(d.id)).length, access: access(bt), media: bt.db.videos.length, home: home && b.id === home.id }; });
    res.json({ current: req.t.id, list, limit: plan(home || req.t).branches || 1, canManage: req.user.role !== 'staff' });
  });
  r.post('/branches', ownerOnly, (req, res) => {
    const home = homeOf(req.user); if (!home) return res.status(400).json({ error: 'işletme bulunamadı' });
    const name = s((req.body || {}).name, 80); if (name.length < 2) return res.status(400).json({ error: 'Şube adı gerekli' });
    const lim = plan(home).branches || 1, cur = orgList(home).length;
    if (cur >= lim) return res.status(400).json({ error: lim <= 1 ? 'Şube açmak Pro pakette. Paketinizi yükseltin.' : `Paketinizde en çok ${lim} şube olabilir` });
    const org = home.org_id || home.id;
    if (!home.org_id) { store.updateTenant(home.id, { org_id: org }); tenants.refreshRow(home.id); }
    const id = auth.uid(), now = Date.now(), W = require('./widgets');
    const doc = { ...tenants.defaultDoc(), location: home.db.location, theme: home.db.theme };
    store.sql.transaction(() => {
      store.q.tenantIns.run({ id, name, plan: home.plan, status: home.status === 'suspended' ? 'trial' : home.status, trial_until: home.trial_until, paid_until: home.paid_until, phone: home.phone || '', created: now, data: JSON.stringify(doc) });
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
    if (req.user.role === 'super') auth.setSession(req, res, req.user, { imp: id });
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
        if (parts.includes('promo')) { t.db.campaigns = JSON.parse(JSON.stringify(src.db.campaigns || [])); t.db.qrs = JSON.parse(JSON.stringify(src.db.qrs || [])); }
        if (parts.includes('media')) {
          if (mode === 'replace') { for (const v of t.db.videos) { if (v.file) rmUpload(t, v.file); if (v.image) rmUpload(t, v.image); } t.db.videos = []; }
          for (const v of src.db.videos) {
            if (v.status === 'processing') continue;
            const c = JSON.parse(JSON.stringify(v)); c.id = auth.uid();
            for (const k of ['file', 'image']) if (c[k]) {
              if (storage.usedBytes(t) > lim) throw new Error(`${t.name}: depolama kotası doldu`);
              const f = auth.uid(16) + path.extname(c[k]); await storage.copy(src, c[k], t, f); c[k] = f; copiedFiles++;
            }
            t.db.videos.push(c);
          }
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

  // ================= KVKK: verilerim, hesap silme =================
  r.get('/privacy/export', ownerOnly, (req, res) => {
    const t = req.t, { trafficSecret, ...db } = t.db;
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
      for (const d of store.q.devicesOf.all(t.id)) hub.kickDevice(d.id);
      console.log('KVKK silme talebi uygulandı:', t.id, t.name);
      // ana işletme silinirse zincirin tüm şubeleri de gider (şubelerin ayrı kullanıcısı yoktur)
      const isHome = store.q.usersOf.all(t.id).some(u => u.role === 'owner');
      const ids = isHome && t.org_id ? store.q.orgTenants.all(t.org_id).map(x => x.id) : [t.id];
      for (const id of ids) { for (const d of store.q.devicesOf.all(id)) hub.kickDevice(d.id); tenants.remove(id); }
    }
  }, 3600000);
};
