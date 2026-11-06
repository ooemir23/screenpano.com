// Modüller arası yayın köprüsü (döngüsel bağımlılık olmasın diye). realtime.js gerçek işlevleri doldurur.
module.exports = {
  pushAll: () => {},            // bağlı tüm ekranlara güncel durum
  pushTenant: (_tid) => {},     // bir işletmenin ekranlarına güncel durum
  send: (_filter, _msg) => {},  // filtreye uyan ekranlara mesaj: filter(tenant, client) => bool
  connectedTenantIds: () => new Set(),
};
