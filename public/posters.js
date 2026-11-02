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
.spp.t-kitap.multi .note{font-size:.8em;color:var(--accent,#d6a35c);font-weight:600}
.spp.t-kitap.multi p{margin:.25em 0 0;font-size:.78em;line-height:1.3;opacity:.82;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
/* instagram */
.spp.t-insta{background:var(--bg)}
.spp.t-insta .ph{right:auto;width:56.25%;background-size:contain;background-repeat:no-repeat;background-color:#000}
.spp.t-insta .in{margin-left:56.25%;padding:5%;justify-content:center}
.spp.t-insta .ig{display:flex;align-items:center;gap:.5em;font-size:1.5em;font-weight:700}
.spp.t-insta .ig svg{width:1.3em;height:1.3em}
.spp.t-insta .cap{font-size:1.45em;font-weight:500;line-height:1.35;display:-webkit-box;-webkit-line-clamp:9;-webkit-box-orient:vertical;overflow:hidden;opacity:.92}
.spp[dir=rtl] .in{text-align:right}`;
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
  // yazı boyu kutuya göre: 1920x1080 tam ekranda 1em ≈ 30px
  function fit(el) { const w = el.clientWidth || 1920, h = el.clientHeight || 1080; el.style.fontSize = Math.max(1.5, Math.min(w / 64, h / 34)) + 'px'; }
  window.SPPoster = { TEMPLATES: T, FIELD_LABELS, html, fit };
})();
