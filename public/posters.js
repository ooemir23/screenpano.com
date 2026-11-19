/* Hazır içerikler (afiş şablonları). TV ve panel aynı dosyayı kullanır.
   Renkler işletmenin temasından gelir (--accent, --accent2, --bg, --white, --font).
   SPPoster.html(item, lang) -> HTML; SPPoster.fit(el) yazı boyunu kutuya göre ayarlar. */
(function () {
  const T = {
    happy:    { name: 'Happy Hour', fields: { title: 'Happy Hour', sub: '17:00 – 19:00', note: 'Tüm kokteyllerde %30 indirim' } },
    kahvalti: { name: 'Kahvaltı', fields: { title: 'Serpme Kahvaltı', price: '450 ₺', sub: 'Hafta sonu 09:00 – 13:00', note: 'Sınırsız çay ile' }, image: true },
    indirim:  { name: 'İndirim', fields: { badge: '%20', title: 'Tüm tatlılarda indirim', sub: 'Bu hafta boyunca', note: '' } },
    yeni:     { name: 'Yeni ürün', fields: { badge: 'Yeni', title: 'Fıstıklı Latte', price: '145 ₺', sub: 'Antep fıstığı, espresso, süt köpüğü' }, image: true },
    gunun:    { name: 'Günün menüsü', fields: { title: 'Günün Menüsü', body: 'Mercimek çorbası\nTavuk sote, pilav\nSalata\nAyran', price: '280 ₺' } },
    muzik:    { name: 'Canlı müzik', fields: { title: 'Canlı Müzik', sub: 'Cuma 21:00', note: 'Akustik gece · rezervasyon önerilir' } },
    etkinlik: { name: 'Etkinlik', fields: { badge: 'Bu akşam', title: 'Maç Gecesi', sub: 'Dev ekranda canlı yayın', note: 'Masanızı ayırtın' }, image: true },
    wifi:     { name: 'Wi-Fi', fields: { title: 'Ücretsiz Wi-Fi', sub: 'Ağ: Kafe_Misafir', note: 'Şifre: hosgeldiniz' } },
    tesekkur: { name: 'Teşekkür', fields: { title: 'Bizi tercih ettiğiniz için teşekkürler', sub: '@isletmeniz', note: 'Paylaşımlarınızda bizi etiketleyin' } },
    tahmin:   { name: 'Tahmin Ligi', hidden: true, fields: {} },
    dogan:    { name: 'Bugün doğanlar', hidden: true, fields: {} },
    kitap:    { name: 'Yeni kitap', hidden: true, fields: { badge: 'Yeni çıkan kitap', title: '', sub: '', note: '' }, image: true },
    insta:    { name: 'Instagram', hidden: true, fields: { title: '', sub: '', note: '' }, image: true },
  };
  const FIELD_LABELS = { badge: 'Rozet', title: 'Başlık', sub: 'Alt yazı', price: 'Fiyat', note: 'Not', body: 'Satırlar (her satıra bir ürün)' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const css = `
.spp{position:absolute;inset:0;overflow:hidden;font-family:var(--font,'Montserrat'),sans-serif;color:var(--white,#fff);background:var(--bg,#151717);display:flex;line-height:1.1;letter-spacing:-.01em}
.spp *{box-sizing:border-box}
.spp .ph{position:absolute;inset:0;background-size:cover;background-position:center}
.spp .shade{position:absolute;inset:0;background:linear-gradient(90deg,var(--bg,#151717) 0%,rgba(0,0,0,.55) 55%,rgba(0,0,0,.05) 100%)}
.spp .in{position:relative;z-index:1;display:flex;flex-direction:column;justify-content:center;padding:6% 7%;gap:.35em;max-width:100%}
.spp h1{margin:0;font-weight:800;font-size:4.2em;line-height:.98;text-wrap:balance}
.spp .sub{font-size:1.6em;font-weight:600;color:var(--accent2,#c9955c)}
.spp .note{font-size:1.15em;opacity:.82;font-weight:500}
.spp .price{font-size:2.6em;font-weight:800;color:var(--accent2,#c9955c);white-space:nowrap}
.spp .badge{align-self:flex-start;background:var(--accent2,#c9955c);color:var(--bg,#151717);font-weight:800;font-size:1.25em;padding:.25em .7em;border-radius:.3em}
/* happy hour: çapraz şeritler, büyük saat */
.spp.t-happy{background:repeating-linear-gradient(-45deg,var(--bg) 0 1.6em,color-mix(in srgb,var(--accent) 35%,var(--bg)) 1.6em 3.2em)}
.spp.t-happy .in{margin:auto;text-align:center;align-items:center;background:var(--bg);border:.18em solid var(--accent2);padding:5% 8%;border-radius:.6em}
.spp.t-happy h1{font-size:5em;text-transform:uppercase;letter-spacing:.02em}
.spp.t-happy .sub{font-size:3em;color:var(--white);font-variant-numeric:tabular-nums}
/* indirim: dev yüzde */
.spp.t-indirim{align-items:center}
.spp.t-indirim .big{position:relative;z-index:1;flex:0 0 46%;display:flex;align-items:center;justify-content:center;font-size:11em;font-weight:900;color:var(--bg);background:var(--accent2);height:100%;letter-spacing:-.06em}
.spp.t-indirim .in{flex:1}
/* günün menüsü: satır listesi */
.spp.t-gunun .in{width:100%;justify-content:flex-start;padding-top:5%}
.spp.t-gunun h1{font-size:3.4em;border-bottom:.08em solid var(--accent2);padding-bottom:.25em;margin-bottom:.3em}
.spp.t-gunun ul{list-style:none;margin:0;padding:0;font-size:1.9em;font-weight:600;display:grid;gap:.35em}
.spp.t-gunun li::before{content:'';display:inline-block;width:.45em;height:.45em;border-radius:50%;background:var(--accent2);margin-right:.6em;vertical-align:.1em}
.spp.t-gunun .price{margin-top:auto;align-self:flex-end}
/* canlı müzik: ses dalgası */
.spp.t-muzik{background:radial-gradient(circle at 78% 50%,color-mix(in srgb,var(--accent) 60%,var(--bg)) 0,var(--bg) 62%)}
.spp.t-muzik .wave{position:absolute;right:8%;top:50%;transform:translateY(-50%);display:flex;gap:.5em;align-items:center;height:60%}
.spp.t-muzik .wave i{width:.9em;border-radius:.45em;background:var(--accent2);animation:sppw 1.4s ease-in-out infinite}
@keyframes sppw{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}
/* wifi: halkalar */
.spp.t-wifi .in{margin:auto;text-align:center;align-items:center}
.spp.t-wifi svg{width:6em;height:6em;margin-bottom:.4em}
.spp.t-wifi .sub,.spp.t-wifi .note{font-size:2.1em;font-weight:700}
.spp.t-wifi .note{color:var(--white);opacity:1;background:color-mix(in srgb,var(--accent) 40%,transparent);padding:.2em .6em;border-radius:.3em}
/* teşekkür: ortada, ince çerçeve */
.spp.t-tesekkur .in{margin:auto;text-align:center;align-items:center;max-width:80%}
.spp.t-tesekkur h1{font-size:3.6em;font-weight:700}
.spp.t-tesekkur::after{content:'';position:absolute;inset:4%;border:.12em solid color-mix(in srgb,var(--accent2) 70%,transparent);border-radius:.8em}
/* görselli şablonlar: görsel sağda */
.spp.has-img.t-kahvalti .ph,.spp.has-img.t-yeni .ph{left:42%}
.spp.has-img.t-kahvalti .shade,.spp.has-img.t-yeni .shade{background:linear-gradient(90deg,var(--bg) 42%,transparent 62%)}
.spp.has-img .in{max-width:58%}
.spp.t-etkinlik.has-img .in{max-width:70%}
/* yeni çıkan kitap: kapak solda, bilgi sağda */
.spp.t-kitap{background:radial-gradient(circle at 25% 50%,color-mix(in srgb,var(--accent) 45%,var(--bg)) 0,var(--bg) 70%)}
.spp.t-kitap .ph{right:auto;left:6%;top:7%;bottom:7%;width:34%;background-size:contain;background-repeat:no-repeat;background-position:center;filter:drop-shadow(0 .5em 1em rgba(0,0,0,.6))}
.spp.t-kitap .in{margin-left:44%;padding:5% 6% 5% 2%;justify-content:center;gap:.5em}
.spp.t-kitap h1{font-size:3.2em;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.spp.t-kitap .sub{font-size:1.9em}
.spp.t-kitap .note{font-size:1.5em}
/* yeni çıkan kitaplar: 2x2 kart; her kartın arkasında kendi kapağının bulanık hâli */
.spp.t-kitap.multi{display:flex;flex-direction:column;gap:2.2%;padding:2.6% 2.8%;background:radial-gradient(120% 90% at 50% 0,#2a2622 0,#141312 60%,#0c0b0b 100%)}
.spp.t-kitap.multi .hd{display:flex;align-items:center;gap:.6em;font-size:1em;font-weight:800;letter-spacing:.22em;color:var(--accent,#d6a35c)}
.spp.t-kitap.multi .hd:after{content:"";flex:1;height:1px;background:linear-gradient(90deg,color-mix(in srgb,var(--accent,#d6a35c) 70%,transparent),transparent)}
.spp.t-kitap.multi .gr{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:1fr;gap:3.2% 2.2%}
.spp.t-kitap.multi.n1 .gr{grid-template-columns:1fr}
.spp.t-kitap.multi .bkc{position:relative;overflow:hidden;display:flex;gap:4%;align-items:center;min-width:0;min-height:0;padding:3% 3.5%;border-radius:.7em;background:#1b1a19;border:1px solid rgba(255,255,255,.07);box-shadow:0 .5em 1.4em rgba(0,0,0,.45)}
.spp.t-kitap.multi .bkc:before{content:"";position:absolute;inset:-20%;background:var(--img) center/cover no-repeat;filter:blur(2.2em) saturate(1.3);opacity:.45}
.spp.t-kitap.multi .bkc:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(10,10,10,.15),rgba(10,10,10,.72) 45%,rgba(10,10,10,.85))}
.spp.t-kitap.multi .cv,.spp.t-kitap.multi .tx{position:relative;z-index:1}
.spp.t-kitap.multi .cv{height:100%;aspect-ratio:2/3;flex:none;background-size:cover;background-position:center;border-radius:.25em .45em .45em .25em;box-shadow:0 .5em 1.1em rgba(0,0,0,.6),inset .25em 0 0 rgba(0,0,0,.25)}
.spp.t-kitap.multi .tx{min-width:0;display:flex;flex-direction:column;gap:.3em;justify-content:center}
.spp.t-kitap.multi h2{margin:0;font-size:1.45em;line-height:1.1;font-weight:800;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.spp.t-kitap.multi .sub{font-size:1em;font-weight:600;opacity:.95}
.spp.t-kitap.multi .note{font-size:.85em;color:#fff;opacity:.9;font-weight:600}
.spp.t-kitap.multi p{margin:.3em 0 0;font-size:.84em;line-height:1.32;color:#f3eee6;opacity:1;text-shadow:0 1px 3px rgba(0,0,0,.7);display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
/* instagram */
.spp.t-insta{background:var(--bg)}
.spp.t-insta .ph{right:auto;width:56.25%;background-size:contain;background-repeat:no-repeat;background-color:#000}
.spp.t-insta .in{margin-left:56.25%;padding:5%;justify-content:center}
.spp.t-insta .ig{display:flex;align-items:center;gap:.5em;font-size:1.5em;font-weight:700}
.spp.t-insta .ig svg{width:1.3em;height:1.3em}
.spp.t-insta .cap{font-size:1.45em;font-weight:500;line-height:1.35;display:-webkit-box;-webkit-line-clamp:9;-webkit-box-orient:vertical;overflow:hidden;opacity:.92}
.spp[dir=rtl] .in{text-align:right}
/* dikey (portre) kutular: görsel üstte, yazı altta */
.spp.vert.t-indirim{flex-direction:column}
.spp.vert.t-indirim .big{flex:0 0 38%;width:100%;height:auto;font-size:9em}
.spp.vert.has-img.t-kahvalti .ph,.spp.vert.has-img.t-yeni .ph{left:0;bottom:42%}
.spp.vert.has-img.t-kahvalti .shade,.spp.vert.has-img.t-yeni .shade{background:linear-gradient(180deg,transparent 35%,var(--bg) 60%)}
.spp.vert.has-img .in{max-width:100%;margin-top:auto;padding-top:46%}
.spp.vert.t-insta .ph{width:100%;height:62%;bottom:auto}
.spp.vert.t-insta .in{margin-left:0;margin-top:auto;height:38%;width:100%}
.spp.vert.t-kitap:not(.multi) .ph{left:12%;right:12%;top:5%;bottom:50%;width:auto}
.spp.vert.t-kitap:not(.multi) .in{margin-left:0;margin-top:auto;height:48%;width:100%;padding:5% 7%}
.spp.vert.t-kitap.multi .gr{grid-template-columns:1fr}
/* Tahmin Ligi: stadyum gecesi havası (ışık hüzmeleri + saha çizgileri), solda başlık/ödül/adımlar, sağda QR ve ilk 5. Animasyon yok. */
.spp.t-tahmin{--g:#f5c542;--tc:var(--accent2,#c9955c);display:grid;grid-template-columns:1.32fr 1fr;gap:2.2em;padding:2.4em 2.8em;align-items:stretch;
  background:radial-gradient(38% 60% at 8% -8%,color-mix(in srgb,var(--tc) 38%,transparent),transparent 70%),radial-gradient(34% 55% at 96% -6%,rgba(255,255,255,.10),transparent 70%),
  radial-gradient(70% 70% at 70% 120%,color-mix(in srgb,#1f7a4a 34%,transparent),transparent 70%),linear-gradient(160deg,color-mix(in srgb,var(--bg,#151717) 88%,#0d3a24) 0%,color-mix(in srgb,var(--bg,#151717) 92%,#000) 100%)}
.spp.t-tahmin .pitch{position:absolute;inset:0;width:100%;height:100%;opacity:.07;pointer-events:none}
.spp.t-tahmin .l,.spp.t-tahmin .r{position:relative;z-index:1;min-width:0;display:flex;flex-direction:column}
.spp.t-tahmin .l{gap:1.05em;justify-content:center}
.spp.t-tahmin .top{display:flex;gap:.6em;align-items:center;flex-wrap:wrap}
.spp.t-tahmin .pill{display:inline-flex;align-items:center;gap:.45em;font-size:.82em;font-weight:800;letter-spacing:.14em;text-transform:uppercase;padding:.45em .9em;border-radius:99em;background:rgba(255,255,255,.08);border:.06em solid rgba(255,255,255,.16)}
.spp.t-tahmin .pill svg{width:1.25em;height:1.25em}
.spp.t-tahmin .pill.hot{background:var(--tc);color:#111;border-color:transparent}
.spp.t-tahmin .biz{font-size:1.9em;font-weight:700;line-height:1.05;opacity:.95;overflow-wrap:anywhere;margin-top:.25em}
.spp.t-tahmin .biz.lg{font-size:1.55em}.spp.t-tahmin .biz.xl{font-size:1.25em}
.spp.t-tahmin h1{margin:-.15em 0 -.1em;padding:.1em .06em .1em 0;font-size:4.9em;font-weight:900;line-height:.98;letter-spacing:-.03em;text-transform:uppercase;
  background:linear-gradient(180deg,#fff 0%,#fff 45%,color-mix(in srgb,var(--tc) 70%,#fff) 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 .06em .12em rgba(0,0,0,.45))}
.spp.t-tahmin h1 em{font-style:normal;display:block;margin-top:.04em;color:var(--tc);-webkit-text-fill-color:var(--tc)}
.spp.t-tahmin .prz{display:flex;align-items:center;gap:.9em;padding:.85em 1.1em;border-radius:.8em;
  background:linear-gradient(100deg,color-mix(in srgb,var(--g) 26%,transparent),color-mix(in srgb,var(--g) 6%,transparent));border:.09em solid color-mix(in srgb,var(--g) 65%,transparent);box-shadow:0 .5em 1.6em rgba(0,0,0,.35),inset 0 0 1.4em color-mix(in srgb,var(--g) 14%,transparent)}
.spp.t-tahmin .prz svg{width:3em;height:3em;flex:none;filter:drop-shadow(0 .1em .3em rgba(0,0,0,.4))}
.spp.t-tahmin .prz small{display:block;font-size:.78em;font-weight:800;letter-spacing:.16em;color:var(--g);margin-bottom:.2em}
.spp.t-tahmin .prz b{display:block;font-size:1.75em;font-weight:800;line-height:1.05;overflow-wrap:anywhere}
.spp.t-tahmin .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:.6em}
.spp.t-tahmin .st{display:flex;align-items:center;gap:.6em;padding:.65em .75em;border-radius:.65em;background:rgba(255,255,255,.06);border:.06em solid rgba(255,255,255,.12);font-size:.92em;font-weight:700;line-height:1.15}
.spp.t-tahmin .st i{flex:none;width:1.9em;height:1.9em;border-radius:50%;display:grid;place-items:center;font-style:normal;font-weight:900;background:var(--tc);color:#111}
.spp.t-tahmin .lw{display:flex;align-items:center;gap:.5em;font-size:.95em;opacity:.85}.spp.t-tahmin .lw b{color:var(--g)}
.spp.t-tahmin .r{gap:1em;padding:1.3em;border-radius:1.1em;background:linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,.035));border:.07em solid rgba(255,255,255,.14);box-shadow:0 1em 3em rgba(0,0,0,.4)}
.spp.t-tahmin .scan{display:flex;align-items:center;gap:1.1em}
.spp.t-tahmin .qrw{position:relative;flex:none;width:10.4em;height:10.4em;padding:.55em;background:#fff;border-radius:.7em;box-shadow:0 0 0 .22em var(--tc),0 .6em 1.6em rgba(0,0,0,.45)}
.spp.t-tahmin .qrw svg{width:100%;height:100%;display:block}
.spp.t-tahmin .cta{min-width:0}
.spp.t-tahmin .cta b{display:block;font-size:1.65em;font-weight:900;line-height:1;text-transform:uppercase;letter-spacing:-.01em}
.spp.t-tahmin .cta b span{color:var(--tc)}
.spp.t-tahmin .cta p{margin:.45em 0 0;font-size:.95em;line-height:1.3;opacity:.85}
.spp.t-tahmin .cta .free{display:inline-block;margin-top:.6em;font-size:.78em;font-weight:800;letter-spacing:.12em;padding:.3em .7em;border-radius:99em;background:color-mix(in srgb,#2ecc71 22%,transparent);color:#7dffb0;border:.06em solid color-mix(in srgb,#2ecc71 45%,transparent)}
.spp.t-tahmin .bd{flex:1;display:flex;flex-direction:column;min-height:0}
.spp.t-tahmin .bd h2{display:flex;justify-content:space-between;align-items:baseline;margin:0 0 .45em;font-size:.95em;font-weight:800;letter-spacing:.14em;opacity:.9}
.spp.t-tahmin .bd h2 span{font-size:.85em;letter-spacing:.04em;opacity:.7;font-weight:600}
.spp.t-tahmin .rw{display:grid;grid-template-columns:2em 1fr auto;gap:.7em;align-items:center;padding:.38em .5em;border-radius:.55em;font-size:1.08em}
.spp.t-tahmin .rw+.rw{margin-top:.28em}
.spp.t-tahmin .rw .n{width:1.75em;height:1.75em;border-radius:50%;display:grid;place-items:center;font-weight:900;font-size:.9em;background:rgba(255,255,255,.1)}
.spp.t-tahmin .rw.p1{background:linear-gradient(90deg,color-mix(in srgb,var(--g) 30%,transparent),transparent)}.spp.t-tahmin .rw.p1 .n{background:linear-gradient(160deg,#ffe58a,#d9a514);color:#3a2a00}
.spp.t-tahmin .rw.p2 .n{background:linear-gradient(160deg,#f1f3f5,#9aa4ae);color:#222}.spp.t-tahmin .rw.p3 .n{background:linear-gradient(160deg,#f0b07a,#a8642c);color:#2a1504}
.spp.t-tahmin .rw .nm{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.spp.t-tahmin .rw .p{font-weight:900;font-variant-numeric:tabular-nums;color:var(--tc)}.spp.t-tahmin .rw .p small{font-size:.62em;font-weight:700;opacity:.7;margin-left:.2em;color:var(--white,#fff)}
.spp.t-tahmin .rw.ghost{opacity:.38}.spp.t-tahmin .rw.ghost .nm{font-weight:600;letter-spacing:.2em}
.spp.t-tahmin .emp{margin-top:.5em;font-size:.95em;font-weight:700;color:var(--tc);text-align:center}
.spp.t-tahmin .url{font-size:.78em;opacity:.6;text-align:center;overflow-wrap:anywhere}
.spp.vert.t-tahmin{grid-template-columns:1fr;grid-template-rows:auto 1fr;gap:1.4em;padding:2.6em 2.2em}
.spp.vert.t-tahmin .l{justify-content:flex-start;gap:.9em}.spp.vert.t-tahmin h1{font-size:4.3em}
.spp.vert.t-tahmin .qrw{width:13em;height:13em}.spp.vert.t-tahmin .bd{flex:none}.spp.vert.t-tahmin .r{justify-content:center}
/* Bugün doğanlar: sabit konfeti ve balonlar, ortada büyük kutlama başlığı ve isim kartları. Animasyon yok. */
.spp.t-dogan{--g:#f5c542;--tc:var(--accent2,#c9955c);flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:1.1em;padding:2.4em 9em;
  background:radial-gradient(60% 70% at 50% 45%,color-mix(in srgb,var(--tc) 30%,transparent),transparent 70%),radial-gradient(40% 50% at 0 100%,rgba(229,72,77,.22),transparent 70%),radial-gradient(40% 50% at 100% 0,rgba(62,99,221,.22),transparent 70%),linear-gradient(160deg,color-mix(in srgb,var(--bg,#151717) 85%,#2a0f2e),color-mix(in srgb,var(--bg,#151717) 92%,#000))}
.spp.t-dogan .cf{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.spp.t-dogan .cf.v,.spp.vert.t-dogan .cf.h{display:none}.spp.vert.t-dogan .cf.v{display:block}
.spp.t-dogan .bl{position:absolute;top:6%;height:78%;width:auto;pointer-events:none;filter:drop-shadow(0 .4em 1em rgba(0,0,0,.4))}.spp.t-dogan .bl.l{left:1.6%}.spp.t-dogan .bl.r{right:1.6%}
.spp.t-dogan>*:not(.cf):not(.bl){position:relative;z-index:1}
.spp.t-dogan .k{display:inline-flex;align-items:center;gap:.6em;font-size:.95em;font-weight:800;letter-spacing:.18em;text-transform:uppercase;padding:.5em 1.1em;border-radius:99em;background:rgba(255,255,255,.08);border:.06em solid rgba(255,255,255,.18)}
.spp.t-dogan .k b{color:var(--g)}
.spp.t-dogan h1{margin:-.12em 0 -.16em;padding:.12em .08em .16em;font-size:5.4em;font-weight:900;line-height:1.05;letter-spacing:-.025em;background:linear-gradient(180deg,#fff 20%,color-mix(in srgb,var(--g) 85%,#fff) 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 .06em .14em rgba(0,0,0,.5))}
.spp.t-dogan .nm{display:flex;flex-wrap:wrap;justify-content:center;gap:.7em;max-width:100%}
.spp.t-dogan .n{display:inline-flex;align-items:center;gap:.45em;font-weight:800;padding:.42em .95em;border-radius:.6em;background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,.06));border:.08em solid color-mix(in srgb,var(--g) 55%,transparent);box-shadow:0 .4em 1.2em rgba(0,0,0,.35);white-space:nowrap}
.spp.t-dogan .n i{font-style:normal}
.spp.t-dogan .nm.c1 .n{font-size:3.4em;padding:.3em .8em}.spp.t-dogan .nm.c2 .n{font-size:2.5em}.spp.t-dogan .nm.c3 .n{font-size:1.9em}.spp.t-dogan .nm.c4 .n{font-size:1.45em}
.spp.t-dogan .more{font-size:1.1em;font-weight:700;opacity:.8}
.spp.t-dogan .ft{font-size:1.35em;font-weight:600;opacity:.92}.spp.t-dogan .ft b{color:var(--tc)}
.spp.vert.t-dogan{padding:6em 2.4em}.spp.vert.t-dogan h1{font-size:4.4em}.spp.vert.t-dogan .bl{height:30%;top:auto;bottom:2%}`;
  function ensureCss() { if (document.getElementById('spp-css')) return; const s = document.createElement('style'); s.id = 'spp-css'; s.textContent = css; document.head.appendChild(s); }

  // item: { tpl, fields, i18n:{en:{...}}, image:url }
  function html(item, lang) {
    ensureCss();
    const tpl = T[item.tpl] ? item.tpl : 'happy', def = T[tpl];
    const base = Object.assign({}, def.fields, item.fields || {}), tr = (item.i18n && lang && item.i18n[lang]) || {};
    const f = k => esc(tr[k] != null && tr[k] !== '' ? tr[k] : base[k]);
    const img = item.image ? `<div class="ph" style="background-image:url('${esc(item.image)}')"></div>${tpl === 'insta' || tpl === 'kitap' ? '' : '<div class="shade"></div>'}` : '';
    const dir = lang === 'ar' ? ' dir="rtl"' : '';
    const cls = `spp t-${tpl}${item.image ? ' has-img' : ''}`;
    if (tpl === 'tahmin') { // Tahmin Ligi (veri sunucudan: item.predict)
      const p = item.predict || {}, top = (p.top || []).slice(0, 5), biz = String(p.biz || '').trim();
      const short = String(p.url || '').replace(/^https?:\/\//, '').replace(/^www\./, '');
      const ball = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9.5"/><path d="M12 7.2l3.6 2.6-1.4 4.3H9.8L8.4 9.8z" fill="currentColor" stroke="none"/><path d="M12 7.2V2.5M15.6 9.8l4.4-1.6M14.2 14.1l2.8 3.9M9.8 14.1L7 18M8.4 9.8L4 8.2"/></svg>';
      const cup = '<svg viewBox="0 0 64 64"><defs><linearGradient id="spg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe58a"/><stop offset="1" stop-color="#d49a10"/></linearGradient></defs><path fill="url(#spg)" d="M18 6h28v14c0 9-5.6 15.6-14 17-8.4-1.4-14-8-14-17z"/><path fill="none" stroke="url(#spg)" stroke-width="4" d="M18 11H9c0 8 4 12 10 13M46 11h9c0 8-4 12-10 13"/><path fill="url(#spg)" d="M28 36h8v9h-8zM20 46h24l2 9H18z"/><rect x="15" y="54" width="34" height="5" rx="1.5" fill="#b8860b"/><path fill="#fff" opacity=".35" d="M23 9h4v12c0 4 1.5 7 3.5 9-4.5-1.5-7.5-5-7.5-10z"/></svg>';
      const pitch = '<svg class="pitch" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" fill="none" stroke="#fff" stroke-width="4"><rect x="40" y="40" width="1520" height="820"/><path d="M800 40v820"/><circle cx="800" cy="450" r="130"/><circle cx="800" cy="450" r="6" fill="#fff"/><rect x="40" y="250" width="200" height="400"/><rect x="1360" y="250" width="200" height="400"/><rect x="40" y="350" width="70" height="200"/><rect x="1490" y="350" width="70" height="200"/></svg>';
      const bl = biz.length, bcls = bl > 30 ? ' xl' : bl > 18 ? ' lg' : '';
      const rows = top.length ? top.map((r, i) => `<div class="rw${i < 3 ? ' p' + (i + 1) : ''}"><span class="n">${i + 1}</span><span class="nm">${esc(r.nick)}</span><span class="p">${r.pts}<small>puan</small></span></div>`).join('')
        : [1, 2, 3].map(i => `<div class="rw ghost p${i}"><span class="n">${i}</span><span class="nm">? ? ?</span><span class="p">0</span></div>`).join('') + '<div class="emp">Liste boş — ilk puanı sen al!</div>';
      const open = +p.open || 0;
      return `<div class="${cls}" lang="tr">${pitch}<div class="l">`
        + `<div class="top"><span class="pill">${ball}Süper Lig</span><span class="pill hot">${esc(p.week || '')}</span>${open ? `<span class="pill">${open} maç tahmine açık</span>` : ''}</div>`
        + (biz ? `<div class="biz${bcls}">${esc(biz)}</div>` : '') + `<h1>Tahmin <em>Ligi</em></h1>`
        + `<div class="prz">${cup}<div><small>HAFTANIN BİRİNCİSİNE</small><b>${p.prize ? esc(p.prize) : 'İşletmeden ikram'}</b></div></div>`
        + `<div class="steps"><div class="st"><i>1</i>QR'ı okut, Google ile katıl</div><div class="st"><i>2</i>Skor, golcü, kırmızı kart tahmin et</div><div class="st"><i>3</i>Puanı topla, ikramı kap</div></div>`
        + (p.last ? `<div class="lw">🏆 Geçen haftanın birincisi: <b>${esc(p.last.nick)}</b> · ${p.last.pts} puan</div>` : '')
        + `</div><div class="r"><div class="scan">${p.qr ? `<div class="qrw">${p.qr}</div>` : ''}<div class="cta"><b>Okut, <span>katıl</span></b><p>Telefonunun kamerasıyla QR'ı okut, saniyeler içinde ligdesin.</p><span class="free">ÜCRETSİZ</span></div></div>`
        + `<div class="bd"><h2>BU HAFTANIN İLK 5'İ<span>${esc(p.week || '')}</span></h2>${rows}</div>${short ? `<div class="url">${esc(short)}</div>` : ''}</div></div>`;
    }
    if (tpl === 'dogan') { // Bugün doğanlar (veri sunucudan: item.dogan)
      const p = item.dogan || {}, all = (p.names || []).filter(Boolean), names = all.slice(0, 10), more = all.length - names.length;
      const c = names.length <= 1 ? 'c1' : names.length <= 3 ? 'c2' : names.length <= 6 ? 'c3' : 'c4';
      // sabit konfeti: tohumlu sözde rastgele (her çizimde aynı yerleşim)
      let sd = 7; const rn = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
      const COL = ['#f5c542', '#e5484d', '#3e63dd', '#30a46c', '#ff7ac6', '#ffffff', '#c9955c'];
      const conf = (W, H, cx0, cx1, cy0, cy1) => { let o = ''; sd = 7;
        for (let k = 0; k < 110; k++) {
          const x = rn() * W, y = rn() * H; if (x > cx0 && x < cx1 && y > cy0 && y < cy1) continue; // yazıların arkası boş kalır
          const col = COL[Math.floor(rn() * COL.length)], r = Math.floor(rn() * 180), t = rn(), X = x.toFixed(0), Y = y.toFixed(0);
          o += t < .45 ? `<rect x="${X}" y="${Y}" width="${(8 + rn() * 10).toFixed(0)}" height="${(4 + rn() * 5).toFixed(0)}" rx="1.5" fill="${col}" transform="rotate(${r} ${X} ${Y})" opacity=".85"/>`
            : t < .8 ? `<circle cx="${X}" cy="${Y}" r="${(3 + rn() * 4).toFixed(1)}" fill="${col}" opacity=".8"/>`
            : `<path d="M${X} ${Y}q8 -10 16 0t16 0" stroke="${col}" stroke-width="3" fill="none" stroke-linecap="round" transform="rotate(${r} ${X} ${Y})" opacity=".8"/>`;
        }
        return o; };
      const cf = `<svg class="cf h" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">${conf(1600, 900, 300, 1300, 100, 820)}</svg><svg class="cf v" viewBox="0 0 900 1600" preserveAspectRatio="xMidYMid slice">${conf(900, 1600, 60, 840, 430, 1150)}</svg>`;
      const balloon = (cx, cy, col, rx) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${rx * 1.22}" fill="${col}"/><ellipse cx="${cx - rx * .35}" cy="${cy - rx * .45}" rx="${rx * .22}" ry="${rx * .34}" fill="#fff" opacity=".35"/><path d="M${cx - 5} ${cy + rx * 1.22}l5 7 5-7z" fill="${col}"/><path d="M${cx} ${cy + rx * 1.22 + 7}c-10 40 14 70 -4 120 -12 34 6 60 0 100" stroke="rgba(255,255,255,.55)" stroke-width="1.6" fill="none"/>`;
      const bl = (cls, a, b, c2) => `<svg class="bl ${cls}" viewBox="0 0 160 420">${balloon(56, 70, a, 42)}${balloon(112, 128, b, 36)}${balloon(64, 186, c2, 30)}</svg>`;
      const one = names.length === 1;
      return `<div class="${cls}" lang="tr">${cf}`
        + bl('l', '#e5484d', '#f5c542', '#3e63dd') + bl('r', '#30a46c', '#ff7ac6', '#f5c542')
        + `<div class="k">🎂 Bugün doğanlar · <b>${esc(p.day || '')}</b></div>`
        + `<h1>${one ? 'İyi ki doğdun!' : 'İyi ki doğdunuz!'}</h1>`
        + `<div class="nm ${c}">${names.map(n => `<span class="n"><i>🎉</i>${esc(n)}</span>`).join('')}</div>`
        + (more > 0 ? `<div class="more">ve ${more} kişi daha</div>` : '')
        + `<div class="ft">${p.biz ? `<b>${esc(p.biz)}</b> ailesi olarak` : 'Hep birlikte'} nice mutlu yıllar dileriz 🎈</div></div>`;
    }
    if (tpl === 'insta') {
      const ig = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>';
      return `<div class="${cls}"${dir}>${img}<div class="in"><div class="ig">${ig}${f('sub')}</div><div class="cap">${f('title')}</div></div></div>`;
    }
    if (tpl === 'kitap' && item.books && item.books.length) { // 4 kitap (2x2): kapak + ad + yazar + yayınevi + açıklama
      const card = b => `<div class="bkc"${b.image ? ` style="--img:url('${esc(b.image)}')"` : ''}>${b.image ? `<div class="cv" style="background-image:url('${esc(b.image)}')"></div>` : ''}<div class="tx"><h2>${esc(b.title)}</h2>${b.author ? `<div class="sub">${esc(b.author)}</div>` : ''}${b.publisher ? `<div class="note">${esc(b.publisher)}</div>` : ''}${b.desc ? `<p>${esc(b.desc)}</p>` : ''}</div></div>`;
      const bs = item.books.slice(0, 4);
      return `<div class="spp t-kitap multi n${bs.length}"${dir}><div class="hd">📚 YENİ ÇIKAN KİTAPLAR</div><div class="gr">${bs.map(card).join('')}</div></div>`;
    }
    const opt = (k, c) => (f(k) ? `<div class="${c}">${f(k)}</div>` : '');
    if (tpl === 'indirim') return `<div class="${cls}"${dir}><div class="big">${f('badge')}</div><div class="in"><h1>${f('title')}</h1>${opt('sub', 'sub')}${opt('note', 'note')}</div></div>`;
    if (tpl === 'gunun') {
      const lines = String((tr.body != null && tr.body !== '' ? tr.body : base.body) || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 8);
      return `<div class="${cls}"${dir}><div class="in"><h1>${f('title')}</h1><ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>${opt('price', 'price')}</div></div>`;
    }
    if (tpl === 'wifi') return `<div class="${cls}"${dir}><div class="in"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" stroke-width="2" stroke-linecap="round"><path d="M2 8.8a15 15 0 0 1 20 0"/><path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16.2a5 5 0 0 1 7 0"/><circle cx="12" cy="20" r="1" fill="var(--accent2)"/></svg><h1>${f('title')}</h1>${opt('sub', 'sub')}${opt('note', 'note')}</div></div>`;
    const wave = tpl === 'muzik' ? `<div class="wave">${[0.2, 0.6, 0.1, 0.9, 0.4, 0.7, 0.3].map(d => `<i style="height:${40 + Math.round(d * 60)}%;animation-delay:-${d}s"></i>`).join('')}</div>` : '';
    return `<div class="${cls}"${dir}>${img}${wave}<div class="in">${opt('badge', 'badge')}<h1>${f('title')}</h1>${opt('price', 'price')}${opt('sub', 'sub')}${opt('note', 'note')}</div></div>`;
  }
  // yazı boyu kutuya göre: 1920x1080 tam ekranda 1em ≈ 30px; dikey kutularda üst-alt dizilim (.vert)
  function fit(el) {
    if (!el) return;
    const w = el.clientWidth || 1920, h = el.clientHeight || 1080, vert = h > w * 1.1;
    el.classList.toggle('vert', vert);
    el.style.fontSize = Math.max(10, vert ? Math.min(w / 38, h / 56) : Math.min(w / 64, h / 34)) + 'px';
  }
  window.SPPoster = { TEMPLATES: T, FIELD_LABELS, html, fit };
})();
