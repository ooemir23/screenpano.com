# ScreenPano — İşletmeler İçin Dijital Ekran ve Menü Panosu Platformu

Çok işletmeli (SaaS) dijital ekran ve menü panosu platformu. Tek sunucu, tek APK: her işletme kendi kullanıcı adı ve şifresiyle girer; medyasını, düzenini, renklerini ve logosunu yönetir.

Mekânda **tek Android kutu** yeterli: kutu HDMI dağıtıcıyla tüm TV'lere aynı görüntüyü verir. Bu yüzden her işletmenin tek bir ekran düzeni vardır; paketler kutu (cihaz) sayısıyla sınırlanır.

> Ürün adı: `BRAND_NAME` ortam değişkeni (varsayılan: `ScreenPano`) ve APK'da `-PAPP_NAME` ile yapılandırılır.

## Neler var

| Bölüm | Adres | Kim kullanır |
| --- | --- | --- |
| Tanıtım sitesi | `/` | Ziyaretçiler (giriş yapmış kullanıcı panele yönlenir; `/?site` her zaman siteyi açar). Özellikler `public/site/features.json`'dan çizilir, görseller otomatik üretilir: `tools/site-shots/README.md` |
| KVKK, kullanım koşulları, gizlilik | `/kvkk`, `/kosullar`, `/gizlilik` | Herkes |
| Giriş / ücretsiz deneme kaydı | `/login` | İşletmeler |
| İşletme paneli | `/panel` | İşletme sahibi ve personeli |
| TV ekranı | `/tv` | Android TV kutusu (APK) ya da tarayıcı |
| Süper yönetim | `/super` | Siz: işletmeler, paketler, süreler, platform anahtarları |

**İşletme paneli** (telefondan da kullanılır), ilgili ayarlar bir arada:

| Bölüm | İçerik |
| --- | --- |
| Özet | Canlı önizleme, kurulum adımları, cihaz durumu, hızlı işlemler |
| Tasarım | Hazır düzenler, sürükle-bırak düzen editörü ve widget ayarları · renk ve logo · TV ayarları (kenar payı, efektler) |
| Medya | Video/fotoğraf yükleme, sürükleyerek sıralama, fotoğraf süresi, depolama |
| Fiyat Listesi | Kategori ve ürünler, toplu yapıştırma |
| Spor | Ligler, puan durumu, büyük maç duyurusu, elle maç, gol testi |
| Duyurular | Kampanya kartı, QR kodlar, Google yorumları |
| Kutlamalar | Doğum günü (kişiler, saatler), resmî günler |
| Bilgi Bandı | Haber, nöbetçi eczane, sinema, kitap, tarihte bugün, trafik |
| İstatistik | Günlük ekran süresi, içerik bazında oynatma sayısı ve süresi (7/30/90 gün) |
| Ayarlar | İşletme ve şehir · Cihazlar (durum raporu, ekran görüntüsü, çevrimdışı uyarısı, e-posta) · Şubeler (geçiş, yeni şube, içerik kopyalama) · Kullanıcılar · Paket · Yedekler · Verilerim (KVKK: dışa aktarma, hesap silme) |

**Yeni özellikler (v2.1)**

- **Zamanlama:** her video, fotoğraf, afiş, kampanya kartı ve fiyat listesi kategorisi için gün, saat aralığı (gece yarısını aşabilir) ve tarih aralığı. TV kuralları kendi saatinde 30 saniyede bir yeniden değerlendirir; internet yokken de çalışır.
- **Hazır içerikler:** 9 düzenlenebilir afiş şablonu (`public/posters.js`, TV ve panel ortak). Renkler temadan gelir, fotoğraf eklenebilir, çevirisi girilebilir. Medya sırasında `type: 'poster'` kaydı olarak durur.
- **Durum izleme:** TV dakikada bir sürüm, çözünürlük, çalışma süresi, oynayan içerik, son hata ve önbellek bilgisini bildirir. 10 dk bağlantı yoksa panelde uyarı, işletmeye e-posta (SMTP), platforma webhook. Android 2.1 uygulaması ekran görüntüsü verir.
- **Çoklu şube:** sahibin hesabına bağlı şubeler (`tenants.org_id`). Panelden şube açma, şubeler arası geçiş, düzen/renk/medya/fiyat/duyuru/dil kopyalama. TV'de kullanıcı adıyla girişte şube sorulur.
- **Google yorumları** (Places API, platform anahtarı) ve **Instagram** (işletmenin uzun ömürlü erişim anahtarı; görseller indirilir, medya döngüsüne serpiştirilir).
- **Çoklu dil:** fiyat listesi, duyuru metni ve afişler Türkçe + en çok 3 dilde sırayla döner (en, de, ru, ar, fr, es).
- **Kullanım istatistiği:** `stats` tablosunda günlük toplamlar; kişisel veri yok, 400 günden eskisi silinir.
- **R2 depolama:** `server/s3.js` bağımlılıksız S3 (SigV4) istemcisi; yüklemeler arka planda R2'ye taşınır, `/u/...` adresi aynı kalır.
- **Çevrimdışı oynatma:** `public/sw.js` TV sayfasını ve medyayı önbelleğe alır (video ileri sarma için Range desteği); son durum cihazda saklanır, internet yokken kutu yeniden açılsa da ekran gelir.
- **Platform yedeği:** her gece tüm veritabanı sıkıştırılıp `DATA_DIR/backups`'a (14 gün) ve R2 ayarlıysa R2'ye (60 gün) yazılır.
- **KVKK:** kayıtta sözleşme ve aydınlatma onayı (sürümüyle saklanır), panelden veri indirme, 30 gün bekletmeli hesap silme, doğum günü eklerken rıza onayı. Metinler `server/legal.js`'te taslaktır; **avukata kontrol ettirin**.

**Widget'lar** (24×24 ızgara, her biri bir kez): Medya oynatıcı, Logo, Saat, Hava ve piyasalar, Kayan bant, Duyuru metni, Görsel, QR kart · Pro: Maçlar ve bilgi sayfaları, Google yorumları, Fiyat tarifesi.

**Paketler** (`server/plans.js`): Başlangıç (1 cihaz, 2 GB, köşede ürün ibaresi, Pro özellikler kapalı) · Pro (2 cihaz — biri yedek kutu için, 20 GB, maçlar, fiyat listesi, bilgi bandı, yorumlar, doğum günü). Birden çok şubesi olan müşteri için her şube ayrı işletme hesabıdır. Yeni kayıt 14 gün Pro deneme alır. Süre dolunca TV'de "Abonelik süresi doldu" ekranı çıkar; süper yönetimden süre eklenince ekran kendiliğinden geri gelir.

## Çalıştırma

```bash
npm install
SUPER_PASS='guclu-bir-sifre' npm start      # http://localhost:3000
```

İlk açılışta süper yönetici oluşturulur (kullanıcı `admin`; `SUPER_PASS` verilmezse rastgele şifre konsola yazılır). `/login`'den girip `/super`'e geçin.

Ortam değişkenleri:

| Değişken | Varsayılan | Açıklama |
| --- | --- | --- |
| `PORT` | 3000 | |
| `DATA_DIR` | `./data` | Veritabanı (`platform.db`), işletme klasörleri, önbellek. Bulutta kalıcı diske bağlayın. |
| `BRAND_NAME` | ScreenPano | Ürün adı |
| `SUPER_USER` / `SUPER_PASS` | admin / (rastgele) | Yalnızca ilk açılışta kullanılır |
| `LOGIN_LIMIT` | (kapalı) | `on` ise aynı IP'den 10 dakikada 12 hatalı giriş/kayıttan sonra 10 dakika bekletilir |
| `ALLOW_SIGNUP` | true | `false` ise yalnız süper yönetim işletme açar |
| `TRIAL_DAYS` | 14 | |
| `SESSION_SECRET` | (otomatik) | Verilmezse veritabanında üretilir |
| `FFMPEG_PATH`, `CHROMIUM_PATH` | ffmpeg, chromium | Medya optimizasyonu ve trafik haritası |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | (boş) | Cloudflare R2. Verilince medya ve yedekler R2'ye gider |
| `R2_PUBLIC_URL` | (boş) | R2 kovası herkese açık bir alan adına bağlıysa TV dosyayı oradan çeker (sunucu trafiği azalır). Boşsa sunucu aktarır |
| `R2_KEEP_LOCAL` | false | `true` ise R2'ye gönderilen dosyanın yerel kopyası da tutulur |
| `S3_ENDPOINT`, `S3_REGION` | (R2'den) | R2 yerine başka bir S3 uyumlu depo |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` | (boş) | Çevrimdışı uyarı e-postaları |
| `PUBLIC_URL` | (boş) | E-postalardaki panel bağlantısı için, örn. `https://screenpano.com` |
| `ALERT_WEBHOOK` | (boş) | Platform uyarıları (süper yönetimden de girilebilir) |
| `OFFLINE_ALERT_MIN` | 10 | Kaç dakika bağlantısızlıktan sonra uyarı |
| `BACKUP_KEEP_LOCAL`, `BACKUP_KEEP_REMOTE` | 14, 60 | Platform yedeklerinin saklama süresi (gün) |
| `GOOGLE_PLACES_KEY` | (boş) | Süper yönetimdeki anahtar boşsa kullanılır |

Docker: `docker build -t screenpano . && docker run -p 3000:3000 -v /srv/screenpano:/data -e SUPER_PASS=... screenpano`. HTTPS için önüne Caddy/Nginx koyun (sunucu `X-Forwarded-*` başlıklarına güvenir).

## İlk kurulum adımları

1. `/super` → **Platform anahtarları**: CollectAPI (eczane, haber, kitap), TMDB (sinema), Google Books (kapaklar), isteğe bağlı İBB trafik Worker adresi. Anahtarlar tüm işletmeler için ortaktır; her veri bir kez çekilip herkese dağıtılır.
2. APK'yı kendi alan adınızla derleyip `public/app.apk` olarak koyun, `public/apk-version.json`'u güncelleyin.

## Eski sürüm verisini aktarma

Eski tek-işletmeli sürümdeki `data` klasörünü (içinde `db.json` ve `uploads/`) bu makineye kopyalayın, sunucu kapalıyken:

```bash
node tools/import-legacy.js --data /eski/data --name "Örnek İşletme" --user isletme --pass 'guclu-sifre' \
  --plan pro --days 365 --logo /eski/public/logo.png
```

## Android uygulaması (tek APK)

```bash
cd android
./gradlew assembleRelease -PBASE_URL=https://screenpano.com -PAPP_NAME="ScreenPano"
```

- Paket adı `com.screenpano.tv` (değiştirmek için `app/build.gradle` → `applicationId`).
- Release imzası için `android/keystore.properties` oluşturun (dosyadaki açıklamaya bakın). **Anahtarı kaybetmeyin**: güncellemeler aynı anahtarla imzalanmalı.
- Uygulama açılınca `/tv` gelir: kullanıcı adı/şifre ile giriş, ya da TV'deki 6 haneli kodu/QR'ı telefondan panele (Ayarlar → Cihazlar) girerek eşleştirme. Cihaza verilen token uygulamanın kalıcı deposunda saklanır, şifre saklanmaz.
- Eski APK farklı paket adı ve anahtarla imzalandıysa yeni APK üzerine kurulmaz; kutulara ScreenPano APK'sını bir kez kurun. Eski APK kök adresi açarsa sunucu onu `/tv`'ye yönlendirir.
- Simgeler geçici, genel bir TV simgesidir; marka belli olunca `android/app/src/main/res` altındakileri değiştirin.

## Windows uygulaması

Android kutu yerine televizyona bağlı bir Windows bilgisayardan yayın için `desktop/` (Electron). GitHub'da kendiliğinden derlenip Releases'e yüklenir; indirme adresi `/app.exe`. Ayrıntı: `desktop/README.md`.

## Mimari

```
server/
  index.js          sayfalar, statik dosyalar, API'ler, WebSocket
  config.js         ortam ayarları
  store.js          SQLite: tenants, users, screens, devices, settings (Postgres'e geçişte yalnız bu dosya değişir)
  tenants.js        işletme belleği; içerik dokümanı (eski db.json yapısı) tenants.data'da JSON
  auth.js           scrypt şifre, imzalı oturum çerezi, TV bileti, cihaz token'ı, deneme sınırı
  plans.js          paketler, limitler, abonelik durumu
  widgets.js        widget kataloğu, şablonlar, temalar, düzen doğrulama
  feeds.js          paylaşılan veri: maç/puan (ESPN), kur, hava (konum başına), eczane (ilçe başına), haber, kitap, sinema, büyük maç, kutlamalar, trafik
  state.js          bir ekrana giden tam durum (paket kısıtları burada)
  realtime.js       WebSocket: her bağlantı işletme+ekrana bağlı; yayınlar yalnız ilgili işletmeye
  media.js          ffmpeg kuyruğu, kota ölçümü
  routes-*.js       auth, tv, admin (işletme), ext (yeni panel API'leri), super
  s3.js, storage.js R2/S3 istemcisi ve medya depolama katmanı
  backup.js         gece platform yedeği (yerel + R2)
  monitor.js        cihaz durum raporu, çevrimdışı uyarısı, e-posta/webhook
  stats.js          kullanım istatistiği
  social.js         Google yorumları, Instagram
  sched.js          zamanlama kuralları
  legal.js          KVKK, kullanım koşulları, gizlilik sayfaları
public/  tv.html · panel.html + panel.js · login.html · super.html · site.html + site.css · posters.js · sw.js
android/ genel WebView uygulaması
tools/   import-legacy.js · cloudflare-traffic-worker.js
```

## Bilinen eksikler / sıradaki işler

- **Lisanslar (satıştan önce):** maç verisi ESPN'in resmi olmayan API'sinden, sinema TMDB'den (ticari kullanım lisans ister), trafik haritası Yandex ekran görüntüsünden geliyor. Ticari satıştan önce lisanslı kaynağa geçilmeli.
- **Ödeme:** iyzico/PayTR abonelik entegrasyonu yok; paket ve süreler şimdilik süper yönetimden elle yönetiliyor.
- **KVKK metinleri** taslaktır; şirket bilgilerini süper yönetimden girin ve yayından önce avukata kontrol ettirin. VERBİS kaydı gerekip gerekmediğini kontrol edin.
- **Instagram:** Meta, Instagram API kullanımı için uygulama incelemesi isteyebilir; işletmelerin anahtarı kendileri alması gerekir. Google Places API ücretlidir (aylık ücretsiz kotası var).
- **Android 2.1** (ekran görüntüsü) henüz derlenmedi. Derleyip `public/app.apk`'ya koyduktan sonra `public/apk-version.json`'u 11 / 2.1 yapın; önce yapılırsa kutular aynı APK'yı tekrar tekrar güncellemeye çalışır.
- `public/celebrate/*.jpg` görsellerinin telif durumu doğrulanmalı.
