#!/usr/bin/env bash
# Ucuz/büyük-bağlamlı işleri Gemini CLI'ya (Google AI Pro girişi) devreder; ÇIKTI YALNIZ OKUNUR METİNDİR, dosya yazmaz.
# Kullanım:  tools/ai/gemini-delegate.sh <görev> <dosya...>
#   görev: ceviri   (dosyadaki Türkçe metinleri en/de/ar için TSV satırı olarak üret: tr ¦ en ¦ de ¦ ar)
#          ozet     (dosya/günlük özeti; ham satır akıtma)
#          magaza   (Play mağazası metin taslağı: kısa ve uzun açıklama, tr + en)
#          oku      (büyük dosya(lar)ı oku, soru: ARGÜMAN ortam değişkeni SORU)
# Çıktı: ./tmp/gemini/<görev>-<zaman>.md ve ekranda ilk 60 satır. Sonucu Opus/insan inceler, sonra staging'e el ile uygulanır.
# YASAKLI yollar (Gemini'ye gönderilmez): auth, billing, plans, pricing, kota/senkron çekirdeği, gizli anahtarlar.
set -euo pipefail
cmd=${1:-}; shift || true
[ -n "$cmd" ] && [ $# -ge 1 ] || { sed -n 2,11p "$0"; exit 2; }
command -v gemini >/dev/null || { echo "gemini CLI yok: npm i -g @google/gemini-cli, sonra 'gemini' ile Google hesabınla giriş yap" >&2; exit 3; }

DENY='(^|/)(server/(auth|billing|plans|pricing|state|sched|realtime|tenants|store|accounts|transfer)(\.js|/)|android/.*(Sync|Clock)|\.env|.*keystore.*|.*secret.*|\.github/workflows/promote\.yml)'
for f in "$@"; do
  [ -f "$f" ] || { echo "dosya yok: $f" >&2; exit 4; }
  if printf '%s' "$f" | grep -Eqi "$DENY"; then echo "YASAK yol (Opus ile çalışılır): $f" >&2; exit 5; fi
done

case "$cmd" in
  ceviri) P='Aşağıdaki Türkçe arayüz metinlerini İngilizce, Almanca ve Arapçaya çevir. Her satır: tr ¦ en ¦ de ¦ ar biçiminde (¦ ayracı). {} ve <0>…</0> yer tutucularını aynen koru. Arapçada alkollü içecek örneklerinden kaçın. Yalnız satırları ver.' ;;
  ozet)   P='Aşağıdaki içeriği 15 maddeyi geçmeyecek şekilde özetle: hatalar, tekrar edenler, dikkat gerektirenler. Ham satır kopyalama.' ;;
  magaza) P='ScreenPano TV (kafe/restoran dijital ekran yönetimi) için Google Play mağaza metni yaz: kısa açıklama (en çok 80 karakter) ve uzun açıklama (en çok 4000 karakter), Türkçe ve İngilizce. Yalnızca verilen dosyalardaki gerçek özellikleri yaz; fiyat ve satın alma çağrısı koyma.' ;;
  oku)    P="${SORU:-Bu dosyaları özetle ve dikkat çeken riskleri listele.}" ;;
  *) echo "bilinmeyen görev: $cmd" >&2; exit 2 ;;
esac

mkdir -p tmp/gemini; out="tmp/gemini/${cmd}-$(date +%Y%m%d-%H%M%S).md"
{ for f in "$@"; do printf '\n===== %s =====\n' "$f"; cat "$f"; done; } | gemini -p "$P" > "$out"
head -n 60 "$out"; echo "--- tam çıktı: $out ($(wc -l < "$out") satır) — uygulamadan önce Opus/insan incelemesi şart ---" >&2
