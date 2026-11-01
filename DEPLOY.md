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

- **Güncelleme:** GitHub'a push → Dokploy'da Deploy (ya da otomatik deploy'u açın). `/data` volume'ü korunur.
- **Yedek:** Uygulama her işletmenin ayarlarını her gün yedekler ama bunlar da aynı diskte durur. Dokploy → Volume Backups ile `screenpano-data` volume'ünü düzenli olarak dışarıya (S3/R2) yedekleyin.
