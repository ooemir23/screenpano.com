// Paketler, limitler ve abonelik durumu.
// Mekânda tek Android kutu, HDMI dağıtıcıyla tüm TV'lere aynı görüntüyü verir; limit kutu (cihaz) sayısıdır.
const PLANS = {
  baslangic: { id: 'baslangic', name: 'Başlangıç', devices: 1, storageMB: 2048, users: 1, pro: false, badge: true, branches: 1 },
  pro: { id: 'pro', name: 'Pro', devices: 2, storageMB: 20480, users: 3, pro: true, badge: false, branches: 10 },
};
// Süper yöneticinin "sınırsız" işaretlediği (kendi) işletmeler: tüm Pro özellikler, süre ve limit yok. Sitede ve kayıtta görünmez.
const UNLIMITED = { id: 'sinirsiz', name: 'Sınırsız', devices: 999, storageMB: 1048576, users: 99, pro: true, badge: false, branches: 99 };
const isUnlimited = t => !!(t && t.db && t.db.unlimited);
const plan = t => isUnlimited(t) ? UNLIMITED : (PLANS[t.plan] || PLANS.baslangic);

// Ekran çalışıyor mu? Askıya alınmış, denemesi ya da ödemesi bitmiş işletmenin ekranı kapanır.
function access(t) {
  const now = Date.now();
  if (t.status === 'suspended') return { ok: false, reason: 'suspended' };
  if (isUnlimited(t)) return { ok: true, until: null, kind: 'unlimited' };
  if (t.paid_until && t.paid_until > now) return { ok: true, until: t.paid_until, kind: 'paid' };
  if (t.trial_until && t.trial_until > now) return { ok: true, until: t.trial_until, kind: 'trial' };
  return { ok: false, reason: 'expired' };
}

module.exports = { PLANS, UNLIMITED, plan, access, isUnlimited };
