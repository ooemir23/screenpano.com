#!/usr/bin/env python3
# ScreenPano logoları: "ScreenPano" yazısı Montserrat'tan çizime (path) çevrilir; SVG resim olarak açıldığında
# yazı tipi yüklenemese de logo her yerde aynı görünür. Çalıştır: python3 tools/brand/make_logos.py
# Üretir: public/logo-light.svg (açık zemin), public/logo.svg (koyu zemin), public/logo-mark.svg (yalnız yazı,
# renkleri CSS'ten: currentColor + --pano), public/logo.png, android banner.png
import os, re, subprocess
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FONT = os.path.join(ROOT, 'public/fonts/montserrat-latin.woff2')
SIZE = 66  # yazı yüksekliği (em boyutu, px)

def word(text, weight, x0, base, tracking=-0.02):
    f = instancer.instantiateVariableFont(TTFont(FONT), {'wght': weight})
    gs, cmap, hmtx = f.getGlyphSet(), f.getBestCmap(), f['hmtx']
    k = SIZE / f['head'].unitsPerEm
    pen = SVGPathPen(gs); x = x0
    for ch in text:
        g = cmap[ord(ch)]
        gs[g].draw(TransformPen(pen, (k, 0, 0, -k, x, base)))
        x += hmtx[g][0] * k + tracking * SIZE
    return pen.getCommands(), x

def icon(src):
    s = open(os.path.join(ROOT, 'public', src)).read()
    defs = re.search(r'<defs>.*?</defs>', s, re.S).group(0)
    m = re.search(r'(<g transform="translate\(15, 14\)">.*?</g>)', s, re.S).group(1)
    return defs, m

def build(icon_src, screen_fill, out):
    defs, ic = icon(icon_src)
    grad = 'goldH' if 'goldH' in defs else 'goldLight'
    a, x = word('Screen', 600, 0, 0)
    b, x2 = word('Pano', 800, x + 1, 0, -0.01)
    w = 195 + x2 + 20
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="8 24 {w - 8:.0f} 138" width="{w - 8:.0f}" height="138" role="img" aria-label="ScreenPano">
  <title>ScreenPano</title>
  {defs}
  {ic}
  <g transform="translate(195, 114)">
    <path d="{a}" fill="{screen_fill}"/>
    <path d="{b}" fill="url(#{grad})"/>
  </g>
</svg>
'''
    open(os.path.join(ROOT, 'public', out), 'w').write(svg)
    return w

def mark():
    # yalnız yazı: sitede satır içi kullanılır; Screen = currentColor, Pano = var(--pano)
    a, x = word('Screen', 600, 0, 0)
    b, x2 = word('Pano', 800, x + 1, 0, -0.01)
    asc = SIZE * 0.74
    return x2, asc, a, b

wl = build('logo-light.svg', '#181A1A', 'logo-light.svg')
wd = build('logo.svg', '#FFFFFF', 'logo.svg')
w, asc, a, b = mark()
open(os.path.join(ROOT, 'public/logo-mark.svg'), 'w').write(
  f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 {-asc:.1f} {w:.1f} {SIZE * 0.96:.1f}"><path d="{a}" fill="#181A1A"/><path d="{b}" fill="#B86C20"/></svg>\n')

# PNG ve Android TV banner'ı (Chrome ile çizilir)
from playwright.sync_api import sync_playwright
pub = os.path.join(ROOT, 'public')
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None)
    import tempfile
    def page(html, vp):
        f = tempfile.NamedTemporaryFile('w', suffix='.html', delete=False); f.write(html); f.close()
        pg = br.new_page(viewport=vp); pg.goto('file://' + f.name); pg.wait_for_timeout(300); return pg
    pg = page(f'<body style="margin:0;background:transparent"><img src="file://{pub}/logo-light.svg" style="width:1360px;display:block">', {'width': 1360, 'height': 302})
    pg.screenshot(path=os.path.join(pub, 'logo.png'), omit_background=True, clip={'x': 0, 'y': 0, 'width': 1360, 'height': 302})
    pg = page(f'<body style="margin:0;width:640px;height:360px;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 30% 20%,#262a2a,#121414)"><img src="file://{pub}/logo.svg" style="width:520px">', {'width': 640, 'height': 360})
    pg.screenshot(path=os.path.join(ROOT, 'android/app/src/main/res/drawable-xhdpi/banner.png'))
    br.close()
print('logo-light', round(wl), 'logo', round(wd))
