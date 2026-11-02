// İşletme hesabı açma (kayıt, süper yönetim ve eski verinin aktarımı aynı yoldan geçer).
const config = require('./config');
const store = require('./store');
const auth = require('./auth');
const tenants = require('./tenants');
const W = require('./widgets');

const DAY = 24 * 3600 * 1000;
const USERNAME = /^[a-z0-9._-]{3,32}$/;

function createTenant({ name, username, password, plan = 'pro', trialDays = config.TRIAL_DAYS, paidUntil = null, phone = '', doc = null, template = null, starter = null }) {
  name = String(name || '').trim().slice(0, 80);
  username = String(username || '').trim().toLowerCase();
  if (name.length < 2) throw new Error('İşletme adı gerekli');
  if (!USERNAME.test(username)) throw new Error('Kullanıcı adı 3-32 karakter olmalı; harf, rakam, nokta ve tire kullanılabilir');
  if (String(password || '').length < 8) throw new Error('Şifre en az 8 karakter olmalı');
  if (store.q.userByName.get(username)) throw new Error('Bu kullanıcı adı alınmış');
  const id = auth.uid(), now = Date.now();
  const pro = !!(require('./plans').PLANS[plan] || {}).pro, st = starter ? require('./starters').build(starter, pro) : null;
  const data = { ...tenants.defaultDoc(), ...(st ? st.doc : {}), ...(doc || {}) };
  store.sql.transaction(() => {
    store.q.tenantIns.run({ id, name, plan, status: paidUntil ? 'active' : 'trial', trial_until: now + trialDays * DAY, paid_until: paidUntil, phone: String(phone || '').slice(0, 30), created: now, data: JSON.stringify(data) });
    store.q.userIns.run({ id: auth.uid(), tenant_id: id, username, pass: auth.hashPassword(password), role: 'owner', name: '', created: now });
    store.q.screenIns.run({ id: auth.uid(), tenant_id: id, name: 'Ana Ekran', layout: JSON.stringify(st ? st.layout : W.cleanLayout(W.defaultLayout(template || (pro ? 'spor' : 'temel')))), sort: 0, created: now });
  })();
  return tenants.get(id);
}

function ensureSuper() {
  const exists = store.sql.prepare("SELECT 1 FROM users WHERE role = 'super' LIMIT 1").get();
  if (exists) return;
  let pass = config.SUPER_PASS;
  if (!pass) { pass = auth.uid(16); console.log(`\n[!] Süper yönetici oluşturuldu: kullanıcı "${config.SUPER_USER}", şifre "${pass}" (SUPER_PASS ile belirleyin, girişten sonra değiştirin)\n`); }
  store.q.userIns.run({ id: auth.uid(), tenant_id: null, username: config.SUPER_USER.toLowerCase(), pass: auth.hashPassword(pass), role: 'super', name: 'Süper yönetici', created: Date.now() });
}

module.exports = { createTenant, ensureSuper, USERNAME, DAY };
