// Google yorumları (Places API) ve Instagram paylaşımları (Instagram Graph API).
// Google: platform anahtarı (süper yönetim → google_places_key) + işletmenin Google Haritalar kaydı. 24 saatte bir yenilenir.
// Maliyet koruması: aylık çağrı sayısı sınırlıdır (varsayılan 900 ≈ Google'ın ücretsiz kotası); %80'de ve dolunca uyarı gider, dolunca çağrı yapılmaz, eski yorumlar gösterilmeye devam eder.
// Instagram: işletme kendi hesabının uzun ömürlü erişim anahtarını girer; anahtar haftada bir otomatik uzatılır,
// son paylaşımların görselleri işletmenin klasörüne indirilir (Instagram'ın görsel adresleri birkaç gün sonra geçersizleşir).
const fs = require('fs');
const path = require('path');
const store = require('./store');
const hub = require('./hub');

const HOUR = 3600000;
const gkey = () => store.setting('google_places_key', '') || process.env.GOOGLE_PLACES_KEY || '';
const IG = 'https://graph.instagram.com';

async function jget(url, opt = {}) {
  const r = await fetch(url, { ...opt, signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && (j.error.message || j.error.status)) || `HTTP ${r.status}`);
  return j;
}


// ---- Google maliyet koruması ----
const gCap = () => Number(store.setting('google_monthly_cap', '')) || Number(process.env.GOOGLE_MONTHLY_CAP) || 900;
const gMonth = () => new Date().toISOString().slice(0, 7);
function googleUsage() { return { month: gMonth(), calls: Number(store.setting('google_calls_' + gMonth(), '0')) || 0, cap: gCap() }; }
// Çağrıdan önce çağrılır: sınır dolduysa false; değilse sayacı artırır, eşiklerde yöneticiyi uyarır
function gSpend() {
  const u = googleUsage();
  if (u.calls >= u.cap) { gWarn('full', u); return false; }
  store.setSetting('google_calls_' + u.month, u.calls + 1);
  if (u.calls + 1 >= Math.floor(u.cap * 0.8)) gWarn('near', { ...u, calls: u.calls + 1 });
  return true;
}
function gWarn(kind, u) {
  const k = `google_warn_${kind}_${u.month}`; if (store.setting(k, '')) return; store.setSetting(k, '1');
  const full = kind === 'full';
  const text = full
    ? `ScreenPano: Google Places aylık çağrı sınırı doldu (${u.calls}/${u.cap}). Ücret çıkmaması için ay sonuna kadar yeni çağrı yapılmayacak; ekranlarda son alınan yorumlar gösterilir. Sınırı süper yönetimden (google_monthly_cap) artırabilirsiniz.`
    : `ScreenPano: Google Places çağrıları bu ay sınıra yaklaştı (${u.calls}/${u.cap}). Dolunca yeni çağrı yapılmaz.`;
  console.log('[Google]', text);
  const tpl = require('./mailtpl');
  const html = tpl.alert({
    title: full ? 'Google Places sınırı doldu' : 'Google Places sınıra yaklaştı',
    lead: full
      ? 'Aylık Google Places çağrı sınırı doldu; ücret çıkmaması için ay sonuna kadar yeni çağrı yapılmayacak. Ekranlarda son alınan yorumlar gösterilmeye devam eder.'
      : 'Google Places çağrıları bu ay sınıra yaklaştı. Sınır dolunca ay sonuna kadar yeni çağrı yapılmaz.',
    rows: [['Bu ayki çağrı', `${u.calls} / ${u.cap}`], ['Durum', full ? 'Sınır doldu · çağrılar durduruldu' : 'Sınıra yaklaşılıyor']],
    small: full ? 'Sınırı süper yönetimden (google_monthly_cap) artırabilirsiniz.' : '',
  });
  const mon = require('./monitor'); mon.webhook(text);
  mon.sendMail(store.setting('site_email', '') || store.setting('legal_email', ''), full ? 'Google Places sınırı doldu' : 'Google Places sınıra yaklaştı', text, html);
}

// ---- Google ----
// İşletme adını/adresini ya da Google Haritalar bağlantısını arar; en fazla 5 aday döndürür
async function googleSearch(text) {
  const key = gkey(); if (!key) throw new Error('Google Places anahtarı platformda tanımlı değil (süper yönetim → Platform anahtarları)');
  if (!gSpend()) throw new Error('Google araması bu ay için sınıra ulaştı; ay başında tekrar deneyin ya da destekle iletişime geçin');
  const q = String(text || '').trim().slice(0, 200);
  const m = /[?&]q=([^&]+)/.exec(q) || /\/place\/([^/@]+)/.exec(q); // harita bağlantısından işletme adını çıkar
  const textQuery = m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : q;
  const j = await jget('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount' },
    body: JSON.stringify({ textQuery, languageCode: 'tr', regionCode: 'TR', pageSize: 5 }),
  });
  return (j.places || []).map(p => ({ id: p.id, name: (p.displayName || {}).text || '', address: p.formattedAddress || '', rating: p.rating || null, count: p.userRatingCount || 0 }));
}
async function googleRefresh(t) {
  const g = t.db.google; if (!g || !g.placeId) return;
  const key = gkey(); if (!key) { g.error = 'Google Places anahtarı yok'; return; }
  if (!gSpend()) { g.tried = Date.now(); return; } // sınır doldu: eski yorumlar kalır
  try {
    const j = await jget(`https://places.googleapis.com/v1/places/${encodeURIComponent(g.placeId)}?languageCode=tr`, { headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'id,displayName,rating,userRatingCount,reviews,googleMapsUri' } });
    g.name = (j.displayName || {}).text || g.name; g.rating = j.rating || null; g.count = j.userRatingCount || 0; g.url = j.googleMapsUri || '';
    g.reviews = (j.reviews || []).map(r => ({
      id: 'g' + require('crypto').createHash('md5').update((r.name || '') + (r.publishTime || '')).digest('hex').slice(0, 10),
      author: ((r.authorAttribution || {}).displayName || 'Google kullanıcısı').slice(0, 60), rating: Number(r.rating) || 0,
      text: String(((r.originalText || r.text) || {}).text || '').replace(/\s+/g, ' ').trim().slice(0, 400), when: r.relativePublishTimeDescription || '', source: 'google',
    })).filter(r => r.text);
    g.updated = Date.now(); g.error = '';
  } catch (e) { g.error = e.message; g.tried = Date.now(); }
  require('./tenants').save(t); hub.pushTenant(t.id);
}

// ---- Instagram ----
async function igRefresh(t, force) {
  const ig = t.db.instagram; if (!ig || !ig.token || ig.enabled === false && !force) return;
  try {
    if (!ig.tokenAt || Date.now() - ig.tokenAt > 7 * 24 * HOUR) { // 60 günlük anahtarı uzat
      try { const r = await jget(`${IG}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(ig.token)}`); if (r.access_token) { ig.token = r.access_token; ig.tokenAt = Date.now(); } } catch (e) { if (!ig.tokenAt) ig.tokenAt = Date.now(); }
    }
    const me = await jget(`${IG}/me?fields=username&access_token=${encodeURIComponent(ig.token)}`);
    ig.user = me.username || ig.user;
    const j = await jget(`${IG}/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=25&access_token=${encodeURIComponent(ig.token)}`);
    const want = (j.data || []).filter(m => m.media_type !== 'VIDEO' || m.thumbnail_url).slice(0, Math.max(1, Math.min(20, ig.count || 8)));
    const keep = new Set(), posts = [];
    for (const m of want) {
      const file = `ig-${String(m.id).replace(/\D/g, '').slice(0, 30)}.jpg`; keep.add(file);
      const p = path.join(t.dirs.uploads, file);
      if (!require('./storage').exists(t, file)) {
        const r = await fetch(m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url, { signal: AbortSignal.timeout(30000) });
        if (!r.ok) continue;
        const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 15 * 1048576) continue;
        fs.writeFileSync(p, buf);
      }
      posts.push({ id: 'ig:' + m.id, file, caption: String(m.caption || '').replace(/\s+/g, ' ').trim().slice(0, 300), at: Date.parse(m.timestamp) || 0, link: m.permalink || '', video: m.media_type === 'VIDEO' });
    }
    for (const old of ig.posts || []) if (!keep.has(old.file)) require('./storage').remove(t, old.file);
    ig.posts = posts; ig.updated = Date.now(); ig.error = '';
  } catch (e) { ig.error = e.message; ig.tried = Date.now(); }
  require('./tenants').save(t); hub.pushTenant(t.id);
}

function tick() {
  const now = Date.now();
  for (const t of require('./tenants').all()) {
    const g = t.db.google, ig = t.db.instagram;
    if (g && g.placeId && now - (g.updated || 0) > 24 * HOUR && now - (g.tried || 0) > HOUR) googleRefresh(t).catch(() => {});
    if (ig && ig.token && ig.enabled !== false && now - (ig.updated || 0) > HOUR && now - (ig.tried || 0) > HOUR) igRefresh(t).catch(() => {});
  }
}
function start() { setTimeout(tick, 30000); setInterval(tick, 10 * 60000); }

module.exports = { googleUsage, googleSearch, googleRefresh, igRefresh, start };
