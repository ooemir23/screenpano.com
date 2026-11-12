// Medya optimizasyonu (ffmpeg): videolar işletmenin seçtiği çözünürlüğe kadar (varsayılan 1080p) H.264, en çok 6 Mbps, sessiz, hızlı başlatmalı; fotoğraflar en fazla 1920 piksel.
// Kare hızı yukarı dönüştürülmez: 1080p'de en çok 30 fps, 720p ve altında en çok 60 fps (kaynak daha düşükse olduğu gibi kalır).
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

const queue = []; let busy = false, curJob = null;
const SCALE = "scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2";
// video süresi (sn): ekranlar arası senkron için çalma listesinde kullanılır
const probeDur = file => new Promise(res => {
  try {
    const p = spawn(config.FFMPEG, ['-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => { err += d; });
    p.on('error', () => res(null));
    p.on('close', () => { const m = /Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/.exec(err); res(m ? Math.round(+m[1] * 3600 + +m[2] * 60 + +m[3] + (+m[4] >= 50 ? 1 : 0)) : null); });
  } catch (e) { res(null); }
});
// süre bilgisi eksik eski videolar: açılışta ölçülür (yeniden kodlama yapılmaz)
async function backfillDurations() {
  for (const t of tenants.all()) {
    let dirty = false;
    for (const v of t.db.videos) {
      if (v.type === 'image' || v.type === 'poster' || v.type === 'youtube' || v.dur || v.status === 'processing') continue;
      let src = path.join(t.dirs.uploads, v.file);
      if (!fs.existsSync(src)) { try { src = await require('./storage').ensureLocal(t, v.file); } catch (e) { src = null; } }
      if (!src || !fs.existsSync(src)) continue;
      const d = await probeDur(src);
      if (d) { v.dur = d; dirty = true; }
    }
    if (dirty) tenants.save(t);
  }
}
// video çözünürlük tavanı (işletme ayarı, panelde seçilir): 720p/480p zayıf TV kutularında daha akıcı oynar
const VIDEO_MAX = { 1080: [1920, 1080], 720: [1280, 720], 480: [854, 480] };

async function optimizeItem(tid, id) {
  const t = tenants.get(tid); if (!t) return;
  const v = t.db.videos.find(x => x.id === id); if (!v) return;
  // İş başladığındaki dosya: küçültme sürerken içerik yeniden kaydedilirse (afiş stüdyosu) kayıt yeni dosyayı gösterir.
  // Bu durumda eski iş sonucunu atar, hiçbir dosyayı silmez ve kayda dokunmaz; yeni dosya için kuyrukta ayrı iş vardır.
  const srcFile = v.file, cur = () => t.db.videos.find(x => x.id === id);
  const stale = () => { const c = cur(); return !c || c.file !== srcFile; };
  let src = path.join(t.dirs.uploads, srcFile);
  if (!fs.existsSync(src)) { try { src = await require('./storage').ensureLocal(t, srcFile); } catch (e) {} }
  const done = patch => { const c = cur(); if (c && c.file === srcFile) { Object.assign(c, { status: 'ready', reopt: false, optimized: true }, patch); tenants.save(t); hub.pushTenant(tid); } };
  if (!fs.existsSync(src)) return done({ optError: 'dosya bulunamadı' });
  if (!ffmpegOk) return done({ optimized: false, optError: 'ffmpeg yok' });
  const isImg = v.type === 'image';
  if (isImg && /\.(gif|svg)$/i.test(srcFile)) return done({});
  // PNG/WebP girdilerde alfa kanalı korunur (şeffaf logo/grafik siyah zeminli JPG'ye dönmesin)
  const keepAlpha = isImg && /\.(png|webp)$/i.test(srcFile);
  const outName = uid(16) + (isImg ? (keepAlpha ? '.png' : '.jpg') : '.mp4'), out = path.join(t.dirs.uploads, outName);
  const [mw, mh] = VIDEO_MAX[Number(t.db.videoMaxH)] || VIDEO_MAX[1080];
  // zayıf TV kutuları 1080p60'ı çözse de WebView'in üstünde birleştirirken kare düşürür: 1080p'de 30 fps tavanı,
  // 720p ve altında 60 fps'e kadar (kaynak 30 ise 30 kalır, yukarı dönüştürülmez)
  const fpsMax = mh >= 1080 ? 30 : 60;
  const vScale = `scale='min(${mw},iw)':'min(${mh},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`;
  const args = isImg
    ? (keepAlpha
        ? ['-y', '-i', src, '-vf', SCALE + ',format=rgba', '-frames:v', '1', '-compression_level', '9', out]
        : ['-y', '-i', src, '-vf', SCALE, '-frames:v', '1', '-q:v', '3', out])
    : ['-y', '-i', src, '-vf', vScale + `,fps=fps='min(source_fps,${fpsMax})',format=yuv420p`, '-c:v', 'libx264', '-profile:v', 'high', '-level', fpsMax > 30 ? '4.2' : '4.1', '-preset', 'veryfast', '-crf', '23', '-maxrate', '6M', '-bufsize', '12M', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-threads', '2', out];
  const before = fs.statSync(src).size;
  try {
    await runFfmpeg(args);
    const after = fs.statSync(out).size;
    if (!cur()) { // küçültülürken silindi
      fs.rmSync(out, { force: true });
      fs.rmSync(src, { force: true });
      require('./storage').remove(t, srcFile);
      return;
    }
    if (stale()) { fs.rmSync(out, { force: true }); return; } // küçültülürken yeniden kaydedildi: eski dosyayı kaydeden taraf sildi
    if (after >= before && cur().reopt) { fs.rmSync(out, { force: true }); return done({ sizeBefore: before, sizeAfter: before }); }
    const dur = isImg ? null : await probeDur(out); // senkronlu çalma listesi için süre
    if (stale()) { fs.rmSync(out, { force: true }); if (!cur()) require('./storage').remove(t, srcFile); return; }
    require('./storage').remove(t, srcFile);
    // yeni yüklemede (yeniden küçültmede değil) küçülmüş hal kotaya sığmıyorsa ekrana çıkmaz
    const wasNew = !cur().reopt && cur().status === 'processing';
    done({ file: outName, sizeBefore: before, sizeAfter: after, optError: '', ...(dur ? { dur } : {}) });
    const c2 = cur();
    if (wasNew && c2 && settledBytes(t) > limitBytes(t)) { c2.quotaOver = true; tenants.save(t); hub.pushTenant(tid); }
    else if (rebalance(t)) { tenants.save(t); hub.pushTenant(tid); } // başka yerden yer açıldıysa bekleyenler ekrana döner
  } catch (e) {
    fs.rmSync(out, { force: true });
    console.error('Optimizasyon başarısız:', v.name, e.message);
    done({ optError: String(e.message).slice(0, 200), optimized: false });
  }
}
function enqueue(tid, id) { if (!queue.some(q => q.tid === tid && q.id === id)) queue.push({ tid, id, addedAt: Date.now() }); run(); }
function cancel(tid, id) { const idx = queue.findIndex(q => q.tid === tid && q.id === id); if (idx >= 0) queue.splice(idx, 1); }
async function run() {
  if (busy) return; busy = true;
  while (queue.length) {
    const job = queue.shift();
    curJob = { ...job, startedAt: Date.now() };
    try { await optimizeItem(job.tid, job.id); } catch (e) { console.error('Kuyruk hatası:', e.message); }
  }
  curJob = null;
  busy = false;
}
function jobInfo(id) {
  if (curJob && curJob.id === id) {
    const elapsed = Math.round((Date.now() - curJob.startedAt) / 1000);
    return { pos: 0, elapsed, etaSec: Math.max(5, 25 - Math.min(20, elapsed)) };
  }
  const idx = queue.findIndex(q => q.id === id);
  if (idx >= 0) return { pos: idx + 1, elapsed: 0, etaSec: (idx + 1) * 20 };
  return null;
}
function resumeAll() { for (const t of tenants.all()) for (const v of t.db.videos) if (v.status === 'processing') enqueue(t.id, v.id); }

// Medya listesinde en çok içerik (dosya, YouTube, hazır içerik, afiş): panel ve TV döngüsü hafif kalsın
const MAX_ITEMS = 300;
const roomFor = t => Math.max(0, MAX_ITEMS - (t.db.videos || []).length);
const fullMsg = `En fazla ${MAX_ITEMS} içerik eklenebilir. Kullanmadığınız içerikleri silin.`;
// İşletmenin diskte kapladığı yer
const usedBytes = t => require('./storage').usedBytes(t);
// Kota: işletmeye yalnız küçültülmüş (yayına hazır) dosyalar sayılır. Kuyrukta bekleyen ham yüklemeler geçicidir;
// küçültülünce asıl boyutlarıyla sayılırlar (1 GB telefon videosu çoğu zaman 100–350 MB'a iner).
const rawFiles = t => new Set((t.db.videos || []).filter(v => v.status === 'processing' && !v.reopt && v.file).map(v => v.file));
const settledBytes = t => require('./storage').usedBytes(t, rawFiles(t));
const pendingRawBytes = t => [...rawFiles(t)].reduce((n, f) => n + require('./storage').sizeOf(t, f), 0);
const limitBytes = t => require('./plans').plan(t).storageMB * 1048576;
// Küçültme sonrası kota aşıldıysa yeni içerik ekrana çıkmaz (quotaOver); işletme yer açınca hepsi kendiliğinden döner.
// Dosya silinmez: işletme hangisini sileceğine kendisi karar verir. true: durum değişti.
function rebalance(t) {
  const over = (t.db.videos || []).filter(v => v.quotaOver);
  if (!over.length) return false;
  if (settledBytes(t) > limitBytes(t)) return false;
  for (const v of over) delete v.quotaOver;
  return true;
}

module.exports = { MAX_ITEMS, roomFor, fullMsg, probeDur, enqueue, cancel, resumeAll, backfillDurations, usedBytes, settledBytes, pendingRawBytes, limitBytes, rebalance, jobInfo, get ffmpegOk() { return ffmpegOk; }, get queueLength() { return queue.length + (busy ? 1 : 0); } };
