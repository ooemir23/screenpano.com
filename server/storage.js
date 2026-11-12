// Medya depolama: dosyalar önce işletmenin yerel klasörüne yazılır; R2 ayarlıysa arka planda R2'ye gönderilir
// ve (R2_KEEP_LOCAL=true değilse) yerel kopya silinir. TV dosyayı her zaman /u/<işletme>/<dosya> adresinden ister:
// yerelde varsa oradan, yoksa R2'nin herkese açık adresine yönlendirilir ya da sunucu üzerinden aktarılır.
const fs = require('fs');
const path = require('path');
const store = require('./store');
const s3 = require('./s3');

const KEEP_LOCAL = process.env.R2_KEEP_LOCAL === 'true';
const keyFor = (tid, file) => `tenants/${tid}/${file}`;
const safe = f => typeof f === 'string' && /^[\w.-]+$/.test(f);
const TYPES = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' };
const typeOf = f => TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream';
const localPath = (t, f) => path.join(t.dirs.uploads, f);

function exists(t, file) { return safe(file) && (fs.existsSync(localPath(t, file)) || !!store.q.objGet.get(t.id, file)); }

// Diskte + yalnızca R2'de duran dosyaların toplamı (kota için)
// skip: sayılmayacak dosya adları (ör. henüz küçültülmemiş ham yüklemeler)
function usedBytes(t, skip) {
  let n = 0; const local = new Set();
  for (const f of fs.existsSync(t.dirs.uploads) ? fs.readdirSync(t.dirs.uploads) : []) { try { const sz = fs.statSync(localPath(t, f)).size; local.add(f); if (!skip || !skip.has(f)) n += sz; } catch {} }
  for (const o of store.q.objOf.all(t.id)) if (!local.has(o.file) && (!skip || !skip.has(o.file))) n += o.size;
  return n;
}
// tek dosyanın boyutu (yerel ya da nesne deposu); yoksa 0
function sizeOf(t, file) {
  try { return fs.statSync(localPath(t, file)).size; } catch {}
  const o = store.q.objGet && store.q.objGet.get(t.id, file); return o ? o.size : 0;
}

function remove(t, file) {
  if (!file) return;
  const f = path.basename(String(file).split('?')[0]);
  if (!safe(f)) return;
  fs.rmSync(localPath(t, f), { force: true });
  fs.rmSync(localPath(t, f + '.part'), { force: true });
  if (store.q.objGet.get(t.id, f)) {
    store.q.objDel.run(t.id, f);
    s3.del(keyFor(t.id, f)).catch(e => console.error('R2 silme hatası', f, e.message));
  }
}
async function removeTenant(tid) {
  if (!s3.enabled) return;
  for (const o of store.q.objOf.all(tid)) { try { await s3.del(keyFor(tid, o.file)); } catch (e) {} store.q.objDel.run(tid, o.file); }
}

// Dosya yalnız R2'deyse yerele indir (video küçültme, şubeye kopyalama için)
async function ensureLocal(t, file) {
  const p = localPath(t, file);
  if (fs.existsSync(p)) return p;
  if (!store.q.objGet.get(t.id, file)) throw new Error('dosya bulunamadı');
  const res = await s3.getStream(keyFor(t.id, file));
  const tmp = p + '.part';
  await new Promise((ok, bad) => { const w = fs.createWriteStream(tmp); res.pipe(w); w.on('finish', ok); w.on('error', bad); res.on('error', bad); });
  fs.renameSync(tmp, p);
  return p;
}
async function copy(fromT, file, toT, newName) {
  const src = await ensureLocal(fromT, file);
  fs.copyFileSync(src, localPath(toT, newName));
  return newName;
}

// /u/:tid/:file
async function serve(req, res, t, file) {
  const p = localPath(t, file);
  if (fs.existsSync(p)) { res.set('Cache-Control', 'public, max-age=31536000, immutable'); return res.sendFile(p); }
  const o = store.q.objGet.get(t.id, file);
  if (!o || !s3.enabled) return res.status(404).end();
  const pub = s3.publicUrl(keyFor(t.id, file));
  if (pub) { res.set('Cache-Control', 'public, max-age=86400'); return res.redirect(302, pub); }
  try {
    const up = await s3.getStream(keyFor(t.id, file), req.headers.range);
    res.status(up.statusCode);
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) if (up.headers[h]) res.set(h, up.headers[h]);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    up.on('error', () => res.destroy()); // aktarım sırasında depo koparsa yalnız bu istek kapanır
    up.pipe(res);
    req.on('close', () => up.destroy());
  } catch (e) { res.status(e.status === 416 ? 416 : 502).end(); }
}

// ---- arka plan eşitleme: yerel dosyaları R2'ye gönder ----
let busy = false, lastRun = 0, lastError = '', pendingCount = 0;
function inUse(t) { // küçültülmekte olan dosyalara dokunma
  return new Set(t.db.videos.filter(v => v.status === 'processing').map(v => v.file));
}
async function syncTick() {
  if (!s3.enabled || busy) return;
  busy = true; lastRun = Date.now();
  try {
    const tenants = require('./tenants').all();
    let pending = 0;
    for (const t of tenants) {
      if (!fs.existsSync(t.dirs.uploads)) continue;
      const skip = inUse(t);
      for (const f of fs.readdirSync(t.dirs.uploads)) {
        if (!safe(f) || f.endsWith('.part') || skip.has(f)) continue;
        const p = localPath(t, f); let st; try { st = fs.statSync(p); } catch { continue; }
        if (!st.isFile() || Date.now() - st.mtimeMs < 60000) { pending++; continue; } // yeni yazılan dosya: ffmpeg/yükleme bitsin
        const o = store.q.objGet.get(t.id, f);
        if (!o || o.size !== st.size) {
          try { await s3.putFile(keyFor(t.id, f), p, typeOf(f)); store.q.objPut.run(t.id, f, st.size, Date.now()); lastError = ''; }
          catch (e) { lastError = e.message; pending++; console.error('R2 yükleme hatası', f, e.message); continue; }
        }
        if (!KEEP_LOCAL) fs.rmSync(p, { force: true });
      }
    }
    pendingCount = pending;
  } finally { busy = false; }
}
function start() { if (s3.enabled) { setTimeout(syncTick, 15000); setInterval(syncTick, 60000); } }
function status() {
  const tot = store.q.objTotals.get();
  return { enabled: s3.enabled, configError: s3.configError, bucket: s3.cfg.bucket, publicUrl: s3.cfg.publicUrl, keepLocal: KEEP_LOCAL, objects: tot.n, bytes: tot.bytes, pending: pendingCount, lastRun, lastError };
}

module.exports = { exists, usedBytes, sizeOf, remove, removeTenant, ensureLocal, copy, serve, syncTick, start, status, localPath, keyFor, typeOf };
