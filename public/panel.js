/* İşletme paneli. Bölümler: Özet, Tasarım, Medya, Fiyat Listesi, Spor, Duyurular, Kutlamalar, Bilgi Bandı, Ayarlar. */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { me: null, db: null, cat: null, scr: null, lg: null };
let TAB = 'home', PREV = null, SUB = {};
const ICON = { media: '🎞', logo: '🏷', clock: '🕒', rates: '💱', ticker: '📰', text: '📝', image: '🖼', qr: '▣', info: '⚽', reviews: '★', menu: '🧾' };
const fmtDate = ms => ms ? new Date(ms).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';
const ago = ms => { if (!ms) return 'hiç'; const m = Math.round((Date.now() - ms) / 60000); return m < 2 ? 'az önce' : m < 60 ? m + ' dk önce' : m < 1440 ? Math.round(m / 60) + ' saat önce' : Math.round(m / 1440) + ' gün önce'; };
const fmtSize = b => b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : b >= 1048576 ? Math.round(b / 1048576) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
const pro = () => S.me && S.me.tenant.plan.pro;
const owner = () => S.me && S.me.user.role !== 'staff';
const clone = o => JSON.parse(JSON.stringify(o));

/* ================= altyapı ================= */
function toast(m, err) { const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = m; $('toasts').appendChild(t); setTimeout(() => t.remove(), 3800); }
async function req(method, path, body) {
  const isForm = body instanceof FormData;
  const r = await fetch('/api/admin' + path, { method, headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined, body: body === undefined ? undefined : isForm ? body : JSON.stringify(body) });
  if (r.status === 401) { location.href = '/login'; throw new Error('Oturum kapandı'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'İşlem yapılamadı (' + r.status + ')');
  return j;
}
// işlem + bildirim; reload: veriyi yenileyip bölümü yeniden çiz
async function act(method, path, body, ok, reload = true) {
  try { const j = await req(method, path, body); if (ok) toast(ok); if (reload) await refresh(); return j || true; }
  catch (e) { toast(e.message, true); return false; }
}
const opt = (key, val, msg) => { S.db[key] = val; return act('PUT', '/options', { [key]: val }, msg || 'Kaydedildi', false); };
async function refresh() { [S.db, S.scr] = await Promise.all([req('GET', '/db'), req('GET', '/screen')]); render(true); }
const sw = (on, js, attrs = '') => `<label class="sw"><input type="checkbox" ${on ? 'checked' : ''} onchange="${js}" ${attrs}><i></i></label>`;
const card = (title, desc, body, right = '', cls = '') => `<div class="card ${cls}"><div class="ch"><div><h3>${title}</h3>${desc ? `<p>${desc}</p>` : ''}</div>${right}</div><div class="cb">${body}</div></div>`;
const fl = (label, input) => `<label class="fl"><span>${label}</span>${input}</label>`;
const head = (t, d, right = '') => `<div class="head"><div><h1>${t}</h1>${d ? `<p>${d}</p>` : ''}</div><div class="row">${right}</div></div>`;
const tabs = (key, items) => `<div class="tabs">${items.map(([k, l]) => `<button class="${(SUB[key] || items[0][0]) === k ? 'on' : ''}" onclick="SUB['${key}']='${k}';go('${TAB}/${k}')">${l}</button>`).join('')}</div>`;
const lock = what => pro() ? '' : `<div class="bn lock">🔒 <span><b>${what}</b> Pro pakette. Ayarlarınızı şimdiden yapabilirsiniz; ekranda görünmesi için paketinizi yükseltin.</span><a class="btn s g" href="#settings/plan">Paketler</a></div>`;
function scalePv() { document.querySelectorAll('.pv').forEach(b => { const f = b.querySelector('iframe'); if (f && b.clientWidth) f.style.transform = `scale(${b.clientWidth / 1920})`; }); }
addEventListener('resize', scalePv);
const pvFrame = () => `<div class="pv"><iframe src="/tv?preview=1" title="TV önizleme" loading="lazy"></iframe></div>`;
function openModal(html) { $('modalb').innerHTML = html; $('modal').classList.add('on'); }
function closeModal() { $('modal').classList.remove('on'); $('modalb').innerHTML = ''; }
function menu(open) { $('app').classList.toggle('menu', open); }
const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.href = '/login'; };
const unimp = async () => { await fetch('/api/super/unimpersonate', { method: 'POST' }); location.href = '/super'; };

/* ================= gezinme ================= */
const NAV = [
  ['home', '▦', 'Özet'], ['design', '🎨', 'Tasarım'], ['media', '🎞', 'Medya'], ['menu', '🧾', 'Fiyat Listesi', 1], ['sport', '⚽', 'Spor', 1],
  ['promo', '📣', 'Duyurular'], ['celeb', '🎉', 'Kutlamalar'], ['info', '📰', 'Bilgi Bandı', 1], null, ['settings', '⚙', 'Ayarlar'],
];
function drawNav() {
  $('nav').innerHTML = NAV.map(n => n ? `<a href="#${n[0]}" class="${TAB === n[0] ? 'on' : ''}"><span class="i">${n[1]}</span>${n[2]}${n[3] && !pro() ? '<span class="pro">PRO</span>' : ''}</a>` : '<div class="sep"></div>').join('');
  const cur = NAV.find(n => n && n[0] === TAB); $('toptitle').textContent = cur ? cur[2] : '';
}
function go(h) { if (location.hash !== '#' + h) location.hash = h; else route(); }
function route() {
  const h = location.hash.slice(1);
  const pm = /^pair=(\d{6})$/.exec(h);
  if (pm) { SUB.settings = 'devices'; TAB = 'settings'; window.__pair = pm[1]; history.replaceState(null, '', '#settings/devices'); }
  else { const [t, s] = h.split('/'); TAB = SECTIONS[t] ? t : 'home'; if (s) SUB[TAB] = s; }
  if (PREV === 'design' && TAB !== 'design' && EDIT.dirty) {
    if (!confirm('Düzende kaydedilmemiş değişiklikler var. Kaydetmeden çıkılsın mı?')) { TAB = 'design'; history.replaceState(null, '', '#design/layout'); }
    else { EDIT.dirty = false; EDIT.layout = null; }
  }
  PREV = TAB; menu(false); render(); scrollTo(0, 0);
}
addEventListener('hashchange', route);
function render(keepScroll) {
  const y = scrollY;
  drawNav();
  const sec = SECTIONS[TAB];
  $('view').innerHTML = sec.html();
  if (sec.after) sec.after();
  setTimeout(scalePv, 30);
  if (keepScroll) scrollTo(0, y);
}
function drawBanner() {
  const t = S.me.tenant, acc = t.access, days = acc.until ? Math.ceil((acc.until - Date.now()) / 86400000) : 0;
  let h = '';
  if (S.me.user.impersonating) h += `<div class="bn imp"><span>Süper yönetici olarak <b>${esc(t.name)}</b> işletmesini görüntülüyorsunuz.</span><button class="btn s g" onclick="unimp()">Süper yönetime dön</button></div>`;
  if (!acc.ok) h += `<div class="bn bad"><span><b>${acc.reason === 'suspended' ? 'Hesabınız askıya alındı.' : 'Abonelik süreniz doldu.'}</b> Ekranınız şu an kapalı; paketiniz yenilenince kendiliğinden açılır.</span></div>`;
  else if (acc.kind === 'trial') h += `<div class="bn trial"><span>Deneme süreniz <b>${days} gün</b> sonra (${fmtDate(acc.until)}) bitiyor. Deneme boyunca tüm Pro özellikler açık.</span></div>`;
  $('banner').innerHTML = h;
}

/* ================= ÖZET ================= */
const SECTIONS = {};
SECTIONS.home = {
  html() {
    const db = S.db, t = S.me.tenant, devs = S.scr.devices, online = devs.filter(d => d.online).length;
    const steps = [
      [!!t.logo, 'Logo ve renkler', 'Logonuzu yükleyin, renklerinizi seçin', '#design/colors'],
      [db.videos.length > 0, 'Medya ekleyin', 'Tanıtım videoları ve fotoğraflar', '#media'],
      [devs.length > 0, 'TV kutusunu bağlayın', 'APK\'yı kurun, kodu girin ya da şifrenizle giriş yapın', '#settings/devices'],
      [!!(db.location || {}).custom, 'Şehrinizi seçin', 'Hava durumu için', '#settings/business'],
    ];
    if (pro()) steps.push([(db.menu.categories || []).length > 0, 'Fiyat listesi', 'Ürünlerinizi ve fiyatlarınızı girin', '#menu']);
    const done = steps.filter(s => s[0]).length;
    const camp = (db.campaigns || []).find(c => c.enabled && c.url);
    return head(esc(t.name), 'Ekranınızın durumu, kurulum adımları ve hızlı işlemler.', `<a class="btn g" href="/tv?preview=1" target="_blank">📺 TV ekranını aç</a>`)
      + `<div class="grid g2" style="margin-bottom:18px">`
      + card('Canlı önizleme', 'TV\'lerinizde şu an görünen ekran.', pvFrame() + `<div class="row mt">${devs.length ? `<span class="pill ${online ? 'ok' : 'warn'}"><span class="dot ${online ? 'on' : ''}"></span>${online ? 'Cihaz bağlı' : 'Cihaz şu an çevrimdışı'}</span>` : '<span class="pill bad">Henüz cihaz bağlanmadı</span>'}<span style="flex:1"></span><button class="btn s g" onclick="act('POST','/devices/reload',undefined,'TV\\'lere yenileme komutu gönderildi',false)">↻ TV\'yi yenile</button></div>`)
      + card(`Kurulum adımları <span class="muted">· ${done}/${steps.length}</span>`, done === steps.length ? 'Her şey hazır 🎉' : 'Sırayla tamamlayın; her adım ilgili sayfayı açar.',
        `<div class="steps">${steps.map((s, i) => `<a class="step ${s[0] ? 'done' : ''}" href="${s[3]}"><span class="n">${s[0] ? '✓' : i + 1}</span><span class="b"><b>${s[1]}</b><span>${s[2]}</span></span><span>›</span></a>`).join('')}</div>`)
      + `</div>`
      + card('Hızlı işlemler', 'Ekranda anında bir gösterim başlatır; ayarlarınızı değiştirmez.', `<div class="row">
          <button class="btn g" onclick="act('POST','/goal/test',undefined,'Gol animasyonu gönderildi',false)" ${pro() ? '' : 'disabled'}>⚽ Gol animasyonunu dene</button>
          <button class="btn g" onclick="act('POST','/birthday/fire',undefined,'Doğum günü kutlaması gönderildi (seçili kişi yoksa görünmez)',false)" ${pro() ? '' : 'disabled'}>🎂 Doğum günü kutlamasını göster</button>
          <button class="btn g" onclick="act('POST','/bigmatch/test',undefined,'Büyük maç görseli gönderildi',false)" ${pro() ? '' : 'disabled'}>🏟 Büyük maç görselini dene</button>
          ${camp ? `<button class="btn g" onclick="act('POST','/campaigns/${camp.id}/test',undefined,'Kampanya kartı gönderildi',false)">🎁 Kampanya kartını göster</button>` : ''}
        </div>`)
      + `<div class="grid g3">
          <div class="stat"><b>${db.videos.length}</b><span>Video ve fotoğraf</span></div>
          <div class="stat"><b>${online}/${devs.length}</b><span>Bağlı cihaz</span></div>
          <div class="stat"><b>${esc(t.plan.name)}</b><span>${t.access.ok ? (t.access.kind === 'trial' ? 'Deneme · ' : '') + fmtDate(t.access.until) + ' tarihine kadar' : 'Süresi doldu'}</span></div>
        </div>`;
  },
};

/* ================= TASARIM ================= */
const EDIT = { layout: null, sel: -1, hist: [], dirty: false };
SECTIONS.design = {
  html() {
    const sub = SUB.design || 'layout';
    let h = head('Tasarım', 'Ekranınızın düzeni, renkleri, logosu ve TV ayarları. Kaydedince TV anında güncellenir.',
      sub === 'layout' ? `<button class="btn g" onclick="undoL()">↶ Geri al</button><button class="btn" onclick="saveL()">Düzeni kaydet</button>` : '')
      + tabs('design', [['layout', 'Düzen'], ['colors', 'Renk ve logo'], ['tv', 'TV ayarları']]);
    if (sub === 'layout') {
      const T = S.cat.templates;
      h += card('Hazır düzenler', 'Birini seçin, sonra aşağıda dilediğiniz gibi değiştirin.', `<div class="tpls">${Object.entries(T).map(([k, v]) => `<button class="tpl" onclick="applyTpl('${k}')"><div class="mini">${v.widgets.map(w => `<i style="left:${w.x / 24 * 100}%;top:${w.y / 24 * 100}%;width:${w.w / 24 * 100}%;height:${w.h / 24 * 100}%"></i>`).join('')}</div><b>${esc(v.name)}</b><span>${esc(v.desc)}</span></button>`).join('')}</div>`)
        + card('Düzen', 'Kutuları sürükleyerek taşıyın, sağ alt köşesinden boyutlandırın, tıklayınca ayarları sağda açılır.',
          `<div class="editor"><div id="cw"><div id="cv"></div></div><div id="props"></div></div>
           <div class="fl mt"><span>Widget ekle</span><div id="pal" class="chips"></div></div>`)
        + card('Kaydedilmiş hâli', 'TV\'de şu an görünen. Kaydetmediğiniz değişiklikler burada görünmez.', pvFrame());
    } else if (sub === 'colors') {
      const th = S.me.tenant.theme, logo = S.me.tenant.logo;
      h += (logo ? card('✨ Logonuzdan önerilen renkler', 'Logonuzdaki renklerden TV\'de okunaklı kalacak şekilde üretildi. Tıklayınca hemen uygulanır.', '<div class="swatches" id="lsug"><span class="muted">Logo inceleniyor…</span></div>') : '')
        + `<div class="grid g2">`
        + card('Hazır renkler', 'Tıklayınca hemen uygulanır.', `<div class="swatches">${Object.entries(S.cat.themes).map(([k, v]) => `<button class="swc ${v.bg === th.bg && v.accent2 === th.accent2 ? 'on' : ''}" onclick="pickTheme('${k}')"><div class="c"><i style="background:${v.bg}"></i><i style="background:${v.accent}"></i><i style="background:${v.accent2}"></i></div><b>${esc(v.name)}</b></button>`).join('')}</div>`)
        + card('Logo', 'Arkası şeffaf PNG en iyisidir. Logo yoksa işletme adınız yazı olarak görünür.', `${logo ? `<div style="background:#0b0d0d;border:1px solid var(--line);border-radius:12px;padding:18px;text-align:center"><img src="${esc(logo)}" style="max-width:100%;max-height:110px;object-fit:contain"></div>` : `<div class="empty">Logo yüklenmedi</div>`}
          <input type="file" id="logof" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onchange="upLogo(this)">
          <div class="row mt"><button class="btn" onclick="$('logof').click()">${logo ? 'Logoyu değiştir' : 'Logo yükle'}</button>${logo ? `<button class="btn g" onclick="delLogo()">Kaldır</button>` : ''}</div>`)
        + `</div>`
        + card('Kendi renkleriniz', 'Koyu arka planlar TV\'de daha iyi görünür.', `<div class="f">
            ${fl('Arka plan', `<input type="color" id="th-bg" value="${th.bg}">`)}${fl('Ana renk', `<input type="color" id="th-accent" value="${th.accent}">`)}
            ${fl('Vurgu rengi', `<input type="color" id="th-accent2" value="${th.accent2}">`)}${fl('Yazı rengi', `<input type="color" id="th-text" value="${th.text}">`)}
            ${fl('Logo zemini', `<select id="th-plate"><option value="0" ${th.plate ? '' : 'selected'}>Şeffaf (açık renkli logolar)</option><option value="1" ${th.plate ? 'selected' : ''}>Beyaz zemin (koyu logolar)</option></select>`)}
            ${fl('Yazı tipi', `<select id="th-font">${S.cat.fonts.map(f => `<option ${f === th.font ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>`)}
          </div><div class="row end mt"><button class="btn" onclick="saveTheme()">Renkleri kaydet</button></div>`)
        + card('Önizleme', '', pvFrame());
    } else {
      const db = S.db, sv = k => db['safe' + k] != null ? db['safe' + k] : (db.safeInset || 0);
      h += card('Kenar payı (TV görüntüyü kırpıyorsa)', 'Bazı TV\'ler görüntünün kenarlarını keser. Önce TV\'nin görüntü ayarından "Tam ekran / Ekrana sığdır / Just Scan" seçeneğini deneyin; olmazsa buradan küçültün. Kutu tüm TV\'lere aynı görüntüyü verdiği için ayar hepsini etkiler.',
        `<div class="swr"><div class="b"><b>Hizalama çerçevesini göster</b><span>TV\'de yeşil bir çerçeve çıkar; dört kenarı görünene kadar payları artırın, sonra kapatın.</span></div>${sw(db.safeGuide, "opt('safeGuide',this.checked)")}</div>
         <div class="f mt">${['L', 'R', 'T', 'B'].map(k => fl(`${{ L: 'Sol', R: 'Sağ', T: 'Üst', B: 'Alt' }[k]}: <b id="sv${k}">${sv(k)}</b>%`, `<input type="range" min="0" max="20" step="0.5" value="${sv(k)}" id="safe${k}" oninput="$('sv${k}').textContent=this.value" onchange="saveSafe()">`)).join('')}</div>
         <div class="row end mt"><button class="btn g s" onclick="resetSafe()">Sıfırla</button></div>`)
        + card('Görsel efektler', 'Ekran takılıyorsa efektleri azaltın.', `<div class="f">${fl('Efekt modu', `<select onchange="opt('fxMode',this.value)">${[['auto', 'Otomatik (TV kutusunda hafif)'], ['lite', 'Hafif (her yerde)'], ['full', 'Tam (her yerde)']].map(([v, l]) => `<option value="${v}" ${db.fxMode === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}</div>`);
    }
    return h;
  },
  after() {
    if (SUB.design === 'colors') { drawLogoSuggestions(); return; }
    if ((SUB.design || 'layout') !== 'layout') return;
    if (!EDIT.layout || !EDIT.dirty) { EDIT.layout = clone(S.scr.layout); EDIT.hist = []; EDIT.sel = -1; }
    drawCanvas(); drawProps(); drawPal(); dragSetup();
  },
};
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const badSet = () => { const ws = EDIT.layout.widgets, bad = new Set(); ws.forEach((a, i) => ws.forEach((b, j) => { if (i < j && overlap(a, b)) { bad.add(i); bad.add(j); } })); return bad; };
function drawCanvas() {
  const c = $('cv'); if (!c) return;
  const bad = badSet();
  c.innerHTML = EDIT.layout.widgets.map((w, i) => { const d = S.cat.widgets[w.type] || { name: w.type }; return `<div class="wb ${i === EDIT.sel ? 'sel' : ''} ${bad.has(i) ? 'bad' : ''}" data-i="${i}" style="left:${w.x / 24 * 100}%;top:${w.y / 24 * 100}%;width:${w.w / 24 * 100}%;height:${w.h / 24 * 100}%"><span class="ic">${ICON[w.type] || '▢'}</span>${esc(d.name)}<small>${d.pro && !pro() ? '🔒 Pro' : w.w + '×' + w.h}</small><i class="rz"></i></div>`; }).join('');
}
function drawPal() {
  const used = new Set(EDIT.layout.widgets.map(w => w.type));
  $('pal').innerHTML = Object.entries(S.cat.widgets).map(([k, d]) => `<span class="chip ${used.has(k) ? 'dim' : ''}" title="${esc(d.desc)}" onclick="addW('${k}')">${ICON[k] || ''} ${esc(d.name)}${d.pro && !pro() ? ' 🔒' : used.has(k) ? ' ✓' : ''}</span>`).join('');
}
const HINT = { media: 'Videolar ve fotoğraflar <a href="#media">Medya</a> sayfasından. Kampanya kartı, büyük maç ve fragmanlar da bu kutuda çıkar.', info: 'Maçlar <a href="#sport">Spor</a>, diğer sayfalar <a href="#info">Bilgi Bandı</a> sayfasından açılıp kapanır.', reviews: 'Yorumlar <a href="#promo">Duyurular</a> sayfasından eklenir.', qr: 'QR kodlar <a href="#promo">Duyurular</a> sayfasından eklenir.', logo: 'Logo <a href="#design/colors">Renk ve logo</a> sekmesinden yüklenir.', menu: 'Ürünler <a href="#menu">Fiyat Listesi</a> sayfasından girilir.', ticker: 'Skorlar, kurlar, haberler ve bilgiler sırayla kayar.' };
function drawProps() {
  const box = $('props'), w = EDIT.layout.widgets[EDIT.sel];
  if (!w) { box.innerHTML = `<h4>Widget ayarları</h4><p class="muted">Ayarlarını görmek için bir kutuya tıklayın.</p>${badSet().size ? '<p class="muted mt" style="color:var(--bad)">Kırmızı kutular üst üste biniyor; kaydetmeden önce düzeltin.</p>' : ''}${EDIT.dirty ? '<p class="muted mt" style="color:var(--warn)">Kaydedilmemiş değişiklikler var.</p>' : ''}`; return; }
  const d = S.cat.widgets[w.type] || {}, p = w.props || {};
  const tg = (k, label, def = true) => `<div class="swr"><div class="b"><b>${label}</b></div>${sw(p[k] === undefined ? def : p[k], `setP('${k}',this.checked)`)}</div>`;
  let f = '';
  if (w.type === 'clock') f = tg('seconds', 'Saniyeyi göster', false);
  if (w.type === 'rates') f = tg('weather', 'Hava durumu') + tg('rates', 'Döviz, altın, borsa');
  if (w.type === 'ticker') f = tg('clock', 'Solda saat kutusu');
  if (w.type === 'text') f = fl('Başlık', `<input type="text" maxlength="200" value="${esc(p.title || '')}" onchange="setP('title',this.value)">`) + fl('Metin', `<textarea maxlength="400" onchange="setP('body',this.value)">${esc(p.body || '')}</textarea>`)
    + `<div class="f">${fl('Hizalama', `<select onchange="setP('align',this.value)">${[['left', 'Sola'], ['center', 'Ortaya'], ['right', 'Sağa']].map(([v, l]) => `<option value="${v}" ${(p.align || 'center') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}${fl('Boyut', `<select onchange="setP('size',this.value)">${[['s', 'Küçük'], ['m', 'Orta'], ['l', 'Büyük']].map(([v, l]) => `<option value="${v}" ${(p.size || 'm') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}</div>`;
  if (w.type === 'image') f = `${p.url ? `<img src="${esc(p.url)}" style="width:100%;max-height:150px;object-fit:contain;background:#000;border-radius:8px;margin-top:8px">` : ''}<input type="file" id="assetf" accept="image/*" hidden onchange="upAsset(this)"><div class="row mt"><button class="btn s" onclick="$('assetf').click()">Resim yükle</button></div>`
    + fl('Yerleşim', `<select onchange="setP('fit',this.value)"><option value="cover" ${p.fit !== 'contain' ? 'selected' : ''}>Kutuyu doldur</option><option value="contain" ${p.fit === 'contain' ? 'selected' : ''}>Tamamı görünsün</option></select>`)
    + ((S.db.assets || []).length ? `<div class="thumbs">${S.db.assets.slice(-10).reverse().map(a => `<div class="t" style="cursor:pointer" onclick="setP('url','${S.me.upBase}${a.file}');drawProps()"><img src="${S.me.upBase}${a.file}"></div>`).join('')}</div>` : '');
  if (w.type === 'menu') f = fl('Başlık (boşsa fiyat listesinin başlığı)', `<input type="text" maxlength="40" value="${esc(p.title || '')}" onchange="setP('title',this.value)">`);
  box.innerHTML = `<h4>${ICON[w.type] || ''} ${esc(d.name)}</h4><p class="muted">${esc(d.desc || '')}${HINT[w.type] ? '<br><br>' + HINT[w.type] : ''}</p>${f}<div class="row mt"><button class="btn d s" onclick="rmW(${EDIT.sel})">Kaldır</button></div>`;
}
function snap() { EDIT.hist.push(clone(EDIT.layout)); if (EDIT.hist.length > 40) EDIT.hist.shift(); EDIT.dirty = true; }
function undoL() { if (!EDIT.hist.length) return toast('Geri alınacak değişiklik yok'); EDIT.layout = EDIT.hist.pop(); EDIT.sel = -1; drawCanvas(); drawProps(); drawPal(); }
function setP(k, v) { const w = EDIT.layout.widgets[EDIT.sel]; if (!w) return; snap(); w.props = { ...(w.props || {}), [k]: v }; }
function rmW(i) { snap(); EDIT.layout.widgets.splice(i, 1); EDIT.sel = -1; drawCanvas(); drawProps(); drawPal(); }
function addW(type) {
  const d = S.cat.widgets[type];
  if (EDIT.layout.widgets.some(w => w.type === type)) return toast('Bu widget düzende zaten var', true);
  if (d.pro && !pro()) toast('Bu widget Pro pakette; paketinizde ekranda görünmez', true);
  const [mw, mh] = d.min || [4, 3]; let spot = null;
  for (let y = 0; y <= 24 - mh && !spot; y++) for (let x = 0; x <= 24 - mw && !spot; x++) { const c = { x, y, w: mw, h: mh }; if (!EDIT.layout.widgets.some(w => overlap(w, c))) spot = c; }
  snap();
  EDIT.layout.widgets.push({ type, ...(spot || { x: 0, y: 0, w: mw, h: mh }), ...(d.props ? { props: clone(d.props) } : {}) });
  EDIT.sel = EDIT.layout.widgets.length - 1; drawCanvas(); drawProps(); drawPal();
  if (!spot) toast('Boş yer yok: kutu sol üste kondu, diğerlerini küçültüp yerleştirin', true);
}
function applyTpl(k) {
  if (EDIT.dirty && !confirm('Mevcut düzenin yerine bu şablon konsun mu?')) return;
  snap(); EDIT.layout = { cols: 24, rows: 24, widgets: clone(S.cat.templates[k].widgets) }; EDIT.sel = -1;
  drawCanvas(); drawProps(); drawPal(); toast('Şablon uygulandı; beğendiyseniz "Düzeni kaydet"e basın');
  $('cw').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
async function saveL() {
  if (badSet().size) return toast('Bazı kutular üst üste biniyor (kırmızı). Önce düzeltin.', true);
  const ok = await act('PUT', '/screen', { layout: EDIT.layout }, 'Düzen kaydedildi, TV güncellendi', false);
  if (ok) { EDIT.dirty = false; S.scr = await req('GET', '/screen'); render(true); }
}
function dragSetup() {
  const wrap = $('cw'); let st = null;
  wrap.onpointerdown = e => {
    const el = e.target.closest('.wb'); if (!el) { EDIT.sel = -1; drawCanvas(); drawProps(); return; }
    const i = +el.dataset.i; EDIT.sel = i;
    st = { i, x0: e.clientX, y0: e.clientY, w0: clone(EDIT.layout.widgets[i]), rz: e.target.classList.contains('rz'), moved: false, before: clone(EDIT.layout) };
    wrap.setPointerCapture(e.pointerId); drawCanvas(); drawProps(); e.preventDefault();
  };
  wrap.onpointermove = e => {
    if (!st) return;
    const r = wrap.getBoundingClientRect(), dx = Math.round((e.clientX - st.x0) / r.width * 24), dy = Math.round((e.clientY - st.y0) / r.height * 24);
    const w = EDIT.layout.widgets[st.i], o = st.w0, min = (S.cat.widgets[w.type] || {}).min || [2, 2];
    if (!st.rz) { w.x = Math.max(0, Math.min(24 - o.w, o.x + dx)); w.y = Math.max(0, Math.min(24 - o.h, o.y + dy)); }
    else { w.w = Math.max(min[0], Math.min(24 - o.x, o.w + dx)); w.h = Math.max(min[1], Math.min(24 - o.y, o.h + dy)); }
    st.moved = w.x !== o.x || w.y !== o.y || w.w !== o.w || w.h !== o.h;
    const el = $('cv').querySelector(`.wb[data-i="${st.i}"]`);
    if (el) { el.style.left = w.x / 24 * 100 + '%'; el.style.top = w.y / 24 * 100 + '%'; el.style.width = w.w / 24 * 100 + '%'; el.style.height = w.h / 24 * 100 + '%'; el.querySelector('small').textContent = w.w + '×' + w.h; }
  };
  wrap.onpointerup = wrap.onpointercancel = () => { if (!st) return; if (st.moved) { EDIT.hist.push(st.before); EDIT.dirty = true; } st = null; drawCanvas(); drawProps(); };
}
async function upAsset(inp) {
  const f = inp.files[0]; if (!f) return; const fd = new FormData(); fd.append('file', f);
  try { const j = await req('POST', '/assets', fd); setP('url', j.url); S.db = await req('GET', '/db'); drawProps(); toast('Resim yüklendi; düzeni kaydetmeyi unutmayın'); } catch (e) { toast(e.message, true); }
}
async function pickTheme(k) { const v = S.cat.themes[k]; await saveTheme({ bg: v.bg, accent: v.accent, accent2: v.accent2, text: v.text, font: v.font, plate: !!(S.me.tenant.theme || {}).plate }); }
async function saveTheme(body) {
  body = body || { bg: $('th-bg').value, accent: $('th-accent').value, accent2: $('th-accent2').value, text: $('th-text').value, font: $('th-font').value, plate: $('th-plate').value === '1' };
  const { name, ...clean } = body;
  const j = await act('PUT', '/theme', clean, 'Renkler kaydedildi', false);
  if (j) { S.me.tenant.theme = j.theme; drawBrand(); render(true); }
}
async function upLogo(inp) {
  const f = inp.files[0]; if (!f) return; const fd = new FormData(); fd.append('file', f);
  try {
    const j = await req('POST', '/logo', fd); S.me.tenant.logo = j.url; drawBrand();
    const th = (await themesFromLogo(j.url))[0];
    if (th) { const r = await req('PUT', '/theme', th); S.me.tenant.theme = r.theme; drawBrand(); toast('Logo yüklendi, renkler logonuza göre ayarlandı'); }
    else toast('Logo yüklendi');
    render(true);
  } catch (e) { toast(e.message, true); }
}

/* ---- logodan renk üretimi: baskın ve ikinci renk bulunur, TV için koyu zeminli tema türetilir ---- */
const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl(h, s, l) {
  s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return hex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
function logoColors(url) {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => {
      try {
        const N = 96, k = N / Math.max(im.naturalWidth || N, im.naturalHeight || N), w = Math.max(1, Math.round((im.naturalWidth || N) * k)), h = Math.max(1, Math.round((im.naturalHeight || N) * k));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0, w, h);
        const d = g.getImageData(0, 0, w, h).data;
        // ton kovaları (15°), doygunlukla ağırlıklı; beyaz, siyah ve gri pikseller vurgu adayı sayılmaz
        const B = Array.from({ length: 24 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
        let total = 0, darkW = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 128) continue;
          total++;
          const [hh, ss, ll] = rgb2hsl(d[i], d[i + 1], d[i + 2]);
          if (ll < 0.25) darkW++;
          if (ss < 0.2 || ll < 0.1 || ll > 0.93) continue;
          const wt = ss * (1 - Math.abs(ll - 0.5));
          const bk = B[Math.floor(hh / 15) % 24];
          bk.w += wt; bk.r += d[i] * wt; bk.g += d[i + 1] * wt; bk.b += d[i + 2] * wt;
        }
        const cols = B.map(b => b.w ? { w: b.w, hsl: rgb2hsl(b.r / b.w, b.g / b.w, b.b / b.w) } : null).filter(Boolean).sort((a, b) => b.w - a.w);
        const main = cols[0] || null, sum = cols.reduce((a, c) => a + c.w, 0);
        const second = main && cols.find(c => hueDist(c.hsl[0], main.hsl[0]) > 35 && c.w > sum * 0.12) || null;
        res({ main: main && main.hsl, second: second && second.hsl, colorful: !!main && sum > total * 0.03, darkLogo: total && darkW / total > 0.5 });
      } catch (e) { res(null); }
    };
    im.onerror = () => res(null);
    im.src = url + (url.includes('?') ? '&' : '?') + 'c=1';
  });
}
async function themesFromLogo(url) {
  const p = await logoColors(url);
  if (!p) return [];
  const font = (S.me.tenant.theme || {}).font || 'Montserrat', plate = !!p.darkLogo;
  if (!p.colorful) { // siyah-beyaz logo: nötr, altın ya da gümüş vurgulu temalar
    return [
      { name: 'Logodan · gümüş', bg: '#111214', accent: '#4a4f57', accent2: '#c9ced6', text: '#f7f8fa', font, plate },
      { name: 'Logodan · altın', bg: '#0f0e0c', accent: '#7a6328', accent2: '#e0bd5a', text: '#fffaf0', font, plate },
      { name: 'Logodan · kahve', bg: '#151717', accent: '#906538', accent2: '#c9955c', text: '#fbfbfb', font, plate },
    ];
  }
  const [h, s] = p.main, sat = Math.max(0.45, Math.min(0.85, s));
  const h2 = p.second ? p.second[0] : (h + 35) % 360, s2 = p.second ? Math.max(0.45, Math.min(0.9, p.second[1])) : sat;
  const bg = l => hsl(h, Math.min(0.35, s * 0.4), l);
  return [
    { name: 'Logodan · canlı', plate, bg: bg(0.075), accent: hsl(h, sat, 0.36), accent2: hsl(h, Math.min(0.95, sat + 0.1), 0.62), text: hsl(h, 0.2, 0.97), font },
    { name: p.second ? 'Logodan · iki renk' : 'Logodan · yan ton', plate, bg: bg(0.07), accent: hsl(h, sat, 0.34), accent2: hsl(h2, s2, 0.62), text: hsl(h, 0.15, 0.97), font },
    { name: 'Logodan · sade', plate, bg: hsl(h, 0.08, 0.08), accent: hsl(h, sat * 0.6, 0.32), accent2: hsl(h, sat * 0.7, 0.66), text: '#f6f6f4', font },
    { name: 'Logodan · gece', plate, bg: hsl(h, Math.min(0.5, s * 0.6), 0.05), accent: hsl(h, sat, 0.3), accent2: hsl(h, Math.min(1, sat + 0.15), 0.56), text: hsl(h, 0.25, 0.95), font },
  ];
}
async function drawLogoSuggestions() {
  const box = $('lsug'); if (!box || !S.me.tenant.logo) return;
  const list = await themesFromLogo(S.me.tenant.logo); window.__lsug = list;
  const th = S.me.tenant.theme;
  box.innerHTML = list.length ? list.map((v, i) => `<button class="swc ${v.bg === th.bg && v.accent2 === th.accent2 ? 'on' : ''}" onclick="saveTheme(window.__lsug[${i}])"><div class="c"><i style="background:${v.bg}"></i><i style="background:${v.accent}"></i><i style="background:${v.accent2}"></i></div><b>${esc(v.name)}</b></button>`).join('') : '<span class="muted">Logodan renk çıkarılamadı.</span>';
}
async function delLogo() { if (await act('DELETE', '/logo', undefined, 'Logo kaldırıldı', false)) { S.me.tenant.logo = null; drawBrand(); render(true); } }
const saveSafe = () => act('PUT', '/options', { safeL: +$('safeL').value, safeR: +$('safeR').value, safeT: +$('safeT').value, safeB: +$('safeB').value }, 'Kenar payları kaydedildi', false);
const resetSafe = () => act('PUT', '/options', { safeL: 0, safeR: 0, safeT: 0, safeB: 0 }, 'Kenar payları sıfırlandı');

/* ================= MEDYA ================= */
let mediaPoll = null;
SECTIONS.media = {
  html() {
    const v = S.db.videos;
    return head('Medya', 'Ekranda sırayla oynayan video ve fotoğraflar. Sürükleyerek sıralayın.')
      + card('Dosya ekle', 'Video (MP4, MOV…) ya da fotoğraf (JPG, PNG). Yüklenen dosyalar TV için otomatik küçültülür; hazır olunca ekrana girer.',
        `<div id="drop" onclick="$('files').click()"><b>Dosyaları buraya bırakın ya da tıklayın</b><span class="muted">Birden fazla dosya seçebilirsiniz</span></div><input type="file" id="files" multiple accept="video/*,image/*" hidden onchange="upFiles(this.files)"><div id="ups"></div>`)
      + card(`Gösterim sırası <span class="muted">· ${v.length} dosya</span>`, '', v.length ? `<div class="mgrid" id="mgrid">${v.map((x, i) => `<div class="tile" draggable="true" data-id="${x.id}">
          <div class="th" onclick="pvMedia(${i})">${x.type === 'image' ? `<img src="${S.me.upBase}${x.file}" loading="lazy">` : `<video src="${S.me.upBase}${x.file}#t=0.5" preload="metadata" muted></video>`}<span class="no">${i + 1}</span><span class="ty">${x.type === 'image' ? 'Fotoğraf' : 'Video'}</span>${x.status === 'processing' ? '<div class="proc">Hazırlanıyor…</div>' : ''}</div>
          <div class="m"><span title="${esc(x.name)}">${esc(x.name)}</span><button class="btn xs g" onclick="mvMedia('${x.id}','up')" title="Öne al">←</button><button class="btn xs g" onclick="mvMedia('${x.id}','down')" title="Sona al">→</button><button class="btn xs d" onclick="delMedia('${x.id}')" title="Sil">✕</button></div></div>`).join('')}</div>`
        : '<div class="empty">Henüz dosya yok. Yukarıdan ekleyin.</div>')
      + `<div class="grid g2">` + card('Fotoğraf süresi', 'Her fotoğraf ekranda kaç saniye kalsın.', `<div class="row"><input type="number" id="imgsec" min="3" max="120" value="${S.db.imageSeconds}" style="max-width:120px"><span class="muted">saniye</span><span style="flex:1"></span><button class="btn" onclick="act('PUT','/settings',{imageSeconds:+$('imgsec').value},'Kaydedildi')">Kaydet</button></div>`)
      + card('Depolama', '', `<div id="stor" class="muted">Hesaplanıyor…</div>`) + `</div>`;
  },
  async after() {
    const g = $('mgrid');
    if (g) { let drag = null;
      g.addEventListener('dragstart', e => { drag = e.target.closest('.tile'); e.dataTransfer.effectAllowed = 'move'; });
      g.addEventListener('dragover', e => { e.preventDefault(); const t = e.target.closest('.tile'); g.querySelectorAll('.dragover').forEach(x => x.classList.remove('dragover')); if (t && t !== drag) t.classList.add('dragover'); });
      g.addEventListener('drop', e => { e.preventDefault(); const t = e.target.closest('.tile'); if (!t || !drag || t === drag) return; const ids = [...g.children].map(x => x.dataset.id); const from = ids.indexOf(drag.dataset.id), to = ids.indexOf(t.dataset.id); ids.splice(to, 0, ids.splice(from, 1)[0]); act('POST', '/videos/reorder', { ids }, 'Sıra kaydedildi'); });
      g.addEventListener('dragend', () => g.querySelectorAll('.dragover').forEach(x => x.classList.remove('dragover')));
    }
    const d = $('drop');
    ['dragenter', 'dragover'].forEach(ev => d.addEventListener(ev, e => { e.preventDefault(); d.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => d.addEventListener(ev, e => { e.preventDefault(); d.classList.remove('over'); }));
    d.addEventListener('drop', e => upFiles(e.dataTransfer.files));
    clearTimeout(mediaPoll);
    if (S.db.videos.some(v => v.status === 'processing')) mediaPoll = setTimeout(() => { if (TAB === 'media') refresh(); }, 4000);
    try {
      const [st, sys] = await Promise.all([req('GET', '/storage'), req('GET', '/system')]);
      const pct = Math.min(100, st.uploadsBytes / st.limitBytes * 100), unopt = S.db.videos.filter(v => !v.optimized && v.status !== 'processing').length;
      $('stor').innerHTML = `<div class="row"><b style="color:var(--text)">${fmtSize(st.uploadsBytes)}</b><span>/ ${fmtSize(st.limitBytes)} kullanılıyor</span></div><div class="meter"><i style="width:${Math.max(2, pct)}%"></i></div>`
        + (!sys.ffmpeg ? '<p class="mt">Sunucuda video küçültme aracı (ffmpeg) yok; dosyalar olduğu gibi kullanılır.</p>' : unopt ? `<div class="row mt"><span>${unopt} dosya küçültülmemiş.</span><button class="btn s g" onclick="act('POST','/media/optimize-all',undefined,'Küçültme başladı')">Şimdi küçült</button></div>` : '');
    } catch (e) {}
  },
};
function upFiles(files) {
  if (!files || !files.length) return;
  const fd = new FormData(); let size = 0;
  for (const f of files) { fd.append('files', f); size += f.size; }
  const el = document.createElement('div'); el.className = 'up';
  el.innerHTML = `<span>${files.length} dosya yükleniyor (${fmtSize(size)})…</span><div class="bar"><i></i></div>`; $('ups').appendChild(el);
  const x = new XMLHttpRequest(); x.open('POST', '/api/admin/videos');
  x.upload.onprogress = e => { if (e.lengthComputable) el.querySelector('i').style.width = (e.loaded / e.total * 100) + '%'; };
  x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch {} if (x.status === 200) { el.remove(); toast('Yüklendi; hazırlanınca ekrana girecek'); refresh(); } else { el.querySelector('span').textContent = 'Yüklenemedi: ' + (j.error || x.status); el.style.color = 'var(--bad)'; } };
  x.onerror = () => { el.querySelector('span').textContent = 'Bağlantı hatası'; };
  x.send(fd);
}
const mvMedia = (id, dir) => act('POST', `/videos/${id}/move`, { dir });
const delMedia = id => { const v = S.db.videos.find(x => x.id === id); if (confirm(`"${v.name}" silinsin mi?`)) act('DELETE', '/videos/' + id, undefined, 'Silindi'); };
function pvMedia(i) { const v = S.db.videos[i], u = S.me.upBase + v.file; openModal((v.type === 'image' ? `<img src="${u}">` : `<video src="${u}" controls autoplay muted></video>`) + `<div class="muted">${i + 1}. ${esc(v.name)}</div>`); }

/* ================= FİYAT LİSTESİ ================= */
let MENU = null;
SECTIONS.menu = {
  html() {
    if (!MENU || !MENU.__dirty) MENU = clone(S.db.menu || { title: 'Fiyat Listesi', currency: '₺', categories: [] });
    return head('Fiyat Listesi', 'Ürünler ve fiyatlar. Düzene "Fiyat tarifesi" widget\'ı eklenince ekranda sayfa sayfa döner.', `<button class="btn" onclick="saveMenu()">Kaydet</button>`)
      + lock('Fiyat listesi')
      + card('Liste bilgisi', 'Kafe ve restoranlar giriş kapısındaki fiyat tarifesini dijital panoda da gösterebilir (Fiyat Etiketi Yönetmeliği). Giriş ekranı için Tasarım\'da "Vitrin" düzenini kullanabilirsiniz.',
        `<div class="f">${fl('Başlık', `<input type="text" id="mtitle" maxlength="40" value="${esc(MENU.title)}" oninput="MENU.title=this.value;MENU.__dirty=1">`)}${fl('Para birimi', `<input type="text" id="mcur" maxlength="4" value="${esc(MENU.currency || '₺')}" oninput="MENU.currency=this.value;MENU.__dirty=1">`)}</div>`)
      + `<div id="mcats"></div><div class="row" style="margin-bottom:18px"><button class="btn g" onclick="addCat()">＋ Kategori ekle</button><span style="flex:1"></span><button class="btn" onclick="saveMenu()">Kaydet</button></div>`
      + card('Toplu ekle', 'Her satıra bir ürün: <code>Ürün ; fiyat ; açıklama</code>. Kategori satırı <code>#</code> ile başlar. Örnek: <code># Sıcak İçecekler</code> · <code>Türk Kahvesi ; 90</code>',
        `<textarea id="mbulk" rows="6" placeholder="# Sıcak İçecekler&#10;Türk Kahvesi ; 90&#10;Latte ; 120 ; Yulaf sütüyle +15"></textarea><div class="row mt"><button class="btn g" onclick="bulk(false)">Listeye ekle</button><button class="btn d" onclick="bulk(true)">Listeyi bununla değiştir</button></div>`);
  },
  after() { drawMenu(); },
};
function drawMenu() {
  const c = MENU.categories;
  $('mcats').innerHTML = c.length ? c.map((cat, ci) => `<div class="mcat"><div class="chd"><input type="text" value="${esc(cat.name)}" placeholder="Kategori adı" maxlength="40" oninput="MENU.categories[${ci}].name=this.value;MENU.__dirty=1" style="font-weight:700">
      <button class="btn xs g" onclick="mE(()=>mv(MENU.categories,${ci},-1))">↑</button><button class="btn xs g" onclick="mE(()=>mv(MENU.categories,${ci},1))">↓</button><button class="btn xs d" onclick="if(confirm('Kategori silinsin mi?'))mE(()=>MENU.categories.splice(${ci},1))">Sil</button></div>
      ${cat.items.map((it, ii) => `<div class="mrow"><input type="text" value="${esc(it.name)}" placeholder="Ürün" maxlength="60" oninput="MENU.categories[${ci}].items[${ii}].name=this.value;MENU.__dirty=1"><input class="md" type="text" value="${esc(it.desc || '')}" placeholder="Açıklama (isteğe bağlı)" maxlength="90" oninput="MENU.categories[${ci}].items[${ii}].desc=this.value;MENU.__dirty=1"><input type="text" value="${esc(it.price)}" placeholder="Fiyat" maxlength="16" oninput="MENU.categories[${ci}].items[${ii}].price=this.value;MENU.__dirty=1"><span class="row" style="gap:4px;flex-wrap:nowrap"><button class="btn xs g" onclick="mE(()=>mv(MENU.categories[${ci}].items,${ii},-1))">↑</button><button class="btn xs d" onclick="mE(()=>MENU.categories[${ci}].items.splice(${ii},1))">✕</button></span></div>`).join('')}
      <button class="btn xs g" onclick="mE(()=>MENU.categories[${ci}].items.push({name:'',price:'',desc:''}))">＋ Ürün</button></div>`).join('')
    : '<div class="empty" style="margin-bottom:14px">Henüz kategori yok. "Kategori ekle" ile başlayın ya da aşağıdan toplu yapıştırın.</div>';
}
const mv = (a, i, d) => { const j = i + d; if (j >= 0 && j < a.length) [a[i], a[j]] = [a[j], a[i]]; };
const mE = fn => { fn(); MENU.__dirty = 1; drawMenu(); };
const addCat = () => mE(() => MENU.categories.push({ name: '', items: [{ name: '', price: '', desc: '' }] }));
async function saveMenu() { const body = clone(MENU); delete body.__dirty; if (await act('PUT', '/menu', body, 'Fiyat listesi kaydedildi', false)) { MENU.__dirty = 0; S.db = await req('GET', '/db'); } }
function bulk(replace) {
  const lines = $('mbulk').value.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return toast('Önce listeyi yapıştırın', true);
  if (replace && !confirm('Mevcut liste silinip bununla değiştirilsin mi?')) return;
  const cats = replace ? [] : MENU.categories; let cur = null;
  for (const l of lines) {
    if (l.startsWith('#')) { cur = { name: l.replace(/^#+\s*/, ''), items: [] }; cats.push(cur); continue; }
    const [name, price = '', desc = ''] = l.split(/[;\t|]/).map(x => x.trim());
    if (!cur) { cur = { name: 'Ürünler', items: [] }; cats.push(cur); }
    if (name) cur.items.push({ name, price, desc });
  }
  MENU.categories = cats; MENU.__dirty = 1; $('mbulk').value = ''; drawMenu(); toast('Eklendi; kontrol edip "Kaydet"e basın');
}

/* ================= SPOR ================= */
SECTIONS.sport = {
  html() {
    const db = S.db, L = S.lg, bc = Object.assign({ enabled: true, note: '', days: 3, everyMin: 6, durSec: 15, info: ['', '', ''] }, db.bigMatch || {});
    const groups = {}; L.catalog.forEach(l => (groups[l.group] = groups[l.group] || []).push(l));
    const tbl = L.catalog.filter(l => L.enabled.includes(l.code) && L.tables.includes(l.code));
    return head('Spor', 'Maçlar, canlı skorlar, puan durumu ve gol anı. "Maçlar ve bilgi sayfaları" widget\'ında ve kayan bantta görünür.')
      + lock('Maç ve spor özellikleri')
      + card('Takip edilen ligler', 'Seçtiğiniz liglerin bugünkü maçları ve canlı skorları gösterilir; gol olunca ekranda animasyon çıkar.',
        Object.entries(groups).map(([g, items]) => `<div class="grp"><h4>${esc(g)}</h4><div class="chips">${items.map(l => `<span class="chip ${L.enabled.includes(l.code) ? 'on' : ''}" data-code="${l.code}" onclick="this.classList.toggle('on')">${esc(l.label)}</span>`).join('')}</div></div>`).join('')
        + `<div class="row end"><button class="btn g s" onclick="testGoal()">⚽ Gol animasyonunu dene</button><button class="btn" onclick="saveLeagues()">Ligleri kaydet</button></div>`)
      + card('Puan durumu', 'Lig maçlarının ardından o ligin puan tablosu gösterilir.', `<div class="chips">${tbl.map(l => `<span class="chip ${(L.hideTables || []).includes(l.code) ? '' : 'on'}" onclick="togTable('${l.code}')">${esc(l.label)}</span>`).join('') || '<span class="muted">Puan tablosu olan bir lig seçin.</span>'}</div>`,
        sw(db.showStandings !== false, "opt('showStandings',this.checked).then(()=>render(true))"), db.showStandings === false ? 'off' : '')
      + card('Büyük maç duyurusu', 'Dört büyüklerin derbileri ve Avrupa maçları, başlamadan birkaç gün önce ekranda tam sayfa görselle duyurulur.',
        `<div class="f">${fl('Alt not', `<input type="text" id="bg-note" maxlength="140" value="${esc(bc.note)}">`)}${fl('Kaç gün önceden', `<input type="number" id="bg-days" min="1" max="7" value="${bc.days}">`)}${fl('Kaç dakikada bir', `<input type="number" id="bg-every" min="2" max="60" value="${bc.everyMin}">`)}${fl('Kaç saniye kalsın', `<input type="number" id="bg-dur" min="5" max="60" value="${bc.durSec}">`)}</div>
         <div class="f mt">${[0, 1, 2].map(i => fl(`Alt bilgi ${i + 1}`, `<input type="text" id="bg-i${i}" maxlength="60" value="${esc((bc.info || [])[i] || '')}" placeholder="${['örn. adresiniz', 'örn. dev ekran', 'örn. rezervasyon tel.'][i]}">`)).join('')}</div>
         <div class="fl mt"><span>Takım / oyuncu fotoğrafları (isteğe bağlı, arkası şeffaf PNG en iyisi)</span><div class="row"><input type="text" id="bg-team" list="bgteams" placeholder="Takım adı" style="max-width:220px"><datalist id="bgteams"><option>Galatasaray</option><option>Fenerbahçe</option><option>Beşiktaş</option><option>Trabzonspor</option></datalist><input type="file" id="bg-file" accept="image/*" hidden onchange="upBigPhoto(this)"><button class="btn g s" onclick="$('bg-team').value.trim()?$('bg-file').click():toast('Önce takım adını yazın',true)">Fotoğraf yükle</button></div><div class="thumbs" id="bgphotos"></div></div>
         <div class="row mt"><span id="bglist" class="muted" style="flex:1"></span><button class="btn g s" onclick="act('POST','/bigmatch/test',undefined,'Görsel TV\\'de gösteriliyor',false)">Şimdi dene</button><button class="btn" onclick="saveBig()">Kaydet</button></div>`,
        sw(bc.enabled, "act('PUT','/bigmatch',{enabled:this.checked},this.checked?'Açıldı':'Kapatıldı')"), bc.enabled ? '' : 'off')
      + card('Elle maç ekle', 'Listede olmayan bir maçı ya da etkinliği bugünün listesine ekler.', `<div class="f">${fl('Ev sahibi', '<input type="text" id="mm-h" maxlength="40">')}${fl('Deplasman', '<input type="text" id="mm-a" maxlength="40">')}${fl('Saat', '<input type="time" id="mm-t">')}${fl('Lig / etkinlik', '<input type="text" id="mm-l" maxlength="40">')}${fl('Kanal', '<input type="text" id="mm-c" maxlength="40" placeholder="örn. beIN Sports 1">')}</div>
        <div class="row end mt"><button class="btn" onclick="addMatch()">Ekle</button></div>
        ${db.matches.length ? `<div class="list mt">${db.matches.map(m => `<div class="it"><div class="b"><b>${esc(m.home)} – ${esc(m.away)}</b><span>${esc(m.time)}${m.league ? ' · ' + esc(m.league) : ''}${m.channel ? ' · 📺 ' + esc(m.channel) : ''}</span></div><button class="btn xs d" onclick="act('DELETE','/matches/${m.id}',undefined,'Silindi')">Sil</button></div>`).join('')}</div>` : ''}`);
  },
  async after() {
    try {
      const j = await req('GET', '/bigmatch');
      $('bgphotos').innerHTML = j.photos.map(p => `<div class="t" title="${esc(p.name)}"><img src="${esc(p.url)}"><button onclick="act('DELETE','/bigmatch/photo/${p.id}',undefined,'Silindi')">✕</button></div>`).join('');
      $('bglist').textContent = j.items.length ? 'Yaklaşan: ' + j.items.map(m => `${m.home} – ${m.away} (${new Date(m.ts).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })})`).join(', ') : 'Şu an duyurulacak büyük maç yok.';
    } catch (e) {}
  },
};
const testGoal = () => act('POST', '/goal/test', undefined, 'Gol animasyonu gönderildi', false);
async function saveLeagues() { const enabled = [...document.querySelectorAll('[data-code].on')].map(x => x.dataset.code); if (await act('PUT', '/leagues', { enabled }, 'Ligler kaydedildi', false)) { S.lg = await req('GET', '/leagues'); render(true); } }
async function togTable(c) { const h = S.lg.hideTables || []; S.lg.hideTables = h.includes(c) ? h.filter(x => x !== c) : [...h, c]; await act('PUT', '/options', { hideTables: S.lg.hideTables }, 'Kaydedildi', false); render(true); }
const saveBig = () => act('PUT', '/bigmatch', { note: $('bg-note').value, days: $('bg-days').value, everyMin: $('bg-every').value, durSec: $('bg-dur').value, info: [0, 1, 2].map(i => $('bg-i' + i).value) }, 'Kaydedildi');
async function upBigPhoto(inp) { const f = inp.files[0]; if (!f) return; const fd = new FormData(); fd.append('team', $('bg-team').value.trim()); fd.append('file', f); try { await req('POST', '/bigmatch/photo', fd); toast('Fotoğraf yüklendi'); refresh(); } catch (e) { toast(e.message, true); } }
async function addMatch() { const b = { home: $('mm-h').value.trim(), away: $('mm-a').value.trim(), time: $('mm-t').value, league: $('mm-l').value.trim(), channel: $('mm-c').value.trim() }; if (!b.home || !b.away || !b.time) return toast('Takımlar ve saat gerekli', true); act('POST', '/matches', b, 'Maç eklendi'); }

/* ================= DUYURULAR ================= */
SECTIONS.promo = {
  html() {
    const db = S.db;
    return head('Duyurular', 'Kampanya kartı, QR kodlar ve müşteri yorumları.')
      + (db.campaigns || []).map(c => card('🎁 Kampanya kartı', 'Belirli aralıklarla medya yerine tam sayfa, QR kodlu bir kart çıkar. Örnek: Google yorumu karşılığı ikram.',
        `<div class="f">${fl('Bağlantı (QR kodu buraya gider)', `<input type="text" id="c-url" value="${esc(c.url)}" placeholder="https://g.page/r/.../review">`)}${fl('Başlık', `<input type="text" id="c-h" maxlength="90" value="${esc(c.headline)}">`)}</div>
         <div class="f mt">${fl('Alt yazı', `<input type="text" id="c-s" maxlength="140" value="${esc(c.sub)}">`)}${fl('Not', `<input type="text" id="c-n" maxlength="160" value="${esc(c.note || '')}">`)}${fl('QR altındaki yazı', `<input type="text" id="c-q" maxlength="60" value="${esc(c.qrLabel || '')}">`)}</div>
         <div class="f mt">${fl('Kaç dakikada bir', `<input type="number" id="c-e" min="1" max="60" value="${c.everyMin}">`)}${fl('Kaç saniye kalsın', `<input type="number" id="c-d" min="8" max="60" value="${c.durSec}">`)}</div>
         <div class="row end mt"><button class="btn g s" onclick="act('POST','/campaigns/${c.id}/test',undefined,'Kart TV\\'de gösteriliyor',false)">Şimdi göster</button><button class="btn" onclick="saveCamp('${c.id}')">Kaydet</button></div>`,
        sw(c.enabled, `campToggle('${c.id}',this)`))).join('')
      + card('▣ QR kodlar', 'Wi-Fi, menü, Instagram… Medyanın köşesinde döner; düzene "QR kart" widget\'ı da ekleyebilirsiniz.',
        `${(db.qrs || []).length ? `<div class="list">${db.qrs.map(q => `<div class="it"><div class="qr">${q.svg}</div><div class="b"><b>${esc(q.label)}</b><span>${q.kind === 'wifi' ? 'Wi-Fi' : esc(q.text)}</span></div><select style="width:auto" onchange="act('PATCH','/qrs/${q.id}',{side:this.value},'Kaydedildi')"><option value="right" ${q.side !== 'left' ? 'selected' : ''}>Sağ köşe</option><option value="left" ${q.side === 'left' ? 'selected' : ''}>Sol köşe</option></select><button class="btn xs d" onclick="act('DELETE','/qrs/${q.id}',undefined,'Silindi')">Sil</button></div>`).join('')}</div>` : '<div class="empty">Henüz QR kod yok</div>'}
         <hr class="sep2"><div class="f">${fl('Tür', `<select id="q-kind" onchange="$('q-link').hidden=this.value==='wifi';$('q-wifi').hidden=this.value!=='wifi'"><option value="link">Bağlantı / metin</option><option value="wifi">Wi-Fi</option></select>`)}${fl('Etiket (QR altında)', '<input type="text" id="q-label" maxlength="40" placeholder="örn. Menü için okutun">')}</div>
         <div class="f mt" id="q-link">${fl('Bağlantı', '<input type="text" id="q-text" placeholder="https://instagram.com/...">')}</div>
         <div class="f mt" id="q-wifi" hidden>${fl('Ağ adı (SSID)', '<input type="text" id="q-ssid">')}${fl('Şifre', '<input type="text" id="q-pass">')}${fl('Güvenlik', '<select id="q-sec"><option value="WPA">WPA/WPA2</option><option value="WEP">WEP</option><option value="nopass">Şifresiz</option></select>')}</div>
         <div class="row end mt"><button class="btn" onclick="addQr()">QR ekle</button></div>
         <hr class="sep2"><div class="f">${fl(`Köşedeki QR boyutu: <b id="qsv">${db.qrSize || 17}</b>`, `<input type="range" min="10" max="30" value="${db.qrSize || 17}" oninput="$('qsv').textContent=this.value" onchange="opt('qrSize',+this.value)">`)}${fl('Wi-Fi şifre yazısı (boşsa QR\'daki şifre)', `<input type="text" maxlength="120" value="${esc(db.wifiText || '')}" onchange="opt('wifiText',this.value)">`)}</div>`,
        `<span class="muted" style="white-space:nowrap">Köşede göster</span>${sw(db.showQr !== false, "opt('showQr',this.checked)")}`)
      + lock('Google yorumları')
      + card('★ Google yorumları', 'Medyanın altındaki şeritte döner (düzende "Google yorumları" widget\'ı olmalı). Yalnız 4 ve 5 yıldız.',
        `${(db.reviews || []).length ? `<div class="list">${db.reviews.map(r => `<div class="it"><div class="b"><b>${esc(r.author)} <span class="stars">${'★'.repeat(r.rating)}</span></b><span>${esc(r.text)}</span></div><button class="btn xs d" onclick="act('DELETE','/reviews/${r.id}',undefined,'Silindi')">Sil</button></div>`).join('')}</div>` : '<div class="empty">Henüz yorum yok</div>'}
         <hr class="sep2"><div class="f">${fl('Yorumcu adı', '<input type="text" id="r-a" maxlength="60">')}${fl('Puan', '<select id="r-r"><option value="5">★★★★★</option><option value="4">★★★★</option></select>')}</div>
         ${fl('Yorum (Google\'dan kopyalayıp yapıştırın)', '<textarea id="r-t" maxlength="400" rows="3"></textarea>')}<div class="row end mt"><button class="btn" onclick="addReview()">Yorum ekle</button></div>`);
  },
};
const saveCamp = id => act('PUT', '/campaigns/' + id, { url: $('c-url').value, headline: $('c-h').value, sub: $('c-s').value, note: $('c-n').value, qrLabel: $('c-q').value, everyMin: $('c-e').value, durSec: $('c-d').value }, 'Kampanya kaydedildi');
async function campToggle(id, el) { const url = $('c-url').value.trim(); const ok = await act('PUT', '/campaigns/' + id, { url, enabled: el.checked }, el.checked ? 'Kampanya açıldı' : 'Kampanya kapatıldı'); if (!ok) el.checked = !el.checked; }
function addQr() {
  const kind = $('q-kind').value, b = { kind, label: $('q-label').value.trim() };
  if (kind === 'wifi') Object.assign(b, { ssid: $('q-ssid').value.trim(), password: $('q-pass').value, security: $('q-sec').value }); else b.text = $('q-text').value.trim();
  act('POST', '/qrs', b, 'QR kod eklendi');
}
const addReview = () => act('POST', '/reviews', { author: $('r-a').value.trim(), rating: $('r-r').value, text: $('r-t').value.trim() }, 'Yorum eklendi');

/* ================= KUTLAMALAR ================= */
let TIMES = null;
SECTIONS.celeb = {
  html() {
    const db = S.db; TIMES = TIMES || [...(db.times || [])];
    return head('Kutlamalar', 'Müşterilerinize doğum günü mesajları ve resmî bayramlarda bayrak, Atatürk sözleri ve fotoğraflar.')
      + lock('Doğum günü kutlaması')
      + `<div class="grid g2" style="margin-bottom:18px">`
      + card('🎂 Doğum günü', 'Seçili kişiler için belirlenen saatlerde ekranın altında kutlama yazısı kayar.',
        `${db.birthdays.length ? `<div class="list">${db.birthdays.map(b => `<div class="it">${sw(b.selected, `act('PATCH','/birthdays/${b.id}',{selected:this.checked},this.checked?'Kutlamaya eklendi':'Kutlamadan çıkarıldı',false)`)}<div class="b"><b>${esc(b.name)}</b><span>${esc(b.text)}</span></div><button class="btn xs d" onclick="act('DELETE','/birthdays/${b.id}',undefined,'Silindi')">Sil</button></div>`).join('')}</div>` : '<div class="empty">Henüz kişi yok</div>'}
         <hr class="sep2">${fl('Kişi', '<input type="text" id="b-n" maxlength="60" placeholder="Ad Soyad">')}<div class="mt">${fl('Ekranda kayacak yazı', '<input type="text" id="b-t" maxlength="200" placeholder="🎉 Sevgili Ahmet, nice mutlu yıllara! 🎂">')}</div>
         <div class="row end mt"><button class="btn" onclick="addBday()">Ekle</button></div>`)
      + card('Gösterim saatleri', 'Kutlama her gün bu saatlerde başlar.',
        `<div class="row" id="times">${TIMES.map((t, i) => `<span class="time">${t}<button onclick="TIMES.splice(${i},1);render(true)">×</button></span>`).join('') || '<span class="muted">Saat yok</span>'}</div>
         <div class="row mt"><input type="time" id="b-time" style="max-width:150px"><button class="btn g s" onclick="const v=$('b-time').value;if(v&&!TIMES.includes(v)){TIMES.push(v);TIMES.sort();render(true)}">＋ Saat ekle</button></div>
         <div class="f mt">${fl('Ekranda kalma süresi (saniye)', `<input type="number" id="b-dur" min="5" max="300" value="${db.duration}">`)}</div>
         <div class="row mt"><button class="btn g s" onclick="act('POST','/birthday/fire',undefined,'Kutlama gösteriliyor',false)">Şimdi göster</button><span style="flex:1"></span><button class="btn" onclick="saveTimes()">Kaydet</button></div>`)
      + `</div>`
      + card('🇹🇷 Resmî günler', '23 Nisan, 19 Mayıs, 30 Ağustos, 29 Ekim ve 10 Kasım\'da medyanın üstünde dalgalanan bayrak ve Atatürk sözleri çıkar, arada fotoğraflar gösterilir. Gün başında açılır, ertesi gün 03:00\'te kalkar.',
        '<div id="cdays" class="list"><div class="muted">Yükleniyor…</div></div>', sw(db.showCelebrations !== false, "opt('showCelebrations',this.checked).then(()=>render(true))"), db.showCelebrations === false ? 'off' : '');
  },
  async after() {
    try {
      const c = await req('GET', '/celebrate');
      $('cdays').innerHTML = c.holidays.map(h => `<div class="it" style="flex-wrap:wrap"><div class="b" style="min-width:200px"><b>${esc(h.title)}${c.active === h.id ? ' <span class="pill ok">şu an açık</span>' : ''}</b><span>${h.md.split('-').reverse().join('.')} · ${h.photos.length} fotoğraf</span>
          <div class="thumbs">${h.photos.map(p => `<div class="t"><img src="${esc(p.url)}">${p.id ? `<button onclick="act('DELETE','/celebrate/photos/${p.id}',undefined,'Silindi')">✕</button>` : ''}</div>`).join('')}</div></div>
          <select style="width:auto" onchange="act('PUT','/celebrate/mode',{id:'${h.id}',mode:this.value},'Kaydedildi')">${[['auto', 'Tarihinde otomatik'], ['on', 'Hep açık'], ['off', 'Kapalı']].map(([v, l]) => `<option value="${v}" ${h.mode === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <button class="btn xs g" onclick="act('POST','/celebrate/preview',{id:'${h.id}'},'3 dakika önizleme başladı',false)">Önizle</button>
          <label class="btn xs g" style="cursor:pointer">＋ Fotoğraf<input type="file" accept="image/*" hidden onchange="upCeleb('${h.id}',this)"></label></div>`).join('');
    } catch (e) {}
  },
};
async function addBday() { if (await act('POST', '/birthdays', { name: $('b-n').value.trim(), text: $('b-t').value.trim() }, 'Kişi eklendi')) {} }
async function saveTimes() { if (await act('PUT', '/schedule', { times: TIMES, duration: $('b-dur').value }, 'Saatler kaydedildi', false)) { S.db = await req('GET', '/db'); TIMES = null; render(true); } }
async function upCeleb(day, inp) { const f = inp.files[0]; if (!f) return; const fd = new FormData(); fd.append('day', day); fd.append('file', f); try { await req('POST', '/celebrate/photos', fd); toast('Fotoğraf eklendi'); render(true); } catch (e) { toast(e.message, true); } }

/* ================= BİLGİ BANDI ================= */
SECTIONS.info = {
  html() {
    const db = S.db, ph = db.pharmacy || {}, nw = db.news || {}, mv = db.movies || {};
    const ist = /istanbul|İstanbul/i.test((db.location || {}).city || '');
    const row = (title, desc, on, js, extra = '') => `<div class="swr" style="flex-wrap:wrap"><div class="b"><b>${title}</b><span>${desc}</span></div>${sw(on, js)}${extra ? `<div style="flex-basis:100%;${on ? '' : 'opacity:.45;pointer-events:none'}">${extra}</div>` : ''}</div>`;
    return head('Bilgi Bandı', '"Maçlar ve bilgi sayfaları" widget\'ında sırayla dönen ve kayan bantta akan bilgiler. Maç yokken ekranı canlı tutar.')
      + lock('Bilgi bandı')
      + card('Sayfalar', 'Açtıklarınız sırayla gösterilir. Veriler otomatik yenilenir; anahtar ya da ayar gerekmez.',
        row('📰 Haberler', 'Türkiye gündeminden başlıklar', nw.enabled !== false, "act('PUT','/news',{enabled:this.checked},'Kaydedildi')",
          `<div class="f mt">${fl('Kategori', `<select onchange="act('PUT','/news',{tag:this.value},'Kaydedildi')">${[['general', 'Genel'], ['economy', 'Ekonomi'], ['sport', 'Spor'], ['technology', 'Teknoloji']].map(([v, l]) => `<option value="${v}" ${(nw.tag || 'general') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}</div>`)
        + row('💊 Nöbetçi eczaneler', 'Seçtiğiniz ilçelerin bugünkü nöbetçi eczaneleri', ph.enabled !== false, "act('PUT','/pharmacy',{enabled:this.checked},'Kaydedildi')",
          `<div class="f mt">${fl('İl', `<input type="text" id="ph-il" value="${esc(ph.il || 'İstanbul')}">`)}${fl('İlçe(ler), virgülle (en fazla 2)', `<input type="text" id="ph-d" value="${esc((ph.districts || []).join(', '))}" placeholder="örn. Kadıköy, Üsküdar">`)}</div><div class="row end mt"><span id="ph-res" class="muted" style="flex:1"></span><button class="btn g s" onclick="testPharm()">Dene</button><button class="btn s" onclick="savePharm()">Kaydet</button></div>`)
        + row('🎬 Sinemada bu hafta', 'Vizyondaki filmler; fragmanlar arada medya yerine oynar', mv.enabled !== false, "act('PUT','/movies',{enabled:this.checked},'Kaydedildi')",
          `<div class="swr"><div class="b"><b>Fragmanları oynat</b><span>Sessiz, birkaç içerikte bir</span></div>${sw(mv.trailers !== false, "act('PUT','/movies',{trailers:this.checked},'Kaydedildi',false)")}</div>`)
        + row('📚 Yeni çıkan kitaplar', 'Haftanın yeni kitapları', db.showBooks !== false, "opt('showBooks',this.checked)")
        + row('📜 Tarihte bugün', 'Vikipedi\'den bugünün tarihinde yaşanan olaylar', db.showOnThisDay !== false, "opt('showOnThisDay',this.checked)")
        + row('🚗 Canlı trafik', ist ? 'İstanbul trafik haritası ve yoğunluk yüzdesi' : 'Yalnızca İstanbul\'daki işletmelerde gösterilir', db.showTraffic !== false, "opt('showTraffic',this.checked)"));
  },
};
const savePharm = () => act('PUT', '/pharmacy', { il: $('ph-il').value.trim(), districts: $('ph-d').value.split(',').map(x => x.trim()).filter(Boolean) }, 'Eczane ayarı kaydedildi');
async function testPharm() {
  $('ph-res').textContent = 'Sorgulanıyor…';
  try { const j = await req('POST', '/pharmacy/test', { il: $('ph-il').value.trim(), districts: $('ph-d').value.split(',').map(x => x.trim()).filter(Boolean) }); $('ph-res').textContent = `${j.count} nöbetçi eczane bulundu${j.sample[0] ? ': ' + j.sample[0].name : ''}`; }
  catch (e) { $('ph-res').textContent = e.message; }
}

/* ================= AYARLAR ================= */
let GEO = null;
SECTIONS.settings = {
  html() {
    const sub = SUB.settings || 'business', t = S.me.tenant;
    let h = head('Ayarlar', 'İşletme bilgileri, TV kutusu, kullanıcılar, paket ve yedekler.')
      + tabs('settings', [['business', 'İşletme'], ['devices', 'Cihazlar'], ['users', 'Kullanıcılar'], ['plan', 'Paket'], ['backup', 'Yedekler']]);
    if (sub === 'business') {
      const loc = S.db.location || {};
      h += card('İşletme bilgileri', '', `<div class="f">${fl('İşletme adı', `<input type="text" id="s-name" maxlength="80" value="${esc(t.name)}">`)}${fl('Şehir / ilçe (hava durumu için)', `<input type="text" id="s-city" placeholder="örn. Kadıköy" autocomplete="off" oninput="geoSearch()">`)}</div>
        <div class="geo" id="geo"></div><p class="muted mt">Şu anki konum: <b style="color:var(--text)">${esc(loc.city || '-')}</b>${loc.custom ? '' : ' (varsayılan)'}</p>
        <div class="row end mt"><button class="btn" onclick="saveProfile()">Kaydet</button></div>`);
    } else if (sub === 'devices') {
      const devs = S.scr.devices, lim = S.scr.limit;
      h += `<div class="grid g2" style="margin-bottom:18px">`
        + card('TV kutusunu bağla', 'Mekândaki Android kutu, HDMI dağıtıcıyla tüm TV\'lere aynı görüntüyü verir; tek kutu yeterli.',
          `<ol style="padding-left:20px;line-height:1.9;color:var(--soft);font-size:14px"><li><a href="/app.apk?name=${encodeURIComponent(S.me.tenant.name)}">Android uygulamasını (APK) indirin</a> ve kutuya kurun.</li><li>Uygulamayı açın. Ekranda giriş formu ve 6 haneli bir kod çıkar.</li><li>Kutuda kullanıcı adı ve şifrenizle giriş yapın, <b>ya da</b> kodu aşağıya yazın (TV'deki QR'ı telefonla okutursanız kendiliğinden dolar).</li></ol>
           <div class="row mt"><input type="text" id="pcode" class="code-in" inputmode="numeric" maxlength="7" placeholder="123 456" value="${window.__pair ? window.__pair.replace(/(\d{3})(\d{3})/, '$1 $2') : ''}"><button class="btn" onclick="pairTv()">Bağla</button></div>`)
        + card(`Bağlı cihazlar <span class="muted">· ${devs.length}/${lim}</span>`, 'Kutu değiştirirseniz eskisini buradan kaldırın.',
          devs.length ? `<div class="list">${devs.map(d => `<div class="it"><span class="dot ${d.online ? 'on' : ''}"></span><div class="b"><b>${esc(d.name || 'TV kutusu')}</b><span>${d.online ? 'Şu an bağlı' : 'Son görülme: ' + ago(d.last_seen)} · eklendi ${fmtDate(d.created)}</span></div><button class="btn xs g" onclick="renDev('${d.id}','${esc(d.name || '').replace(/'/g, '')}')">Adlandır</button><button class="btn xs d" onclick="delDev('${d.id}')">Kaldır</button></div>`).join('')}</div>
            <div class="row mt"><button class="btn g s" onclick="act('POST','/devices/reload',undefined,'Yenileme komutu gönderildi',false)">↻ Ekranı yenile</button></div>` : '<div class="empty">Henüz bağlı cihaz yok</div>')
        + `</div>`;
      window.__pair = null;
    } else if (sub === 'users') {
      h += `<div class="grid g2">` + (owner() ? card('Kullanıcılar', 'Personel hesapları içerik ekleyebilir (medya, duyuru, doğum günü); yedek geri yükleme ve kullanıcı yönetimi yapamaz.', `<div id="ulist" class="list"><div class="muted">Yükleniyor…</div></div>
          <hr class="sep2"><div class="f">${fl('Kullanıcı adı', '<input type="text" id="u-n" autocomplete="off">')}${fl('Şifre (en az 8)', '<input type="password" id="u-p" autocomplete="new-password">')}</div><div class="row end mt"><button class="btn" onclick="addUser()">Ekle</button></div>`) : '')
        + card('Şifremi değiştir', '', `<div class="f">${fl('Mevcut şifre', '<input type="password" id="pw-c" autocomplete="current-password">')}${fl('Yeni şifre (en az 8)', '<input type="password" id="pw-n" autocomplete="new-password">')}</div><div class="row end mt"><button class="btn" onclick="changePw()">Değiştir</button></div>`) + `</div>`;
    } else if (sub === 'plan') {
      const p = t.plan, u = S.me.usage, acc = t.access;
      const m = (l, used, lim, f = x => x) => `<div class="row" style="justify-content:space-between;font-size:14px"><span>${l}</span><span class="muted">${f(used)} / ${f(lim)}</span></div><div class="meter" style="margin-bottom:12px"><i style="width:${Math.max(2, Math.min(100, used / lim * 100))}%"></i></div>`;
      h += `<div class="grid g2">` + card('Paketiniz', '', `<div style="font-size:24px;font-weight:700;color:var(--accent2)">${esc(p.name)}</div><p class="muted" style="margin:2px 0 16px">${!acc.ok ? 'Süresi doldu' : (acc.kind === 'trial' ? 'Deneme · ' : 'Aktif · ') + fmtDate(acc.until) + ' tarihine kadar'}</p>
          ${m('Cihaz', u.devices, p.devices)}${m('Depolama', Math.round(u.storageBytes / 1048576), p.storageMB, x => x >= 1024 ? (x / 1024).toFixed(1) + ' GB' : x + ' MB')}${m('Kullanıcı', u.users, p.users)}`)
        + card('Paketler', 'Paket değişikliği ve ödeme için bizimle iletişime geçin.', `<div class="plans">${Object.values(S.me.plans).map(x => `<div class="${x.id === p.id ? 'cur' : ''}"><b>${esc(x.name)}</b>${x.devices} cihaz · ${x.storageMB >= 1024 ? x.storageMB / 1024 + ' GB' : x.storageMB + ' MB'} · ${x.users} kullanıcı<br>${x.pro ? '✓ Maçlar ve canlı skor<br>✓ Fiyat listesi<br>✓ Bilgi bandı, yorumlar, doğum günü' : '✓ Medya, logo, saat, hava, kurlar<br>✓ Kampanya kartı ve QR<br><span class="muted">Köşede ürün adı görünür</span>'}</div>`).join('')}</div>`) + `</div>`;
    } else {
      h += card('Yedekler', 'Ayarlarınız (liste sırası, yorumlar, QR, doğum günleri, lig seçimi…) her gün otomatik yedeklenir; en yeni 30 yedek saklanır. Medya dosyaları yedeğe dahil değildir.',
        `<div class="row"><button class="btn" onclick="act('POST','/backups',undefined,'Yedek alındı')">Şimdi yedek al</button></div><div id="blist" class="list mt"><div class="muted">Yükleniyor…</div></div>`);
    }
    return h;
  },
  async after() {
    const sub = SUB.settings || 'business';
    if (sub === 'users' && owner()) {
      const us = await req('GET', '/users').catch(() => []);
      $('ulist').innerHTML = us.map(u => `<div class="it"><div class="b"><b>${esc(u.username)}</b><span>${u.role === 'owner' ? 'İşletme sahibi' : 'Personel'} · son giriş: ${ago(u.last_login)}</span></div>${u.role === 'staff' ? `<button class="btn xs d" onclick="delUser('${u.id}','${esc(u.username)}')">Sil</button>` : ''}</div>`).join('');
    }
    if (sub === 'backup') {
      const bs = await req('GET', '/backups').catch(() => []);
      $('blist').innerHTML = bs.length ? bs.map(b => `<div class="it"><div class="b"><b>${new Date(b.time).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}</b><span>${esc(b.name.replace(/^db-|\.json$/g, '').split('-').pop())} · ${fmtSize(b.size)}</span></div><a class="btn xs g" href="/api/admin/backups/${encodeURIComponent(b.name)}/download">İndir</a>${owner() ? `<button class="btn xs g" onclick="restore('${b.name}')">Geri yükle</button>` : ''}</div>`).join('') : '<div class="empty">Henüz yedek yok</div>';
    }
    if (sub === 'devices' && $('pcode').value) $('pcode').focus();
  },
};
let geoT;
function geoSearch() {
  clearTimeout(geoT);
  geoT = setTimeout(async () => {
    const q = $('s-city').value.trim(); if (q.length < 2) { $('geo').innerHTML = ''; return; }
    try { const l = await req('GET', '/geo?q=' + encodeURIComponent(q)); window.__geo = l; $('geo').innerHTML = l.map((x, i) => `<button type="button" onclick="pickGeo(${i})">${esc(x.city)}${x.admin ? ' · ' + esc(x.admin) : ''}</button>`).join('') || '<span class="muted">Sonuç yok</span>'; }
    catch (e) { $('geo').innerHTML = `<span class="muted">${esc(e.message)}</span>`; }
  }, 350);
}
function pickGeo(i) { GEO = window.__geo[i]; $('s-city').value = GEO.city + (GEO.admin ? ', ' + GEO.admin : ''); $('geo').innerHTML = ''; }
async function saveProfile() {
  const body = { name: $('s-name').value.trim() }; if (GEO) body.location = { city: GEO.city, lat: GEO.lat, lon: GEO.lon };
  if (await act('PUT', '/profile', body, 'Kaydedildi', false)) { GEO = null; S.me = await req('GET', '/me'); drawBrand(); refresh(); }
}
async function pairTv() {
  const code = $('pcode').value.replace(/\D/g, '');
  if (code.length !== 6) return toast('TV ekranındaki 6 haneli kodu girin', true);
  if (await act('POST', '/pair', { code }, 'Cihaz bağlandı; birkaç saniye içinde ekran açılacak', false)) setTimeout(refresh, 2500);
}
const renDev = (id, cur) => { const n = prompt('Cihaz adı (örn. Salon kutusu):', cur); if (n !== null) act('PUT', '/devices/' + id, { name: n }, 'Kaydedildi'); };
const delDev = id => { if (confirm('Bu cihazın oturumu kapatılsın mı? Kutu giriş ekranına döner.')) act('DELETE', '/devices/' + id, undefined, 'Cihaz kaldırıldı'); };
async function addUser() { if (await act('POST', '/users', { username: $('u-n').value.trim(), password: $('u-p').value }, 'Kullanıcı eklendi', false)) { S.me = await req('GET', '/me'); render(true); } }
const delUser = (id, n) => { if (confirm(`"${n}" silinsin mi?`)) act('DELETE', '/users/' + id, undefined, 'Silindi'); };
async function changePw() { if (await act('PUT', '/password', { current: $('pw-c').value, next: $('pw-n').value }, 'Şifre değiştirildi', false)) { $('pw-c').value = $('pw-n').value = ''; } }
const restore = n => { if (confirm('Bu yedek geri yüklensin mi? Mevcut ayarlar önce yedeklenir.')) act('POST', `/backups/${encodeURIComponent(n)}/restore`, undefined, 'Yedek geri yüklendi'); };

/* ================= açılış ================= */
function drawBrand() {
  const t = S.me.tenant, th = t.theme || {}, r = document.documentElement.style;
  const rgbOf = h => { const n = parseInt(String(h || '').slice(1), 16); return isNaN(n) ? null : [n >> 16, (n >> 8) & 255, n & 255]; };
  const a1 = rgbOf(th.accent), a2 = rgbOf(th.accent2);
  if (a1 && a2) { r.setProperty('--accent', th.accent); r.setProperty('--accent2', th.accent2); r.setProperty('--a2', a2.join(',')); } $('brand').innerHTML = t.logo ? `<img src="${esc(t.logo)}" alt="${esc(t.name)}"${th.plate ? ' style="background:#fff;padding:6px 10px;border-radius:8px"' : ''}>` : `<b>${esc(t.name)}</b>`; document.title = t.name + ' · ' + S.me.brand; }
(async function boot() {
  try { [S.me, S.db, S.cat, S.scr, S.lg] = await Promise.all([req('GET', '/me'), req('GET', '/db'), req('GET', '/catalog'), req('GET', '/screen'), req('GET', '/leagues')]); }
  catch (e) { $('view').innerHTML = `<div class="empty">Panel yüklenemedi: ${esc(e.message)}</div>`; return; }
  drawBrand(); drawBanner(); route();
  setInterval(async () => { if (document.hidden) return; try { S.scr = await req('GET', '/screen'); } catch (e) {} }, 30000);
})();
addEventListener('beforeunload', e => { if (EDIT.dirty || (MENU && MENU.__dirty)) { e.preventDefault(); e.returnValue = ''; } });
