// İşletme aktarımı: canlıdaki bir işletmeyi (içerik, tema, menü, medya, ekranlar, kullanıcılar) test sunucusuna kopyalar.
// Canlıda süper yönetici tek kullanımlık, kısa ömürlü bir kod üretir; test sunucusu kodla işletmeyi canlıdan çeker.
// Dış hizmet anahtarları (Spotify/YouTube/Instagram/Google, bildirim e-postaları) ve cihaz jetonları KOPYALANMAZ.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { pipeline } = require('stream/promises');
const express = require('express');
const config = require('./config');
const store = require('./store');
const tenants = require('./tenants');
const storage = require('./storage');

const LIVE_URL = (process.env.TRANSFER_SOURCE || 'https://screenpano.com').replace(/\/+$/, '');
const TTL = 15 * 60 * 1000;
const offers = new Map(); // kod -> { tid, exp }
const safeName = f => typeof f === 'string' && /^[\w.-]+$/.test(f);

// Dokümandan dış hizmet bağlantılarını ayıkla (test sunucusu canlı hesaplara dokunmasın)
function sanitize(doc) {
  const d = JSON.parse(JSON.stringify(doc || {}));
  for (const k of ['oauthApps', 'ytAuth', 'instagram', 'google', 'notify', 'alerts', 'deletion', 'consent']) delete d[k];
  if (d.music && typeof d.music === 'object') {
    delete d.music.spotify; delete d.music.youtube; delete d.music.yt; delete d.music.ytAuth;
  }
  return d;
}

function offer(tid) {
  if (!tenants.get(tid)) throw new Error('İşletme bulunamadı');
  for (const [k, v] of offers) if (v.exp < Date.now()) offers.delete(k);
  const code = crypto.randomBytes(18).toString('base64url');
  offers.set(code, { tid, exp: Date.now() + TTL });
  return { code, minutes: TTL / 60000 };
}

// ---- canlı taraf: paketi akıt ----
const pub = express.Router();
pub.get('/:code', async (req, res) => {
  const o = offers.get(req.params.code);
  if (!o || o.exp < Date.now()) return res.status(404).json({ error: 'Kod geçersiz ya da süresi doldu' });
  offers.delete(req.params.code); // tek kullanımlık
  const t = tenants.get(o.tid);
  if (!t) return res.status(404).json({ error: 'İşletme yok' });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xfer-'));
  try {
    // yalnız R2'de duran dosyaları yerele indir
    for (const ob of store.q.objOf.all(t.id)) { try { await storage.ensureLocal(t, ob.file); } catch (e) { console.error('aktarım: dosya alınamadı', ob.file, e.message); } }
    const row = store.q.tenantGet.get(t.id);
    const users = store.sql.prepare('SELECT * FROM users WHERE tenant_id = ?').all(t.id).filter(u => u.role !== 'super');
    const bundle = {
      v: 1, from: config.BASE_URL, at: Date.now(),
      tenant: { id: row.id, name: row.name, plan: row.plan, status: row.status, trial_until: row.trial_until, paid_until: row.paid_until, phone: row.phone, created: row.created },
      doc: sanitize(t.db), users, screens: store.q.screensOf.all(t.id),
    };
    fs.writeFileSync(path.join(tmp, 'bundle.json'), JSON.stringify(bundle));
    fs.symlinkSync(t.dirs.uploads, path.join(tmp, 'uploads'));
    res.set('Content-Type', 'application/gzip');
    const tar = spawn('tar', ['-chzf', '-', '-C', tmp, '.']);
    tar.stderr.on('data', d => console.error('tar:', String(d).trim()));
    const done = () => fs.rmSync(tmp, { recursive: true, force: true });
    tar.on('close', done); res.on('close', () => { tar.kill(); done(); });
    tar.stdout.pipe(res);
  } catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); if (!res.headersSent) res.status(500).json({ error: e.message }); }
});

// ---- test taraf: paketi çek ve içeri al ----
async function pull(code) {
  if (config.APP_ENV !== 'test') throw new Error('İçeri aktarma yalnız test sunucusunda yapılır');
  code = String(code || '').trim();
  if (!/^[\w-]{10,64}$/.test(code)) throw new Error('Kod geçersiz');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xfer-in-'));
  try {
    const r = await fetch(`${LIVE_URL}/api/transfer/${code}`);
    if (!r.ok) { let m = ''; try { m = (await r.json()).error; } catch {} throw new Error(m || `Canlıdan alınamadı (${r.status})`); }
    const file = path.join(tmp, 'pkg.tgz');
    await pipeline(r.body, fs.createWriteStream(file));
    const dir = path.join(tmp, 'x'); fs.mkdirSync(dir);
    await new Promise((ok, bad) => { const p = spawn('tar', ['-xzf', file, '-C', dir]); let e = ''; p.stderr.on('data', d => e += d); p.on('close', c => c ? bad(new Error('Paket açılamadı ' + e)) : ok()); });
    const b = JSON.parse(fs.readFileSync(path.join(dir, 'bundle.json'), 'utf8'));
    if (!b || b.v !== 1 || !b.tenant || !safeName(b.tenant.id)) throw new Error('Paket geçersiz');
    const id = b.tenant.id;
    if (tenants.get(id)) tenants.remove(id); // aynı işletme varsa yeniden yaz
    const T = b.tenant;
    store.sql.transaction(() => {
      store.q.tenantIns.run({ id, name: T.name, plan: T.plan, status: T.status, trial_until: T.trial_until, paid_until: T.paid_until, phone: T.phone || '', created: T.created, data: JSON.stringify(b.doc) });
      for (const s of b.screens || []) store.q.screenIns.run({ id: s.id, tenant_id: id, name: s.name, layout: s.layout, sort: s.sort || 0, created: s.created });
      for (const u of b.users || []) {
        const ex = store.q.userByName.get(u.username);
        if (ex) store.sql.prepare('DELETE FROM users WHERE id = ?').run(ex.id);
        store.q.userIns.run({ id: u.id, tenant_id: id, username: u.username, pass: u.pass, role: u.role, name: u.name || '', created: u.created });
      }
    })();
    const t = tenants.get(id);
    let n = 0;
    const up = path.join(dir, 'uploads');
    for (const f of fs.existsSync(up) ? fs.readdirSync(up) : []) {
      if (!safeName(f)) continue;
      fs.copyFileSync(path.join(up, f), path.join(t.dirs.uploads, f)); n++;
    }
    return { id, name: T.name, files: n, users: (b.users || []).length };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

module.exports = { pub, offer, pull, sanitize };
