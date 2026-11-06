// Spotify hesabı bağlantısı (OAuth, yetkilendirme kodu akışı). İşletme kendi Spotify hesabını bağlar:
//  - listeleri ve şarkıları panelde görür, Spotify'da arama yapar,
//  - "çalınacak cihaz" seçer (TV kutusundaki Spotify uygulaması ya da ScreenPano'nun kendi oynatıcısı),
//  - panel/telefon kumandası (çal, duraklat, sonraki, ses) Spotify Web API üzerinden o cihaza gider.
// Yenileme anahtarı t.db.music.spotify.refreshToken'da durur; TV'ye gitmez (state.js tvMusic ayıklar).
// Kısa ömürlü erişim anahtarı ScreenPano'nun kendi oynatıcısı (Web Playback SDK) için TV'ye gider ve süresi dolmadan yenilenir.
// Oynatma kumandası Spotify Premium ister (Spotify kuralı).
const crypto = require('crypto');
const config = require('./config');
const store = require('./store');
const tenants = require('./tenants');

const SCOPE = 'user-read-private user-read-email playlist-read-private playlist-read-collaborative user-library-read user-read-playback-state user-modify-playback-state user-read-currently-playing streaming';
const API = 'https://api.spotify.com/v1/';
const redirectUri = () => `${config.BASE_URL}/api/oauth/spotify/callback`;
// Uygulama anahtarı yalnız işletmenin kendi Spotify uygulamasından gelir; ortak/platform anahtarı yoktur
const own = t => { const a = (t && t.db && t.db.oauthApps && t.db.oauthApps.spotify) || {}; return a.id && a.secret ? { id: String(a.id), secret: String(a.secret) } : null; };
const creds = t => own(t) || { id: '', secret: '' };
const configured = t => { const c = creds(t); return !!(c.id && c.secret); };
const sp = t => { if (!t.db.music || typeof t.db.music !== 'object') t.db.music = { playlists: [] }; if (!t.db.music.spotify || typeof t.db.music.spotify !== 'object') t.db.music.spotify = {}; return t.db.music.spotify; };
let onChange = () => {}; // routes-ext bağlar: anahtar yenilenince TV'lere yeni durum gider
const setOnChange = fn => { onChange = fn; };

// Giriş oturumları: state -> { tid, at } (15 dk, tek kullanımlık)
const states = new Map();
function authUrl(tid) {
  const t0 = tenants.get(tid);
  const now = Date.now();
  for (const [k, v] of states) if (now - v.at > 15 * 60000) states.delete(k);
  const state = crypto.randomBytes(18).toString('hex');
  states.set(state, { tid, at: now });
  const q = new URLSearchParams({ client_id: creds(t0).id, response_type: 'code', redirect_uri: redirectUri(), scope: SCOPE, state, show_dialog: 'true' });
  return 'https://accounts.spotify.com/authorize?' + q;
}

async function tokenCall(params, t) {
  const c = creds(t);
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(c.id + ':' + c.secret).toString('base64') },
    body: new URLSearchParams(params), signal: AbortSignal.timeout(10000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error_description || j.error || 'Spotify ' + r.status); e.code = j.error; throw e; }
  return j;
}

// Spotify Web API çağrısı. 204 = içerik yok (null döner)
async function call(t, method, path, body) {
  const tok = await access(t);
  const r = await fetch(API + path, {
    method, headers: { Authorization: 'Bearer ' + tok, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000),
  });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const reason = (j.error && j.error.reason) || '';
    const e = new Error(
      reason === 'PREMIUM_REQUIRED' ? 'Bu işlem Spotify Premium hesabı ister'
      : reason === 'NO_ACTIVE_DEVICE' || r.status === 404 && /player/.test(path) ? 'Spotify cihazı bulunamadı: TV kutusunda Spotify uygulamasını bir kez açın'
      : r.status === 401 ? 'Spotify bağlantısı yenilenmeli; yeniden bağlanın'
      : ((j.error && j.error.message) || 'Spotify ' + r.status));
    e.status = r.status; e.reason = reason;
    if (r.status === 401) e.code = 'reconnect';
    throw e;
  }
  return j;
}

// Spotify'dan dönüş: kodu anahtara çevirir, hesap adını ve paketini alır, panele geri yollar
async function callback(req, res) {
  const back = (code, msg) => res.redirect(`/panel?sp=${code}${msg ? '&spm=' + encodeURIComponent(String(msg).slice(0, 120)) : ''}#music/accounts`);
  const st = states.get(String(req.query.state || ''));
  states.delete(String(req.query.state || ''));
  if (!st) return back('expired');
  if (req.query.error) return back(req.query.error === 'access_denied' ? 'denied' : 'err', req.query.error);
  const t = tenants.get(st.tid);
  if (!t || !configured(t)) return back('err');
  try {
    const j = await tokenCall({ grant_type: 'authorization_code', code: String(req.query.code || ''), redirect_uri: redirectUri() }, t);
    const a = sp(t);
    Object.assign(a, { refreshToken: j.refresh_token || a.refreshToken || '', accessToken: j.access_token, expiresAt: Date.now() + ((Number(j.expires_in) || 3600) - 120) * 1000, connectedAt: Date.now(), expired: false });
    if (!a.refreshToken) throw new Error('Spotify yenileme anahtarı vermedi');
    try { const me = await call(t, 'GET', 'me'); a.name = String(me.display_name || me.id || '').slice(0, 80); a.product = String(me.product || '').slice(0, 20); a.country = String(me.country || '').slice(0, 4); } catch (e) {}
    cache.delete(t.id); tenants.save(t); onChange(t);
    back('ok');
  } catch (e) { console.error('Spotify bağlantısı:', e.message); back('err', e.message); }
}

// Geçerli erişim anahtarı (gerekirse yenilenir); yenilenince TV'lere yeni anahtar gider
async function access(t) {
  const a = sp(t);
  if (!a.refreshToken || a.expired) { const e = new Error('Spotify hesabı bağlı değil'); e.code = 'reconnect'; throw e; }
  if (a.accessToken && a.expiresAt > Date.now()) return a.accessToken;
  try {
    const j = await tokenCall({ grant_type: 'refresh_token', refresh_token: a.refreshToken }, t);
    a.accessToken = j.access_token; a.expiresAt = Date.now() + ((Number(j.expires_in) || 3600) - 120) * 1000;
    if (j.refresh_token) a.refreshToken = j.refresh_token;
    tenants.save(t); onChange(t);
    return a.accessToken;
  } catch (e) {
    if (e.code === 'invalid_grant') { a.expired = true; a.accessToken = ''; tenants.save(t); onChange(t); e.code = 'reconnect'; e.message = 'Spotify bağlantısının süresi doldu; yeniden bağlanın'; }
    throw e;
  }
}

const img = (imgs, prefer = 300) => { const l = (imgs || []).filter(Boolean); if (!l.length) return ''; const best = l.slice().sort((x, y) => Math.abs((x.width || prefer) - prefer) - Math.abs((y.width || prefer) - prefer))[0]; return String(best.url || '').slice(0, 300); };
const track = (tr, i) => tr && tr.uri && !tr.is_local ? { idx: i, uri: tr.uri, title: String(tr.name || '').slice(0, 120), artist: (tr.artists || []).map(x => x.name).join(', ').slice(0, 100), thumb: img(tr.album && tr.album.images, 64), dur: Math.round((tr.duration_ms || 0) / 1000) } : null;

// Hesaptaki çalma listeleri (+ "Beğenilen şarkılar" yerine geçen kayıtlı albümler değil, yalnız listeler); 2 dk önbellek
const cache = new Map();
async function playlists(t, force) {
  const c = cache.get(t.id);
  if (!force && c && Date.now() - c.at < 120000) return c.items;
  const items = [];
  let path = 'me/playlists?limit=50';
  for (let i = 0; i < 4 && path; i++) {
    const j = await call(t, 'GET', path);
    for (const p of j.items || []) if (p && p.id) items.push({ id: p.id, type: 'playlist', title: String(p.name || 'Liste').slice(0, 90), thumb: img(p.images), count: ((p.tracks || p.items || {}).total) || 0, owner: String((p.owner || {}).display_name || '').slice(0, 60), url: `https://open.spotify.com/playlist/${p.id}` });
    path = j.next ? j.next.replace(API, '') : '';
  }
  cache.set(t.id, { at: Date.now(), items });
  return items;
}

// Liste/albüm şarkıları (en çok 200). Spotify'ın kendi hazırladığı (editoryal) listelerin içeriğini Web API artık vermiyor:
// o durumda boş liste + açıklama döner; liste yine de TV'de çalınabilir.
const trackCache = new Map();
async function tracks(t, type, id) {
  if (!/^(playlist|album|track)$/.test(type) || !/^[A-Za-z0-9]{10,40}$/.test(id)) throw new Error('Geçersiz liste');
  const key = t.id + ':' + type + ':' + id, c = trackCache.get(key);
  if (c && Date.now() - c.at < 600000) return c.items;
  const items = [];
  try {
    if (type === 'track') { const tr = track(await call(t, 'GET', `tracks/${id}`), 0); if (tr) items.push(tr); }
    else {
      let path = type === 'album' ? `albums/${id}/tracks?limit=50` : `playlists/${id}/tracks?limit=100&additional_types=track`;
      let albumImg = '';
      if (type === 'album') { try { albumImg = img((await call(t, 'GET', `albums/${id}`)).images, 64); } catch (e) {} }
      for (let i = 0; i < 4 && path && items.length < 200; i++) {
        const j = await call(t, 'GET', path);
        for (const it of j.items || []) { const tr = track(type === 'album' ? { ...it, album: { images: [{ url: albumImg, width: 64 }] } } : (it.track || it.item), items.length); if (tr) items.push(tr); }
        path = j.next ? j.next.replace(API, '') : '';
      }
    }
  } catch (e) {
    if (e.status === 404 || e.status === 403) { const er = new Error('Spotify bu listenin şarkılarını dışarıya göstermiyor (Spotify\'ın kendi listesi). Liste TV\'de yine de çalınabilir.'); er.code = 'hidden'; throw er; }
    throw e;
  }
  trackCache.set(key, { at: Date.now(), items });
  return items;
}

// Spotify'da arama: şarkılar ve listeler (en çok 20 + 12)
async function search(t, q) {
  q = String(q || '').trim().slice(0, 120);
  if (!q) return { tracks: [], playlists: [] };
  const j = await call(t, 'GET', `search?type=track,playlist&limit=20&market=from_token&q=${encodeURIComponent(q)}`);
  return {
    tracks: ((j.tracks || {}).items || []).map((x, i) => track(x, i)).filter(Boolean),
    playlists: ((j.playlists || {}).items || []).filter(p => p && p.id).slice(0, 12).map(p => ({ id: p.id, type: 'playlist', title: String(p.name || '').slice(0, 90), thumb: img(p.images), count: ((p.tracks || p.items || {}).total) || 0, owner: String((p.owner || {}).display_name || '').slice(0, 60), url: `https://open.spotify.com/playlist/${p.id}` })),
  };
}

// Spotify Connect cihazları (TV kutusundaki Spotify uygulaması, telefon, bilgisayar, ScreenPano oynatıcısı)
const devCache = new Map(); // kumanda her komutta cihaz listesini yeniden çekmesin (30 sn)
async function devices(t, fresh) {
  const c = devCache.get(t.id);
  if (!fresh && c && Date.now() - c.at < 30000) return c.items;
  const j = await call(t, 'GET', 'me/player/devices');
  const items = (j.devices || []).filter(d => d && d.id).map(d => ({ id: d.id, name: String(d.name || '').slice(0, 60), type: String(d.type || '').slice(0, 20), active: !!d.is_active, volume: d.volume_percent }));
  devCache.set(t.id, { at: Date.now(), items });
  return items;
}

// Seçili cihazın kimliği: kayıtlı ad ile eşleşen cihaz (kimlik zamanla değişebilir), yoksa kayıtlı kimlik
async function targetId(t) {
  const a = sp(t);
  if (!a.target) return '';
  try { const l = await devices(t); const d = l.find(x => x.id === a.target) || l.find(x => a.targetName && x.name === a.targetName); if (d) { if (d.id !== a.target) { a.target = d.id; tenants.save(t); } return d.id; } } catch (e) {}
  return a.target;
}

// Kumanda: it = kütüphanedeki Spotify öğesi; start = { uri } belirli şarkıdan başlat
async function play(t, it, start, volume) {
  const dev = await targetId(t); if (!dev) throw new Error('Önce çalınacak cihazı seçin');
  const uri = `spotify:${it.spotifyType || 'playlist'}:${it.spotifyId}`;
  const body = (it.spotifyType || 'playlist') === 'track' ? { uris: [uri] } : { context_uri: uri, ...(start && start.uri ? { offset: { uri: start.uri } } : {}) };
  await call(t, 'PUT', 'me/player/play?device_id=' + encodeURIComponent(dev), body);
  if (volume != null) { try { await call(t, 'PUT', `me/player/volume?volume_percent=${Math.max(0, Math.min(100, Math.round(volume)))}&device_id=${encodeURIComponent(dev)}`); } catch (e) {} }
}
async function control(t, cmd, opt = {}) {
  const dev = await targetId(t), q = dev ? 'device_id=' + encodeURIComponent(dev) : '';
  if (cmd === 'pause') return call(t, 'PUT', 'me/player/pause?' + q);
  if (cmd === 'resume') return call(t, 'PUT', 'me/player/play?' + q, {});
  if (cmd === 'next') return call(t, 'POST', 'me/player/next?' + q);
  if (cmd === 'prev') return call(t, 'POST', 'me/player/previous?' + q);
  if (cmd === 'volume') return call(t, 'PUT', `me/player/volume?volume_percent=${Math.max(0, Math.min(100, Math.round(opt.volume)))}&${q}`);
}

// O an çalan (panel ve TV'deki "şu an çalıyor" için); 5 sn önbellek
const nowCache = new Map();
async function nowPlaying(t) {
  const c = nowCache.get(t.id);
  if (c && Date.now() - c.at < 5000) return c.v;
  let v = null;
  try {
    const j = await call(t, 'GET', 'me/player/currently-playing?additional_types=track');
    if (j && j.item) v = { provider: 'spotify', title: String(j.item.name || '').slice(0, 140), artist: (j.item.artists || []).map(x => x.name).join(', ').slice(0, 100), thumb: img(j.item.album && j.item.album.images), uri: j.item.uri, playing: !!j.is_playing, progress: Math.round((j.progress_ms || 0) / 1000), dur: Math.round((j.item.duration_ms || 0) / 1000), at: Date.now() };
  } catch (e) { v = { provider: 'spotify', err: e.message, at: Date.now() }; }
  nowCache.set(t.id, { at: Date.now(), v });
  return v;
}

async function disconnect(t) {
  const a = sp(t);
  for (const k of ['refreshToken', 'accessToken', 'expiresAt', 'name', 'product', 'country', 'connectedAt', 'expired', 'target', 'targetName']) delete a[k];
  cache.delete(t.id); nowCache.delete(t.id); tenants.save(t); onChange(t);
}

const status = t => { const a = sp(t); return { configured: configured(t), own: !!own(t), appId: (own(t) || {}).id || '', connected: !!(a.refreshToken && !a.expired), expired: !!a.expired, name: a.name || '', premium: a.product === 'premium', product: a.product || '', target: a.target || '', targetName: a.targetName || '', at: a.connectedAt || 0 }; };
const connected = t => { const a = (t.db.music || {}).spotify || {}; return !!(a.refreshToken && !a.expired); };
// Cihaz seçimi "app" (Spotify uygulaması/başka Connect cihazı) ise müziği Spotify çalar, ScreenPano çalmaz
const external = t => { const a = (t.db.music || {}).spotify || {}; return connected(t) && !!a.target && a.target !== 'screenpano'; };

module.exports = { configured, authUrl, callback, access, playlists, tracks, search, devices, play, control, nowPlaying, disconnect, status, connected, external, redirectUri, setOnChange, sp };
