/* Yerel havuzlu, sıfır API bağımlılıklı etkileşimli medya ekranı kartları:
   - quiz:   2 aşamalı Mini Quiz / Tahmin Et (önce soru + şıklar, sonra doğru cevap + açıklama)
   - fact:   Kategorili "Bunları Biliyor Muydunuz?"
   - stat:   "Sayılarla Dünya" çarpıcı istatistik kartı
   - riddle: 2 aşamalı "Günün Bilmecesi / Zekâ Sorusu" (önce soru + ipucu, sonra cevap)
   TV (#frame) ve yönetim paneli önizlemesi aynı dosyayı kullanır. */
(function () {
  const MODES = {
    quiz:   { icon: '🧠', name: '2 Aşamalı Mini Quiz', short: 'Mini Quiz', badge: 'TAHMİN EDİN · MİNİ QUİZ' },
    fact:   { icon: '💡', name: 'Bunları Biliyor Muydunuz?', short: 'Biliyor Muydunuz?', badge: 'BUNU BİLİYOR MUYDUNUZ?' },
    stat:   { icon: '📊', name: 'Sayılarla Dünya', short: 'Sayılarla Dünya', badge: 'SAYILARLA DÜNYA · İSTATİSTİK' },
    riddle: { icon: '🧩', name: 'Günün Bilmecesi & Zekâ Sorusu', short: 'Bilmece & Zekâ', badge: 'ZEKÂ SORUSU · DÜŞÜNÜN BAKALIM' },
  };

  const CATS = {
    cafe:    { icon: '☕', name: 'Kafe & Gastronomi', desc: 'Kahve, çay, çikolata ve dünya mutfakları' },
    sport:   { icon: '⚽', name: 'Spor & Rekorlar', desc: 'Futbol tarihi, olimpiyatlar ve unutulmaz rekorlar' },
    general: { icon: '🌍', name: 'Bilim, Uzay & Doğa', desc: 'Uzay, doğa, insan vücudu ve teknoloji' },
    cinema:  { icon: '🎬', name: 'Sinema & Kültür', desc: 'Filmler, kamera arkası, müzik ve genel kültür' },
  };

  const ITEMS = [
    // ==================== QUIZ: KAFE & GASTRONOMİ ====================
    { id: 'q-c1', mode: 'quiz', cat: 'cafe', q: 'Dünyada kişi başına yılda en çok kahve tüketen ülke hangisidir?', opts: ['İtalya', 'Brezilya', 'Finlandiya', 'Türkiye'], ans: 2, exp: 'Finlandiya’da kişi başı yıllık kahve tüketimi yaklaşık 12 kilogramdır; İtalya’nın neredeyse iki katıdır.' },
    { id: 'q-c2', mode: 'quiz', cat: 'cafe', q: 'Espresso kelimesi İtalyancada gerçekte ne anlama gelir?', opts: ['Çok acı ve koyu', 'Basınçla hızla çıkarılmış / kişiye özel', 'Sabah içeceği', 'Küçük fincan'], ans: 1, exp: 'Espresso, yüksek basınçlı sıcak suyun ince çekilmiş kahveden hızla geçirilmesiyle o anda sipariş üzerine hazırlanmayı ifade eder.' },
    { id: 'q-c3', mode: 'quiz', cat: 'cafe', q: 'UNESCO Somut Olmayan Kültürel Miras Listesi’ne giren ilk kahve geleneği hangisidir?', opts: ['İtalyan Espressosu', 'Türk Kahvesi', 'Viyana Kahve Kültürü', 'Kolombiya Kahvesi'], ans: 1, exp: 'Türk kahvesi kültürü ve geleneği 2013 yılında UNESCO Dünya Kültür Mirası listesine kabul edilmiştir.' },
    { id: 'q-c4', mode: 'quiz', cat: 'cafe', q: 'Beyaz çikolatanın içinde aşağıdakilerden hangisi bulunmaz?', opts: ['Kakao yağı', 'Süt tozu', 'Kakao katısı (tozu)', 'Vanilya'], ans: 2, exp: 'Beyaz çikolata yalnızca kakao yağı, süt ve şekerden yapılır; kahverengi rengi veren kakao tozu içermez.' },
    { id: 'q-c5', mode: 'quiz', cat: 'cafe', q: 'Dünyada sudan sonra en çok tüketilen içecek hangisidir?', opts: ['Kahve', 'Çay', 'Portakal suyu', 'Süt'], ans: 1, exp: 'Çay, dünyada sudan sonra en çok içilen içecektir; Türkiye ise kişi başı çay tüketiminde dünya lideridir.' },
    { id: 'q-c6', mode: 'quiz', cat: 'cafe', q: 'Margherita pizzanın üzerindeki kırmızı, beyaz ve yeşil renkler neyi temsil eder?', opts: ['Napoli takımını', 'İtalyan bayrağını', 'Dört mevsimi', 'Akdeniz iklimini'], ans: 1, exp: '1889’da Kraliçe Margherita onuruna yapılan pizzada domates (kırmızı), mozzarella (beyaz) ve fesleğen (yeşil) İtalyan bayrağını simgeler.' },
    { id: 'q-c7', mode: 'quiz', cat: 'cafe', q: 'Kahve çekirdeği aslında bitkinin hangi kısmıdır?', opts: ['Kök yumrusu', 'Kurutulmuş yaprağı', 'Kiraz benzeri bir meyvenin çekirdeği', 'Ağaç kabuğu'], ans: 2, exp: 'Kahve çekirdekleri, "kahve kirazı" adı verilen kırmızı bir meyvenin içinden çıkan tohumlardır.' },

    // ==================== QUIZ: SPOR & REKORLAR ====================
    { id: 'q-s1', mode: 'quiz', cat: 'sport', q: 'Futbol tarihinde Dünya Kupası’nı en çok kazanan ülke hangisidir?', opts: ['Almanya', 'İtalya', 'Arjantin', 'Brezilya'], ans: 3, exp: 'Brezilya, 1958, 1962, 1970, 1994 ve 2002 yıllarında olmak üzere kupayı 5 kez kazanarak rekoru elinde tutar.' },
    { id: 'q-s2', mode: 'quiz', cat: 'sport', q: 'Süper Lig tarihinde bir sezonda en çok gol atan futbolcu rekoru (39 gol) kime aittir?', opts: ['Metin Oktay', 'Tanju Çolak', 'Hakan Şükür', 'Alex de Souza'], ans: 1, exp: 'Tanju Çolak, 1987-88 sezonunda attığı 39 golle hem Türkiye rekorunu kırmış hem de Avrupa Altın Ayakkabı ödülünü kazanmıştır.' },
    { id: 'q-s3', mode: 'quiz', cat: 'sport', q: '2002 Dünya Kupası’nda A Milli Takımımızın Güney Kore’ye 10.8 saniyede attığı en hızlı golün sahibi kimdir?', opts: ['İlhan Mansız', 'Hakan Şükür', 'Hasan Şaş', 'Ümit Davala'], ans: 1, exp: 'Hakan Şükür’ün 10.8. saniyede attığı gol, Dünya Kupası tarihinin en erken golü olarak tarihe geçmiştir.' },
    { id: 'q-s4', mode: 'quiz', cat: 'sport', q: 'Olimpiyat bayrağındaki 5 iç içe geçmiş halka neyi simgeler?', opts: ['5 temel spor dalını', '5 anakarayı (kıtayı)', 'İlk 5 olimpiyat şehrini', 'Antik Yunan’daki 5 tanrıyı'], ans: 1, exp: 'Mavi, sarı, siyah, yeşil ve kırmızı halkalar dünyadaki 5 kıtanın olimpiyat ruhuyla birleşmesini simgeler.' },
    { id: 'q-s5', mode: 'quiz', cat: 'sport', q: 'Profesyonel bir basketbol potasının yerden yüksekliği tam olarak kaç metredir?', opts: ['2,85 metre', '3,05 metre', '3,25 metre', '3,50 metre'], ans: 1, exp: 'Basketbolun mucidi James Naismith ilk sepetleri 10 fit (3,05 metre) yüksekliğindeki korkuluğa asmıştır ve bu ölçü hiç değişmemiştir.' },
    { id: 'q-s6', mode: 'quiz', cat: 'sport', q: 'Üst üste 3 Olimpiyat altın madalyası kazanan efsanevi haltercimiz "Cep Herkülü" kimdir?', opts: ['Halil Mutlu', 'Naim Süleymanoğlu', 'Nurcan Taylan', 'Taner Sağır'], ans: 1, exp: 'Naim Süleymanoğlu 1988, 1992 ve 1996 Olimpiyatları’nda altın madalya kazanmış ve 46 dünya rekoru kırmıştır.' },
    { id: 'q-s7', mode: 'quiz', cat: 'sport', q: 'Teniste "Grand Slam" olarak adlandırılan dört büyük turnuvadan hangisi çim kortta oynanır?', opts: ['Roland Garros', 'Wimbledon', 'Amerika Açık', 'Avustralya Açık'], ans: 1, exp: '1877’den beri düzenlenen Wimbledon, çim kortta oynanan tek Grand Slam turnuvasıdır.' },

    // ==================== QUIZ: BİLİM, UZAY & DOĞA ====================
    { id: 'q-g1', mode: 'quiz', cat: 'general', q: 'Güneş Sistemi’nde kendi ekseni etrafında diğer gezegenlerin tersi yönünde dönen ve bir günü bir yılından uzun süren gezegen hangisidir?', opts: ['Mars', 'Venüs', 'Jüpiter', 'Satürn'], ans: 1, exp: 'Venüs kendi etrafında o kadar yavaş döner ki 1 Venüs günü (243 Dünya günü), Güneş etrafındaki 1 yılından (225 Dünya günü) uzundur.' },
    { id: 'q-g2', mode: 'quiz', cat: 'general', q: 'Üç kalbi ve mavi renkli kanı olan deniz canlısı hangisidir?', opts: ['Yunus', 'Ahtapot', 'Denizatı', 'Mavi Balina'], ans: 1, exp: 'Ahtapotların iki kalbi solungaçlara, bir kalbi vücuda kan pompalar; kanlarındaki bakır bazlı hemosiyanin ise kanı mavi yapar.' },
    { id: 'q-g3', mode: 'quiz', cat: 'general', q: 'İnsan vücudundaki en güçlü kas (boyutuna oranla uyguladığı kuvvet bakımından) hangisidir?', opts: ['Kalp kası', 'Çene kası (Masseter)', 'Üst bacak kası', 'Dil kası'], ans: 1, exp: 'Çiğneme kası olan masseter, azı dişleri üzerinde yaklaşık 90 kilograma varan bir ısırma kuvveti üretebilir.' },
    { id: 'q-g4', mode: 'quiz', cat: 'general', q: 'Hiç bozulmayan ve binlerce yıllık antik mezarlarda bile yenilebilir halde bulunan tek doğal gıda hangisidir?', opts: ['Zeytinyağı', 'Bal', 'Pirinç', 'Kuru incir'], ans: 1, exp: 'Doğal balın nem oranı çok düşük ve yapısı asidik olduğu için bakteriler içinde yaşayamaz; Mısır piramitlerinde 3000 yıllık yenilebilir bal bulunmuştur.' },
    { id: 'q-g5', mode: 'quiz', cat: 'general', q: 'Güneş’ten çıkan ışığın Dünya’ya ulaşması yaklaşık ne kadar sürer?', opts: ['1 saniye', '8 dakika 20 saniye', '1 saat', '24 saat'], ans: 1, exp: 'Güneş Dünya’dan yaklaşık 150 milyon km uzaktadır; saniyede 300.000 km hızla giden ışık bize 8 dakika 20 saniyede ulaşır.' },
    { id: 'q-g6', mode: 'quiz', cat: 'general', q: 'Dünya yüzeyindeki oksijenin yarıdan fazlası nerede üretilir?', opts: ['Amazon Ormanları’nda', 'Okyanuslardaki mikroskobik yosunlar (fitoplanktonlar) tarafından', 'Sibirya Tayga Ormanları’nda', 'Orta Afrika Ormanları’nda'], ans: 1, exp: 'Okyanuslardaki fitoplanktonlar ve deniz yosunları, Dünya’daki oksijenin yaklaşık %50 ile %70’ini üretir.' },
    { id: 'q-g7', mode: 'quiz', cat: 'general', q: 'Eyfel Kulesi yaz aylarında kış aylarına göre yaklaşık kaç santimetre daha uzun olur?', opts: ['Uzunluğu değişmez', 'Yaklaşık 15 cm uzar', 'Yaklaşık 2 metre uzar', '5 cm kısalır'], ans: 1, exp: 'Isınan metallerin genleşmesi (termal genleşme) nedeniyle demir Eyfel Kulesi yaz sıcaklarında yaklaşık 15 cm yükselir.' },

    // ==================== QUIZ: SİNEMA & KÜLTÜR ====================
    { id: 'q-m1', mode: 'quiz', cat: 'cinema', q: 'Sinema tarihinde 11 dalda Oscar kazanarak rekoru Titanic ve Ben-Hur ile paylaşan film hangisidir?', opts: ['Avatar', 'Yüzüklerin Efendisi: Kralın Dönüşü', 'Gladyatör', 'Başlangıç (Inception)'], ans: 1, exp: 'Yüzüklerin Efendisi: Kralın Dönüşü (2003), aday gösterildiği 11 dalın tamamında Oscar kazanarak tarihi rekoru egale etmiştir.' },
    { id: 'q-m2', mode: 'quiz', cat: 'cinema', q: 'Yeşilçam’ın unutulmaz klasiği "Hababam Sınıfı" romanının yazarı kimdir?', opts: ['Aziz Nesin', 'Rıfat Ilgaz', 'Haldun Taner', 'Orhan Kemal'], ans: 1, exp: 'Hababam Sınıfı, Rıfat Ilgaz tarafından kaleme alınmış ve 1975’te Ertem Eğilmez yönetmenliğinde sinemaya uyarlanmıştır.' },
    { id: 'q-m3', mode: 'quiz', cat: 'cinema', q: 'Cannes Film Festivali’nde en iyi filme verilen büyük ödülün adı nedir?', opts: ['Altın Ayı', 'Altın Aslan', 'Altın Palmiye', 'Altın Küre'], ans: 2, exp: 'Cannes’da Altın Palmiye verilir; Nuri Bilge Ceylan "Kış Uykusu", Yılmaz Güney ve Şerif Gören ise "Yol" filmiyle bu ödülü kazanmıştır.' },
    { id: 'q-m4', mode: 'quiz', cat: 'cinema', q: 'Matrix filminde ekranlardan yukarıdan aşağıya akan ünlü yeşil kodlar aslında nedir?', opts: ['Gizli askeri şifreler', 'Japonca suşi yemek tarifleri', 'Rastgele matematik formülleri', 'Yapay zeka kaynak kodu'], ans: 1, exp: 'Filmin yapım tasarımcısı Simon Whiteley, eşinin Japonca yemek kitaplarındaki suşi tariflerini tarayarak ünlü yeşil Matrix kodlarını oluşturmuştur.' },
    { id: 'q-m5', mode: 'quiz', cat: 'cinema', q: 'Dünyanın bilinen en eski tapınak yerleşimi olan ve tarihi 12.000 yıl öncesine uzanan Göbeklitepe hangi ilimizdedir?', opts: ['Gaziantep', 'Şanlıurfa', 'Mardin', 'Çorum'], ans: 1, exp: 'Şanlıurfa’daki Göbeklitepe, Mısır piramitlerinden ve Stonehenge’den yaklaşık 7.000 yıl daha eskidir.' },
    { id: 'q-m6', mode: 'quiz', cat: 'cinema', q: 'Leonardo da Vinci’nin ünlü "Mona Lisa" tablosu hangi müzede sergilenmektedir?', opts: ['British Museum (Londra)', 'Louvre Müzesi (Paris)', 'Uffizi Galerisi (Floransa)', 'Prado Müzesi (Madrid)'], ans: 1, exp: 'Mona Lisa, 1797 yılından bu yana Paris’teki Louvre Müzesi’nde sergilenmektedir ve yılda milyonlarca ziyaretçi çeker.' },

    // ==================== FACT: BUNLARI BİLİYOR MUYDUNUZ? ====================
    { id: 'f-c1', mode: 'fact', cat: 'cafe', icon: '☕', kicker: 'KAHVE TARİHİ', title: 'Keçilerin keşfettiği enerji meyvesi', body: 'Efsaneye göre kahve, MS 9. yüzyılda Etiyopyalı çoban Kaldi’nin keçilerinin kırmızı kahve meyvelerini yedikten sonra bütün gece enerjik şekilde zıpladığını fark etmesiyle keşfedilmiştir.', tag: 'Etiyopya’dan tüm dünyaya yayılan lezzet' },
    { id: 'f-c2', mode: 'fact', cat: 'cafe', icon: '🥐', kicker: 'MUTFAK KÜLTÜRÜ', title: 'Kruvasan aslında Fransız değil, Avusturya kökenlidir', body: 'Fransız kahvaltısının simgesi olan kruvasan (Croissant), ilk kez 1683 Viyana Kuşatması sonrasında Viyanalı fırıncıların yaptığı hilal şeklindeki "Kipferl" çöreğinden doğmuştur.', tag: 'Paris’e 1839’da Avusturyalı bir fırıncı taşımıştır' },
    { id: 'f-c3', mode: 'fact', cat: 'cafe', icon: '🍫', kicker: 'ÇİKOLATA TARİHİ', title: 'Kakao çekirdekleri bir zamanlar para olarak kullanılıyordu', body: 'Aztek ve Maya uygarlıklarında kakao o kadar değerliydi ki vergiler kakao çekirdekleriyle ödenir, alışverişlerde para yerine kakao çekirdeği geçerdi.', tag: '100 kakao çekirdeği büyük bir servet sayılırdı' },
    { id: 'f-c4', mode: 'fact', cat: 'cafe', icon: '🧊', kicker: 'KAHVE BİLİMİ', title: 'Cold Brew kahve sıcak kahveden %67 daha az asidiktir', body: 'Soğuk suda 12–18 saat demlenen Cold Brew kahvede yüksek ısı kullanılmadığı için çekirdekteki acı yağlar ve asitler suya çok daha az geçer; bu da yumuşak ve tatlımsı bir içim sağlar.', tag: 'Uzun demleme, yumuşak aroma' },
    { id: 'f-c5', mode: 'fact', cat: 'cafe', icon: '🍵', kicker: 'ÇAY KÜLTÜRÜ', title: 'Poşet çay tamamen tesadüfen icat edildi', body: '1908’de Amerikalı çay tüccarı Thomas Sullivan müşterilerine numuneleri küçük ipek keseler içinde gönderdi. Müşteriler çayı keseden çıkarmak yerine doğrudan sıcak suya atınca poşet çay doğdu.', tag: 'Numune kesesinden küresel alışkanlığa' },
    { id: 'f-c6', mode: 'fact', cat: 'cafe', icon: '🎼', kicker: 'KAHVE & SANAT', title: 'Beethoven her fincan kahvesi için tam 60 çekirdek sayardı', body: 'Ünlü besteci Ludwig van Beethoven kahvesine o kadar düşkündü ki her sabah kendi elleriyle tek tek 60 kahve çekirdeği sayarak kahvesini hazırlardı.', tag: 'Kusursuz ölçü, kusursuz senfoni' },
    { id: 'f-c7', mode: 'fact', cat: 'cafe', icon: '💧', kicker: 'TÜRK KAHVESİ GELENEĞİ', title: 'Kahvenin yanındaki suyun asıl anlamı', body: 'Osmanlı’da misafire kahveyle birlikte su ikram edildiğinde; misafir önce suyu içerse karnının aç olduğu anlaşılır ve hemen sofra kurulurdu, önce kahveyi içerse tok olduğu anlaşılırdı.', tag: 'İnce düşünülmüş misafirperverlik geleneği' },

    { id: 'f-s1', mode: 'fact', cat: 'sport', icon: '⚽', kicker: 'FUTBOL BİLİMİ', title: 'Bir futbolcu 90 dakikada ortalama 10–13 kilometre koşar', body: 'Modern futbolda orta saha oyuncuları bir maç boyunca ortalama 11–13 km mesafe kat eder ve maç içinde yaklaşık 60 kez yüksek hızlı depar atar.', tag: 'Yüksek tempo ve dayanıklılık' },
    { id: 'f-s2', mode: 'fact', cat: 'sport', icon: '🟨', kicker: 'FUTBOL TARİHİ', title: 'Sarı ve kırmızı kartlar trafik ışıklarından esinlendi', body: 'İngiliz hakem Ken Aston, 1966 Dünya Kupası’nda dil farkı yüzünden oyuncuların ihtarları anlamadığını görünce, Londra’da kırmızı ışıkta beklerken sarı ve kırmızı kart fikrini buldu.', tag: 'İlk kez 1970 Dünya Kupası’nda kullanıldı' },
    { id: 'f-s3', mode: 'fact', cat: 'sport', icon: '🥇', kicker: 'OLİMPİYATLAR', title: 'Olimpiyat altın madalyalarının %92’si aslında gümüştür', body: '1912 Stockholm Olimpiyatları’ndan bu yana olimpiyat altın madalyaları saf altından yapılmaz; tamamı gümüşten üretilir ve üzeri en az 6 gram saf altınla kaplanır.', tag: 'Son saf altın madalya 1912’de verildi' },
    { id: 'f-s4', mode: 'fact', cat: 'sport', icon: '🏸', kicker: 'HIZ REKORU', title: 'Raket sporlarının en hızlısı tenis değil, badmintondur', body: 'Badminton tüy topu (shuttlecock) smaç anında saatte 565 km hıza ulaşarak Formula 1 araçlarından ve tenis toplarından çok daha yüksek bir ilk çıkış hızı yakalar.', tag: 'Dünya rekoru: 565 km/saat' },
    { id: 'f-s5', mode: 'fact', cat: 'sport', icon: '🏀', kicker: 'BASKETBOL TARİHİ', title: 'İlk basketbol maçları futbol topu ve şeftali sepetiyle oynandı', body: '1891 yılında basketbol ilk oynandığında potaların altı kapalı şeftali sepetleriydi; her sayıdan sonra görevli merdivenle çıkıp topu sepetten elle çıkarırdı.', tag: 'Fileli potalar 1900’lerin başında kullanılmaya başlandı' },
    { id: 'f-s6', mode: 'fact', cat: 'sport', icon: '🧤', kicker: 'FUTBOL REKORU', title: 'Kariyerinde 131 gol atan kaleci: Rogério Ceni', body: 'Brezilyalı efsane kaleci Rogério Ceni, frikik ve penaltılardan attığı toplam 131 resmi golle futbol tarihinde en çok gol atan kaleci unvanını taşır.', tag: 'Birçok forvetten daha fazla gol' },

    { id: 'f-g1', mode: 'fact', cat: 'general', icon: '⚡', kicker: 'DOĞA OLAYLARI', title: 'Bir yıldırım, Güneş’in yüzeyinden 5 kat daha sıcaktır', body: 'Güneş’in yüzey sıcaklığı yaklaşık 5.500 °C iken, çakan bir yıldırımın içinden geçtiği hava kanalının sıcaklığı saniyenin onda birinde 30.000 °C’ye ulaşır.', tag: 'Ani genleşen hava gök gürültüsünü oluşturur' },
    { id: 'f-g2', mode: 'fact', cat: 'general', icon: '💎', kicker: 'UZAY & BİLİM', title: 'Jüpiter ve Satürn’de gökyüzünden elmas yağar', body: 'Gaz devleri Jüpiter ve Satürn’ün atmosferindeki yoğun şimşek fırtınaları metan gazını karbona dönüştürür; bu karbon katmanlardan aşağı inerken dev basınçla gerçek elmasa dönüşür.', tag: 'Yılda binlerce ton elmas yağışı' },
    { id: 'f-g3', mode: 'fact', cat: 'general', icon: '🌳', kicker: 'EVREN & DOĞA', title: 'Dünya’daki ağaç sayısı Samanyolu’ndaki yıldızlardan fazladır', body: 'Bilim insanlarının uydu verileriyle yaptığı araştırmaya göre Dünya üzerinde yaklaşık 3 trilyon ağaç vardır; Samanyolu Galaksisi’ndeki yıldız sayısı ise 100 ile 400 milyar arasındadır.', tag: '3 trilyon ağaç vs. ~250 milyar yıldız' },
    { id: 'f-g4', mode: 'fact', cat: 'general', icon: '🦩', kicker: 'HAYVANLAR ALEMİ', title: 'Flamingolar doğduklarında pembe değil, beyaz-gri renklidir', body: 'Flamingoların tüylerinin pembeleşmesinin nedeni yedikleri karides ve mavi-yeşil alglerin içindeki doğal "karotenoid" pigmentleridir.', tag: 'Beslenmeyle gelen ikonik renk' },
    { id: 'f-g5', mode: 'fact', cat: 'general', icon: '👣', kicker: 'UZAY TARİHİ', title: 'Ay’daki ayak izleri milyonlarca yıl silinmeden kalacak', body: 'Ay’da rüzgar, yağmur veya atmosfer olmadığı için astronotların 1969 yılında Ay yüzeyinde bıraktığı ayak izlerini silecek hiçbir doğa olayı yoktur.', tag: 'Yalnızca mikro göktaşları zamanla aşındırabilir' },
    { id: 'f-g6', mode: 'fact', cat: 'general', icon: '🍌', kicker: 'BOTANİK BİLİMİ', title: 'Botanik bilimine göre çilek meyve değil, muz ise otsu bir bitkidir', body: 'Muz ağacı olarak bilinen bitkinin gövdesinde hiç odun dokusu yoktur; dev bir ottur. Botanikte muz "üzümsü meyve" sayılırken çilek gerçek meyve sınıfına girmez.', tag: 'Doğanın şaşırtıcı sınıflandırması' },

    { id: 'f-m1', mode: 'fact', cat: 'cinema', icon: '🎬', kicker: 'SİNEMA KAMERA ARKASI', title: 'Yıldızlararası (Interstellar) filmindeki mısır tarlası gerçekten ekildi', body: 'Yönetmen Christopher Nolan, bilgisayar efekti kullanmak istemediği için film için 2.000 dönüm gerçek mısır ektirdi; çekimler bitince mısırlar satılarak bütçeye kâr sağlandı.', tag: 'Sıfır CGI, gerçek sinema tutkusu' },
    { id: 'f-m2', mode: 'fact', cat: 'cinema', icon: '🦁', kicker: 'SİNEMA TARİHİ', title: 'Jurassic Park’taki T-Rex kükremesi üç hayvanın birleşimidir', body: 'Sinema tarihinin en ünlü dinozor kükremesi; bir yavru filin sesi, bir kaplanın hırıltısı ve bir timsahın boğaz sesinin ses mühendisleri tarafından birleştirilmesiyle üretilmiştir.', tag: 'Oscar ödüllü ses tasarımı' },
    { id: 'f-m3', mode: 'fact', cat: 'cinema', icon: '⏱️', kicker: 'FİLM DETAYI', title: 'Titanic filminde buzdağı sahneleri gerçek olayla birebir aynı sürededir', body: 'Titanic filminde geminin buzdağına çarpmasından batışına kadar geçen sahnelerin toplam süresi 2 saat 40 dakikadır; 1912’deki gerçek batış da tam olarak bu kadar sürmüştür.', tag: '1912 yılındaki sahnelerin toplamı da tam 2 saat 40 dakikadır' },
    { id: 'f-m4', mode: 'fact', cat: 'cinema', icon: '🎭', kicker: 'KÜLTÜR & TARİH', title: 'Dünyanın ilk sesli uzun metraj filmi 1927 yılında gösterildi', body: 'Sinemanın ilk 30 yılı tamamen sessizdi ve salonlarda canlı piyano eşliğinde izlenirdi; 1927 yapımı "The Jazz Singer" ile sinemada ilk kez diyaloglar duyuldu.', tag: 'Sessiz sinemadan sesli döneme geçiş' },
    { id: 'f-m5', mode: 'fact', cat: 'cinema', icon: '📷', kicker: 'TEKNOLOJİ TARİHİ', title: 'Dünyanın ilk web kamerası bir kahve demliğini izlemek için kuruldu', body: '1991 yılında Cambridge Üniversitesi’ndeki araştırmacılar, koridorun sonundaki kahve makinesinin dolu olup olmadığını masalarından görmek için tarihin ilk web kamerasını kurdular.', tag: 'Kahve sevgisinden doğan teknoloji' },

    // ==================== STAT: SAYILARLA DÜNYA ====================
    { id: 's-c1', mode: 'stat', cat: 'cafe', num: '2,25 Milyar', unit: 'GÜNLÜK FİNCAN KAHVE', title: 'Dünyada her gün 2,25 milyar fincan kahve içiliyor', body: 'Kahve çekirdekleri küresel ticarette en çok işlem gören tarım ürünlerinden biridir; dünya genelinde 100 milyondan fazla insan geçimini kahve üretiminden sağlar.' },
    { id: 's-c2', mode: 'stat', cat: 'cafe', num: '3,16 kg', unit: 'YILLIK KİŞİ BAŞI ÇAY', title: 'Türkiye kişi başı çay tüketiminde açık ara dünya lideri', body: 'Türkiye’de kişi başına yılda ortalama 3,16 kilogram kuru çay (günde yaklaşık 3–4 bardak) tüketilir; bu oranla İngiltere ve Çin’in oldukça önündeyiz.' },
    { id: 's-c3', mode: 'stat', cat: 'cafe', num: '9 Bar', unit: 'ESPRESSO BASINCI', title: 'Kusursuz bir espresso için gereken su basıncı', body: 'Profesyonel bir espresso makinesi, suyu araba lastiği basıncının yaklaşık 4 katı olan 9 bar basınçla kahve yatağından geçirerek üzerindeki karakteristik kremayı oluşturur.' },
    { id: 's-c4', mode: 'stat', cat: 'cafe', num: '800+', unit: 'AROMA BİLEŞENİ', title: 'Bir fincan kahvede 800’den fazla doğal aroma bileşeni vardır', body: 'Kavrulmuş kahve çekirdeği; çiçeksi, meyvemsi, karamel ve fındıksı notalar dahil 800’den fazla uçucu aroma bileşeni barındırır.' },

    { id: 's-s1', mode: 'stat', cat: 'sport', num: '44,72 km/s', unit: 'EN YÜKSEK KOŞU HIZI', title: 'Usain Bolt’un 100 metre dünya rekorundaki zirve hızı', body: 'Usain Bolt, 2009 Berlin’de 100 metreyi 9,58 saniyede koşarken 60. ile 80. metreler arasında saatte 44,72 kilometre hıza ulaşmıştır.' },
    { id: 's-s2', mode: 'stat', cat: 'sport', num: '211 km/s', unit: 'EN SERT ŞUT REKORU', title: 'Futbol tarihinin kaydedilen en hızlı şutu', body: 'Brezilyalı futbolcu Ronny Heberson’un 2006 yılında kullandığı serbest vuruşta top saatte 211 kilometre hıza ulaşarak kaleye girmiştir.' },
    { id: 's-s3', mode: 'stat', cat: 'sport', num: '149 - 0', unit: 'TARİHİN EN FARKLI SKORU', title: 'Resmi bir futbol maçında kaydedilen en yüksek skor', body: '2002 yılında Madagaskar Ligi’nde oynanan AS Adema – SO l’Emyrne karşılaşması 149-0 sona ererek Guinness Rekorlar Kitabı’na girmiştir.' },
    { id: 's-s4', mode: 'stat', cat: 'sport', num: '1,80 sn', unit: 'FORMULA 1 PIT-STOP', title: 'Formula 1 tarihinde 4 lastiğin en hızlı değişim süresi', body: 'McLaren pit ekibi, 2023 Katar Grand Prix’sinde Lando Norris’in aracının dört lastiğini yalnızca 1,80 saniyede değiştirerek dünya rekoru kırmıştır.' },

    { id: 's-g1', mode: 'stat', cat: 'general', num: '100.000 km', unit: 'DAMAR UZUNLUĞU', title: 'İnsan vücudundaki damarlar Dünya’nın çevresini 2,5 kez sarar', body: 'Yetişkin bir insanın vücudundaki atardamar, toplardamar ve kılcal damarlar uç uca eklendiğinde yaklaşık 100.000 kilometre uzunluğa ulaşır.' },
    { id: 's-g2', mode: 'stat', cat: 'general', num: '27.600 km/s', unit: 'UZAY İSTASYONU HIZI', title: 'Uluslararası Uzay İstasyonu Dünya çevresini 90 dakikada döner', body: 'Yer yüzeyinden 400 km yukarıda saatte 27.600 km hızla uçan istasyondaki astronotlar, 24 saat içinde 16 kez gün doğumu ve 16 kez gün batımı görür.' },
    { id: 's-g3', mode: 'stat', cat: 'general', num: '10.994 m', unit: 'OKYANUSUN EN DERİN NOKTASI', title: 'Mariana Çukuru Everest Dağı’nı içine alabilecek kadar derindir', body: 'Pasifik Okyanusu’ndaki Mariana Çukuru’nun tabanına 8.848 metrelik Everest Dağı yerleştirilse bile zirvesinin üzerinde 2 kilometreden fazla su kalır.' },
    { id: 's-g4', mode: 'stat', cat: 'general', num: '%20', unit: 'BEYNİN ENERJİ PAYI', title: 'Beynimiz vücut ağırlığımızın %2’sidir ama enerjinin %20’sini harcar', body: 'İnsan beyni dinlenme halinde bile vücudun ürettiği toplam oksijen ve kalorinin beşte birini tek başına tüketir.' },

    { id: 's-m1', mode: 'stat', cat: 'cinema', num: '74 Saat', unit: 'TEK ÇEKİMDE EN UZUN FİLM', title: 'Tek planda hiç kesme olmadan çekilen 138 dakikalık film', body: '2015 yapımı Alman filmi "Victoria", kurgu hilesi olmadan 4. sabah saat 04:30’dan 07:00’ye kadar Berlin sokaklarında tek çekimde kaydedilmiştir; başyapıt ise 720 saatlik "Logistics"tir.' },
    { id: 's-m2', mode: 'stat', cat: 'cinema', num: '500 Saat', unit: 'DAKİKADA YÜKLENEN VİDEO', title: 'YouTube’a her 1 dakikada 500 saatten fazla yeni video yükleniyor', body: 'Bir dakikada yüklenen videoların tamamını aralıksız izlemek isterseniz yaklaşık 20 gün boyunca ekran başından hiç kalkmamanız gerekir.' },
    { id: 's-m3', mode: 'stat', cat: 'cinema', num: '12.000 Yıl', unit: 'İNSANLIK TARİHİNİN SIFIR NOKTASI', title: 'Göbeklitepe piramitlerden 7.500 yıl daha eskidir', body: 'Şanlıurfa’daki T biçimli dikilitaşlar henüz yerleşik tarıma geçilmediği düşünülen dönemde, MÖ 9600’lü yıllarda inşa edilmiştir.' },

    // ==================== RIDDLE: BİLMECE & ZEKÂ SORUSU ====================
    { id: 'r-1', mode: 'riddle', cat: 'general', q: 'Beni ne kadar çok alırsan, arkanda o kadar çok bırakırsın. Ben neyim?', hint: 'Yürürken hep bizimledir', ans: 'Adım (Ayak İzi)', exp: 'Attığınız her adım ilerlemenizi sağlarken arkanızda yeni bir ayak izi bırakır.' },
    { id: 'r-2', mode: 'riddle', cat: 'general', q: 'Adımı söylediğinde bile beni bozmuş olursun. Ben neyim?', hint: 'Kütüphanelerde çok sevilir', ans: 'Sessizlik', exp: 'Sessizlik kelimesini yüksek sesle söylediğiniz anda sessizlik bozulmuş olur.' },
    { id: 'r-3', mode: 'riddle', cat: 'general', q: 'Şehirleri var ama evi yok, ormanları var ama ağacı yok, nehirleri var ama suyu yok. Bu nedir?', hint: 'Yolculuklarda yol gösterir', ans: 'Harita', exp: 'Haritalarda şehirler, ormanlar ve nehirler çizim olarak yer alır.' },
    { id: 'r-4', mode: 'riddle', cat: 'cafe', q: 'Önce yeşil doğarım, sonra kızarırım, kavrulunca kararırım; sıcak suyla buluşunca keyif veririm. Ben neyim?', hint: 'Şu an elinizdeki fincanda olabilir', ans: 'Kahve Çekirdeği', exp: 'Kahve meyvesi dalında yeşilken olgunlaşınca kırmızı olur, kavrulunca kahverengiye döner.' },
    { id: 'r-5', mode: 'riddle', cat: 'general', q: 'Bir yarışta ikinci sıradaki koşucuyu geçerseniz kaçıncı sırada olursunuz?', hint: 'Acele cevap vermeyin!', ans: 'İkinci (2.) sırada!', exp: 'İkinci sıradaki kişiyi geçtiğinizde onun yerini alır ve ikinci olursunuz; birinci henüz önünüzdedir.' },
    { id: 'r-6', mode: 'riddle', cat: 'general', q: 'Kanadım yok ama uçarım, gözüm yok ama ağlarım. Ben neyim?', hint: 'Gökyüzüne bakın', ans: 'Bulut', exp: 'Bulutlar rüzgarla gökyüzünde süzülür ve yağmur yağdırır.' },
    { id: 'r-7', mode: 'riddle', cat: 'general', q: 'Ağzı vardır konuşmaz, yatağı vardır ama hiç uyumaz. Bu nedir?', hint: 'Doğada sürekli akar', ans: 'Akarsu / Nehir', exp: 'Nehirlerin döküldüğü yere "nehir ağzı", aktığı yola ise "nehir yatağı" denir.' },
    { id: 'r-8', mode: 'riddle', cat: 'general', q: 'Hangi ayda 28 gün vardır?', hint: 'Takvimi düşünün', ans: 'Yılın tüm (12) ayında!', exp: 'Yalnızca Şubat değil, yılın 12 ayının tamamında en az 28 gün bulunur.' },
    { id: 'r-9', mode: 'riddle', cat: 'sport', q: 'İçi boşken de dolu olduğundakiyle aynı ağırlıktadır; vurdukça zıplar ama hiç yorulmaz. Nedir?', hint: 'Yeşil sahaların başrolü', ans: 'Futbol Topu (Hava)', exp: 'Atmosfer basıncında dengelendiği ve esnek olduğu için sahada durmadan koşturur.' },
    { id: 'r-10', mode: 'riddle', cat: 'cinema', q: 'Işık varken doğarım, karanlık çökünce kaybolurum; sana hiç dokunmadan peşinden gelirim. Ben neyim?', hint: 'Güneşli günde yere bakın', ans: 'Gölge', exp: 'Gölge yalnızca ışık kaynağı olduğunda oluşur ve karanlıkta kaybolur.' },
    { id: 'r-11', mode: 'riddle', cat: 'cafe', q: 'Sıcak suya girince rengini verir, ince belli bardakta sohbeti güzelleştirir. Nedir?', hint: 'Kahvaltıların vazgeçilmezi', ans: 'Demleme Çay', exp: 'İnce belli bardakta sunulan taze demlenmiş Türk çayı.' },
    { id: 'r-12', mode: 'riddle', cat: 'general', q: 'Paylaştıkça azalmayan, aksine çoğalan iki şey nedir?', hint: 'Biri şu an ekranda gördüğünüz şey!', ans: 'Bilgi ve Mutluluk', exp: 'Bilgi ve mutluluk başkalarıyla paylaşıldığında eksilmez, katlanarak artar.' },
  ];

  const DEFAULT_CFG = {
    enabled: true,
    every: 2,
    gapMin: 0,
    durSec: 14,
    modes: ['quiz', 'fact', 'stat', 'riddle'],
    cats: ['cafe', 'sport', 'general', 'cinema'],
  };

  function normCfg(raw) {
    const c = Object.assign({}, DEFAULT_CFG, raw || {});
    c.enabled = c.enabled !== false;
    c.every = Math.max(1, Math.min(20, Math.round(Number(c.every)) || 2));
    c.gapMin = Math.max(0, Math.min(60, Math.round(Number(c.gapMin)) || 0));
    c.durSec = Math.max(8, Math.min(30, Math.round(Number(c.durSec)) || 14));
    const ms = Array.isArray(c.modes) ? c.modes.filter(k => MODES[k]) : [];
    c.modes = ms.length ? ms : DEFAULT_CFG.modes.slice();
    const cs = Array.isArray(c.cats) ? c.cats.filter(k => CATS[k]) : [];
    c.cats = cs.length ? cs : DEFAULT_CFG.cats.slice();
    return c;
  }

  function seeded(n) {
    let x = ((n + 1) * 2654435761) >>> 0;
    return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  // Belirli bir adım (step) için sıradaki kartı seçer: formatlar sırayla döner (quiz -> fact -> stat -> riddle),
  // her format kendi içinde seçili kategorilere göre günlük karışık sırada ilerler (tekrar etmez).
  function pick(cfgRaw, step, forceMode, forceCat) {
    const cfg = normCfg(cfgRaw);
    const modes = forceMode && MODES[forceMode] ? [forceMode] : cfg.modes;
    const cats = forceCat && CATS[forceCat] ? [forceCat] : cfg.cats;
    const daySeed = Math.floor(Date.now() / (6 * 3600 * 1000));
    const st = Math.max(0, Number(step) || 0);
    const mode = modes[st % modes.length];
    let pool = ITEMS.filter(it => it.mode === mode && cats.includes(it.cat));
    if (!pool.length) pool = ITEMS.filter(it => it.mode === mode);
    if (!pool.length) pool = ITEMS.slice();
    const rnd = seeded(daySeed + mode.charCodeAt(0) * 97);
    const shuffled = pool.slice().sort(() => rnd() - 0.5);
    const modeStep = Math.floor(st / modes.length);
    return shuffled[modeStep % shuffled.length];
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const css = `
.spt{position:absolute;inset:0;overflow:hidden;font-family:var(--font,'Montserrat'),sans-serif;color:var(--white,#fff);background:radial-gradient(120% 100% at 85% 15%,color-mix(in srgb,var(--accent,#1d4ed8) 38%,#0b0f19) 0%,#0b0f19 58%,#06080f 100%);display:flex;flex-direction:column;justify-content:space-between;padding:4.2% 5.2%;line-height:1.22;user-select:none}
.spt *{box-sizing:border-box}
.spt::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 12% 88%,color-mix(in srgb,var(--accent2,#f4c04f) 22%,transparent),transparent 52%);pointer-events:none}
.spt-top,.spt-mid,.spt-foot{position:relative;z-index:1}
.spt-top{display:flex;align-items:center;justify-content:space-between;gap:1em}
.spt-pills{display:flex;align-items:center;gap:.65em;flex-wrap:wrap}
.spt-badge{display:inline-flex;align-items:center;gap:.45em;background:var(--accent2,#f4c04f);color:#0b0f19;font-weight:900;font-size:1.05em;letter-spacing:.1em;padding:.38em .95em;border-radius:99em;text-transform:uppercase;box-shadow:0 .3em 1em rgba(0,0,0,.35)}
.spt-cat{display:inline-flex;align-items:center;gap:.4em;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.16);color:#e2e8f0;font-weight:700;font-size:.98em;padding:.35em .85em;border-radius:99em}
.spt-timer{display:inline-flex;align-items:center;gap:.45em;background:rgba(15,23,42,.78);border:1px solid rgba(255,255,255,.15);padding:.36em .9em;border-radius:99em;font-weight:800;font-size:1em;color:var(--accent2,#f4c04f);font-variant-numeric:tabular-nums}
.spt.revealed .spt-timer{background:rgba(16,185,129,.2);border-color:rgba(52,211,153,.55);color:#6ee7b7}

/* QUIZ */
.spt-q{font-size:2.35em;font-weight:800;line-height:1.18;margin:0 0 .65em;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.45)}
.spt-opts{display:grid;grid-template-columns:1fr 1fr;gap:.75em .95em}
.spt-opt{display:flex;align-items:center;gap:.75em;padding:.78em 1.05em;border-radius:.75em;background:rgba(255,255,255,.06);border:2px solid rgba(255,255,255,.13);transition:background .35s,border-color .35s,opacity .35s,transform .35s}
.spt-let{width:2.1em;height:2.1em;border-radius:.5em;background:rgba(255,255,255,.12);color:var(--accent2,#f4c04f);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:1.15em;flex:none}
.spt-otxt{font-size:1.42em;font-weight:700;color:#f8fafc;line-height:1.2}
.spt-ock{margin-left:auto;font-size:1.05em;font-weight:900;color:#10b981;background:rgba(16,185,129,.18);border:1px solid rgba(52,211,153,.45);padding:.22em .65em;border-radius:99em;opacity:0;transition:opacity .35s}
.spt.revealed .spt-opt.wrong{opacity:.42;border-color:rgba(255,255,255,.06)}
.spt.revealed .spt-opt.correct{background:linear-gradient(90deg,rgba(16,185,129,.28),rgba(16,185,129,.12));border-color:#34d399;box-shadow:0 0 1.4em rgba(16,185,129,.28)}
.spt.revealed .spt-opt.correct .spt-let{background:#10b981;color:#052e16}
.spt.revealed .spt-opt.correct .spt-ock{opacity:1}
.spt-exp{margin-top:.75em;padding:.75em 1.1em;border-radius:.7em;background:rgba(15,23,42,.75);border-left:4px solid var(--accent2,#f4c04f);font-size:1.2em;font-weight:600;color:#e2e8f0;opacity:0;transform:translateY(.35em);transition:opacity .35s,transform .35s}
.spt.revealed .spt-exp{opacity:1;transform:translateY(0)}

/* FACT */
.spt-fact-wrap{display:flex;align-items:center;gap:2.2em;my:auto}
.spt-fact-ic{width:5.4em;height:5.4em;border-radius:1.3em;background:radial-gradient(circle at 30% 30%,color-mix(in srgb,var(--accent2,#f4c04f) 32%,rgba(255,255,255,.08)),rgba(255,255,255,.03));border:2px solid color-mix(in srgb,var(--accent2,#f4c04f) 50%,transparent);display:flex;align-items:center;justify-content:center;font-size:2.6em;flex:none;box-shadow:0 .6em 1.8em rgba(0,0,0,.4)}
.spt-fact-body{flex:1;min-width:0}
.spt-kicker{font-size:1.05em;font-weight:800;letter-spacing:.18em;color:var(--accent2,#f4c04f);text-transform:uppercase;margin-bottom:.35em}
.spt-title{font-size:2.75em;font-weight:900;line-height:1.12;margin:0 0 .45em;color:#fff}
.spt-desc{font-size:1.52em;font-weight:500;line-height:1.42;color:#e2e8f0;margin:0}
.spt-tag{display:inline-flex;align-items:center;gap:.45em;font-size:1.15em;font-weight:700;color:var(--accent2,#f4c04f);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);padding:.45em 1em;border-radius:.6em}

/* STAT */
.spt-stat-wrap{display:grid;grid-template-columns:40% 1fr;align-items:center;gap:2.2em}
.spt-stat-box{background:linear-gradient(145deg,color-mix(in srgb,var(--accent2,#f4c04f) 20%,rgba(255,255,255,.05)),rgba(15,23,42,.75));border:2px solid color-mix(in srgb,var(--accent2,#f4c04f) 55%,transparent);border-radius:1.2em;padding:1.8em 1.4em;text-align:center;box-shadow:0 .8em 2.2em rgba(0,0,0,.45)}
.spt-stat-num{font-size:4.4em;font-weight:900;line-height:1;color:var(--accent2,#f4c04f);letter-spacing:-.03em;text-shadow:0 .1em .4em rgba(0,0,0,.4)}
.spt-stat-unit{margin-top:.55em;font-size:1.05em;font-weight:800;letter-spacing:.16em;color:#f8fafc;text-transform:uppercase;opacity:.9}

/* RIDDLE */
.spt-riddle-box{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.13);border-radius:1em;padding:1.35em 1.6em;margin-bottom:.9em}
.spt-hint{display:inline-flex;align-items:center;gap:.4em;font-size:1.12em;font-weight:700;color:var(--accent2,#f4c04f);margin-top:.65em}
.spt-ansbox{padding:1.05em 1.35em;border-radius:.85em;background:rgba(15,23,42,.75);border:2px dashed rgba(255,255,255,.22);display:flex;align-items:center;justify-content:space-between;gap:1em;transition:background .35s,border-color .35s}
.spt-ans-wait{font-size:1.35em;font-weight:700;color:#cbd5e1}
.spt-ans-real{display:none;flex-direction:column;gap:.25em}
.spt-ans-real b{font-size:1.85em;font-weight:900;color:#6ee7b7}
.spt-ans-real span{font-size:1.2em;font-weight:500;color:#e2e8f0}
.spt.revealed .spt-ansbox{background:linear-gradient(90deg,rgba(16,185,129,.24),rgba(15,23,42,.85));border:2px solid #34d399}
.spt.revealed .spt-ans-wait{display:none}
.spt.revealed .spt-ans-real{display:flex}

/* FOOTER BAR */
.spt-foot{display:flex;align-items:center;justify-content:space-between;gap:1.2em}
.spt-bar{flex:1;height:.38em;background:rgba(255,255,255,.12);border-radius:99em;overflow:hidden}
.spt-bar > i{display:block;height:100%;width:100%;background:linear-gradient(90deg,var(--accent,#3b82f6),var(--accent2,#f4c04f));border-radius:99em;transform-origin:left center;transition:transform .95s linear}
.spt.vert .spt-opts{grid-template-columns:1fr}
.spt.vert .spt-stat-wrap,.spt.vert .spt-fact-wrap{grid-template-columns:1fr;flex-direction:column;text-align:center}
`;

  function ensureCss() {
    if (typeof document === 'undefined' || document.getElementById('spt-css')) return;
    const s = document.createElement('style');
    s.id = 'spt-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function html(item, revealed) {
    ensureCss();
    const it = item || ITEMS[0];
    const m = MODES[it.mode] || MODES.fact;
    const c = CATS[it.cat] || CATS.general;
    const revCls = revealed ? ' revealed' : '';
    const top = `<div class="spt-top">
      <div class="spt-pills">
        <span class="spt-badge">${m.icon} ${esc(m.badge)}</span>
        <span class="spt-cat">${c.icon} ${esc(c.name)}</span>
      </div>
      <div class="spt-timer" data-spt-timer>${
        it.mode === 'quiz' || it.mode === 'riddle'
          ? (revealed ? '✓ CEVAP AÇILDI' : '⏳ TAHMİN ZAMANI')
          : '✦ GÜNCEL KÜLTÜR'
      }</div>
    </div>`;

    let mid = '';
    if (it.mode === 'quiz') {
      const letters = ['A', 'B', 'C', 'D'];
      mid = `<div class="spt-mid">
        <h2 class="spt-q">${esc(it.q)}</h2>
        <div class="spt-opts">${(it.opts || []).map((o, i) => `
          <div class="spt-opt ${i === it.ans ? 'correct' : 'wrong'}">
            <span class="spt-let">${letters[i] || (i + 1)}</span>
            <span class="spt-otxt">${esc(o)}</span>
            ${i === it.ans ? '<span class="spt-ock">✓ DOĞRU</span>' : ''}
          </div>`).join('')}
        </div>
        <div class="spt-exp">💡 ${esc(it.exp)}</div>
      </div>`;
    } else if (it.mode === 'stat') {
      mid = `<div class="spt-mid">
        <div class="spt-stat-wrap">
          <div class="spt-stat-box">
            <div class="spt-stat-num">${esc(it.num)}</div>
            <div class="spt-stat-unit">${esc(it.unit)}</div>
          </div>
          <div class="spt-fact-body">
            <div class="spt-kicker">${c.icon} ${esc(c.name)}</div>
            <h2 class="spt-title">${esc(it.title)}</h2>
            <p class="spt-desc">${esc(it.body)}</p>
          </div>
        </div>
      </div>`;
    } else if (it.mode === 'riddle') {
      mid = `<div class="spt-mid">
        <div class="spt-riddle-box">
          <h2 class="spt-q" style="margin:0">${esc(it.q)}</h2>
          ${it.hint ? `<div class="spt-hint">🔎 İpucu: ${esc(it.hint)}</div>` : ''}
        </div>
        <div class="spt-ansbox">
          <div class="spt-ans-wait">🔒 Düşünün bakalım… Cevap birazdan açılıyor!</div>
          <div class="spt-ans-real">
            <b>🔓 CEVAP: ${esc(it.ans)}</b>
            <span>${esc(it.exp)}</span>
          </div>
        </div>
      </div>`;
    } else {
      mid = `<div class="spt-mid">
        <div class="spt-fact-wrap">
          <div class="spt-fact-ic">${esc(it.icon || '💡')}</div>
          <div class="spt-fact-body">
            <div class="spt-kicker">${esc(it.kicker || c.name)}</div>
            <h2 class="spt-title">${esc(it.title)}</h2>
            <p class="spt-desc">${esc(it.body)}</p>
          </div>
        </div>
      </div>`;
    }

    const footNote = it.mode === 'fact' && it.tag
      ? `<span class="spt-tag">✦ ${esc(it.tag)}</span>`
      : `<span class="spt-cat" style="font-size:.9em;opacity:.85">${it.mode === 'quiz' || it.mode === 'riddle' ? 'Cevap ekranda otomatik açılır' : 'Etkileşimli Bilgi Kuşağı'}</span>`;

    const foot = `<div class="spt-foot">
      ${footNote}
      <div class="spt-bar"><i data-spt-bar></i></div>
    </div>`;

    return `<div class="spt m-${esc(it.mode)}${revCls}">${top}${mid}${foot}</div>`;
  }

  function fit(el) {
    if (!el) return;
    const w = el.clientWidth || 1920, h = el.clientHeight || 1080, vert = h > w * 1.1;
    el.classList.toggle('vert', vert);
    el.style.fontSize = Math.max(9, vert ? Math.min(w / 38, h / 58) : Math.min(w / 66, h / 36)) + 'px';
  }

  // Kartı verilen kapsayıcı içinde çalıştırır (2 aşamalı quiz/bilmece sayacı ve ilerleme çubuğu dahil).
  // Dönen işlev çağrıldığında zamanlayıcıları temizler.
  function mount(container, item, durSec, onDone) {
    if (!container) return () => {};
    const it = item || ITEMS[0];
    const totalSec = Math.max(6, Number(durSec) || 14);
    const twoStage = it.mode === 'quiz' || it.mode === 'riddle';
    const revealAtSec = twoStage ? Math.max(4, Math.round(totalSec * 0.62)) : totalSec + 1;
    container.innerHTML = html(it, false);
    const root = container.firstElementChild;
    fit(root);
    const timerEl = root ? root.querySelector('[data-spt-timer]') : null;
    const barEl = root ? root.querySelector('[data-spt-bar]') : null;
    const startMs = Date.now();
    let done = false;

    const update = () => {
      if (done || !root || !root.isConnected) return;
      const elapsedSec = (Date.now() - startMs) / 1000;
      const pct = Math.max(0, Math.min(1, 1 - elapsedSec / totalSec));
      if (barEl) barEl.style.transform = `scaleX(${pct.toFixed(3)})`;
      if (twoStage) {
        if (elapsedSec >= revealAtSec) {
          if (!root.classList.contains('revealed')) root.classList.add('revealed');
          if (timerEl) timerEl.textContent = '✓ CEVAP AÇILDI';
        } else {
          const left = Math.max(1, Math.ceil(revealAtSec - elapsedSec));
          if (timerEl) timerEl.textContent = `⏳ CEVABA ${left} SN`;
        }
      } else {
        const left = Math.max(1, Math.ceil(totalSec - elapsedSec));
        if (timerEl) timerEl.textContent = `✦ ${left} SN`;
      }
    };

    update();
    const iv = setInterval(update, 250);
    const to = setTimeout(() => {
      if (done) return;
      done = true;
      clearInterval(iv);
      if (typeof onDone === 'function') onDone();
    }, totalSec * 1000);

    return () => {
      done = true;
      clearInterval(iv);
      clearTimeout(to);
    };
  }

  const api = { MODES, CATS, ITEMS, DEFAULT_CFG, normCfg, pick, html, fit, mount };
  if (typeof window !== 'undefined') window.SPTrivia = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
