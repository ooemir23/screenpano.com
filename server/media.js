// Medya optimizasyonu (ffmpeg): videolar işletmenin seçtiği çözünürlüğe kadar (varsayılan 1080p) 60fps/8 Mbps H.264, sessiz, hızlı başlatmalı; fotoğraflar en fazla 1920 piksel.
// Kare hızı yukarı dönüştürülmez: kaynağın fps'i korunur, yalnız 60'ı aşarsa 60'a iner (30 fps kaynak 30 kalır, 60 fps kaynak 60 kalır).
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
// video çözünürlük tavanı (işletme ayarı, panelde seçilir): 720p/480p zayıf TV kutularında daha akıcı oynar
const VIDEO_MAX = { 1080: [1920, 1080], 720: [1280, 720], 480: [854, 480] };

async function optimizeItem(tid, id) {
  const t = tenants.get(tid); if (!t) return;
  const v = t.db.videos.find(x => x.id === id); if (!v) return;
  let src = path.join(t.dirs.uploads, v.file);
  if (!fs.existsSync(src)) { try { src = await require('./storage').ensureLocal(t, v.file); } catch (e) {} }
  const done = patch => { const c = t.db.videos.find(x => x.id === id); if (c) { Object.assign(c, { status: 'ready', reopt: false, optimized: true }, patch); tenants.save(t); hub.pushTenant(tid); } };
  if (!fs.existsSync(src)) return done({ optError: 'dosya bulunamadı' });
  if (!ffmpegOk) return done({ optimized: false, optError: 'ffmpeg yok' });
  const isImg = v.type === 'image';
  if (isImg && /\.(gif|svg)$/i.test(v.file)) return done({});
  // PNG/WebP girdilerde alfa kanalı korunur (şeffaf logo/grafik siyah zeminli JPG'ye dönmesin)
  const keepAlpha = isImg && /\.(png|webp)$/i.test(v.file);
  const outName = uid(16) + (isImg ? (keepAlpha ? '.png' : '.jpg') : '.mp4'), out = path.join(t.dirs.uploads, outName);
  const [mw, mh] = VIDEO_MAX[Number(t.db.videoMaxH)] || VIDEO_MAX[1080];
  const vScale = `scale='min(${mw},iw)':'min(${mh},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`;
  const args = isImg
    ? (keepAlpha
        ? ['-y', '-i', src, '-vf', SCALE + ',format=rgba', '-frames:v', '1', '-compression_level', '9', out]
        : ['-y', '-i', src, '-vf', SCALE, '-frames:v', '1', '-q:v', '3', out])
    : ['-y', '-i', src, '-vf', vScale + ",fps=fps='min(source_fps,60)',format=yuv420p", '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.2', '-preset', 'veryfast', '-crf', '23', '-maxrate', '8M', '-bufsize', '16M', '-an', '-movflags', '+faststart', '-threads', '2', out];
  const before = fs.statSync(src).size;
  try {
    await runFfmpeg(args);
    const after = fs.statSync(out).size;
    if (!t.db.videos.find(x => x.id === id)) { fs.rmSync(out, { force: true }); return; }
    if (after >= before && v.reopt) { fs.rmSync(out, { force: true }); return done({ sizeBefore: before, sizeAfter: before }); }
    require('./storage').remove(t, v.file);
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
const usedBytes = t => require('./storage').usedBytes(t);

module.exports = { enqueue, resumeAll, usedBytes, get ffmpegOk() { return ffmpegOk; }, get queueLength() { return queue.length + (busy ? 1 : 0); } };
