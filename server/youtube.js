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
    const j = await ytGet(tok, `playlists?part=snippet,contentDetails&mine=true&maxResults=50${page ? '&pageToken=' + encodeURIComponent(page) : ''}`);
    for (const p of j.items || []) {
      const th = (p.snippet && p.snippet.thumbnails) || {};
      items.push({ id: p.id, title: ((p.snippet || {}).title || 'Liste').slice(0, 90), thumb: ((th.medium || th.high || th.default || {}).url) || '', count: ((p.contentDetails || {}).itemCount) || 0 });
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

const status = t => { const a = t.db.ytAuth; return { configured: configured(), connected: !!(a && a.refresh && !a.expired), expired: !!(a && a.expired), name: (a && a.name) || '', at: (a && a.at) || 0 }; };

module.exports = { configured, authUrl, callback, playlists, disconnect, status, redirectUri };
