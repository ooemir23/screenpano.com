// YouTube bağlantısı çözümleme (medya ve reklam için): bağlantıdan video kimliği ve başlık
const ID = /^[\w-]{11}$/;
function parse(input) {
  const s = String(input || '').trim(); if (!s || s.length > 300) return null;
  if (ID.test(s)) return s;
  let u; try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch (e) { return null; }
  const h = u.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (h === 'youtu.be') id = u.pathname.split('/')[1];
  else if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else { const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/); if (m) id = m[1]; }
  }
  return id && ID.test(id) ? id : null;
}
// Başlık (oEmbed); ulaşılamazsa boş döner, kayıt yine de eklenir
async function title(id) {
  try {
    const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id), { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return '';
    const j = await r.json(); return String(j.title || '').slice(0, 120);
  } catch (e) { return ''; }
}
const thumb = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const clampDur = (v, def = 30) => Math.max(5, Math.min(3600, Math.round(Number(v)) || def));
module.exports = { parse, title, thumb, clampDur };
