// Google Play abonelikleri (yalnız Play Store sürümü: com.screenpano.play).
// Kutu satın alınca belirteci (purchaseToken) /api/tv/play-verify'a gönderir; yetki istemci beyanıyla DEĞİL, burada
// Google Play Developer API'den (servis hesabı) okunan abonelik durumuyla verilir. Abonelik onaylanır (acknowledge),
// yoksa Google 3 gün içinde iade eder. Yenileme / iptal / iade bildirimleri RTDN (Pub/Sub push → /api/play/rtdn) ile gelir;
// RTDN kurulmamışsa periyodik yeniden doğrulama süreleri günceller.
// Ürünler: 'baslangic', 'pro' (paket; süre billing/core.settlePlay ile) ve 'tahmin_ligi' (ek abonelik; addons.js).
const crypto = require('crypto');
const store = require('./store');
const tenants = require('./tenants');

const PKG = () => store.setting('play_package', '') || process.env.PLAY_PACKAGE || 'com.screenpano.play';
const PLAN_PRODUCTS = { baslangic: 'baslangic', pro: 'pro' };
const ADDON_PRODUCTS = { tahmin_ligi: 'tahmin_ligi' };
const PRODUCTS = [...Object.keys(PLAN_PRODUCTS), ...Object.keys(ADDON_PRODUCTS)];

store.sql.exec(`
CREATE TABLE IF NOT EXISTS play_purchases (
  token_hash TEXT PRIMARY KEY,         -- belirtecin özeti (belirteç ayrıca saklanır: yeniden doğrulama için gerekli)
  token TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  product TEXT NOT NULL,
  state TEXT DEFAULT '',               -- SUBSCRIPTION_STATE_*
  until INTEGER DEFAULT 0,             -- Google'ın bildirdiği bitiş (ms)
  test INTEGER DEFAULT 0,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS play_purchases_tenant ON play_purchases (tenant_id);
`);
const th = tok => crypto.createHash('sha256').update(String(tok)).digest('hex');
const getRow = tok => store.sql.prepare('SELECT * FROM play_purchases WHERE token_hash = ?').get(th(tok));

// ---- servis hesabı ve erişim belirteci ----
function account() {
  const raw = store.setting('play_service_account', '') || process.env.PLAY_SERVICE_ACCOUNT || '';
  if (!raw) return null;
  try { const j = JSON.parse(raw); return j.client_email && j.private_key ? j : null; } catch (e) { return null; }
}
const configured = () => !!account();
let tok = null, tokAt = 0;
async function accessToken() {
  if (tok && Date.now() - tokAt < 50 * 60e3) return tok;
  const a = account(); if (!a) throw new Error('Google Play servis hesabı tanımlı değil');
  const now = Math.floor(Date.now() / 1000), b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: a.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = crypto.createSign('RSA-SHA256').update(body).sign(a.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: body + '.' + sig }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Google Play yetkisi alınamadı: ' + (j.error_description || j.error || r.status));
  tok = j.access_token; tokAt = Date.now();
  return tok;
}
async function api(method, path, body) {
  const r = await fetch('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + encodeURIComponent(PKG()) + path, {
    method, headers: { Authorization: 'Bearer ' + await accessToken(), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(12000) });
  const t = await r.text(); let j = {}; try { j = t ? JSON.parse(t) : {}; } catch (e) {}
  if (!r.ok) { const e = new Error('Google Play: ' + ((j.error && j.error.message) || r.status)); e.status = r.status; throw e; }
  return j;
}

// Aboneliğin anlamı: hangi ürün, hangi tarihe kadar, yetki var mı
const ENTITLED = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED']); // iptal: süre sonuna kadar geçerli
function readSub(s) {
  const li = (s.lineItems || []).find(x => PRODUCTS.includes(x.productId)) || null;
  const until = li && li.expiryTime ? Date.parse(li.expiryTime) : 0;
  const state = String(s.subscriptionState || '');
  return { product: li ? li.productId : '', until: Number.isFinite(until) ? until : 0, state, entitled: !!li && ENTITLED.has(state) && until > Date.now(),
    acked: s.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED', account: ((s.externalAccountIdentifiers || {}).obfuscatedExternalAccountId) || '', test: !!s.testPurchase };
}

// Belirteci doğrula ve uygula. tenantHint: isteği yapan cihazın işletmesi (belirteçte işletme yoksa / ilk kez görülüyorsa)
async function verifyAndApply(purchaseToken, tenantHint) {
  const token = String(purchaseToken || '').trim();
  if (!token || token.length > 4096) throw Object.assign(new Error('Geçersiz satın alma'), { status: 400 });
  const s = await api('GET', '/purchases/subscriptionsv2/tokens/' + encodeURIComponent(token));
  const v = readSub(s);
  if (!v.product) throw Object.assign(new Error('Bu satın alma ScreenPano ürünü değil'), { status: 400 });
  // işletme: önce kayıt (belirteç bir kez bağlanınca değişmez), sonra satın alırken verilen hesap kimliği, en son isteyen cihaz
  const row = getRow(token);
  const tid = (row && row.tenant_id) || (v.account && tenants.get(v.account) ? v.account : '') || tenantHint || '';
  const t = tid && tenants.get(tid);
  if (!t) throw Object.assign(new Error('Satın almanın ait olduğu işletme bulunamadı'), { status: 404 });
  const now = Date.now();
  store.sql.prepare(`INSERT INTO play_purchases (token_hash, token, tenant_id, product, state, until, test, created, updated) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(token_hash) DO UPDATE SET product = excluded.product, state = excluded.state, until = excluded.until, test = excluded.test, updated = excluded.updated`)
    .run(th(token), token, t.id, v.product, v.state, v.until, v.test ? 1 : 0, now, now);
  // linkedPurchaseToken: yükseltme/yeniden abonelikte eski belirteç artık geçersiz (yetkiyi yeni belirteç taşır)
  if (s.linkedPurchaseToken) store.sql.prepare("UPDATE play_purchases SET state = 'REPLACED', updated = ? WHERE token_hash = ?").run(now, th(s.linkedPurchaseToken));
  apply(t, v, token);
  if (v.entitled && !v.acked && v.state === 'SUBSCRIPTION_STATE_ACTIVE') {
    try { await api('POST', `/purchases/subscriptions/${encodeURIComponent(v.product)}/tokens/${encodeURIComponent(token)}:acknowledge`, {}); }
    catch (e) { console.error('[Play] onaylanamadı:', e.message); } // bir sonraki doğrulamada yeniden denenir
  }
  return { tenantId: t.id, product: v.product, until: v.until, state: v.state, entitled: v.entitled, test: v.test };
}

function apply(t, v, token) {
  const hub = require('./hub');
  if (ADDON_PRODUCTS[v.product]) {
    const A = require('./addons'), id = ADDON_PRODUCTS[v.product], cur = (t.db.addons || {})[id];
    if (v.entitled) A.grant(t, id, { until: v.until, source: 'play', ref: th(token).slice(0, 16) });
    else if (cur && cur.source === 'play' && cur.ref === th(token).slice(0, 16)) cur.until = Math.min(cur.until == null ? Infinity : cur.until, Date.now()); // süresi bitti / askıda / iade: bu belirtecin verdiği yetki biter
    tenants.save(t); hub.pushTenant(t.id);
    return;
  }
  if (PLAN_PRODUCTS[v.product]) require('./billing/core').settlePlay({ tenantId: t.id, plan: PLAN_PRODUCTS[v.product], until: v.until, entitled: v.entitled, ref: th(token), state: v.state });
}

// RTDN: Pub/Sub push gövdesi. Güvenlik: adres gizli anahtar (?k=) içerir; içerik yine Google API'den doğrulanır.
async function rtdn(body) {
  const m = body && body.message, raw = m && m.data ? Buffer.from(String(m.data), 'base64').toString('utf8') : '';
  let n = {}; try { n = JSON.parse(raw); } catch (e) { return { ok: true, skip: 'bozuk' }; }
  if (n.packageName && n.packageName !== PKG()) return { ok: true, skip: 'paket' };
  const sn = n.subscriptionNotification; if (!sn || !sn.purchaseToken) return { ok: true, skip: n.testNotification ? 'test' : 'yok' };
  const row = getRow(sn.purchaseToken);
  try { return { ok: true, ...(await verifyAndApply(sn.purchaseToken, row ? row.tenant_id : '')) }; }
  catch (e) { if (e.status === 404) return { ok: true, skip: 'işletme yok' }; throw e; }
}
const rtdnKey = () => { let k = store.setting('play_rtdn_key', ''); if (!k) { k = crypto.randomBytes(18).toString('base64url'); store.setSetting('play_rtdn_key', k); } return k; };

// Yedek: yaklaşan bitişleri / iptalleri Google'dan yeniden okur (RTDN yoksa ya da bildirim kaçtıysa)
async function sweep() {
  if (!configured()) return;
  const soon = Date.now() + 2 * 86400e3;
  const rows = store.sql.prepare("SELECT token, tenant_id FROM play_purchases WHERE state NOT IN ('SUBSCRIPTION_STATE_EXPIRED', 'REPLACED') AND until < ? ORDER BY until LIMIT 200").all(soon);
  for (const r of rows) { try { await verifyAndApply(r.token, r.tenant_id); } catch (e) { if (e.status === 410 || e.status === 404) store.sql.prepare("UPDATE play_purchases SET state = 'SUBSCRIPTION_STATE_EXPIRED', updated = ? WHERE token_hash = ?").run(Date.now(), th(r.token)); } }
}
let started = false;
function start() { if (started) return; started = true; setTimeout(() => sweep().catch(() => {}), 60e3).unref(); setInterval(() => sweep().catch(e => console.error('[Play] tarama:', e.message)), 6 * 3600e3).unref(); }

function status(t) {
  return store.sql.prepare('SELECT product, state, until, test, updated FROM play_purchases WHERE tenant_id = ? ORDER BY updated DESC LIMIT 20').all(t.id);
}

// ---- Play fiyatları (Türkiye, KDV dahil) ----
// Doğru kaynak Google Play'dir: süper yönetim fiyatı her açılışta buradan okur, değiştirilince yalnız 'aylik' temel planının
// TR fiyatı güncellenir (diğer ülkeler ve 3 günlük deneme teklifi olduğu gibi kalır). Yeni fiyat yeni abonelere uygulanır.
const PRICE_REGION = 'TR', BASE_PLAN = 'aylik';
const REGION_VERSIONS = ['2025/03', '2022/02']; // shortcut: Google yeni bölge sürümü çıkarıp eskisini reddederse başa ekleyin
const toKurus = p => p ? Number(p.units || 0) * 100 + Math.round((p.nanos || 0) / 1e7) : 0;
const fromKurus = k => ({ currencyCode: 'TRY', units: String(Math.floor(k / 100)), nanos: (k % 100) * 1e7 });
// "1.199,99", "1199.99", 1199.99 → 119999 kuruş; geçersizse 0
function parseTry(v) {
  if (/^\s*-/.test(String(v ?? ''))) return 0; // eksi tutar yok
  let s = String(v ?? '').trim().replace(/[^\d.,]/g, '');
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, '');
  if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, ''); // 1.199 → 1199 (binlik ayırıcı)
  const k = Math.round(Number(s) * 100);
  return Number.isFinite(k) && k > 0 && k <= 100000000 ? k : 0;
}
const trConfig = s => { const bp = (s.basePlans || []).find(b => b.basePlanId === BASE_PLAN); return bp && (bp.regionalConfigs || []).find(c => c.regionCode === PRICE_REGION); };
async function prices() {
  const out = {};
  for (const id of PRODUCTS) {
    const rc = trConfig(await api('GET', '/subscriptions/' + id));
    out[id] = rc && rc.price.currencyCode === 'TRY' ? toKurus(rc.price) / 100 : null;
  }
  return out;
}
async function setPrice(id, value) {
  if (!PRODUCTS.includes(id)) throw new Error('Bilinmeyen Play ürünü: ' + id);
  const k = parseTry(value); if (!k) throw new Error(`${id}: geçersiz tutar`);
  const s = await api('GET', '/subscriptions/' + id), rc = trConfig(s);
  if (!rc || rc.price.currencyCode !== 'TRY') throw new Error(`${id}: Play'de "${BASE_PLAN}" planının Türkiye (TRY) fiyatı yok`);
  if (toKurus(rc.price) === k) return { id, price: k / 100, changed: false };
  rc.price = fromKurus(k); // s.basePlans içindeki nesne yerinde değişir
  let last;
  for (const v of REGION_VERSIONS) {
    try {
      await api('PATCH', `/subscriptions/${encodeURIComponent(id)}?updateMask=basePlans&regionsVersion.version=${encodeURIComponent(v)}`, { packageName: s.packageName, productId: s.productId, basePlans: s.basePlans, listings: s.listings });
      console.log(`[Play] ${id} TR fiyatı ${k / 100} TRY yapıldı`);
      return { id, price: k / 100, changed: true };
    } catch (e) { last = e; if (e.status !== 400 || !/region/i.test(e.message)) throw e; }
  }
  throw last;
}

module.exports = { PKG, PRODUCTS, configured, verifyAndApply, rtdn, rtdnKey, sweep, start, status, readSub, prices, setPrice, _apply: apply, _parseTry: parseTry, _toKurus: toKurus, _fromKurus: fromKurus };
