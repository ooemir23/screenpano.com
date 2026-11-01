// Medya optimizasyonu (ffmpeg): videolar en fazla 1080p/30fps/6 Mbps H.264, sessiz, hızlı başlatmalı; fotoğraflar en fazla 1920 piksel.
// Tüm işletmeler için tek kuyruk; sunucuyu boğmamak için aynı anda bir dosya işlenir.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const config = require('./config');
const tenants = require('./tenants');
const hub = require('./hub');
const { uid } = require('./auth');
const { runFfmpeg } = require('./feeds');

let ffmpegOk = false;
try { const p = spawn(config.FFMPEG, ['-version'], { stdio: 'ignore' }); p.on('error', () => {}); p.on('close', c => { ffmpegOk = c === 0; }); } catch (e) { /* yok */ }

const queue = []; let busy = false;
const SCALE = "scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2";

async function optimizeItem(tid, id) {
  const t = tenants.get(tid); if (!t) return;
  const v = t.db.videos.find(x => x.id === id); if (!v) return;
  const src = path.join(t.dirs.uploads, v.file);
  const done = patch => { const c = t.db.videos.find(x => x.id === id); if (c) { Object.assign(c, { status: 'ready', reopt: false, optimized: true }, patch); tenants.save(t); hub.pushTenant(tid); } };
  if (!fs.existsSync(src)) return done({ optError: 'dosya bulunamadı' });
  if (!ffmpegOk) return done({ optimized: false, optError: 'ffmpeg yok' });
  const isImg = v.type === 'image';
  if (isImg && /\.(gif|svg)$/i.test(v.file)) return done({});
  const outName = uid(16) + (isImg ? '.jpg' : '.mp4'), out = path.join(t.dirs.uploads, outName);
  const args = isImg
    ? ['-y', '-i', src, '-vf', SCALE, '-frames:v', '1', '-q:v', '3', out]
    : ['-y', '-i', src, '-vf', SCALE + ',fps=30,format=yuv420p', '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.1', '-preset', 'veryfast', '-crf', '23', '-maxrate', '6M', '-bufsize', '12M', '-an', '-movflags', '+faststart', '-threads', '2', out];
  const before = fs.statSync(src).size;
  try {
    await runFfmpeg(args);
    const after = fs.statSync(out).size;
    if (!t.db.videos.find(x => x.id === id)) { fs.rmSync(out, { force: true }); return; }
    if (after >= before && v.reopt) { fs.rmSync(out, { force: true }); return done({ sizeBefore: before, sizeAfter: before }); }
    fs.rmSync(src, { force: true });
    done({ file: outName, sizeBefore: before, sizeAfter: after, optError: '' });
  } catch (e) {
    fs.rmSync(out, { force: true });
    console.error('Optimizasyon başarısız:', v.name, e.message);
    done({ optError: String(e.message).slice(0, 200), optimized: false });
  }
}
function enqueue(tid, id) { if (!queue.some(q => q.tid === tid && q.id === id)) queue.push({ tid, id }); run(); }
async function run() {
  if (busy) return; busy = true;
  while (queue.length) { const { tid, id } = queue.shift(); try { await optimizeItem(tid, id); } catch (e) { console.error('Kuyruk hatası:', e.message); } }
  busy = false;
}
function resumeAll() { for (const t of tenants.all()) for (const v of t.db.videos) if (v.status === 'processing') enqueue(t.id, v.id); }

// İşletmenin diskte kapladığı yer (kota kontrolü için)
function usedBytes(t) {
  let n = 0;
  for (const f of fs.existsSync(t.dirs.uploads) ? fs.readdirSync(t.dirs.uploads) : []) { try { n += fs.statSync(path.join(t.dirs.uploads, f)).size; } catch {} }
  return n;
}

module.exports = { enqueue, resumeAll, usedBytes, get ffmpegOk() { return ffmpegOk; }, get queueLength() { return queue.length + (busy ? 1 : 0); } };
