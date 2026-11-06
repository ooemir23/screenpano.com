// İndirim saati sınırları: başladığı ve bittiği dakika ekranlara yeni durum (indirimli / normal fiyat) gönderilir.
const tenants = require('./tenants');
const { happyOn } = require('./state');
const last = new Map(); // tid -> açık mı
function tick() {
  for (const t of tenants.all()) {
    const m = t.db.menu; if (!m || !m.happy) { last.delete(t.id); continue; }
    const on = happyOn(m);
    if (last.has(t.id) && last.get(t.id) !== on) { try { require('./hub').pushTenant(t.id); } catch (e) {} }
    last.set(t.id, on);
  }
}
function start() { setInterval(tick, 20000); tick(); }
module.exports = { start };
