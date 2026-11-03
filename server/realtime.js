// WebSocket: her TV bağlantısı bir işletmeye ve ekrana bağlıdır. Mesajlar yalnızca ilgili işletmenin ekranlarına gider.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const config = require('./config');
const store = require('./store');
const auth = require('./auth');
const tenants = require('./tenants');
const hub = require('./hub');
const { publicState } = require('./state');

const clients = new Set();
let BUILD = '';
// TV sayfasının sürümü: tv.html ve onun yüklediği posters.js değişince ekranlar kendini yeniler
const computeBuild = () => { try { const h = crypto.createHash('md5'); for (const f of ['tv.html', 'posters.js']) { try { h.update(fs.readFileSync(path.join(config.PUBLIC_DIR, f))); } catch { /* dosya yok */ } } BUILD = h.digest('hex'); } catch { BUILD = String(Date.now()); } };
computeBuild();

const sendRaw = (ws, msg) => { if (ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };
function sendState(ws) {
  const t = tenants.get(ws.tid); if (!t) return;
  sendRaw(ws, { type: 'state', state: publicState(t) });
}

// Aynı anda gelen çok sayıda değişiklikte işletme başına tek yayın
const pending = new Set(); let flushTimer = null;
function schedule(tid) {
  pending.add(tid);
  if (!flushTimer) flushTimer = setTimeout(() => {
    flushTimer = null;
    const ids = new Set(pending); pending.clear();
    for (const ws of clients) if (ids.has('*') || ids.has(ws.tid)) sendState(ws);
  }, 250);
}

hub.pushAll = () => schedule('*');
hub.pushTenant = tid => schedule(tid);
hub.send = (filter, msg) => {
  const s = JSON.stringify(msg), byTenant = new Map();
  for (const ws of clients) {
    if (!byTenant.has(ws.tid)) { const t = tenants.get(ws.tid); byTenant.set(ws.tid, !!t && filter(t, ws)); }
    if (byTenant.get(ws.tid)) sendRaw(ws, s);
  }
};
hub.connectedTenantIds = () => new Set([...clients].map(c => c.tid));
hub.clientCount = () => clients.size;
hub.onlineDeviceIds = () => new Set([...clients].filter(c => c.deviceId).map(c => c.deviceId));
hub.sendDevice = (id, msg) => { let n = 0; for (const ws of clients) if (ws.deviceId === id) { sendRaw(ws, msg); n++; } return n; };
hub.kickDevice = id => { for (const ws of clients) if (ws.deviceId === id) { sendRaw(ws, { type: 'auth', error: 'revoked' }); ws.close(); } };

// TV'den gelen mesajlar: durum raporu, oynatma kaydı, ekran görüntüsü ve müzik listesi sorgusu
function onMessage(ws, raw) {
  if ((!ws.deviceId && !ws.preview) || raw.length > 900000) return;
  let m; try { m = JSON.parse(raw); } catch { return; }
  if (!m || typeof m !== 'object') return;
  if (m.type === 'music_now') { require('./musicnow').report(ws.tid, ws.deviceId || 'preview', m); return; }
  if (m.type === 'music_tracks' && m.listId) {
    const t = tenants.get(ws.tid);
    if (t) require('./youtube').tracks(t, String(m.listId)).then(items => sendRaw(ws, { type: 'music_tracks', listId: m.listId, items: (items || []).map(x => ({ v: x.videoId, t: x.title, c: x.channel })) })).catch(() => sendRaw(ws, { type: 'music_tracks', listId: m.listId, items: [] }));
    return;
  }
  if (!ws.deviceId) return;
  if (m.type === 'status') require('./monitor').report(ws.tid, ws.deviceId, m);
  else if (m.type === 'play') require('./stats').play(ws.tid, String(m.id || ''), m.sec);
  else if (m.type === 'shown') require('./stats').shown(ws.tid, String(m.kind || ''));
  else if (m.type === 'snap' && typeof m.data === 'string' && /^data:image\/(jpeg|png);base64,/.test(m.data)) require('./monitor').snaps.set(ws.deviceId, { at: Date.now(), data: m.data });
}

function attach(server) {
  const wss = new WebSocketServer({ server, path: '/ws', perMessageDeflate: { threshold: 1024 }, maxPayload: 1024 * 1024 });
  // ekran açık kalma süresi: bağlı her cihaz için dakikada bir
  setInterval(() => { const seen = new Set(); for (const ws of clients) if (ws.deviceId && !seen.has(ws.deviceId)) { seen.add(ws.deviceId); try { require('./stats').online(ws.tid, ws.deviceId, 1); } catch (e) {} } }, 60000);
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://x');
    const token = url.searchParams.get('device'), preview = url.searchParams.get('preview');
    if (token) { // TV cihazı
      const d = store.q.deviceByHash.get(auth.hashToken(token));
      if (!d) { sendRaw(ws, { type: 'auth', error: 'invalid' }); return ws.close(); }
      Object.assign(ws, { tid: d.tenant_id, deviceId: d.id });
      store.q.deviceSeen.run(Date.now(), d.id);
      const t0 = tenants.get(d.tenant_id); if (t0) require('./monitor').connected(t0, d);
      try { require('./stats').deviceUp(d.tenant_id, d.id); } catch (e) {}
    } else if (preview) { // panelin canlı önizlemesi: oturum çerezi gerekir
      const u = auth.sessionUser(req);
      const tid = u && require('./routes-admin').activeTenantId(u);
      if (!tid || !tenants.get(tid)) { sendRaw(ws, { type: 'auth', error: 'preview' }); return ws.close(); }
      Object.assign(ws, { tid, preview: true });
    } else { sendRaw(ws, { type: 'auth', error: 'missing' }); return ws.close(); }
    clients.add(ws);
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('close', () => { clients.delete(ws); if (ws.deviceId && ![...clients].some(c => c.deviceId === ws.deviceId)) { try { require('./stats').deviceDown(ws.tid, ws.deviceId); } catch (e) {} } });
    ws.on('message', raw => onMessage(ws, raw));
    sendRaw(ws, { type: 'version', build: BUILD, now: Date.now() });
    sendState(ws);
    const F = require('./feeds'), t = tenants.get(ws.tid);
    if (t && !F.weatherFor(t)) F.refreshWeather(); // yeni işletme ya da yeni konum: havayı hemen çek
    setTimeout(() => F.maybeRenderMap(), 1500);
  });
  // ölü bağlantıları temizle, cihazların son görülme zamanını güncelle
  setInterval(() => {
    const now = Date.now();
    for (const ws of clients) {
      if (!ws.isAlive) { ws.terminate(); clients.delete(ws); continue; }
      ws.isAlive = false; try { ws.ping(); } catch {}
      if (ws.deviceId) store.q.deviceSeen.run(now, ws.deviceId);
    }
  }, 30000);
  return wss;
}

module.exports = { attach, clients, sendState, computeBuild };
