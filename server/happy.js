// İndirim saati sınırları (her biri için): başladığı ve bittiği dakika ekranlara yeni durum (indirimli / normal fiyat) gönderilir.
const tenants = require('./tenants');
const { happySig, hoursOf } = require('./state');
const last = new Map(); // tid -> geçerli indirim saatlerinin imzası (id listesi)
function tick() {
  for (const t of tenants.all()) {
    const m = t.db.menu; if (!hoursOf(m).length) { last.delete(t.id); continue; }
    const on = happySig(m);
    if (last.has(t.id) && last.get(t.id) !== on) { try { require('./hub').pushTenant(t.id); } catch (e) {} }
    last.set(t.id, on);
  }
}
function start() { setInterval(tick, 20000); tick(); }
module.exports = { start };
