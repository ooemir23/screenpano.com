# ScreenPano — Uçtan Uca Test ve Analiz Raporu

**Tarih:** 6 Kasım 2026 · **Kapsak:** Kod (sunucu + web + Android + Electron), APK, yapı/CI
**Yöntem:** Piramit testi — statik analiz → entegrasyon → uçtan uca (E2E) → yük. **Hiçbir kaynak dosya değiştirilmedi**; testler izole veri dizininde (`/tmp/sp-test`), ayrı portta (3987) koşan gerçek sunucu üzerinde yapıldı. Çalışma ağacı test öncesi ve sonrası aynı.

---

## ⭐ EK — Doğrulama ve Revizyon (6 Kasım, gün sonu)

İşletme sahibi bulguları güncel kodla karşılaştırdı; yerel kopya **3.1 (22)**'de kaldığı için Android tarafı eski snapshot'a dayanıyordu. Yerel depo **origin/main'e senkronlandı** (son durum: **3.19.2 / code 71**, `728c1da`); **A grubu** commit `0bd57e8`'de, **B grubu** `72bf4c8`→`3c406c1` (3.19.0–3.19.2) arasında uygulandı — ikisi de aşağıda bağımsız kod incelemesi ve canlı testlerle doğrulandı.

### Sahip düzeltmeleriyle geçersizlenen / revize edilen bulgular

| Özgün bulgu | Durum |
|---|---|
| TvWebSocket + TvState "kullanılmıyor" (K-Android) | **Geçersiz** — güncel kodda yerel kanalın kendisi bunlar (`MainActivity.kt:132`) |
| APK 3.1 (22) | **Eski bilgi** — güncel 3.18.9 (68) |
| "Abonelik bitince ExoPlayer durmuyor" (Y4) | **Yerel medya yolunda geçerli değil** — motor kendini durduruyor |
| "Süresiz video 45 sn'de bir başa sarar" | **Kalktı** — sunucu artık video süresini ölçüyor (`server/vidlen.js`) |
| sw.js Range→RAM (K4) | **Kapsam daraltıldı** — APK'da videolar service worker'a girmiyor; yalnız web TV'ler (Tizen/webOS/PC) ve eski APK'lar için geçerli |

### A grubu (sunucu) — `0bd57e8` uygulamasının canlı doğrulaması

| Madde | Kod | Canlı test sonucu |
|---|---|---|
| SVG→PNG + `/u/` CSP | ✓ (`routes-admin.js:43` svgToPng; `index.js` CSP sandbox) | ✓ Kötücül SVG → `.png` döndü (`\x89PNG` imzası, `onload` yok); `/u/` yanıtında `CSP: default-src 'none' … sandbox` + nosniff; bozuk SVG net hata ile reddedildi (`/logo` ve `/assets` uçlarında) |
| Spotify refreshToken | ✓ (`state.js` tvMusic) | Kod düzeyinde yeterli |
| SIGTERM'de veri kaybı | ✓ flushAll + WAL checkpoint + 3 sn tavan | ✓ Kayıt sonrası anında SIGTERM → yeniden başlatmada kiracı ve oturum ayakta; log: "kapanıyor, bekleyen kayıtlar yazılıyor" |
| R2 akış hataları | ✓ `body.on('error')` + proxy `up.on('error')` + unhandledRejection yakalayıcı | Kod düzeyinde |
| Giriş sınırı + async scrypt | ✓ varsayılan AÇIK (8 deneme/10 dk; `off` ile kapatılır) | ✓ 9. hatalı denemede 429; kayıt akışı da aynı IP sayacına bağlı |
| Kiracı başına bir kez durum | ✓ flush'ta kiracı-başına önbellek (yerel/sayfa varyantlı) + apk-version 30 sn önbellek | ✓ 20 WS istemcisine yayın 20/20, her biri tam 2 state (ilk + yayın), boştayken 0 gereksiz mesaj |
| /health, hata ara katmanı | ✓ | ✓ `{"ok":true,"up":4}` |
| Bonus: `trust proxy 1`, site-shots.yml env geçişi | ✓ | — |
| Duman E2E (yeni kod) | — | ✓ Site/giriş/panel/süper + TV eşleştirme 6/6; konsol hatası 0 |

### B grubu — TAMAMLANDI (3.19.0–3.19.2) ve bağımsız olarak doğrulandı

İşletme sahibinin değerlendirme tablosundaki tüm B maddeleri `72bf4c8`→`3c406c1` (3.19.0→3.19.2, code 71) arasında uygulandı; her madde güncel kodda kanıtlandı:

| Madde | Sürüm | Kod kanıtı (bağımsız doğrulama) |
|---|---|---|
| tv.html WS: korumalı ayrıştırma | 3.19.0 | `tv.html:3020` — `try { JSON.parse } catch { return }` ✓ |
| tv.html WS: artan+saçılmalı yeniden bağlanma | 3.19.0 | `tv.html:2984` — 3 sn × 2^n, 30 sn tavan, ×(0.7–1.3) saçılma ✓ |
| tv.html WS: 90 sn sessizlik watchdog'u | 3.19.0 | `tv.html:3002-3009` — 15 sn'de bir kontrol, 40 sn'de uygulama katmanı `ping`; **sunucu pong yanıtı `realtime.js:123`'te canlı testle doğrulandı** (version, state, pong) ✓ |
| Tek bağlantı (çift WS kaldırıldı) | 3.19.1 | `tv.html:2991-2998` — APK'da sayfa kendi WS'ini açmaz, `N.wsAttach/wsSend` köprüsü + `__wsIn/__wsEvt`; `MainActivity.kt:174` ham ileti aktarımı, `:791` sayfa yüklenince son version/state/sync yeniden oynatma ✓ |
| Snapshot JPEG/Base64 ana iş parçacığı dışında | 3.19.0 | `MainActivity.kt:819-880` — köprü iş parçacığında (kaynak yorumu bunu belgeliyor); PixelCopy asenkron ✓ |
| Android 5 reload döngüsü | 3.19.0 | `MainActivity.kt:306-310` — deprecated overload artık `failingUrl != view.url` ise yükleme yapıyor ✓ |
| Android 10+ açılış izni | 3.19.0 | `Manifest:9` SYSTEM_ALERT_WINDOW; `MainActivity.kt:133-139` API ≥29'da `canDrawOverlays` yoksa eşleştirme ekranında bir kez izin sorulur; `:883` `bootStatus()` panelde "izin-yok" raporlar ✓ |
| BootReceiver action kontrolü | 3.19.0 | `BootReceiver.kt:14` — `intent.action ?: return` ✓ |
| onResume koşullu oynatma + yatay sabit | 3.19.0 | `MainActivity.kt:1009-1020` — `playOnResume` bayrağı; `Manifest:28` `screenOrientation="landscape"` ✓ |
| R8 küçültme | 3.19.2 | `build.gradle:46` `minifyEnabled true` + optimize kuralları; **APK 6,9 MB → 2,4 MB** (depodaki `app.apk` ölçüldü; işletme raporu 2,5 MB) ✓ |

Canlı duman testi (3.19.2, izole sunucu): `/health` ✓, eşleştirme E2E 6/6 (kod gösterimi → panel onayı → token → WS → yeniden yüklemede kalıcı), TV konsol hatası 0.

### İşletme notları (rapora alındı)
- **Sürüm disiplini:** paralel oturum PR #1 aynı anda 3.18.9 (68) çıkarınca sürüm çakışması oluştu; 3.19.1 (70) ile düzeltildi. Sürüm atlatmadan önce `git pull`.
- **Box R hâlâ 3.18.8'de:** APK güncellemesi sessiz kurulamıyor (kurulum onayı ister) — menüden "Güncelle" ile kurulmalı.
- **WZONE'da açılış izni yok:** kutuda Ayarlar → Uygulamalar → ScreenPano → "Diğer uygulamaların üzerinde göster" elle açılmalı (panel artık "izin-yok" olarak görüyor).
- **"500 ms'de bir O(N·T) tarama" (Gemini/GLM bulgusu):** abartılı — gönderim kiracı başına 4 sn'de bir. Not: `realtime.js:108` döngüsü hâlâ her 500 ms'de kirıcı başına `mediaList`'i yeniden hesaplıyor (CPU, kutuya etkisi yok); sunucu tarafı mikro-optimizasyon olarak düşük öncelikte duruyor.

### Bilerek yapılmayanlar (C grubu — kabul)
Kiracı JSON'unun tablolara bölünmesi ve kiracı-haritalı WS yeniden yapısı (büyük iş, kutuya etkisi yok) · otomatik test altyapısı (önce sched/plans birim testleri) · site geneli CSP (tv.html satır içi betikleri kırar; yalnız `/u/`'ye kondu) · sw.js Range akışı (web TV'lerde ölçüm yapılınca) · shrinkResources (kaynak adıyla erişim riski).

### Diğer gözlemler
- **"Altın/BIST alınamadı"** (güncel kodda da çıkıyor): kaynak `finans.truncgil.com/v4/today.json` şu an sağlam dönerken hata mesajı dosya sonuna yakın konumda → **upstream aralıklı kesik yanıt**. Hata yakalanıyor, önbellekteki değer korunuyor, sonraki döngü düzeltiyor: düşük önem, gerekirse tek retry.
- Senkron esnasında eski taslaklar (`TvState.kt`, `TvWebSocket.kt`, `PairResponse.kt`) `/tmp/sp-test/local-draft-backup/`'e yedeklendi; `PairResponse.kt` güncel kodda kullanılmıyor (`qrSvg` alanı hâlâ eski sözleşme).
- C grubu kararlaştırıldı: veritabanı/WS yeniden yapılandırma yapılmayacak; CSP yalnız `/u/` için (site geneline değil); test altyapısı performansla ilgisiz.

---

---

## 1. Yönetici Özeti

Çekirdek mimari sağlam: SQL enjeksiyonu yok, işletme izolasyonu doğru çalışıyor, cihaz/paket limitleri uygulanıyor, eşleştirme akışı uçtan uca kusursuz, WebSocket yayını 30 istemcide sorunsuz, bellek stabil. Bununla birlikte **4 canlı doğrulanmış KRİTİK sorun** ve üzerinde durulması gereken 10 YÜKSEK bulgu çıktı. En acili: SVG ile saklı XSS (kendi hesabımcanlı doğruladım), R2 yükleme akışında çökme riski, kapatmada veri kaybı ve TV kutularında service worker'ın videoları RAM'e alması.

**Test sonuç sayıları:**

| Katman | Test | Sonuç |
|---|---|---|
| Statik sözdizimi (`node --check`) | 100+ JS dosyası | ✅ 0 hata |
| HTTP entegrasyon (curl) | 33 | 29 geçti; 3'ü test betiği hatası, **1'i gerçek bulgu** (hız sınırı kapalı) |
| WebSocket protokol | 7 | ✅ 7/7 |
| Tarayıcı E2E (Chromium) | 16 | ✅ 16/16 (ilk koşudaki 5 başarısızlık cihaz limiti doğrulaması çıktı) |
| Yük: 30 eşzamanlı TV istemcisi | yayın + 10sn boşta | ✅ 30/30 yayın, 0 gereksiz mesaj |
| APK statik analiz (aapt) | sürüm/izin/manifest | ✅ tutarlı |
| Bellek/yanıt süresi | 9 dk çalışma sonrası | ✅ 124 MB RSS, 1–4 ms |

---

## 2. Test Piramidi — Katman Katman Sonuçlar

### Katman 1 — Statik analiz (taban)
- Tüm `server/`, `public/`, `desktop/`, `tools/` JS dosyaları sözdizimi temiz.
- 4 paralel derin inceleme: sunucu (34 dosya), tarayıcı tarafı (tv.html 3680 satır dahil), Android (tüm Kotlin + manifest + gradle), altyapı (CI/Docker/Electron/deploy).

### Katman 2 — Derleme
- **Sunucu:** izole örnekte ilk denemede ayağa kalktı (`better-sqlite3`, `sharp` vb. yerel modüller sorunsuz).
- **Android:** sistemde Java/JDK bulunmadığından Gradle derlemesi **koşulamadı** (sınırlık, hata değil). Telafi: CI'daki derleme zaten çalışıyor (son commit `669e024` APK üretmiş) ve APK statik analizle doğrulandı:
  - `aapt`: `versionCode=22 versionName=3.1` = `apk-version.json` = `build.gradle` → **üçlü tutarlı** ✅
  - İzinler makul (INTERNET, NETWORK_STATE, BOOT, REQUEST_INSTALL_PACKAGES=self-güncelleme); Activity `singleTask` + landscape kilit + `configChanges` doğru; boot alıcısı `exported=true` (gerekli), provider `exported=false`.

### Katman 3 — HTTP entegrasyon (33 test)
Herkese açık sayfalar, robots/sitemap, KVKK sayfası, sürüm pişirme (`__pageBuild` yalnız tv.html'de), güvenlik başlıkları, kayıt akışı (mükerrer kullanıcı adı 400, geçersiz e-posta 400), oturum (çıkış sonrası 302), TV girişi, eşleştirme başlangıcı, sahte pid 404 — hepsi doğru.
Gerçek bulgu: **8 hatalı girişten sonra da 401 geldi, 429 hiç gelmedi** → hız sınırı varsayılan kapalı (bkz. B5).

### Katman 4 — WebSocket protokol (7/7 + yük)
- Token'sız/sahte token/oturumsuz preview bağlantıları doğru reddediliyor; gerçek cihaz tokenıyla `version` + `state` geliyor; bozuk JSON, bilinmeyen tip, >900KB paket sessizce yutuluyor; bağlantı açık kalıyor.
- **30 istemci** (aynı token, izinli) → tema değişikliği **30/30 istemciye ulaştı** (250 ms toplu yayın çalışıyor); 10 sn boşta 0 gereksiz mesaj; bellek 124→128 MB stabil.

### Katman 5 — Tarayıcı E2E (Chromium, gerçek tıklamalar)
- Tanıtım sitesi + 4 dil: render ✅, konsol hatası 0 ✅
- Gerçek form doldurma ile giriş → `/panel` ✅; panel 46KB dolu render, JS hatasız ✅
- Süper yönetici girişi → `/super` ✅ JS hatasız ✅
- **Tam eşleştirme akışı (temiz kiracıyla 6/6):** TV 6 haneli kodu gösteriyor (`392 943`) → panel API onayı 200 → TV token aldı, giriş ekranı kapandı → token localStorage'da → WS `readyState=1` → sayfa yenilenince otomatik giriş. Konsol hatası 0. Service worker kaydı ✅.
- Not: ilk denemede eşleştirme 400 dönmüştü — sebebi **cihaz limitinin doğru uygulanması**mış (deneme paketi 2 cihaz dolmuş, hata mesajı anlaşılır ve doğru).

### Katman 6 — Performans ölçümleri
| Metrik | Ölçüm | Yorum |
|---|---|---|
| RSS (9 dk, 3 kiracı, 30+ WS) | 124–128 MB | ✅ normal |
| CPU boştayken | %0,5 | ✅ |
| `/` | 3,1 ms | ✅ |
| `/tv` (3680 satırlık sayfa + sürüm pişirme) | 4,2 ms | ✅ |
| `/login` | 1,7 ms | ✅ |
| 30 istemciye state yayın gecikmesi | ≤3 sn içinde hepsi | ✅ (250ms batch) |

---

## 3. Bulgular

### 🔴 KRİTİK

**K1. SVG ile saklı XSS — CANLI DOĞRULANDI**
`/api/admin/assets` (ve logo/poster görsel uçları) `.svg` kabul ediyor; dosya `/u/:tid/:file` üzerinden **ham ve `image/svg+xml` ile** herkese açık servis ediliyor. Test: `onload="fetch('/api/admin/state')..."` içeren SVG yükledim → yükleme `{"ok":true}`, servis edilen gövdede handler aynen duruyor. Sitede **CSP ve X-Frame-Options başlığı hiç yok** (canlı doğrulandı).
Sömürü: işletme hesabı olan biri kötücül SVG yükleyip bağlantıyı başka kullanıcıya/süper yönetime açtırır → kurbanın HttpOnly oturum çereziyle aynı origin'de panel API'si çağrılabilir → hesap devralma, işletmeler arası erişim.
Yer: `server/routes-admin.js:160,179` (kabul), `server/storage.js:12,59` (servis), `server/index.js` (başlık yok).
Öneri: SVG yüklemeyi kaldır ya da sunucuda sanitize et (script/foreignObject/`on*` attribute soy); `/u/`'de `Content-Security-Policy: default-src 'none'` + `Content-Disposition: attachment`; site geneline CSP ekle.

**K2. R2 yükleme stream'inde dinleyicisiz 'error' → tüm sunucu çöker**
`server/s3.js:81,86`: `putFile` `fs.createReadStream(file)`'i `body.pipe(rq)` ile bağlıyor; kaynak stream'de hata olursa (dosya bu arada silinir/disk hatası) promise reject olmaz, dinleyicisiz error olayı exception fırlatır → process ölür. `storage.syncTick` ve gecelik yedek bu yolu kullanıyor.
Öneri: `const rs = fs.createReadStream(f); rs.on('error', reject); rs.pipe(rq);` + `process.on('unhandledRejection')` yakalayıcısı.

**K3. Graceful shutdown yok — kapatmada veri kaybı**
`server/tenants.js:62-73`: değişiklikler 200ms debounce'la yazılıyor, yalnız `process.on('exit')` var. SIGTERM (`docker stop`, systemctl, deploy) 'exit' tetiklemez → son değişiklikler + WAL'deki veri kaybolur.
Öneri: SIGTERM/SIGINT yakala → tüm kiracılar `saveNow()` → `wal_checkpoint(TRUNCATE)` → `server.close()` + WS kapat → çık.

**K4. Service worker Range isteği tüm videoyu RAM'e alıyor (kutularda OOM)**
`public/sw.js:50-58`: her Range isteğinde `await resp.blob()` — videonun tamamı belleğe iner; Chrome seek'de 2-3 paralel Range açar → 500MB videoda 0,5–1,5GB anlık RAM, 1-2GB'lık TV kutusunda WebView çökmesi. Yorumdaki "belleğe yüklemez" iddiası yanlış (`slice()` ucuz, `blob()` değil).
Öneri: `resp.body.getReader()` ile offset'e akıtıp yalnız aralığı oku; büyük dosyaları önbellekten servis etme.

### 🟠 YÜKSEK

**Y1. Giriş/kayıt hız sınırı varsayılan KAPALI — canlı doğrulandı** (`server/auth.js:75-78`)
`LOGIN_LIMIT=on` verilmedikçe `tooMany()` hep false; 8 hatalı denemeden sonra bile 429 yok. Kullanıcıya gösterilen "10 dakika sonra deneyin" mesajı asla tetiklenmiyor. Panel + TV girişi + kayıt sınırsız → scryptSync ile brute force hem mümkün hem CPU yakıcı. **Öneri: varsayılanı açık yap.**

**Y2. Android 5.x kutularda sonsuz 15 sn'lik reload döngüsü** (`MainActivity.kt:201-205`)
Eski `onReceivedError` overload'u API 21-22'de ana çerçeve DIŞI kaynak hatalarını da alır; `isForMainFrame` kontrolü yok → tek 404 görsel → 15 sn'de bir tam sayfa yeniden yükleme → sonsuz yanıp sönme. Öneri: `failingUrl == view?.url` karşılaştırması ekle.

**Y3. Geniş kapsamlı cleartext izni** (`AndroidManifest.xml:20`)
`usesCleartextTraffic="true"` tüm host'lara HTTP açar; `BASE_URL` http verilebilir. Öneri: `networkSecurityConfig` ile yalnız gereken host'a aç.

**Y4. Abonelik bitince native ExoPlayer durmuyor** (`public/tv.html:2625-2631`)
`setBlocked` web video/audio duraklatıyor ama `exoStop()`/`releaseWebVideos()` çağırmıyor → APK'lı kutuda süresi bitmiş ekran günlerce GPU/CPU yakar. Öneri: blok başlarken Exo'yu da durdur.

**Y5. TV WebSocket istemcisi kırılgan** (`public/tv.html:2889-2917`)
`JSON.parse` korumasız (tek bozuk kare handler'ı düşürür), sabit 3sn yeniden bağlanma (üstel backoff/jitter yok — sunucu restartında tüm kutular aynı anda saldırır), half-open bağlantı için watchdog yok (kutu sonsuza dek "çevrimiçi" sanır). Öneri: try/catch + 3→30sn üstel backoff + 90sn mesaj watchdog'u.

**Y6. Spotify refreshToken TV'ye sızıyor** (`server/state.js:162`)
`publicState` tüm `db.music` nesnesini WS `state` ile TV kutularına gönderiyor; `/api/admin/db` dikkatle ayıklarken (`refreshToken: undefined`) publicState ayıklamıyor. Kutular mekânda fiziksel erişime açık. Öneri: publicState'te `music.spotify`'yı tamamen çıkar.

**Y7. MEDIA önbelleği kotasız; kota aşımı SHELL'i de silebilir** (`public/sw.js:76-100`)
Ön yükleme tüm oynatma listesini (300'e kadar URL) sınır olmadan cache'liyor; `estimate()` okunuyor ama eşik uygulanmıyor; kota taşınca tarayıcı SHELL dahil veriyi evict edebilir → elektrik kesintisi sonrası çevrimdışı açılış siyah ekran. Öneri: byte sınırı (ör. 1,5GB) + `storage.persist()` + öncelikli seçim.

**Y8. R2 proxy stream'inde error handler yok** (`server/storage.js:69-70`)
`up.pipe(res)` — aktarım sırasında R2 koparsa dinleyicisiz error riski. Öneri: `up.on('error', () => res.destroy())`.

**Y9. Global Express error handler + unhandledRejection yakalayıcısı yok** (`server/index.js`)
Multer dosya boyutu/parser hataları default 500'e düşer; çok sayıda floating promise (`refreshMatches`, `hub.pushAll` zinciri) korumasız — Node 15+ bir unhandled rejection'da process'i öldürür. Öneri: 4 argümanlı error middleware + `process.on('unhandledRejection', log)`.

**Y10. Workflow girdisi run bloğuna gömülüyor (script injection)** (`.github/workflows/site-shots.yml:46`)
`${{ github.event.inputs.only }}` doğrudan `run:` içinde. Öneri: `env:` ile taşı, `$ONLY` olarak oku.

### 🟡 ORTA (özet)

**Güvenlik:**
- `trust proxy: true` (herkese güven) + XFF son değer — IP tabanlı kontroller proxy arkasında değilken atlanabilir (`index.js:20`, `auth.js:94`)
- Host header injection ile QR URL üretimi — `config.BASE_URL` varken `req.get('host')` kullanılıyor (`routes-tv.js:56`)
- Oturum iptali yok: çalınan sid şifre değişse bile 30 gün geçerli (`auth.js:55-58`) — `sess_epoch` önerisi
- `/health` endpoint yok (Dokploy/uptime izlemesi için)
- JS köprüsü (`TVNative`) tüm iframe'lere açık — token sızıntısı yüzeyi (`MainActivity.kt:177`)
- Kota kontrolü `content-length` başlığına güveniyor; chunked gönderimde başlık yok (`routes-admin.js:51-55`)
- Mimetype istemci kaynaklı; ffmpeg başarısızsa orijinal dosya (SVG dahil) servis edilir (`media.js:52-77`)
- KVKK: silinen işletmenin R2 dosyaları hata yutulunca yetim kalır (`storage.js:34-37`)
- Dockerfile root kullanıcıda, HEALTHCHECK yok; Windows kurulum paketi imzasız + updater imza doğrulamasız
- Yerel keystore parolası zayıf (`screenpano123`) ve dosya 644 — repo'da değil ama diski okuyan herkes okur
- login.html'de starters listesi esc'siz innerHTML (süper yönetim girdisine bağlı stored-XSS yüzeyi) (`login.html:78`)

**Performans:**
- `hub.pushAll` flush'ında kiracı başına değil **WS başına** `publicState` yeniden hesaplanıyor; her hesapta `apk-version.json` senkron diskten okunuyor (`realtime.js:21-34`, `state.js`) — canlı maç günü 25sn'de bir tüm ekranlara onlarca KB
- 500ms'lik sync döngüsünde her tick `mediaList` baştan kuruluyor (kitap karıştırma + Instagram dahil) (`realtime.js:96-104`)
- ESPN maç yenilemesi 25sn'de bir ~54+ istek (6 tarih × ligler) (`feeds.js:166-219`)
- `/api/super/overview` tüm kiracıların disklerini **senkron** tarıyor (200 kiracıda saniyelerce event loop bloğu) (`routes-super.js:28`)
- `scryptSync` istek yolunda (~50-100ms/istek; limit kapalıyken birleşince tehlikeli) (`auth.js:11-21`)
- Logo arka planı flood-fill/feather ~2,5M pikseli senkron CPU'da işliyor (`logobg.js:29-73`)
- Android `snapshot()` bitmap+JPEG+Base64 ana thread'de (`MainActivity.kt:392-446`); `onResume`'da koşulsuz `play()` (duraklatılmış video arka planda oynar, `:577`); video çözünürlük/bit hızı tavanı yok; trafik polling'i yaşam döngüsüne duyarlı değil
- Panel: her kayıtta TV önizleme iframe'i sıfırdan kuruluyor (`panel.js:78-87`); medya ızgarasında her karo için `<video preload=metadata>` (`panel.js:1027`)
- tv.html: `qrVis` ömür boyu 400ms interval; video üstünde kalıcı `backdrop-filter: blur`; çift `tickClock` interval'i

**Doğruluk:**
- `sync_media` aynı içerikte kalan süreyi düzeltmiyor + çevrimiçide her öğe bilinçli +2,5sn şişiyor → günlerce açık kutuda biriken sapma (`tv.html:1174,1258,1288`)
- `dur` alanı eksik tek video 45sn'de bir başa sarabilir (`tv.html:1117` vs `1251` — video dalı fotoğraf süresini kullanıyor)
- sw.js `addAll` atomik — tek font 404 verirse SHELL tamamen boş kalır (`sw.js:8`); `staleWhileRevalidate` miss+ağ hatasında `undefined` döner (`sw.js:44-48`)
- `??`/`?.` sözdizimi eski WebView'de (<80, 2019 öncesi) script bloğunun tamamını SyntaxError'a düşürür — siyah ekran (sahadaki kutular güncelseyse etkisiz; ResizeObserver fallback'i yazılmış olması eski desteğin hedeflendiğini gösteriyor) (`tv.html:1345,1494,2902`)
- Panel'de stale medya id'sinde `v.name` TypeError — sessiz kalır (`panel.js:494`); toggle'lar sunucu hatasında geri sarmıyor (`panel.js:29`)
- `req.body` undefined CORP'ları: `routes-admin.js:583,587` JSON olmayan istekte 500
- Commit'lenmemiş `TvWebSocket.kt` + `data/model/`: hiçbir yere bağlı değil (yarı bitmiş refactor), `PairResponse.kt:6` sunucunun `qr` alanını `qrSvg` bekliyor — ayrışmış; bağlamadan önce scope/çift-connect sızıntıları da düzeltilmeli

### 🟢 DÜŞÜK (liste)
Yavaş bellek/disk sızıntıları: `finalSeen`/`prevScores` (feeds.js), kalori cache'i (budanmıyor), LOGO_DIR (asla budanmıyor), `monitor.snaps` (cihaz silinince kalmıyor değil — kalıyor; 100 cihazda ~100MB) · `minifyEnabled false` (6,9MB APK; R8 ile küçülür) · Ölü kod: `QrHelper.kt`, 5 `item_*.xml`, `TvApp.instance`, kullanılmayan `constraintlayout`/`cardview`/`zxing`/`media3-datasource-okhttp` bağımlılıkları · AGP 8.5.2 + Gradle 9.3.1 resmi destek dışı ikili · `sensorLandscape` duvar titreşiminde 180° dönebilir (`userLandscape` önerisi) · `KEYCODE_BACK` her koşulda yutulur · `BootReceiver` action kontrolü yok · super.html/panel.js'te global hata yakalama yok (tv.html'de var — iyi) · tv dakikalık `reportNow` bayat imzayı yeniden gönderir · `i18n.js` `document.write` kullanıyor · `baslat.sh` varsayılan süper parolası `admin12345` ve public repoda okunabilir · android.yml push yeniden denemesi sessiz kalabilir · DEPLOY.md'de bayat "sürüm 21/3.0" ifadesi · strings.xml yok (metinler Kotlin'de) · WS backpressure yok (`bufferedAmount` kontrolü) · QR SVG'leri ham innerHTML (bugün güvenli, zincir tek hata kırılgan) · Calorie `repeat(negative)` RangeError yüzeyi · masaüstü `will-navigate` ön ek kontrolü aşılabilir.

---

## 4. Canlı Doğrulanmış Pozitifler (güven veren)

- **İşletme izolasyonu:** iki kiracının state'i farklı; oturumsuz API 401; panel/super yönlendirmeleri doğru; cihaz uçları SQL'de kiracı kapsamlı; kiracılar arası erişim bulunamadı.
- **Cihaz/paket limiti gerçekten uygulanıyor** (2 cihaz dolunca anlaşılır Türkçe hata).
- **SQL tamamı prepared/whitelist; path traversal regex'le kesilmiş; token'lar hash'li; `timingSafeEqual` doğru kullanılmış.**
- **Keystore ve parolalar repoda VE git geçmişinde yok** (doğrulandı); CI GitHub Secrets + parmik izi doğrulaması kullanıyor — model doğru.
- **APK sürüm üçlüsü tutarlı** (build.gradle = apk-version.json = APK içeriği).
- **Eşleştirme akışı gerçek tarayıcıda uçtan uca kusursuz**; token yeniden yüklemede kalıcı; SW çevrimdışı temeli çalışıyor.
- **250ms'lik toplu yayın 30 istemcide sorunsuz**; boştayken gereksiz trafik 0.
- **TV telemetrisi örnek seviyede** (fps/jank/heap/hata sayacı/kumanda navigasyonu); panel API hataları toast ile bildiriliyor; blob URL sızıntısı yok; timer temizliği disiplinli.

---

## 5. Öncelik Sıralı Yol Haritası

**P0 — bu hafta (güvenlik/çökme):**
1. SVG sanitize/CSP (K1) — 1-2 saat
2. s3 stream `on('error')` + `unhandledRejection` handler (K2, Y9) — 1 saat
3. SIGTERM graceful shutdown (K3) — 1-2 saat
4. `LOGIN_LIMIT` varsayılan açık (Y1) — 10 dk (deploy ortamına `LOGIN_LIMIT=on`)

**P1 — bu ay (saha istikrarı):**
5. sw.js Range stream okuma + media byte sınırı + `persist()` (K4, Y7)
6. tv.html WS: parse try/catch + üstel backoff + watchdog (Y5)
7. `setBlocked`'a `exoStop()` (Y4); Android 5.x `failingUrl` kontrolü (Y2)
8. publicState Spotify strip (Y6); Express error middleware (Y9)
9. CI: site-shots.yml env geçişi (Y10); android.yml push doğrulaması

**P2 — çeyrek (performans/olgunlaşma):**
10. pushAll'da kiracı başına tek payload + appVersion cache; sync mediaList cache; ESPN tek tarih aralığı; `/overview` disk taramasını arka plana al (P-perf seti)
11. `/health` endpoint; Dockerfile `USER node` + HEALTHCHECK; sess_epoch (oturum iptali); `trust proxy: 1`
12. Android: snapshot'ı arka plana al, onResume koşullu play, çözünürlük tavanı, R8 aç, ölü kod/bağımlılık temizliği; networkSecurityConfig
13. Commit'lenmemiş TvWebSocket/model dosyalarına karar ver: tamamla (önce `qrSvg`→`qr` + scope sızıntısı düzelt) ya da working tree'den çıkar

**P3 — teknik borç:** DÜŞÜK listesi (bellek budamaları, strings.xml, AGP/Gradle hizalama, DEPLOY.md güncellemesi, panel önizleme iframe kalıcılaştırma, global hata yakalayıcılar).

---

## 6. Sınırlar ve Test Edilemeyenler

- **Android derlemesi koşulamadı** (sistemde Java yok) — statik analiz + CI geçmişi + APK içeriğiyle telafi edildi. Öneri: yerel JDK17 kurulumu.
- Gerçek TV kutusu donanımı, zayıf kutu CPU/GPU davranışı, R2 gerçek hesabı, SMTP/Places/Instagram API'leri, IBB trafik akışı sahte/gerçek olarak test edilmedi.
- Test sunucusu logunda iki dikkat: **"Altın/BIST alınamadı: JSON parse hatası"** (dış API yanıt formatı değişmiş olabilir — üretimde widget verisi güncel mi kontrol edin) ve **"Harita çizilemedi: spawn chromium ENOENT"** (bu makinede chromium yok; üretimde `CHROMIUM_PATH` doğruysa sorun yok, ama her TV bağlantısında render denemesi tekrarlanıyor).
- Yük testi tek kiracı/30 istemciyle sınırlı; çok kiracı + canlı maç günü senaryosu ölçülmedi (analiz bulgusu Y-perf setine yansıdı).

---

*Rapor 4 paralel derin kod incelemesi (sunucu 34 dosya, web arayüzü, Android, altyapı/CI) + izole sunucuda 56 canlı testten (33 HTTP + 7 WS + 16 E2E) derlenmiştir. Tüm bulgular dosya:satır kanıtlıdır; spekülatif olanlar ayrıca işaretlenmiştir.*
