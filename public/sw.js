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
// TV sayfası: önbellekteki kopya ANINDA gösterilir (kutu elektrik kesintisinden sonra bile saniyede açılır),
// ağ arka planda önbelleği tazeler. İçerik gerçekten değişmişse açık sayfalara 'tv-cached' haberidir gider;
// sayfa bunu alınca kendini yeniler — kutu elle güncellenmek zorunda kalmaz.
async function tvInstant(req) {
  const c = await caches.open(SHELL), key = '/tv';
  const hit = await c.match(key, { ignoreSearch: true });
  fetch(key, { cache: 'no-store' }).then(async r => {
    if (!r.ok) return;
    const txt = await r.text();
    const cur = await c.match(key, { ignoreSearch: true });
    const old = cur ? await cur.text() : null;
    await c.put(key, new Response(txt, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
    if (old !== txt) self.clients.matchAll().then(cs => cs.forEach(cl => cl.postMessage({ type: 'tv-cached' }))).catch(() => {});
  }).catch(() => {});
  if (hit) return hit;
  const r = await timeout(fetch(key, { cache: 'no-store' }), 5000);
  if (r.ok) c.put(key, r.clone());
  return r;
}
async function staleWhileRevalidate(req) {
  const c = await caches.open(SHELL), hit = await c.match(req);
  if (hit) {
    fetch(req).then(r => { if (r.ok && r.type === 'basic') c.put(req, r.clone()); }).catch(() => {});
    return hit;
  }
  return fetch(req); // ağ başarısızsa fetch reddeder; respondWith bunu ağ hatası olarak yansıtır (undefined dönmez)
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
// Büyük medya (video) dosyası için Range isteğini blob() ile kesmek RAM'i doldurur (OOM).
// Bu boyutun üzerindeki dosyalarda isteği doğrudan ağa yönlendir (sunucu akışla Range yanıtlar).
const RANGE_NETWORK_BYTES = 15 * 1024 * 1024;
async function media(req) {
  const c = await caches.open(MEDIA), key = new URL(req.url).pathname, hit = await c.match(key);
  if (hit) {
    const range = req.headers.get('range');
    if (!range) return hit;
    const len = Number(hit.headers.get('Content-Length'));
    if (Number.isFinite(len) && len > RANGE_NETWORK_BYTES) return fetch(req);
    return rangeFrom(hit, range);
  }
  return fetch(req);
}

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url); if (u.origin !== location.origin) return;
  if (u.pathname.startsWith('/api/') || u.pathname === '/ws' || u.pathname === '/sw.js' || u.pathname === '/app.apk') return;
  if (u.pathname.startsWith('/u/')) return e.respondWith(media(req));
  // Kök adres yalnız eski APK'ların WebView'ında TV sayfasıdır (sunucudaki "/" kuralıyla aynı); tarayıcıda tanıtım sitesi açılmalı
  if (u.pathname === '/tv' || (req.mode === 'navigate' && u.pathname === '/' && /; wv\)/.test(self.navigator.userAgent))) return e.respondWith(tvInstant(req));
  if (u.pathname === '/posters.js' || u.pathname === '/panel.js' || u.pathname.startsWith('/i18n/')) return e.respondWith(networkFirst(req)); // poster/panel/çeviri güncellenince eski kopya bir reload geride kalmasın (internet yoksa önbellekten)
  if (/^\/(fonts|celebrate|logo)\//.test(u.pathname) || /\.(js|svg|png|jpe?g|webp|woff2)$/.test(u.pathname)) return e.respondWith(staleWhileRevalidate(req));
});

// ---- medya ön yükleme ----
let job = null, wanted = [];
async function prefetch(urls) {
  wanted = urls;
  if (job) return job;
  job = (async () => {
    const c = await caches.open(MEDIA);
    // Boş liste gönderildiğinde (ör. gece tüm içerikler zamanlamayla kapandığında) önbelleği boşaltma:
    // sabah içerikler dönünce yeniden indirme bant/disk şoku yaşatır. Yalnız liste doluysa senkronla.
    if (wanted.length) {
      const keep = new Set(wanted.map(x => new URL(x, location.origin).pathname));
      for (const k of await c.keys()) if (!keep.has(new URL(k.url).pathname)) await c.delete(k);
    }
    const keep = new Set(wanted.map(x => new URL(x, location.origin).pathname));
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
