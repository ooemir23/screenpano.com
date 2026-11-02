# ScreenPano — çalışma notları

- Arayüz ve metinler Türkçe; kod yorumları da Türkçe.
- **Uygulamaya kullanıcının göreceği yeni bir özellik eklediğinde ya da var olanı değiştirdiğinde tanıtım sitesini de güncelle:** `public/site/features.json`'a kayıt ekle/düzelt (`added` tarihini bugün yap), görsel gerekiyorsa `shots`'a çekim tarifini yaz. Ayrıntı: `tools/site-shots/README.md`. Görselleri GitHub iş akışı üretir; yerelde `npm run site-shots -- <ad>`.
- Site dört dilde: `/` Türkçe, `/en`, `/de`, `/ar` (sağdan sola). Sayfa metinleri `public/site/i18n/<dil>.json`, özellik çevirileri `features.json`'daki her kaydın `i18n` alanında. Yeni özellik ya da metin eklerken **en, de, ar çevirilerini de yaz** (eksikse Türkçe görünür). Arapçada alkollü içecek örneklerinden kaçın.
- Logo: `python3 tools/brand/make_logos.py` (yazı çizime çevrilir; SVG'de `<text>` kullanma).
- Paket sınırlarını `server/plans.js`'te değiştir; site tablosu oradan okur.
- Sitede yalnız uygulamanın gerçekten yaptığı şeyleri yaz; Pro'ya özel özellikler için `server/state.js`'teki `pro` kontrollerine bak.
