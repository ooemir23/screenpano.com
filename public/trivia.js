/* Yerel havuzlu + günlük canlı veri destekli etkileşimli medya ekranı kartları:
   - quiz:      2 aşamalı Mini Quiz / Tahmin Et (önce soru + şıklar, sonra doğru cevap + açıklama)
   - fact:      Kategorili "Bunları Biliyor Muydunuz?"
   - stat:      "Sayılarla Dünya" çarpıcı istatistik kartı
   - riddle:    2 aşamalı "Günün Bilmecesi / Zekâ Sorusu" (önce soru + ipucu, sonra cevap)
   - word:      2 aşamalı "Kelime Bulmaca" (önce karışık harf kutuları + ipucu, sonra çözülmüş kelime)
   - illusion:  2 aşamalı "Optik İllüzyon & Dikkat Testi" (vektörel görsel bulmaca + cevapta görsel kanıt)
   - zoom:      2 aşamalı "Görsel Tahmin: Neresi / Ne?" (önce yaklaşmış detay + ipucu, sonra tam görünüm)
   - nostalgia: "90'lar & 2000'ler Nostalji Köşesi" (retro vektörel illüstrasyon + sıcak anı)
   TV (#frame) ve yönetim paneli önizlemesi aynı dosyayı kullanır. */
(function () {
  const MODES = {
    quiz:      { icon: '🧠', name: '2 Aşamalı Mini Quiz', short: 'Mini Quiz', badge: 'TAHMİN EDİN · MİNİ QUİZ' },
    fact:      { icon: '💡', name: 'Bunları Biliyor Muydunuz?', short: 'Biliyor Muydunuz?', badge: 'BUNU BİLİYOR MUYDUNUZ?' },
    stat:      { icon: '📊', name: 'Sayılarla Dünya', short: 'Sayılarla Dünya', badge: 'SAYILARLA DÜNYA · İSTATİSTİK' },
    riddle:    { icon: '🧩', name: 'Günün Bilmecesi & Zekâ Sorusu', short: 'Bilmece & Zekâ', badge: 'ZEKÂ SORUSU · DÜŞÜNÜN BAKALIM' },
    word:      { icon: '🔤', name: 'Kelime Bulmaca (Karışık Harfler)', short: 'Kelime Bulmaca', badge: 'KELİME BULMACA · KARIŞIK HARFLER' },
    illusion:  { icon: '🌀', name: 'Optik İllüzyon & Dikkat Testi', short: 'Optik İllüzyon', badge: 'GÖZ YANILMASI & DİKKAT TESTİ' },
    zoom:      { icon: '🔍', name: 'Görsel Tahmin (Neresi / Ne?)', short: 'Görsel Tahmin', badge: 'GÖRSEL TAHMİN · NERESİ / NE?' },
    nostalgia: { icon: '📻', name: '90’lar & 2000’ler Nostalji Köşesi', short: 'Nostalji Köşesi', badge: 'NOSTALJİ KÖŞESİ · HATIRLAYAN VAR MI?' },
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

    { id: 's-m1', mode: 'stat', cat: 'cinema', num: '74 Saat', unit: 'TEK ÇEKİMDE EN UZUN FİLM', title: 'Tek planda hiç kesme olmadan çekilen 138 dakikalık film', body: '2015 yapımı Alman filmi "Victoria", kurgu hilesi olmadan sabah saat 04:30’dan 07:00’ye kadar Berlin sokaklarında tek çekimde kaydedilmiştir; deneysel rekor ise 720 saatlik "Logistics"tir.' },
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

    // ==================== WORD: KELİME BULMACA (KARIŞIK HARFLER) ====================
    { id: 'w-c1', mode: 'word', cat: 'cafe', scrambled: 'S O P R E S E S', word: 'ESPRESSO', clue: 'Yüksek basınçlı sıcak suyla hazırlanan yoğun İtalyan kahvesi', exp: 'Tüm latte, cappuccino ve americano çeşitlerinin temelini oluşturan yoğun kahve özüdür.' },
    { id: 'w-c2', mode: 'word', cat: 'cafe', scrambled: 'V A K U R S A N', word: 'KRUVASAN', clue: 'Hilal şeklinde, kat kat tereyağlı Fransız/Avusturya hamur işi', exp: 'Kahvaltıda kahvenin yanında en çok tercih edilen çıtır katmanlı hamur işidir.' },
    { id: 'w-c3', mode: 'word', cat: 'cafe', scrambled: 'İ K O L A T A Ç', word: 'ÇİKOLATA', clue: 'Kakao çekirdeklerinden üretilen mutluluk kaynağı tatlı', exp: 'Bitter, sütlü ve beyaz çeşitleriyle dünyada en sevilen tatlı lezzetlerin başında gelir.' },
    { id: 'w-c4', mode: 'word', cat: 'cafe', scrambled: 'M İ R A T İ S U', word: 'TİRAMİSU', clue: 'Kahveyle ıslatılmış kedi dili ve mascarpone peynirli ünlü İtalyan tatlısı', exp: 'İtalyancada kelime anlamı olarak "Beni neşelendir / ayağa kaldır" demektir.' },
    { id: 'w-c5', mode: 'word', cat: 'cafe', scrambled: 'M O N A L İ T A', word: 'LİMONATA', clue: 'Taze nane yaprakları ve buzla sunulan ferahlatıcı içecek', exp: 'Yaz aylarında serinletici etkisiyle bilinen en klasik narenciye içeceğidir.' },

    { id: 'w-s1', mode: 'word', cat: 'sport', scrambled: 'Ş A P İ M Y O N', word: 'ŞAMPİYON', clue: 'Turnuvayı veya ligi zirvede tamamlayan takım ya da sporcu', exp: 'Sezon boyu verilen mücadelenin sonunda kupayı kaldıran birinciye verilen unvandır.' },
    { id: 'w-s2', mode: 'word', cat: 'sport', scrambled: 'O L İ P İ Y A T', word: 'OLİMPİYAT', clue: 'Dört yılda bir düzenlenen dünyanın en büyük spor organizasyonu', exp: 'Antik Yunan’dan günümüze uzanan ve beş kıtayı birleştiren küresel spor şölenidir.' },
    { id: 'w-s3', mode: 'word', cat: 'sport', scrambled: 'V A R O Ş A T A', word: 'RÖVEŞATA', clue: 'Futbolda havadaki topa sırtı kaleye dönükken sıçrayarak yapılan estetik vuruş', exp: 'Yeşil sahalarda izlemesi en heyecan verici ve akrobatik gol vuruşlarından biridir.' },
    { id: 'w-s4', mode: 'word', cat: 'sport', scrambled: 'M A T A R O N', word: 'MARATON', clue: '42 kilometre 195 metrelik en uzun olimpik koşu yarışı', exp: 'Adını Antik Yunan’da Maraton Ovası’ndan Atina’ya zafer haberini koşarak götüren askerden alır.' },

    { id: 'w-g1', mode: 'word', cat: 'general', scrambled: 'S A K A L G İ', word: 'GALAKSİ', clue: 'Milyarlarca yıldız, gezegen ve bulutsudan oluşan dev uzay adası', exp: 'Dünya’mızın da içinde bulunduğu Samanyolu, sarmal yapılı dev bir galaksidir.' },
    { id: 'w-g2', mode: 'word', cat: 'general', scrambled: 'E L E S T K O P', word: 'TELESKOP', clue: 'Uzak yıldızları ve gezegenleri yakınlaştıran gözlem aracı', exp: 'Galileo’nun gökyüzüne çevirmesiyle modern astronomi çağını başlatan icattır.' },
    { id: 'w-g3', mode: 'word', cat: 'general', scrambled: 'P U L A S U', word: 'PUSULA', clue: 'Daima kuzey yönünü göstererek denizcilere ve gezginlere yol bulan alet', exp: 'Dünya’nın manyetik alanını kullanarak yön bulmayı sağlayan tarihi keşif aracıdır.' },

    { id: 'w-m1', mode: 'word', cat: 'cinema', scrambled: 'E N S A R Y O', word: 'SENARYO', clue: 'Bir filmin veya dizinin sahne sahne yazılmış metni ve diyalogları', exp: 'Yönetmen ve oyuncuların kamera karşısına geçmeden önce takip ettiği yol haritasıdır.' },
    { id: 'w-m2', mode: 'word', cat: 'cinema', scrambled: 'S E F T İ V A L', word: 'FESTİVAL', clue: 'Sanat, sinema ve müzik eserlerinin ödüllerle buluştuğu kültür şenliği', exp: 'Cannes, Venedik, Berlin ve Altın Koza gibi etkinlikler sinema dünyasının kalbinin attığı yerlerdir.' },

    // ==================== ILLUSION: OPTİK İLLÜZYON & DİKKAT TESTİ ====================
    { id: 'il-1', mode: 'illusion', cat: 'general', kind: 'muller', q: 'Üstteki ve alttaki turuncu yatay çizgilerden hangisi daha uzundur?', hint: 'Uçlardaki ok yönlerine aldanmayın', ans: 'İkisi de milimetresine kadar EŞİT uzunluktadır!', exp: 'Müller-Lyer yanılsaması: Dışa bakan kanatlar beynin çizgiyi olduğundan daha uzun algılamasına yol açar.' },
    { id: 'il-2', mode: 'illusion', cat: 'general', kind: 'ebbinghaus', q: 'Soldaki ve sağdaki turuncu merkez dairelerden hangisi daha büyüktür?', hint: 'Etrafındaki mavi daireleri görmezden gelmeye çalışın', ans: 'İki turuncu daire de BİREBİR AYNI boyuttadır!', exp: 'Ebbinghaus yanılsaması: Küçük dairelerle çevrili olan merkez daire beynimize daha büyükmüş gibi görünür.' },
    { id: 'il-3', mode: 'illusion', cat: 'general', kind: 'ponzo', q: 'Tren rayları üzerindeki iki sarı çizgiden hangisi daha uzundur?', hint: 'Perspektif derinliğine dikkat edin', ans: 'Her iki sarı çizgi de TAMAMEN EŞİT uzunluktadır!', exp: 'Ponzo yanılsaması: Beynimiz üstteki çizgiyi uzaktaki ufuk çizgisine yakın gördüğü için daha büyük yorumlar.' },
    { id: 'il-4', mode: 'illusion', cat: 'general', kind: 'contrast', q: 'Koyu ve açık zemin üzerindeki iki küçük gri kareden hangisi daha açıktır?', hint: 'Arka plan rengi gözümüzü yanıltır', ans: 'İki iç kare de AYNI RENK koduna (#94A3B8) sahiptir!', exp: 'Eşzamanlı kontrast yanılsaması: Koyu zemin üzerindeki gri kare gözümüze çok daha parlak görünür.' },
    { id: 'il-5', mode: 'illusion', cat: 'general', kind: 'odd8', q: 'Dikkat Testi: B harflerinin arasındaki gizli "8" rakamını kaç saniyede bulabilirsiniz?', hint: 'Satırları soldan sağa hızlıca tarayın', ans: '3. satır, 6. sütunda gizleniyordu!', exp: 'Görsel arama testlerinde benzer kıvrımlı harfler beynin örüntü tanıma merkezini şaşırtır.' },
    { id: 'il-6', mode: 'illusion', cat: 'general', kind: 'stroop', q: 'Dikkat Testi: Yazıyı okumayın! Kelimenin YAZILDIĞI RENGİ yüksek sesle söyleyin!', hint: 'Beynin okuma refleksi renk algısıyla yarışır', ans: 'Yazı "KIRMIZI" diyor ama rengi ZÜMRÜT YEŞİLİ!', exp: 'Stroop Etkisi: Otomatik okuma alışkanlığımız, gördüğümüz rengi söylememizi geciktirir.' },
    { id: 'il-7', mode: 'illusion', cat: 'general', kind: 'triangles', q: 'Zekâ & Dikkat Testi: Bu şeklin içinde toplam kaç adet üçgen vardır?', hint: 'Yalnızca küçükleri değil, birleşimlerden oluşan büyük üçgeni de sayın!', ans: 'Toplam 5 adet üçgen vardır! (4 küçük + 1 büyük dış üçgen)', exp: 'Çoğu kişi ilk bakışta içteki 4 küçük üçgeni sayar ve en dıştaki ana üçgeni gözden kaçırır.' },
    { id: 'il-8', mode: 'illusion', cat: 'cafe', kind: 'cup', q: 'Görsel Algı: Bu çizimde ilk bakışta zarif bir kupa mı görüyorsunuz, yoksa birbirine bakan iki yüz profili mi?', hint: 'Beyaz alana veya koyu kenarlara odaklanmayı deneyin', ans: 'Rubin’in Kupası: Her ikisi de aynı anda çizimde yer alır!', exp: 'Şekil-zemin algısı: Beynimiz odaklandığı bölgeye göre ya ortadaki kupayı ya da yanlardaki yüzleri öne çıkarır.' },

    // ==================== ZOOM: GÖRSEL TAHMİN (NERESİ / NE?) ====================
    { id: 'z-1', mode: 'zoom', cat: 'general', landmark: 'kapadokya', q: 'Yakınlaştırılmış bu eşsiz silüet Türkiye’nin hangi dünyaca ünlü bölgesine aittir?', clue: '1. İpucu: Volkanik tüf kayalar ve gün doğumunda gökyüzünü süsleyen yüzlerce sıcak hava balonu', ans: 'Kapadokya & Peri Bacaları (Nevşehir)', exp: 'Erciyes ve Hasan Dağı’nın milyonlarca yıl önceki küllerinin rüzgar ve yağmurla aşınmasıyla oluşan doğa harikasıdır.' },
    { id: 'z-2', mode: 'zoom', cat: 'cinema', landmark: 'galata', q: 'Külah çatısıyla gökyüzüne uzanan bu tarihi kule hangisidir?', clue: '1. İpucu: Hezarfen Ahmed Çelebi’nin kanat takarak Üsküdar’a uçtuğu yer olarak bilinir', ans: 'Galata Kulesi (İstanbul)', exp: '1348 yılında inşa edilen Galata Kulesi, İstanbul silüetinin ve Haliç’in en görkemli simgelerinden biridir.' },
    { id: 'z-3', mode: 'zoom', cat: 'general', landmark: 'kizkulesi', q: 'Denizin ortasındaki küçük bir adacık üzerinde yükselen bu tarihi yapı hangisidir?', clue: '1. İpucu: İstanbul Boğazı’nda Üsküdar Salacak açıklarında yer alır', ans: 'Kız Kulesi (İstanbul)', exp: 'Antik çağdan Osmanlı’ya kadar gümrük noktası, deniz feneri ve savunma kulesi olarak hizmet vermiştir.' },
    { id: 'z-4', mode: 'zoom', cat: 'general', landmark: 'gobeklitepe', q: 'Üzerinde kabartmalar bulunan bu T biçimli dikilitaş hangi tarihi mirasımıza aittir?', clue: '1. İpucu: İnsanlık tarihinin bilinen en eski tapınak merkezi (MÖ 9600)', ans: 'Göbeklitepe (Şanlıurfa)', exp: '12.000 yıllık geçmişiyle dünya arkeoloji tarihini yeniden yazdıran UNESCO Dünya Mirası alanımızdır.' },
    { id: 'z-5', mode: 'zoom', cat: 'general', landmark: 'eyfel', q: 'Çelik kafes dokusuyla görünen bu ikonik yapı dünyanın hangi şehrindedir?', clue: '1. İpucu: 1889 Dünya Fuarı için inşa edilen "Demir Leydi"', ans: 'Eyfel Kulesi (Paris, Fransa)', exp: 'Gustave Eiffel tarafından tasarlanan 330 metrelik kule, dünyada en çok ziyaret edilen anıtlardan biridir.' },
    { id: 'z-6', mode: 'zoom', cat: 'general', landmark: 'piramit', q: 'Çöl güneşinin altında yükselen bu geometrik antik harika hangisidir?', clue: '1. İpucu: Antik Dünyanın Yedi Harikası’ndan günümüze ulaşabilen tek eserdir', ans: 'Gize Piramitleri (Mısır)', exp: 'Her biri tonlarca ağırlıktaki milyonlarca kireçtaşı blokla 4.500 yıl önce inşa edilmiştir.' },
    { id: 'z-7', mode: 'zoom', cat: 'cafe', landmark: 'cezve', q: 'Yakın planda görünen bu geleneksel mutfak gereci nedir?', clue: '1. İpucu: Bol köpüklü sohbetlerin ve 40 yıllık hatırın başrol oyuncusu', ans: 'Bakır Cezve & Türk Kahvesi', exp: 'Közde veya kısık ateşte ağır ağır pişirilen Türk kahvesine eşsiz aromasını veren geleneksel ekipmandır.' },
    { id: 'z-8', mode: 'zoom', cat: 'sport', landmark: 'kupa', q: 'Altın küre formundaki bu efsanevi ödül hangi spora aittir?', clue: '1. İpucu: Dört yılda bir tüm dünyanın nefesini tutarak izlediği turnuvanın büyük ödülü', ans: 'FIFA Dünya Kupası', exp: '1974 yılından bu yana kullanılan 18 ayar altın kupa, yeryüzünü elleriyle yükselten iki figürü betimler.' },

    // ==================== NOSTALGIA: 90'LAR & 2000'LER NOSTALJİ KÖŞESİ ====================
    { id: 'n-1', mode: 'nostalgia', cat: 'cinema', art: 'cassette', era: '90’LAR KLASİĞİ', title: 'Kaset ile kurşun kalemin ayrılmaz dostluğu', body: 'Walkman’de en sevdiğimiz şarkıyı dinlerken şerit sardığında imdada altı köşeli kurşun kalem yetişirdi. Kalemi dişliye geçirip havada çevirerek kaseti sarmak bir neslin ortak refleksiydi.', tag: 'Bunu yapan nesil şimdi gülümsüyor' },
    { id: 'n-2', mode: 'nostalgia', cat: 'cafe', art: 'stove', era: 'KIŞ AKŞAMLARI', title: 'Soba üstünde çizilen kestane ve kuruyan mandalina kabuğu', body: 'Kış akşamlarında güğümde fokurdayan suyun sesi, sobanın üzerinde çıtırdayan kestaneler ve odaya yayılan kızarmış mandalina kabuğu kokusu en sıcak aile sohbetlerinin fon müziğiydi.', tag: 'Kokusu hâlâ hafızalarda' },
    { id: 'n-3', mode: 'nostalgia', cat: 'general', art: 'rotary', era: 'İLETİŞİM TARİHİ', title: 'Çevirmeli telefonlarda sıfırı çevirirken geçen uzun saniyeler', body: 'Numarada çok sayıda 9 ve 0 varsa parmağımızı deliğe sokup çarkın ağır ağır "tıkır tıkır" geri dönmesini beklerdik. Yanlış çevrilen son rakam, tüm numarayı baştan çevirmek demekti!', tag: 'Ezbere bilinen ev telefonları dönemi' },
    { id: 'n-4', mode: 'nostalgia', cat: 'cinema', art: 'atari', era: 'OYUN DÜNYASI', title: 'Sarı atari kasetleri ve "9999999 in 1" efsanesi', body: 'Üzerinde milyonlarca oyun yazdığı halde içinde Super Mario, Tank 1990, Contra ve Ördek Avı çıkan sarı kasetler… Çalışmayınca kasetin altına üfleyip tekrar takmak kesin çözümdü!', tag: 'Adaptör ısınmasın diye mola verilen günler' },
    { id: 'n-5', mode: 'nostalgia', cat: 'sport', art: 'streetball', era: 'MAHALLE KÜLTÜRÜ', title: 'İki taş arası kale ve "Üç korner bir penaltı" kuralı', body: 'Mahalle maçlarında kaleler iki kaldırım taşıyla kurulur, kaleci üstten geçen her topa "Direk üstü!" diye itiraz ederdi. Hava kararıp sokak lambaları yanınca anneler balkondan seslenirdi.', tag: 'Topun sahibi küsüp giderse maç biterdi' },
    { id: 'n-6', mode: 'nostalgia', cat: 'general', art: 'eraser', era: 'OKUL YILLARI', title: 'Kokulu silgiler ve mıknatıslı çift katlı kalem kutuları', body: 'Çilek ve şeftali kokulu silgiler silmekten çok koklamak içindi. Üzerindeki tuşlara basınca kalemtıraşı ve gizli bölmeleri açılan mıknatıslı kalem kutuları ise sınıfın en havalı eşyasıydı.', tag: 'Okulun ilk günü heyecanı' },
    { id: 'n-7', mode: 'nostalgia', cat: 'cinema', art: 'tv', era: 'TELEVİZYON KUŞAĞI', title: 'Pazar sabahı çizgi filmleri ve Parliament Sinema Kulübü müziği', body: 'Cumartesi-Pazar sabahları erkenden uyanıp battaniye altında çizgi film izlemek, Pazar gecesi ise o unutulmaz saksafon müziği çalınca ertesi gün okul olduğunu hatırlamak…', tag: 'Kumandası poşetle kaplı televizyonlar' },
    { id: 'n-8', mode: 'nostalgia', cat: 'cafe', art: 'gazoz', era: 'YAZ AKŞAMLARI', title: 'Açık hava yazlık sinemalar ve çekirdek-gazoz keyfi', body: 'Tahta sandalyelerin dizildiği yazlık bahçe sinemalarında yıldızların altında film izlenir, perde aralarında buz gibi gazoz ve kağıt külahlarda ay çekirdeği ikram edilirdi.', tag: 'Mahallece paylaşılan yaz neşesi' },
  ];

  const DEFAULT_CFG = {
    enabled: true,
    every: 2,
    gapMin: 0,
    durSec: 14,
    modes: ['quiz', 'fact', 'stat', 'riddle', 'word', 'illusion', 'zoom', 'nostalgia'],
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

  // Sunucudaki veya TV durumundaki canlı verilerden (Tarihte Bugün, Puan Durumu, Sinema, Kitaplar) günlük otomatik kartlar üretir
  function buildDynamic(state) {
    if (!state || typeof state !== 'object') return [];
    const out = [];
    // 1) Vikipedi Tarihte Bugün -> otomatik Quiz ve Biliyor Muydunuz kartları
    const otd = state.onThisDay && Array.isArray(state.onThisDay.items) ? state.onThisDay.items : [];
    otd.forEach((ev, idx) => {
      const yr = Number(ev && ev.year);
      const txt = String((ev && ev.text) || '').trim();
      if (!yr || txt.length < 25) return;
      if (idx % 2 === 0 && yr > 100 && yr <= new Date().getFullYear()) {
        const nowY = new Date().getFullYear();
        const d1 = Math.max(100, yr - (7 + (idx % 5) * 3));
        const d2 = Math.min(nowY, yr + (4 + (idx % 4) * 3));
        const d3 = yr > nowY - 15 ? yr - 18 : Math.min(nowY, yr + 14);
        const rawOpts = [...new Set([yr, d1, d2, d3])];
        while (rawOpts.length < 4) rawOpts.push(yr - rawOpts.length * 5);
        const rnd = seeded(yr + idx * 31);
        const optsNum = rawOpts.slice(0, 4).sort(() => rnd() - 0.5);
        const ans = optsNum.indexOf(yr);
        out.push({
          id: 'dyn-otd-q-' + yr + '-' + idx,
          mode: 'quiz',
          cat: 'general',
          q: `Tarihte Bugün: "${txt.slice(0, 155)}${txt.length > 155 ? '…' : ''}" olayı hangi yılda gerçekleşmiştir?`,
          opts: optsNum.map(y => y + ' yılı'),
          ans: ans >= 0 ? ans : 0,
          exp: `Bu tarihi olay ${yr} yılında bugün gerçekleşmiştir.`,
        });
      } else {
        out.push({
          id: 'dyn-otd-f-' + yr + '-' + idx,
          mode: 'fact',
          cat: 'general',
          icon: '📅',
          kicker: `TARİHTE BUGÜN · ${yr}`,
          title: `${yr} yılında bugün yaşanan tarihi gelişme`,
          body: txt,
          tag: 'Günlük otomatik güncellenen tarih arşivi',
        });
      }
    });

    // 2) Canlı Puan Durumu -> güncel liderlik quiz ve istatistik kartları
    const stMap = state.standings && typeof state.standings === 'object' ? state.standings : {};
    Object.entries(stMap).forEach(([league, rows], lIdx) => {
      if (!Array.isArray(rows) || rows.length < 4) return;
      const top = rows[0], second = rows[1];
      if (!top || !top.name || !top.pts) return;
      const teamPool = rows.slice(0, 4).map(r => r.name);
      const rnd = seeded(lIdx * 131 + Number(top.pts || 0));
      const opts = teamPool.slice().sort(() => rnd() - 0.5);
      out.push({
        id: 'dyn-st-q-' + lIdx,
        mode: 'quiz',
        cat: 'sport',
        q: `Güncel ${league} puan tablosunda ${top.pts} puanla liderlik koltuğunda oturan takım hangisidir?`,
        opts,
        ans: Math.max(0, opts.indexOf(top.name)),
        exp: `${top.name}, oynadığı ${top.gp || '-'} maçta topladığı ${top.pts} puanla ${league} zirvesinde yer alıyor.`,
      });
      out.push({
        id: 'dyn-st-s-' + lIdx,
        mode: 'stat',
        cat: 'sport',
        num: `${top.pts} Puan`,
        unit: `${league.toUpperCase()} LİDERİ`,
        title: `${top.name}, güncel ${league} zirvesinde!`,
        body: `Oynanan ${top.gp || '-'} hafta sonunda ${top.name} ${top.w || '-'} galibiyet ve ${top.pts} puanla lider. En yakın takipçisi ${second ? second.name + ' (' + second.pts + ' puan)' : ''}.`,
      });
    });

    // 3) Bu Hafta Sinemalarda (TMDB) -> güncel sinema kartları
    const mvList = state.movies && Array.isArray(state.movies.items) ? state.movies.items : [];
    mvList.slice(0, 4).forEach((m, idx) => {
      if (!m || !m.title) return;
      out.push({
        id: 'dyn-mv-' + (m.id || idx),
        mode: 'fact',
        cat: 'cinema',
        icon: '🍿',
        kicker: 'GÜNCEL VİZYON REHBERİ',
        title: `Sinemalarda Bu Hafta: ${m.title}`,
        body: `${m.original ? 'Orijinal adı "' + m.original + '" olan yapım' : '"' + m.title + '" filmi'} ${m.date ? m.date + ' vizyon tarihiyle' : 'bu hafta'} sinema salonlarında izleyicilerle buluşuyor.${m.rating ? ' İzleyici puanı: ' + m.rating + '/10.' : ''}`,
        tag: 'Haftalık otomatik güncellenen sinema kuşağı',
      });
    });

    // 4) Yeni Çıkan Kitaplar -> kültür kartları
    const bkList = state.books && Array.isArray(state.books.items) ? state.books.items : [];
    bkList.slice(0, 4).forEach((b, idx) => {
      if (!b || !b.title) return;
      out.push({
        id: 'dyn-bk-' + idx,
        mode: 'fact',
        cat: 'cinema',
        icon: '📚',
        kicker: 'HAFTANIN KİTAP SEÇKİSİ',
        title: `${b.title}${b.author ? ' — ' + b.author : ''}`,
        body: b.desc ? b.desc : `${b.author ? b.author + ' tarafından kaleme alınan ' : ''}"${b.title}"${b.publisher ? ', ' + b.publisher + ' etiketiyle' : ''} raflardaki yerini aldı.`,
        tag: 'Otomatik yenilenen kültür & kitap vitrini',
      });
    });

    return out;
  }

  // Belirli bir adım (step) için sıradaki kartı seçer: formatlar sırayla döner,
  // her format kendi içinde seçili kategorilere ve günlük canlı kartlara göre karışık sırada ilerler.
  function pick(cfgRaw, step, forceMode, forceCat, extraItems) {
    const cfg = normCfg(cfgRaw);
    const modes = forceMode && MODES[forceMode] ? [forceMode] : cfg.modes;
    const cats = forceCat && CATS[forceCat] ? [forceCat] : cfg.cats;
    const daySeed = Math.floor(Date.now() / (6 * 3600 * 1000));
    const st = Math.max(0, Number(step) || 0);
    const mode = modes[st % modes.length];
    const dyn = Array.isArray(extraItems) ? extraItems : (typeof window !== 'undefined' && Array.isArray(window.__triviaDynamic) ? window.__triviaDynamic : []);
    const allItems = dyn.length ? ITEMS.concat(dyn) : ITEMS;
    let pool = allItems.filter(it => it && it.mode === mode && cats.includes(it.cat));
    if (!pool.length) pool = allItems.filter(it => it && it.mode === mode);
    if (!pool.length) pool = ITEMS.slice();
    const rnd = seeded(daySeed + mode.charCodeAt(0) * 97 + mode.charCodeAt(1) * 31);
    const shuffled = pool.slice().sort(() => rnd() - 0.5);
    const modeStep = Math.floor(st / modes.length);
    return shuffled[modeStep % shuffled.length];
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Optik illüzyon & dikkat testi SVG çizimleri (.spt.revealed sınıfıyla 2. aşamada görsel kanıt çizgileri belirir)
  function illusionSvg(kind) {
    if (kind === 'muller') {
      return `<svg viewBox="0 0 600 230" class="spt-svg">
        <line x1="150" y1="30" x2="150" y2="200" stroke="#34d399" stroke-width="3" stroke-dasharray="7 6" class="il-rev"/>
        <line x1="450" y1="30" x2="450" y2="200" stroke="#34d399" stroke-width="3" stroke-dasharray="7 6" class="il-rev"/>
        <g stroke="#f59e0b" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none">
          <line x1="150" y1="68" x2="450" y2="68"/>
          <polyline points="186,40 150,68 186,96"/>
          <polyline points="414,40 450,68 414,96"/>
          <line x1="150" y1="162" x2="450" y2="162"/>
          <polyline points="114,134 150,162 114,190"/>
          <polyline points="486,134 450,162 486,190"/>
        </g>
        <text x="300" y="122" text-anchor="middle" fill="#6ee7b7" font-size="20" font-weight="800" class="il-rev">← İKİ ÇİZGİ DE TAM 300 BİRİM →</text>
      </svg>`;
    }
    if (kind === 'ebbinghaus') {
      return `<svg viewBox="0 0 600 230" class="spt-svg">
        <g fill="#38bdf8" opacity="0.78">
          <circle cx="175" cy="40" r="30"/><circle cx="175" cy="190" r="30"/>
          <circle cx="100" cy="115" r="30"/><circle cx="250" cy="115" r="30"/>
          <circle cx="430" cy="62" r="12"/><circle cx="430" cy="168" r="12"/>
          <circle cx="377" cy="115" r="12"/><circle cx="483" cy="115" r="12"/>
          <circle cx="392" cy="77" r="12"/><circle cx="468" cy="77" r="12"/>
          <circle cx="392" cy="153" r="12"/><circle cx="468" cy="153" r="12"/>
        </g>
        <circle cx="175" cy="115" r="26" fill="#f59e0b"/>
        <circle cx="430" cy="115" r="26" fill="#f59e0b"/>
        <line x1="175" y1="89" x2="430" y2="89" stroke="#34d399" stroke-width="3" stroke-dasharray="6 5" class="il-rev"/>
        <line x1="175" y1="141" x2="430" y2="141" stroke="#34d399" stroke-width="3" stroke-dasharray="6 5" class="il-rev"/>
      </svg>`;
    }
    if (kind === 'ponzo') {
      return `<svg viewBox="0 0 600 230" class="spt-svg">
        <g stroke="#64748b" stroke-width="5" stroke-linecap="round">
          <line x1="235" y1="22" x2="95" y2="210"/>
          <line x1="365" y1="22" x2="505" y2="210"/>
          <line x1="215" y1="55" x2="385" y2="55" stroke-width="3" opacity="0.45"/>
          <line x1="185" y1="95" x2="415" y2="95" stroke-width="3" opacity="0.45"/>
          <line x1="150" y1="140" x2="450" y2="140" stroke-width="3" opacity="0.45"/>
          <line x1="115" y1="185" x2="485" y2="185" stroke-width="3" opacity="0.45"/>
        </g>
        <line x1="215" y1="68" x2="385" y2="68" stroke="#facc15" stroke-width="10" stroke-linecap="round"/>
        <line x1="215" y1="162" x2="385" y2="162" stroke="#facc15" stroke-width="10" stroke-linecap="round"/>
        <line x1="215" y1="45" x2="215" y2="188" stroke="#34d399" stroke-width="3" stroke-dasharray="6 5" class="il-rev"/>
        <line x1="385" y1="45" x2="385" y2="188" stroke="#34d399" stroke-width="3" stroke-dasharray="6 5" class="il-rev"/>
      </svg>`;
    }
    if (kind === 'contrast') {
      return `<svg viewBox="0 0 600 230" class="spt-svg">
        <rect x="70" y="25" width="220" height="180" rx="16" fill="#0f172a" stroke="#334155" stroke-width="2"/>
        <rect x="310" y="25" width="220" height="180" rx="16" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="2"/>
        <rect x="145" y="80" width="70" height="70" rx="8" fill="#94a3b8"/>
        <rect x="385" y="80" width="70" height="70" rx="8" fill="#94a3b8"/>
        <rect x="145" y="96" width="310" height="38" fill="#94a3b8" class="il-rev"/>
        <text x="300" y="121" text-anchor="middle" fill="#0f172a" font-size="17" font-weight="900" class="il-rev">TEK PARÇA AYNI GRİ (#94A3B8)</text>
      </svg>`;
    }
    if (kind === 'odd8') {
      const rows = [
        ['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', '8', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B'],
      ];
      let cells = '';
      rows.forEach((r, ri) => r.forEach((ch, ci) => {
        const is8 = ch === '8';
        const x = 92 + ci * 58, y = 48 + ri * 44;
        cells += `<text x="${x}" y="${y}" text-anchor="middle" fill="${is8 ? '#fff' : '#cbd5e1'}" font-size="28" font-weight="800" font-family="monospace">${ch}</text>`;
        if (is8) cells += `<circle cx="${x}" cy="${y - 10}" r="22" fill="none" stroke="#10b981" stroke-width="4" class="il-rev"/>`;
      }));
      return `<svg viewBox="0 0 600 220" class="spt-svg">${cells}</svg>`;
    }
    if (kind === 'stroop') {
      return `<svg viewBox="0 0 600 220" class="spt-svg">
        <rect x="65" y="30" width="470" height="160" rx="22" fill="rgba(15,23,42,0.85)" stroke="rgba(255,255,255,0.16)" stroke-width="2"/>
        <text x="300" y="128" text-anchor="middle" fill="#10b981" font-size="68" font-weight="900" letter-spacing="4">KIRMIZI</text>
        <text x="300" y="172" text-anchor="middle" fill="#facc15" font-size="20" font-weight="800" class="il-rev">YAZI RENGİ: YEŞİL ✓</text>
      </svg>`;
    }
    if (kind === 'triangles') {
      return `<svg viewBox="0 0 600 230" class="spt-svg">
        <polygon points="300,22 175,202 425,202" fill="rgba(59,130,246,0.12)" stroke="#f8fafc" stroke-width="5" stroke-linejoin="round"/>
        <polygon points="237,112 363,112 300,202" fill="rgba(245,158,11,0.18)" stroke="#f59e0b" stroke-width="4" stroke-linejoin="round"/>
        <polygon points="300,22 175,202 425,202" fill="none" stroke="#10b981" stroke-width="6" stroke-dasharray="10 6" class="il-rev"/>
        <text x="300" y="88" text-anchor="middle" fill="#6ee7b7" font-size="22" font-weight="900" class="il-rev">1</text>
        <text x="235" y="182" text-anchor="middle" fill="#6ee7b7" font-size="22" font-weight="900" class="il-rev">2</text>
        <text x="300" y="152" text-anchor="middle" fill="#6ee7b7" font-size="22" font-weight="900" class="il-rev">3</text>
        <text x="365" y="182" text-anchor="middle" fill="#6ee7b7" font-size="22" font-weight="900" class="il-rev">4</text>
        <text x="485" y="118" text-anchor="middle" fill="#34d399" font-size="21" font-weight="900" class="il-rev">+1 BÜYÜK = 5</text>
      </svg>`;
    }
    return `<svg viewBox="0 0 600 230" class="spt-svg">
      <rect x="130" y="20" width="340" height="190" rx="18" fill="#0f172a" stroke="#334155" stroke-width="2"/>
      <path d="M225,35 L375,35 C375,70 335,85 335,115 C335,145 365,165 385,190 L215,190 C235,165 265,145 265,115 C265,85 225,70 225,35 Z" fill="#f59e0b"/>
      <circle cx="195" cy="95" r="5" fill="#38bdf8" class="il-rev"/>
      <circle cx="405" cy="95" r="5" fill="#38bdf8" class="il-rev"/>
    </svg>`;
  }

  // Görsel tahmin (Zoom) ve Nostalji kartları için vektörel sahneler
  function sceneSvg(key) {
    const scenes = {
      kapadokya: `<svg viewBox="0 0 400 260" class="spt-scene">
        <defs><linearGradient id="g-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1e1b4b"/><stop offset="60%" stop-color="#9a3412"/><stop offset="100%" stop-color="#f59e0b"/></linearGradient></defs>
        <rect width="400" height="260" fill="url(#g-sky)"/>
        <circle cx="310" cy="70" r="32" fill="#fde047" opacity="0.85"/>
        <path d="M0,260 L0,195 L55,175 L95,205 L140,125 L165,125 L195,210 L245,105 L275,105 L305,205 L355,160 L400,190 L400,260 Z" fill="#451a03"/>
        <ellipse cx="152" cy="122" rx="22" ry="9" fill="#78350f"/>
        <ellipse cx="260" cy="102" rx="25" ry="10" fill="#78350f"/>
        <g transform="translate(95,62)"><circle cx="0" cy="0" r="24" fill="#ef4444"/><path d="M-12,20 L12,20 L7,30 L-7,30 Z" fill="#fde047"/><rect x="-6" y="33" width="12" height="8" rx="2" fill="#78350f"/></g>
        <g transform="translate(210,48) scale(0.72)"><circle cx="0" cy="0" r="24" fill="#38bdf8"/><path d="M-12,20 L12,20 L7,30 L-7,30 Z" fill="#f97316"/><rect x="-6" y="33" width="12" height="8" rx="2" fill="#78350f"/></g>
      </svg>`,
      galata: `<svg viewBox="0 0 400 260" class="spt-scene">
        <rect width="400" height="260" fill="#0f172a"/>
        <circle cx="95" cy="65" r="28" fill="#fef08a" opacity="0.9"/>
        <polygon points="200,24 148,95 252,95" fill="#f59e0b"/>
        <rect x="156" y="95" width="88" height="145" rx="4" fill="#94a3b8"/>
        <rect x="148" y="102" width="104" height="10" rx="3" fill="#cbd5e1"/>
        <rect x="170" y="120" width="14" height="22" rx="7" fill="#fde047"/>
        <rect x="193" y="120" width="14" height="22" rx="7" fill="#fde047"/>
        <rect x="216" y="120" width="14" height="22" rx="7" fill="#fde047"/>
        <path d="M0,235 Q200,220 400,235 L400,260 L0,260 Z" fill="#1d4ed8"/>
      </svg>`,
      kizkulesi: `<svg viewBox="0 0 400 260" class="spt-scene">
        <rect width="400" height="260" fill="#0c4a6e"/>
        <circle cx="310" cy="65" r="34" fill="#fb923c" opacity="0.88"/>
        <path d="M0,210 L400,210 L400,260 L0,260 Z" fill="#0369a1"/>
        <ellipse cx="200" cy="212" rx="95" ry="14" fill="#334155"/>
        <rect x="165" y="155" width="70" height="55" rx="4" fill="#f8fafc"/>
        <rect x="182" y="98" width="36" height="58" fill="#e2e8f0"/>
        <polygon points="200,58 175,98 225,98" fill="#475569"/>
        <line x1="200" y1="36" x2="200" y2="58" stroke="#f8fafc" stroke-width="3"/>
      </svg>`,
      gobeklitepe: `<svg viewBox="0 0 400 260" class="spt-scene">
        <rect width="400" height="260" fill="#451a03"/>
        <circle cx="200" cy="130" r="105" fill="#78350f" opacity="0.55"/>
        <path d="M135,65 L265,65 L265,108 L225,108 L225,225 L175,225 L175,108 L135,108 Z" fill="#d97706" stroke="#fde68a" stroke-width="4"/>
        <path d="M185,135 Q205,125 215,145 Q205,160 185,155 Z" fill="#78350f"/>
      </svg>`,
      eyfel: `<svg viewBox="0 0 400 260" class="spt-scene">
        <rect width="400" height="260" fill="#1e1b4b"/>
        <circle cx="110" cy="65" r="24" fill="#fde047" opacity="0.85"/>
        <path d="M200,20 L215,135 L258,240 L226,240 L212,195 L188,195 L174,240 L142,240 L185,135 Z" fill="none" stroke="#f59e0b" stroke-width="8" stroke-linejoin="round"/>
        <line x1="175" y1="135" x2="225" y2="135" stroke="#f59e0b" stroke-width="7"/>
        <line x1="162" y1="185" x2="238" y2="185" stroke="#f59e0b" stroke-width="7"/>
        <path d="M174,240 A26,26 0 0,1 226,240" fill="none" stroke="#f59e0b" stroke-width="7"/>
      </svg>`,
      piramit: `<svg viewBox="0 0 400 260" class="spt-scene">
        <rect width="400" height="260" fill="#7c2d12"/>
        <circle cx="310" cy="65" r="32" fill="#fde047"/>
        <polygon points="155,65 45,225 265,225" fill="#f59e0b"/>
        <polygon points="155,65 265,225 305,205" fill="#b45309"/>
        <polygon points="285,95 205,225 365,225" fill="#d97706"/>
        <rect x="0" y="220" width="400" height="40" fill="#9a3412"/>
      </svg>`,
      cezve: `<svg viewBox="0 0 400 260" class="spt-scene">
        <rect width="400" height="260" fill="#1c1917"/>
        <path d="M135,95 L235,95 L255,215 L115,215 Z" fill="#d97706" stroke="#fbbf24" stroke-width="4"/>
        <ellipse cx="185" cy="95" rx="50" ry="14" fill="#451a03" stroke="#fbbf24" stroke-width="4"/>
        <line x1="230" y1="115" x2="345" y2="62" stroke="#fcd34d" stroke-width="11" stroke-linecap="round"/>
        <path d="M165,68 Q155,45 170,30 M195,68 Q185,45 200,30" fill="none" stroke="#f8fafc" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
      </svg>`,
      kupa: `<svg viewBox="0 0 400 260" class="spt-scene">
        <rect width="400" height="260" fill="#064e3b"/>
        <circle cx="200" cy="78" r="42" fill="#facc15" stroke="#fef08a" stroke-width="4"/>
        <path d="M168,108 Q185,155 182,195 L218,195 Q215,155 232,108 Z" fill="#eab308"/>
        <rect x="158" y="195" width="84" height="16" rx="4" fill="#10b981"/>
        <rect x="150" y="211" width="100" height="20" rx="5" fill="#ca8a04"/>
      </svg>`,
      cassette: `<svg viewBox="0 0 400 260" class="spt-scene">
        <rect width="400" height="260" fill="#1e1b4b"/>
        <rect x="55" y="45" width="290" height="175" rx="16" fill="#334155" stroke="#94a3b8" stroke-width="4"/>
        <rect x="80" y="68" width="240" height="92" rx="8" fill="#f59e0b"/>
        <rect x="110" y="96" width="180" height="46" rx="23" fill="#0f172a"/>
        <circle cx="145" cy="119" r="16" fill="#f8fafc"/>
        <circle cx="255" cy="119" r="16" fill="#f8fafc"/>
        <polygon points="105,220 125,182 275,182 295,220" fill="#1e293b"/>
      </svg>`,
      stove: `<svg viewBox="0 0 400 260" class="spt-scene">
        <rect width="400" height="260" fill="#271206"/>
        <rect x="125" y="75" width="150" height="150" rx="14" fill="#7c2d12" stroke="#f97316" stroke-width="4"/>
        <ellipse cx="200" cy="75" rx="75" ry="16" fill="#9a3412" stroke="#fb923c" stroke-width="4"/>
        <rect x="165" y="135" width="70" height="36" rx="6" fill="#facc15"/>
        <circle cx="172" cy="72" r="10" fill="#451a03"/><circle cx="200" cy="75" r="10" fill="#451a03"/><circle cx="228" cy="72" r="10" fill="#451a03"/>
      </svg>`,
      rotary: `<svg viewBox="0 0 400 260" class="spt-scene">
        <rect width="400" height="260" fill="#0f172a"/>
        <path d="M95,210 L130,115 L270,115 L305,210 Z" fill="#dc2626"/>
        <circle cx="200" cy="165" r="42" fill="#f8fafc" stroke="#cbd5e1" stroke-width="4"/>
        <circle cx="200" cy="165" r="14" fill="#dc2626"/>
        <rect x="75" y="75" width="250" height="26" rx="13" fill="#ef4444"/>
      </svg>`,
      atari: `<svg viewBox="0 0 400 260" class="spt-scene">
        <rect width="400" height="260" fill="#172554"/>
        <rect x="95" y="38" width="210" height="185" rx="10" fill="#eab308" stroke="#fef08a" stroke-width="4"/>
        <rect x="120" y="62" width="160" height="95" rx="6" fill="#1d4ed8"/>
        <text x="200" y="118" text-anchor="middle" fill="#fff" font-size="24" font-weight="900">9999 IN 1</text>
      </svg>`,
      streetball: `<svg viewBox="0 0 400 260" class="spt-scene">
        <rect width="400" height="260" fill="#064e3b"/>
        <ellipse cx="90" cy="195" rx="34" ry="20" fill="#94a3b8"/>
        <ellipse cx="310" cy="195" rx="34" ry="20" fill="#94a3b8"/>
        <circle cx="200" cy="145" r="44" fill="#f8fafc" stroke="#0f172a" stroke-width="5"/>
        <polygon points="200,122 220,136 212,158 188,158 180,136" fill="#0f172a"/>
      </svg>`,
      eraser: `<svg viewBox="0 0 400 260" class="spt-scene">
        <rect width="400" height="260" fill="#3b0764"/>
        <rect x="85" y="75" width="130" height="110" rx="16" fill="#f472b6"/>
        <rect x="195" y="75" width="120" height="110" rx="16" fill="#60a5fa"/>
        <rect x="155" y="70" width="75" height="120" rx="6" fill="#f8fafc"/>
      </svg>`,
      tv: `<svg viewBox="0 0 400 260" class="spt-scene">
        <rect width="400" height="260" fill="#1e293b"/>
        <line x1="200" y1="60" x2="145" y2="18" stroke="#cbd5e1" stroke-width="5"/>
        <line x1="200" y1="60" x2="255" y2="18" stroke="#cbd5e1" stroke-width="5"/>
        <rect x="85" y="60" width="230" height="165" rx="18" fill="#78350f" stroke="#d97706" stroke-width="4"/>
        <rect x="105" y="80" width="155" height="125" rx="14" fill="#38bdf8"/>
        <circle cx="285" cy="110" r="12" fill="#fde047"/><circle cx="285" cy="145" r="12" fill="#fde047"/>
      </svg>`,
      gazoz: `<svg viewBox="0 0 400 260" class="spt-scene">
        <rect width="400" height="260" fill="#0f172a"/>
        <circle cx="90" cy="60" r="4" fill="#fef08a"/><circle cx="310" cy="50" r="5" fill="#fef08a"/><circle cx="240" cy="40" r="3" fill="#fef08a"/>
        <rect x="115" y="55" width="170" height="105" rx="6" fill="#f8fafc" stroke="#f59e0b" stroke-width="4"/>
        <text x="200" y="115" text-anchor="middle" fill="#0f172a" font-size="22" font-weight="900">YAZLIK SİNEMA</text>
      </svg>`,
    };
    return scenes[key] || scenes.kapadokya;
  }

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

/* WORD SCRAMBLE */
.spt-tiles{display:flex;flex-wrap:wrap;gap:.55em;margin:.75em 0 1em}
.spt-tile{width:2.75em;height:2.95em;border-radius:.55em;background:rgba(255,255,255,.09);border:2px solid rgba(255,255,255,.22);display:flex;align-items:center;justify-content:center;font-size:1.85em;font-weight:900;color:var(--accent2,#f4c04f);box-shadow:0 .25em .7em rgba(0,0,0,.35)}
.spt-tiles.solved{display:none}
.spt-tiles.solved .spt-tile{background:linear-gradient(145deg,rgba(16,185,129,.35),rgba(5,46,22,.85));border-color:#34d399;color:#6ee7b7}
.spt.revealed .spt-tiles.scram{display:none}
.spt.revealed .spt-tiles.solved{display:flex}

/* ILLUSION & ZOOM & NOSTALGIA */
.spt-vis-grid{display:grid;grid-template-columns:44% 1fr;align-items:center;gap:2em}
.spt-vis-stage{position:relative;border-radius:1.1em;overflow:hidden;background:rgba(15,23,42,.82);border:2px solid rgba(255,255,255,.15);aspect-ratio:16/10;display:flex;align-items:center;justify-content:center;box-shadow:0 .7em 2em rgba(0,0,0,.45)}
.spt-svg,.spt-scene{width:100%;height:100%;display:block}
.il-rev{opacity:0;transition:opacity .35s}
.spt.revealed .il-rev{opacity:1}
.zm-art{width:100%;height:100%;transform:scale(2.15);transform-origin:52% 42%;transition:transform .55s ease-out}
.spt.revealed .zm-art{transform:scale(1)}

/* FOOTER BAR */
.spt-foot{display:flex;align-items:center;justify-content:space-between;gap:1.2em}
.spt-bar{flex:1;height:.38em;background:rgba(255,255,255,.12);border-radius:99em;overflow:hidden}
.spt-bar > i{display:block;height:100%;width:100%;background:linear-gradient(90deg,var(--accent,#3b82f6),var(--accent2,#f4c04f));border-radius:99em;transform-origin:left center;transition:transform .95s linear}
.spt.vert .spt-opts,.spt.vert .spt-vis-grid{grid-template-columns:1fr}
.spt.vert .spt-stat-wrap,.spt.vert .spt-fact-wrap{grid-template-columns:1fr;flex-direction:column;text-align:center}
`;

  function ensureCss() {
    if (typeof document === 'undefined' || document.getElementById('spt-css')) return;
    const s = document.createElement('style');
    s.id = 'spt-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  const isTwoStage = mode => mode === 'quiz' || mode === 'riddle' || mode === 'word' || mode === 'illusion' || mode === 'zoom';

  function html(item, revealed) {
    ensureCss();
    const it = item || ITEMS[0];
    const m = MODES[it.mode] || MODES.fact;
    const c = CATS[it.cat] || CATS.general;
    const revCls = revealed ? ' revealed' : '';
    const two = isTwoStage(it.mode);
    const top = `<div class="spt-top">
      <div class="spt-pills">
        <span class="spt-badge">${m.icon} ${esc(m.badge)}</span>
        <span class="spt-cat">${c.icon} ${esc(c.name)}</span>
      </div>
      <div class="spt-timer" data-spt-timer>${
        two
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
    } else if (it.mode === 'word') {
      const scramChars = String(it.scrambled || '').split(/\s+/).filter(Boolean);
      const wordChars = String(it.word || '').split('');
      mid = `<div class="spt-mid">
        <div class="spt-kicker">🔎 İPUCU: ${esc(it.clue)}</div>
        <div class="spt-tiles scram">${scramChars.map(ch => `<span class="spt-tile">${esc(ch)}</span>`).join('')}</div>
        <div class="spt-tiles solved">${wordChars.map(ch => `<span class="spt-tile">${esc(ch)}</span>`).join('')}</div>
        <div class="spt-ansbox">
          <div class="spt-ans-wait">🔤 Karışık harflerden gizli kelimeyi bulabildiniz mi?</div>
          <div class="spt-ans-real">
            <b>✓ DOĞRU KELİME: ${esc(it.word)}</b>
            <span>${esc(it.exp)}</span>
          </div>
        </div>
      </div>`;
    } else if (it.mode === 'illusion') {
      mid = `<div class="spt-mid">
        <div class="spt-vis-grid">
          <div class="spt-vis-stage">${illusionSvg(it.kind)}</div>
          <div>
            <h2 class="spt-q" style="font-size:1.95em;margin-bottom:.45em">${esc(it.q)}</h2>
            ${it.hint ? `<div class="spt-hint" style="margin:0 0 .75em">👁️ ${esc(it.hint)}</div>` : ''}
            <div class="spt-ansbox">
              <div class="spt-ans-wait">🌀 Dikkatli bakın… Görsel kanıt birazdan açılıyor!</div>
              <div class="spt-ans-real">
                <b>✓ ${esc(it.ans)}</b>
                <span>${esc(it.exp)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    } else if (it.mode === 'zoom') {
      mid = `<div class="spt-mid">
        <div class="spt-vis-grid">
          <div class="spt-vis-stage"><div class="zm-art">${sceneSvg(it.landmark)}</div></div>
          <div>
            <h2 class="spt-q" style="font-size:1.95em;margin-bottom:.45em">${esc(it.q)}</h2>
            ${it.clue ? `<div class="spt-hint" style="margin:0 0 .75em">🔎 ${esc(it.clue)}</div>` : ''}
            <div class="spt-ansbox">
              <div class="spt-ans-wait">🔍 Yakınlaştırılmış detayı tanıdınız mı? Şimdi uzaklaşıyor…</div>
              <div class="spt-ans-real">
                <b>📍 ${esc(it.ans)}</b>
                <span>${esc(it.exp)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    } else if (it.mode === 'nostalgia') {
      mid = `<div class="spt-mid">
        <div class="spt-vis-grid">
          <div class="spt-vis-stage">${sceneSvg(it.art)}</div>
          <div class="spt-fact-body">
            <div class="spt-kicker">📻 ${esc(it.era || 'NOSTALJİ KÖŞESİ')}</div>
            <h2 class="spt-title" style="font-size:2.35em">${esc(it.title)}</h2>
            <p class="spt-desc">${esc(it.body)}</p>
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

    const footNote = (it.mode === 'fact' || it.mode === 'nostalgia') && it.tag
      ? `<span class="spt-tag">✦ ${esc(it.tag)}</span>`
      : `<span class="spt-cat" style="font-size:.9em;opacity:.85">${two ? 'Cevap ekranda otomatik açılır' : 'Etkileşimli Bilgi Kuşağı'}</span>`;

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

  // Kartı verilen kapsayıcı içinde çalıştırır (2 aşamalı modların sayacı ve ilerleme çubuğu dahil).
  // Dönen işlev çağrıldığında zamanlayıcıları temizler.
  function mount(container, item, durSec, onDone) {
    if (!container) return () => {};
    const it = item || ITEMS[0];
    const totalSec = Math.max(6, Number(durSec) || 14);
    const twoStage = isTwoStage(it.mode);
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

  const api = {
    MODES, CATS, ITEMS, DEFAULT_CFG,
    normCfg, buildDynamic, pick,
    html, fit, mount,
  };
  if (typeof window !== 'undefined') window.SPTrivia = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
