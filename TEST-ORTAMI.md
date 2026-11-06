# Test ortamı ve canlıya alma

İki ortam var, aynı kod tabanından:

| | Canlı | Test |
|---|---|---|
| Dal | `main` | `staging` |
| Adres | screenpano.com | test.screenpano.com |
| Veri | müşterilerin | ayrı (kendi veritabanı ve yüklemeleri) |
| APK | `main` dalındaki `public/app.apk` | `staging` dalındaki `public/app.apk` |

## Günlük akış
1. Her değişiklik **staging** dalına gönderilir (`git push origin HEAD:staging`). Test sunucusu kendiliğinden güncellenir, CI APK'yı derleyip staging'e yazar.
2. Kendi kafenizdeki kutuda menü → **Test ortamına geç** (iki kez basın). Kutu test sunucusuna bağlanır, ekranın köşesinde kırmızı **TEST ORTAMI** etiketi durur. Ekleme/çıkarma, panel, ekran, APK güncellemesi testte denenir.
3. Sorun yoksa **canlıya alın:** GitHub → Actions → **Canlıya al** → Run workflow → `canliya-al` yazın. (Ya da bana "canlıya al" deyin.) Staging, main'e birleşir: **test edilen APK'nın aynısı** canlıya girer, Dokploy canlı sunucuyu günceller, bütün işletmelerin kutuları yeni sürümü alır.
4. Menü → **Canlı ortama dön**.

Acil canlı düzeltmesi gerekirse doğrudan `main`'e gönderilebilir; ardından `staging`'e birleştirin (`git checkout staging && git merge main`).

## Kurallar
- `main`'e doğrudan kod gönderilmez (acil düzeltme dışında): canlıya yalnız "Canlıya al" ile çıkılır.
- Sürüm numarası (`versionCode`) her zaman staging'de artırılır; canlıya aynı numara geçer.
- Test sunucusuna **R2/SMTP/Instagram gibi gerçek dış hizmet anahtarları konmaz** (müşterilere e-posta gitmesin, canlı depoya yazılmasın).
- Test düğmesi yalnız süper yönetimde "Test ortamı düğmesi" işaretlenen işletmelerin ekranında görünür (yalnız Bomera için açın). Test ortamındaki ekranda "Canlı ortama dön" her zaman görünür; test sunucusuna 3 kez ulaşılamazsa kutu kendiliğinden canlıya döner.

## Test sunucusunu kurmak (bir kez, Dokploy)
1. Dokploy → ScreenPano projesi → **Create Service → Application** → ad `screenpano-test`.
2. Provider: GitHub, aynı depo, dal **`staging`**; Build Type: Dockerfile.
3. **Environment:**
```env
APP_ENV=test
PUBLIC_URL=https://test.screenpano.com
SUPER_PASS=<canlıdan FARKLI güçlü bir şifre>
SESSION_SECRET=<canlıdan FARKLI uzun rastgele metin>
BRAND_NAME=ScreenPano Test
TZ_NAME=Europe/Istanbul
PORT=3000
```
   (R2 / SMTP değişkenlerini **eklemeyin**.)
4. **Advanced → Volumes:** ad `screenpano-test-data`, mount `/data` (canlının volume'ünden ayrı!).
5. **Domains:** `test.screenpano.com` → port 3000, HTTPS açık. DNS'te `test` için canlıyla aynı sunucuya A kaydı.
6. Deploy. Sonra `https://test.screenpano.com/super` ile girip bir test işletmesi açın (adı "Bomera Test"), süper yönetimde canlıdaki Bomera için **Test ortamı düğmesi**ni işaretleyin.
7. Kutuda: menü → Test ortamına geç → test işletmesinin kullanıcı adı/şifresiyle TV girişi.
