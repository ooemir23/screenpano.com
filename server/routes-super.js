// Süper yönetim (/api/super/*): işletmeler, paketler, abonelik süreleri ve platform anahtarları.
const fs = require('fs');
const express = require('express');
const store = require('./store');
const auth = require('./auth');
const tenants = require('./tenants');
const hub = require('./hub');
const media = require('./media');
const { PLANS, plan, access } = require('./plans');
const { createTenant, DAY } = require('./accounts');

const r = express.Router();
r.use((req, res, next) => {
  const u = auth.sessionUser(req);
  if (!u || u.role !== 'super') return res.status(401).json({ error: 'Süper yönetici girişi gerekli' });
  req.user = u; next();
});

const SETTINGS = ['collect_key', 'collect_paid', 'tmdb_key', 'books_key', 'traffic_api'];

r.get('/overview', (req, res) => {
  const online = hub.onlineDeviceIds();
  const list = tenants.all().map(t => {
    const devs = store.q.devicesOf.all(t.id), owner = store.q.usersOf.all(t.id).find(u => u.role === 'owner');
    return { id: t.id, name: t.name, plan: t.plan, status: t.status, trialUntil: t.trial_until, paidUntil: t.paid_until, phone: t.phone, note: t.note, created: t.created, access: access(t), owner: owner ? owner.username : '', lastLogin: owner ? owner.last_login : null, devices: devs.length, online: devs.filter(d => online.has(d.id)).length, storageMB: Math.round(media.usedBytes(t) / 1048576) };
  });
  const settings = Object.fromEntries(SETTINGS.map(k => [k, store.setting(k)]));
  settings.traffic_secret = require('./feeds').trafficSecret();
  res.json({ tenants: list, plans: PLANS, settings, totals: { tenants: list.length, live: list.filter(x => x.access.ok).length, devices: list.reduce((a, x) => a + x.devices, 0), online: online.size } });
});
r.post('/tenants', (req, res) => {
  try {
    const b = req.body || {};
    const days = Math.max(0, Math.min(3650, Number(b.days) || 0));
    const t = createTenant({ name: b.name, username: b.username, password: b.password, phone: b.phone, plan: PLANS[b.plan] ? b.plan : 'pro', paidUntil: days ? Date.now() + days * DAY : null, trialDays: Number(b.trialDays) || 14 });
    res.json({ ok: true, id: t.id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
r.put('/tenants/:id', (req, res) => {
  const t = tenants.get(req.params.id); if (!t) return res.status(404).json({ error: 'bulunamadı' });
  const b = req.body || {}, f = {};
  if (typeof b.name === 'string' && b.name.trim()) f.name = b.name.trim().slice(0, 80);
  if (PLANS[b.plan]) f.plan = b.plan;
  if (['trial', 'active', 'suspended'].includes(b.status)) f.status = b.status;
  if (typeof b.note === 'string') f.note = b.note.slice(0, 500);
  if (typeof b.phone === 'string') f.phone = b.phone.slice(0, 30);
  if (b.paidUntil !== undefined) f.paid_until = b.paidUntil ? Number(b.paidUntil) : null;
  if (b.trialUntil !== undefined) f.trial_until = b.trialUntil ? Number(b.trialUntil) : null;
  if (b.extendDays) { const base = Math.max(Date.now(), t.paid_until || 0); f.paid_until = base + Math.min(3650, Number(b.extendDays)) * DAY; if (t.status !== 'suspended') f.status = 'active'; }
  store.updateTenant(t.id, f); tenants.refreshRow(t.id); hub.pushTenant(t.id);
  res.json({ ok: true });
});
r.post('/tenants/:id/password', (req, res) => {
  const owner = store.q.usersOf.all(req.params.id).find(u => u.role === 'owner');
  if (!owner) return res.status(404).json({ error: 'işletme sahibi bulunamadı' });
  const pw = String((req.body || {}).password || '') || auth.uid(10);
  if (pw.length < 8) return res.status(400).json({ error: 'Şifre en az 8 karakter olmalı' });
  store.q.userPass.run(auth.hashPassword(pw), owner.id);
  res.json({ ok: true, password: pw, username: owner.username });
});
// işletme olarak gir: panel o işletmenin gözünden açılır
r.post('/tenants/:id/impersonate', (req, res) => {
  const t = tenants.get(req.params.id); if (!t) return res.status(404).json({ error: 'bulunamadı' });
  auth.setSession(req, res, req.user, { imp: t.id });
  res.json({ ok: true, next: '/panel' });
});
r.post('/unimpersonate', (req, res) => { auth.setSession(req, res, req.user); res.json({ ok: true, next: '/super' }); });
r.delete('/tenants/:id', (req, res) => {
  const t = tenants.get(req.params.id); if (!t) return res.status(404).json({ error: 'bulunamadı' });
  if (String((req.body || {}).confirm || '') !== t.name) return res.status(400).json({ error: 'Silmek için işletme adını aynen yazın' });
  for (const d of store.q.devicesOf.all(t.id)) hub.kickDevice(d.id);
  tenants.remove(t.id); res.json({ ok: true });
});
r.put('/settings', (req, res) => {
  const b = req.body || {};
  for (const k of SETTINGS) if (typeof b[k] === 'string') store.setSetting(k, b[k].trim().slice(0, 300));
  hub.pushAll(); res.json({ ok: true });
});
r.put('/password', (req, res) => {
  const { current, next: nw } = req.body || {};
  const u = store.q.userGet.get(req.user.id);
  if (!auth.checkPassword(current, u.pass)) return res.status(400).json({ error: 'Mevcut şifre yanlış' });
  if (String(nw || '').length < 10) return res.status(400).json({ error: 'Yeni şifre en az 10 karakter olmalı' });
  store.q.userPass.run(auth.hashPassword(nw), u.id); res.json({ ok: true });
});

module.exports = r;
