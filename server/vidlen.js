// Süresi girilmemiş videoların gerçek süresi (ffprobe): sunucu saati ile kutular aynı uzunluğu kullansın.
// Yoksa sunucu 30 sn sayar, kutu videoyu daha erken bitirir; senkron bunu "geride kaldım" sanıp videoyu tekrar başlatırdı.
const { execFile } = require('child_process');
const storage = require('./storage');
const config = require('./config');
const known = new Map(); // "tid/dosya" -> saniye (0: ölçülemedi)
const busy = new Set();
const dbg = {};

function get(t, file, onReady) {
  const key = t.id + '/' + file;
  if (known.has(key)) return known.get(key) || null;
  if (!busy.has(key)) {
    busy.add(key);
    (async () => {
      let sec = 0;
      try {
        await storage.ensureLocal(t, file);
        // ffmpeg -i dosya: çıktı olmadığı için hata verir ama stderr'de "Duration: 00:00:10.04" yazar
        sec = await new Promise(res => execFile(config.FFMPEG, ['-hide_banner', '-i', storage.localPath(t, file)], { timeout: 20000 }, (e, out, err) => {
          dbg[key] = dbg[key] || String(err || e || '').slice(0, 200);
          const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(String(err || '') + String(out || ''));
          res(m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0);
        }));
      } catch (e) { sec = 0; dbg[key] = 'hata: ' + e.message; }
      known.set(key, sec > 0 ? Math.max(3, Math.min(600, Math.ceil(sec))) : 0);
      busy.delete(key);
      if (known.get(key) && onReady) onReady();
    })();
  }
  return null;
}
module.exports = { get, dump: () => ({ known: Object.fromEntries(known), dbg }) };
