#!/usr/bin/env python3
"""tools/i18n/panel-*.tsv dosyalarını birleştirip public/i18n/{en,de,ar}.js sözlüklerini üretir.
Satır biçimi: tr ¦ en ¦ de ¦ ar   (ayraç " ¦ ")
Kullanım: python3 tools/i18n/build.py"""
import glob, json, os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '..', '..', 'public', 'i18n')
os.makedirs(out, exist_ok=True)
norm = lambda s: re.sub(r'\s+', ' ', s).strip()
rows, bad = {}, 0
for f in sorted(glob.glob(os.path.join(here, 'panel-*.tsv'))):
    for n, line in enumerate(open(f, encoding='utf-8'), 1):
        line = line.rstrip('\n')
        if not line.strip(): continue
        p = [norm(x) for x in line.split(' ¦ ')]
        if len(p) != 4 or not all(p):
            print(f'HATA {os.path.basename(f)}:{n}: 4 sütun bekleniyordu ({len(p)}): {line[:70]}'); bad += 1; continue
        tr = p[0]
        for i, l in enumerate(p[1:]):
            # yer tutucu ve etiket sayıları kaynakla aynı olmalı
            if tr.count('{}') != l.count('{}') or sorted(re.findall(r'</?\d+>', tr)) != sorted(re.findall(r'</?\d+>', l)):
                print(f'UYARI {os.path.basename(f)}:{n}: {["en","de","ar"][i]} yer tutucu/etiket uyuşmuyor: {tr[:60]}'); bad += 1
        rows[tr] = p[1:]
for i, lang in enumerate(['en', 'de', 'ar']):
    d = {k: v[i] for k, v in rows.items()}
    open(os.path.join(out, lang + '.js'), 'w', encoding='utf-8').write('window.I18N_DICT=' + json.dumps(d, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(f'{len(rows)} kayıt, {bad} sorun')
sys.exit(1 if bad else 0)
