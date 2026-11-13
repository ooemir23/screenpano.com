# ScreenPano — Gemini için kurallar

Bu dosya Gemini CLI'nın (Google AI Pro girişi) bu depoda yapabileceklerini sınırlar. Ana kurallar `CLAUDE.md`'dedir; çelişkide o geçerlidir.

- Dil: arayüz ve yorumlar Türkçe.
- **Yalnız okuma/üretme görevleri:** çeviri satırları (`tools/i18n/panel-*.tsv` biçimi: `tr ¦ en ¦ de ¦ ar`), mağaza metni taslağı, günlük/dosya özeti, geniş okuma. Çıktı kopyalanıp `staging` dalında insan ya da Claude (Opus) incelemesinden sonra uygulanır.
- **Doğrudan `main`'e yazma, push, canlıya alma, iş akışı çalıştırma YOK.**
- **Dokunma (Opus ile yapılır):** `server/auth.js`, `server/billing/`, `server/plans.js`, `server/pricing.js`, `server/state.js`, `server/sched.js`, `server/realtime.js`, `server/tenants.js`, `server/store.js`, `server/accounts.js`, `server/transfer.js`, native senkron/saat kodu (`android/**/Sync*`, `Clock*`), `.github/workflows/promote.yml`, anahtar/keystore/`.env` dosyaları.
- Arapçada alkollü içecek örneklerinden kaçın. `{}` ve `<0>…</0>` yer tutucularını bozma.
- Sitede yalnız uygulamanın gerçekten yaptığı şeyleri yaz; fiyat/satın alma çağrısı ekleme (Play politikası).
- Devretme betiği: `tools/ai/gemini-delegate.sh <ceviri|ozet|magaza|oku> <dosya...>`
