/* ScreenPano TV çevrimdışı önbelleği.
   - TV sayfası: önce ağ, olmazsa önbellek (internet yokken kutu yeniden başlasa da ekran açılır)
   - Medya (/u/...): önbellekte varsa oradan (video ileri sarma için Range desteğiyle), yoksa ağdan
   - TV, oynatma listesindeki medyayı "prefetch" mesajıyla sırayla indirtir; listeden çıkanlar silinir */
const SHELL = 'sp-shell-v2', MEDIA = 'sp-media-v1';
const SHELL_URLS = ['/tv', '/posters.js', '/favicon.svg', '/fonts/montserrat-latin.woff2', '/fonts/montserrat-latin-ext.woff2'];

self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_URLS)).catch(() => {}).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== MEDIA).map(k => caches.delete(k)))).then(() => self.clients.claim())); });

const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

async function networkFirst(req, key) {
  const c = await caches.open(SHELL);
  try {
    const r = await timeout(fetch(req), 5000);
    if (r.ok) c.put(key || req, r.clone());
    return r;
  } catch (e) {
    const hit = await c.match(key || req, { ignoreSearch: true });
    if (hit) return hit;
    throw e;
  }
}
async function staleWhileRevalidate(req) {
  const c = await caches.open(SHELL), hit = await c.match(req);
  const net = fetch(req).then(r => { if (r.ok && r.type === 'basic') c.put(req, r.clone()); return r; }).catch(() => hit);
  return hit || net;
}
// Önbellekteki tam dosyadan istenen aralığı kes (video etiketi "Range: bytes=..." ister)
async function rangeFrom(resp, range) {
  if (!range || resp.type === 'opaque') return resp;
  const m = /bytes=(\d*)-(\d*)/.exec(range); if (!m) return resp;
  const blob = await resp.blob(), size = blob.size; // Blob dilimi belleğe tamamını yüklemez
  let start = m[1] === '' ? size - Number(m[2]) : Number(m[1]), end = m[1] !== '' && m[2] !== '' ? Number(m[2]) : size - 1;
  start = Math.max(0, start); end = Math.min(size - 1, end);
  if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(blob.slice(start, end + 1), { status: 206, headers: { 'Content-Type': resp.headers.get('Content-Type') || blob.type || 'application/octet-stream', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' } });
}
async function media(req) {
  const c = await caches.open(MEDIA), key = new URL(req.url).pathname, hit = await c.match(key);
  if (hit) return rangeFrom(hit, req.headers.get('range'));
  return fetch(req);
}

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url); if (u.origin !== location.origin) return;
  if (u.pathname.startsWith('/api/') || u.pathname === '/ws' || u.pathname === '/sw.js' || u.pathname === '/app.apk') return;
  if (u.pathname.startsWith('/u/')) return e.respondWith(media(req));
  if (u.pathname === '/tv' || (req.mode === 'navigate' && u.pathname === '/')) return e.respondWith(networkFirst(req, '/tv'));
  if (u.pathname === '/posters.js') return e.respondWith(networkFirst(req)); // poster tasarımları güncellenince eski kopya kullanılmasın (internet yoksa önbellekten)
  if (/^\/(fonts|celebrate|logo)\//.test(u.pathname) || /\.(js|svg|png|jpe?g|webp|woff2)$/.test(u.pathname)) return e.respondWith(staleWhileRevalidate(req));
});

// ---- medya ön yükleme ----
let job = null, wanted = [];
async function prefetch(urls) {
  wanted = urls;
  if (job) return job;
  job = (async () => {
    const c = await caches.open(MEDIA);
    const keep = new Set(wanted.map(x => new URL(x, location.origin).pathname));
    for (const k of await c.keys()) if (!keep.has(new URL(k.url).pathname)) await c.delete(k);
    for (const p of keep) {
      if (await c.match(p)) continue;
      try {
        const r = await fetch(p, { credentials: 'omit' });
        if (r.ok || r.type === 'opaque') await c.put(p, r);
      } catch (e) { /* ağ yok: sonra yeniden denenir */ }
    }
    let n = 0, bytes = 0;
    try { const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; bytes = est ? est.usage || 0 : 0; } catch (e) {}
    for (const k of await c.keys()) if (keep.has(new URL(k.url).pathname)) n++;
    return { cached: n, total: keep.size, bytes };
  })();
  try { return await job; } finally { job = null; if (wanted.join() !== urls.join()) prefetch(wanted); }
}
self.addEventListener('message', e => {
  const m = e.data || {};
  if (m.type === 'prefetch' && Array.isArray(m.urls)) prefetch(m.urls.slice(0, 300)).then(r => { if (e.source) e.source.postMessage({ type: 'cache', ...r }); }).catch(() => {});
});
