// Ek abonelikler (paketten bağımsız, isteyen işletme ayrıca alır). Şu an: Tahmin Ligi.
// Kayıt: t.db.addons[id] = { until (ms; null = süresiz), source: 'play' | 'admin', ref?, at }.
// Açan kaynaklar: Google Play satın alması (play.js, sunucuda doğrulanır) ve süper yönetim. İstemci beyanı yetki vermez.
// Sınırsız (kendi) işletmelerde tüm ek abonelikler açıktır. Ekranın çalışması için işletmenin erişimi de açık olmalı (plans.access).
const ADDONS = {
  tahmin_ligi: { id: 'tahmin_ligi', name: 'Tahmin Ligi', priceKey: 'tahminLigi' },
};

function rec(t, id) { const a = t && t.db && t.db.addons; return a && a[id] ? a[id] : null; }
function active(t, id) {
  if (!ADDONS[id] || !t) return false;
  if (require('./plans').isUnlimited(t)) return true;
  const r = rec(t, id); if (!r) return false;
  return r.until == null || r.until > Date.now();
}
// Panel ve süper yönetim için özet: { tahmin_ligi: { active, until, source } }
function summary(t) {
  const out = {};
  for (const id of Object.keys(ADDONS)) { const r = rec(t, id) || {}; out[id] = { active: active(t, id), until: r.until == null ? null : r.until, source: r.source || '', name: ADDONS[id].name }; }
  return out;
}
// Yetki ver / güncelle. until: ms ya da null (süresiz). Daha uzun süreli mevcut kayıt kısaltılmaz (Play yenilemesi + elle uzatma birlikte olabilir),
// ancak force ile (süper yönetim) aynen yazılır.
function grant(t, id, { until = null, source = 'admin', ref = '', force = false } = {}) {
  if (!ADDONS[id]) throw new Error('Bilinmeyen ek abonelik');
  const a = t.db.addons || (t.db.addons = {}), cur = a[id];
  let u = until == null ? null : Number(until);
  if (!force && cur && u != null && (cur.until == null || cur.until > u) && cur.source !== source) u = cur.until;
  a[id] = { until: u, source, ...(ref ? { ref } : {}), at: Date.now() };
  return a[id];
}
function revoke(t, id) { if (t.db.addons && t.db.addons[id]) delete t.db.addons[id]; }

module.exports = { ADDONS, active, summary, grant, revoke };
