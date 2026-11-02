# ScreenPano — çalışma notları

- Arayüz ve metinler Türkçe; kod yorumları da Türkçe.
- **Uygulamaya kullanıcının göreceği yeni bir özellik eklediğinde ya da var olanı değiştirdiğinde tanıtım sitesini de güncelle:** `public/site/features.json`'a kayıt ekle/düzelt (`added` tarihini bugün yap), görsel gerekiyorsa `shots`'a çekim tarifini yaz. Ayrıntı: `tools/site-shots/README.md`. Görselleri GitHub iş akışı üretir; yerelde `npm run site-shots -- <ad>`.
- Paket sınırlarını `server/plans.js`'te değiştir; site tablosu oradan okur.
- Sitede yalnız uygulamanın gerçekten yaptığı şeyleri yaz; Pro'ya özel özellikler için `server/state.js`'teki `pro` kontrollerine bak.
