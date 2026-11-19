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
// TV sayfasının sürümü: yalnız tv.html ve posters.js değişince ekranlar kendini yeniler
// (yalnız sunucu kodu değişen her deploy'da bütün müşteri ekranları yeniden yüklenmesin)
const computeBuild = () => { try { const h = crypto.createHash('md5'); for (const f of ['tv.html', 'posters.js']) { try { h.update(fs.readFileSync(path.join(config.PUBLIC_DIR, f))); } catch { /* dosya yok */ } } BUILD = h.digest('hex'); } catch { BUILD = String(Date.now()); } };
computeBuild();

const sendRaw = (ws, msg) => { if (ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };
function sendState(ws, cache) {
  const t = tenants.get(ws.tid); if (!t) return;
  const scId = ws.screenId || '';
  // Toplu yayında kiracı ve ekran başına durum bir kez hesaplanır ve iki biçimde (yerel/sayfa) bir kez metne çevrilir
  const key = ws.tid + '|' + scId + '|' + (ws.native ? 1 : 0);
  let s = cache && cache.get(key);
  if (!s) {
    const bKey = ws.tid + '|' + scId;
    let base = cache && cache.get(bKey);
    if (!base) { base = publicState(t, scId || undefined); if (cache) cache.set(bKey, base); }
    // nativeWidgets: bu kutu ekranı yerel widget'larla çizsin mi (panelden kutu başına açılır; dikey ekranda WebView döndürerek çizer)
    s = JSON.stringify({ type: 'state', state: { ...base, nativeWidgets: !(base.layout && base.layout.orient) && !!ws.native } });
    if (cache) cache.set(key, s);
  }
  sendRaw(ws, s);
}

// Aynı anda gelen çok sayıda değişiklikte işletme başına tek yayın
const pending = new Set(); let flushTimer = null;
function schedule(tid) {
  pending.add(tid);
  if (!flushTimer) flushTimer = setTimeout(() => {
    flushTimer = null;
    const ids = new Set(pending); pending.clear();
    const cache = new Map();
    for (const ws of clients) if (ids.has('*') || ids.has(ws.tid)) sendState(ws, cache);
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
hub.onlineDeviceIds = () => new Set([...clients].filter(c => c.deviceId).map(c => c.deviceId));
hub.sendDevice = (id, msg) => { let n = 0; for (const ws of clients) if (ws.deviceId === id) { sendRaw(ws, msg); n++; } return n; };
hub.setNative = (id, on) => { for (const ws of clients) if (ws.deviceId === id) { ws.native = !!on; sendState(ws); } };
hub.setScreen = (id, screenId) => { for (const ws of clients) if (ws.deviceId === id) { ws.screenId = screenId || null; sendState(ws); } };
hub.kickDevice = id => { for (const ws of clients) if (ws.deviceId === id) { sendRaw(ws, { type: 'auth', error: 'revoked' }); ws.close(); } };

// Çoklu ekran senkronizasyonu: her işletme için sunucuda tek bir çalma listesi saati tutulur, ekranlar ona uyar.
// Saat yalnız çalma listesi gerçekten değişince (içerik eklendi/silindi/sırası, süresi ya da yayın saati değişti)
// düzeltilir; haber, döviz, trafik yenilemesi ya da bir kutunun yeniden bağlanması listeyi başa sarmaz.
const tenantSync = new Map(); // tid -> { sig, idx, id, startedAt, endsAt, lastHeartbeat }
const SCH = require('./sched');
function getActiveMediaList(t) {
  const ml = require('./state').mediaList(t);
  return (ml || []).filter(x => SCH.active(x.sch));
}
function getMediaLen(it, imgSec, gap) {
  if (it.type === 'video') return (it.dur ? it.dur : 30) + (gap || 0); // video bitince son karede beklenen süre (panel ayarı) sunucu saatine de eklenir; yoksa ekranlar bekleme bitmeden sıradakine atlar
  return (it.dur || imgSec || 10);
}
const vgapOf = t => { const g = Number(t.db.videoGapSec); return Math.max(0, Math.min(30, t.db.videoGapSec === undefined || !isFinite(g) ? 3 : Math.round(g))); };
const listSig = (ml, imgSec, gap) => imgSec + '|' + (gap || 0) + '|' + ml.map(x => x.id + ':' + (x.dur || '')).join(',');
// listeyi yeniden okur; liste değiştiyse o an oynayan içerik yeni listede hâlâ varsa kaldığı yerden sürer
function syncFor(t, now) {
  if (!require('./plans').access(t).ok) { tenantSync.delete(t.id); return null; } // süresi dolmuş/askıda: ekran kapalı, içerik eşitlenmez
  const ml = getActiveMediaList(t);
  if (!ml.length) { tenantSync.delete(t.id); return null; }
  const imgSec = t.db.imageSeconds || 10, gap = vgapOf(t), sig = listSig(ml, imgSec, gap);
  let sync = tenantSync.get(t.id);
  if (!sync) {
    sync = { sig, idx: 0, id: ml[0].id, startedAt: now, endsAt: now + getMediaLen(ml[0], imgSec, gap) * 1000, lastHeartbeat: 0 };
    tenantSync.set(t.id, sync);
  } else if (sync.sig !== sig) {
    sync.sig = sig;
    const keep = ml.findIndex(x => x.id === sync.id);
    if (keep >= 0) { sync.idx = keep; sync.endsAt = sync.startedAt + getMediaLen(ml[keep], imgSec, gap) * 1000; }
    else { // oynayan içerik silindi ya da yayın saati bitti: listedeki aynı sıradan devam
      sync.idx = Math.min(sync.idx, ml.length - 1); sync.id = ml[sync.idx].id;
      sync.startedAt = now; sync.endsAt = now + getMediaLen(ml[sync.idx], imgSec, gap) * 1000;
    }
    sync.lastHeartbeat = 0; // değişiklik hemen duyurulsun
  }
  if (now >= sync.endsAt) {
    sync.idx = (sync.idx + 1) % ml.length; sync.id = ml[sync.idx].id;
    sync.startedAt = now; sync.endsAt = now + getMediaLen(ml[sync.idx], imgSec, gap) * 1000;
    sync.lastHeartbeat = 0;
  }
  const it = ml[sync.idx];
  return {
    sync,
    msg: { type: 'sync_media', idx: sync.idx, id: it.id, itemType: it.type, url: it.url || it.image, dur: getMediaLen(it, imgSec, 0), elapsed: Math.max(0, now - sync.startedAt), remain: Math.max(0, sync.endsAt - now), serverTime: now },
  };
}
setInterval(() => {
  const now = Date.now();
  for (const tid of hub.connectedTenantIds()) {
    const t = tenants.get(tid); if (!t) continue;
    const r = syncFor(t, now); if (!r) continue;
    if (now - r.sync.lastHeartbeat >= 4000) { r.sync.lastHeartbeat = now; hub.send(tenant => tenant.id === tid, r.msg); }
  }
  for (const tid of tenantSync.keys()) if (!tenants.get(tid)) tenantSync.delete(tid); // silinen işletme
}, 500);

// TV'den gelen mesajlar: durum raporu, oynatma kaydı, ekran görüntüsü ve müzik listesi sorgusu
function onMessage(ws, raw) {
  if ((!ws.deviceId && !ws.preview) || raw.length > 900000) return;
  let m; try { m = JSON.parse(raw); } catch { return; }
  if (!m || typeof m !== 'object') return;
  if (m.type === 'ping') { sendRaw(ws, '{"type":"pong"}'); return; } // TV'nin bağlantı yoklaması
  // TV menüsünden müzik kontrolü (oynat/duraklat/sonraki/önceki/ses): panelle aynı komut yolu; cihaz başına saniyede birkaç komutla sınırlı
  if (m.type === 'music_ctl') {
    const k = 'mc' + (ws.deviceId || ws.tid), now = Date.now();
    if (!ws.preview && ['toggle', 'play', 'pause', 'next', 'prev', 'volume', 'select', 'source', 'shuffle', 'repeat'].includes(m.cmd) && now - (onMessage.mc.get(k) || 0) > 350) {
      onMessage.mc.set(k, now);
      const t = tenants.get(ws.tid), hub = require('./hub');
      const b = { cmd: m.cmd, volume: m.volume, source: m.source === 'spotify' ? 'spotify' : 'yt', on: typeof m.on === 'boolean' ? m.on : undefined, mode: m.mode };
      // menüden liste/şarkı seçimi: yalnız işletmenin kitaplığındaki bir liste; şarkı başlangıcı biçimi musicCmd'de ayrıca doğrulanır
      if (m.cmd === 'select') {
        const lib = t && t.db.music && Array.isArray(t.db.music.playlists) ? t.db.music.playlists : [];
        if (typeof m.id !== 'string' || !lib.some(x => x.id === m.id)) return;
        Object.assign(b, { id: m.id, uri: m.uri, index: m.index, videoId: m.videoId });
      }
      if (t && hub.musicCmd) hub.musicCmd(t, b).catch(() => {});
    }
    return;
  }
  // TV menüsünde müzik araması (Spotify ya da YouTube Music); cihaz başına dakikada 20 arama
  if (m.type === 'music_search' && typeof m.q === 'string') {
    const t = tenants.get(ws.tid), q = m.q.trim().slice(0, 120), src = m.src === 'spotify' ? 'spotify' : 'yt';
    const reply = o => sendRaw(ws, { type: 'music_search', q, src, tracks: [], lists: [], err: '', ...o });
    if (!t || ws.preview || q.length < 2) return reply({});
    const k = 'ms' + (ws.deviceId || ws.tid), now = Date.now(), h = onMessage.mc.get(k) || { n: 0, at: now };
    if (now - h.at > 60000) { h.n = 0; h.at = now; }
    if (++h.n > 20) return reply({ err: 'Çok sık arama yapıldı; biraz bekleyin' });
    onMessage.mc.set(k, h);
    if (src === 'spotify') {
      const SP = require('./spotify');
      if (!SP.connected(t)) return reply({ err: 'Spotify hesabı bağlı değil' });
      SP.search(t, q).then(r => reply({ tracks: (r.tracks || []).map(x => ({ k: x.uri, t: x.title, c: x.artist, th: x.thumb, d: x.dur })), lists: (r.playlists || []).map(p => ({ k: p.id, t: p.title, c: p.owner, th: p.thumb })) }))
        .catch(e => reply({ err: e.message }));
    } else {
      // YouTube araması genel videoları da getirir: müzik çalarda 15 dk'yı aşanlar (bölüm, canlı yayın, derleme) sona alınır
      require('./youtube').search(q).then(l => { l = l || []; const song = x => x.dur > 0 && x.dur <= 900; reply({ tracks: l.filter(song).concat(l.filter(x => !song(x))).map(x => ({ k: x.videoId, t: x.title, c: x.channel, th: x.thumb, d: x.dur || 0 })) }); })
        .catch(() => reply({ err: 'Arama yapılamadı; tekrar deneyin' }));
    }
    return;
  }
  // TV menüsünde arama sonucunu çal: şarkı (ya da Spotify listesi) kitaplığa eklenir/bulunur ve çalınır (panelle aynı yol)
  if (m.type === 'music_hit' && !ws.preview) {
    const k = 'mh' + (ws.deviceId || ws.tid), now = Date.now();
    if (now - (onMessage.mc.get(k) || 0) < 1500) return;
    onMessage.mc.set(k, now);
    const t = tenants.get(ws.tid), hub = require('./hub'), key = String(m.k || '');
    let url = '';
    if (/^spotify:track:[A-Za-z0-9]{10,40}$/.test(key)) url = 'https://open.spotify.com/track/' + key.split(':')[2];
    else if (m.list && /^[A-Za-z0-9]{10,40}$/.test(key)) url = 'https://open.spotify.com/playlist/' + key;
    else if (/^[A-Za-z0-9_-]{11}$/.test(key)) url = 'https://music.youtube.com/watch?v=' + key;
    if (!t || !url || !hub.musicAdd) return;
    hub.musicAdd(t, { url, title: String(m.t || '').slice(0, 90), thumb: /^https:\/\//.test(m.th || '') ? String(m.th).slice(0, 300) : '', playNow: true, hit: !m.list })
      .then(o => { if (o.body && o.body.warn) sendRaw(ws, { type: 'music_warn', msg: o.body.warn }); }).catch(() => {});
    return;
  }
  // TV menüsündeki müzik çalar: kitaplıktaki bir listenin şarkıları (Spotify ya da YouTube); cihaz başına saniyede bir sorgu
  if (m.type === 'music_list' && typeof m.itemId === 'string') {
    const k = 'ml' + (ws.deviceId || ws.tid), now = Date.now();
    if (now - (onMessage.mc.get(k) || 0) < 900) return;
    onMessage.mc.set(k, now);
    const t = tenants.get(ws.tid), it = t && t.db.music && (t.db.music.playlists || []).find(x => x.id === m.itemId);
    const reply = (items, err) => sendRaw(ws, { type: 'music_list', itemId: m.itemId, items: (items || []).slice(0, 200), err: err || '' });
    if (!it) return reply([], 'Liste bulunamadı');
    if (it.provider === 'spotify') {
      require('./spotify').tracks(t, it.spotifyType || 'playlist', String(it.spotifyId || ''))
        .then(l => reply(l.map(x => ({ k: x.uri, t: x.title, c: x.artist, th: x.thumb, d: x.dur }))))
        .catch(e => reply([], e.message));
    } else if (it.provider === 'ytmix') {
      reply((it.tracks || []).map(x => ({ k: x.v, t: x.t, c: x.c, th: x.th || '', d: 0 })));
    } else if ((it.provider === 'yt' || it.provider === 'ytm') && it.listId) {
      require('./youtube').tracks(t, String(it.listId))
        .then(l => reply((l || []).map(x => ({ k: x.videoId, t: x.title, c: x.channel, th: x.thumb || '', d: x.dur || 0 }))))
        .catch(e => reply([], e.message));
    } else reply([]);
    return;
  }
  if (m.type === 'music_now') { require('./musicnow').report(ws.tid, ws.deviceId || 'preview', m); return; }
  if (m.type === 'music_tracks' && m.listId) {
    const t = tenants.get(ws.tid);
    if (t) require('./youtube').tracks(t, String(m.listId)).then(items => sendRaw(ws, { type: 'music_tracks', listId: m.listId, items: (items || []).map(x => ({ v: x.videoId, t: x.title, c: x.channel })) })).catch(() => sendRaw(ws, { type: 'music_tracks', listId: m.listId, items: [] }));
    return;
  }
  if (!ws.deviceId) return;
  if (m.type === 'status') require('./monitor').report(ws.tid, ws.deviceId, m, ws.ip);
  else if (m.type === 'play') require('./stats').play(ws.tid, String(m.id || ''), m.sec);
  else if (m.type === 'ytlen') { // TV oynatıcısı YouTube videosunun gerçek uzunluğunu bildirir: tekrar sayısı olan içeriğin süresi buna göre hesaplanır
    const t = tenants.get(ws.tid), len = Math.round(Number(m.len)), v = t && t.db.videos.find(x => x.id === String(m.id || '') && x.type === 'youtube');
    if (v && len >= 1 && len <= 14400 && v.len !== len) {
      v.len = len;
      if (v.rep) { const d = require('./ytlink').repDur(len, v.rep); if (v.dur0 == null) v.dur = d; else v.dur0 = d; }
      tenants.save(t);
    }
  }
  else if (m.type === 'shown') require('./stats').shown(ws.tid, String(m.kind || ''), m.id ? String(m.id) : '');
  else if (m.type === 'perf' && Array.isArray(m.steps)) require('./monitor').perf.set(ws.deviceId, { at: Date.now(), result: JSON.parse(JSON.stringify({ steps: m.steps.slice(0, 12), sec: m.sec, screen: m.screen, lite: m.lite, exo: m.exo })) });
  else if (m.type === 'snap' && typeof m.data === 'string' && /^data:image\/(jpeg|png);base64,/.test(m.data)) require('./monitor').snaps.set(ws.deviceId, { at: Date.now(), data: m.data });
}

function attach(server) {
  const wss = new WebSocketServer({ server, path: '/ws', perMessageDeflate: { threshold: 1024 }, maxPayload: 1024 * 1024 });
  // ekran açık kalma süresi: bağlı her cihaz için dakikada bir
  setInterval(() => { const seen = new Set(); for (const ws of clients) if (ws.deviceId && !seen.has(ws.deviceId)) { seen.add(ws.deviceId); try { require('./stats').online(ws.tid, ws.deviceId, 1); } catch (e) {} } }, 60000);
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://x');
    const token = url.searchParams.get('device'), preview = url.searchParams.get('preview'), screenParam = url.searchParams.get('screen');
    if (token) { // TV cihazı
      const d = store.q.deviceByHash.get(auth.hashToken(token));
      if (!d) { sendRaw(ws, { type: 'auth', error: 'invalid' }); return ws.close(); }
      Object.assign(ws, { tid: d.tenant_id, deviceId: d.id, screenId: d.screen_id || null, native: !!d.native, ip: auth.clientIp(req) });
      store.q.deviceSeen.run(Date.now(), d.id);
      const t0 = tenants.get(d.tenant_id); if (t0) require('./monitor').connected(t0, d);
      try { require('./stats').deviceUp(d.tenant_id, d.id); } catch (e) {}

    } else if (preview) { // panelin canlı önizlemesi: oturum çerezi gerekir
      const u = auth.sessionUser(req);
      const tid = u && require('./routes-admin').activeTenantId(u);
      if (!tid || !tenants.get(tid)) { sendRaw(ws, { type: 'auth', error: 'preview' }); return ws.close(); }
      Object.assign(ws, { tid, preview: true, screenId: screenParam || null });
    } else { sendRaw(ws, { type: 'auth', error: 'missing' }); return ws.close(); }
    clients.add(ws);
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('close', () => { clients.delete(ws); if (ws.deviceId && ![...clients].some(c => c.deviceId === ws.deviceId)) { try { require('./stats').deviceDown(ws.tid, ws.deviceId); } catch (e) {} } });
    ws.on('message', raw => onMessage(ws, raw));
    sendRaw(ws, { type: 'version', build: BUILD, now: Date.now() });
    sendState(ws);
    { // yeni bağlanan ekran ortak saate katılır; diğer ekranlar olduğu yerden sürer
      const t1 = tenants.get(ws.tid), r = t1 && syncFor(t1, Date.now());
      if (r) sendRaw(ws, r.msg);
    }
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

onMessage.mc = new Map();
module.exports = { attach, clients, sendState, computeBuild, get build() { return BUILD; } };
