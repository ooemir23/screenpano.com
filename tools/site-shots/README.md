# Tanıtım sitesi: özellikler ve görseller

Sitedeki (`/`) özellik gezgini, "Ve dahası" kartları ve paket karşılaştırma tablosu **`public/site/features.json`** dosyasından çizilir (`server/site.js`). Paket sınırları (kutu, alan, kullanıcı, şube) doğrudan `server/plans.js`'ten okunur. Dosya değişince sunucuyu yeniden başlatmak gerekmez.

## Uygulamaya yeni özellik eklendiğinde

1. `public/site/features.json` → `features` listesine bir kayıt ekleyin:

```json
{
  "id": "kisa-ad",
  "icon": "✨",
  "title": "Sitede görünecek başlık",
  "short": "Sekmedeki kısa ad",
  "text": "Bir iki cümlelik, müşterinin anlayacağı açıklama.",
  "points": ["Madde 1", "Madde 2"],
  "plan": "all",
  "compare": "Karşılaştırma tablosundaki satır",
  "added": "2026-11-15",
  "visual": { "type": "win", "img": "p-yeni" }
}
```

- `plan`: `all` (her pakette) ya da `pro`. Tablodaki Var/Yok buradan gelir.
- `added`: bu tarihten sonraki 60 gün sitede **Yeni** rozeti çıkar.
- `visual.type`: `tv` (TV görüntüsü, `img`), `win` (panel görüntüsü, `img`), `poster` (canlı afiş örneği), `schedule` (zamanlama tablosu). İsteğe bağlı `phone` (telefon görüntüsü) ve `win` (TV'nin altında panel).
- Yalnız tabloda görünsün istiyorsanız `"hidden": true` ve `compare` yeter.
- Küçük özellikler için `extras` listesine `{ "icon", "title", "text", "added" }` eklemek yeter ("Ve dahası" kartları).

2. Görsel gerekiyorsa aynı dosyadaki `shots` listesine nasıl çekileceğini yazın:

| Alan | Anlamı |
| --- | --- |
| `tenant` | `kafe`, `spor`, `vitrin` (örnek işletmeler, `run.js` içinde) |
| `view` | `tv` (1920×1080 TV), `panel` (masaüstü panel), `mobile` (telefonda panel), `pair` (TV eşleştirme ekranı) |
| `hash` | Panelde açılacak sayfa, örn. `stats`, `settings/devices` |
| `scroll` | Sayfayı bu kadar piksel aşağı kaydır |
| `eval` | TV sayfasında çalıştırılacak JS (örn. `showGoal({...})`) |
| `api` | Çekimden önce panel adına istek: `["POST", "/api/admin/..."]` |
| `after` | `eval`/`api` sonrası bekleme (ms) |

Adı `tv-` ile başlayan görseller 1600×900, `p-` 1440×900, `m-` 780×1688 yazılır.

3. GitHub'a gönderin. **Site görselleri** iş akışı (`.github/workflows/site-shots.yml`) uygulamayı açar, örnek işletmeleri kurar, görselleri çeker ve `public/site/*.webp` olarak geri yazar; bu commit Dokploy'u tetikler. Arayüz (TV, panel, afişler) değişince de kendiliğinden çalışır.

## Yerelde

```bash
npm install
npx playwright install chromium        # ya da CHROME_PATH=/usr/bin/google-chrome
npm run site-shots                     # hepsi
npm run site-shots -- p-yeni tv-gol    # yalnız bunlar
```

Fotoğraflar `photos/` altında (Unsplash lisansı, ticari kullanım serbest).
