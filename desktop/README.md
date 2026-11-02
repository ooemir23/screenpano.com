# ScreenPano Windows uygulaması

Android TV kutusu yerine, televizyona bağlı bir Windows bilgisayardan yayın yapmak için. Sunucudaki `/tv` sayfasını (Android uygulamasıyla aynı) tam ekran açar.

- **Ekran seçimi:** bilgisayara harici ekran (televizyon) bağlıysa yayın orada açılır, bilgisayar kullanılmaya devam eder. Görev çubuğundaki simgeden ekran değiştirilebilir; televizyon takılıp çıkarılınca pencere kendiliğinden yer değiştirir.
- **Kesintisiz:** ekran uykuya geçmez, bilgisayar açılınca başlar, sayfa çökerse ya da bağlantı giderse yeniden dener; çevrimdışı önbellek Android'dekiyle aynı.
- **Panelle uyumlu:** cihaz anahtarı saklanır (şifre değil), panelden ekran görüntüsü alınabilir, durum raporunda "Windows" sürümü görünür.
- **Kısayollar:** Esc ya da Menü tuşu TV menüsü · F11 tam ekran · Ctrl+R yenile · Ctrl+Shift+Q çıkış.
- **Ayarlar:** `%APPDATA%\ScreenPano\ayarlar.json` (`url`, `display`, `autostart`). Başka sunucu için `ScreenPano.exe --url=https://alanadiniz.com`.

## Sürüm çıkarma

1. `desktop/package.json` içindeki `version`ı artırın (örn. 1.0.1) ve main'e gönderin.
2. **Windows uygulaması** iş akışı (`.github/workflows/desktop.yml`) Windows makinede derler, GitHub Releases'e `ScreenPano-Setup.exe` ve güncelleme dosyalarını yükler.
3. Kurulu uygulamalar yeni sürümü 6 saatte bir denetler, indirir ve gece 04:00'te kurar (TV menüsünden "Güncellemeleri denetle" ile hemen).

İndirme adresi: `https://screenpano.com/app.exe` (son sürüme yönlendirir; `DESKTOP_URL` ile değiştirilebilir).

Not: Kurulum dosyası kod imzalı değil; Windows SmartScreen ilk kurulumda "Bilinmeyen yayımcı" uyarısı gösterir ("Ek bilgi → Yine de çalıştır"). Uyarıyı kaldırmak için bir kod imzalama sertifikası alınıp iş akışına eklenmelidir.

## Yerelde

```bash
cd desktop && npm install
npm start -- --url=http://localhost:3000
```
