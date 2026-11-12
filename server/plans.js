// Paketler, limitler ve abonelik durumu.
// Mekânda tek Android kutu, HDMI dağıtıcıyla tüm TV'lere aynı görüntüyü verir; limit kutu (cihaz) sayısıdır.
// branches: mutlak üst sınır (org_id başına toplam lokasyon). includedBranches: ek ücret uygulanmadan dahil olan lokasyon sayısı.
// menuCats/menuItems: ekranda gösterilen fiyat listesi sınırı (0 = sınırsız). Veri kesilmez; fazlası yalnız ekrana çıkmaz,
// paket yükselince hemen görünür. İndirim saatleri (fiyat değişimi ve duyuru kartı) Pro'dadır.
// Pro'da 3 lokasyon (ana + 2 şube) dahil; sonrası her ek şube için "fee_extra_branch" ayarı kadar ücret kaydı düşer.
const PLANS = {
  baslangic: { id: 'baslangic', name: 'Başlangıç', devices: 1, storageMB: 2048, users: 1, pro: false, badge: true, branches: 1, includedBranches: 1, menuCats: 3, menuItems: 40 },
  pro: { id: 'pro', name: 'Pro', devices: 2, storageMB: 20480, users: 3, pro: true, badge: false, branches: 99, includedBranches: 3, menuCats: 0, menuItems: 0 },
};
// Süper yöneticinin "sınırsız" işaretlediği (kendi) işletmeler: tüm Pro özellikler, süre ve limit yok. Sitede ve kayıtta görünmez.
const UNLIMITED = { id: 'sinirsiz', name: 'Sınırsız', devices: 999, storageMB: 1048576, users: 99, pro: true, badge: false, branches: 99, includedBranches: 99, menuCats: 0, menuItems: 0 };
const isUnlimited = t => !!(t && t.db && t.db.unlimited);
const plan = t => {
  const base = isUnlimited(t) ? UNLIMITED : (PLANS[t.plan] || PLANS.baslangic);
  const customDevices = t && t.db && typeof t.db.devices === 'number' && t.db.devices > 0 ? t.db.devices : null;
  return customDevices ? { ...base, devices: customDevices, customDevices } : base;
};

// Ekran çalışıyor mu? Askıya alınmış, denemesi ya da ödemesi bitmiş işletmenin ekranı kapanır.
// Zincirin ana işletmesi (sahibi olan) askıya alınırsa şubeleri de durur: şubelerin ayrı sahibi yoktur.
// org_id başına ana işletme kimliği 60 sn önbellekte tutulur (access sık çağrılır).
const homeCache = new Map(); // org_id -> { id, at }
function orgHome(t) {
  if (!t || !t.org_id) return null;
  const c = homeCache.get(t.org_id);
  if (c && Date.now() - c.at < 60000) return c.id ? require('./tenants').get(c.id) : null;
  const store = require('./store');
  const home = store.q.orgTenants.all(t.org_id).find(x => store.q.usersOf.all(x.id).some(u => u.role === 'owner'));
  homeCache.set(t.org_id, { id: home ? home.id : null, at: Date.now() });
  return home ? require('./tenants').get(home.id) : null;
}
function access(t) {
  const now = Date.now();
  if (t.status === 'suspended') return { ok: false, reason: 'suspended' };
  const home = orgHome(t);
  if (home && home.id !== t.id && home.status === 'suspended') return { ok: false, reason: 'suspended' };
  if (isUnlimited(t)) return { ok: true, until: null, kind: 'unlimited' };
  if (t.paid_until && t.paid_until > now) return { ok: true, until: t.paid_until, kind: 'paid' };
  if (t.trial_until && t.trial_until > now) return { ok: true, until: t.trial_until, kind: 'trial' };
  return { ok: false, reason: 'expired' };
}

// Paket sınırına göre ekrana giden fiyat listesi: ilk menuCats kategori, toplamda en çok menuItems ürün.
// Sıra paneldeki sıradır; boş kalan kategori gösterilmez. Sınırsız pakette liste olduğu gibi döner.
function limitMenu(m, p) {
  if (!m || !Array.isArray(m.categories)) return m;
  const mc = Number(p.menuCats) || 0, mi = Number(p.menuItems) || 0;
  if (!mc && !mi) return m;
  let left = mi || Infinity; const cats = [];
  for (const c of m.categories) {
    if (mc && cats.length >= mc) break;
    if (left <= 0) break;
    const items = (c.items || []).slice(0, left);
    left -= items.length;
    if (items.length || !(c.items || []).length) cats.push({ ...c, items });
  }
  return { ...m, categories: cats };
}
module.exports = { PLANS, UNLIMITED, plan, access, isUnlimited, limitMenu };
