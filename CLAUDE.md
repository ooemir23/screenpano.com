# ScreenPano — çalışma notları

- Arayüz ve metinler Türkçe; kod yorumları da Türkçe.
- **Uygulamaya kullanıcının göreceği yeni bir özellik eklediğinde ya da var olanı değiştirdiğinde tanıtım sitesini de güncelle:** `public/site/features.json`'a kayıt ekle/düzelt (`added` tarihini bugün yap), görsel gerekiyorsa `shots`'a çekim tarifini yaz. Ayrıntı: `tools/site-shots/README.md`. Görselleri GitHub iş akışı üretir; yerelde `npm run site-shots -- <ad>`.
- Site dört dilde: `/` Türkçe, `/en`, `/de`, `/ar` (sağdan sola). Sayfa metinleri `public/site/i18n/<dil>.json`, özellik çevirileri `features.json`'daki her kaydın `i18n` alanında. Yeni özellik ya da metin eklerken **en, de, ar çevirilerini de yaz** (eksikse Türkçe görünür). Arapçada alkollü içecek örneklerinden kaçın.
- Logo: `python3 tools/brand/make_logos.py` (yazı çizime çevrilir; SVG'de `<text>` kullanma).
- Paket sınırlarını `server/plans.js`'te değiştir; site tablosu oradan okur.
- Sitede yalnız uygulamanın gerçekten yaptığı şeyleri yaz; Pro'ya özel özellikler için `server/state.js`'teki `pro` kontrollerine bak.
- Panel, süper yönetim ve giriş sayfası da dört dilli (`public/i18n.js` çalışma anında çevirir; kaynak Türkçe metindir). **Arayüze yeni Türkçe metin eklediğinde** `tools/i18n/panel-*.tsv`'ye `tr ¦ en ¦ de ¦ ar` satırı ekle, sonra `python3 tools/i18n/build.py` çalıştır (`public/i18n/*.js` üretilir, commit'e girer). Değişken kısım `{}`, satır içi etiket `<0>…</0>` olarak yazılır. Eksik çeviri Türkçe görünür.
- **Yeni büyük maç stili / duyuru tasarımı eklenirse yerel (Kotlin) olarak yaz:** `android/.../ui/nativeui/BigArenaView.kt` (stil başına bir `build…` işlevi, `supports()` listesine ekle); sayfadaki web tasarımı yalnız eski APK'lar için yedek kalır. Yerel arayüz profesyonel görünmeli: web tasarımıyla yan yana karşılaştır (ekran görüntüsü), yazı boyutları/hizalar/gölgeler/renkler tutmalı. Animasyon ekleme (WebView üstünde sürekli animasyon Box R'da fps düşürür). UI hatalarını kullanıcıya sormadan düzelt.

- **Yayın akışı (test → canlı):** Kod değişiklikleri önce `staging` dalına gider (test sunucusu: test.screenpano.com, `APP_ENV=test`); `main` dalı canlıdır ve müşterilere gider. Kullanıcı "canlıya al" derse GitHub'daki **Canlıya al** iş akışını çalıştır (gh GraphQL kapalı: `gh api -X POST repos/ooemir23/screenpano.com/actions/workflows/promote.yml/dispatches -f ref=staging -f 'inputs[onay]=canliya-al'`). Önce staging'deki Android CI'nin (APK commit'i) bittiğini bekle. İş akışı bitince **canlının gerçekten güncellendiğini doğrula** (`curl https://screenpano.com/apk-version.json`, değişiklik APK'sızsa ilgili dosya/davranış); ~3 dk içinde güncellenmediyse Dokploy'da (http://46.225.94.54:3000, canlı uygulama `screenpano`) **Deploy**'a bas. Otomatik dağıtım GitHub webhook'larıyla çalışır (canlı → `deploy.screenpano.com/api/deploy/…`, test → staging push'unda); Dokploy'un kendi adresi `deploy.screenpano.com`, `panel.screenpano.com` işletme paneli (ScreenPano) içindir, ikisini karıştırma. Acil canlı düzeltmesi dışında `main`'e doğrudan push yapma. Ayrıntı: `TEST-ORTAMI.md`.

- **Model iş bölümü:** Opus: mimari, mantık denetimi, sunucu durum/zamanlama, native senkron, yetki/çok kiracı, fiyat/kota, ödeme (`server/billing/`), canlıya alma. Sonnet (`/model opusplan` ya da alt ajan): rutin uygulama, test, refactor. Gemini CLI: toplu çeviri, mağaza metni, özet/geniş okuma — `tools/ai/gemini-delegate.sh` ile, kurallar `GEMINI.md`'de; çıktısı insan/Opus incelemesinden geçmeden koda girmez.
- **Çevrimiçi ödeme** (`server/billing/`, ayrıntı `BILLING.md`) varsayılan KAPALI (`payments_mode=off`). Fiyat/tutar her zaman sunucuda `pricing.js`'ten hesaplanır; `paid_until`'ı yalnız `billing/core.js settlePaid` ve süper yönetim değiştirir. Ödeme alan adları genel CSP'ye eklenmez (ödeme sayfasının kendi CSP'si var).

# Çıktı ve verimlilik kuralları

1. **Zekâdan ödün verme:** İstenmedikçe algoritmayı basitleştirme, uç durumları atlama, eksik mantık teslim etme. Üretime hazır, sağlam kod yaz.
2. **Laf kalabalığı yok:** Selam, kapanış cümleleri ve soruyu yeniden anlatma yok; doğrudan çözüme geç.
3. **Cerrahi değişiklik:** Var olan dosyayı güncellerken yalnız değişen işlev/bloğu, net çevre bağlamıyla göster; dokunulmamış satırları yeniden yazma.
4. **Çıktı süzme:** Terminal çıktısı ve günlüklerde yüzlerce ham satır akıtma; `grep`, `head`, `tail`, `jq` ile süz.
