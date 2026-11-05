// Süresi girilmemiş videoların gerçek süresi (ffprobe): sunucu saati ile kutular aynı uzunluğu kullansın.
// Yoksa sunucu 30 sn sayar, kutu videoyu daha erken bitirir; senkron bunu "geride kaldım" sanıp videoyu tekrar başlatırdı.
const { execFile } = require('child_process');
const storage = require('./storage');
const known = new Map(); // "tid/dosya" -> saniye (0: ölçülemedi)
const busy = new Set();

function get(t, file, onReady) {
  const key = t.id + '/' + file;
  if (known.has(key)) return known.get(key) || null;
  if (!busy.has(key)) {
    busy.add(key);
    (async () => {
      let sec = 0;
      try {
        await storage.ensureLocal(t, file);
        sec = await new Promise(res => execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', storage.localPath(t, file)], { timeout: 20000 }, (e, out) => res(e ? 0 : parseFloat(String(out).trim()) || 0)));
      } catch (e) { sec = 0; }
      known.set(key, sec > 0 ? Math.max(3, Math.min(600, Math.ceil(sec))) : 0);
      busy.delete(key);
      if (known.get(key) && onReady) onReady();
    })();
  }
  return null;
}
module.exports = { get };
