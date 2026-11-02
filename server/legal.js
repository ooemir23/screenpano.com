// KVKK ve sözleşme metinleri: /kvkk, /gizlilik, /acik-riza, /veri-isleme, /kosullar.
// Şirket bilgileri süper yönetim → Platform ayarları → Yasal bilgiler'den gelir. Metinler uygulamanın bugün gerçekten
// işlediği verilere göre yazıldı (kayıt, kullanıcılar, cihaz raporları, yedekler, R2, SMTP, Google/Meta servisleri).
// Yeni bir kişisel veri ya da yeni bir hizmet sağlayıcı eklenirse buradaki listeleri güncelleyin ve VERSION'ı artırın.
// ÖNEMLİ: Yayından önce bir avukata kontrol ettirin. Yurt dışına aktarım için standart sözleşmeyi imzalayıp
// imzadan itibaren 5 iş günü içinde Kurul'a bildirmeyi unutmayın (KVKK m.9/4).
const store = require('./store');
const config = require('./config');

const VERSION = '2026-11-02';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const info = () => {
  const g = (k, d) => store.setting(k, '') || d;
  return {
    brand: config.BRAND, company: g('legal_company', '[Şirket unvanı]'), address: g('legal_address', '[Açık adres]'),
    email: g('legal_email', '[kvkk@alanadiniz.com]'), phone: g('legal_phone', '[Telefon]'), mersis: g('legal_mersis', '[MERSİS no]'), kep: g('legal_kep', ''),
    hosting: g('legal_hosting', '[Sunucu sağlayıcısı ve ülkesi]'), site: g('site_url', 'https://screenpano.com'),
  };
};
// ortamda gerçekten açık olan hizmet sağlayıcılar: metin yalnız kullanılanları sayar
const r2 = () => !!(process.env.R2_ACCOUNT_ID || process.env.S3_ENDPOINT);
const smtpHost = () => (process.env.SMTP_HOST || '').replace(/^smtp\./, '');

const contact = i => `<b>${i.company}</b>, ${i.address}${i.kep ? ` · KEP: ${i.kep}` : ''} · ${i.email} · ${i.phone}`;

const PAGES = {
  kvkk: { title: 'KVKK Aydınlatma Metni', body: i => `
<p>Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") m.10 ve Aydınlatma Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ uyarınca, <b>${i.brand}</b> hizmetini kullanan işletmelerin yetkililerini, çalışanlarını ve web sitemizi ziyaret edenleri bilgilendirmek için hazırlanmıştır.</p>

<h2>1. Veri sorumlusu</h2>
<p>${contact(i)} · MERSİS: ${i.mersis} ("Şirket", "biz").</p>
<p>İşletmenizin ekranda gösterdiği <b>kendi müşterilerine ve çalışanlarına ait</b> veriler (doğum günü kutlamasındaki isimler, fotoğraflardaki kişiler, Google yorumu yazanların adları gibi) bakımından veri sorumlusu <b>işletmenizdir</b>; biz bu verileri yalnızca sizin talimatınızla, veri işleyen olarak işleriz. Bu konu <a href="/veri-isleme">Veri İşleme Sözleşmesi</a>'nde düzenlenmiştir.</p>

<h2>2. İşlediğimiz kişisel veriler, amaçları ve hukuki sebepleri</h2>
<table class="lt"><thead><tr><th>Veri</th><th>Ne için</th><th>Hukuki sebep (KVKK m.5)</th></tr></thead><tbody>
<tr><td><b>Kimlik ve iletişim:</b> işletme adı, kullanıcı adları, telefon numarası, uyarılar için verdiğiniz e-posta adresi</td><td>Hesabın açılması ve yönetimi, destek, ekran kapanınca size haber verilmesi, sözleşme ve faturaya ilişkin bildirimler</td><td>Sözleşmenin kurulması ve ifası (m.5/2-c)</td></tr>
<tr><td><b>Hesap güvenliği:</b> şifrenizin tek yönlü özeti (şifre saklanmaz), oturum çerezi, son giriş zamanı, kayıt ve onay sırasındaki IP adresi</td><td>Yetkisiz erişimin önlenmesi, kötüye kullanımın tespiti, onayların ispatı</td><td>Meşru menfaat (m.5/2-f), hakkın tesisi ve korunması (m.5/2-e)</td></tr>
<tr><td><b>Onay kayıtları:</b> Kullanım Koşulları ve bu metnin hangi sürümünü ne zaman onayladığınız, ticari ileti tercihiniz</td><td>Yükümlülüklerimizi yerine getirdiğimizi ispat</td><td>Hukuki yükümlülük (m.5/2-ç), hakkın tesisi (m.5/2-e)</td></tr>
<tr><td><b>Cihaz bilgisi:</b> TV kutusunun adı, tarayıcı/uygulama bilgisi, sürüm, ekran çözünürlüğü, çalışma süresi, oynayan içerik, son hata, son bağlantı zamanı ve sizin istediğiniz anda alınan ekran görüntüsü</td><td>Ekranın çalıştığını izlemek, arızaya müdahale, çevrimdışı uyarısı</td><td>Sözleşmenin ifası (m.5/2-c), meşru menfaat (m.5/2-f)</td></tr>
<tr><td><b>İçerik:</b> yüklediğiniz video, fotoğraf, logo, fiyat listesi, duyuru metinleri, QR bağlantıları; bağlarsanız Instagram paylaşımlarınız</td><td>İçeriklerin ekranınızda gösterilmesi</td><td>Sözleşmenin ifası (m.5/2-c)</td></tr>
<tr><td><b>Kullanım istatistiği:</b> içeriklerin oynatılma sayısı ve ekranın açık kalma süresi (kişiyle ilişkilendirilmez)</td><td>Size istatistik sunmak, hizmeti iyileştirmek</td><td>Meşru menfaat (m.5/2-f)</td></tr>
<tr><td><b>Ticari elektronik ileti tercihi</b></td><td>Yeni özellik ve kampanya duyuruları</td><td>Yalnız <a href="/acik-riza">açık rızanız</a> varsa (m.5/1)</td></tr>
</tbody></table>
<p>Hizmetimiz özel nitelikli kişisel veri (sağlık, din, biyometrik veri vb.) işlemek için tasarlanmamıştır; lütfen bu tür verileri ekrana yüklemeyin.</p>

<h2>3. Toplama yöntemi</h2>
<p>Verileriniz; web sitesindeki kayıt formu, yönetim paneli ve Android TV uygulaması üzerinden <b>elektronik ortamda</b>, sizin girmenizle ya da TV kutusunun otomatik olarak gönderdiği durum raporlarıyla toplanır.</p>

<h2>4. Kimlere aktarılır?</h2>
<ul>
<li><b>Sunucu barındırma:</b> ${i.hosting}. Veritabanı, içerikler ve gece yedekleri burada tutulur.</li>
${r2() ? '<li><b>Dosya depolama ve yedek:</b> Cloudflare, Inc. (ABD) — R2 hizmeti. Yüklediğiniz medya dosyaları ve şifreli bağlantıyla gönderilen veritabanı yedekleri.</li>' : ''}
${smtpHost() ? `<li><b>E-posta gönderimi:</b> ${esc(smtpHost())} — yalnız size gönderilen uyarı e-postaları için e-posta adresiniz ve işletme adınız.</li>` : ''}
<li><b>Google LLC ve Meta Platforms, Inc. (ABD):</b> yalnız ilgili özelliği açarsanız. Google yorumları için işletmenizin Google kaydı sorgulanır; Instagram bağlantısında sizin verdiğiniz erişim anahtarıyla paylaşımlarınız alınır. TV ekranı yazı tipleri ve film fragmanları için Google sunucularına bağlanabilir.</li>
<li><b>Konum / şehir araması:</b> Panelde işletme şehrini ararken yazdığınız şehir adı Open-Meteo'ya, "Konumumu otomatik bul" düğmesini kullanırsanız tarayıcınızın verdiği konum (yaklaşık 1 km'ye yuvarlanmış koordinat) BigDataCloud'a (Avustralya) sunucumuz üzerinden gönderilir. Yalnızca bu düğmeyi kullandığınızda çalışır; kullanıcı adınız ya da başka bir kimlik bilginiz gönderilmez, konum izni yalnız tarayıcınızda verilir ve işletmenizin konumu olarak kaydedilir.</li>
<li><b>Yetkili kamu kurum ve kuruluşları:</b> kanunen zorunlu hâllerde, talep edilen ölçüde.</li>
</ul>
<p>Maç, döviz, hava durumu, haber, eczane gibi bilgi kaynaklarına <b>kişisel veri gönderilmez</b>; bu veriler sunucumuz tarafından genel olarak çekilir.</p>
<p><b>Yurt dışına aktarım:</b> Yukarıda yurt dışında bulunduğu belirtilen sağlayıcılara aktarım KVKK m.9 uyarınca, Kurul'un ilan ettiği standart sözleşmeler gibi uygun güvencelerle yapılır.</p>

<h2>5. Ne kadar süre saklanır?</h2>
<ul>
<li>Hesap verileri ve içerikler: hesabınız açık olduğu sürece.</li>
<li>Hesap silme talebi: panelden talep ettiğinizde 30 gün beklenir (bu sürede vazgeçebilirsiniz), sonra işletme, kullanıcılar, cihazlar, medya ve işletme yedekleri kalıcı olarak silinir. Platformun gece yedeklerinde en fazla 60 gün daha kalır ve bu süre sonunda kendiliğinden silinir.</li>
<li>Kullanım istatistikleri: 400 gün.</li>
<li>TV'den alınan ekran görüntüsü ve durum raporları: kalıcı olarak saklanmaz, yalnız son durum tutulur.</li>
<li>Fatura ve sözleşmeye ilişkin kayıtlar: Vergi Usul Kanunu ve Türk Ticaret Kanunu'ndaki süreler (genellikle 10 yıl) boyunca.</li>
</ul>

<h2>6. Haklarınız (KVKK m.11)</h2>
<p>Kişisel verilerinizin işlenip işlenmediğini öğrenme; işlenmişse bilgi talep etme; işlenme amacını ve amaca uygun kullanılıp kullanılmadığını öğrenme; yurt içinde ve yurt dışında aktarıldığı üçüncü kişileri bilme; eksik ya da yanlış işlenmişse düzeltilmesini, KVKK m.7 şartlarıyla silinmesini veya yok edilmesini ve bu işlemlerin aktarılan üçüncü kişilere bildirilmesini isteme; münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonuca itiraz etme; kanuna aykırı işleme nedeniyle zarara uğramanız hâlinde zararın giderilmesini talep etme haklarına sahipsiniz.</p>
<p><b>Kendiniz yapabilecekleriniz:</b> Panelde <b>Ayarlar → Verilerim</b> bölümünden tüm verilerinizi indirebilir, hesap silme talebi oluşturabilirsiniz. Bilgilerinizi <b>Ayarlar → İşletme</b> ve <b>Kullanıcılar</b> bölümlerinden düzeltebilirsiniz.</p>

<h2>7. Başvuru</h2>
<p>Diğer talepleriniz için, Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ'e uygun olarak kimliğinizi ve talebinizi belirterek şu yollardan biriyle başvurabilirsiniz: yazılı olarak ${i.address} adresine; ${i.kep ? `KEP ile ${i.kep} adresine; ` : ''}güvenli elektronik imza veya mobil imza ile ya da sistemimize kayıtlı e-posta adresinizden <b>${i.email}</b> adresine. Başvurunuz en geç <b>30 gün</b> içinde ücretsiz sonuçlandırılır; işlemin ayrıca bir maliyet gerektirmesi hâlinde Kurul'un belirlediği tarife uygulanabilir. Yanıtımızdan memnun kalmazsanız Kişisel Verileri Koruma Kurulu'na şikâyette bulunabilirsiniz.</p>
<p class="meta">Sürüm ${VERSION} · Bu metin değiştiğinde güncel sürüm bu sayfada yayımlanır.</p>` },

  gizlilik: { title: 'Gizlilik ve Çerez Politikası', body: i => `
<p>${i.brand} web sitesi, yönetim paneli ve TV uygulaması <b>yalnızca hizmetin çalışması için zorunlu</b> çerez ve yerel depolama kullanır. Reklam, analitik, sosyal medya veya üçüncü taraf takip çerezi kullanılmaz; bu nedenle çerez onay penceresi gösterilmez.</p>
<h2>Web sitesi ve panel</h2>
<table class="lt"><thead><tr><th>Ad</th><th>Tür</th><th>Amaç</th><th>Süre</th></tr></thead><tbody>
<tr><td><code>sid</code></td><td>Zorunlu çerez (birinci taraf, HttpOnly)</td><td>Panele giriş yaptığınızda oturumunuzu tanımak</td><td>30 gün; çıkış yapınca silinir</td></tr>
</tbody></table>
<p>Tanıtım sitesi giriş yapmamış ziyaretçiye çerez yerleştirmez ve dış kaynaktan yazı tipi, betik ya da takip kodu yüklemez.</p>
<h2>TV uygulaması</h2>
<table class="lt"><thead><tr><th>Ad</th><th>Tür</th><th>Amaç</th></tr></thead><tbody>
<tr><td><code>dtoken</code></td><td>Cihaz deposu</td><td>Kutunun hangi işletmeye bağlı olduğunu hatırlamak (şifre saklanmaz; sunucuda yalnızca özeti tutulur)</td></tr>
<tr><td><code>lastState</code>, önbellek</td><td>Cihaz deposu ve çevrimdışı önbellek</td><td>İnternet kesildiğinde son ayarları ve içerikleri gösterebilmek</td></tr>
</tbody></table>
<p>TV ekranı, seçtiğiniz yazı tipini Google Fonts'tan, film fragmanlarını YouTube'dan yükleyebilir; bu durumda kutunun IP adresi ve tarayıcı bilgisi Google'a iletilir. Fragmanları Bilgi Bandı ayarlarından kapatabilirsiniz.</p>
<h2>Güvenlik</h2>
<p>Şifreler tek yönlü özetlenerek (scrypt) saklanır, bağlantılar HTTPS ile şifrelenir, cihaz anahtarlarının yalnızca özeti tutulur, hatalı giriş denemeleri sınırlanabilir ve veritabanı her gece yedeklenir.</p>
<p>Kişisel verilerinizle ilgili ayrıntılar için <a href="/kvkk">KVKK Aydınlatma Metni</a>'ni okuyun. Sorularınız için: <b>${i.email}</b></p>` },

  'acik-riza': { title: 'Ticari Elektronik İleti Açık Rıza Metni', body: i => `
<p>Kayıt formundaki <b>"Yeni özellik ve kampanyalardan haberdar olmak istiyorum"</b> kutusunu işaretlemeniz isteğe bağlıdır; işaretlemezseniz hizmetten aynı şekilde yararlanırsınız.</p>
<p>Kutuyu işaretleyerek; ${contact(i)} tarafından, kayıt sırasında verdiğim <b>telefon numarası</b> ve panelde girdiğim <b>e-posta adresi</b> üzerinden, ${i.brand} hizmetine ilişkin yeni özellik, kampanya ve indirim duyurularının SMS, arama ve e-posta yoluyla tarafıma gönderilmesine; bu amaçla iletişim bilgilerimin işlenmesine, 6698 sayılı KVKK m.5/1 ve 6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun kapsamında <b>açık rıza</b> veriyorum.</p>
<ul>
<li>Bu onay, mevzuat gereği İleti Yönetim Sistemi'ne (İYS) kaydedilebilir.</li>
<li>Onayınızı dilediğiniz zaman, gerekçe göstermeden ve ücretsiz geri alabilirsiniz: gelen iletideki ret bağlantısıyla, İYS üzerinden ya da <b>${i.email}</b> adresine yazarak. Ret talebiniz en geç 3 iş günü içinde işleme alınır.</li>
<li>Hizmetin kendisine ilişkin zorunlu bildirimler (ekran kapandı uyarısı, abonelik ve güvenlik bildirimleri) ticari ileti değildir ve bu onaydan bağımsız olarak gönderilir.</li>
</ul>
<p>Verilerinizin işlenmesine ilişkin ayrıntılar <a href="/kvkk">KVKK Aydınlatma Metni</a>'ndedir.</p>` },

  'veri-isleme': { title: 'Veri İşleme Sözleşmesi', body: i => `
<p>Bu sözleşme, ${i.brand} hizmetini kullanan işletme ("İşletme", <b>veri sorumlusu</b>) ile ${contact(i)} ("Şirket", <b>veri işleyen</b>) arasında, İşletme'nin hizmet aracılığıyla işlediği <b>üçüncü kişilere ait</b> kişisel veriler için Kullanım Koşulları'nın ekidir ve hesap açılırken kabul edilir.</p>
<h2>1. Kapsam</h2>
<p>İşletme'nin ekranda göstermek üzere panele girdiği veya bağladığı veriler: doğum günü kutlamalarındaki kişi adları ve mesajlar, yüklenen fotoğraf ve videolardaki kişiler, Google yorumu yazanların adları ve yorumları, Instagram paylaşımları, panele eklenen çalışan kullanıcı adları. İlgili kişiler: İşletme'nin müşterileri, çalışanları ve ziyaretçileri.</p>
<h2>2. Şirket'in yükümlülükleri</h2>
<ul>
<li>Verileri yalnız İşletme'nin talimatıyla ve hizmetin sunulması (ekranda gösterme, saklama, yedekleme) amacıyla işler; başka bir amaçla kullanmaz, satmaz, paylaşmaz.</li>
<li>KVKK m.12 uyarınca uygun teknik ve idari tedbirleri alır: şifreli bağlantı, erişim yetkilendirmesi, şifrelerin özetlenmesi, düzenli yedekleme.</li>
<li>Alt işleyen olarak yalnız <a href="/kvkk">KVKK Aydınlatma Metni</a>'nde sayılan altyapı sağlayıcılarını kullanır; yeni bir alt işleyeni bu sayfada duyurur.</li>
<li>Verilerin kanuna aykırı olarak başkalarınca ele geçirildiğini öğrenirse İşletme'ye gecikmeksizin bildirir ve İşletme'nin Kurul'a 72 saat içinde bildirim yükümlülüğünü yerine getirebilmesi için gerekli bilgiyi sağlar.</li>
<li>İlgili kişilerin İşletme'ye yaptığı başvuruların yanıtlanmasına makul ölçüde yardımcı olur.</li>
<li>Sözleşme sona erdiğinde ve hesap silindiğinde verileri <a href="/kvkk">aydınlatma metnindeki</a> sürelerde siler; silmeden önce İşletme panelden verilerini indirebilir.</li>
</ul>
<h2>3. İşletme'nin yükümlülükleri</h2>
<ul>
<li>Ekranda adını, fotoğrafını veya görüntüsünü gösterdiği kişileri aydınlatmak ve gerekli hâllerde <b>açık rızalarını almak</b>. Panel, doğum günü eklerken bu onayı ister.</li>
<li>Özel nitelikli kişisel veri (sağlık, din, siyasi görüş, biyometrik veri vb.) ve çocuklara ait kişisel veri yüklememek.</li>
<li>Ekranın herkese açık bir alanda olduğunu dikkate alarak yalnız gösterilmesinde sakınca olmayan içerikleri eklemek; rızasını geri alan kişinin verisini panelden silmek.</li>
<li>VERBİS kaydı gibi kendi veri sorumlusu yükümlülüklerini yerine getirmek.</li>
</ul>
<h2>4. Müşterileriniz için örnek metin</h2>
<p>Doğum günü kutlaması için müşterinizden rıza alırken kullanabileceğiniz örnek (kendi bilgilerinizle uyarlayın):</p>
<blockquote>"[İşletme adı] olarak, doğum gününüzde adınızın ve kutlama mesajınızın mekânımızdaki ekranlarda gösterilmesi amacıyla adınızı işlemek istiyoruz. Bu bilgi yalnızca bu amaçla kullanılır, kutlamadan sonra tarafımızca silinir ve dijital ekran hizmeti aldığımız ${i.brand} sunucularında tutulur. Onay vermek zorunda değilsiniz; onayınızı dilediğiniz an [iletişim] üzerinden geri alabilirsiniz. ☐ Adımın ekranda gösterilmesine açık rıza veriyorum."</blockquote>
<p>Mekânınızda kamera veya fotoğraf çekimi varsa bunun için ayrıca aydınlatma yapmanız gerekir; bu hizmetin kapsamı dışındadır.</p>
<p class="meta">Sürüm ${VERSION}</p>` },

  kosullar: { title: 'Kullanım Koşulları', body: i => `
<p>Bu koşullar, ${contact(i)} ("Şirket") tarafından sunulan <b>${i.brand}</b> dijital ekran hizmetinin kullanımına ilişkindir. Hesap açarak bu koşulları ve ekindeki <a href="/veri-isleme">Veri İşleme Sözleşmesi</a>'ni kabul etmiş olursunuz.</p>
<h2>1. Hizmet</h2>
<p>${i.brand}, işletmenizdeki televizyonlarda video, fotoğraf, fiyat listesi, duyuru ve bilgi içerikleri göstermenizi sağlayan, web paneli ve Android uygulamasından oluşan bir yazılım hizmetidir. Paket özellikleri, cihaz ve depolama sınırları panelde <b>Ayarlar → Paket</b> bölümünde yazar.</p>
<h2>2. Deneme ve ücretlendirme</h2>
<p>Yeni hesaplar ücretsiz deneme süresiyle açılır. Deneme veya ödenmiş abonelik süresi dolduğunda ekran yayını durur; içerikleriniz silinmez ve abonelik yenilendiğinde ekran kendiliğinden açılır. Fiyatlar ve ödeme koşulları ayrıca bildirilir.</p>
<h2>3. Kullanıcının sorumlulukları</h2>
<ul>
<li>Yüklediğiniz içeriklerin (video, müzik, görsel, logo, metin) kullanım hakkına sahip olmanız gerekir. Telif hakkı, marka hakkı veya kişilik hakkı ihlali doğuran içeriklerden siz sorumlusunuz.</li>
<li>Fiyat listesi ve kampanya bilgilerinin doğruluğu ile Fiyat Etiketi Yönetmeliği başta olmak üzere ilgili mevzuata uygunluk işletmenin sorumluluğundadır.</li>
<li>Ekranda gösterdiğiniz kişilere ait isim ve görüntüler için veri sorumlusu sizsiniz; gerekli aydınlatma ve rızayı siz sağlarsınız (<a href="/veri-isleme">Veri İşleme Sözleşmesi</a>).</li>
<li>Hesap şifrenizi gizli tutmalı, yetkisiz erişim fark ettiğinizde bize bildirmelisiniz.</li>
</ul>
<h2>4. Üçüncü taraf verileri</h2>
<p>Maç skorları, döviz kurları, hava durumu, haberler, nöbetçi eczane, Google yorumları ve Instagram paylaşımları gibi bilgiler üçüncü taraf kaynaklardan otomatik alınır. Şirket bu verilerin kesintisiz, eksiksiz veya hatasız olacağını garanti etmez; kaynak tarafından sağlanmadığında ilgili bölüm ekranda gösterilmeyebilir.</p>
<h2>5. Hizmet sürekliliği</h2>
<p>Hizmetin kesintisiz çalışması için makul özen gösterilir; planlı bakımlar mümkünse önceden duyurulur. İnternet bağlantısı kesildiğinde TV uygulaması önceden indirdiği içerikleri göstermeye devam eder.</p>
<h2>6. Sorumluluğun sınırı</h2>
<p>Şirketin bu hizmetten doğan toplam sorumluluğu, zararın doğduğu tarihten önceki 12 ayda ödediğiniz hizmet bedeliyle sınırlıdır. Dolaylı zararlar ve kâr kaybından Şirket sorumlu değildir. Tüketici mevzuatından doğan emredici haklarınız saklıdır.</p>
<h2>7. Fesih</h2>
<p>Aboneliğinizi dilediğiniz zaman sonlandırabilirsiniz. Bu koşullara aykırı kullanımda Şirket hesabı askıya alabilir. Hesap silme talebinizden 30 gün sonra verileriniz kalıcı olarak silinir (<a href="/kvkk">ayrıntılar</a>).</p>
<h2>8. Değişiklikler ve uyuşmazlık</h2>
<p>Koşullardaki önemli değişiklikler panel üzerinden duyurulur. Bu koşullara Türkiye Cumhuriyeti hukuku uygulanır.</p>
<p class="meta">Sürüm ${VERSION}</p>` },
};

const NAV = [['kvkk', 'KVKK'], ['gizlilik', 'Çerezler'], ['acik-riza', 'Açık Rıza'], ['veri-isleme', 'Veri İşleme'], ['kosullar', 'Koşullar']];
function render(key) {
  const p = PAGES[key]; if (!p) return null;
  const i = Object.fromEntries(Object.entries(info()).map(([k, v]) => [k, esc(v)]));
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" type="image/svg+xml" href="/favicon.svg"><title>${p.title} · ${i.brand}</title>
<meta name="color-scheme" content="light dark"><script>(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()</script>
<link rel="stylesheet" href="/site.css?v=6"></head><body class="legal">
<header class="lh"><a href="/" class="lg"><img class="lg-l" src="/logo-light.svg?v=4" alt="${i.brand}"><img class="lg-d" src="/logo.svg?v=4" alt="${i.brand}"></a><nav>${NAV.map(([k, n]) => `<a href="/${k}"${k === key ? ' aria-current="page"' : ''}>${n}</a>`).join('')}</nav></header>
<main class="lm"><h1>${p.title}</h1>${p.body(i)}</main>
<footer class="lf"><a href="/">${i.brand}</a> · <a href="/login">Panele giriş</a> · Son güncelleme: ${VERSION}</footer></body></html>`;
}

module.exports = { VERSION, render, info, PAGES, KEYS: Object.keys(PAGES) };
