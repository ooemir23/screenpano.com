#!/usr/bin/env node
// ScreenPano e-posta taslaklarını test etmek ve tarayıcıda incelemek için önizleme üretici.
// Kullanım: node tools/preview-mails.js
const fs = require('fs');
const path = require('path');
const mailtpl = require('../server/mailtpl');
const weekly = require('../server/weekly');
const stats = require('../server/stats');

const OUT_DIR = path.join(__dirname, '..', 'data', 'mail-previews');
fs.mkdirSync(OUT_DIR, { recursive: true });

// 1. Ekran Çevrimdışı
const offHtml = mailtpl.alert({
  title: 'Ekran Bağlantısı Kesildi',
  badge: 'Cihaz Çevrimdışı',
  badgeColor: 'danger',
  preheader: 'Salon TV ekranı 10:45 saatinden beri çevrimdışı. Lütfen kontrol edin.',
  lead: '<b>Bomera Lounge</b> işletmenize ait <b>Salon TV</b> ekranı <b>10:45</b> tarihinden beri sunucuya yanıt vermiyor. Ekran yayınınız durmuş olabilir.',
  rows: [
    ['İşletme', 'Bomera Lounge'],
    ['Cihaz Adı', 'Salon TV'],
    ['Son Bağlantı', '10.11.2026 10:45'],
    ['Durum', '<span style="color:#b91c1c;font-weight:700">● Bağlantı Kesildi (Çevrimdışı)</span>'],
  ],
  bulletTitle: 'Lütfen aşağıdaki adımları kontrol edin:',
  bullets: [
    'TV ekranının ve TV kutusunun elektriğe bağlı ve açık olduğunu kontrol edin.',
    'Kutunun Wi-Fi veya Ethernet internet bağlantısının aktif olduğunu doğrulayın.',
    'Ekranda ScreenPano uygulamasının çalıştığını kontrol edin (kapandıysa uygulamayı açın).',
  ],
  callout: '💡 <b>Hızlı Çözüm:</b> İnternet bağlantısı olmasına rağmen ekran yayına başlamıyorsa TV kutusunu fişten çekip 10 saniye bekledikten sonra tekrar takarak yeniden başlatın.',
  calloutType: 'tip',
  cta: 'https://screenpano.com/panel#settings/devices',
  ctaLabel: 'Cihaz Durumunu İncele',
  small: 'Cihaz tekrar internete bağlanıp yayına başladığında sistem otomatik olarak bilgilendirme e-postası gönderecektir.',
});

// 2. Ekran Yeniden Yayında
const onHtml = mailtpl.alert({
  title: 'Ekranınız Yeniden Yayında',
  badge: 'Yeniden Yayında',
  badgeColor: 'success',
  preheader: 'Salon TV ekranı yeniden bağlandı ve yayına devam ediyor.',
  lead: '<b>Bomera Lounge</b> bünyesindeki <b>Salon TV</b> ekranı sunucularımızla yeniden bağlantı kurdu. İçerikleriniz ve menüleriniz kesintisiz olarak yayınlanmaya devam ediyor.',
  rows: [
    ['İşletme', 'Bomera Lounge'],
    ['Ekran / Cihaz', 'Salon TV'],
    ['Yeniden Bağlanma', '10.11.2026 11:02'],
    ['Yayın Durumu', '<span style="color:#15803d;font-weight:700">● Yayında (Aktif)</span>'],
  ],
  cta: 'https://screenpano.com/panel',
  ctaLabel: 'Ekranları Panelde Gör',
});

// 3. Haftalık Performans Karnesi
const origSummary = stats.summary;
stats.summary = () => ({
  daily: [{ day: '2026-11-03' }, { day: '2026-11-09' }],
  totals: { online: 2840, plays: 1650, scans: 342, drops: 0, dropsec: 0 },
  prev: { online: 2400, plays: 1400, scans: 280 },
  impact: [
    { id: '1', name: 'Günün Spesiyali & Şef Menüsü', shown: 620, scans: 148, rate: 23.8, peakHour: 13 },
    { id: '2', name: 'Akşam Happy Hour Kokteyller', shown: 450, scans: 112, rate: 24.8, peakHour: 20 },
    { id: '3', name: 'Tatlı & Kahve Menüsü', shown: 380, scans: 82, rate: 21.5, peakHour: 16 }
  ]
});
const wkHtml = weekly.html({ id: 't1', name: 'Bomera Lounge', db: { videos: [] } });
stats.summary = origSummary;

// 4. Şifre Sıfırlama
const pwHtml = mailtpl.html({
  title: 'Şifre Sıfırlama Talebi',
  badge: 'Güvenlik Bildirimi',
  badgeColor: 'warning',
  preheader: 'yonetici hesabı için yeni şifre belirleme bağlantısı.',
  body: mailtpl.p('Merhaba <b>Bomera Lounge</b>,') +
    mailtpl.p('ScreenPano yönetim panelinde <b>yonetici</b> (işletme yöneticisi) için yeni şifre talebinde bulunuldu. Aşağıdaki tek kullanımlık güvenli bağlantıya tıklayarak yeni şifrenizi belirleyebilirsiniz.') +
    mailtpl.panelTable([
      ['Kullanıcı Hesabı', 'yonetici · İşletme Yöneticisi'],
      ['Talep Zamanı', '10 Kasım 2026, 01:45'],
      ['Geçerlilik Süresi', '30 Dakika · Tek Kullanımlık'],
    ]) +
    mailtpl.callout('<b>Güvenlik Hatırlatması:</b> Bu şifre sıfırlama talebini siz veya yetkili personeliniz başlatmadıysa bu iletiyi dikkate almayın. Bağlantı kullanılmadığı takdirde mevcut şifreniz değişmez ve hesabınız güvende kalır.', 'warning'),
  cta: 'https://screenpano.com/login#reset=ornek-token',
  ctaLabel: 'Yeni Şifre Belirle',
  small: 'Bu bağlantı tek kullanımlıktır ve 30 dakika sonra kendiliğinden geçersiz hale gelir.',
});

// 5. E-posta Doğrulama
const verifyHtml = mailtpl.html({
  title: 'E-posta Adresinizi Doğrulayın',
  badge: 'E-posta Doğrulama',
  badgeColor: 'brand',
  preheader: 'ScreenPano bildirimleri ve hesap güvenliği için e-postanızı doğrulayın.',
  body: mailtpl.p('Merhaba <b>Bomera Lounge</b>,') +
    mailtpl.p('ScreenPano dijital ekran yönetim sistemine hoş geldiniz. Ekranınız çevrimdışı kaldığında anında uyarı alabilmek, haftalık performans raporlarınıza erişebilmek ve hesap güvenliğinizi sağlamak için lütfen e-posta adresinizi onaylayın.') +
    mailtpl.panelTable([
      ['İşletme Adı', 'Bomera Lounge'],
      ['Doğrulanacak E-posta', 'bildirim@bomera.com'],
      ['Bağlantı Geçerliliği', '7 Gün'],
    ]),
  cta: 'https://screenpano.com/api/auth/verify-email?token=ornek',
  ctaLabel: 'E-posta Adresimi Doğrula',
  small: 'Bu kaydı siz veya işletmeniz oluşturmadıysa bu e-postayı dikkate almayın; bağlantı tıklanmadığı sürece hiçbir işlem yapılmaz.',
});

// 6. Bildirim Testi
const testHtml = mailtpl.alert({
  title: 'E-posta Bildirimleriniz Hazır',
  badge: 'Bildirim Testi',
  badgeColor: 'info',
  preheader: 'Bomera Lounge işletmesi için e-posta bildirim sistemi hazır.',
  lead: 'Bu bir test iletisidir. <b>Bomera Lounge</b> işletmeniz için e-posta uyarı ve bildirim sistemi başarıyla yapılandırılmıştır.',
  rows: [
    ['İşletme Adı', 'Bomera Lounge'],
    ['Bildirim Adresi', 'bildirim@bomera.com'],
    ['Cihaz Uyarı Eşiği', '5 Dakika Kesinti'],
    ['Sistem Durumu', '<span style="color:#15803d;font-weight:700">● Aktif ve Hazır</span>'],
  ],
  bulletTitle: 'Bu adrese iletilecek bildirimler:',
  bullets: [
    'Ekranlarınız çevrimdışı kaldığında (bağlantı kesintisi eşiğini aştığında) anlık e-posta uyarısı',
    'Cihazlar yeniden internete bağlandığında ve yayına başladığında bilgilendirme iletisi',
    'Açık olduğu takdirde her Pazartesi sabahı haftalık ekran performansı ve kampanya etkileşim karnesi',
  ],
  cta: 'https://screenpano.com/panel#settings/notify',
  ctaLabel: 'Bildirim Ayarlarını Yönet',
});

// İndeks sayfası
const files = [
  { name: '1-ekran-cevrimdisi.html', title: '1. Ekran Çevrimdışı Uyarısı', html: offHtml },
  { name: '2-ekran-yayinda.html', title: '2. Ekran Yeniden Yayında', html: onHtml },
  { name: '3-haftalik-ozet.html', title: '3. Haftalık Performans Karnesi', html: wkHtml },
  { name: '4-sifre-sifirlama.html', title: '4. Şifre Sıfırlama Talebi', html: pwHtml },
  { name: '5-eposta-dogrulama.html', title: '5. E-posta Doğrulama', html: verifyHtml },
  { name: '6-bildirim-testi.html', title: '6. Bildirim Testi', html: testHtml },
];

for (const f of files) {
  fs.writeFileSync(path.join(OUT_DIR, f.name), f.html, 'utf8');
}

const indexHtml = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <title>ScreenPano E-posta Taslakları Önizleme</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #111315; color: #f2efe9; margin: 0; padding: 40px 20px; }
    .wrap { max-width: 800px; margin: 0 auto; }
    h1 { color: #c9955c; margin-bottom: 8px; }
    p { color: #9ca3af; margin-bottom: 24px; font-size: 15px; }
    .grid { display: grid; gap: 12px; }
    .card { display: flex; align-items: center; justify-content: space-between; background: #1b1e1e; border: 1px solid rgba(255,255,255,0.08); padding: 18px 22px; border-radius: 12px; text-decoration: none; color: #f2efe9; transition: all .2s; }
    .card:hover { border-color: #c9955c; background: #232727; transform: translateY(-2px); }
    .badge { font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 20px; background: rgba(201,149,92,0.15); color: #c9955c; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>ScreenPano E-posta Taslakları</h1>
    <p>Aşağıdaki bağlantılara tıklayarak yeni kurumsal e-posta taslaklarını tarayıcınızda doğrudan görüntüleyebilirsiniz:</p>
    <div class="grid">
      ${files.map(f => `<a class="card" href="./${f.name}" target="_blank"><span>${f.title}</span><span class="badge">Önizle &rarr;</span></a>`).join('')}
    </div>
  </div>
</body>
</html>`;

fs.writeFileSync(path.join(OUT_DIR, 'index.html'), indexHtml, 'utf8');
console.log('✅ Tüm e-posta taslakları başarıyla üretildi: ' + OUT_DIR);
