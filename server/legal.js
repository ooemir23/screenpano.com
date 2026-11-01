// KVKK ve sözleşme metinleri. Şirket bilgileri süper yönetim → Platform ayarları → Yasal bilgiler'den gelir.
// ÖNEMLİ: Bu metinler başlangıç taslağıdır; yayına almadan önce bir avukata kontrol ettirin.
const store = require('./store');
const config = require('./config');

const VERSION = '2026-11-01';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const info = () => {
  const g = (k, d) => store.setting(k, '') || d;
  return {
    brand: config.BRAND, company: g('legal_company', '[Şirket unvanı]'), address: g('legal_address', '[Açık adres]'),
    email: g('legal_email', '[kvkk@alanadiniz.com]'), phone: g('legal_phone', '[Telefon]'), mersis: g('legal_mersis', '[MERSİS no]'), kep: g('legal_kep', ''),
    site: g('site_url', 'https://screenpano.com'),
  };
};

const PAGES = {
  kvkk: { title: 'KVKK Aydınlatma Metni', body: i => `
<p>Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu'nun ("KVKK") 10. maddesi uyarınca, <b>${i.brand}</b> hizmetini kullanan işletme yetkililerine ve kullanıcılarına, veri sorumlusu sıfatıyla <b>${i.company}</b> ("Şirket") tarafından sunulmaktadır.</p>
<h2>1. Hangi kişisel verileri işliyoruz?</h2>
<ul>
<li><b>Kimlik ve iletişim:</b> işletme adı, yetkili kullanıcı adı, telefon numarası, uyarılar için verdiğiniz e-posta adresi.</li>
<li><b>Hesap güvenliği:</b> şifrenizin tek yönlü özeti (şifrenin kendisi saklanmaz), oturum bilgisi, giriş zamanları, IP adresi.</li>
<li><b>Cihaz bilgisi:</b> bağladığınız TV kutusunun model/tarayıcı bilgisi, uygulama sürümü, ekran çözünürlüğü, son bağlantı zamanı.</li>
<li><b>İçerik:</b> yüklediğiniz video, fotoğraf, logo, fiyat listesi, duyuru metinleri ve ekranda gösterilmesini istediğiniz isimler (ör. doğum günü kutlamaları).</li>
<li><b>Kullanım istatistiği:</b> içeriklerin kaç kez oynatıldığı ve ekranın açık kalma süresi (kişiyle ilişkilendirilmez).</li>
</ul>
<h2>2. Hangi amaçlarla?</h2>
<p>Hizmet sözleşmesinin kurulması ve ifası (hesabın açılması, içeriklerin ekranınızda gösterilmesi), hesap ve sistem güvenliğinin sağlanması, ekranınız çevrimdışı kaldığında size bilgi verilmesi, faturalandırma ve yasal yükümlülüklerin yerine getirilmesi, destek taleplerinizin yanıtlanması.</p>
<h2>3. Hukuki sebepler</h2>
<p>KVKK m.5/2-c (sözleşmenin kurulması ve ifası), m.5/2-ç (hukuki yükümlülük), m.5/2-f (meşru menfaat: güvenlik, hizmetin iyileştirilmesi). Pazarlama iletileri yalnızca açık rızanız varsa gönderilir (m.5/1).</p>
<h2>4. Kimlere aktarılır?</h2>
<p>Hizmetin çalışması için gereken altyapı sağlayıcılarına (sunucu barındırma, dosya depolama, e-posta gönderimi) ve kanunen yetkili kamu kurumlarına. Altyapı sağlayıcılarının bir kısmı yurt dışında olabilir; bu durumda aktarım KVKK m.9'daki şartlara uygun olarak yapılır.</p>
<h2>5. Saklama süresi</h2>
<p>Hesabınız açık olduğu sürece; hesap kapandıktan sonra yasal saklama süreleri boyunca. Hesap silme talebinizden 30 gün sonra içerikleriniz ve hesabınız kalıcı olarak silinir. Kullanım istatistikleri 400 günden sonra otomatik silinir.</p>
<h2>6. Haklarınız (KVKK m.11)</h2>
<p>Verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltilmesini veya silinmesini isteme, aktarıldığı üçüncü kişileri bilme, itiraz etme ve zararın giderilmesini talep etme haklarına sahipsiniz. Panelde <b>Ayarlar → Verilerim</b> bölümünden tüm verilerinizi indirebilir ve hesap silme talebi oluşturabilirsiniz. Diğer talepleriniz için: <b>${i.email}</b>${i.kep ? ` · KEP: ${i.kep}` : ''}.</p>
<h2>7. İşletmenizin müşterilerine ait veriler</h2>
<p>Ekranda gösterdiğiniz müşteri isimleri (doğum günü kutlaması gibi) ve görüntüler bakımından <b>veri sorumlusu işletmenizdir</b>; Şirket bu verileri yalnızca sizin talimatınızla, veri işleyen sıfatıyla işler. Bu kişilerin açık rızasını almak ve onları aydınlatmak sizin sorumluluğunuzdadır.</p>
<p class="meta">Veri sorumlusu: ${i.company} · ${i.address} · MERSİS: ${i.mersis} · ${i.phone}</p>` },

  kosullar: { title: 'Kullanım Koşulları', body: i => `
<p>Bu koşullar, <b>${i.company}</b> ("Şirket") tarafından sunulan <b>${i.brand}</b> dijital ekran hizmetinin kullanımına ilişkindir. Hesap açarak bu koşulları kabul etmiş olursunuz.</p>
<h2>1. Hizmet</h2>
<p>${i.brand}, işletmenizdeki televizyonlarda video, fotoğraf, fiyat listesi, duyuru ve bilgi içerikleri göstermenizi sağlayan, web paneli ve Android uygulamasından oluşan bir yazılım hizmetidir. Paket özellikleri, cihaz ve depolama sınırları panelde <b>Ayarlar → Paket</b> bölümünde yazar.</p>
<h2>2. Deneme ve ücretlendirme</h2>
<p>Yeni hesaplar ücretsiz deneme süresiyle açılır. Deneme veya ödenmiş abonelik süresi dolduğunda ekran yayını durur; içerikleriniz silinmez ve abonelik yenilendiğinde ekran kendiliğinden açılır. Fiyatlar ve ödeme koşulları ayrıca bildirilir.</p>
<h2>3. Kullanıcının sorumlulukları</h2>
<ul>
<li>Yüklediğiniz içeriklerin (video, müzik, görsel, logo, metin) kullanım hakkına sahip olmanız gerekir. Telif hakkı, marka hakkı veya kişilik hakkı ihlali doğuran içeriklerden siz sorumlusunuz.</li>
<li>Fiyat listesi ve kampanya bilgilerinin doğruluğu ile Fiyat Etiketi Yönetmeliği başta olmak üzere ilgili mevzuata uygunluk işletmenin sorumluluğundadır.</li>
<li>Ekranda gösterdiğiniz kişilere ait isim ve görüntüler için KVKK kapsamında gerekli aydınlatma ve rızayı siz sağlarsınız.</li>
<li>Hesap şifrenizi gizli tutmalı, yetkisiz erişim fark ettiğinizde bize bildirmelisiniz.</li>
</ul>
<h2>4. Üçüncü taraf verileri</h2>
<p>Maç skorları, döviz kurları, hava durumu, haberler, nöbetçi eczane, Google yorumları ve Instagram paylaşımları gibi bilgiler üçüncü taraf kaynaklardan otomatik alınır. Şirket bu verilerin kesintisiz, eksiksiz veya hatasız olacağını garanti etmez; kaynak tarafından sağlanmadığında ilgili bölüm ekranda gösterilmeyebilir.</p>
<h2>5. Hizmet sürekliliği</h2>
<p>Hizmetin kesintisiz çalışması için makul özen gösterilir; planlı bakımlar mümkünse önceden duyurulur. İnternet bağlantısı kesildiğinde TV uygulaması önceden indirdiği içerikleri göstermeye devam eder.</p>
<h2>6. Sorumluluğun sınırı</h2>
<p>Şirketin bu hizmetten doğan toplam sorumluluğu, zararın doğduğu tarihten önceki 12 ayda ödediğiniz hizmet bedeliyle sınırlıdır. Dolaylı zararlar ve kâr kaybından Şirket sorumlu değildir. Tüketici mevzuatından doğan emredici haklarınız saklıdır.</p>
<h2>7. Fesih</h2>
<p>Aboneliğinizi dilediğiniz zaman sonlandırabilirsiniz. Bu koşullara aykırı kullanımda Şirket hesabı askıya alabilir. Hesap silme talebinizden 30 gün sonra verileriniz kalıcı olarak silinir.</p>
<h2>8. Değişiklikler ve uyuşmazlık</h2>
<p>Koşullardaki önemli değişiklikler panel üzerinden duyurulur. Bu koşullara Türkiye Cumhuriyeti hukuku uygulanır.</p>
<p class="meta">${i.company} · ${i.address} · ${i.email} · ${i.phone}</p>` },

  gizlilik: { title: 'Gizlilik ve Çerez Politikası', body: i => `
<p>${i.brand} web sitesi ve paneli yalnızca hizmetin çalışması için zorunlu çerezleri kullanır.</p>
<h2>Kullandığımız çerezler</h2>
<ul>
<li><b>sid</b> (zorunlu): panele giriş yaptığınızda oturumunuzu tanımak için. 30 gün geçerlidir, çıkış yapınca silinir.</li>
</ul>
<p>Reklam, analitik veya üçüncü taraf takip çerezi kullanılmaz. TV uygulaması, bağlandığı işletmeyi hatırlamak için cihazda bir erişim anahtarı ve internet kesildiğinde gösterebilmek için içeriklerin bir kopyasını saklar.</p>
<h2>Güvenlik</h2>
<p>Şifreler tek yönlü özetlenerek (scrypt) saklanır, bağlantılar HTTPS ile şifrelenir, cihaz anahtarlarının yalnızca özeti tutulur. Veritabanı her gece yedeklenir.</p>
<p>Kişisel verilerinizle ilgili ayrıntılar için <a href="/kvkk">KVKK Aydınlatma Metni</a>'ni okuyun. Sorularınız için: <b>${i.email}</b></p>` },
};

function render(key) {
  const p = PAGES[key]; if (!p) return null;
  const i = Object.fromEntries(Object.entries(info()).map(([k, v]) => [k, esc(v)]));
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" type="image/svg+xml" href="/favicon.svg"><title>${p.title} · ${i.brand}</title>
<link rel="stylesheet" href="/site.css"></head><body class="legal">
<header class="lh"><a href="/" class="lg"><img src="/logo-light.svg" alt="${i.brand}" onerror="this.src='/logo.svg'"></a><nav><a href="/kosullar">Kullanım Koşulları</a><a href="/kvkk">KVKK</a><a href="/gizlilik">Gizlilik</a></nav></header>
<main class="lm"><h1>${p.title}</h1><p class="meta">Sürüm ${VERSION}</p>${p.body(i)}</main>
<footer class="lf"><a href="/">${i.brand}</a> · <a href="/login">Panele giriş</a></footer></body></html>`;
}

module.exports = { VERSION, render, info, PAGES };
