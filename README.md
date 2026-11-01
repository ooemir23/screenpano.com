# ScreenPano — kafeler için dijital ekran platformu

BomeraTV'nin çok işletmeli (SaaS) sürümü. Tek sunucu, tek APK: her işletme kendi kullanıcı adı ve şifresiyle girer; medyasını, düzenini, renklerini ve logosunu yönetir.

Mekânda **tek Android kutu** yeterli: kutu HDMI dağıtıcıyla tüm TV'lere aynı görüntüyü verir. Bu yüzden her işletmenin tek bir ekran düzeni vardır; paketler kutu (cihaz) sayısıyla sınırlanır.

> Ürün adı ScreenPano'dur (`screenpano.com`); `BRAND_NAME` ortam değişkeni ve APK'da `-PAPP_NAME` ile değiştirilebilir.

## Neler var

| Bölüm | Adres | Kim kullanır |
| --- | --- | --- |
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
| Ayarlar | İşletme ve şehir · Cihazlar (kodla bağlama, kaldırma) · Kullanıcılar · Paket · Yedekler |

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
| `ALLOW_SIGNUP` | true | `false` ise yalnız süper yönetim işletme açar |
| `TRIAL_DAYS` | 14 | |
| `SESSION_SECRET` | (otomatik) | Verilmezse veritabanında üretilir |
| `FFMPEG_PATH`, `CHROMIUM_PATH` | ffmpeg, chromium | Medya optimizasyonu ve trafik haritası |

Docker: `docker build -t screenpano . && docker run -p 3000:3000 -v /srv/screenpano:/data -e SUPER_PASS=... screenpano`. HTTPS için önüne Caddy/Nginx koyun (sunucu `X-Forwarded-*` başlıklarına güvenir).

## İlk kurulum adımları

1. `/super` → **Platform anahtarları**: CollectAPI (eczane, haber, kitap), TMDB (sinema), Google Books (kapaklar), isteğe bağlı İBB trafik Worker adresi. Anahtarlar tüm işletmeler için ortaktır; her veri bir kez çekilip herkese dağıtılır.
2. Bomera'yı ilk işletme olarak aktarın (aşağıda).
3. APK'yı kendi alan adınızla derleyip `public/app.apk` olarak koyun, `public/apk-version.json`'u güncelleyin.

## Bomera verisini aktarma

Eski sunucudaki `data` klasörünü (içinde `db.json` ve `uploads/`) bu makineye kopyalayın, sunucu kapalıyken:

```bash
node tools/import-legacy.js --data /eski/data --name "Bomera Lounge" --user bomera --pass 'guclu-sifre' \
  --plan pro --days 365 --logo /eski/public/logo.png
```

Videolar, fotoğraflar, yorumlar, doğum günleri, QR'lar, kampanyalar, lig seçimi ve kutlama ayarları taşınır. Eski panelde girilmiş API anahtarları ve trafik Worker imza anahtarı, platform ayarı boşsa oraya aktarılır (mevcut Cloudflare Worker çalışmaya devam eder).

## Android uygulaması (tek APK)

```bash
cd android
./gradlew assembleRelease -PBASE_URL=https://app.screenpano.com -PAPP_NAME="ScreenPano"
```

- Paket adı `com.screenpano.tv` (değiştirmek için `app/build.gradle` → `applicationId`).
- Release imzası için `android/keystore.properties` oluşturun (dosyadaki açıklamaya bakın). **Anahtarı kaybetmeyin**: güncellemeler aynı anahtarla imzalanmalı.
- Uygulama açılınca `/tv` gelir: kullanıcı adı/şifre ile giriş, ya da TV'deki 6 haneli kodu/QR'ı telefondan panele (Ayarlar → Cihazlar) girerek eşleştirme. Cihaza verilen token uygulamanın kalıcı deposunda saklanır, şifre saklanmaz.
- Eski Bomera APK'sı farklı paket adı ve debug anahtarıyla imzalı olduğu için yeni APK üzerine kurulmaz; kutulara yeni APK'yı bir kez elle kurun (eski uygulamayı kaldırabilirsiniz). Eski APK kök adresi açarsa sunucu onu `/tv`'ye yönlendirir.
- Simgeler geçici, genel bir TV simgesidir; marka belli olunca `android/app/src/main/res` altındakileri değiştirin.

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
  routes-*.js       auth, tv, admin (işletme), super
public/  tv.html · panel.html + panel.js · login.html · super.html
android/ genel WebView uygulaması
tools/   import-legacy.js · cloudflare-traffic-worker.js
```

## Bilinen eksikler / sıradaki işler

- **Lisanslar (satıştan önce):** maç verisi ESPN'in resmi olmayan API'sinden, sinema TMDB'den (ticari kullanım lisans ister), trafik haritası Yandex ekran görüntüsünden geliyor. Ticari satıştan önce lisanslı kaynağa geçilmeli.
- **Ödeme:** iyzico/PayTR abonelik entegrasyonu yok; paket ve süreler şimdilik süper yönetimden elle yönetiliyor.
- **Medya depolama:** işletme klasörlerinde yerel disk. Ölçek büyüyünce Cloudflare R2/S3'e taşınmalı.
- **KVKK:** doğum günü isimleri ve yorumcu adları kişisel veri; hizmet sözleşmesi ve aydınlatma metni gerekli.
- `public/celebrate/*.jpg` görsellerinin telif durumu doğrulanmalı.
