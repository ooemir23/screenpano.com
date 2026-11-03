// TV'lerin bildirdiği "şu an çalan" şarkı (bellekte; işletme başına en son bildirim). Panel bunu gösterir.
const now = new Map();
const s = (v, n) => String(v ?? '').slice(0, n);
function report(tid, deviceId, m) {
  now.set(tid, {
    at: Date.now(), deviceId, playing: m.playing !== false, provider: s(m.provider, 12), listId: s(m.listId, 64), itemId: s(m.itemId, 40),
    title: s(m.title, 140), artist: s(m.artist, 100), thumb: /^https:\/\//.test(m.thumb || '') ? s(m.thumb, 300) : '', videoId: s(m.videoId, 20), index: Number.isInteger(m.index) ? m.index : -1, err: s(m.err, 140),
  });
}
const get = tid => { const n = now.get(tid); return n && Date.now() - n.at < 15 * 60000 ? n : null; };
module.exports = { report, get };
