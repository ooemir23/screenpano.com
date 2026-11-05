# ScreenPano — çalışma notları

- Arayüz ve metinler Türkçe; kod yorumları da Türkçe.
- **Uygulamaya kullanıcının göreceği yeni bir özellik eklediğinde ya da var olanı değiştirdiğinde tanıtım sitesini de güncelle:** `public/site/features.json`'a kayıt ekle/düzelt (`added` tarihini bugün yap), görsel gerekiyorsa `shots`'a çekim tarifini yaz. Ayrıntı: `tools/site-shots/README.md`. Görselleri GitHub iş akışı üretir; yerelde `npm run site-shots -- <ad>`.
- Site dört dilde: `/` Türkçe, `/en`, `/de`, `/ar` (sağdan sola). Sayfa metinleri `public/site/i18n/<dil>.json`, özellik çevirileri `features.json`'daki her kaydın `i18n` alanında. Yeni özellik ya da metin eklerken **en, de, ar çevirilerini de yaz** (eksikse Türkçe görünür). Arapçada alkollü içecek örneklerinden kaçın.
- Logo: `python3 tools/brand/make_logos.py` (yazı çizime çevrilir; SVG'de `<text>` kullanma).
- Paket sınırlarını `server/plans.js`'te değiştir; site tablosu oradan okur.
- Sitede yalnız uygulamanın gerçekten yaptığı şeyleri yaz; Pro'ya özel özellikler için `server/state.js`'teki `pro` kontrollerine bak.
- Panel, süper yönetim ve giriş sayfası da dört dilli (`public/i18n.js` çalışma anında çevirir; kaynak Türkçe metindir). **Arayüze yeni Türkçe metin eklediğinde** `tools/i18n/panel-*.tsv`'ye `tr ¦ en ¦ de ¦ ar` satırı ekle, sonra `python3 tools/i18n/build.py` çalıştır (`public/i18n/*.js` üretilir, commit'e girer). Değişken kısım `{}`, satır içi etiket `<0>…</0>` olarak yazılır. Eksik çeviri Türkçe görünür.
- **Yeni büyük maç stili / duyuru tasarımı eklenirse yerel (Kotlin) olarak yaz:** `android/.../ui/nativeui/BigArenaView.kt` (stil başına bir `build…` işlevi, `supports()` listesine ekle); sayfadaki web tasarımı yalnız eski APK'lar için yedek kalır. Yerel arayüz profesyonel görünmeli: web tasarımıyla yan yana karşılaştır (ekran görüntüsü), yazı boyutları/hizalar/gölgeler/renkler tutmalı. Animasyon ekleme (WebView üstünde sürekli animasyon Box R'da fps düşürür). UI hatalarını kullanıcıya sormadan düzelt.
