# Çevrimiçi ödeme (iyzico / PayTR)

**Durum:** altyapı hazır, **varsayılan KAPALI** (`payments_mode=off`). Açılana kadar panelde düğme yok, uçlar 404 döner; TV/APK'ya dokunulmaz. Gerçek sağlayıcı sandbox'ı ile henüz denenmedi (aşağıda "Doğrulanacaklar").

## Kapı
`payments_mode` (Süper → API `PUT /api/super/billing {mode}`; ya da ortam değişkeni `PAYMENTS_MODE`, ayarı ezer):
- `off`: hiçbir işletme ödeyemez (varsayılan)
- `pilot`: yalnız `canPay` işaretli işletmeler (`PUT /api/super/tenants/:id {canPay:true}`)
- `all`: herkes. "Sınırsız" işletmeler hiçbir modda ödemez; süper yönetici başkası adına ödeyemez; ödemeyi zincirin ana işletmesi yapar.

## Ortam değişkenleri (anahtarlar veritabanına/koda yazılmaz)
| Değişken | Açıklama |
|---|---|
| `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_MERCHANT_ID` | iyzico; merchant id webhook imzasında kullanılır |
| `IYZICO_BASE_URL` | boşsa test ortamında sandbox, canlıda `https://api.iyzipay.com` |
| `PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT` | PayTR |
| `PAYTR_TEST_MODE` | `1`/`0`; boşsa test ortamında 1 |
| `BILLING_VAT` | KDV %, varsayılan 20 (fiyat "KDV hariç" ise tahsilata eklenir) |

## Sağlayıcı paneli ayarları
- iyzico → Ayarlar → Üye iş yeri bildirimleri → **Webhook URL:** `https://<alan>/api/billing/iyzico/webhook` (X-IYZ-SIGNATURE-V3 hesabınızda açık olmalı: entegrasyon@iyzico.com).
- PayTR → Ayarlar → **Bildirim URL:** `https://<alan>/api/billing/paytr/notify`.

## Akış
1. Panel `POST /api/admin/billing/checkout {provider, plan, period, customer}` → tutar sunucuda `pricing.js`'ten (TL, KDV dahil) hesaplanır → `payments` kaydı → `{url: /api/billing/pay/<sipariş>}`.
2. Ödeme sayfası (kendi sıkı CSP'si, 30 dk) sağlayıcının barındırılan formunu açar; kart verisi sunucuya girmez.
3. **Süre yalnız sağlayıcı bildirimiyle uzar** (iyzico webhook `subscription.order.success`, PayTR bildirimi). Aynı olay iki kez gelirse tek sayılır (`payment_events`). PayTR'de tutar kayıtla birebir eşleşmezse süre uzamaz (`mismatch`).
4. iyzico: aylık/yıllık **otomatik yenileme** (her başarılı yenileme +1/+12 ay). PayTR: **tek seferlik** dönem ödemesi; süre bitince yeniden ödenir.
5. Tahsilat başarısızsa süre uzatılmaz; süre bitince mevcut `plans.access` ekranı kapatır (veri silinmez). Askıdaki işletme ödemeyle açılmaz.
6. Zincirin tüm şubeleri aynı paket/süreyi alır.

## Canlıya açma sırası
1. `staging` + `APP_ENV=test`: sandbox anahtarları env'e → sağlayıcı panelinde webhook adreslerini test alan adına ver.
2. Doğrulanacaklar listesini sandbox'ta kapat.
3. Canlıya `payments_mode=off` ile çık (kod zararsız). Canlı anahtarlar env'e.
4. `pilot` + tek işletme (`canPay`) → gerçek küçük ödeme → süre/fatura kontrolü → `all`.

## Doğrulanacaklar (sandbox'ta, kodla kanıtlanamayanlar)
- iyzico plan/ürün oluşturma gövde alanları (`paymentInterval`, `planPaymentType`…) ve yanıttaki `data.referenceCode`.
- IYZWSv2 imzasında GET isteği (boş gövde) ve webhook imzasında `eventType` mi `iyziEventType` mi imzalanıyor (kod ikisini de dener).
- `identityNumber` zorunlu: işletme için vergi no yerine T.C. kimlik no kabul ediliyor mu.
- Panel arayüzü (Paketler kartında "Öde" formu) henüz YOK: uçlar hazır, `GET /api/admin/billing` `enabled` döner. Metinler eklenince `tools/i18n/panel-*.tsv` + `build.py` gerekir.
- Mali: üye iş yeri başvurusu (şahıs şirketi/şirket), e-arşiv fatura, mesafeli satış sözleşmesi + iade metni (Yasal sayfalar).
