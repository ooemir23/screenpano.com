// Logo arka plan temizleme: beyaz zeminli (alfasız) logo yüklenince kenardan başlayarak
// birbirine bağlı beyaz pikseller şeffaf yapılır. İçte kalan, zemine değmeyen beyazlar (yazı vb.) korunur.
// sharp kurulu değilse özellik sessizce atlanır; logo olduğu gibi kullanılır.
const path = require('path');
const { uid } = require('./auth');

let sharp = null;
try { sharp = require('sharp'); } catch (e) { /* kurulu değil */ }

const MAX_SIDE = 1600;   // işlenecek en büyük kenar (maliyet ve kalite dengesi)
const WHITE_MIN = 235;   // bir pikselin "beyaz zemin" sayılması için en düşük kanal değeri
const FEATHER_MIN = 225; // kesim kenarındaki hale piksellerinin açılma eşiği

// srcPath: uploads içindeki dosya, destDir: temizlenmiş PNG'nin yazılacağı klasör
// dönüş: { ok, mode } — mode: 'removed' (temizlendi, name/removed/share dolu) | 'transparent' (zaten şeffaf)
//        | 'opaque' (mat ama beyaz zemin bulunamadı) | 'skip' (sharp yok / işlenemez tür)
async function clean(srcPath, destDir) {
  if (!sharp) return { ok: false, mode: 'skip' };
  let meta;
  try { meta = await sharp(srcPath, { failOn: 'none' }).metadata(); } catch (e) { return { ok: false, mode: 'skip' }; }
  if (!meta.width || !meta.height || /^(gif|svg)$/.test(meta.format || '')) return { ok: false, mode: 'skip' };
  if (meta.hasAlpha) {
    try {
      const st = await sharp(srcPath, { failOn: 'none' }).stats();
      const a = st.channels[3];
      if (a && a.min < 250) return { ok: false, mode: 'transparent' }; // anlamlı şeffaflık zaten var
    } catch (e) { /* stats alınamazsa temizleme denenir */ }
  }
  let data, info;
  try {
    ({ data, info } = await sharp(srcPath, { failOn: 'none' }).rotate().ensureAlpha()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .raw().toBuffer({ resolveWithObject: true }));
  } catch (e) { return { ok: false, mode: 'skip' }; }
  const w = info.width, h = info.height, n = w * h;
  const isW = new Uint8Array(n), seen = new Uint8Array(n), alpha = new Uint8Array(n).fill(255);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    isW[i] = data[p] >= WHITE_MIN && data[p + 1] >= WHITE_MIN && data[p + 2] >= WHITE_MIN ? 1 : 0;
  }
  // zemin beyaz mı: kenar piksellerinin en az yarısı beyaz olmalı (tam ekran fotoğraflara dokunulmaz)
  let border = 0, borderW = 0;
  const edge = i => { border++; if (isW[i]) borderW++; };
  for (let x = 0; x < w; x++) { edge(x); edge((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { edge(y * w); edge(y * w + w - 1); }
  if (borderW < border * 0.5) return { ok: false, mode: 'opaque' };
  // kenardan taşma (flood fill): zemine bağlı beyazlar şeffaflaşır
  const stack = [];
  const push = i => { if (isW[i] && !seen[i]) { seen[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  let removed = 0;
  while (stack.length) {
    const i = stack.pop();
    alpha[i] = 0; removed++;
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < n - w) push(i + w);
  }
  if (removed < Math.max(50, n * 0.003)) return { ok: false, mode: 'opaque' }; // zemin denecek kadar beyaz yok
  // kesim kenarını yumuşat: şeffaf komşusu olan çok açık pikseller kısmi alfa alır (beyaz hale kalmaz)
  for (let i = 0; i < n; i++) {
    if (!alpha[i]) continue;
    const x = i % w;
    if ((x > 0 && !alpha[i - 1]) || (x < w - 1 && !alpha[i + 1]) || (i >= w && !alpha[i - w]) || (i < n - w && !alpha[i + w])) {
      const p = i * 4, m = Math.min(data[p], data[p + 1], data[p + 2]);
      if (m >= FEATHER_MIN) alpha[i] = Math.min(alpha[i], Math.round(255 * (255 - m) / (255 - FEATHER_MIN)));
    }
  }
  const out = Buffer.from(data.buffer, data.byteOffset, n * 4); // ham kopya üzerinde alfa güncellenir
  for (let i = 0; i < n; i++) out[i * 4 + 3] = alpha[i];
  const name = uid(16) + '.png';
  await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(destDir, name));
  return { ok: true, mode: 'removed', name, removed, share: Math.round(removed / n * 1000) / 10 };
}

module.exports = { clean };
