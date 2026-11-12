// Widget kataloğu, hazır düzen şablonları ve temalar. Panel bunu /api/admin/catalog'dan okur.
// Izgara 24 sütun x 24 satır; her widget {type, x, y, w, h, props}.
const COLS = 24, ROWS = 24;

const WIDGETS = {
  media:   { name: 'Medya oynatıcı', desc: 'Video ve fotoğraf döngüsü; kampanya, büyük maç ve fragmanlar da burada çıkar', pro: false, required: true, min: [8, 8], props: { fit: 'auto' } },
  logo:    { name: 'Logo', desc: 'İşletme logosu; kutuya sığdırma, hizalama ve iç boşluk ayarlanır', pro: false, min: [3, 2], props: { fit: 'contain', align: 'center', pad: 'none' }, enums: { fit: ['contain', 'cover', 'fill'], align: ['left', 'center', 'right'], pad: ['none', 'sm', 'lg'] } },
  clock:   { name: 'Saat ve tarih', desc: 'Saat, tarih ya da ikisi birden; her kutuda ayrı gösterim seçilir (birden çok eklenebilir)', pro: false, min: [2, 1], multi: 4, props: { seconds: false, show: 'both' }, enums: { show: ['both', 'time', 'date'] } },
  worldclock: { name: 'Dünya saatleri', desc: 'Seçtiğiniz ülke ve şehirlerin saati yan yana (en çok 5); istenirse birden çok kutu eklenir', pro: false, min: [6, 2], multi: 4, props: { zones: 'Europe/London,America/New_York,Asia/Tokyo', seconds: false } },
  prayer:  { name: 'Namaz vakitleri / güneş', desc: 'İşletmenin konumuna göre namaz vakitleri (sıradaki vakte kalan süreyle) ya da yalnız gün doğumu ve batımı; birden çok eklenebilir', pro: false, min: [4, 3], multi: 2, props: { mode: 'prayer' }, enums: { mode: ['prayer', 'sun'] } },
  converter: { name: 'Döviz çevirici', desc: 'Seçtiğiniz tutarın (örneğin 100) dolar, euro, sterlin ya da gram altın karşılığı TL olarak; birden çok eklenebilir', pro: false, min: [4, 3], multi: 2, props: { amount: '100', currencies: 'USD,EUR,GBP' } },
  rates:   { name: 'Hava ve piyasalar', desc: 'Hava durumu, döviz, altın, BIST, Bitcoin ve istenirse QR kodlar; hava ve piyasa ayrı kutulara konabilir (birden çok eklenebilir)', pro: false, min: [3, 2], multi: 4, props: { weather: true, rates: true, qr: false, qrs: '', valSize: 'xl', details: false, city: '', lat: null, lon: null }, enums: { valSize: ['s', 'm', 'l', 'xl'] } },
  weather: { name: 'Hava durumu', desc: 'Yalnız hava durumu (sıcaklık ve gün gün tahmin); piyasalardan ayrı bir kutuya konur', pro: false, min: [3, 2], multi: 6, props: { details: false, city: '', lat: null, lon: null } },
  finance: { name: 'Finans', desc: 'Yalnız döviz, altın, borsa ve Bitcoin; hava durumundan ayrı bir kutuya konur', pro: false, min: [3, 2], multi: 4, props: { valSize: 'xl' }, enums: { valSize: ['s', 'm', 'l', 'xl'] } },
  ticker:  { name: 'Kayan bant', desc: 'Skorlar, haberler, kurlar ve bilgiler kayar', pro: false, min: [10, 2], props: { clock: true } },
  text:    { name: 'Yazı ve duyuru kutusu', desc: 'Rezervasyon, telefon, duyuru veya özel metin; birden çok eklenebilir, medyanın üstüne ya da yanına konabilir', pro: false, min: [3, 2], multi: 8, props: { title: 'Rezervasyon', body: '', align: 'center', size: 'm' }, enums: { align: ['left', 'center', 'right'], size: ['xs', 's', 'm', 'l', 'xl'] } },
  image:   { name: 'Görsel', desc: 'Sabit afiş veya fotoğraf', pro: false, min: [3, 3], props: { url: '', fit: 'cover' } },
  qr:      { name: 'QR kart', desc: 'Seçtiğiniz QR kodu ya da tüm QR kodlarınızı sırayla gösterir; birden çok eklenebilir ve diğer kutuların üstüne konabilir', pro: false, min: [2, 3], multi: 6, props: { qr: '', style: 'below', size: 'auto', text: 'm', look: 'classic' }, enums: { look: ['classic', 'card', 'soft'], style: ['below', 'right', 'left', 'plain'], size: ['xs', 's', 'auto', 'l', 'xl', 'box'], text: ['s', 'm', 'l'] } },
  info:    { name: 'Maçlar ve bilgi sayfaları', desc: 'Maçlar, puan durumu, nöbetçi eczane, haber, sinema, tarihte bugün, trafik', pro: true, min: [5, 8] },
  reviews: { name: 'Google yorumları', desc: 'Müşteri yorumları şeridi', pro: true, min: [8, 2] },
  menu:    { name: 'Fiyat tarifesi', desc: 'Kategori, ürün ve fiyat listesi (Fiyat Etiketi Yönetmeliği için)', min: [5, 6], props: { title: 'Fiyat Listesi' } },
  music:   { name: 'Müzik', desc: 'Spotify / YouTube Müzik: şarkı değişince kapak ve ad açılır, birkaç saniye sonra yalnız kapak görseline küçülür', pro: false, min: [3, 3] },
};

const CONV = ['USD', 'EUR', 'GBP', 'XAU']; // XAU: gram altın
const W = (type, x, y, w, h, props) => ({ type, x, y, w, h, ...(props ? { props } : {}) });

// Yazı kutusu: Türkçe + en/de/ru/ar çevirisi
const TX = (x, y, w, h, tr, en, de, ru, ar, extra) => W('text', x, y, w, h, { title: tr[0], body: tr[1], align: 'center', size: 's', ...(extra || {}), i18n: { en: { title: en[0], body: en[1] }, de: { title: de[0], body: de[1] }, ru: { title: ru[0], body: ru[1] }, ar: { title: ar[0], body: ar[1] } } });
const QRC = { qr: '', style: 'below', size: 'auto', text: 'm', look: 'card' };

const TEMPLATES = {
  spor: {
    name: 'Spor kafe (klasik)', desc: 'Büyük medya, sağda maçlar ve kurlar, altta yorumlar ve kayan bant',
    widgets: [W('media', 0, 0, 17, 19), W('reviews', 0, 19, 17, 3), W('logo', 17, 0, 7, 3), W('info', 17, 3, 7, 13), W('rates', 17, 16, 7, 6), W('ticker', 0, 22, 24, 2)],
  },
  kahve: {
    name: 'Kahve Dükkanı / pastane', desc: 'Medya, yanda fiyat tarifesi, saat ve hava',
    widgets: [W('media', 0, 0, 16, 22), W('logo', 16, 0, 8, 3), W('menu', 16, 3, 8, 13), W('clock', 16, 16, 8, 6), W('ticker', 0, 22, 24, 2)],
  },
  vitrin: {
    name: 'Vitrin / fiyat tarifesi', desc: 'Giriş kapısı ekranı: büyük fiyat listesi, logo ve QR',
    widgets: [W('logo', 0, 0, 8, 4), W('clock', 16, 0, 8, 4), W('text', 8, 0, 8, 4, { title: 'Hoş geldiniz', body: '', align: 'center', size: 'm' }), W('menu', 0, 4, 16, 20), W('qr', 16, 4, 8, 10), W('rates', 16, 14, 8, 10)],
  },
  temel: {
    name: 'Temel', desc: 'Medya, logo, saat, hava ve kurlar, QR ve kayan bant (Başlangıç paketine uygun)',
    widgets: [W('media', 0, 0, 17, 22), W('logo', 17, 0, 7, 4), W('clock', 17, 4, 7, 5), W('rates', 17, 9, 7, 7), W('qr', 17, 16, 7, 6), W('ticker', 0, 22, 24, 2)],
  },
  lounge: {
    name: 'Lüks lounge (cam)', desc: 'Üstte logo ve saat, solda geniş medya, sağda maçlar ile hava/kurlar ve QR, altta kayan bant',
    widgets: [W('logo', 0, 0, 8, 3), W('clock', 17, 0, 7, 3), W('media', 0, 3, 16, 19), W('info', 16, 3, 8, 9), W('rates', 16, 12, 8, 6), W('qr', 16, 18, 8, 4), W('ticker', 0, 22, 24, 2)],
  },
  otel: {
    name: 'Otel / lobi', desc: 'Solda geniş tanıtım medyası; sağda logo, saat, hava, Wi-Fi QR; altta karşılama, kahvaltı ve resepsiyon bilgisi, kayan bant',
    widgets: [
      W('media', 0, 0, 16, 15), W('worldclock', 0, 15, 16, 3, { zones: 'Europe/London,Europe/Moscow,Asia/Dubai,America/New_York,Asia/Tokyo', seconds: false }),
      W('logo', 16, 0, 8, 3), W('clock', 16, 3, 8, 4, { seconds: false, show: 'both' }),
      W('rates', 16, 7, 8, 5, { weather: true, rates: false, qr: false, qrs: '', valSize: 'xl' }),
      W('qr', 16, 12, 8, 10, { qr: '', style: 'below', size: 'auto', text: 'm', look: 'card' }),
      W('text', 0, 18, 8, 4, { title: 'Hoş geldiniz', body: 'Keyifli bir konaklama dileriz', align: 'center', size: 's', i18n: { en: { title: 'Welcome', body: 'We wish you a pleasant stay' }, de: { title: 'Willkommen', body: 'Wir wünschen Ihnen einen angenehmen Aufenthalt' }, ru: { title: 'Добро пожаловать', body: 'Желаем вам приятного отдыха' }, ar: { title: 'أهلاً وسهلاً', body: 'نتمنى لكم إقامة ممتعة' } } }),
      W('text', 8, 18, 8, 4, { title: 'Kahvaltı 07:00 – 10:30', body: 'Restoran · Zemin kat', align: 'center', size: 's', i18n: { en: { title: 'Breakfast 07:00 – 10:30', body: 'Restaurant · Ground floor' }, de: { title: 'Frühstück 07:00 – 10:30', body: 'Restaurant · Erdgeschoss' }, ru: { title: 'Завтрак 07:00 – 10:30', body: 'Ресторан · 1 этаж' }, ar: { title: 'الإفطار 07:00 – 10:30', body: 'المطعم · الطابق الأرضي' } } }),
      W('ticker', 0, 22, 24, 2, { clock: false }), // saat sağdaki kutuda zaten var
    ],
  },
  pastane: {
    name: 'Pastane / fırın', desc: 'Büyük ürün medyası, günün ürünü, yanda fiyat tarifesi, altta "sıcak çıktı" duyurusu',
    widgets: [
      W('media', 0, 0, 17, 18), W('logo', 17, 0, 7, 3),
      TX(17, 3, 7, 4, ['Günün ürünü', 'Taze ve sıcak'], ['Product of the day', 'Fresh and warm'], ['Produkt des Tages', 'Frisch und warm'], ['Блюдо дня', 'Свежее и горячее'], ['منتج اليوم', 'طازج وساخن'], { size: 's' }),
      W('menu', 17, 7, 7, 15),
      TX(0, 18, 17, 4, ['Sıcak çıktı', 'Taze çıkanlar tezgâhta'], ['Fresh out of the oven', 'Straight from the oven to the counter'], ['Frisch aus dem Ofen', 'Direkt vom Ofen auf die Theke'], ['Только из печи', 'Прямо из печи на прилавок'], ['خرج للتو من الفرن', 'من الفرن مباشرة إلى الواجهة']),
      W('ticker', 0, 22, 24, 2),
    ],
  },
  spa: {
    name: 'Spa / güzellik salonu', desc: 'Sakin tanıtım medyası, saat ve hava, randevu QR kartı ve karşılama yazısı',
    widgets: [
      W('media', 0, 0, 16, 16), W('logo', 16, 0, 8, 3), W('clock', 16, 3, 8, 4, { seconds: false, show: 'both' }), W('weather', 16, 7, 8, 4),
      W('qr', 16, 11, 8, 11, QRC),
      TX(0, 16, 16, 6, ['Kendinize zaman ayırın', 'Randevu için resepsiyona danışın ya da QR kodu okutun'], ['Take time for yourself', 'Ask at reception or scan the QR code to book'], ['Gönnen Sie sich eine Auszeit', 'Termin an der Rezeption oder per QR-Code'], ['Уделите время себе', 'Запись на ресепшн или по QR-коду'], ['خصصوا وقتًا لأنفسكم', 'للحجز اسألوا الاستقبال أو امسحوا رمز QR']),
      W('ticker', 0, 22, 24, 2, { clock: false }),
    ],
  },
  salon: {
    name: 'Spor salonu', desc: 'Medya, ders programı, deneme dersi duyurusu, QR ve saat',
    widgets: [
      W('media', 0, 0, 16, 16), W('logo', 16, 0, 8, 3), W('clock', 16, 3, 8, 4, { seconds: false, show: 'both' }),
      TX(16, 7, 8, 7, ['Ders programı', 'Pilates 09:00\nYoga 12:00\nSpinning 18:30'], ['Class schedule', 'Pilates 09:00\nYoga 12:00\nSpinning 18:30'], ['Kursplan', 'Pilates 09:00\nYoga 12:00\nSpinning 18:30'], ['Расписание занятий', 'Пилатес 09:00\nЙога 12:00\nСпиннинг 18:30'], ['جدول الحصص', 'بيلاتس 09:00\nيوغا 12:00\nسبينينغ 18:30'], { align: 'left', size: 's' }),
      TX(16, 14, 8, 4, ['Deneme dersi', 'İlk ders bizden'], ['Trial class', 'Your first class is on us'], ['Probetraining', 'Die erste Stunde geht auf uns'], ['Пробное занятие', 'Первое занятие за наш счёт'], ['حصة تجريبية', 'الحصة الأولى علينا'], { size: 's' }),
      W('qr', 16, 18, 8, 4, { qr: '', style: 'right', size: 'box', text: 's', look: 'card' }),
      TX(0, 16, 16, 6, ['Bugün de bir adım öne geçin', ''], ['Take one more step today', ''], ['Heute wieder einen Schritt weiter', ''], ['Сделайте ещё один шаг сегодня', ''], ['خطوة جديدة إلى الأمام اليوم', ''], { size: 's' }),
      W('ticker', 0, 22, 24, 2, { clock: false }),
    ],
  },
  klinik: {
    name: 'Klinik / bekleme salonu', desc: 'Bilgilendirme medyası, saat ve hava, karşılama yazısı ve randevu / Wi-Fi QR kartı',
    widgets: [
      W('media', 0, 0, 16, 17), W('logo', 16, 0, 8, 3), W('clock', 16, 3, 8, 4, { seconds: false, show: 'both' }), W('weather', 16, 7, 8, 4),
      TX(16, 11, 8, 5, ['Hoş geldiniz', 'Geçmiş olsun'], ['Welcome', 'We wish you well'], ['Willkommen', 'Gute Besserung'], ['Добро пожаловать', 'Желаем скорейшего выздоровления'], ['أهلاً وسهلاً', 'نتمنى لكم الشفاء العاجل'], { size: 's' }),
      W('qr', 16, 16, 8, 6, QRC),
      TX(0, 17, 16, 5, ['Bekleme salonumuza hoş geldiniz', 'Hekimimiz sizi kısa süre içinde alacaktır'], ['Welcome to our waiting room', 'The doctor will see you shortly'], ['Willkommen in unserem Wartebereich', 'Der Arzt empfängt Sie in Kürze'], ['Добро пожаловать в зал ожидания', 'Врач примет вас в ближайшее время'], ['أهلاً بكم في قاعة الانتظار', 'سيستقبلكم الطبيب بعد قليل']),
      W('ticker', 0, 22, 24, 2, { clock: false }),
    ],
  },
  magaza: {
    name: 'Mağaza vitrini', desc: 'Tam genişlikte kampanya medyası; altta logo, indirim duyurusu ve QR',
    widgets: [
      W('media', 0, 0, 24, 19), W('logo', 0, 19, 6, 3),
      TX(6, 19, 12, 3, ['Sezon indirimi başladı', 'Seçili ürünlerde fırsatlar'], ['Season sale is on', 'Deals on selected items'], ['Saisonverkauf gestartet', 'Angebote auf ausgewählte Artikel'], ['Сезонная распродажа', 'Выгодные предложения на выбранные товары'], ['بدأت تخفيضات الموسم', 'عروض على منتجات مختارة']),
      W('qr', 18, 19, 6, 3, { qr: '', style: 'right', size: 'box', text: 's', look: 'card' }),
      W('ticker', 0, 22, 24, 2),
    ],
  },
  hizli: {
    name: 'Hızlı servis / sipariş panosu', desc: 'Solda büyük menü panosu, sağda ürün medyası, logo, menü fırsatı ve QR',
    widgets: [
      W('menu', 0, 0, 15, 22), W('media', 15, 0, 9, 11), W('logo', 15, 11, 9, 3),
      TX(15, 14, 9, 4, ['Menü fırsatı', 'Burger + patates + içecek'], ['Meal deal', 'Burger + fries + drink'], ['Menü-Angebot', 'Burger + Pommes + Getränk'], ['Комбо-предложение', 'Бургер + картофель + напиток'], ['وجبة موفرة', 'برغر + بطاطس + مشروب'], { size: 's' }),
      W('qr', 15, 18, 9, 4, { qr: '', style: 'right', size: 'box', text: 's', look: 'card' }),
      W('ticker', 0, 22, 24, 2),
    ],
  },
  kampus: {
    name: 'Kampüs / ofis', desc: 'Duyuru medyası, saat, dünya saatleri, hava, duyuru kutusu ve karşılama yazısı',
    widgets: [
      W('media', 0, 0, 16, 16), W('logo', 16, 0, 8, 3), W('clock', 16, 3, 8, 4, { seconds: false, show: 'both' }),
      W('worldclock', 16, 7, 8, 4, { zones: 'Europe/London,America/New_York,Asia/Tokyo', seconds: false }), W('weather', 16, 11, 8, 4),
      TX(16, 15, 8, 7, ['Duyurular', 'Toplantı 14:00\nYemekhane 12:00'], ['Announcements', 'Meeting 14:00\nCanteen 12:00'], ['Ankündigungen', 'Besprechung 14:00\nKantine 12:00'], ['Объявления', 'Совещание 14:00\nСтоловая 12:00'], ['إعلانات', 'اجتماع 14:00\nالمطعم 12:00'], { align: 'left', size: 's' }),
      TX(0, 16, 16, 6, ['Hoş geldiniz', 'İyi çalışmalar'], ['Welcome', 'Have a great day'], ['Willkommen', 'Einen guten Tag'], ['Добро пожаловать', 'Хорошего рабочего дня'], ['أهلاً وسهلاً', 'نتمنى لكم يومًا موفقًا'], { size: 'l' }),
      W('ticker', 0, 22, 24, 2, { clock: false }),
    ],
  },
  etkinlik: {
    name: 'Etkinlik / düğün salonu', desc: 'Tam genişlikte fotoğraf döngüsü, karşılama yazısı ve Wi-Fi / fotoğraf QR kartı',
    widgets: [
      W('media', 0, 0, 24, 17),
      TX(0, 17, 16, 5, ['Hoş geldiniz', 'Bu özel günde bizimle olduğunuz için teşekkürler'], ['Welcome', 'Thank you for sharing this special day with us'], ['Willkommen', 'Danke, dass Sie diesen besonderen Tag mit uns feiern'], ['Добро пожаловать', 'Спасибо, что разделили с нами этот особенный день'], ['أهلاً وسهلاً', 'شكرًا لمشاركتنا هذا اليوم المميز'], { size: 's' }),
      W('qr', 16, 17, 8, 5, { qr: '', style: 'right', size: 'box', text: 'm', look: 'card' }),
      W('ticker', 0, 22, 24, 2),
    ],
  },
  sade: {
    name: 'Sade', desc: 'Tam ekran medya ve altta kayan bant',
    widgets: [W('media', 0, 0, 24, 22), W('ticker', 0, 22, 24, 2)],
  },
  dikey_menu: {
    name: 'Dikey menü panosu', desc: 'Dikey TV: üstte logo ve saat, ortada ürün medyası ve geniş fiyat listesi, altta kayan bant', orient: 90,
    widgets: [
      W('logo', 0, 0, 14, 2), W('clock', 14, 0, 10, 2, { seconds: false, show: 'both' }),
      W('media', 0, 2, 24, 8), W('menu', 0, 10, 24, 12),
      W('ticker', 0, 22, 24, 2, { clock: false }),
    ],
  },
  dikey_vitrin: {
    name: 'Dikey vitrin / Reels', desc: 'Dikey TV: üstte logo ve saat, ortada tam boy 9:16 dikey medya (Reels / afiş), altta duyuru, QR ve kayan bant', orient: 90,
    widgets: [
      W('logo', 0, 0, 14, 2), W('clock', 14, 0, 10, 2, { seconds: false, show: 'both' }),
      W('media', 0, 2, 24, 16, { fit: 'cover' }),
      TX(0, 18, 15, 4, ['Hoş geldiniz', 'Günün fırsatlarını kaçırmayın'], ['Welcome', 'Don’t miss today’s deals'], ['Willkommen', 'Verpassen Sie nicht die heutigen Angebote'], ['Добро пожаловать', 'Не пропустите сегодняшние предложения'], ['أهلاً وسهلاً', 'لا تفوتوا عروض اليوم'], { size: 's' }),
      W('qr', 15, 18, 9, 4, { qr: '', style: 'right', size: 'box', text: 's', look: 'card' }),
      W('ticker', 0, 22, 24, 2, { clock: false }),
    ],
  },
  dikey_spor: {
    name: 'Dikey spor / kafe', desc: 'Dikey TV: üstte logo ve saat, ortada canlı medya, altında maçlar, hava/kurlar ve QR, en altta kayan bant', orient: 90,
    widgets: [
      W('logo', 0, 0, 14, 2), W('clock', 14, 0, 10, 2, { seconds: false, show: 'both' }),
      W('media', 0, 2, 24, 9), W('info', 0, 11, 24, 7),
      W('rates', 0, 18, 15, 4), W('qr', 15, 18, 9, 4, QRC),
      W('ticker', 0, 22, 24, 2, { clock: false }),
    ],
  },
  dikey_lobi: {
    name: 'Dikey lobi / karşılama totemi', desc: 'Dikey TV: üstte logo ve saat, ortada tanıtım medyası ve dünya saatleri, altta hava, karşılama ve Wi-Fi QR', orient: 90,
    widgets: [
      W('logo', 0, 0, 14, 2), W('clock', 14, 0, 10, 2, { seconds: false, show: 'both' }),
      W('media', 0, 2, 24, 10),
      W('worldclock', 0, 12, 24, 3, { zones: 'Europe/London,Europe/Moscow,Asia/Dubai,America/New_York', seconds: false }),
      TX(0, 15, 14, 3, ['Hoş geldiniz', 'Keyifli bir gün dileriz'], ['Welcome', 'We wish you a pleasant day'], ['Willkommen', 'Wir wünschen Ihnen einen angenehmen Tag'], ['Добро пожаловать', 'Желаем вам приятного дня'], ['أهلاً وسهلاً', 'نتمنى لكم يومًا سعيدًا'], { size: 's' }),
      W('weather', 0, 18, 14, 4), W('qr', 14, 15, 10, 7, QRC),
      W('ticker', 0, 22, 24, 2, { clock: false }),
    ],
  },
};

const THEMES = {
  kahve:  { name: 'Koyu Kahve', bg: '#151717', accent: '#906538', accent2: '#c9955c', text: '#fbfbfb', font: 'Montserrat' },
  spor:   { name: 'Spor Bar', bg: '#0e1420', accent: '#1f6f43', accent2: '#3ecf7a', text: '#f5f7fa', font: 'Montserrat' },
  gece:   { name: 'Neon Lounge', bg: '#120d1c', accent: '#6b2fb3', accent2: '#c77dff', text: '#f6f0ff', font: 'Montserrat' },
  bordo:  { name: 'Bordo', bg: '#160e10', accent: '#7a1f2b', accent2: '#d0606d', text: '#fbf6f4', font: 'Montserrat' },
  deniz:  { name: 'Deniz', bg: '#0b1519', accent: '#1d5f73', accent2: '#4fb3cf', text: '#f2fafc', font: 'Montserrat' },
  obsidyen: { name: 'Obsidiyen Altın (cam)', bg: '#07090d', accent: '#be9322', accent2: '#ecd067', text: '#f8fafc', font: 'Plus Jakarta Sans', glass: true },
  altin:  { name: 'Siyah Altın', bg: '#0c0c0c', accent: '#8a6d1f', accent2: '#e2bd52', text: '#fffaf0', font: 'Montserrat' },
};
const FONTS = ['Montserrat', 'Plus Jakarta Sans', 'Poppins', 'Oswald', 'Nunito', 'Playfair Display', 'Roboto Condensed'];

const DEFAULT_TEMPLATE = 'spor';
const defaultLayout = (tpl = DEFAULT_TEMPLATE) => {
  const t = TEMPLATES[tpl] || TEMPLATES[DEFAULT_TEMPLATE];
  return { cols: COLS, rows: ROWS, ...(t.orient ? { orient: t.orient } : {}), widgets: JSON.parse(JSON.stringify(t.widgets)) };
};

// Panelden gelen düzeni doğrula: bilinmeyen tür, taşan kutu, tekrar eden widget ayıklanır (QR kartı en çok 6 kez olabilir)
const HEX = /^#[0-9a-f]{6}$/i;
const BOXES = ['accent', 'glass', 'dark', 'outline', 'none']; // kutu stili: tema geneli + widget başına
function cleanLayout(l) {
  const FC = l && Number(l.cols) === 48 ? 48 : COLS; // 48 = ince ızgara (koordinatlar iki katı hassas)
  const orient = [90, 270].includes(Number(l && l.orient)) ? Number(l.orient) : 0; // ekran yönü: 0 (yatay), 90 (sağa dikey), 270 (sola dikey)
  const seen = new Set(), count = {}, out = [];
  for (const w of (l && Array.isArray(l.widgets) ? l.widgets : []).slice(0, 20)) {
    if (!w || !WIDGETS[w.type] || seen.has(w.type)) continue;
    if ((count[w.type] = (count[w.type] || 0) + 1) > (WIDGETS[w.type].multi || 1)) continue;
    const n = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
    const x = n(w.x, 0, FC - 1), y = n(w.y, 0, FC - 1);
    const item = { type: w.type, x, y, w: n(w.w, 1, FC - x), h: n(w.h, 1, FC - y) };
    const def = WIDGETS[w.type].props;
    if (def) {
      const p = w.props || {}; item.props = {};
      for (const [k, dv] of Object.entries(def)) {
        if (typeof dv === 'boolean') item.props[k] = typeof p[k] === 'boolean' ? p[k] : dv;
        else if (k === 'lat' || k === 'lon') {
          const nv = p[k] !== null && p[k] !== undefined && p[k] !== '' ? Number(p[k]) : NaN;
          item.props[k] = isFinite(nv) ? nv : null;
        } else {
          const en = WIDGETS[w.type].enums && WIDGETS[w.type].enums[k];
          item.props[k] = typeof p[k] === 'string' && (!en || en.includes(p[k])) ? p[k].slice(0, k === 'body' ? 400 : 200) : dv;
        }
      }
      if ((w.type === 'weather' || w.type === 'rates') && typeof p.country === 'string' && p.country.trim()) {
        item.props.country = p.country.trim().slice(0, 80);
      }
      if (w.type === 'converter') {
        const a = String(item.props.amount || '').replace(',', '.'), n = Number(a);
        item.props.amount = isFinite(n) && n > 0 && n < 1e9 ? String(n) : '100';
        item.props.currencies = [...new Set(String(item.props.currencies || '').split(',').map(x => x.trim().toUpperCase()).filter(x => CONV.includes(x)))].slice(0, 4).join(',') || 'USD,EUR,GBP';
      }
      if (w.type === 'worldclock') item.props.zones = require('./world').clean(item.props.zones) || WIDGETS.worldclock.props.zones;
      // çeviriler: { en: { title, body } }
      if (p.i18n && typeof p.i18n === 'object') {
        const tr = {};
        for (const [l, v] of Object.entries(p.i18n)) if (/^(en|de|ru|ar|fr|es)$/.test(l) && v && typeof v === 'object') {
          const o = {}; for (const k of ['title', 'body']) if (typeof v[k] === 'string' && v[k].trim()) o[k] = v[k].slice(0, k === 'body' ? 400 : 200);
          if (Object.keys(o).length) tr[l] = o;
        }
        if (Object.keys(tr).length) item.props.i18n = tr;
      }
    }
    // kutu görünümü (her widget için): boş = tema stili; renk (tint) boşsa tema vurgu rengi
    if (w.type !== 'media' && w.props && typeof w.props === 'object') {
      const bx = BOXES.includes(w.props.box) ? w.props.box : '', tn = HEX.test(w.props.tint || '') ? w.props.tint : '';
      if (bx || tn) { item.props = item.props || {}; if (bx) item.props.box = bx; if (tn) item.props.tint = tn; }
    }
    if (!WIDGETS[w.type].multi) seen.add(w.type);
    out.push(item);
  }
  return { cols: FC, rows: FC, ...(orient ? { orient } : {}), widgets: out };
}
function cleanTheme(t, cur = {}) {
  const o = { ...THEMES.kahve, ...cur };
  delete o.name;
  for (const k of ['bg', 'accent', 'accent2', 'text']) if (HEX.test(t && t[k] || '')) o[k] = t[k];
  if (t && FONTS.includes(t.font)) o.font = t.font;
  if (t && typeof t.plate === 'boolean') o.plate = t.plate; // koyu logolar için açık zemin
  if (t && BOXES.includes(t.box)) o.box = t.box; // tüm widget kutularının ortak stili
  else if (t && typeof t.glass === 'boolean') o.box = t.glass ? 'glass' : 'accent'; // eski kayıtlar
  if (o.box === undefined && o.glass) o.box = 'glass';
  o.glass = o.box === 'glass'; // cam kart stili (yarı saydam koyu kartlar, ince çerçeve)
  return o;
}

module.exports = { COLS, ROWS, WIDGETS, TEMPLATES, THEMES, FONTS, defaultLayout, cleanLayout, cleanTheme };
