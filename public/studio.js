/* Fotoğraftan afiş (stüdyo): işletme bir fotoğraf seçer, ürün adı ve fiyatı yazar, dört hazır tasarımdan birini seçer.
   Afiş tarayıcıda 1920x1080 JPG olarak çizilir ve fotoğraf gibi medya sırasına girer (eski ve yeni TV uygulamasında aynı görünür).
   Renkler fotoğraftan çıkarılır (ya da ekranın teması kullanılır). İsteğe bağlı QR: içine kısa adres yazılır, okutmalar sayılır.
   Panelin yardımcılarını kullanır: $, esc, fl, req, toast, openModal, closeModal, refresh, rgb2hsl, hsl, S. */
(function () {
  const W = 1920, H = 1080;
  const LAYOUTS = [['tam', 'Tam kadraj'], ['bolunmus', 'Yarım panel'], ['cerceve', 'Çerçeveli'], ['vitrin', 'Vitrin bandı']];
  const BADGES = ['Yeni', 'Bugüne özel', '%20 indirim', 'Şefin önerisi', 'Kampanya'];
  let ST = null; // açık stüdyo durumu

  // ---- yazı tipi: panelle aynı Montserrat (Türkçe harfler latin-ext dosyasında) ----
  let fontReady = null;
  function loadFont() {
    if (fontReady) return fontReady;
    const faces = [
      new FontFace('SPStudio', 'url(/fonts/montserrat-latin.woff2)', { weight: '100 900', unicodeRange: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+20BA, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' }),
      new FontFace('SPStudio', 'url(/fonts/montserrat-latin-ext.woff2)', { weight: '100 900', unicodeRange: 'U+0100-024F, U+0259, U+1E00-1EFF, U+2020, U+20A0-20AB, U+20AD-20CF, U+2113, U+2C60-2C7F, U+A720-A7FF' }),
    ];
    fontReady = Promise.all(faces.map(f => f.load().then(x => document.fonts.add(x)).catch(() => {}))).then(() => document.fonts.load('800 40px SPStudio', 'ğüşİıöç'));
    return fontReady;
  }
  const F = (w, px) => `${w} ${Math.round(px)}px SPStudio, Montserrat, Arial, sans-serif`;

  // ---- renkler ----
  function photoPalette(img) {
    try {
      const N = 80, k = N / Math.max(img.naturalWidth, img.naturalHeight), w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h).data, B = Array.from({ length: 24 }, () => ({ w: 0, h: 0, s: 0 }));
      for (let i = 0; i < d.length; i += 4) {
        const [hh, ss, ll] = rgb2hsl(d[i], d[i + 1], d[i + 2]);
        if (ss < 0.18 || ll < 0.12 || ll > 0.9) continue;
        const wt = ss * (1 - Math.abs(ll - 0.5)), b = B[Math.floor(hh / 15) % 24];
        b.w += wt; b.h += hh * wt; b.s += ss * wt;
      }
      const best = B.filter(b => b.w).sort((a, b) => b.w - a.w)[0];
      if (!best) return { bg: '#16181a', accent: '#e0a458', text: '#ffffff' };
      const hue = best.h / best.w, sat = Math.min(0.85, best.s / best.w + 0.15);
      return { bg: hsl(hue, Math.min(0.45, sat), 0.12), accent: hsl(hue, sat, 0.6), text: '#ffffff' };
    } catch (e) { return { bg: '#16181a', accent: '#e0a458', text: '#ffffff' }; }
  }
  function themePalette() { const th = (S.me.tenant.theme || {}); return { bg: th.bg || '#151717', accent: th.accent2 || '#c9955c', text: th.text || '#ffffff' }; }
  const pal = () => ST.palette === 'theme' ? themePalette() : (ST.photoPal || themePalette());
  const rgba = (hex, a) => { const n = parseInt(String(hex).slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  // vurgu rengi üstüne yazı: açık zeminde koyu, koyu zeminde açık
  const onColor = hex => { const n = parseInt(String(hex).slice(1), 16), L = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return L > 0.6 ? '#14100c' : '#ffffff'; };

  // ---- çizim yardımcıları ----
  function cover(g, img, x, y, w, h) {
    const r = Math.max(w / img.naturalWidth, h / img.naturalHeight), sw = w / r, sh = h / r;
    g.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  // satırlara böl; sığmazsa yazı küçülür (en az min px). { lines, px }
  function wrap(g, text, weight, px, maxW, maxLines, min) {
    text = String(text || '').trim(); if (!text) return { lines: [], px };
    for (let p = px; p >= min; p -= 4) {
      g.font = F(weight, p);
      const words = text.split(/\s+/), lines = []; let cur = '';
      for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; } }
      if (cur) lines.push(cur);
      if (lines.length <= maxLines && lines.every(l => g.measureText(l).width <= maxW)) return { lines, px: p };
      if (p - 4 < min) { // en küçük boyda da sığmadı: son satırı kısalt
        const out = lines.slice(0, maxLines); let last = out[maxLines - 1];
        while (last.length > 1 && g.measureText(last + '…').width > maxW) last = last.slice(0, -1);
        out[maxLines - 1] = last + (lines.length > maxLines ? '…' : ''); return { lines: out, px: p };
      }
    }
    return { lines: [text], px: min };
  }
  // yazı bloğu: rozet, başlık, fiyat, alt yazı, not. box = { x, y, w, h, valign: 'bottom'|'center', align: 'left'|'center' }
  function block(g, f, P, box, sc = 1) {
    const parts = [];
    if (f.badge) { g.font = F(800, 34 * sc); parts.push({ k: 'badge', h: 64 * sc, gap: 26 * sc, w: g.measureText(f.badge.toLocaleUpperCase('tr')).width + 52 * sc }); }
    const t = wrap(g, f.title || 'Ürün adı', 800, 118 * sc, box.w, 3, 56 * sc); parts.push({ k: 'title', t, h: t.lines.length * t.px * 1.04, gap: 18 * sc });
    if (f.price) { const p = wrap(g, f.price, 800, 104 * sc, box.w, 1, 60 * sc); parts.push({ k: 'price', t: p, h: p.px * 1.08, gap: 16 * sc }); }
    if (f.sub) { const s = wrap(g, f.sub, 600, 46 * sc, box.w, 2, 30 * sc); parts.push({ k: 'sub', t: s, h: s.lines.length * s.px * 1.22, gap: 12 * sc }); }
    if (f.note) { const n = wrap(g, f.note, 500, 34 * sc, box.w, 2, 24 * sc); parts.push({ k: 'note', t: n, h: n.lines.length * n.px * 1.25, gap: 0 }); }
    const total = parts.reduce((a, p, i) => a + p.h + (i < parts.length - 1 ? p.gap : 0), 0);
    let y = box.valign === 'center' ? box.y + (box.h - total) / 2 : box.y + box.h - total;
    const ax = box.align === 'center' ? box.x + box.w / 2 : box.x;
    g.textAlign = box.align === 'center' ? 'center' : 'left'; g.textBaseline = 'top';
    for (const p of parts) {
      if (p.k === 'badge') {
        const bx = box.align === 'center' ? ax - p.w / 2 : ax;
        g.fillStyle = P.accent; rr(g, bx, y, p.w, p.h, p.h / 2); g.fill();
        const al = g.textAlign; g.fillStyle = onColor(P.accent); g.font = F(800, 34 * sc); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(f.badge.toLocaleUpperCase('tr'), bx + p.w / 2, y + p.h / 2 + 2 * sc); g.textBaseline = 'top'; g.textAlign = al;
      } else {
        const st = { title: [800, P.text], price: [800, P.accent], sub: [600, rgba(P.text, 0.92)], note: [500, rgba(P.text, 0.72)] }[p.k];
        g.font = F(st[0], p.t.px); g.fillStyle = st[1];
        const lh = p.k === 'title' ? 1.04 : p.k === 'price' ? 1.08 : p.k === 'sub' ? 1.22 : 1.25;
        p.t.lines.forEach((l, i) => g.fillText(l, ax, y + i * p.t.px * lh));
      }
      y += p.h + p.gap;
    }
  }
  // QR kutusu: beyaz zemin, altında kısa açıklama
  function qrBox(g, P, x, y, size, label) {
    if (!ST.qrImg) return;
    const pad = size * 0.07, lh = label ? size * 0.2 : 0;
    g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 30; g.fillStyle = '#fff'; rr(g, x, y, size, size + lh, size * 0.08); g.fill(); g.restore();
    g.drawImage(ST.qrImg, x + pad, y + pad, size - 2 * pad, size - 2 * pad);
    if (label) { g.fillStyle = '#14100c'; g.textAlign = 'center'; g.textBaseline = 'middle'; const w = wrap(g, label, 700, size * 0.09, size - 2 * pad, 1, size * 0.06); g.font = F(700, w.px); g.fillText(w.lines[0] || '', x + size / 2, y + size + lh * 0.38); }
  }

  // ---- dört tasarım ----
  function draw(c, st) {
    const g = c.getContext('2d'), sc = c.width / W; g.setTransform(sc, 0, 0, sc, 0, 0);
    const P = pal(), f = st.fields, img = st.img, hasQr = !!(st.qrImg && st.qrUrl), QS = 250;
    g.clearRect(0, 0, W, H); g.fillStyle = P.bg; g.fillRect(0, 0, W, H);
    const L = st.layout;
    if (L === 'tam') {
      cover(g, img, 0, 0, W, H);
      let gr = g.createLinearGradient(0, 0, W * 0.75, 0); gr.addColorStop(0, rgba(P.bg, 0.9)); gr.addColorStop(0.55, rgba(P.bg, 0.45)); gr.addColorStop(1, rgba(P.bg, 0)); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      gr = g.createLinearGradient(0, H, 0, H * 0.35); gr.addColorStop(0, rgba(P.bg, 0.85)); gr.addColorStop(1, rgba(P.bg, 0)); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      block(g, f, P, { x: 110, y: 110, w: 1000, h: H - 220, valign: 'bottom', align: 'left' });
      if (hasQr) qrBox(g, P, W - 110 - QS, H - 110 - QS * 1.2, QS, f.qrLabel);
    } else if (L === 'bolunmus') {
      g.save(); g.beginPath(); g.moveTo(W * 0.43, H); g.lineTo(W * 0.49, 0); g.lineTo(W, 0); g.lineTo(W, H); g.closePath(); g.clip(); cover(g, img, W * 0.43, 0, W * 0.57, H); g.restore();
      g.strokeStyle = P.accent; g.lineWidth = 14; g.beginPath(); g.moveTo(W * 0.43, H); g.lineTo(W * 0.49, 0); g.stroke();
      block(g, f, P, { x: 110, y: 110, w: W * 0.43 - 190, h: H - 220 - (hasQr ? 0 : 0), valign: 'center', align: 'left' });
      if (hasQr) qrBox(g, P, W - 90 - QS, H - 90 - QS * 1.2, QS, f.qrLabel);
    } else if (L === 'cerceve') {
      g.save(); g.filter = 'blur(42px) brightness(0.42) saturate(1.2)'; cover(g, img, -80, -80, W + 160, H + 160); g.restore();
      g.fillStyle = rgba(P.bg, 0.35); g.fillRect(0, 0, W, H);
      g.save(); g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 60; g.shadowOffsetY = 20; g.fillStyle = '#000'; rr(g, 100, 100, 960, 880, 36); g.fill(); g.restore();
      g.save(); rr(g, 100, 100, 960, 880, 36); g.clip(); cover(g, img, 100, 100, 960, 880); g.restore();
      const bottom = hasQr ? QS * 1.2 + 60 : 0;
      block(g, f, P, { x: 1150, y: 110, w: 670, h: H - 220 - bottom, valign: 'center', align: 'left' });
      if (hasQr) qrBox(g, P, 1150, H - 100 - QS * 1.2, QS, f.qrLabel);
    } else { // vitrin
      const BH = 310;
      cover(g, img, 0, 0, W, H - BH + 40);
      g.fillStyle = P.bg; g.fillRect(0, H - BH, W, BH); g.fillStyle = P.accent; g.fillRect(0, H - BH, W, 10);
      if (f.price) { // fiyat: sağ üstte büyük daire
        const R = 175, cx = W - 110 - R, cy = 110 + R;
        g.save(); g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 40; g.fillStyle = P.accent; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill(); g.restore();
        const p = wrap(g, f.price, 800, 110, R * 1.6, 1, 50); g.font = F(800, p.px); g.fillStyle = onColor(P.accent); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.lines[0], cx, cy + 4);
      }
      if (f.badge) { g.font = F(800, 34); const bw = g.measureText(f.badge.toLocaleUpperCase('tr')).width + 52; g.fillStyle = P.accent; rr(g, 110, 100, bw, 64, 32); g.fill(); g.fillStyle = onColor(P.accent); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(f.badge.toLocaleUpperCase('tr'), 110 + bw / 2, 134); }
      const qw = hasQr ? 230 : 0;
      block(g, { title: f.title, sub: [f.sub, f.note].filter(Boolean).join(' · ') }, P, { x: 110, y: H - BH + 40, w: W - 220 - (qw ? qw + 60 : 0), h: BH - 80, valign: 'center', align: 'left' }, 0.78);
      if (hasQr) qrBox(g, P, W - 110 - qw, H - BH - qw * 0.55, qw, f.qrLabel);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---- arayüz ----
  const fieldsDefault = () => ({ badge: '', title: '', price: '', sub: '', note: '', qrLabel: 'Okutun' });
  function loadImg(src, cors) { return new Promise((ok, no) => { const im = new Image(); if (cors) im.crossOrigin = 'anonymous'; im.onload = () => ok(im); im.onerror = () => no(new Error('Fotoğraf açılamadı')); im.src = src; }); }
  // Büyük fotoğraf yüklenmeden önce 2400 px'e küçültülür (depolama ve yükleme süresi)
  function shrink(file) {
    return new Promise(ok => {
      const u = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const k = Math.min(1, 2400 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
        c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        c.toBlob(b => { URL.revokeObjectURL(u); ok({ blob: b || file, url: URL.createObjectURL(b || file) }); }, 'image/jpeg', 0.9);
      };
      im.onerror = () => { URL.revokeObjectURL(u); ok(null); };
      im.src = u;
    });
  }

  // Yeni afiş: önce fotoğraf seçilir. opts.ad = reklam kimliği (reklam görseli olarak kaydedilir)
  window.openStudio = async function (id, opts = {}) {
    await loadFont();
    if (id) {
      const v = S.db.videos.find(x => x.id === id); if (!v || !v.design) return;
      const d = v.design;
      ST = { id, ad: v.ad || null, layout: d.layout, fields: { ...fieldsDefault(), ...(d.fields || {}) }, palette: d.palette || 'photo', photo: d.photo, qrUrl: d.qrUrl || '', qrCode: v.qrCode || '', name: v.name };
      try { ST.img = await loadImg(S.me.upBase + d.photo, true); ST.photoPal = photoPalette(ST.img); } catch (e) { toast('Kaynak fotoğraf açılamadı; yeni bir fotoğraf seçin', true); ST.img = null; }
      if (ST.qrUrl) await setQr(ST.qrUrl, true);
      return ST.img ? editor() : pickPhoto();
    }
    ST = { id: null, ad: opts.ad || null, layout: 'tam', fields: { ...fieldsDefault(), ...(opts.fields || {}) }, palette: 'photo', qrUrl: opts.qrUrl || '', qrCode: '' };
    if (ST.qrUrl) await setQr(ST.qrUrl, true);
    pickPhoto();
  };
  function pickPhoto() {
    openModal(`<h3 style="margin:0 0 6px">Fotoğraftan afiş</h3><p class="muted" style="margin:0 0 16px">Ürününüzün fotoğrafını seçin ya da telefonla çekin. Ürün adı ve fiyatı yazın; hazır tasarımlardan birini seçin. Renkler fotoğraftan alınır.</p>
      <label id="stu-drop" class="stu-drop"><input type="file" accept="image/*" hidden onchange="stuPhoto(this.files[0])"><b>📷 Fotoğraf seç</b><span class="muted">JPG, PNG ya da telefon kamerası</span></label>
      <div class="row mt end"><button class="btn g" onclick="closeModal()">Vazgeç</button></div>`);
    const d = $('stu-drop');
    ['dragenter', 'dragover'].forEach(ev => d.addEventListener(ev, e => { e.preventDefault(); d.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => d.addEventListener(ev, e => { e.preventDefault(); d.classList.remove('over'); }));
    d.addEventListener('drop', e => e.dataTransfer.files[0] && stuPhoto(e.dataTransfer.files[0]));
  }
  window.stuPhoto = async function (file) {
    if (!file || !/^image\//.test(file.type)) return toast('Bir fotoğraf seçin', true);
    const d = $('stu-drop'); if (d) d.innerHTML = '<b>Fotoğraf hazırlanıyor…</b>';
    const sm = await shrink(file); if (!sm) return toast('Fotoğraf açılamadı', true);
    try {
      ST.img = await loadImg(sm.url); ST.photoPal = photoPalette(ST.img);
      const fd = new FormData(); fd.append('file', new File([sm.blob], 'foto.jpg', { type: 'image/jpeg' }));
      const j = await req('POST', '/posters/image', fd); ST.photo = j.file;
    } catch (e) { toast(e.message, true); return pickPhoto(); }
    editor();
  };
  async function setQr(url, quiet) {
    url = String(url || '').trim(); ST.qrUrl = url;
    if (!url) { ST.qrImg = null; return; }
    try { const j = await req('POST', '/studio/qr', { url, code: ST.qrCode }); ST.qrCode = j.code; ST.qrImg = await loadImg(j.png); }
    catch (e) { ST.qrImg = null; if (!quiet) toast(e.message, true); }
  }
  function editor() {
    const f = ST.fields, inp = (k, label, ph, max) => fl(label, `<input type="text" maxlength="${max}" value="${esc(f[k] || '')}" placeholder="${esc(ph)}" oninput="stuSet('${k}',this.value)">`);
    openModal(`<h3 style="margin:0 0 12px">${ST.ad ? 'Reklam görseli' : 'Fotoğraftan afiş'}</h3>
      <div class="ped"><div>
        <canvas id="stu-cv" class="stu-cv" width="960" height="540"></canvas>
        <div class="stu-lays">${LAYOUTS.map(([k, n]) => `<button class="stu-lay ${ST.layout === k ? 'on' : ''}" onclick="stuLayout('${k}')"><canvas data-lay="${k}" width="256" height="144"></canvas><span>${n}</span></button>`).join('')}</div>
      </div><div>
        ${inp('title', 'Ürün adı / başlık', 'Fıstıklı Latte', 90)}
        <div class="f">${inp('price', 'Fiyat', '145 ₺', 20)}${inp('badge', 'Rozet', 'Yeni', 24)}</div>
        <div class="chips" style="margin:-4px 0 10px">${BADGES.map(b => `<span class="chip" onclick="stuBadge('${b}')">${b}</span>`).join('')}</div>
        ${inp('sub', 'Alt yazı', 'Antep fıstığı, espresso, süt köpüğü', 120)}
        ${inp('note', 'Not', 'Sadece bu hafta', 140)}
        <div class="fl"><span>Renkler</span><div class="chips"><span class="chip ${ST.palette === 'photo' ? 'on' : ''}" onclick="stuPal('photo')">Fotoğraftan</span><span class="chip ${ST.palette === 'theme' ? 'on' : ''}" onclick="stuPal('theme')">Ekran teması</span></div></div>
        <details class="mt" ${ST.qrUrl ? 'open' : ''}><summary style="cursor:pointer;font-weight:600">QR kod ekle (okutmalar sayılır)</summary>
          ${fl('Bağlantı (sipariş, menü, Instagram, yorum…)', `<input type="text" inputmode="url" id="stu-qr" value="${esc(ST.qrUrl)}" placeholder="https://" onchange="stuQr(this.value)">`)}
          ${inp('qrLabel', 'QR altındaki yazı', 'Okutun', 40)}
          <p class="muted" style="font-size:12.5px;margin:0">QR'ın kaç kez okutulduğu İstatistik → Kampanya etkisi bölümünde görünür.</p></details>
        <div class="row mt"><label class="btn g s" style="cursor:pointer">Fotoğrafı değiştir<input type="file" accept="image/*" hidden onchange="stuSwap(this.files[0])"></label></div>
      </div></div>
      <div class="row mt" style="justify-content:space-between">${ST.id ? `<button class="btn d" onclick="if(confirm('Afiş silinsin mi?')){closeModal();act('DELETE','/videos/${ST.id}',undefined,'Silindi')}">Sil</button>` : '<span></span>'}
        <span class="row"><button class="btn g" onclick="closeModal()">Vazgeç</button><button class="btn" id="stu-save" onclick="stuSave()">${ST.id ? 'Kaydet' : ST.ad ? 'Reklama ekle' : 'Medyaya ekle'}</button></span></div>`);
    redraw(true);
  }
  function redraw(all) {
    const c = $('stu-cv'); if (!c || !ST.img) return;
    draw(c, ST);
    if (all) document.querySelectorAll('canvas[data-lay]').forEach(x => draw(x, { ...ST, layout: x.dataset.lay }));
  }
  let rt = null;
  window.stuSet = (k, v) => { ST.fields[k] = v; clearTimeout(rt); rt = setTimeout(() => redraw(true), 60); };
  window.stuBadge = b => { ST.fields.badge = ST.fields.badge === b ? '' : b; editor(); };
  window.stuLayout = k => { ST.layout = k; document.querySelectorAll('.stu-lay').forEach(b => b.classList.toggle('on', b.querySelector('canvas').dataset.lay === k)); redraw(false); };
  window.stuPal = p => { ST.palette = p; editor(); };
  window.stuQr = async v => { await setQr(v); redraw(true); };
  window.stuSwap = async file => {
    if (!file) return; const sm = await shrink(file); if (!sm) return toast('Fotoğraf açılamadı', true);
    try { ST.img = await loadImg(sm.url); ST.photoPal = photoPalette(ST.img); const fd = new FormData(); fd.append('file', new File([sm.blob], 'foto.jpg', { type: 'image/jpeg' })); ST.photo = (await req('POST', '/posters/image', fd)).file; redraw(true); }
    catch (e) { toast(e.message, true); }
  };
  window.stuSave = async function () {
    if (!(ST.fields.title || '').trim()) return toast('Ürün adını ya da başlığı yazın', true);
    const b = $('stu-save'); b.disabled = true; b.textContent = 'Kaydediliyor…';
    try {
      const c = document.createElement('canvas'); c.width = W; c.height = H; draw(c, ST);
      const blob = await new Promise((ok, no) => { try { c.toBlob(x => x ? ok(x) : no(new Error('Görsel oluşturulamadı')), 'image/jpeg', 0.9); } catch (e) { no(new Error('Görsel oluşturulamadı: fotoğrafı yeniden seçin')); } });
      const fd = new FormData();
      fd.append('meta', JSON.stringify({ id: ST.id, ad: ST.ad, name: ST.fields.title, qrCode: ST.qrUrl ? ST.qrCode : '', design: { layout: ST.layout, fields: ST.fields, palette: ST.palette, photo: ST.photo, qrUrl: ST.qrUrl || undefined } }));
      fd.append('file', new File([blob], 'afis.jpg', { type: 'image/jpeg' }));
      await req('POST', '/studio', fd);
      toast(ST.id ? 'Afiş güncellendi' : ST.ad ? 'Reklam görseli eklendi' : 'Afiş medya sırasının sonuna eklendi');
      closeModal(); ST = null; refresh();
    } catch (e) { toast(e.message, true); b.disabled = false; b.textContent = 'Kaydet'; }
  };
  window.SPStudio = { draw, LAYOUTS };
})();
