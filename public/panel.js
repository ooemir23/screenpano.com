/* İşletme paneli. Bölümler: Özet, Tasarım, Medya, Fiyat Listesi, Spor, Duyurular, Kutlamalar, Bilgi Bandı, Ayarlar. */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { me: null, db: null, cat: null, scr: null, lg: null };
let TAB = 'home', PREV = null, SUB = {};
const ICON = { media: '🎞', logo: '🏷', clock: '🕒', rates: '💱', ticker: '📰', text: '📝', image: '🖼', qr: '▣', info: '⚽', reviews: '★', menu: '🧾' };
const fmtDate = ms => ms ? new Date(ms).toLocaleDateString(I18N.locale, { day: 'numeric', month: 'long', year: 'numeric' }) : '-';
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
  ['promo', '📣', 'Duyurular'], ['qr', '▣', 'QR Kodlar'], ['celeb', '🎉', 'Kutlamalar'], ['info', '📰', 'Bilgi Bandı', 1], ['stats', '📊', 'İstatistik'], null, ['settings', '⚙', 'Ayarlar'],
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
  PREV = TAB; menu(false); if ($('modal').classList.contains('on')) closeModal(); render(); scrollTo(0, 0);
}
addEventListener('hashchange', route);
function render(keepScroll) {
  const y = scrollY;
  drawNav();
  const sec = SECTIONS[TAB];
  $('view').innerHTML = sec.html();
  if (sec.after) sec.after();
  drawJump();
  setTimeout(scalePv, 30);
  if (keepScroll) scrollTo(0, y);
}
// Sayfa içi hızlı erişim: kart başlıkları üstte sabit bir şeritte; tıklayınca ekran o karta kayar ve kart kısa süre vurgulanır
function drawJump() {
  const v = $('view'), cards = [...v.querySelectorAll('.card')].filter(c => c.querySelector('.ch h3'));
  if (cards.length < 3) return;
  const bar = document.createElement('div'); bar.className = 'jump';
  cards.forEach((c, i) => {
    c.id = 'kart-' + i;
    const a = document.createElement('button'); a.type = 'button';
    a.textContent = c.querySelector('.ch h3').textContent.trim();
    a.onclick = () => jumpTo(c); bar.appendChild(a);
  });
  const h = v.querySelector('.head'); h ? h.after(bar) : v.prepend(bar);
}
function jumpTo(c) {
  const bar = document.querySelector('.jump'), top = c.getBoundingClientRect().top + scrollY - (bar ? bar.offsetHeight : 0) - ($('top').offsetHeight || 0) - 12;
  scrollTo({ top, behavior: 'smooth' });
  c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash');
  const inp = c.querySelector('input:not([type=hidden]):not([type=checkbox]),select,textarea'); if (inp) setTimeout(() => inp.focus({ preventScroll: true }), 450);
}
function drawBanner() {
  const t = S.me.tenant, acc = t.access, days = acc.until ? Math.ceil((acc.until - Date.now()) / 86400000) : 0;
  let h = '';
  if (S.me.user.impersonating) h += `<div class="bn imp"><span>Süper yönetici olarak <b>${esc(t.name)}</b> işletmesini görüntülüyorsunuz.</span><button class="btn s g" onclick="unimp()">Süper yönetime dön</button></div>`;
  if (!acc.ok) h += `<div class="bn bad"><span><b>${acc.reason === 'suspended' ? 'Hesabınız askıya alındı.' : 'Abonelik süreniz doldu.'}</b> Ekranınız şu an kapalı; paketiniz yenilenince kendiliğinden açılır.</span></div>`;
  if (S.db && S.db.deletion) h += `<div class="bn bad"><span><b>Hesap silme talebi var.</b> ${fmtDate(S.db.deletion.executeAt)} tarihinde tüm veriler kalıcı olarak silinecek.</span><a class="btn s g" href="#settings/privacy">Vazgeç</a></div>`;
  const off = S.scr && S.scr.devices.filter(d => !d.online && d.last_seen && Date.now() - d.last_seen > 10 * 60000 && Date.now() - d.last_seen < 7 * 86400000);
  if (acc.ok && off && off.length) h += `<div class="bn trial"><span><b>${esc(off[0].name || 'TV kutusu')}</b> ${ago(off[0].last_seen)} beri çevrimdışı. Kutunun elektriğini, internetini ve uygulamanın açık olduğunu kontrol edin.</span><a class="btn s g" href="#settings/devices">Cihazlar</a></div>`;
  if (!acc.ok) {} else if (acc.kind === 'trial') h += `<div class="bn trial"><span>Deneme süreniz <b>${days} gün</b> sonra (${fmtDate(acc.until)}) bitiyor. Deneme boyunca tüm Pro özellikler açık.</span></div>`;
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
      [devs.length > 0, 'TV kutusunu bağlayın', 'Android kutuya ya da Windows bilgisayara uygulamayı kurun, kodu girin', '#settings/devices'],
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
      (sub === 'layout' ? `<button class="btn g" onclick="undoL()">↶ Geri al</button><button class="btn" onclick="saveL()">Düzeni kaydet</button>` : '')
      + `<button class="btn g" onclick="resetDesign('${sub}')">⟲ Varsayılana sıfırla</button>`)
      + tabs('design', [['layout', 'Düzen'], ['colors', 'Renk ve logo'], ['tv', 'TV ayarları']]);
    if (sub === 'layout') {
      const T = S.cat.templates;
      h += card('Başlangıç paketleri', 'İşletme türünüzü seçin: ekran düzeni, renkler ve örnek ürün listesi birlikte gelir. Medyanız, logonuz ve diğer ayarlarınız silinmez; fiyatları kendiniz girersiniz.', `<div class="tpls">${(S.cat.starters || []).map(v => `<button class="tpl" onclick="applyStarter('${v.key}')"><div class="mini" style="background:${v.theme.bg}">${v.widgets.map(w => `<i style="left:${w.x / 24 * 100}%;top:${w.y / 24 * 100}%;width:${w.w / 24 * 100}%;height:${w.h / 24 * 100}%;background:${v.theme.accent2};opacity:.55"></i>`).join('')}</div><b>${esc(v.name)}</b><span>${esc(v.desc)}</span></button>`).join('')}</div>`)
        + card('Hazır düzenler', 'Birini seçin, sonra aşağıda dilediğiniz gibi değiştirin.', `<div class="tpls">${Object.entries(T).map(([k, v]) => `<button class="tpl" onclick="applyTpl('${k}')"><div class="mini">${v.widgets.map(w => `<i style="left:${w.x / 24 * 100}%;top:${w.y / 24 * 100}%;width:${w.w / 24 * 100}%;height:${w.h / 24 * 100}%"></i>`).join('')}</div><b>${esc(v.name)}</b><span>${esc(v.desc)}</span></button>`).join('')}</div>`)
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
const floats = (a, b) => (a.type === 'qr') !== (b.type === 'qr'); // QR kartı diğer kutuların üstüne konabilir
const badSet = () => { const ws = EDIT.layout.widgets, bad = new Set(); ws.forEach((a, i) => ws.forEach((b, j) => { if (i < j && overlap(a, b) && !floats(a, b)) { bad.add(i); bad.add(j); } })); return bad; };
function drawCanvas() {
  const c = $('cv'); if (!c) return;
  const bad = badSet();
  c.innerHTML = EDIT.layout.widgets.map((w, i) => { const d = S.cat.widgets[w.type] || { name: w.type }; return `<div class="wb ${i === EDIT.sel ? 'sel' : ''} ${bad.has(i) ? 'bad' : ''}${w.type === 'qr' ? ' fl' : ''}" data-i="${i}" style="left:${w.x / 24 * 100}%;top:${w.y / 24 * 100}%;width:${w.w / 24 * 100}%;height:${w.h / 24 * 100}%"><span class="ic">${ICON[w.type] || '▢'}</span>${esc(d.name)}<small>${d.pro && !pro() ? '🔒 Pro' : w.type === 'qr' ? esc(((S.db.qrs || []).find(q => q.id === (w.props || {}).qr) || { label: 'Tümü' }).label) + ' · ' + w.w + '×' + w.h : w.w + '×' + w.h}</small><i class="rz"></i></div>`; }).join('');
}
function drawPal() {
  const used = new Set(EDIT.layout.widgets.map(w => w.type));
  const n = k => EDIT.layout.widgets.filter(w => w.type === k).length;
  $('pal').innerHTML = Object.entries(S.cat.widgets).map(([k, d]) => { const full = d.multi ? n(k) >= d.multi : used.has(k); return `<span class="chip ${full ? 'dim' : ''}" title="${esc(d.desc)}" onclick="addW('${k}')">${ICON[k] || ''} ${esc(d.name)}${d.pro && !pro() ? ' 🔒' : d.multi && n(k) ? ` ×${n(k)}` : used.has(k) ? ' ✓' : ''}</span>`; }).join('');
}
const HINT = { media: 'Videolar ve fotoğraflar <a href="#media">Medya</a> sayfasından. Kampanya kartı, büyük maç ve fragmanlar da bu kutuda çıkar.', info: 'Maçlar <a href="#sport">Spor</a>, diğer sayfalar <a href="#info">Bilgi Bandı</a> sayfasından açılıp kapanır.', reviews: 'Yorumlar <a href="#promo">Duyurular</a> sayfasından eklenir.', qr: 'QR kodlar <a href="#qr">QR Kodlar</a> sayfasından eklenir.', logo: 'Logo <a href="#design/colors">Renk ve logo</a> sekmesinden yüklenir.', menu: 'Ürünler <a href="#menu">Fiyat Listesi</a> sayfasından girilir.', ticker: 'Skorlar, kurlar, haberler ve bilgiler sırayla kayar.' };
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
  if (w.type === 'qr') { const qs = S.db.qrs || []; f = qs.length ? fl('Gösterilecek QR', `<select onchange="setP('qr',this.value);drawCanvas()"><option value="">Tümü (sırayla döner)</option>${qs.map(q => `<option value="${q.id}" ${p.qr === q.id ? 'selected' : ''}>${esc(q.label)}</option>`).join('')}</select>`) + (p.qr && qs.find(q => q.id === p.qr) ? `<div style="width:120px;background:#fff;border-radius:10px;padding:6px;margin-top:10px">${qs.find(q => q.id === p.qr).svg}</div>` : '') + '<p class="muted mt" style="font-size:12px">QR kartı diğer kutuların (ör. medyanın) üstüne konabilir. Birden çok QR kartı ekleyip her birine ayrı QR seçebilirsiniz.</p>' : '<p class="muted mt">Henüz QR kod yok</p>'; }
  if (w.type === 'menu') f = fl('Başlık (boşsa fiyat listesinin başlığı)', `<input type="text" maxlength="40" value="${esc(p.title || '')}" onchange="setP('title',this.value)">`);
  // çoklu dil açıksa: başlık ve metnin çevirileri
  const LL = langList();
  if (LL.length && (w.type === 'text' || w.type === 'menu')) f += `<div class="mt"><b style="font-size:13px">Çeviriler</b>${LL.map(l => fl(LANG_NAMES[l] + ' başlık', `<input type="text" maxlength="200" value="${esc(((p.i18n || {})[l] || {}).title || '')}" onchange="setPI('${l}','title',this.value)">`) + (w.type === 'text' ? fl(LANG_NAMES[l] + ' metin', `<textarea maxlength="400" onchange="setPI('${l}','body',this.value)">${esc(((p.i18n || {})[l] || {}).body || '')}</textarea>`) : '')).join('')}</div>`;
  box.innerHTML = `<h4>${ICON[w.type] || ''} ${esc(d.name)}</h4><p class="muted">${esc(d.desc || '')}${HINT[w.type] ? '<br><br>' + HINT[w.type] : ''}</p>${f}<div class="row mt"><button class="btn d s" onclick="rmW(${EDIT.sel})">Kaldır</button></div>`;
}
function snap() { EDIT.hist.push(clone(EDIT.layout)); if (EDIT.hist.length > 40) EDIT.hist.shift(); EDIT.dirty = true; }
function undoL() { if (!EDIT.hist.length) return toast('Geri alınacak değişiklik yok'); EDIT.layout = EDIT.hist.pop(); EDIT.sel = -1; drawCanvas(); drawProps(); drawPal(); }
function setPI(l, k, v) { const w = EDIT.layout.widgets[EDIT.sel]; if (!w) return; snap(); const i = clone((w.props || {}).i18n || {}); i[l] = { ...(i[l] || {}), [k]: v }; w.props = { ...(w.props || {}), i18n: i }; }
function setP(k, v) { const w = EDIT.layout.widgets[EDIT.sel]; if (!w) return; snap(); w.props = { ...(w.props || {}), [k]: v }; }
function rmW(i) { snap(); EDIT.layout.widgets.splice(i, 1); EDIT.sel = -1; drawCanvas(); drawProps(); drawPal(); }
function addW(type) {
  const d = S.cat.widgets[type];
  const cnt = EDIT.layout.widgets.filter(w => w.type === type).length;
  if (d.multi ? cnt >= d.multi : cnt) return toast(d.multi ? `En fazla ${d.multi} tane eklenebilir` : 'Bu widget düzende zaten var', true);
  if (d.pro && !pro()) toast('Bu widget Pro pakette; paketinizde ekranda görünmez', true);
  const [mw, mh] = d.min || [4, 3]; let spot = null;
  for (let y = 0; y <= 24 - mh && !spot; y++) for (let x = 0; x <= 24 - mw && !spot; x++) { const c = { x, y, w: mw, h: mh }; if (!EDIT.layout.widgets.some(w => overlap(w, c))) spot = c; }
  if (!spot && type === 'qr') { const m = EDIT.layout.widgets.find(w => w.type === 'media') || { x: 0, y: 0, w: 24, h: 24 }; const off = cnt * mw; spot = { x: Math.max(0, m.x + m.w - mw - 1 - off), y: Math.max(0, m.y + m.h - mh - 1), w: mw, h: mh }; if (EDIT.layout.widgets.some(w => w.type === 'qr' && overlap(w, spot))) spot = null; else spot.float = true; }
  snap();
  const pos = spot ? { x: spot.x, y: spot.y, w: spot.w, h: spot.h } : { x: 0, y: 0, w: mw, h: mh };
  EDIT.layout.widgets.push({ type, ...pos, ...(d.props ? { props: clone(d.props) } : {}) });
  EDIT.sel = EDIT.layout.widgets.length - 1; drawCanvas(); drawProps(); drawPal();
  if (!spot) toast('Boş yer yok: kutu sol üste kondu, diğerlerini küçültüp yerleştirin', true);
  else if (spot.float) toast('QR kartı medyanın üstüne kondu; sürükleyip istediğiniz yere taşıyın');
}
async function applyStarter(k) {
  const v = (S.cat.starters || []).find(x => x.key === k); if (!v) return;
  if (!confirm(`"${v.name}" paketi uygulansın mı? Ekran düzeniniz ve renkleriniz değişir (medya, logo ve diğer ayarlar korunur).`)) return;
  const body = { key: k };
  if (v.menu && S.me && S.me.tenant && (S.me.tenant.menuCount || 0) > 0) body.replaceMenu = confirm('Mevcut fiyat listenizin yerine örnek liste konsun mu?\n\nTamam: örnek liste gelir (eski liste silinir)\nİptal: fiyat listeniz korunur');
  if (await act('POST', '/starter', body, 'Paket uygulandı', false)) { S.me = await req('GET', '/me'); drawBrand(); refresh(); }
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
async function resetDesign(sub) {
  const what = { layout: 'Düzen (widget yerleşimi ve ayarları)', colors: 'Renkler ve yazı tipi (logonuz kalır)', tv: 'TV ayarları (kenar payı, efekt)' }[sub];
  if (!confirm(what + ' varsayılana döndürülsün mü? Bu işlem geri alınamaz.')) return;
  if (await act('POST', '/design/reset', { scope: sub }, 'Varsayılana döndürüldü, TV güncellendi', false)) {
    [S.me, S.db, S.scr] = await Promise.all([req('GET', '/me'), req('GET', '/db'), req('GET', '/screen')]);
    EDIT.dirty = false; EDIT.layout = null; drawBrand(); render(true);
  }
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
    if (SUB.media === 'posters') return head('Medya', 'Ekranda sırayla oynayan video, fotoğraf ve hazır afişler.') + tabs('media', [['files', 'Medya ve sıra'], ['posters', 'Hazır içerikler']]) + postersHtml();
    return head('Medya', 'Ekranda sırayla oynayan video, fotoğraf ve hazır afişler. Sürükleyerek sıralayın; ⏱ ile gün ve saat verin.') + tabs('media', [['files', 'Medya ve sıra'], ['posters', 'Hazır içerikler']])
      + card('Dosya ekle', 'Video (MP4, MOV…) ya da fotoğraf (JPG, PNG). Yüklenen dosyalar TV için otomatik küçültülür; hazır olunca ekrana girer.',
        `<div id="drop" onclick="$('files').click()"><b>Dosyaları buraya bırakın ya da tıklayın</b><span class="muted">Birden fazla dosya seçebilirsiniz</span></div><input type="file" id="files" multiple accept="video/*,image/*" hidden onchange="upFiles(this.files)"><div id="ups"></div>`)
      + card(`Gösterim sırası <span class="muted">· ${v.length} dosya</span>`, '', v.length ? `<div class="mgrid" id="mgrid">${v.map((x, i) => `<div class="tile" draggable="true" data-id="${x.id}">
          <div class="th ${x.hidden ? 'off' : ''}" onclick="${x.type === 'poster' ? `editPoster('${x.id}')` : `pvMedia(${i})`}">${thumb(x)}<span class="no">${i + 1}</span><span class="ty">${TYPE_NAMES[x.type] || 'Video'}</span>${x.sch ? `<span class="sch" title="${esc(schText(x.sch))}">⏱ ${esc(schShort(x.sch))}</span>` : ''}${x.hidden ? '<span class="hid">Gizli</span>' : ''}${x.status === 'processing' ? '<div class="proc">Hazırlanıyor…</div>' : ''}</div>
          <div class="m"><span title="${esc(x.name)}">${esc(x.name)}</span><button class="btn xs g" onclick="mvMedia('${x.id}','up')" title="Öne al">←</button><button class="btn xs g" onclick="mvMedia('${x.id}','down')" title="Sona al">→</button><button class="btn xs g" onclick="openSched('video','${x.id}')" title="Zamanla">⏱</button><button class="btn xs g" onclick="togHide('${x.id}')" title="${x.hidden ? 'Göster' : 'Gizle'}">${x.hidden ? '◌' : '●'}</button><button class="btn xs d" onclick="delMedia('${x.id}')" title="Sil">✕</button></div></div>`).join('')}</div>`
        : '<div class="empty">Henüz dosya yok. Yukarıdan ekleyin.</div>')
      + `<div class="grid g2">` + card('Fotoğraf süresi', 'Her fotoğraf ekranda kaç saniye kalsın.', `<div class="row"><input type="number" id="imgsec" min="3" max="120" value="${S.db.imageSeconds}" style="max-width:120px"><span class="muted">saniye</span><span style="flex:1"></span><button class="btn" onclick="act('PUT','/settings',{imageSeconds:+$('imgsec').value},'Kaydedildi')">Kaydet</button></div>`)
      + card('Depolama', '', `<div id="stor" class="muted">Hesaplanıyor…</div>`) + `</div>`;
  },
  async after() {
    if (SUB.media === 'posters') return drawPosterGallery();
    drawThumbs();
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
const togHide = id => { const v = S.db.videos.find(x => x.id === id); act('PUT', '/videos/' + id, { hidden: !v.hidden }, v.hidden ? 'Ekranda gösteriliyor' : 'Gizlendi; ekranda oynamaz'); };
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
      + langCard()
      + `<div id="mcats"></div><div class="row" style="margin-bottom:18px"><button class="btn g" onclick="addCat()">＋ Kategori ekle</button><span style="flex:1"></span><button class="btn" onclick="saveMenu()">Kaydet</button></div>`
      + card('Toplu ekle', 'Her satıra bir ürün: <code>Ürün ; fiyat ; açıklama</code>. Kategori satırı <code>#</code> ile başlar. Örnek: <code># Sıcak İçecekler</code> · <code>Türk Kahvesi ; 90</code>',
        `<div class="row" style="margin-bottom:10px"><button class="btn g" onclick="menuTemplate()">⬇ Excel şablonunu indir</button><button class="btn g" onclick="$('mfile').click()">⬆ Doldurduğum dosyayı yükle</button><input id="mfile" type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" style="display:none" onchange="menuFile(this)"></div><div class="muted" style="font-size:13px;margin-bottom:10px">Şablonu indirin, Excel'de ürünlerinizle doldurun, <b>CSV (virgülle/noktalı virgülle ayrılmış)</b> olarak kaydedip buraya yükleyin. Dosyadaki liste aşağıya yazılır; kontrol edip "Listeye ekle" ya da "Listeyi bununla değiştir"e basın.</div><textarea id="mbulk" rows="6" placeholder="# Sıcak İçecekler&#10;Türk Kahvesi ; 90&#10;Latte ; 120 ; Yulaf sütüyle +15"></textarea><div class="row mt"><button class="btn g" onclick="bulk(false)">Listeye ekle</button><button class="btn d" onclick="bulk(true)">Listeyi bununla değiştir</button></div>`);
  },
  after() { drawMenu(); },
};
function drawMenu() {
  const c = MENU.categories;
  $('mcats').innerHTML = c.length ? c.map((cat, ci) => `<div class="mcat"><div class="chd"><input type="text" value="${esc(cat.name)}" placeholder="Kategori adı" maxlength="40" oninput="MENU.categories[${ci}].name=this.value;MENU.__dirty=1" style="font-weight:700">
      <button class="btn xs g" onclick="mE(()=>mv(MENU.categories,${ci},-1))">↑</button><button class="btn xs g" onclick="mE(()=>mv(MENU.categories,${ci},1))">↓</button><button class="btn xs g" onclick="openSched('cat',${ci})" title="Bu kategori hangi gün ve saatlerde görünsün">⏱ ${cat.sch ? esc(schShort(cat.sch)) : 'Her zaman'}</button><button class="btn xs d" onclick="if(confirm('Kategori silinsin mi?'))mE(()=>MENU.categories.splice(${ci},1))">Sil</button></div>
      ${langList().length ? `<div class="mtr">${langList().map(l => `<input type="text" placeholder="${LANG_NAMES[l]} kategori adı" maxlength="40" value="${esc((cat.t || {})[l] || '')}" oninput="mT(${ci},-1,'${l}','name',this.value)">`).join('')}</div>` : ''}
      ${cat.items.map((it, ii) => `<div class="mrow"><input type="text" value="${esc(it.name)}" placeholder="Ürün" maxlength="60" oninput="MENU.categories[${ci}].items[${ii}].name=this.value;MENU.__dirty=1"><input class="md" type="text" value="${esc(it.desc || '')}" placeholder="Açıklama (isteğe bağlı)" maxlength="90" oninput="MENU.categories[${ci}].items[${ii}].desc=this.value;MENU.__dirty=1"><input type="text" value="${esc(it.price)}" placeholder="Fiyat" maxlength="16" oninput="MENU.categories[${ci}].items[${ii}].price=this.value;MENU.__dirty=1"><span class="row" style="gap:4px;flex-wrap:nowrap"><button class="btn xs g" title="${it.kcal ? 'Kaloriyi kaldır' : 'Ürün adından kalori bilgisini getir'}" onclick="kcalBtn(${ci},${ii})">${it.kcal ? '🔥 ' + esc(it.kcal) + ' ✕' : '🔥'}</button><button class="btn xs ${it.off ? 'd' : 'g'}" title="Tükendi olarak işaretle" onclick="mE(()=>{const x=MENU.categories[${ci}].items[${ii}];x.off=!x.off})">${it.off ? 'Tükendi' : 'Var'}</button><button class="btn xs g" onclick="mE(()=>mv(MENU.categories[${ci}].items,${ii},-1))">↑</button><button class="btn xs d" onclick="mE(()=>MENU.categories[${ci}].items.splice(${ii},1))">✕</button></span></div>
      ${langList().length ? `<div class="mtr">${langList().map(l => `<input type="text" placeholder="${LANG_NAMES[l]}: ${esc(it.name || 'ürün adı')}" maxlength="60" value="${esc(((it.t || {})[l] || {}).name || '')}" oninput="mT(${ci},${ii},'${l}','name',this.value)"><input class="md" type="text" placeholder="${LANG_NAMES[l]} açıklama" maxlength="90" value="${esc(((it.t || {})[l] || {}).desc || '')}" oninput="mT(${ci},${ii},'${l}','desc',this.value)">`).join('')}</div>` : ''}`).join('')}
      <button class="btn xs g" onclick="mE(()=>MENU.categories[${ci}].items.push({name:'',price:'',desc:''}))">＋ Ürün</button></div>`).join('')
    : '<div class="empty" style="margin-bottom:14px">Henüz kategori yok. "Kategori ekle" ile başlayın ya da aşağıdan toplu yapıştırın.</div>';
}
// çeviri alanı: ii = -1 kategori adı
function mT(ci, ii, l, k, v) {
  const c = MENU.categories[ci]; MENU.__dirty = 1;
  if (ii < 0) { c.t = { ...(c.t || {}), [l]: v }; return; }
  const it = c.items[ii]; it.t = { ...(it.t || {}) }; it.t[l] = { ...(it.t[l] || {}), [k]: v };
}
async function kcalBtn(ci, ii) {
  const it = MENU.categories[ci].items[ii];
  if (it.kcal) { mE(() => { delete it.kcal; }); return; }
  if (!it.name.trim()) return toast('Önce ürün adını yazın', true);
  try { const j = await req('POST', '/calories', { query: it.name }); if (!j.ok) return toast(j.error, true); mE(() => { it.kcal = j.kcal; }); toast(`${j.name}: ${j.kcal}`); }
  catch (e) { toast(e.message, true); }
}
const mv = (a, i, d) => { const j = i + d; if (j >= 0 && j < a.length) [a[i], a[j]] = [a[j], a[i]]; };
const mE = fn => { fn(); MENU.__dirty = 1; drawMenu(); };
const addCat = () => mE(() => MENU.categories.push({ name: '', items: [{ name: '', price: '', desc: '' }] }));
async function saveMenu() { const body = clone(MENU); delete body.__dirty; if (await act('PUT', '/menu', body, 'Fiyat listesi kaydedildi', false)) { MENU.__dirty = 0; S.db = await req('GET', '/db'); } }
// ---- Excel/CSV şablonu: indir, doldur, yükle ----
const TEMPLATE_ROWS = [['Kategori', 'Ürün', 'Fiyat', 'Açıklama'],
  ['Sıcak İçecekler', 'Türk Kahvesi', '90', 'Közde, lokum ile'], ['Sıcak İçecekler', 'Latte', '120', 'Yulaf sütüyle +15'], ['Sıcak İçecekler', 'Filtre Kahve', '95', ''],
  ['Soğuk İçecekler', 'Limonata', '85', 'Taze nane ile'], ['Soğuk İçecekler', 'Buzlu Çay', '75', 'Şeftali ya da limon'],
  ['Tatlılar', 'San Sebastian Cheesecake', '165', 'Ev yapımı'], ['Tatlılar', 'Sufle', '150', 'Sıcak çikolata, dondurma ile'],
  ['Kahvaltı', 'Serpme Kahvaltı (2 kişilik)', '450', 'Sınırsız çay']];
function menuTemplate() {
  const csv = '\ufeff' + TEMPLATE_ROWS.map(r => r.map(c => /[;"\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c).join(';')).join('\r\n') + '\r\n';
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'fiyat-listesi-sablon.csv';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function parseCsv(text) { // ayraç (; , sekme) otomatik bulunur; tırnaklı alanlar desteklenir
  text = text.replace(/^\ufeff/, '');
  const first = text.split(/\r?\n/)[0] || '', cnt = c => first.split(c).length;
  const sep = [';', '\t', ','].sort((a, b) => cnt(b) - cnt(a))[0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(x => x.trim())).filter(r => r.some(Boolean));
}
async function menuFile(inp) {
  const f = inp.files[0]; inp.value = ''; if (!f) return;
  const buf = await f.arrayBuffer();
  let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder('windows-1254').decode(buf); } // eski Excel "CSV" kaydı
  if (/^PK/.test(text.slice(0, 2))) return toast('Bu bir .xlsx dosyası: Excel\'de "Farklı kaydet" → "CSV" seçip yükleyin', true);
  let rows = parseCsv(text);
  if (rows.length && /^kategori/i.test(rows[0][0] || '') ) rows = rows.slice(1);
  let cur = '', out = [], n = 0;
  for (const [cat = '', name = '', price = '', desc = ''] of rows) {
    if (!name) continue;
    if (cat && cat !== cur) { cur = cat; out.push('# ' + cat); } else if (!out.length) out.push('# Ürünler');
    out.push([name, price, desc].map(x => x.replace(/[;\t|]/g, ',')).join(' ; ').replace(/( ; )+$/, '')); n++;
  }
  if (!n) return toast('Dosyada ürün bulunamadı', true);
  $('mbulk').value = out.join('\n');
  toast(`Dosya okundu: ${n} ürün. Kontrol edip "Listeye ekle" ya da "Listeyi bununla değiştir"e basın`);
}
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
        `<div class="fl"><span>Tasarım</span><div class="chips">${[['klasik', 'Klasik'], ['uyum', 'Klasik (ekrana uyumlu)'], ['yan', 'Karşı karşıya'], ['sade', 'Sade'], ['skor', 'Skorbord']].map(([k, l]) => `<span class="chip ${(bc.style || 'klasik') === k ? 'on' : ''}" onclick="bigStyle('${k}')">${l}</span>`).join('')}</div></div>
         <div class="f mt">${fl('Alt not', `<input type="text" id="bg-note" maxlength="140" value="${esc(bc.note)}">`)}${fl('Kaç gün önceden', `<input type="number" id="bg-days" min="1" max="7" value="${bc.days}">`)}${fl('Kaç dakikada bir', `<input type="number" id="bg-every" min="2" max="60" value="${bc.everyMin}">`)}${fl('Kaç saniye kalsın', `<input type="number" id="bg-dur" min="5" max="60" value="${bc.durSec}">`)}</div>
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
      $('bglist').textContent = j.items.length ? 'Yaklaşan: ' + j.items.map(m => `${m.home} – ${m.away} (${new Date(m.ts).toLocaleDateString(I18N.locale, { day: 'numeric', month: 'short' })})`).join(', ') : 'Şu an duyurulacak büyük maç yok.';
    } catch (e) {}
  },
};
const testGoal = () => act('POST', '/goal/test', undefined, 'Gol animasyonu gönderildi', false);
async function saveLeagues() { const enabled = [...document.querySelectorAll('[data-code].on')].map(x => x.dataset.code); if (await act('PUT', '/leagues', { enabled }, 'Ligler kaydedildi', false)) { S.lg = await req('GET', '/leagues'); render(true); } }
async function togTable(c) { const h = S.lg.hideTables || []; S.lg.hideTables = h.includes(c) ? h.filter(x => x !== c) : [...h, c]; await act('PUT', '/options', { hideTables: S.lg.hideTables }, 'Kaydedildi', false); render(true); }
const bigStyle = async k => { if (await act('PUT', '/bigmatch', { style: k }, 'Tasarım seçildi', false)) { S.db.bigMatch = Object.assign({}, S.db.bigMatch, { style: k }); render(true); } };
const saveBig = () => act('PUT', '/bigmatch', { note: $('bg-note').value, days: $('bg-days').value, everyMin: $('bg-every').value, durSec: $('bg-dur').value, info: [0, 1, 2].map(i => $('bg-i' + i).value) }, 'Kaydedildi');
async function upBigPhoto(inp) { const f = inp.files[0]; if (!f) return; const fd = new FormData(); fd.append('team', $('bg-team').value.trim()); fd.append('file', f); try { await req('POST', '/bigmatch/photo', fd); toast('Fotoğraf yüklendi'); refresh(); } catch (e) { toast(e.message, true); } }
async function addMatch() { const b = { home: $('mm-h').value.trim(), away: $('mm-a').value.trim(), time: $('mm-t').value, league: $('mm-l').value.trim(), channel: $('mm-c').value.trim() }; if (!b.home || !b.away || !b.time) return toast('Takımlar ve saat gerekli', true); act('POST', '/matches', b, 'Maç eklendi'); }

/* ================= DUYURULAR ================= */
SECTIONS.promo = {
  after() { if ($('ig-st')) drawInsta(); },
  html() {
    const db = S.db;
    return head('Duyurular', 'Kampanya kartı ve müşteri yorumları.')
      + (db.campaigns || []).map(c => card('🎁 Kampanya kartı', 'Belirli aralıklarla medya yerine tam sayfa, QR kodlu bir kart çıkar. Örnek: Google yorumu karşılığı ikram.',
        `<div class="f">${fl('Bağlantı (QR kodu buraya gider)', `<input type="text" id="c-url" value="${esc(c.url)}" placeholder="https://g.page/r/.../review">`)}${fl('Başlık', `<input type="text" id="c-h" maxlength="90" value="${esc(c.headline)}">`)}</div>
         <div class="f mt">${fl('Alt yazı', `<input type="text" id="c-s" maxlength="140" value="${esc(c.sub)}">`)}${fl('Not', `<input type="text" id="c-n" maxlength="160" value="${esc(c.note || '')}">`)}${fl('QR altındaki yazı', `<input type="text" id="c-q" maxlength="60" value="${esc(c.qrLabel || '')}">`)}</div>
         <div class="f mt">${fl('Kaç dakikada bir', `<input type="number" id="c-e" min="1" max="60" value="${c.everyMin}">`)}${fl('Kaç saniye kalsın', `<input type="number" id="c-d" min="8" max="60" value="${c.durSec}">`)}</div>
         <div class="row end mt"><button class="btn g s" onclick="openSched('camp','${c.id}')">⏱ ${c.sch ? esc(schShort(c.sch)) : 'Zamanla'}</button><button class="btn g s" onclick="act('POST','/campaigns/${c.id}/test',undefined,'Kart TV\\'de gösteriliyor',false)">Şimdi göster</button><button class="btn" onclick="saveCamp('${c.id}')">Kaydet</button></div>`,
        sw(c.enabled, `campToggle('${c.id}',this)`))).join('')
      + lock('Google yorumları ve Instagram')
      + googleCard() + instaCard()
      + card('★ Elle eklenen yorumlar', 'Medyanın altındaki şeritte döner (düzende "Google yorumları" widget\'ı olmalı). Yalnız 4 ve 5 yıldız.',
        `${(db.reviews || []).length ? `<div class="list">${db.reviews.map(r => `<div class="it"><div class="b"><b>${esc(r.author)} <span class="stars">${'★'.repeat(r.rating)}</span></b><span>${esc(r.text)}</span></div><button class="btn xs d" onclick="act('DELETE','/reviews/${r.id}',undefined,'Silindi')">Sil</button></div>`).join('')}</div>` : '<div class="empty">Henüz yorum yok</div>'}
         <hr class="sep2"><div class="f">${fl('Yorumcu adı', '<input type="text" id="r-a" maxlength="60">')}${fl('Puan', '<select id="r-r"><option value="5">★★★★★</option><option value="4">★★★★</option></select>')}</div>
         ${fl('Yorum (Google\'dan kopyalayıp yapıştırın)', '<textarea id="r-t" maxlength="400" rows="3"></textarea>')}<div class="row end mt"><button class="btn" onclick="addReview()">Yorum ekle</button></div>`);
  },
};
// "Her zaman üstte" kapalıyken QR'ın gizlenebileceği içerikler (TV'de qrCtx ile aynı anahtarlar)
const QR_HIDE = [['video', 'Videolar'], ['image', 'Fotoğraflar'], ['poster', 'Afişler / kitaplar'], ['trailer', 'Film fragmanı'], ['camp', 'Kampanya kartı'], ['big', 'Büyük maç kartı'], ['goal', 'Gol bildirimi']];
let qrEditId = null;
SECTIONS.qr = {
  html() {
    const db = S.db;
    const item = q => `<div class="qi"><div class="it"><div class="qr">${q.svg}</div><div class="b"><b>${esc(q.label)}</b><span>${q.kind === 'wifi' ? 'Wi-Fi' : esc(q.text)}</span></div>
        <span class="chip ${q.pin !== false ? 'on' : ''}" onclick="qrPin('${q.id}',${q.pin === false})">📌 Her zaman üstte</span>
        <button class="btn xs" onclick="qrEdit('${q.id}')">Düzenle</button><button class="btn xs d" onclick="act('DELETE','/qrs/${q.id}',undefined,'Silindi')">Sil</button></div>
        ${q.pin === false ? `<div class="qh"><span class="muted">Şu içeriklerde gizle:</span><div class="chips">${QR_HIDE.map(([k, l]) => `<span class="chip ${(q.hide || []).includes(k) ? 'on' : ''}" onclick="qrHide('${q.id}','${k}')">${l}</span>`).join('')}</div></div>` : ''}</div>`;
    return head('QR Kodlar', 'QR kodlarınız Tasarım → Ekran düzeni\'ndeki "QR kart" widget\'ı ile gösterilir; her karta ayrı QR seçebilirsiniz.')
      + card('▣ QR kodlar', '"Her zaman üstte" açıkken QR kart ekranda sürekli en üstte durur; kapalıyken seçtiğiniz içeriklerde (video, fotoğraf…) gizlenir.',
        `${(db.qrs || []).length ? `<div class="list">${db.qrs.map(item).join('')}</div>` : '<div class="empty">Henüz QR kod yok</div>'}
         <hr class="sep2"><div id="q-mode" class="muted" style="font-weight:700;margin-bottom:8px">Yeni QR ekle</div>
         <div class="f">${fl('Tür', `<select id="q-kind" onchange="$('q-link').hidden=this.value==='wifi';$('q-wifi').hidden=this.value!=='wifi';if(this.value==='wifi'&&!$('q-label').value)$('q-label').placeholder='Wi-Fi Şifresi';qrPrev()"><option value="link">Bağlantı / metin</option><option value="wifi">Wi-Fi</option></select>`)}${fl('Etiket (QR altında)', '<input type="text" id="q-label" maxlength="40" placeholder="örn. Menü için okutun">')}</div>
         <div class="f mt" id="q-link">${fl('Bağlantı', '<input type="text" id="q-text" placeholder="https://instagram.com/..." oninput="qrPrev()">')}</div>
         <div class="f mt" id="q-wifi" hidden>${fl('Ağ adı (SSID)', '<input type="text" id="q-ssid" oninput="qrPrev()">')}${fl('Şifre', '<input type="text" id="q-pass" oninput="qrPrev()">')}${fl('Güvenlik', '<select id="q-sec" onchange="qrPrev()"><option value="WPA">WPA/WPA2</option><option value="WEP">WEP</option><option value="nopass">Şifresiz</option></select>')}</div>
         <div class="row mt" style="align-items:center"><div id="q-prev" class="qprev"><span class="muted">QR, bilgileri yazdıkça burada oluşur</span></div><span style="flex:1"></span><button class="btn g" id="q-cancel" onclick="qrCancel()" hidden>Vazgeç</button><button class="btn" id="q-save" onclick="addQr()">QR ekle</button></div>
         <hr class="sep2"><div class="f">${fl(`QR boyutu (QR kartları): <b id="qsv">${db.qrSize || 17}</b>`, `<input type="range" min="10" max="30" value="${db.qrSize || 17}" oninput="$('qsv').textContent=this.value" onchange="opt('qrSize',+this.value)">`)}${fl('Wi-Fi şifre yazısı (boşsa QR\'daki şifre)', `<input type="text" maxlength="120" value="${esc(db.wifiText || '')}" onchange="opt('wifiText',this.value)">`)}</div>`);
  },
};
const qrPin = (id, v) => act('PATCH', '/qrs/' + id, { pin: v }, 'Kaydedildi');
function qrHide(id, k) {
  const q = (S.db.qrs || []).find(x => x.id === id); if (!q) return;
  const h = new Set(q.hide || []); h.has(k) ? h.delete(k) : h.add(k);
  act('PATCH', '/qrs/' + id, { hide: [...h] }, 'Kaydedildi');
}
// Wi-Fi QR metninden (WIFI:T:WPA;S:ad;P:şifre;;) alanları geri okur
function wifiParse(t) {
  const g = k => { const m = new RegExp(k + ':((?:\\\\.|[^;])*);').exec(t || ''); return m ? m[1].replace(/\\(.)/g, '$1') : ''; };
  return { ssid: g('S'), password: g('P'), security: g('T') || 'WPA' };
}
function qrEdit(id) {
  const q = (S.db.qrs || []).find(x => x.id === id); if (!q) return;
  qrEditId = id;
  $('q-kind').value = q.kind === 'wifi' ? 'wifi' : 'link';
  $('q-link').hidden = q.kind === 'wifi'; $('q-wifi').hidden = q.kind !== 'wifi';
  $('q-label').value = q.label || '';
  if (q.kind === 'wifi') { const w = wifiParse(q.text); $('q-ssid').value = w.ssid; $('q-pass').value = w.password; $('q-sec').value = w.security; } else $('q-text').value = q.text || '';
  $('q-mode').textContent = 'QR düzenleniyor: ' + (q.label || ''); $('q-save').textContent = 'Kaydet'; $('q-cancel').hidden = false;
  qrPrev(); $('q-mode').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('q-label').focus();
}
const qrCancel = () => { qrEditId = null; render(true); };
const saveCamp = id => act('PUT', '/campaigns/' + id, { url: $('c-url').value, headline: $('c-h').value, sub: $('c-s').value, note: $('c-n').value, qrLabel: $('c-q').value, everyMin: $('c-e').value, durSec: $('c-d').value }, 'Kampanya kaydedildi');
async function campToggle(id, el) { const url = $('c-url').value.trim(); const ok = await act('PUT', '/campaigns/' + id, { url, enabled: el.checked }, el.checked ? 'Kampanya açıldı' : 'Kampanya kapatıldı'); if (!ok) el.checked = !el.checked; }
// yazarken canlı QR önizlemesi (kaydetmeden üretilir)
let qrPrevT = 0;
function qrPrev() {
  clearTimeout(qrPrevT);
  qrPrevT = setTimeout(async () => {
    const box = $('q-prev'); if (!box) return;
    const kind = $('q-kind').value, b = { kind };
    if (kind === 'wifi') Object.assign(b, { ssid: $('q-ssid').value.trim(), password: $('q-pass').value, security: $('q-sec').value }); else b.text = $('q-text').value.trim();
    if (kind === 'wifi' ? !b.ssid : !b.text) { box.innerHTML = `<span class="muted">${kind === 'wifi' ? 'Ağ adını ve şifreyi yazın, QR burada oluşur' : 'Bağlantıyı yazın, QR burada oluşur'}</span>`; return; }
    try { const j = await req('POST', '/qrs/preview', b); if ($('q-prev')) $('q-prev').innerHTML = `<div class="qr">${j.svg}</div><span class="muted">Önizleme · kaydetmek için “QR ekle”</span>`; } catch (e) { box.innerHTML = `<span class="muted">${esc(e.message)}</span>`; }
  }, 350);
}
function addQr() {
  const kind = $('q-kind').value, b = { kind, label: $('q-label').value.trim() };
  if (kind === 'wifi') Object.assign(b, { ssid: $('q-ssid').value.trim(), password: $('q-pass').value, security: $('q-sec').value }); else b.text = $('q-text').value.trim();
  if (qrEditId) { const id = qrEditId; qrEditId = null; act('PATCH', '/qrs/' + id, b, 'QR kaydedildi'); } else act('POST', '/qrs', b, 'QR kod eklendi');
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
         <label class="ckl mt"><input type="checkbox" id="b-ok"> Bu kişi adının ekranda gösterilmesine izin verdi (KVKK)</label>
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
async function addBday() { if (!$('b-ok').checked) return toast('Kişinin adının ekranda gösterilmesine izin verdiğini onaylayın', true); if (await act('POST', '/birthdays', { name: $('b-n').value.trim(), text: $('b-t').value.trim() }, 'Kişi eklendi')) {} }
async function saveTimes() { if (await act('PUT', '/schedule', { times: TIMES, duration: $('b-dur').value }, 'Saatler kaydedildi', false)) { S.db = await req('GET', '/db'); TIMES = null; render(true); } }
async function upCeleb(day, inp) { const f = inp.files[0]; if (!f) return; const fd = new FormData(); fd.append('day', day); fd.append('file', f); try { await req('POST', '/celebrate/photos', fd); toast('Fotoğraf eklendi'); render(true); } catch (e) { toast(e.message, true); } }

/* ================= BİLGİ BANDI ================= */
SECTIONS.info = {
  html() {
    const db = S.db, ph = db.pharmacy || {}, nw = db.news || {}, mv = db.movies || {}, bk = db.breaking || {};
    const ist = /istanbul|İstanbul/i.test((db.location || {}).city || '');
    const row = (title, desc, on, js, extra = '') => `<div class="swr" style="flex-wrap:wrap"><div class="b"><b>${title}</b><span>${desc}</span></div>${sw(on, js)}${extra ? `<div style="flex-basis:100%;${on ? '' : 'opacity:.45;pointer-events:none'}">${extra}</div>` : ''}</div>`;
    return head('Bilgi Bandı', '"Maçlar ve bilgi sayfaları" widget\'ında sırayla dönen ve kayan bantta akan bilgiler. Maç yokken ekranı canlı tutar.')
      + lock('Bilgi bandı')
      + card('Sayfalar', 'Açtıklarınız sırayla gösterilir. Veriler otomatik yenilenir; anahtar ya da ayar gerekmez.',
        row('🚨 Son dakika', 'TRT Haber son dakika başlıkları; haberler sayfasından ayrı olarak alt bantta ve yeni haber gelince ekranda bildirim bandıyla çıkar', bk.enabled !== false, "act('PUT','/breaking',{enabled:this.checked},'Kaydedildi')",
          `<div class="swr"><div class="b"><b>Ekranda bildirim bandı</b><span>Yeni son dakika gelince birkaç saniye üstte kırmızı bantla gösterilir</span></div>${sw(bk.banner !== false, "act('PUT','/breaking',{banner:this.checked},'Kaydedildi',false)")}</div>`)
        + row('📰 Haberler', 'Türkiye gündeminden son dakika başlıkları (TRT, AA, NTV)', nw.enabled !== false, "act('PUT','/news',{enabled:this.checked},'Kaydedildi')",
          `<div class="f mt">${fl('Kategori', `<select onchange="act('PUT','/news',{tag:this.value},'Kaydedildi')">${[['mix', 'Son dakika · TRT + AA + NTV'], ['trt', 'Son dakika · TRT Haber'], ['aa', 'Son dakika · Anadolu Ajansı'], ['ntv', 'Gündem · NTV'], ['general', 'Genel'], ['economy', 'Ekonomi'], ['sport', 'Spor'], ['technology', 'Teknoloji']].map(([v, l]) => `<option value="${v}" ${(nw.tag || 'mix') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}</div>`)
        + row('💊 Nöbetçi eczaneler', 'Seçtiğiniz ilçelerin bugünkü nöbetçi eczaneleri', ph.enabled !== false, "act('PUT','/pharmacy',{enabled:this.checked},'Kaydedildi')",
          `<div class="f mt">${fl('İl', `<input type="text" id="ph-il" value="${esc(ph.il || 'İstanbul')}">`)}${fl('İlçe(ler), virgülle (en fazla 2)', `<input type="text" id="ph-d" value="${esc((ph.districts || []).join(', '))}" placeholder="örn. Kadıköy, Üsküdar">`)}</div><div class="row end mt"><span id="ph-res" class="muted" style="flex:1"></span><button class="btn g s" onclick="testPharm()">Dene</button><button class="btn s" onclick="savePharm()">Kaydet</button></div>`)
        + row('🎬 Bu hafta vizyona girenler', 'Bu hafta vizyona girecek filmler; fragmanlar arada medya yerine oynar', mv.enabled !== false, "act('PUT','/movies',{enabled:this.checked},'Kaydedildi')",
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
      + tabs('settings', [['business', 'İşletme'], ['devices', 'Cihazlar'], ['branches', 'Şubeler'], ['users', 'Kullanıcılar'], ['plan', 'Paket'], ['backup', 'Yedekler'], ['privacy', 'Verilerim']]);
    if (sub === 'business') {
      const loc = S.db.location || {};
      h += card('İşletme bilgileri', '', `<div class="f">${fl('İşletme adı', `<input type="text" id="s-name" maxlength="80" value="${esc(t.name)}">`)}${fl('Şehir / ilçe (hava durumu için)', `<input type="text" id="s-city" placeholder="örn. Kadıköy" autocomplete="off" oninput="geoSearch()"><button type="button" class="btn ghost sm" id="geo-me" style="margin-top:6px" onclick="geoLocate()">📍 Konumumu otomatik bul</button>`)}</div>
        <div class="geo" id="geo"></div><p class="muted mt">Şu anki konum: <b style="color:var(--text)">${esc(loc.city || '-')}</b>${loc.custom ? '' : ' (varsayılan)'}</p>
        <div class="row end mt"><button class="btn" onclick="saveProfile()">Kaydet</button></div>`);
    } else if (sub === 'devices') {
      const devs = S.scr.devices, lim = S.scr.limit;
      h += `<div class="grid g2" style="margin-bottom:18px">`
        + card('TV kutusunu bağla', 'Mekândaki Android kutu, HDMI dağıtıcıyla tüm TV\'lere aynı görüntüyü verir; tek kutu yeterli.',
          `<ol style="padding-left:20px;line-height:1.9;color:var(--soft);font-size:14px"><li><a href="/app.apk?name=${encodeURIComponent(S.me.tenant.name)}">Android uygulamasını (APK) indirin</a> ve kutuya kurun. Kutu yerine televizyona bağlı bir <b>Windows bilgisayar</b> kullanacaksanız <a href="/app.exe">Windows uygulamasını indirin</a>; televizyon ikinci ekransa yayın oraya açılır.</li><li>Uygulamayı açın. Ekranda giriş formu ve 6 haneli bir kod çıkar.</li><li>Kutuda kullanıcı adı ve şifrenizle giriş yapın, <b>ya da</b> kodu aşağıya yazın (TV'deki QR'ı telefonla okutursanız kendiliğinden dolar).</li></ol>
           <div class="row mt"><input type="text" id="pcode" class="code-in" inputmode="numeric" maxlength="7" placeholder="123 456" value="${window.__pair ? window.__pair.replace(/(\d{3})(\d{3})/, '$1 $2') : ''}"><button class="btn" onclick="pairTv()">Bağla</button></div>`)
        + card(`Bağlı cihazlar <span class="muted">· ${devs.length}/${lim}</span>`, 'Kutu değiştirirseniz eskisini buradan kaldırın.',
          devs.length ? `<div class="list">${devs.map(d => `<div class="it"><span class="dot ${d.online ? 'on' : ''}"></span><div class="b"><b>${esc(d.name || 'TV kutusu')}</b><span>${d.online ? 'Şu an bağlı' : 'Son görülme: ' + ago(d.last_seen)} · eklendi ${fmtDate(d.created)}</span></div><button class="btn xs g" onclick="renDev('${d.id}','${esc(d.name || '').replace(/'/g, '')}')">Adlandır</button><button class="btn xs d" onclick="delDev('${d.id}')">Kaldır</button></div>`).join('')}</div>
            <div class="row mt"><button class="btn g s" onclick="act('POST','/devices/reload',undefined,'Yenileme komutu gönderildi',false)">↻ Ekranı yenile</button></div>` : '<div class="empty">Henüz bağlı cihaz yok</div>')
        + `</div>` + `<div id="devstat"></div>`;
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
    } else if (sub === 'branches') {
      h += branchesHtml();
    } else if (sub === 'privacy') {
      h += privacyHtml();
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
      $('blist').innerHTML = bs.length ? bs.map(b => `<div class="it"><div class="b"><b>${new Date(b.time).toLocaleString(I18N.locale, { dateStyle: 'medium', timeStyle: 'short' })}</b><span>${esc(b.name.replace(/^db-|\.json$/g, '').split('-').pop())} · ${fmtSize(b.size)}</span></div><a class="btn xs g" href="/api/admin/backups/${encodeURIComponent(b.name)}/download">İndir</a>${owner() ? `<button class="btn xs g" onclick="restore('${b.name}')">Geri yükle</button>` : ''}</div>`).join('') : '<div class="empty">Henüz yedek yok</div>';
    }
    if (sub === 'devices') { drawDevStatus(); if ($('pcode').value) $('pcode').focus(); }
    if (sub === 'branches') drawBranches();
  },
};
let geoT;
// yazdıkça arar; ilk sonucu kendiliğinden seçer (başka bir sonuç isteniyorsa listeden tıklanır)
function geoSearch() {
  clearTimeout(geoT); GEO = null;
  geoT = setTimeout(async () => {
    const q = $('s-city').value.trim(); if (q.length < 2) { $('geo').innerHTML = ''; return; }
    try {
      const l = await req('GET', '/geo?q=' + encodeURIComponent(q)); window.__geo = l;
      if (!l.length) { $('geo').innerHTML = '<span class="muted">Sonuç yok</span>'; return; }
      GEO = l[0]; drawGeo(0);
    } catch (e) { $('geo').innerHTML = `<span class="muted">${esc(e.message)}</span>`; }
  }, 350);
}
function drawGeo(sel) {
  $('geo').innerHTML = window.__geo.map((x, i) => `<button type="button" class="${i === sel ? 'on' : ''}" onclick="pickGeo(${i})">${i === sel ? '✓ ' : ''}${esc(x.city)}${x.admin ? ' · ' + esc(x.admin) : ''}</button>`).join('');
}
// tarayıcının konum iznini ister, şehri kendisi bulur
function geoLocate() {
  if (!navigator.geolocation) return toast('Bu tarayıcı konum bulmayı desteklemiyor; şehri yazarak seçin', true);
  const b = $('geo-me'); b.disabled = true; b.textContent = 'Konum aranıyor…';
  const done = () => { b.disabled = false; b.textContent = '📍 Konumumu otomatik bul'; };
  navigator.geolocation.getCurrentPosition(async pos => {
    try {
      const x = await req('GET', `/geo/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
      window.__geo = [x]; GEO = x; $('s-city').value = x.city + (x.admin ? ', ' + x.admin : ''); drawGeo(0);
    } catch (e) { toast(e.message, true); }
    done();
  }, err => { done(); toast(err.code === 1 ? 'Konum izni verilmedi; şehri yazarak seçebilirsiniz' : 'Konum alınamadı; şehri yazarak seçebilirsiniz', true); }, { timeout: 10000, maximumAge: 600000 });
}
function pickGeo(i) { GEO = window.__geo[i]; drawGeo(i); }
async function saveProfile() {
  const body = { name: $('s-name').value.trim() };
  // yazıp hemen kaydedilirse arama bitmemiş olabilir; ilk sonucu burada çöz
  const q = $('s-city').value.trim();
  if (!GEO && q.length >= 2) {
    try { const l = await req('GET', '/geo?q=' + encodeURIComponent(q)); if (l[0]) GEO = l[0]; else return toast('Şehir bulunamadı, yazımı kontrol edin', true); }
    catch (e) { return toast(e.message, true); }
  }
  if (GEO) body.location = { city: GEO.city, lat: GEO.lat, lon: GEO.lon };
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

/* ================= ZAMANLAMA ================= */
const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const TYPE_NAMES = { video: 'Video', image: 'Fotoğraf', poster: 'Afiş' };
const fmtD = d => d ? new Date(d + 'T12:00').toLocaleDateString(I18N.locale, { day: 'numeric', month: 'short' }) : '';
function daysText(d) {
  if (!d || !d.length) return '';
  const k = d.join();
  if (k === '1,2,3,4,5') return 'Hafta içi'; if (k === '6,7') return 'Hafta sonu';
  return d.map(x => DAYS[x - 1]).join(', ');
}
function schShort(s) { if (!s) return ''; return [daysText(s.days), s.from ? `${s.from}–${s.to}` : '', s.end && !s.from && !s.days ? fmtD(s.end) + "'e kadar" : ''].filter(Boolean).join(' ') || 'Tarihli'; }
function schText(s) {
  if (!s) return 'Her zaman';
  return [daysText(s.days) || 'Her gün', s.from ? `${s.from} – ${s.to}` : 'gün boyu', s.start ? fmtD(s.start) + "'dan" : '', s.end ? fmtD(s.end) + "'e kadar" : ''].filter(Boolean).join(' · ');
}
function schOf(kind, id) {
  if (kind === 'video') return (S.db.videos.find(x => x.id === id) || {}).sch;
  if (kind === 'camp') return ((S.db.campaigns || []).find(x => x.id === id) || {}).sch;
  if (kind === 'cat') return (MENU.categories[id] || {}).sch;
}
function openSched(kind, id) {
  const sc = schOf(kind, id) || {}, d = new Set(sc.days || []);
  const title = kind === 'cat' ? 'Kategori ne zaman görünsün?' : kind === 'camp' ? 'Kampanya ne zaman çıksın?' : 'Bu içerik ne zaman oynasın?';
  openModal(`<h3 style="margin:0 0 6px">${title}</h3><p class="muted" style="margin:0 0 16px">Boş bırakılan alanlar sınır koymaz. Hiçbiri seçilmezse her zaman görünür.</p>
    <div class="fl"><span>Günler</span><div class="chips" id="sc-days">${DAYS.map((n, i) => `<span class="chip ${d.has(i + 1) ? 'on' : ''}" data-d="${i + 1}" onclick="this.classList.toggle('on')">${n}</span>`).join('')}
      <span class="chip" onclick="schPick([1,2,3,4,5])">Hafta içi</span><span class="chip" onclick="schPick([6,7])">Hafta sonu</span></div></div>
    <div class="f mt">${fl('Başlangıç saati', `<input type="time" id="sc-from" value="${sc.from || ''}">`)}${fl('Bitiş saati', `<input type="time" id="sc-to" value="${sc.to || ''}">`)}</div>
    <p class="muted" style="font-size:12.5px;margin:6px 0 0">Bitiş başlangıçtan önceyse gece yarısını geçer (22:00 – 02:00 gibi).</p>
    <div class="f mt">${fl('İlk gün', `<input type="date" id="sc-start" value="${sc.start || ''}">`)}${fl('Son gün', `<input type="date" id="sc-end" value="${sc.end || ''}">`)}</div>
    <div class="row mt" style="justify-content:space-between"><button class="btn g" onclick="saveSched('${kind}','${id}',true)">Her zaman göster</button><span class="row"><button class="btn g" onclick="closeModal()">Vazgeç</button><button class="btn" onclick="saveSched('${kind}','${id}')">Kaydet</button></span></div>`);
}
const schPick = d => document.querySelectorAll('#sc-days [data-d]').forEach(x => x.classList.toggle('on', d.includes(+x.dataset.d)));
async function saveSched(kind, id, clear) {
  let sc = null;
  if (!clear) {
    const days = [...document.querySelectorAll('#sc-days [data-d].on')].map(x => +x.dataset.d), from = $('sc-from').value, to = $('sc-to').value, start = $('sc-start').value, end = $('sc-end').value;
    if ((from && !to) || (!from && to)) return toast('Saat aralığı için başlangıç ve bitiş saatinin ikisini de girin', true);
    if (from && from === to) return toast('Başlangıç ve bitiş saati aynı olamaz', true);
    if (start && end && end < start) return toast('Son gün ilk günden önce olamaz', true);
    sc = {}; if (days.length && days.length < 7) sc.days = days; if (from) { sc.from = from; sc.to = to; } if (start) sc.start = start; if (end) sc.end = end;
    if (!Object.keys(sc).length) sc = null;
  }
  if (kind === 'cat') { MENU.categories[id].sch = sc || undefined; MENU.__dirty = 1; closeModal(); drawMenu(); return saveMenu(); }
  const ok = await act('PUT', kind === 'camp' ? `/campaigns/${id}/sch` : `/videos/${id}`, { sch: sc }, sc ? 'Zamanlama kaydedildi: ' + schText(sc) : 'Her zaman gösterilecek');
  if (ok) closeModal();
}

/* ================= HAZIR İÇERİKLER (afişler) ================= */
const themeVars = () => { const th = S.me.tenant.theme || {}; return `--bg:${th.bg};--accent:${th.accent};--accent2:${th.accent2};--white:${th.text};--font:'${th.font || 'Montserrat'}'`; };
const posterItem = x => ({ ...x, image: x.image ? S.me.upBase + x.image : null });
function thumb(x) {
  if (x.type === 'poster') return `<div class="pmini" data-pid="${x.id}" style="${themeVars()}"></div>`;
  return x.type === 'image' ? `<img src="${S.me.upBase}${x.file}" loading="lazy">` : `<video src="${S.me.upBase}${x.file}#t=0.5" preload="metadata" muted></video>`;
}
function drawThumbs() {
  if (!window.SPPoster) return;
  document.querySelectorAll('.pmini[data-pid]').forEach(el => {
    const x = S.db.videos.find(v => v.id === el.dataset.pid) || (window.__ptpl && { tpl: el.dataset.pid, fields: {} });
    if (!x) return; el.innerHTML = SPPoster.html(posterItem(x)); SPPoster.fit(el.firstChild);
  });
}
function postersHtml() {
  const mine = S.db.videos.filter(v => v.type === 'poster');
  return card('Şablonlar', 'Birini seçin, yazıları değiştirin. Renkler ekranınızın temasından gelir; Tasarım → Renk ve logo bölümünde renkleri değiştirince afişler de değişir.',
      `<div class="pgal">${Object.entries(SPPoster.TEMPLATES).filter(([, t]) => !t.hidden).map(([k, t]) => `<button class="pcard" onclick="editPoster(null,'${k}')"><div class="pmini" data-tpl="${k}" style="${themeVars()}"></div><b>${esc(t.name)}</b></button>`).join('')}</div>`)
    + card(`Afişleriniz <span class="muted">· ${mine.length}</span>`, 'Medya sırasında yer alırlar; sırayı "Medya ve sıra" sekmesinden değiştirebilirsiniz.',
      mine.length ? `<div class="pgal">${mine.map(x => `<button class="pcard" onclick="editPoster('${x.id}')"><div class="pmini" data-pid="${x.id}" style="${themeVars()}"></div><b>${esc(x.name)}</b><span class="muted" style="font-size:12px">${x.sch ? '⏱ ' + esc(schShort(x.sch)) : 'Her zaman'}${x.hidden ? ' · gizli' : ''}</span></button>`).join('')}</div>` : '<div class="empty">Henüz afiş yok. Yukarıdan bir şablon seçin.</div>');
}
function drawPosterGallery() {
  drawThumbs();
  document.querySelectorAll('.pmini[data-tpl]').forEach(el => { el.innerHTML = SPPoster.html({ tpl: el.dataset.tpl, fields: {} }); SPPoster.fit(el.firstChild); });
}
let PED = null; // düzenlenen afiş
function editPoster(id, tpl) {
  const x = id ? clone(S.db.videos.find(v => v.id === id)) : { tpl, fields: clone(SPPoster.TEMPLATES[tpl].fields), i18n: {} };
  PED = x; PED.i18n = PED.i18n || {};
  const T = SPPoster.TEMPLATES[x.tpl], keys = Object.keys(T.fields), LL = langList();
  const inp = (k, l) => { const v = l ? ((PED.i18n[l] || {})[k] || '') : (PED.fields[k] ?? ''), lab = SPPoster.FIELD_LABELS[k] + (l ? ` (${LANG_NAMES[l]})` : ''), on = `pedSet('${k}','${l || ''}',this.value)`;
    return k === 'body' ? fl(lab, `<textarea rows="4" maxlength="400" oninput="${on}">${esc(v)}</textarea>`) : fl(lab, `<input type="text" maxlength="${k === 'title' ? 90 : 120}" value="${esc(v)}" oninput="${on}">`); };
  openModal(`<h3 style="margin:0 0 12px">${esc(T.name)}</h3>
    <div class="ped"><div><div class="pv16" id="ped-pv" style="${themeVars()}"></div><p class="muted" style="font-size:12.5px">Ekranda böyle görünür.</p></div>
    <div>${keys.map(k => inp(k)).join('')}
      ${T.image ? `<div class="fl"><span>Fotoğraf (isteğe bağlı)</span><div class="row"><label class="btn g s" style="cursor:pointer">${PED.image ? 'Değiştir' : 'Fotoğraf seç'}<input type="file" accept="image/*" hidden onchange="pedImg(this)"></label>${PED.image ? '<button class="btn g s" onclick="PED.image=null;pedDraw();this.remove()">Kaldır</button>' : ''}</div></div>` : ''}
      ${fl('Ekranda kalma süresi (saniye, boşsa fotoğraf süresi)', `<input type="number" min="3" max="120" value="${PED.dur || ''}" oninput="PED.dur=+this.value||null">`)}
      ${LL.length ? `<details class="mt"><summary style="cursor:pointer;font-weight:600">Çeviriler (${LL.map(l => LANG_NAMES[l]).join(', ')})</summary>${LL.map(l => keys.filter(k => k !== 'price').map(k => inp(k, l)).join('')).join('')}</details>` : ''}
    </div></div>
    <div class="row mt" style="justify-content:space-between">${id ? `<button class="btn d" onclick="if(confirm('Afiş silinsin mi?')){closeModal();act('DELETE','/videos/${id}',undefined,'Silindi')}">Sil</button>` : '<span></span>'}
      <span class="row"><button class="btn g" onclick="closeModal()">Vazgeç</button>${id ? `<button class="btn g" onclick="closeModal();openSched('video','${id}')">⏱ Zamanla</button>` : ''}<button class="btn" onclick="savePoster()">${id ? 'Kaydet' : 'Medyaya ekle'}</button></span></div>`);
  pedDraw();
}
function pedSet(k, l, v) { if (l) PED.i18n[l] = { ...(PED.i18n[l] || {}), [k]: v }; else PED.fields[k] = v; pedDraw(); }
function pedDraw() { const el = $('ped-pv'); if (!el) return; el.innerHTML = SPPoster.html(posterItem(PED)); SPPoster.fit(el.firstChild); }
async function pedImg(inp) {
  const f = inp.files[0]; if (!f) return; const fd = new FormData(); fd.append('file', f);
  try { const j = await req('POST', '/posters/image', fd); PED.image = j.file; pedDraw(); toast('Fotoğraf eklendi'); } catch (e) { toast(e.message, true); }
}
async function savePoster() {
  const body = { tpl: PED.tpl, fields: PED.fields, i18n: PED.i18n, dur: PED.dur || null, image: PED.image || null, name: PED.fields.title || SPPoster.TEMPLATES[PED.tpl].name };
  const ok = PED.id ? await act('PUT', '/posters/' + PED.id, body, 'Afiş kaydedildi') : await act('POST', '/posters', body, 'Afiş medya sırasının sonuna eklendi');
  if (ok) closeModal();
}

/* ================= ÇOKLU DİL ================= */
const LANG_NAMES = { tr: 'Türkçe', en: 'İngilizce', de: 'Almanca', ru: 'Rusça', ar: 'Arapça', fr: 'Fransızca', es: 'İspanyolca' };
const langList = () => ((S.db && S.db.lang) || {}).list || [];
function langCard() {
  const L = S.db.lang || {}, list = L.list || [];
  return card('🌍 Diller', 'Turist müşterileriniz için fiyat listesi, duyuru metni ve afişler seçtiğiniz dillerde sırayla döner. Türkçe her zaman ilk dildir; çevirileri aşağıdaki alanlara siz yazarsınız.',
    `<div class="chips">${Object.entries(LANG_NAMES).filter(([k]) => k !== 'tr').map(([k, n]) => `<span class="chip ${list.includes(k) ? 'on' : ''}" onclick="togLang('${k}')">${n}</span>`).join('')}</div>
     <div class="row mt"><span class="muted">Dil değiştirme aralığı</span><input type="number" min="5" max="60" value="${L.sec || 12}" style="max-width:90px" onchange="act('PUT','/lang',{sec:+this.value},'Kaydedildi',false).then(()=>{S.db.lang={...(S.db.lang||{}),sec:+this.value}})"><span class="muted">saniye</span></div>`);
}
async function togLang(l) {
  const cur = langList(), list = cur.includes(l) ? cur.filter(x => x !== l) : [...cur, l];
  if (list.length > 3) return toast('En çok 3 ek dil seçebilirsiniz', true);
  if (await act('PUT', '/lang', { list }, list.includes(l) ? `${LANG_NAMES[l]} eklendi; çevirileri girin` : `${LANG_NAMES[l]} kaldırıldı`, false)) { S.db.lang = { ...(S.db.lang || {}), list }; render(true); }
}

/* ================= GOOGLE VE INSTAGRAM ================= */
function googleCard() {
  const g = S.db.google;
  const body = g && g.placeId
    ? `<div class="it" style="display:flex;gap:12px;align-items:center"><div class="b" style="flex:1"><b>${esc(g.name || 'İşletmeniz')}</b><span>${g.rating ? `${String(g.rating).replace('.', ',')} ★ · ${g.count} değerlendirme · ` : ''}${(g.reviews || []).filter(r => r.rating >= 4).length} yorum ekranda · ${g.updated ? 'güncellendi ' + ago(g.updated) : 'henüz alınmadı'}</span>${g.error ? `<span style="color:var(--bad)">${esc(g.error)}</span>` : ''}</div>
        <button class="btn g s" onclick="act('POST','/google/refresh',undefined,'Yorumlar yenilendi')">Yenile</button><button class="btn d s" onclick="if(confirm('Google bağlantısı kaldırılsın mı?'))act('DELETE','/google',undefined,'Kaldırıldı')">Kaldır</button></div>
       ${(g.reviews || []).length ? `<div class="list mt">${g.reviews.slice(0, 5).map(r => `<div class="it"><div class="b"><b>${esc(r.author)} <span class="stars">${'★'.repeat(r.rating)}</span> <span class="muted" style="font-weight:400">${esc(r.when || '')}</span></b><span>${esc(r.text)}</span></div></div>`).join('')}</div><p class="muted" style="font-size:12.5px">Google en fazla 5 yorum verir; 12 saatte bir yenilenir. Yalnız 4 ve 5 yıldızlılar ekranda görünür.</p>` : ''}`
    : `<div class="row"><input type="text" id="g-q" placeholder="İşletme adı ve semt, ya da Google Haritalar bağlantısı" style="flex:1" onkeydown="if(event.key==='Enter')gSearch()"><button class="btn" onclick="gSearch()">Ara</button></div><div id="g-res" class="list mt"></div>`;
  return card('★ Google yorumları', 'Google Haritalar\'daki yorumlarınız otomatik gelir ve medyanın altındaki şeritte döner (düzende "Google yorumları" widget\'ı olmalı).', body,
    g && g.placeId ? sw(g.show !== false, "act('PUT','/google',{show:this.checked},this.checked?'Ekranda':'Ekrandan kaldırıldı')") : '');
}
async function gSearch() {
  const q = $('g-q').value.trim(); if (q.length < 3) return toast('İşletmenizin adını yazın', true);
  $('g-res').innerHTML = '<div class="muted">Aranıyor…</div>';
  try {
    const l = await req('GET', '/google/search?q=' + encodeURIComponent(q)); window.__gres = l;
    $('g-res').innerHTML = l.length ? l.map((p, i) => `<div class="it"><div class="b"><b>${esc(p.name)}</b><span>${esc(p.address)}${p.rating ? ` · ${p.rating} ★ (${p.count})` : ''}</span></div><button class="btn s" onclick="gPick(${i})">Bu benim</button></div>`).join('') : '<div class="muted">Bulunamadı. Adı ve semti birlikte yazmayı deneyin.</div>';
  } catch (e) { $('g-res').innerHTML = `<div class="muted" style="color:var(--bad)">${esc(e.message)}</div>`; }
}
async function gPick(i) { const p = window.__gres[i]; if (await act('PUT', '/google', { placeId: p.id, name: p.name }, 'Google işletmeniz bağlandı')) {} }
function instaCard() {
  const ig = S.db.instagram || {};
  return card('📷 Instagram paylaşımları', 'Son paylaşımlarınızın fotoğrafları medya döngüsüne kendiliğinden girer; yeni paylaşım yaptığınızda bir saat içinde ekrana gelir.',
    ig.connected
      ? `<div class="it" style="display:flex;gap:12px;align-items:center"><div class="b" style="flex:1"><b>@${esc(ig.user || '…')}</b><span id="ig-st">${(ig.posts || []).length} paylaşım · ${ig.updated ? 'güncellendi ' + ago(ig.updated) : 'henüz alınmadı'}</span>${ig.error ? `<span style="color:var(--bad)">${esc(ig.error)}</span>` : ''}</div>
          <button class="btn g s" onclick="act('POST','/instagram/refresh',undefined,'Paylaşımlar yenilendi')">Yenile</button><button class="btn d s" onclick="if(confirm('Instagram bağlantısı kaldırılsın mı?'))act('DELETE','/instagram',undefined,'Kaldırıldı')">Kaldır</button></div>
         <div class="f mt">${fl('Kaç içerikte bir', `<input type="number" min="1" max="20" value="${ig.every || 3}" onchange="act('PUT','/instagram',{every:+this.value},'Kaydedildi')">`)}${fl('Kaç paylaşım', `<input type="number" min="1" max="20" value="${ig.count || 8}" onchange="act('PUT','/instagram',{count:+this.value},'Kaydedildi')">`)}${fl('Ekranda kalma (sn)', `<input type="number" min="5" max="60" value="${ig.dur || 10}" onchange="act('PUT','/instagram',{dur:+this.value},'Kaydedildi')">`)}</div>
         <div class="thumbs mt" id="ig-th">${(ig.posts || []).map(p => `<div class="t"><img src="${S.me.upBase}${p.file}" loading="lazy"></div>`).join('')}</div>`
      : `<p class="muted" style="margin-top:0">Instagram hesabınızın <b>işletme</b> ya da <b>içerik üreticisi</b> hesabı olması gerekir. Meta for Developers'ta "Instagram API with Instagram Login" ile uzun ömürlü erişim anahtarı (access token) alıp buraya yapıştırın; anahtar her hafta kendiliğinden yenilenir.</p>
         <div class="row"><input type="password" id="ig-tok" placeholder="Instagram erişim anahtarı" style="flex:1" autocomplete="off"><button class="btn" onclick="igConnect()">Bağla</button></div>`,
    ig.connected ? sw(ig.enabled !== false, "act('PUT','/instagram',{enabled:this.checked},this.checked?'Açıldı':'Kapatıldı')") : '');
}
function drawInsta() {}
async function igConnect() {
  const token = $('ig-tok').value.trim(); if (token.length < 20) return toast('Erişim anahtarını yapıştırın', true);
  try { const j = await req('PUT', '/instagram', { token }); if (j.error) toast('Bağlanamadı: ' + j.error, true); else toast('Instagram bağlandı'); refresh(); } catch (e) { toast(e.message, true); }
}

/* ================= DURUM İZLEME ================= */
const upFmt = s => s < 3600 ? Math.round(s / 60) + ' dk' : s < 86400 ? Math.round(s / 3600) + ' saat' : Math.round(s / 86400) + ' gün';
async function drawDevStatus() {
  const box = $('devstat'); if (!box) return;
  let j; try { j = await req('GET', '/devices/status'); } catch (e) { return; }
  const n = j.notify || {};
  box.innerHTML = `<div class="grid g2">`
    + card('Cihaz durumu', 'Kutular dakikada bir durum bildirir. Ekran görüntüsü yalnız Android uygulamasında alınır.', j.devices.length ? `<div class="list">${j.devices.map(d => { const r = d.report || {}; return `<div class="it" style="flex-wrap:wrap"><span class="dot ${d.online ? 'on' : ''}"></span><div class="b" style="min-width:200px"><b>${esc(d.name || 'TV kutusu')}</b>
        <span>${d.online ? 'Bağlı' : 'Çevrimdışı · son görülme ' + ago(d.last_seen)}${r.app ? ' · uygulama ' + esc(r.app) : ''}${r.screen ? ' · ' + esc(r.screen) : ''}${r.uptime ? ' · ' + upFmt(r.uptime) + 'dir açık' : ''}</span>
        ${r.playing ? `<span>Şu an: ${esc(r.playing)}</span>` : ''}${r.cached ? `<span>Çevrimdışı önbellek: ${r.cached} dosya${r.cacheMB ? ', ' + r.cacheMB + ' MB' : ''}</span>` : ''}${r.lastError ? `<span style="color:var(--warn,#e6a23c)">Son hata: ${esc(r.lastError)}</span>` : ''}</div>
        ${d.online ? `<button class="btn xs g" onclick="snapDev('${d.id}')">📷 Ekran görüntüsü</button>` : ''}</div>`; }).join('')}</div><div id="snapbox"></div>` : '<div class="empty">Bağlı cihaz yok</div>')
    + card('Uyarılar', `Kutu ${j.offlineMin} dakikadan uzun süre bağlantı vermezse burada ve e-postanızda uyarı görürsünüz.`,
      `${owner() ? `<div class="row"><input type="email" id="nt-mail" placeholder="ornek@isletme.com" value="${esc(n.email || '')}" style="flex:1"><button class="btn" onclick="saveNotify()">Kaydet</button>${n.email && j.mail ? '<button class="btn g" onclick="act(\'POST\',\'/notify/test\',undefined,\'Deneme e-postası gönderildi\',false)">Dene</button>' : ''}</div>
       <div class="swr mt"><div class="b"><b>Ekran kapanınca</b></div>${sw(n.offline !== false, '', 'id="nt-off"')}</div><div class="swr"><div class="b"><b>Ekran geri açılınca</b></div>${sw(n.online !== false, '', 'id="nt-on"')}</div>
       ${j.mail ? '' : '<p class="muted" style="font-size:12.5px">Sunucuda e-posta gönderimi henüz ayarlı değil; uyarılar şimdilik yalnız burada görünür.</p>'}` : ''}
       <div class="list mt">${(j.alerts || []).length ? j.alerts.slice(0, 12).map(a => `<div class="it"><span class="dot ${a.kind === 'online' ? 'on' : ''}"></span><div class="b"><b>${esc(a.text)}</b><span>${new Date(a.at).toLocaleString(I18N.locale, { dateStyle: 'short', timeStyle: 'short' })}</span></div></div>`).join('') + `<div class="row end"><button class="btn xs g" onclick="act('DELETE','/alerts',undefined,'Temizlendi',false).then(drawDevStatus)">Temizle</button></div>` : '<div class="muted">Uyarı yok.</div>'}</div>`)
    + `</div>`;
}
const saveNotify = () => act('PUT', '/notify', { email: $('nt-mail').value.trim(), offline: $('nt-off').checked, online: $('nt-on').checked }, 'Uyarı ayarları kaydedildi', false);
async function snapDev(id) {
  const box = $('snapbox'); box.innerHTML = '<p class="muted">Ekran görüntüsü isteniyor…</p>';
  try { await req('POST', `/devices/${id}/snapshot`); } catch (e) { box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
  const t0 = Date.now();
  const poll = async () => {
    try { const j = await req('GET', `/devices/${id}/snapshot`); if (j.at >= t0 - 1000) { box.innerHTML = `<img src="${j.data}" style="width:100%;border-radius:10px;margin-top:12px;background:#000"><p class="muted" style="font-size:12.5px">${new Date(j.at).toLocaleTimeString(I18N.locale)} · videolar bazı kutularda siyah görünebilir</p>`; return; } } catch (e) {}
    if (Date.now() - t0 < 12000) setTimeout(poll, 1500); else box.innerHTML = '<p class="muted">Görüntü gelmedi. Kutudaki uygulama güncel değilse (sürüm 2.1 öncesi) bu özellik çalışmaz.</p>';
  };
  setTimeout(poll, 1200);
}

/* ================= İSTATİSTİK ================= */
let STDAYS = 30;
SECTIONS.stats = {
  html() {
    return head('İstatistik', 'Ekranınız ne kadar açık kaldı, hangi içerik kaç kez oynadı.', `<div class="tabs" style="margin:0">${[7, 30, 90].map(d => `<button class="${STDAYS === d ? 'on' : ''}" onclick="STDAYS=${d};render(true)">${d} gün</button>`).join('')}</div>`)
      + '<div id="stv"><div class="loading">Yükleniyor…</div></div>';
  },
  async after() {
    let j; try { j = await req('GET', '/stats?days=' + STDAYS); } catch (e) { $('stv').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const hrs = m => (m / 60).toFixed(m < 600 ? 1 : 0).replace('.', ',');
    const max = Math.max(60, ...j.daily.map(d => d.online));
    const active = j.daily.filter(d => d.online > 0).length;
    $('stv').innerHTML = `<div class="grid g3" style="margin-bottom:18px">
        <div class="stat"><b>${hrs(j.totals.online)} saat</b><span>Ekran açık kaldı (${active} gün)</span></div>
        <div class="stat"><b>${j.totals.plays.toLocaleString(I18N.locale)}</b><span>İçerik oynatıldı</span></div>
        <div class="stat"><b>${active ? hrs(j.totals.online / active) : '0'} saat</b><span>Açık olduğu günlerde ortalama</span></div></div>`
      + card('Günlük ekran süresi', 'Saat cinsinden; bağlı tüm kutuların toplamı.', `<div class="bars" role="img" aria-label="Günlük ekran süresi grafiği">${j.daily.map(d => `<div title="${new Date(d.day + 'T12:00').toLocaleDateString(I18N.locale, { day: 'numeric', month: 'long' })}: ${hrs(d.online)} saat, ${d.plays} oynatma"><i style="height:${Math.round(d.online / max * 100)}%"></i></div>`).join('')}</div>
        <div class="row" style="justify-content:space-between;font-size:12px" class="muted"><span class="muted">${fmtD(j.daily[0].day)}</span><span class="muted">${fmtD(j.daily[j.daily.length - 1].day)}</span></div>`)
      + card('İçerikler', 'En çok oynayandan aza.', j.items.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>İçerik</th><th>Tür</th><th>Oynatma</th><th>Toplam süre</th><th>Son</th></tr></thead><tbody>${j.items.slice(0, 50).map(it => `<tr><td>${esc(it.name)}</td><td>${{ video: 'Video', image: 'Fotoğraf', poster: 'Afiş', instagram: 'Instagram', trailer: 'Fragman', gone: '—' }[it.type] || it.type}</td><td>${it.plays.toLocaleString(I18N.locale)}</td><td>${it.sec ? (it.sec >= 3600 ? hrs(it.sec / 60) + ' sa' : Math.round(it.sec / 60) + ' dk') : '—'}</td><td>${fmtD(it.last)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Henüz veri yok. Ekran açık kaldıkça burada görünür.</div>');
  },
};

/* ================= ŞUBELER ================= */
const PARTS_TR = [['layout', 'Ekran düzeni'], ['theme', 'Renkler ve logo'], ['media', 'Medya ve afişler'], ['menu', 'Fiyat listesi'], ['promo', 'Kampanya ve QR kodlar'], ['lang', 'Dil ayarları']];
function branchesHtml() {
  return card('Şubeleriniz', 'Her şubenin kendi ekranı, cihazları ve içeriği olur; hepsine bu hesapla girersiniz. Şubeye geçince panel o şubeyi yönetir.', '<div id="brlist" class="list"><div class="muted">Yükleniyor…</div></div>')
    + `<div id="brmore"></div>`;
}
async function drawBranches() {
  let j; try { j = await req('GET', '/branches'); } catch (e) { return; } S.br = j;
  $('brlist').innerHTML = j.list.map(b => `<div class="it"><span class="dot ${b.online ? 'on' : ''}"></span><div class="b"><b>${esc(b.name)}${b.id === j.current ? ' <span style="color:var(--accent2);font-weight:600"> · şu an burada</span>' : ''}${b.home ? ' <span class="muted" style="font-weight:400">· ana hesap</span>' : ''}</b><span>${b.online}/${b.devices} cihaz bağlı · ${b.media} içerik · ${b.access.ok ? (b.access.kind === 'trial' ? 'deneme · ' : '') + fmtDate(b.access.until) + ' tarihine kadar' : 'süresi dolmuş'}</span></div>
      ${b.id !== j.current ? `<button class="btn xs" onclick="switchBranch('${b.id}')">Bu şubeye geç</button>` : ''}${owner() ? `<button class="btn xs g" onclick="renBranch('${b.id}','${esc(b.name).replace(/'/g, '')}')">Adlandır</button>` : ''}</div>`).join('');
  const others = j.list.filter(b => b.id !== j.current);
  $('brmore').innerHTML = (owner() ? `<div class="grid g2">` + card('Yeni şube', `Paketinizde ${j.limit} şubeye kadar açabilirsiniz (${j.list.length}/${j.limit}). Yeni şube bu şubenin düzeni, renkleri ve logosuyla açılır; süresi ana hesabınızla aynıdır.`,
      `<div class="row"><input type="text" id="br-n" maxlength="80" placeholder="örn. Kadıköy şubesi" style="flex:1"><button class="btn" onclick="addBranch()" ${j.list.length >= j.limit ? 'disabled' : ''}>Şube aç</button></div>`)
    + card('Diğer şubelere kopyala', others.length ? 'Bu şubedeki içeriği seçtiğiniz şubelere kopyalar. Kopyalanan bölümler hedef şubede bununla değişir; medya eklenir.' : 'Kopyalamak için önce bir şube daha açın.',
      others.length ? `<div class="fl"><span>Hedef şubeler</span><div class="chips" id="cp-t">${others.map(b => `<span class="chip on" data-id="${b.id}" onclick="this.classList.toggle('on')">${esc(b.name)}</span>`).join('')}</div></div>
        <div class="fl mt"><span>Kopyalanacaklar</span><div class="chips" id="cp-p">${PARTS_TR.map(([k, l]) => `<span class="chip ${['menu', 'promo'].includes(k) ? 'on' : ''}" data-k="${k}" onclick="this.classList.toggle('on')">${l}</span>`).join('')}</div></div>
        <label class="ckl mt"><input type="checkbox" id="cp-rep"> Hedefteki medyayı silip yerine koy (işaretsizse sona eklenir)</label>
        <div class="row end mt"><button class="btn" onclick="copyBranches()">Kopyala</button></div>` : '') + `</div>` : '');
}
async function switchBranch(id) { try { await req('POST', '/branches/switch', { id }); location.hash = '#home'; location.reload(); } catch (e) { toast(e.message, true); } }
async function addBranch() { const name = $('br-n').value.trim(); if (name.length < 2) return toast('Şube adını yazın', true); try { const j = await req('POST', '/branches', { name }); toast('Şube açıldı'); if (confirm('Yeni şubeye şimdi geçilsin mi?')) return switchBranch(j.id); drawBranches(); drawBranchSwitch(); } catch (e) { toast(e.message, true); } }
const renBranch = (id, cur) => { const n = prompt('Şube adı:', cur); if (n && n.trim()) act('PUT', '/branches/' + id, { name: n.trim() }, 'Kaydedildi', false).then(() => { drawBranches(); drawBranchSwitch(); }); };
async function copyBranches() {
  const targets = [...document.querySelectorAll('#cp-t .chip.on')].map(x => x.dataset.id), parts = [...document.querySelectorAll('#cp-p .chip.on')].map(x => x.dataset.k);
  if (!targets.length || !parts.length) return toast('Şube ve kopyalanacak içerik seçin', true);
  if (!confirm(`${targets.length} şubeye kopyalansın mı? Seçilen bölümler hedefte bununla değişir.`)) return;
  toast('Kopyalanıyor… medya çoksa biraz sürebilir');
  try { const j = await req('POST', '/branches/copy', { targets, parts, media: $('cp-rep').checked ? 'replace' : 'append' }); toast(`${j.targets} şubeye kopyalandı${j.files ? ` (${j.files} dosya)` : ''}`); drawBranches(); } catch (e) { toast(e.message, true); }
}
async function drawBranchSwitch() {
  let j; try { j = await req('GET', '/branches'); } catch (e) { return; }
  let el = $('brsw'); if (j.list.length < 2) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'brsw'; $('brand').after(el); }
  el.innerHTML = `<select aria-label="Şube" onchange="switchBranch(this.value)">${j.list.map(b => `<option value="${b.id}" ${b.id === j.current ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>`;
}

/* ================= KVKK: VERİLERİM ================= */
function privacyHtml() {
  const del = S.db.deletion;
  return `<div class="grid g2">` + card('Verilerinizi indirin', 'Hesabınız, kullanıcılarınız, cihazlarınız ve tüm içerik ayarlarınız tek bir JSON dosyası olarak iner (KVKK m.11). Medya dosyaları dahil değildir; onları Medya bölümünden indirebilirsiniz.',
      owner() ? `<a class="btn" href="/api/admin/privacy/export" download>Verilerimi indir</a>` : '<p class="muted">Bu işlem için işletme sahibi yetkisi gerekir.</p>')
    + card('Hesabı sil', del ? `Silme talebiniz alındı. <b>${fmtDate(del.executeAt)}</b> tarihinde bu işletmenin tüm verileri, medyası, cihazları${S.me.user.role === 'owner' ? ' ve ana hesapsa tüm şubeleri' : ''} kalıcı olarak silinecek. O tarihe kadar vazgeçebilirsiniz.` : 'Talebinizden 30 gün sonra bu işletmenin tüm verileri ve medyası kalıcı olarak silinir. Bu sürede vazgeçebilirsiniz; ekranınız bu süre boyunca çalışmaya devam eder.',
      !owner() ? '<p class="muted">Bu işlem için işletme sahibi yetkisi gerekir.</p>' : del ? `<button class="btn" onclick="act('DELETE','/privacy/delete',undefined,'Silme talebi iptal edildi')">Silme talebini iptal et</button>`
        : `<div class="row"><input type="password" id="del-pw" placeholder="Şifreniz" autocomplete="current-password" style="flex:1"><button class="btn d" onclick="reqDelete()">Hesabı silme talebi oluştur</button></div>`)
    + `</div>` + card('Belgeler', '', `<div class="row"><a class="btn g s" href="/kvkk" target="_blank">KVKK Aydınlatma Metni</a><a class="btn g s" href="/kosullar" target="_blank">Kullanım Koşulları</a><a class="btn g s" href="/gizlilik" target="_blank">Gizlilik ve Çerezler</a><a class="btn g s" href="/veri-isleme" target="_blank">Veri İşleme Sözleşmesi</a></div>
      ${S.db.consent ? `<p class="muted mt" style="font-size:13px">Onay tarihi: ${fmtDate(S.db.consent.at)} (sürüm ${esc(S.db.consent.terms)})</p>` : ''}
      <p class="muted" style="font-size:13px">Ekranda gösterdiğiniz müşteri isimleri (doğum günü gibi) bakımından veri sorumlusu işletmenizdir; bu kişilerin iznini almayı unutmayın.</p>`);
}
async function reqDelete() {
  const pw = $('del-pw').value; if (!pw) return toast('Onay için şifrenizi girin', true);
  if (!confirm('30 gün sonra tüm veriler kalıcı olarak silinecek. Devam edilsin mi?')) return;
  if (await act('POST', '/privacy/delete', { password: pw }, 'Silme talebi alındı', false)) { S.db = await req('GET', '/db'); render(true); drawBanner(); }
}

/* ================= açılış ================= */
function drawBrand() {
  const t = S.me.tenant, th = t.theme || {}, r = document.documentElement.style;
  const rgbOf = h => { const n = parseInt(String(h || '').slice(1), 16); return isNaN(n) ? null : [n >> 16, (n >> 8) & 255, n & 255]; };
  const a1 = rgbOf(th.accent), a2 = rgbOf(th.accent2);
  if (a1 && a2) { r.setProperty('--accent', th.accent); r.setProperty('--accent2', th.accent2); r.setProperty('--a2', a2.join(',')); } $('brand').innerHTML = t.logo ? `<img src="${esc(t.logo)}" alt="${esc(t.name)}"${th.plate ? ' style="background:#fff;padding:6px 10px;border-radius:8px"' : ''}>` : `<b>${esc(t.name)}</b>`; document.title = t.name + ' · ' + S.me.brand; }
(async function boot() {
  try { [S.me, S.db, S.cat, S.scr, S.lg] = await Promise.all([req('GET', '/me'), req('GET', '/db'), req('GET', '/catalog'), req('GET', '/screen'), req('GET', '/leagues')]); }
  catch (e) { $('view').innerHTML = `<div class="empty">Panel yüklenemedi: ${esc(e.message)}</div>`; return; }
  drawBrand(); drawBanner(); route(); drawBranchSwitch();
  setInterval(async () => { if (document.hidden) return; try { S.scr = await req('GET', '/screen'); } catch (e) {} }, 30000);
})();
addEventListener('beforeunload', e => { if (EDIT.dirty || (MENU && MENU.__dirty)) { e.preventDefault(); e.returnValue = ''; } });
