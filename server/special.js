// Özel yayın sınırları: kural başladığı/bittiği dakika ekranlara yeni durum gönderilir.
const tenants = require('./tenants');
const { activeSpecial } = require('./state');
const last = new Map(); // tid -> etkin kural kimliği
function tick() {
  for (const t of tenants.all()) {
    if (!(t.db.special || []).length) { last.delete(t.id); continue; }
    const sp = activeSpecial(t), id = sp ? sp.rule.id : '';
    if ((last.get(t.id) || '') !== id) { try { require('./hub').pushTenant(t.id); } catch (e) { /* bağlı ekran yok */ } }
    last.set(t.id, id);
  }
}
function start() { setInterval(tick, 20000).unref(); tick(); }
module.exports = { start, tick };
