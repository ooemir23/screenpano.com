// YouTube hesabı bağlantısı (Google OAuth): işletme kendi YouTube / YouTube Music çalma listelerini panele çeker.
// Yalnız okuma izni (youtube.readonly) istenir. Anahtarlar t.db.ytAuth'ta durur; panele ve TV'ye hiç gönderilmez.
const crypto = require('crypto');
const config = require('./config');
const store = require('./store');
const tenants = require('./tenants');

const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const redirectUri = () => `${config.BASE_URL}/api/oauth/google/callback`;
const creds = () => ({ id: store.setting('google_client_id', '').trim(), secret: store.setting('google_client_secret', '').trim() });
const configured = () => { const c = creds(); return !!(c.id && c.secret); };

// Giriş oturumları: state -> { tid, at } (15 dk geçerli, tek kullanımlık)
const states = new Map();
function authUrl(tid) {
  const now = Date.now();
  for (const [k, v] of states) if (now - v.at > 15 * 60000) states.delete(k);
  const state = crypto.randomBytes(18).toString('hex');
  states.set(state, { tid, at: now });
  const q = new URLSearchParams({ client_id: creds().id, redirect_uri: redirectUri(), response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + q;
}

async function tokenCall(params) {
  const c = creds();
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.id, client_secret: c.secret, ...params }), signal: AbortSignal.timeout(10000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error_description || j.error || 'Google ' + r.status); e.code = j.error; throw e; }
  return j;
}
async function ytGet(access, pathQ) {
  const r = await fetch('https://www.googleapis.com/youtube/v3/' + pathQ, { headers: { Authorization: 'Bearer ' + access }, signal: AbortSignal.timeout(10000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(((j.error || {}).message) || 'YouTube ' + r.status); e.status = r.status; throw e; }
  return j;
}

// Google'dan dönüş: kodu anahtara çevirir, kanal adını alır, panele geri yollar
async function callback(req, res) {
  const back = (code, msg) => res.redirect(`/panel?yt=${code}${msg ? '&ytm=' + encodeURIComponent(String(msg).slice(0, 120)) : ''}#music`);
  const st = states.get(String(req.query.state || ''));
  states.delete(String(req.query.state || ''));
  if (!st) return back('expired');
  if (req.query.error) return back(req.query.error === 'access_denied' ? 'denied' : 'err', req.query.error);
  const t = tenants.get(st.tid);
  if (!t || !configured()) return back('err');
  try {
    const j = await tokenCall({ code: String(req.query.code || ''), grant_type: 'authorization_code', redirect_uri: redirectUri() });
    const old = t.db.ytAuth || {};
    const a = { refresh: j.refresh_token || old.refresh || '', access: j.access_token, exp: Date.now() + ((Number(j.expires_in) || 3600) - 60) * 1000, at: Date.now(), name: '' };
    if (!a.refresh) throw new Error('Google yenileme anahtarı vermedi');
    try { const ch = await ytGet(a.access, 'channels?part=snippet&mine=true'); a.name = ((((ch.items || [])[0] || {}).snippet || {}).title) || ''; } catch (e) { /* kanalı olmayan hesap da listelerini görebilir */ }
    t.db.ytAuth = a; tenants.save(t); cache.delete(t.id);
    back('ok');
  } catch (e) { console.error('YouTube bağlantısı:', e.message); back('err', e.message); }
}

// Geçerli erişim anahtarı (gerekirse yenilenir). Google test modunda bağlantı 7 günde düşer: o zaman "yeniden bağlan" gerekir
async function access(t) {
  const a = t.db.ytAuth;
  if (!a || !a.refresh || a.expired) { const e = new Error('YouTube hesabı bağlı değil'); e.code = 'reconnect'; throw e; }
  if (a.access && a.exp > Date.now()) return a.access;
  try {
    const j = await tokenCall({ refresh_token: a.refresh, grant_type: 'refresh_token' });
    a.access = j.access_token; a.exp = Date.now() + ((Number(j.expires_in) || 3600) - 60) * 1000;
    tenants.save(t);
    return a.access;
  } catch (e) {
    if (e.code === 'invalid_grant') { a.expired = true; a.access = ''; tenants.save(t); e.code = 'reconnect'; e.message = 'YouTube bağlantısının süresi doldu; yeniden bağlanın'; }
    throw e;
  }
}

// Hesaptaki çalma listeleri (YouTube Music'te oluşturulanlar dahil); 2 dk önbellek, en çok 200 liste
const cache = new Map();
async function playlists(t, force) {
  const c = cache.get(t.id);
  if (!force && c && Date.now() - c.at < 120000) return c.items;
  const tok = await access(t), items = [];
  let page = '';
  for (let i = 0; i < 4; i++) {
    const j = await ytGet(tok, `playlists?part=snippet,contentDetails,status&mine=true&maxResults=50${page ? '&pageToken=' + encodeURIComponent(page) : ''}`);
    for (const p of j.items || []) {
      const th = (p.snippet && p.snippet.thumbnails) || {};
      items.push({ id: p.id, title: ((p.snippet || {}).title || 'Liste').slice(0, 90), thumb: ((th.medium || th.high || th.default || {}).url) || '', count: ((p.contentDetails || {}).itemCount) || 0, priv: ((p.status || {}).privacyStatus) === 'private' }); // gizli liste TV'de çalmaz (TV oynatıcısı giriş yapmış değil)
    }
    page = j.nextPageToken; if (!page) break;
  }
  cache.set(t.id, { at: Date.now(), items });
  return items;
}

async function disconnect(t) {
  const a = t.db.ytAuth;
  if (a && a.refresh) { try { await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(a.refresh), { method: 'POST', signal: AbortSignal.timeout(8000) }); } catch (e) { /* yerelde yine silinir */ } }
  delete t.db.ytAuth; cache.delete(t.id); tenants.save(t);
}

// Bir listedeki şarkılar (en çok 200) ve süreleri. Bağlı hesap varsa onun anahtarı (gizli listeler de açılır),
// yoksa süper yönetimdeki YouTube API anahtarı (yalnız herkese açık listeler). 10 dk önbellek.
const trackCache = new Map();
const isoDur = s => { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(s || ''); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0; };
const txtDur = s => { const p = String(s || '').split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : 0; };

// Şarkı arama (InnerTube, anahtar gerekmez): panelin "Şarkı ara" sekmesi ve kendi liste yapma için.
// 1 dk önbellek; en çok 20 sonuç. Gayriresmî uç — liste yedeğinde (innerTubeTracks) zaten aynı yaklaşım kullanılıyor.
const searchCache = new Map();
async function search(q) {
  q = String(q || '').trim().slice(0, 120);
  if (!q) return [];
  const key = q.toLowerCase(), c = searchCache.get(key);
  if (c && Date.now() - c.at < 60000) return c.items;
  const r = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({ query: q, context: { client: { clientName: 'WEB', clientVersion: '2.20261101.01.00', hl: 'tr', gl: 'TR' } } }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error('YouTube ' + r.status);
  const j = await r.json().catch(() => ({}));
  const out = [];
  const sections = (((((j.contents || {}).twoColumnSearchResultsRenderer || {}).primaryContents || {}).sectionListRenderer || {}).contents) || [];
  outer: for (const sec of sections) {
    for (const v of (((sec.itemSectionRenderer || {}).contents) || [])) {
      const vr = v.videoRenderer;
      if (!vr || !vr.videoId) continue; // kanal/çalma listesi kartları değil yalnız video
      const title = ((vr.title && (vr.title.runs || [])[0]) || {}).text || '';
      const ch = ((vr.ownerText && (vr.ownerText.runs || [])[0]) || {}).text || '';
      if (!title) continue;
      out.push({ videoId: vr.videoId, title: title.slice(0, 120), channel: ch.replace(/ - Topic$/, '').slice(0, 80), thumb: `https://i.ytimg.com/vi/${vr.videoId}/mqdefault.jpg`, dur: txtDur((vr.lengthText && vr.lengthText.simpleText) || '') });
      if (out.length >= 20) break outer;
    }
  }
  searchCache.set(key, { at: Date.now(), items: out });
  return out;
}

async function innerTubeTracks(listId) {
  const r = await fetch('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({ playlistId: listId, context: { client: { clientName: 'WEB', clientVersion: '2.20261101.01.00', hl: 'tr', gl: 'TR' } } }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) return [];
  const j = await r.json().catch(() => ({}));
  const list = (((((j.contents || {}).twoColumnWatchNextResults || {}).playlist || {}).playlist || {}).contents) || [];
  const items = [];
  for (const c of list) {
    const v = c && c.playlistPanelVideoRenderer;
    if (!v || !v.videoId || v.unplayableText) continue;
    const title = (v.title && (v.title.simpleText || ((v.title.runs || [])[0] || {}).text)) || '';
    if (/^(Deleted|Private) video$/i.test(title)) continue;
    const ch = (v.longBylineText && ((v.longBylineText.runs || [])[0] || {}).text) || (v.shortBylineText && ((v.shortBylineText.runs || [])[0] || {}).text) || '';
    const ths = (v.thumbnail && v.thumbnail.thumbnails) || [];
    const durTxt = (v.lengthText && (v.lengthText.simpleText || ((v.lengthText.runs || [])[0] || {}).text)) || '';
    items.push({ videoId: v.videoId, idx: items.length, title: title.slice(0, 120), channel: ch.replace(/ - Topic$/, '').slice(0, 80), thumb: (ths[0] && ths[0].url) || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`, dur: txtDur(durTxt) });
  }
  return items;
}
async function tracks(t, listId) {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(listId)) throw new Error('Geçersiz liste');
  const c = trackCache.get(listId);
  if (c && Date.now() - c.at < 600000) return c.items;
  const a = t && t.db && t.db.ytAuth, key = store.setting('youtube_api_key', '').trim();
  let get = null, lastErr = null;
  if (a && a.refresh && !a.expired) {
    try { const tok = await access(t); get = q => ytGet(tok, q); } catch (e) { lastErr = e; }
  }
  if (!get && key) {
    get = async q => { const r = await fetch('https://www.googleapis.com/youtube/v3/' + q + '&key=' + encodeURIComponent(key), { signal: AbortSignal.timeout(10000) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(((j.error || {}).message) || 'YouTube ' + r.status); return j; };
  }
  const items = [];
  if (get) {
    try {
      let page = '';
      for (let i = 0; i < 4; i++) {
        const j = await get(`playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(listId)}&maxResults=50${page ? '&pageToken=' + encodeURIComponent(page) : ''}`);
        for (const it of j.items || []) {
          const sn = it.snippet || {}, vid = (it.contentDetails || {}).videoId || ((sn.resourceId || {}).videoId);
          if (!vid || /^(Deleted|Private) video$/.test(sn.title || '')) continue;
          const th = sn.thumbnails || {};
          items.push({ videoId: vid, idx: Number(sn.position) || items.length, title: (sn.title || '').slice(0, 120), channel: (sn.videoOwnerChannelTitle || '').replace(/ - Topic$/, '').slice(0, 80), thumb: ((th.default || th.medium || {}).url) || '', dur: 0 });
        }
        page = j.nextPageToken; if (!page) break;
      }
      for (let i = 0; i < items.length; i += 50) { // süreler (50 videoda bir istek)
        try { const j = await get(`videos?part=contentDetails&id=${items.slice(i, i + 50).map(x => x.videoId).join(',')}`); const d = new Map((j.items || []).map(v => [v.id, isoDur((v.contentDetails || {}).duration)])); for (const x of items.slice(i, i + 50)) x.dur = d.get(x.videoId) || 0; } catch (e) { /* süre olmadan da listelenir */ }
      }
    } catch (e) { lastErr = e; }
  }
  if (!items.length) {
    try { const pub = await innerTubeTracks(listId); items.push(...pub); } catch (e) {}
  }
  if (!items.length) {
    if (lastErr) throw lastErr;
    const e = new Error('Şarkıları görmek için YouTube hesabınızı bağlayın'); e.code = 'reconnect'; throw e;
  }
  trackCache.set(listId, { at: Date.now(), items });
  return items;
}

const status = t => { const a = t.db.ytAuth; return { configured: configured(), connected: !!(a && a.refresh && !a.expired), expired: !!(a && a.expired), name: (a && a.name) || '', at: (a && a.at) || 0 }; };

module.exports = { configured, authUrl, callback, playlists, tracks, disconnect, status, redirectUri, search };
