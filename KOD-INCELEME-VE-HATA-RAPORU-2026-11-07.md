# ScreenPano — Kapsamlı Kod İnceleme, Hata ve Güvenlik Raporu

**Tarih:** 7 Kasım 2026  
**Kapsam:** Sunucu (`server/`), Arayüz (`public/`), Android (`android/`), Masaüstü (`desktop/`), Service Worker (`public/sw.js`) ve Yapı/CI  
**Amaç:** Sistemin baştan sona statik analiz, mimari tutarlılık, mantık hataları, bellek sızıntıları, güvenlik açıkları ve yeni eklenen özelliklerdeki regresyonların tespiti ve çözüm önerileri.

---

## 1. Yönetici Özeti

Uygulamanın genel omurgası (WebSocket yayını, SQLite WAL yönetimi, cihaz eşleştirme, çoklu ekran senkronizasyonu) sağlam temellere oturmaktadır. Bununla birlikte, **son yapılan commit/taslak değişikliklerinde 2 doğrudan işlevsel regresyon**, **2 güvenlik açığı**, **1 Express mimari sıralama hatası**, **1 bellek sızıntısı** ve **Android yerel bileşen uyumsuzluğu** tespit edilmiştir.

Aşağıda tüm bulgular önem derecelerine göre, tam dosya yolları, satır numaraları, kök nedenleri ve doğrudan uygulanabilir kod çözümleriyle listelenmiştir.

---

## 2. 🔴 KRİTİK / İŞLEVSEL HATALAR (Bugs & Regresyonlar)

### 2.1. `public/tv.html` — CSS Değişkeni Sızıntısı (Tema Değişince Cam Stili Temizlenmiyor)

* **Dosya & Satır:** `public/tv.html:2729-2735`
* **Kategori:** Arayüz Mantık Hatası / UI Regresyonu
* **Kök Neden:**  
  Yeni eklenen cam (glass/lounge) temasında `applyTheme(th)` fonksiyonuna şu kod eklenmiştir:
  ```javascript
  const isGlass = !!th.glass || th.bg === '#07090d';
  document.documentElement.classList.toggle('theme-glass', isGlass);
  if (isGlass) {
    r.setProperty('--card', 'rgba(18, 24, 34, 0.72)');
    r.setProperty('--line', 'rgba(255, 255, 255, 0.08)');
  }
  ```
  `isGlass` `true` olduğunda `document.documentElement.style` üzerine inline olarak `--card` ve `--line` yazılmaktadır. Ancak kullanıcı panelden başka bir temaya (örneğin Bordo, Deniz, Klasik veya Altın) geçtiğinde `else` bloğu bulunmadığı için inline yazılan bu CSS değişkenleri kaldırılmamaktadır (`r.removeProperty` çağrılmamaktadır). Sonuç olarak sayfa yenilenene kadar tüm diğer temalar koyu cam arka planı ve transparan çizgilerle bozuk görünmektedir.

* **Çözüm (Patch):**
  `public/tv.html:2731-2734` arasını şu şekilde güncelleyin:
  ```javascript
  if (isGlass) {
    r.setProperty('--card', 'rgba(18, 24, 34, 0.72)');
    r.setProperty('--line', 'rgba(255, 255, 255, 0.08)');
  } else {
    r.removeProperty('--card');
    r.removeProperty('--line');
  }
  ```

---

### 2.2. `public/panel.html` ve `/tv-lounge` — Statik / Sahte Verili Sayfa Linki

* **Dosya & Satır:**  
  - `public/panel.html:406` (`<a href="/tv-lounge" target="_blank" style="color:#dfb73a;font-weight:600">✨ Lüks Lounge TV (Yeni Tasarım)</a>`)
  - `server/index.js:79` (`app.get(['/tv-lounge', '/lounge'], page('tv-lounge.html'));`)
  - `public/tv-lounge.html`
* **Kategori:** Yarım Kalan Özellik / Sahte Veri Sunumu
* **Kök Neden:**  
  1. Panel sol menüsüne canlı linki konulan `/tv-lounge` sayfası, ScreenPano'nun dinamik WebSocket motoruna, oturum açan işletmenin verilerine veya TV eşleştirme yapısına **bağlı değildir**.
  2. Sayfada "Bomera Lounge", "Trüflü Çıtır Patates & Dry-Aged Burger 420 TL", "Gaziantep FK 0 - 2 Kasımpaşa 84' CANLI", "USD/TRY 50,08 TL" gibi tamamen hardcoded sahte veriler bulunmaktadır. Gerçek bir müşteri panele girip bu linke tıkladığında kendi ekranı yerine üçüncü parti sahte bir işletme ekranı görmektedir.
  3. `tv-lounge.html` içinde `<script src="https://cdn.tailwindcss.com"></script>` kullanılmıştır. TV kutularında veya internet kesintilerinde (çevrimdışı modda) CDN çalışmaz, konsola "Tailwind CDN should not be used in production" hatası basar ve sayfa dağılır.
* **Çözüm:**  
  - Bu sayfa bir konsept/tasarım çalışması ise paneldeki canlı link kaldırılmalı veya gizlenmelidir (`panel.html:406`).
  - Eğer kalıcı bir şablon olacaksa, `server/widgets.js`'teki `lounge` şablonu gibi `public/tv.html` içindeki dinamik grid motoruna bağlanmalı; harici Tailwind CDN yerine mevcut CSS mimarisi kullanılmalıdır.

---

### 2.3. `server/index.js` — Express Global Hata Yakalayıcıdan Sonra Rota Tanımı

* **Dosya & Satır:** `server/index.js:163-184`
* **Kategori:** Mimari Hata / Express Sıralama
* **Kök Neden:**  
  `server/index.js` dosyasında 163-168 satırlarında Express global 4 parametreli hata middleware'i tanımlanmıştır:
  ```javascript
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    ...
  });
  ```
  Ancak `/health` endpoint'i daha sonra, 184. satırda tanımlanmıştır:
  ```javascript
  // Sağlık kontrolü (Dokploy/izleme)
  app.get('/health', (req, res) => res.json({ ok: true, up: Math.round(process.uptime()) }));
  ```
  Express mimarisinde tüm route handler'lar her zaman hata yakalama ara katmanından **önce** kaydedilmelidir.
* **Çözüm:**  
  `app.get('/health', ...)` tanımını `app.use('/api', ...)` satırının hemen önüne taşıyın.

---

## 3. 🟠 GÜVENLİK AÇIKLARI (Security Vulnerabilities)

### 3.1. `server/routes-ext.js` — Afiş Yüklemede SVG Bypass Riski

* **Dosya & Satır:** `server/routes-ext.js:67-71`
* **Kategori:** Dosya Yükleme Doğrulama Eksikliği
* **Kök Neden:**  
  `server/routes-admin.js` içerisinde `/logo` ve `/assets` uçlarına yüklenen SVG'ler, SVG içi zararlı JavaScript (`<script>` veya `onload=...`) barındırma riskine karşı `svgToPng()` fonksiyonuyla zorunlu olarak PNG'ye rasterize edilmektedir.  
  Ancak `server/routes-ext.js:69` (`/posters/image`) ucunda kontrol yalnızca şudur:
  ```javascript
  if (!/^image\//.test(f.mimetype)) { rmUpload(req.t, f.filename); return res.status(400).json({ error: 'Yalnız fotoğraf yüklenebilir' }); }
  ```
  Tarayıcılar SVG yüklerken `image/svg+xml` mimetype'ı gönderir. Dolayısıyla `image/` regex'i SVG dosyalarını kabul eder ve dosya `svgToPng` süzgecinden geçirilmeden doğrudan uploads dizinine kaydedilir.
* **Çözüm:**  
  Afiş görseli yükleme ucuna da SVG kontrolü ve dönüştürme eklenmeli veya SVG reddedilmelidir:
  ```javascript
  r.post('/posters/image', quota, upload.single('file'), async (req, res) => {
    const f = req.file; if (!f) return res.status(400).json({ error: 'dosya yok' });
    if (!/\.(jpe?g|png|webp)$/i.test(f.originalname) || !/^image\/(jpeg|png|webp)$/.test(f.mimetype)) {
      rmUpload(req.t, f.filename);
      return res.status(400).json({ error: 'Yalnız JPG, PNG veya WEBP fotoğraf yüklenebilir' });
    }
    res.json({ ok: true, file: f.filename, url: req.t.upBase + f.filename });
  });
  ```

---

### 3.2. `desktop/main.js` — Electron Navigasyon Korumasında Prefix Bypass Açığı

* **Dosya & Satır:** `desktop/main.js:50`
* **Kategori:** URL Validation / Açık Yönlendirme & Sahte Host
* **Kök Neden:**  
  Windows masaüstü uygulamasında uygulamanın yabancı sitelere gitmesini engellemek için şu kod kullanılmıştır:
  ```javascript
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(cfg.load().url)) e.preventDefault(); });
  ```
  Eğer `cfg.load().url` değeri varsayılan olan `https://screenpano.com` ise, `startsWith` kontrolü aşağıdaki gibi saldırgan alan adlarını da geçerli kabul eder:
  `https://screenpano.com.attacker-domain.com/evil`
* **Çözüm:**  
  `startsWith` dize kontrolü yerine `URL.origin` karşılaştırması yapılmalıdır:
  ```javascript
  win.webContents.on('will-navigate', (e, url) => {
    try {
      const targetOrigin = new URL(url).origin;
      const allowedOrigin = new URL(cfg.load().url).origin;
      if (targetOrigin !== allowedOrigin) e.preventDefault();
    } catch {
      e.preventDefault();
    }
  });
  ```

---

### 3.3. `server/routes-tv.js` — TV Eşleştirme QR'ında Host Header Güvenliği

* **Dosya & Satır:** `server/routes-tv.js:56`
* **Kategori:** Host Header Poisoning
* **Kök Neden:**  
  ```javascript
  const url = `${req.protocol}://${req.get('host')}/panel#pair=${code}`;
  ```
  Sistemde `config.BASE_URL` tanımlı olmasına rağmen TV eşleştirme QR linki oluşturulurken gelen HTTP isteğindeki `host` başlığına güvenilmektedir. Sahte bir Host başlığı gönderildiğinde üretilen QR kod müşteriyi sahte bir panele yönlendirebilir.
* **Çözüm:**  
  ```javascript
  const base = config.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const url = `${base}/panel#pair=${code}`;
  ```

---

## 4. 🟡 PERFORMANS, BELLEK SIZINTISI VE OPTİMİZASYONLAR

### 4.1. `server/monitor.js` — Silinen Cihazların Ekran Görüntülerinin Bellekte Kalması (Memory Leak)

* **Dosya & Satır:** `server/monitor.js:11` ve `server/routes-admin.js:224-226`
* **Kategori:** Bellek Sızıntısı (Unbounded Map)
* **Kök Neden:**  
  TV kutularının gönderdiği Base64 ekran görüntüleri (her biri 100 KB - 500 KB) `snaps` haritasında saklanmaktadır:
  `const snaps = new Map(); // deviceId -> { at, data }`
  İşletme sahibi panelden bir cihazı sildiğinde (`DELETE /api/admin/devices/:id`), veritabanından silinir ve WebSocket bağlantısı koparılır; ancak `monitor.snaps` ve `monitor.live` haritalarından silinmez. Cihaz eklenip çıkarıldıkça Node.js heap belleğinde bu Base64 verileri süresiz kalır.
* **Çözüm:**  
  `server/monitor.js` içerisine dışa aktarılan bir temizleme fonksiyonu ekleyin:
  ```javascript
  function forgetDevice(deviceId) {
    live.delete(deviceId);
    snaps.delete(deviceId);
  }
  ```
  `server/routes-admin.js:224` (`r.delete('/devices/:id', ...)`) endpoint'inde `require('./monitor').forgetDevice(req.params.id);` çağrısını yapın.

---

### 4.2. `server/auth.js` — Proxy / CDN Arkasında Toplu IP Kilitleme Riski

* **Dosya & Satır:** `server/auth.js:104`
* **Kategori:** Hız Sınırı (Rate Limiting) Mantık Kusuru
* **Kök Neden:**  
  ```javascript
  const clientIp = req => {
    const x = String(req.headers['x-forwarded-for'] || '').split(',').map(v => v.trim()).filter(Boolean);
    return x.length ? x[x.length - 1] : String(req.socket.remoteAddress || '');
  };
  ```
  Traefik gibi tek bir ters vekil kullanıldığında `x[x.length - 1]` doğru istemci IP'sini verir. Ancak projenin önüne Cloudflare CDN/WAF eklendiğinde Traefik'e bağlanan istemci Cloudflare olur. Bu durumda `x[x.length - 1]` Cloudflare edge sunucusunun IP'si haline gelir. Farklı konumlardaki müşterilerden biri 8 kez hatalı şifre girdiğinde o Cloudflare IP'sinden geçen tüm işletmeler 10 dakika boyunca 429 ("Çok fazla deneme") hatası alarak kilitlenir.
* **Çözüm:**  
  Cloudflare başlığı önceliklendirilmelidir:
  ```javascript
  const clientIp = req => {
    const cf = req.headers['cf-connecting-ip'];
    if (cf && typeof cf === 'string') return cf.trim();
    const x = String(req.headers['x-forwarded-for'] || '').split(',').map(v => v.trim()).filter(Boolean);
    return x.length ? x[x.length - 1] : String(req.socket.remoteAddress || '');
  };
  ```

---

### 4.3. `public/sw.js` — Smart TV'lerde (Web TV) Range İsteğinde RAM Tüketimi

* **Dosya & Satır:** `public/sw.js:53`
* **Kategori:** OOM (Out of Memory) Riski
* **Kök Neden:**  
  ```javascript
  async function rangeFrom(resp, range) {
    if (!range || resp.type === 'opaque') return resp;
    const m = /bytes=(\d*)-(\d*)/.exec(range); if (!m) return resp;
    const blob = await resp.blob(), size = blob.size; // Blob dilimi belleğe tamamını yüklemez
    ...
  ```
  Android TV kutularında yerel ExoPlayer kullanıldığı için service worker Range yoluna girmez. Ancak Tizen (Samsung TV), webOS (LG TV) ve tarayıcı tabanlı ekranlarda HTML5 `<video>` etiketi sürekli Range istekleri atar. `resp.blob()` çağrısı videonun tamamını tarayıcının RAM belleğine çeker (500 MB video için 500 MB RAM). 1 GB RAM'li Smart TV'lerde WebView sekmesi doğrudan OOM ile kilitlenip kapanır.
* **Çözüm:**  
  Büyük video dosyaları (örneğin `/u/` altındaki `.mp4` ve `.webm` istekleri) Service Worker üzerinden `blob()` ile kesilmemeli; doğrudan ağa (`fetch(req)`) yönlendirilmelidir.

---

## 5. 📱 ANDROID TV UYUMLULUĞU (`CLAUDE.md` Kural 10)

* **Kural:** `CLAUDE.md` Kural 10 açıkça şunu belirtmektedir:  
  *"Yeni büyük maç stili / duyuru tasarımı eklenirse yerel (Kotlin) olarak yaz: android/.../ui/nativeui/BigArenaView.kt... sayfadaki web tasarımı yalnız eski APK'lar için yedek kalır."*
* **Tespit:**  
  `server/widgets.js`'e yeni eklenen `lounge` şablonu ve `lounge` ("Midnight Gold") teması için Android tarafında (`android/app/src/main/java/com/screenpano/tv/ui/nativeui/`) hiçbir Kotlin yerel karşılık hazırlanmamıştır. Android TV kutusunda panelden "Yerel Bileşenler" (`nativeWidgets`) aktif edildiğinde bu şablonun yerel karşılığı olmadığı için ya varsayılan şablona düşecek ya da eksik çizilecektir.
* **Öneri:** `lounge` şablonu kullanılacaksa `android/.../ui/nativeui/` altında Kotlin grid düzeni ve kart arka plan renkleri tanımlanmalıdır.

---

## 6. Özet Düzeltme Kontrol Listesi

- [ ] **1. `public/tv.html`**: `applyTheme` içine `else { r.removeProperty('--card'); r.removeProperty('--line'); }` ekle.
- [ ] **2. `public/panel.html`**: Henüz backend'e bağlanmamış statik `✨ Lüks Lounge TV (Yeni Tasarım)` linkini kaldır veya dinamik hale getir.
- [ ] **3. `server/index.js`**: `app.get('/health', ...)` satırını hata middleware'i (`app.use((err, ...))`) öncesine taşı.
- [ ] **4. `server/routes-ext.js`**: `/posters/image` ucuna dosya uzantısı/mimetype kontrolü ekleyerek ham SVG girişini engelle.
- [ ] **5. `desktop/main.js`**: `will-navigate` içindeki `url.startsWith` kontrolünü `URL.origin` karşılaştırmasıyla değiştir.
- [ ] **6. `server/routes-tv.js`**: QR link üretiminde `config.BASE_URL`'i önceliklendir.
- [ ] **7. `server/monitor.js`**: Cihaz silindiğinde `snaps` ve `live` haritalarını temizleyen `forgetDevice(id)` metodunu ekle.
- [ ] **8. `server/auth.js`**: `clientIp` fonksiyonuna `req.headers['cf-connecting-ip']` kontrolünü ekle.
