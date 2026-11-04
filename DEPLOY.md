# Dokploy'a kurulum

Bu proje Dokploy'da **Dockerfile** ile tek bir uygulama olarak çalışır. Dokploy, alan adı ve HTTPS'i (Let's Encrypt) kendisi yönetir. Uygulama konteynerin içinde 3000 portunu dinler; dışarıya port açmanız gerekmez, Dokploy'un Traefik'i yönlendirir.

## 0. Önce güvenlik

- Dokploy panel şifrenizi yazışmalarda paylaştıysanız **hemen değiştirin** (Dokploy → Profil).
- SSH'ta şifreyle girişi kapatıp anahtarla girişe geçmeniz önerilir.
- Dokploy panelini (`:3000`) bir alan adına bağlayıp HTTPS ile kullanın.

## 1. Sunucu yeterli mi?

Sunucuda çalıştırın:

```bash
nproc; free -h; df -h /
```

| Kaynak | En az | Önerilen |
| --- | --- | --- |
| CPU | 2 çekirdek | 2–4 çekirdek |
| RAM | 2 GB (Dokploy'un kendi alt sınırı) | 4 GB (video küçültme için) |
| Boş disk | 30 GB | 60 GB ve üstü (müşteri videoları burada durur) |

Docker imajı yaklaşık 1,5 GB tutar (ffmpeg ve Chromium dahil).

## 2. Kodu Dokploy'a verin

İki yol var:

**A) GitHub (önerilir; güncellemeler tek tıkla gelir)**
1. Proje klasörünü özel (private) bir GitHub deposuna yükleyin: `git init && git add . && git commit -m ilk && git push`.
2. Dokploy → Settings → Git → GitHub'ı bağlayın.

**B) Zip ile yükleme**
`screenpano-deploy.zip` dosyasını kullanın (Dokploy'da kaynak türü olarak "Drop" seçeneği varsa zip'i oraya bırakın).

## 3. Uygulamayı oluşturun

1. Dokploy → **Projects → Create Project** → ad: `ScreenPano`.
2. Proje içinde **Create Service → Application**.
3. **Provider**: GitHub (depo ve `main` dalı) ya da Drop (zip).
4. **Build Type**: `Dockerfile`, Dockerfile yolu: `./Dockerfile`.
5. **Environment** sekmesine şunları girin (değerleri kendinize göre değiştirin):

```env
SUPER_PASS=en-az-12-karakterli-guclu-bir-sifre
SESSION_SECRET=buraya-uzun-rastgele-bir-metin-yazin
BRAND_NAME=ScreenPano
TZ_NAME=Europe/Istanbul
PORT=3000
```

İsteğe bağlı (önerilir):

```env
PUBLIC_URL=https://screenpano.com
# Cloudflare R2: medya ve gece yedekleri için
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=screenpano-media
# R2_PUBLIC_URL=https://media.screenpano.com   (kovayı alan adına bağladıysanız)
# Çevrimdışı uyarı e-postaları
# Natro kurumsal e-posta: önce 465 (SSL); sunucunuz 465'i engelliyorsa uygulama 587'yi kendisi dener.
# Natro 587'de STARTTLS desteklemez; 587'yi doğrudan kullanacaksanız SMTP_PORT=587 ve SMTP_STARTTLS=false yazın.
SMTP_HOST=mail.kurumsaleposta.com
SMTP_PORT=465
SMTP_USER=bildirim@screenpano.com
SMTP_PASS=...
SMTP_FROM=ScreenPano <bildirim@screenpano.com>
```

**R2 kurulumu:** Cloudflare → R2 → kova oluşturun → "Manage R2 API Tokens" ile yalnız o kovaya *Object Read & Write* yetkili bir anahtar üretin. Mevcut medya dosyaları ilk açılıştan sonra arka planda R2'ye taşınır; süper yönetimde "Yedekler ve depolama" kartından ilerlemeyi görürsünüz. `R2_PUBLIC_URL` kullanacaksanız kovanın CORS ayarına `GET` için `https://screenpano.com` kaynağını ekleyin (TV'nin çevrimdışı önbelleği için).

`SESSION_SECRET` için sunucuda `openssl rand -hex 32` çıktısını kullanabilirsiniz. `SUPER_PASS` yalnızca ilk açılışta süper yöneticiyi oluştururken kullanılır.

6. **Advanced → Volumes (Mounts)** → **Volume Mount** ekleyin:
   - Volume adı: `screenpano-data`
   - Mount path: `/data`

   **Bu adımı atlamayın**: veritabanı, müşteri videoları ve yedekler `/data`'dadır. Volume yoksa her yeniden yüklemede hepsi silinir.

7. **Domains** sekmesi → **Add Domain**:
   - Host: alan adınız (örn. `screenpano.com` ya da `app.screenpano.com`). Alan adınız yoksa Dokploy'un verdiği test adresini kullanabilirsiniz.
   - Container Port: `3000`
   - HTTPS: açık, Certificate: Let's Encrypt
   - Alan adınızın DNS'inde bir **A kaydı** oluşturup sunucu IP'nize yönlendirin.

8. **Deploy**'a basın. Logs sekmesinde `ScreenPano çalışıyor: http://localhost:3000` satırını görünce hazırdır.

## 4. İlk giriş

1. `https://alanadiniz/login` → kullanıcı `admin`, şifre `SUPER_PASS`.
2. Süper yönetim → **Platform anahtarları**: CollectAPI, TMDB, Google Books (ve varsa İBB trafik Worker adresi).
3. Sağ üstten şifrenizi değiştirin.

## 5. Eski verileri aktarma

Eski tek işletmeli sürümdeki `data` klasörünü (içinde `db.json` ve `uploads/`) yeni sunucuya kopyalayın, sonra konteynerin içine alıp aktarın:

```bash
# konteyner adını bulun
docker ps --format '{{.Names}}' | grep -i screenpano
# eski veriyi konteynere kopyalayın
docker cp /root/eski-data <konteyner-adi>:/data/legacy
# aktarın
docker exec -it <konteyner-adi> node tools/import-legacy.js --data /data/legacy \
  --name "Örnek İşletme" --user isletme --pass 'guclu-sifre' --plan pro --days 365
```

Logo için: önce logoyu da `/data/legacy/logo.png` olarak kopyalayıp komuta `--logo /data/legacy/logo.png` ekleyin. Aktarımdan sonra uygulamayı Dokploy'dan bir kez **Restart** edin.

## 6. Android uygulaması

APK'yı kendi alan adınızla derleyin:

```bash
cd android
./gradlew assembleRelease -PBASE_URL=https://alanadiniz -PAPP_NAME="ScreenPano"
```

Depodaki `public/app.apk` zaten `https://screenpano.com` adresine göre derlenmiştir; farklı bir alan adı kullanacaksanız yukarıdaki komutla yeniden derleyip `public/app.apk` dosyasını değiştirin. Sürüm yükselttiğinizde `public/apk-version.json`'u da güncelleyin.

## Güncelleme ve yedek

- **Güncelleme:** GitHub'a push yeter; depodaki webhook Dokploy'a (`https://panel.screenpano.com/api/deploy/…`) haber verir ve uygulama kendiliğinden yeniden derlenir. `/data` volume'ü korunur.
- **Yedek:** Uygulama her gece tüm veritabanını `/data/backups/platform-*.db.gz` olarak yedekler (14 gün) ve R2 ayarlıysa R2'ye de gönderir (60 gün). Süper yönetimden elle yedek alıp indirebilirsiniz. R2 kullanmıyorsanız medya da diskte durur; Dokploy → Volume Backups ile `screenpano-data` volume'ünü dışarıya yedekleyin.
- **Geri yükleme:** uygulamayı durdurun, yedeği açın (`gunzip platform-....db.gz`), `/data/platform.db` dosyasının yerine koyun (`platform.db-wal` ve `platform.db-shm` dosyalarını silin), uygulamayı başlatın.

## İlk ayarlar (süper yönetim)

- **Yasal bilgiler:** şirket unvanı, adres, MERSİS, KVKK e-postası. `/kvkk`, `/kosullar`, `/gizlilik` sayfalarında görünür. Metinler taslaktır; avukata kontrol ettirin.
- **Tanıtım sitesi:** paket fiyatları, WhatsApp, telefon ve e-posta.
- **Google Places API anahtarı:** Google Cloud'da "Places API (New)" açık bir anahtar. İşletmeler panelde Duyurular → Google yorumları bölümünden kendi işletmelerini arayıp seçer.
- **Uyarı webhook'u:** çevrimdışı kalan kutular için size bildirim (Slack, Discord vb.).

## Android 2.4 (native video)

`public/app.apk` sürüm 14 / 2.4'tür: Kotlin + ExoPlayer hibrit — arayüz web sayfası ama videolar native ExoPlayer'da donanımdan oynar; `apk-version.json` 14'dür, 2.1 kurulu kutular üstüne güncellenir. **İmza anahtarını (`screenpano.keystore`) ve şifresini güvenli bir yerde saklayın**; kaybolursa kutulara APK'yı baştan kurmak gerekir.
