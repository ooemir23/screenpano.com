/* İşletme paneli. Bölümler: Özet, Tasarım, Medya, Fiyat Listesi, Spor, Kampanya ve yorumlar, Kutlamalar, Bilgi Bandı, Ayarlar. */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { me: null, db: null, cat: null, scr: null, lg: null };
let TAB = 'home', PREV = null, SUB = {};
const ICN = { media: 'film', logo: 'store', clock: 'clock', rates: 'cloud-sun', ticker: 'newspaper', text: 'type', image: 'image', qr: 'qr-code', info: 'trophy', reviews: 'star', menu: 'receipt-text', music: 'music' };
const ICON = new Proxy({}, { get: (_, k) => ICN[k] ? `<svg class="ic" aria-hidden="true"><use href="/icons.svg#i-${ICN[k]}"></use></svg>` : '' });
const fmtDate = ms => ms ? new Date(ms).toLocaleDateString(I18N.locale, { day: 'numeric', month: 'long', year: 'numeric' }) : '-';
const ago = ms => { if (!ms) return 'hiç'; const m = Math.round((Date.now() - ms) / 60000); return m < 2 ? 'az önce' : m < 60 ? m + ' dk önce' : m < 1440 ? Math.round(m / 60) + ' saat önce' : Math.round(m / 1440) + ' gün önce'; };
// boyut: dile göre ondalık ayırıcı, gereksiz ",0" yok (1 TB, 20 GB, 1,5 GB)
const fmtSize = b => { const nf = (v, d) => v.toLocaleString(I18N.locale, { maximumFractionDigits: d }); return b >= 1099511627776 ? nf(b / 1099511627776, 1) + ' TB' : b >= 1073741824 ? nf(b / 1073741824, 1) + ' GB' : b >= 1048576 ? nf(Math.round(b / 1048576), 0) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; };
const pro = () => S.me && S.me.tenant.plan.pro;
const owner = () => S.me && S.me.user.role !== 'staff';
const clone = o => JSON.parse(JSON.stringify(o));
// tek tip çizgi ikon (Lucide sprite, /icons.svg)
const ic = n => `<svg class="ic" aria-hidden="true"><use href="/icons.svg#i-${n}"></use></svg>`;
// küçük açılır menü: items = [[etiket, ikon, işlev, tehlike?], null (ayraç), ...]
function popMenu(anchor, items) {
  let m = $('popm'); if (!m) { m = document.createElement('div'); m.id = 'popm'; document.body.appendChild(m); addEventListener('click', () => m.classList.remove('on')); addEventListener('scroll', () => m.classList.remove('on'), true); }
  m.innerHTML = items.map((it, i) => it ? `<button type="button" class="${it[3] ? 'dz' : ''}" data-i="${i}">${ic(it[1])}<span>${esc(it[0])}</span></button>` : '<hr>').join('');
  m.querySelectorAll('button').forEach(b => b.onclick = e => { e.stopPropagation(); m.classList.remove('on'); items[+b.dataset.i][2](); });
  m.classList.add('on'); const r = anchor.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px'; m.style.top = (r.bottom + h + 8 > innerHeight ? r.top - h - 6 : r.bottom + 6) + 'px';
}

/* ================= altyapı ================= */
function toast(m, err, sub) { const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = m; if (sub) { const s = document.createElement('small'); s.textContent = sub; t.appendChild(s); } $('toasts').appendChild(t); setTimeout(() => t.remove(), sub ? 5200 : 3800); }
// A11: kayıttan sonra değişikliğin kaç ekrana gönderildiği (bağlı kutular anında alır; kapalı olan açılınca alır)
async function tvNote() {
  try { S.scr = await req('GET', '/screen'); } catch (e) { return ''; }
  const d = S.scr.devices || [], on = d.filter(x => x.online);
  if (!d.length) return '';
  if (!on.length) return 'Şu an bağlı ekran yok; ekran açılınca güncellenir';
  const off = d.filter(x => !x.online).map(x => x.name || 'TV kutusu');
  return off.length ? `${on.length}/${d.length} ekrana gönderildi · çevrimdışı: ${off.slice(0, 2).join(', ')}` : `${on.length}/${d.length} ekrana gönderildi`;
}
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
  try { const j = await req(method, path, body); if (reload) await refresh(); if (ok) toast(ok, false, method !== 'GET' && !NOTV.test(path) ? await tvNote() : ''); return j || true; }
  catch (e) { LASTERR = e.message || 'Hata'; toast(e.message, true); return false; }
}
let LASTERR = '';
// ekrana gitmeyen işlemler (kayıt sonrası "ekrana gönderildi" notu yazılmaz)
const NOTV = /^\/(designs(\/[^/]+)?$|users|profile|password|notify|privacy|backups|branches|google\/(search|connect)|instagram\/connect|ads\/[^/]+\/token|devices|pair)/;
const opt = (key, val, msg) => { S.db[key] = val; return act('PUT', '/options', { [key]: val }, msg || 'Kaydedildi', false); };
const reoptAll = async () => { if (await UI.ask('Mevcut videolar seçtiğiniz kaliteyle yeniden küçültülsün mü? Orijinaller silindiği için kalite yalnızca düşebilir (küçük dosya, daha akıcı oynatım); işlem kuyrukta sırayla yapılır.')) act('POST', '/media/optimize-all', { force: true }, 'Yeniden küçültme başladı', false); };
const brkSrc = (k, on) => { const cur = new Set((S.db.breaking || {}).sources || ['trt']); on ? cur.add(k) : cur.delete(k); const arr = [...cur].filter(x => x !== 'mix'); act('PUT', '/breaking', { sources: arr.length ? arr : ['trt'] }, 'Kaydedildi', false).then(refresh); };
async function refresh() { [S.db, S.scr] = await Promise.all([req('GET', '/db'), req('GET', '/screen')]); render(true); }
const sw = (on, js, attrs = '') => `<label class="sw"><input type="checkbox" ${on ? 'checked' : ''} onchange="${js}" ${attrs}><i></i></label>`;
// A7: başlığında aç/kapat anahtarı olan kart "Yayında / Kapalı" etiketi taşır; kapalıyken içerik soluk görünür (düzenlenebilir)
const stPill = on => `<span class="stp ${on ? 'on' : ''}">${on ? 'Yayında' : 'Kapalı'}</span>`;
const card = (title, desc, body, right = '', cls = '') => { const sw1 = /class="sw"/.test(right), on = sw1 && /type="checkbox" checked/.test(right); return `<div class="card ${cls}${sw1 ? (on ? ' swon' : ' swoff') : ''}"><div class="ch"><div><h3>${title}${sw1 ? stPill(on) : ''}</h3>${desc ? `<p>${desc}</p>` : ''}</div>${right}</div><div class="cb">${body}</div></div>`; };
const fl = (label, input) => `<label class="fl"><span>${label}</span>${input}</label>`;
const head = (t, d, right = '') => `<div class="head"><div><h1>${t}</h1>${d ? `<p>${d}</p>` : ''}</div><div class="row">${right}</div></div>`;
const tabs = (key, items) => `<div class="tabs">${items.map(([k, l]) => `<button class="${(SUB[key] || items[0][0]) === k ? 'on' : ''}" onclick="SUB['${key}']='${k}';go('${TAB}/${k}')">${l}</button>`).join('')}</div>`;
const lock = what => pro() ? '' : `<div class="bn lock">🔒 <span><b>${what}</b> Pro pakette. Ayarlarınızı şimdiden yapabilirsiniz; ekranda görünmesi için paketinizi yükseltin.</span><a class="btn s g" href="#settings/plan">Paketler</a></div>`;
function scalePv() { document.querySelectorAll('.pv').forEach(b => { const f = b.querySelector('iframe'); if (f && b.clientWidth) f.style.transform = `scale(${b.clientWidth / 1920})`; }); }
addEventListener('resize', scalePv);
const pvFrame = (draft) => `<div class="pv"><iframe src="/tv?preview=1" title="TV önizleme" loading="lazy"${draft ? ' onload="pushDraft()"' : ''}></iframe></div>`;
function openModal(html) { $('modalb').innerHTML = html; $('modal').classList.add('on'); }
function closeModal() { $('modal').classList.remove('on'); $('modalb').innerHTML = ''; }
function menu(open) { $('app').classList.toggle('menu', open); }
const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.href = '/login'; };
const unimp = async () => { await fetch('/api/super/unimpersonate', { method: 'POST' }); location.href = '/super'; };

/* ================= gezinme ================= */
// Metin olan satır grup başlığıdır; null ayraçtır
const NAV = [
  'Ekran', ['home', 'layout-dashboard', 'Özet'], ['design', 'palette', 'Tasarım'],
  'İçerikler', ['media', 'film', 'Medya'], ['music', 'music', 'Müzik'], ['menu', 'receipt-text', 'Fiyat Listesi', 1], ['promo', 'megaphone', 'Kampanyalar'], ['qr', 'qr-code', 'QR Kodlar'], ['celeb', 'party-popper', 'Kutlamalar'],
  'Canlı veri', ['sport', 'trophy', 'Spor', 1], ['info', 'newspaper', 'Bilgi Bandı', 1],
  'Takip', ['stats', 'chart-column', 'İstatistik'],
  null, ['settings', 'settings', 'Ayarlar'],
];
function drawNav() {
  const NV = window.__ONLY ? NAV.filter(n => Array.isArray(n) && n[0] === window.__ONLY) : NAV; // music.* adresi: yalnız Müzik bölümü
  if (window.__ONLY === 'music') { // music.* adresi: sol menüde iki kaynak; seçilen kaynak tüm sayfayı ve çalmayı değiştirir
    const v = typeof srcView === 'function' ? srcView() : 'yt';
    const it = (k, icn, name) => { const av = srcAvail(k); return `<a href="#music" class="${v === k ? 'on' : ''}${av ? '' : ' off'}" onclick="switchSrc('${k}');return false">${ic(icn)}${name}${av ? '' : '<span class="pro">Pasif</span>'}</a>`; };
    $('nav').innerHTML = `<div class="grp">Kaynak</div>` + it('yt', 'music', 'YouTube Music') + it('spotify', 'headphones', 'Spotify');
    document.title = 'ScreenPano Müzik'; $('toptitle').textContent = v === 'spotify' ? 'Spotify' : 'YouTube Music';
    return;
  }
  $('nav').innerHTML = NV.map(n => typeof n === 'string' ? `<div class="grp">${n}</div>` : n ? `<a href="#${n[0]}" class="${TAB === n[0] ? 'on' : ''}">${ic(n[1])}${n[2]}${n[3] && !pro() ? '<span class="pro">PRO</span>' : ''}</a>` : '<div class="sep"></div>').join('');
  if (window.__ONLY === 'music') document.title = 'ScreenPano Müzik';
  const cur = NAV.find(n => Array.isArray(n) && n[0] === TAB); $('toptitle').textContent = cur ? cur[2] : '';
}
function go(h) { if (location.hash !== '#' + h) location.hash = h; else route(); }
function route() {
  const h = location.hash.slice(1);
  const pm = /^pair=(\d{6})$/.exec(h);
  if (pm) { SUB.settings = 'devices'; TAB = 'settings'; window.__pair = pm[1]; history.replaceState(null, '', '#settings/devices'); }
  else { const [t, s] = h.split('/'); TAB = SECTIONS[t] ? t : 'home'; if (s) SUB[TAB] = s; }
  if (window.__ONLY) TAB = window.__ONLY; // yalnız Müzik sayfası: başka bölüme geçilemez
  // kaydedilmemiş değişiklik varsa önce bölümde kalınır; kullanıcı "Kaydetmeden çık" derse hedefe gidilir
  const leave = (sec, back, msg, clear) => { const to = location.hash.slice(1); TAB = sec; history.replaceState(null, '', '#' + back);
    UI.ask(msg, { ok: 'Kaydetmeden çık', danger: true }).then(ok => { if (ok) { clear(); location.hash = to; } }); };
  if (PREV === 'design' && TAB !== 'design' && EDIT.dirty) { leave('design', 'design/layout', 'Düzende kaydedilmemiş değişiklikler var. Kaydetmeden çıkılsın mı?', () => { EDIT.dirty = false; EDIT.layout = null; }); if (TAB === PREV) return; }
  if (PREV === 'menu' && TAB !== 'menu' && MENU && MENU.__dirty) { leave('menu', 'menu', 'Fiyat listesinde kaydedilmemiş değişiklikler var. Kaydetmeden çıkılsın mı?', () => { MENU.__dirty = 0; MENU = null; }); if (TAB === PREV) return; }
  PREV = TAB; menu(false); if ($('modal').classList.contains('on')) closeModal(); render(); scrollTo(0, 0);
}
addEventListener('hashchange', route);
// D1: bölüm metinlerinin başındaki emoji simgeleri tek tip çizgi ikona çevrilir (çeviri katmanı işini bitirdikten sonra)
const EMO = { '📺': 'tv', '📷': 'camera', '📸': 'camera', '⏱': 'clock', '⚽': 'trophy', '🏟': 'trophy', '🎂': 'cake', '🎁': 'gift', '★': 'star', '📌': 'map-pin', '📍': 'map-pin', '🔒': 'lock', '✨': 'sparkles', '🔥': 'flame', '↶': 'undo-2', '⟲': 'rotate-ccw', '🌍': 'languages', '📱': 'smartphone', '💻': 'monitor', '🎵': 'music', '🎉': 'party-popper', '📰': 'newspaper', '📣': 'megaphone', '🧾': 'receipt-text', '💼': 'briefcase', '⚠': 'triangle-alert', '🔗': 'external-link', '🎬': 'film', '⚙': 'settings', '📊': 'chart-column' };
const EMO_RE = new RegExp('^\\s*(' + Object.keys(EMO).join('|') + ')\\uFE0F?\\s*');
function iconize(root) {
  (root || $('view')).querySelectorAll('button, a.btn, h3, h4, .chip, summary b, .jump button').forEach(el => {
    const t = [...el.childNodes].find(n => n.nodeType === 3 && n.nodeValue.trim()); if (!t || t !== [...el.childNodes].find(n => n.nodeType !== 8 && (n.nodeType !== 3 || n.nodeValue.trim()))) return;
    const m = EMO_RE.exec(t.nodeValue); if (!m) return;
    t.nodeValue = t.nodeValue.slice(m[0].length); el.insertAdjacentHTML('afterbegin', ic(EMO[m[1]]) + ' ');
  });
}
function render(keepScroll) {
  const y = scrollY;
  drawNav();
  const sec = SECTIONS[TAB];
  document.body.classList.toggle('ytm-on', TAB === 'music'); // müzik bölümü YouTube Music'in koyu zemininde
  document.body.classList.toggle('sp-on', TAB === 'music' && typeof SPMODE === 'function' && SPMODE()); // Spotify kaynağı seçiliyse Spotify görünümü
  $('view').innerHTML = sec.html();
  if (sec.after) sec.after();
  drawJump();
  requestAnimationFrame(() => setTimeout(() => { iconize(); iconize($('banner')); }, 0));
  setTimeout(scalePv, 30);
  if (keepScroll) scrollTo(0, y);
}
// Sayfa içi hızlı erişim: kart başlıkları üstte sabit bir şeritte; tıklayınca ekran o karta kayar ve kart kısa süre vurgulanır
function drawJump() {
  const v = $('view'), cards = [...v.querySelectorAll('.card')].filter(c => { const h = c.querySelector(':scope > .ch h3'); return h && h.textContent.trim(); });
  if (cards.length < 3) return;
  const bar = document.createElement('div'); bar.className = 'jump';
  cards.forEach((c, i) => {
    c.id = 'kart-' + i;
    const a = document.createElement('button'); a.type = 'button';
    a.textContent = [...c.querySelector('.ch h3').childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim() || c.querySelector('.ch h3').textContent.trim(); // yalnız başlık metni (sayı, etiket ayrı çevrilir)
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
// "…'den beri çevrimdışı" için saat (bugün değilse gün ve saat); göreli "x dk önce" diğer dillere çevrilemiyordu
const offSince = ms => new Date(ms).toLocaleString(I18N.locale, new Date(ms).toDateString() === new Date().toDateString() ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function drawBanner() {
  const t = S.me.tenant, acc = t.access, days = acc.until ? Math.ceil((acc.until - Date.now()) / 86400000) : 0;
  let h = '';
  // S6: süper yönetici görünümü: en üstte ince, sabit şerit (her sayfada yer kaplamaz)
  let ib = $('impbar'); if (S.me.user.impersonating && !ib) { ib = document.createElement('div'); ib.id = 'impbar'; document.body.prepend(ib); document.body.classList.add('imp'); }
  if (ib) ib.innerHTML = `<span>Süper yönetici olarak <b>${esc(t.name)}</b> işletmesini görüntülüyorsunuz.</span><button type="button" onclick="unimp()">Süper yönetime dön</button>`;
  if (!acc.ok) h += `<div class="bn bad"><span><b>${acc.reason === 'suspended' ? 'Hesabınız askıya alındı.' : 'Abonelik süreniz doldu.'}</b> Ekranınız şu an kapalı; paketiniz yenilenince kendiliğinden açılır.</span></div>`;
  if (S.db && S.db.deletion) h += `<div class="bn bad"><span><b>Hesap silme talebi var.</b> ${fmtDate(S.db.deletion.executeAt)} tarihinde tüm veriler kalıcı olarak silinecek.</span><a class="btn s g" href="#settings/privacy">Vazgeç</a></div>`;
  const off = S.scr && S.scr.devices.filter(d => !d.online && d.last_seen && Date.now() - d.last_seen > (S.scr.offlineMin || 10) * 60000 && Date.now() - d.last_seen < 7 * 86400000);
  if (acc.ok && off && off.length) h += `<div class="bn trial"><span><b>${esc(off[0].name || 'TV kutusu')}</b> ${offSince(off[0].last_seen)} beri çevrimdışı. Kutunun elektriğini, internetini ve uygulamanın açık olduğunu kontrol edin.</span><a class="btn s g" href="#settings/devices">Cihazlar</a></div>`;
  if (!acc.ok) {} else if (acc.kind === 'trial') h += `<div class="bn trial"><span>Deneme süreniz <b>${days} gün</b> sonra (${fmtDate(acc.until)}) bitiyor. Deneme boyunca tüm Pro özellikler açık.</span></div>`;
  $('banner').innerHTML = h;
}

/* ================= ÖZET ================= */
const SECTIONS = {};
// Özet sayfasındaki "ilgilenmeniz gerekenler" listesi
function attention(db, t, devs) {
  const out = [], acc = t.access, now = Date.now(), day = 86400000;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
  for (const d of devs.filter(d => !d.online && d.last_seen && now - d.last_seen > 10 * 60000 && now - d.last_seen < 7 * day))
    out.push({ lv: 'bad', t: esc(d.name || 'TV kutusu'), s: `<span>Çevrimdışı, son görülme</span>: <span>${ago(d.last_seen)}</span>`, href: '#settings/devices' });
  if (acc.ok && acc.until && acc.until - now <= (acc.kind === 'trial' ? 3 : 7) * day)
    out.push({ lv: 'warn', t: acc.kind === 'trial' ? 'Deneme süreniz bitiyor' : 'Aboneliğiniz bitiyor', s: `<span>Bitiş tarihi</span>: ${fmtDate(acc.until)}`, href: '#settings/plan' });
  if (!(db.notify || {}).email) out.push({ lv: 'warn', t: 'E-posta adresi eklenmemiş', s: 'Ekran durumu uyarıları (çevrimdışı, yeniden bağlandı) için bir e-posta ekleyin', href: '#settings/devices' });
  const oldM = db.videos.filter(v => !v.hidden && v.sch && v.sch.end && v.sch.end < today);
  if (oldM.length) out.push({ lv: 'warn', t: 'Süresi geçmiş medya var', s: `${oldM.length} <span>içeriğin gösterim tarihi bitti, ekranda görünmüyor</span>`, href: '#media' });
  const oldC = (db.campaigns || []).filter(c => c.enabled && c.sch && c.sch.end && c.sch.end < today);
  if (oldC.length) out.push({ lv: 'warn', t: 'Süresi geçmiş duyuru var', s: `${oldC.length} <span>duyurunun gösterim tarihi bitti</span>`, href: '#promo' });
  return out;
}
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
    const att = attention(db, t, S.scr.devices);
    return head(esc(t.name), 'Ekranınızın durumu, kurulum adımları ve hızlı işlemler.', `<a class="btn g" href="/tv?preview=1" target="_blank">📺 TV ekranını aç</a>`)
      + (att.length ? card('İlgilenmeniz gerekenler', 'Kırmızılar acil, sarılar yakında ilgilenilecek işler.', att.map(a => `<a class="att ${a.lv}" href="${a.href}"><span class="b"><b>${a.t}</b><span>${a.s}</span></span><span>›</span></a>`).join(''), '', 'mb') : '')
      + `<div class="grid g2" style="margin-bottom:18px">`
      + card('Canlı önizleme', 'TV\'lerinizde şu an görünen ekran.', pvFrame() + `<div class="row mt">${devs.length ? `<span class="pill ${online ? 'ok' : 'warn'}"><span class="dot ${online ? 'on' : ''}"></span>${online ? 'Cihaz bağlı' : 'Cihaz şu an çevrimdışı'}</span>` : '<span class="pill bad">Henüz cihaz bağlanmadı</span>'}<span style="flex:1"></span><button class="btn s g" onclick="act('POST','/devices/reload',undefined,'TV\\'lere yenileme komutu gönderildi',false)">↻ TV\'yi yenile</button></div>`)
      + (done === steps.length
        ? card('Ekranlarınız', `<span class="okline">${ic('circle-check')} Kurulum tamam · ${done}/${steps.length} adım</span>`, devs.length ? `<div class="list">${devs.map(d => `<a class="it devl" href="#settings/devices"><span class="dot ${d.online ? 'on' : ''}"></span><div class="b"><b>${esc(d.name || 'TV kutusu')}</b><span>${d.online ? 'Bağlı · içerik güncel' : 'Çevrimdışı · son görülme ' + ago(d.last_seen || d.lastSeen)}</span></div>${ic('chevron-right')}</a>`).join('')}</div>` : '<div class="empty">Henüz cihaz bağlanmadı</div>')
        : card(`Kurulum adımları <span class="muted">· ${done}/${steps.length}</span>`, 'Sırayla tamamlayın; her adım ilgili sayfayı açar.',
        `<div class="steps">${steps.map((s, i) => `<a class="step ${s[0] ? 'done' : ''}" href="${s[3]}"><span class="n">${s[0] ? '✓' : i + 1}</span><span class="b"><b>${s[1]}</b><span>${s[2]}</span></span><span>›</span></a>`).join('')}</div>`))
      + `</div>`
      + card('Hızlı işlemler', 'Ekranda anında bir gösterim başlatır; ayarlarınızı değiştirmez.', `<div class="row">
          <button class="btn g" onclick="act('POST','/goal/test',undefined,'Gol animasyonu gönderildi',false)" ${pro() ? '' : 'disabled'}>⚽ Gol animasyonunu dene</button>
          <button class="btn g" onclick="act('POST','/birthday/fire',undefined,'Doğum günü kutlaması gönderildi (seçili kişi yoksa görünmez)',false)" ${pro() ? '' : 'disabled'}>🎂 Doğum günü kutlamasını göster</button>
          <button class="btn g" onclick="bigTest()" ${pro() ? '' : 'disabled'}>🏟 Büyük maç görselini dene</button>
          ${camp ? `<button class="btn g" onclick="act('POST','/campaigns/${camp.id}/test',undefined,'Kampanya kartı gönderildi',false)">🎁 Kampanya kartını göster</button>` : ''}
        </div>`)
      + `<div class="grid g3">
          <div class="stat"><b>${db.videos.length}</b><span>Video ve fotoğraf</span></div>
          <div class="stat"><b>${online}/${devs.length}</b><span>Bağlı cihaz</span></div>
          <div class="stat"><b>${esc(t.plan.name)}</b><span>${t.access.kind === 'unlimited' ? 'Süresiz' : t.access.ok ? (t.access.kind === 'trial' ? 'Deneme · ' : '') + fmtDate(t.access.until) + ' tarihine kadar' : 'Süresi doldu'}</span></div>
        </div>`;
  },
};

/* ================= TASARIM ================= */
const EDIT = { layout: null, sel: -1, hist: [], dirty: false };
// Düzen araç çubuğu (Hazır düzenler ve Düzen kartlarının başlığında): değişiklik varsa Geri al + Kaydet görünür
const layoutBar = () => `<div class="row lbar${EDIT.dirty ? '' : ' clean'}"><button class="btn g s dyn" onclick="undoL()">↶ Geri al</button><button class="btn s dyn" onclick="saveL()">Düzeni kaydet</button><button class="btn g s" onclick="resetDesign('layout')">⟲ Sıfırla</button><button class="btn g s" id="gridbtn" onclick="gridSet(((EDIT.layout||{}).cols||24)===48?24:48)" title="Hizalamayı daha ince ayarlamak için ızgarayı sıklaştırır; kutular yerinde kalır">▦ İnce ızgara</button><button class="btn g s" onclick="gotoPv()">👁 Önizleme</button><button class="btn g s" onclick="openDraft()">↗ Yeni sekmede</button></div>`;
const lbarSync = () => { document.querySelectorAll('.lbar').forEach(b => b.classList.toggle('clean', !EDIT.dirty)); pushDraft(); };
// Kaydedilmemiş düzeni önizleme çerçevesine ve (ayrı sekme için) localStorage'a ilet; değişiklik yoksa kaydedilmiş hâle döner
function pushDraft() {
  const L = EDIT.dirty && EDIT.layout ? EDIT.layout : null;
  try { localStorage.setItem('sp.draft', JSON.stringify(L)); } catch (e) {}
  document.querySelectorAll('.pvcard iframe').forEach(f => { try { f.contentWindow.postMessage({ screenpanoDraft: L }, location.origin); } catch (e) {} });
}
function openDraft() { pushDraft(); window.open('/tv?preview=1&draft=1', '_blank'); }
function gotoPv() {
  const c = document.querySelector('.pvcard'); if (!c) return;
    c.scrollIntoView({ behavior: 'smooth', block: 'center' }); c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash');
}
SECTIONS.design = {
  html() {
    const sub = SUB.design || 'layout';
    let h = head('Tasarım', 'Ekranınızın düzeni, renkleri, logosu ve TV ayarları. Kaydedince TV anında güncellenir.',
      (sub === 'layout' ? `<button class="btn g" onclick="undoL()">↶ Geri al</button><button class="btn" onclick="saveL()">Düzeni kaydet</button>` : '')
      + `<button class="btn g" onclick="resetDesign('${sub}')">⟲ Varsayılana sıfırla</button>`)
      + tabs('design', [['layout', 'Düzen'], ['colors', 'Renk ve logo'], ['tv', 'TV ayarları']]);
    if (sub === 'layout') {
      const T = S.cat.templates;
      const fresh = !S.me.tenant.logo && !S.db.videos.length;
      h += `<details class="card stx"${fresh ? ' open' : ''}><summary><b>${fresh ? 'Başlangıç paketleri' : 'Başlangıç paketiyle baştan kur'}</b><span class="muted">Düzen, renkler ve örnek ürün listesi birlikte değişir</span></summary>` + card('', 'İşletme türünüzü seçin: ekran düzeni, renkler ve örnek ürün listesi birlikte gelir. Medyanız, logonuz ve diğer ayarlarınız silinmez; fiyatları kendiniz girersiniz.', `<div class="tpls">${(S.cat.starters || []).map(v => `<button class="tpl" onclick="applyStarter('${v.key}')"><div class="mini" style="background:${v.theme.bg}">${v.widgets.map(w => `<i style="left:${w.x / 24 * 100}%;top:${w.y / 24 * 100}%;width:${w.w / 24 * 100}%;height:${w.h / 24 * 100}%;background:${v.theme.accent2};opacity:.55"></i>`).join('')}</div><b>${esc(v.name)}</b><span>${esc(v.desc)}</span></button>`).join('')}</div>`) + `</details>`
        + card('Hazır düzenler', 'Birini seçin, sonra aşağıda dilediğiniz gibi değiştirin.', `<div class="tpls">${Object.entries(T).map(([k, v]) => `<button class="tpl" onclick="applyTpl('${k}')"><div class="mini">${v.widgets.map(w => `<i style="left:${w.x / 24 * 100}%;top:${w.y / 24 * 100}%;width:${w.w / 24 * 100}%;height:${w.h / 24 * 100}%"></i>`).join('')}</div><b>${esc(v.name)}</b><span>${esc(v.desc)}</span></button>`).join('')}</div>`, layoutBar())
        + designsCard()
        + card('Düzen', 'Kutuları sürükleyerek taşıyın, herhangi bir kenar ya da köşesinden tutup boyutlandırın, tıklayınca ayarları sağda açılır.',
          `<div class="editor"><div id="cw"><div id="cv"></div></div><div id="props"></div></div>
           <div class="fl mt"><span>Widget ekle</span><div id="pal" class="chips"></div></div>`, layoutBar())
        + card('Önizleme', 'Yaptığınız değişiklikler (kaydetmeden önce) burada görünür; beğenince "Düzeni kaydet"e basın.', pvFrame(true), '<button class="btn g s" onclick="openDraft()">↗ Yeni sekmede aç</button>', 'pvcard');
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
            ${fl('Kart stili (tüm widget kutuları)', `<select id="th-box">${BOXES.map(([k, l]) => `<option value="${k}" ${(th.box || (th.glass ? 'glass' : 'accent')) === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
            ${fl('Yazı tipi', `<select id="th-font">${S.cat.fonts.map(f => `<option ${f === th.font ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>`)}
          </div><div class="row end mt"><button class="btn" onclick="saveTheme()">Renkleri kaydet</button></div>`)
        + card('Önizleme', '', pvFrame());
    } else {
      const db = S.db, sv = k => db['safe' + k] != null ? db['safe' + k] : (db.safeInset || 0);
      h += card('Kenar payı (TV görüntüyü kırpıyorsa)', 'Bazı TV\'ler görüntünün kenarlarını keser. Önce TV\'nin görüntü ayarından "Tam ekran / Ekrana sığdır / Just Scan" seçeneğini deneyin; olmazsa buradan küçültün. Kutu tüm TV\'lere aynı görüntüyü verdiği için ayar hepsini etkiler.',
        `<div class="swr"><div class="b"><b>Hizalama çerçevesini göster</b><span>TV\'de yeşil bir çerçeve çıkar; dört kenarı görünene kadar payları artırın, sonra kapatın.</span></div>${sw(db.safeGuide, "opt('safeGuide',this.checked)")}</div>
         <div class="f mt">${['L', 'R', 'T', 'B'].map(k => fl(`${{ L: 'Sol', R: 'Sağ', T: 'Üst', B: 'Alt' }[k]}: <b id="sv${k}">${sv(k)}</b>%`, `<input type="range" min="0" max="20" step="0.5" value="${sv(k)}" id="safe${k}" oninput="$('sv${k}').textContent=this.value" onchange="saveSafe()">`)).join('')}</div>
         <div class="row end mt"><button class="btn g s" onclick="resetSafe()">Sıfırla</button></div>`);
    }
    return h;
  },
  after() {
    if (SUB.design === 'colors') { drawLogoSuggestions(); return; }
    if ((SUB.design || 'layout') !== 'layout') return;
    if (!EDIT.layout || !EDIT.dirty) { EDIT.layout = clone(S.scr.layout); EDIT.hist = []; EDIT.sel = -1; }
    drawCanvas(); drawProps(); drawPal(); dragSetup();
    document.querySelectorAll('#gridbtn').forEach(b => b.classList.toggle('on', (EDIT.layout.cols || 24) === 48));
  },
};
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const isFloat = t => t === 'qr' || t === 'text';
const floats = (a, b) => isFloat(a.type) !== isFloat(b.type); // QR ve yazı kutuları medyanın veya diğer kutuların üstüne konabilir
const badSet = () => { const ws = EDIT.layout.widgets, bad = new Set(); ws.forEach((a, i) => ws.forEach((b, j) => { if (i < j && overlap(a, b) && !floats(a, b)) { bad.add(i); bad.add(j); } })); return bad; };
function drawCanvas() {
  const c = $('cv'); if (!c) return;
  const bad = badSet(), G = EDIT.layout.cols || 24; lbarSync();
  c.style.backgroundSize = `calc(100% / ${G}) calc(100% / ${G})`;
  c.innerHTML = EDIT.layout.widgets.map((w, i) => {
    const d = S.cat.widgets[w.type] || { name: w.type };
    const p = w.props || {};
    const isFl = w.type === 'qr' || w.type === 'text';
    const txtPrev = w.type === 'text' ? (p.title || p.body ? esc((p.title || '') + (p.title && p.body ? ' ' : '') + (p.body || '')).slice(0, 34) : 'Yazı kutusu') : esc(d.name);
    const sub = d.pro && !pro() ? '🔒 Pro'
      : w.type === 'qr' ? esc(((S.db.qrs || []).find(q => q.id === p.qr) || { label: 'Tümü' }).label) + ' · ' + w.w + '×' + w.h
      : w.type === 'text' ? (p.size ? p.size.toUpperCase() + ' · ' : '') + w.w + '×' + w.h
      : w.w + '×' + w.h;
    return `<div class="wb ${i === EDIT.sel ? 'sel' : ''} ${bad.has(i) ? 'bad' : ''}${isFl ? ' fl' : ''}" data-i="${i}" style="left:${w.x / G * 100}%;top:${w.y / G * 100}%;width:${w.w / G * 100}%;height:${w.h / G * 100}%">${ICON[w.type] || ''}<span>${txtPrev}</span><small>${sub}</small>${['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(h => `<i class="rz rz-${h}" data-h="${h}"></i>`).join('')}</div>`;
  }).join('');
}
// Izgara inceliği: 24 (normal) ya da 48 (ince). Koordinatlar iki katına çıkar / yarıya iner; kutular yerinde kalır
function gridSet(n, quiet) {
  if (!EDIT.layout) return;
  const L = EDIT.layout, cur = L.cols || 24; if (cur === n) return;
  if (!quiet) snap();
  const f = n / cur;
  L.widgets.forEach(w => { const x = Math.round(w.x * f), y = Math.round(w.y * f); w.w = Math.max(1, Math.round((w.x + w.w) * f) - x); w.h = Math.max(1, Math.round((w.y + w.h) * f) - y); w.x = x; w.y = y; });
  L.cols = L.rows = n;
  if (!quiet) { EDIT.dirty = true; drawCanvas(); drawProps(); document.querySelectorAll('#gridbtn').forEach(b => b.classList.toggle('on', n === 48)); }
}
function drawPal() {
  const used = new Set(EDIT.layout.widgets.map(w => w.type));
  const n = k => EDIT.layout.widgets.filter(w => w.type === k).length;
  $('pal').innerHTML = Object.entries(S.cat.widgets).map(([k, d]) => { const full = d.multi ? n(k) >= d.multi : used.has(k); return `<span class="chip ${full ? 'dim' : ''}" title="${esc(d.desc)}" onclick="addW('${k}')">${ICON[k] || ''} ${esc(d.name)}${d.pro && !pro() ? ' 🔒' : d.multi && n(k) ? ` ×${n(k)}` : used.has(k) ? ' ✓' : ''}</span>`; }).join('');
}
const HINT = { media: 'Videolar ve fotoğraflar <a href="#media">Medya</a> sayfasından. Kampanya kartı, büyük maç ve fragmanlar da bu kutuda çıkar.', info: 'Maçlar <a href="#sport">Spor</a>, diğer sayfalar <a href="#info">Bilgi Bandı</a> sayfasından açılıp kapanır.', reviews: 'Google ve Instagram yorumları <a href="#promo">Kampanya ve yorumlar</a> sayfasından bağlanır.', qr: 'QR kodlar <a href="#qr">QR Kodlar</a> sayfasından eklenir.', logo: 'Logo <a href="#design/colors">Renk ve logo</a> sekmesinden yüklenir.', menu: 'Ürünler <a href="#menu">Fiyat Listesi</a> sayfasından girilir.', ticker: 'Skorlar, kurlar, haberler ve bilgiler sırayla kayar.' };
const BOXES = [['accent', 'Düz (vurgu rengi tonlu)'], ['glass', 'Cam (yarı saydam koyu)'], ['dark', 'Koyu dolgu'], ['outline', 'Yalnız çerçeve'], ['none', 'Kutusuz']];
// her widget için kutu görünümü: tema stilini izler ya da kutuya özel stil ve renk
function boxSection(w) {
  const p = w.props || {}, th = S.me.tenant.theme || {};
  return `<div class="fl mt"><span>Kutu stili</span><select onchange="setP('box',this.value);drawCanvas()"><option value="">Temayla aynı</option>${BOXES.map(([k, l]) => `<option value="${k}" ${p.box === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`
    + `<div class="fl mt"><span>Kutu rengi</span><div class="row" style="gap:8px;align-items:center"><input type="color" value="${p.tint || th.accent2 || '#c9955c'}" onchange="setP('tint',this.value);drawProps()"><button class="btn xs g" onclick="setP('tint','');drawProps()" ${p.tint ? '' : 'disabled'}>Temayla aynı</button></div></div>`;
}
function drawProps() {
  const box = $('props'), w = EDIT.layout.widgets[EDIT.sel];
  if (!w) { box.innerHTML = `<h4>Widget ayarları</h4><p class="muted">Ayarlarını görmek için bir kutuya tıklayın.</p>${badSet().size ? '<p class="muted mt" style="color:var(--bad)">Kırmızı kutular üst üste biniyor; kaydetmeden önce düzeltin.</p>' : ''}${EDIT.dirty ? '<p class="muted mt" style="color:var(--warn)">Kaydedilmemiş değişiklikler var.</p>' : ''}`; return; }
  const d = S.cat.widgets[w.type] || {}, p = w.props || {};
  const tg = (k, label, def = true) => `<div class="swr"><div class="b"><b>${label}</b></div>${sw(p[k] === undefined ? def : p[k], `setP('${k}',this.checked)${k === 'qr' || k === 'rates' ? ';drawProps()' : ''}`)}</div>`;
  let f = '';
  if (w.type === 'clock') {
    const sh = p.show || 'both', swc = (k, label, on) => `<div class="swr"><div class="b"><b>${label}</b></div>${sw(on, `setClk('${k}',this.checked)`)}</div>`;
    f = `<p class="muted" style="margin:6px 0 0">Saati bir kutuya, tarihi başka bir kutuya koymak için iki ayrı Saat ve tarih kutusu ekleyip birinde tarihi, diğerinde saati gizleyin.</p>` + swc('time', 'Saati göster', sh !== 'date') + swc('date', 'Tarihi göster', sh !== 'time') + (sh === 'date' ? '' : tg('seconds', 'Saniyeyi göster', false));
  }
  if (w.type === 'rates') {
    f = `<p class="muted" style="margin:6px 0 0">Havayı bir kutuya, piyasaları başka bir kutuya koymak için iki ayrı Hava ve piyasalar kutusu ekleyip birinde piyasaları, diğerinde havayı kapatın.</p>` + tg('weather', 'Hava durumu') + tg('rates', 'Döviz, altın, borsa') + (p.rates !== false ? fl('Tutar ve değişim boyutu', `<select onchange="setP('valSize',this.value)">${[['s', 'Küçük'], ['m', 'Normal'], ['l', 'Büyük'], ['xl', 'Çok büyük (şu anki)']].map(([v, l]) => `<option value="${v}" ${(p.valSize || 'xl') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`) : '') + tg('qr', 'QR kodlar', false);
    if (p.qr) {
      const qs = S.db.qrs || [], sel = String(p.qrs || '').split(',').filter(Boolean);
      f += qs.length ? `<div class="fl mt"><span>Gösterilecek QR'lar (seçmezseniz hepsi)</span><div class="chips">${qs.map(q => `<span class="chip ${sel.includes(q.id) ? 'on' : ''}" onclick="rQrPick('${q.id}')">${esc(q.label)}</span>`).join('')}</div></div><p class="muted mt">1-2 QR yan yana gösterilir; 3 ve fazlası tek tek, geçişli olarak sırayla değişir.</p>` : '<p class="muted mt">Önce <a href="#qr">QR Kodlar</a> sayfasından QR ekleyin.</p>';
    }
  }
  if (w.type === 'media') f = fl('Görüntü yerleşimi', `<select onchange="setP('fit',this.value)">${[['auto', 'Tamamı görünsün, boşluk bulanık dolsun (önerilen)'], ['cover', 'Kutuyu doldur (kenarlar kırpılabilir)'], ['contain', 'Tamamı görünsün (boşluk kalabilir)']].map(([v, l]) => `<option value="${v}" ${(p.fit || 'auto') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`) + '<p class="muted mt">Otomatik: görselin oranı kutuya yakınsa kenarlar hafifçe kırpılarak doldurulur, çok farklıysa tamamı gösterilir.</p>';
  if (w.type === 'ticker') f = tg('clock', 'Solda saat kutusu');
  if (w.type === 'logo') {
    const so = (k, def, list) => `<select onchange="setP('${k}',this.value)">${list.map(([v, l]) => `<option value="${v}" ${(p[k] || def) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    f = fl('Sığdırma', so('fit', 'contain', [['contain', 'Kutuya sığdır (oran korunur)'], ['cover', 'Kutuyu doldur (kenarlar kırpılabilir)'], ['fill', 'Kutuya ger (oran bozulabilir)']]))
      + fl('Hizalama', so('align', 'center', [['left', 'Sola'], ['center', 'Ortaya'], ['right', 'Sağa']]))
      + fl('İç boşluk', so('pad', 'none', [['none', 'Yok'], ['sm', 'Az'], ['lg', 'Çok']]));
  }
  if (w.type === 'text') {
    const EMO_LIST = [
      ['✍️', 'Kalem / Rezervasyon'], ['📝', 'Not'], ['✏️', 'Kurşun Kalem'], ['📅', 'Takvim'], ['🛎️', 'Resepsiyon'],
      ['📞', 'Telefon'], ['📱', 'Cep Telefonu'], ['☎️', 'Sabit Hat'], ['✉️', 'Mektup'], ['📧', 'E-posta'],
      ['🍽️', 'Masa / Restoran'], ['☕', 'Kahve'], ['🥂', 'Lounge'], ['📍', 'Konum'],
      ['⏱️', 'Saat'], ['ℹ️', 'Bilgi'], ['🔔', 'Duyuru'], ['⭐', 'Yıldız'], ['🔥', 'Popüler'], ['✨', 'Özel'], ['💬', 'WhatsApp / Sohbet'], ['🌐', 'Web']
    ];
    const PRESETS = [
      ['✍️ Rezervasyon İçin:', '0216 000 00 00'],
      ['📞 Rezervasyon:', '0212 000 00 00'],
      ['📱 WhatsApp İletişim:', '0530 000 00 00'],
      ['✉️ E-posta:', 'info@ornek.com'],
      ['🍽️ Masa Rezervasyonu', 'Lütfen rezervasyon yaptırınız'],
      ['ℹ️ Danışma & Bilgi:', 'Haftanın her günü 09:00 - 00:00'],
      ['🔔 Özel Duyuru', 'Hoş geldiniz!']
    ];
    f = `<div class="fl"><span>Hızlı şablon seç</span><div class="chips" style="gap:5px;flex-wrap:wrap">${PRESETS.map(([t, b]) => `<button type="button" class="chip s" onclick="setTxtPreset('${esc(t)}','${esc(b)}')">${esc(t.replace(':', ''))}</button>`).join('')}</div></div>`
      + `<div class="fl mt"><span>Emoji ekle <small class="muted">(tıklayınca son seçili alana eklenir)</small></span><div class="chips" style="gap:4px;flex-wrap:wrap;font-size:16px">${EMO_LIST.map(([emo, title]) => `<button type="button" class="chip xs" title="${title}" onclick="insTxtEmoji('${emo}')" style="min-width:32px;padding:3px 6px">${emo}</button>`).join('')}</div></div>`
      + fl('Başlık', `<input type="text" id="txt-title" maxlength="200" value="${esc(p.title || '')}" onfocus="window.__txtFocus='title'" oninput="setP('title',this.value);drawCanvas()" placeholder="Örn: ✍️ Rezervasyon İçin:">`)
      + fl('Metin / Açıklama', `<textarea id="txt-body" maxlength="400" rows="3" onfocus="window.__txtFocus='body'" oninput="setP('body',this.value);drawCanvas()" placeholder="Örn: 0216 606 26 27">${esc(p.body || '')}</textarea>`)
      + `<div class="f">${fl('Hizalama', `<select onchange="setP('align',this.value)">${[['left', 'Sola'], ['center', 'Ortaya'], ['right', 'Sağa']].map(([v, l]) => `<option value="${v}" ${(p.align || 'center') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}`
      + `${fl('Yazı boyutu', `<select onchange="setP('size',this.value)">${[['xs', 'Çok küçük'], ['s', 'Küçük'], ['m', 'Orta'], ['l', 'Büyük'], ['xl', 'Çok büyük']].map(([v, l]) => `<option value="${v}" ${(p.size || 'm') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}</div>`;
  }
  if (w.type === 'image') f = `${p.url ? `<img src="${esc(p.url)}" style="width:100%;max-height:150px;object-fit:contain;background:#000;border-radius:8px;margin-top:8px">` : ''}<input type="file" id="assetf" accept="image/*" hidden onchange="upAsset(this)"><div class="row mt"><button class="btn s" onclick="$('assetf').click()">Resim yükle</button></div>`
    + fl('Yerleşim', `<select onchange="setP('fit',this.value)"><option value="cover" ${p.fit !== 'contain' ? 'selected' : ''}>Kutuyu doldur</option><option value="contain" ${p.fit === 'contain' ? 'selected' : ''}>Tamamı görünsün</option></select>`)
    + ((S.db.assets || []).length ? `<div class="thumbs">${S.db.assets.slice(-10).reverse().map(a => `<div class="t" style="cursor:pointer" onclick="setP('url','${S.me.upBase}${a.file}');drawProps()"><img src="${S.me.upBase}${a.file}"></div>`).join('')}</div>` : '');
  if (w.type === 'qr') { const qs = S.db.qrs || []; f = qs.length ? fl('Gösterilecek QR', `<select onchange="setP('qr',this.value);drawCanvas()"><option value="">Tümü (sırayla döner)</option>${qs.map(q => `<option value="${q.id}" ${p.qr === q.id ? 'selected' : ''}>${esc(q.label)}</option>`).join('')}</select>`) + fl('Yerleşim', `<select onchange="setP('style',this.value);drawCanvas()">${[['below', 'Etiket altta'], ['right', 'Etiket sağda (dikey)'], ['left', 'Etiket solda (dikey)'], ['plain', 'Yalnız QR (yazısız)']].map(([k, l]) => `<option value="${k}" ${(p.style || 'below') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`) + fl('Tasarım', `<select onchange="setP('look',this.value);drawCanvas()">${[['classic', 'Klasik'], ['card', 'Kart (zarif, temayla uyumlu)'], ['soft', 'Sade (çerçevesiz)']].map(([k, l]) => `<option value="${k}" ${(p.look || 'classic') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`) + fl('QR boyutu', `<select onchange="setP('size',this.value);drawCanvas()">${[['xs', 'Çok küçük'], ['s', 'Küçük'], ['auto', 'Normal'], ['l', 'Büyük'], ['xl', 'Çok büyük'], ['box', 'Kutuya sığdır']].map(([k, l]) => `<option value="${k}" ${(p.size || 'auto') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`) + fl('Yazı boyutu', `<select onchange="setP('text',this.value);drawCanvas()">${[['s', 'Küçük'], ['m', 'Normal'], ['l', 'Büyük']].map(([k, l]) => `<option value="${k}" ${(p.text || 'm') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`) + (p.qr && qs.find(q => q.id === p.qr) ? `<div style="width:120px;background:#fff;border-radius:10px;padding:6px;margin-top:10px">${qs.find(q => q.id === p.qr).svg}</div>` : '') + '<p class="muted mt" style="font-size:12px">QR kartı diğer kutuların (ör. medyanın) üstüne konabilir. Birden çok QR kartı ekleyip her birine ayrı QR seçebilirsiniz.</p>' : '<p class="muted mt">Henüz QR kod yok</p>'; }
  if (w.type === 'menu') f = fl('Başlık (boşsa fiyat listesinin başlığı)', `<input type="text" maxlength="40" value="${esc(p.title || '')}" onchange="setP('title',this.value)">`);
  // çoklu dil açıksa: başlık ve metnin çevirileri
  const LL = langList();
  if (LL.length && (w.type === 'text' || w.type === 'menu')) f += `<div class="mt"><b style="font-size:13px">Çeviriler</b>${LL.map(l => fl(LANG_NAMES[l] + ' başlık', `<input type="text" maxlength="200" value="${esc(((p.i18n || {})[l] || {}).title || '')}" onchange="setPI('${l}','title',this.value)">`) + (w.type === 'text' ? fl(LANG_NAMES[l] + ' metin', `<textarea maxlength="400" onchange="setPI('${l}','body',this.value)">${esc(((p.i18n || {})[l] || {}).body || '')}</textarea>`) : '')).join('')}</div>`;
  box.innerHTML = `<h4>${ICON[w.type] || ''} ${esc(d.name)}</h4><p class="muted">${esc(d.desc || '')}${HINT[w.type] ? '<br><br>' + HINT[w.type] : ''}</p>${f}${w.type === 'media' ? '' : boxSection(w)}<div class="row mt"><button class="btn d s" onclick="rmW(${EDIT.sel})">Kaldır</button></div>`;
}
function snap() { EDIT.hist.push(clone(EDIT.layout)); if (EDIT.hist.length > 40) EDIT.hist.shift(); EDIT.dirty = true; lbarSync(); }
function undoL() { if (!EDIT.hist.length) return toast('Geri alınacak değişiklik yok'); EDIT.layout = EDIT.hist.pop(); if (!EDIT.hist.length) EDIT.dirty = false; EDIT.sel = -1; drawCanvas(); drawProps(); drawPal(); }
function setPI(l, k, v) { const w = EDIT.layout.widgets[EDIT.sel]; if (!w) return; snap(); const i = clone((w.props || {}).i18n || {}); i[l] = { ...(i[l] || {}), [k]: v }; w.props = { ...(w.props || {}), i18n: i }; }
function rQrPick(id) { const w = EDIT.layout.widgets[EDIT.sel]; if (!w) return; const sel = new Set(String((w.props || {}).qrs || '').split(',').filter(Boolean)); sel.has(id) ? sel.delete(id) : sel.add(id); setP('qrs', [...sel].join(',')); drawProps(); }
function setClk(k, on) {
  const w = EDIT.layout.widgets[EDIT.sel]; if (!w) return;
  const sh = (w.props || {}).show || 'both'; let t = sh !== 'date', d = sh !== 'time';
  if (k === 'time') t = on; else d = on;
  if (!t && !d) { toast('Saat ve tarihten en az biri açık olmalı', true); return drawProps(); }
  setP('show', t && d ? 'both' : t ? 'time' : 'date'); drawProps();
}
function setP(k, v) { const w = EDIT.layout.widgets[EDIT.sel]; if (!w) return; snap(); w.props = { ...(w.props || {}), [k]: v }; }
function rmW(i) { snap(); EDIT.layout.widgets.splice(i, 1); EDIT.sel = -1; drawCanvas(); drawProps(); drawPal(); }
window.__txtFocus = 'title';
function insTxtEmoji(emo) {
  const fId = window.__txtFocus === 'body' ? 'txt-body' : 'txt-title';
  const inp = $(fId);
  if (!inp) return;
  const start = inp.selectionStart ?? inp.value.length;
  const end = inp.selectionEnd ?? inp.value.length;
  const val = inp.value;
  const nVal = val.slice(0, start) + emo + val.slice(end);
  inp.value = nVal;
  inp.setSelectionRange(start + emo.length, start + emo.length);
  inp.focus();
  setP(window.__txtFocus === 'body' ? 'body' : 'title', nVal);
  drawCanvas();
}
function setTxtPreset(title, body) {
  const w = EDIT.layout.widgets[EDIT.sel]; if (!w) return;
  snap();
  w.props = { ...(w.props || {}), title, ...(body !== undefined ? { body } : {}) };
  drawCanvas(); drawProps();
}
function addW(type) {
  const d = S.cat.widgets[type];
  const cnt = EDIT.layout.widgets.filter(w => w.type === type).length;
  if (d.multi ? cnt >= d.multi : cnt) return toast(d.multi ? `En fazla ${d.multi} tane eklenebilir` : 'Bu widget düzende zaten var', true);
  if (d.pro && !pro()) toast('Bu widget Pro pakette; paketinizde ekranda görünmez', true);
  const G = EDIT.layout.cols || 24, [mw, mh] = (d.min || [3, 2]).map(v => v * G / 24); let spot = null;
  for (let y = 0; y <= G - mh && !spot; y++) for (let x = 0; x <= G - mw && !spot; x++) { const c = { x, y, w: mw, h: mh }; if (!EDIT.layout.widgets.some(w => overlap(w, c))) spot = c; }
  if (!spot && (type === 'qr' || type === 'text')) {
    const m = EDIT.layout.widgets.find(w => w.type === 'media') || { x: 0, y: 0, w: G, h: G };
    const off = cnt * mw;
    if (type === 'qr') {
      spot = { x: Math.max(0, m.x + m.w - mw - 1 - off), y: Math.max(0, m.y + m.h - mh - 1), w: mw, h: mh };
      if (EDIT.layout.widgets.some(w => w.type === 'qr' && overlap(w, spot))) spot = null; else spot.float = true;
    } else {
      spot = { x: Math.max(0, m.x + 1 + (cnt % 3) * (mw + 1)), y: Math.max(0, m.y + 1 + Math.floor(cnt / 3) * (mh + 1)), w: mw, h: mh };
      if (EDIT.layout.widgets.some(w => w.type === 'text' && overlap(w, spot))) spot = null; else spot.float = true;
    }
  }
  snap();
  const pos = spot ? { x: spot.x, y: spot.y, w: spot.w, h: spot.h } : { x: 0, y: 0, w: mw, h: mh };
  EDIT.layout.widgets.push({ type, ...pos, ...(d.props ? { props: { ...clone(d.props), ...(type === 'qr' ? { size: 'box', look: 'card' } : {}) } } : {}) }); // yeni QR kartı kutuyu izler: sürükleyerek boyutlanır
  EDIT.sel = EDIT.layout.widgets.length - 1; drawCanvas(); drawProps(); drawPal();
  if (!spot) toast('Boş yer yok: kutu sol üste kondu, diğerlerini küçültüp yerleştirin', true);
  else if (spot.float) toast(type === 'qr' ? 'QR kartı medyanın üstüne kondu; sürükleyip istediğiniz yere taşıyın' : 'Yazı kutusu medyanın üstüne kondu; sürükleyip istediğiniz yere taşıyın');
}
// Ortak tasarımlar: süper yetkili işletmenin kaydettiği düzen + renk; herkes uygular
function designsCard() {
  const ds = S.cat.designs || [], can = !!S.cat.canDesigns;
  if (!ds.length && !can) return '';
  const tiles = ds.map(v => { const G = (v.layout && v.layout.cols) || 24, th = v.theme || {};
    return `<div class="tpl" style="position:relative" onclick="applyDesign('${v.id}')"><div class="mini" style="background:${esc(th.bg || '#111')}">${v.layout.widgets.map(w => `<i style="left:${w.x / G * 100}%;top:${w.y / G * 100}%;width:${w.w / G * 100}%;height:${w.h / G * 100}%;background:${esc(th.accent || '#555')}"></i>`).join('')}</div><b>${esc(v.name)}</b><span>${esc(v.desc || '')}</span>${can ? `<button class="btn xs g" style="position:absolute;top:6px;right:6px" title="Sil" onclick="event.stopPropagation();delDesign('${v.id}')">✕</button>` : ''}</div>`; }).join('');
  return card('Ortak tasarımlar', can ? 'Kaydettiğiniz tasarımlar tüm işletmelerin panelinde görünür; onlar tek tıkla uygular (yalnız düzen ve renkler; medya, logo ve fiyat listesi değişmez).' : 'Ekran düzeni ve renkleri hazır tasarımlar. Birini seçince düzeniniz ve renkleriniz değişir (medya, logo ve fiyat listeniz korunur).',
    (ds.length ? `<div class="tpls">${tiles}</div>` : '<div class="empty">Henüz kayıtlı tasarım yok</div>'),
    can ? '<button class="btn s" onclick="saveDesign()">★ Mevcut tasarımı ortak kaydet</button>' : '');
}
async function saveDesign() {
  if (EDIT.dirty) return toast('Önce "Düzeni kaydet"e basın; kaydedilmiş düzen ve renkler ortak tasarım olur', true);
  const name = prompt('Tasarımın adı (örn. Lüks lounge 2):'); if (!name || !name.trim()) return;
  const desc = prompt('Kısa açıklama (isteğe bağlı):') || '';
  const r = await act('POST', '/designs', { name: name.trim(), desc: desc.trim() }, 'Ortak tasarım kaydedildi', false);
  if (r) { S.cat = await req('GET', '/catalog'); render(true); }
}
async function delDesign(id) {
  if (!await UI.ask('Bu ortak tasarım silinsin mi? Daha önce uygulayan işletmelerin ekranı değişmez.', { ok: 'Sil', danger: true })) return;
  if (await act('DELETE', '/designs/' + id, undefined, 'Silindi', false)) { S.cat = await req('GET', '/catalog'); render(true); }
}
async function applyDesign(id) {
  const v = (S.cat.designs || []).find(x => x.id === id); if (!v) return;
  if (!await UI.ask(`"${v.name}" tasarımı uygulansın mı? Ekran düzeniniz ve renkleriniz değişir (medya, logo ve fiyat listesi korunur).`)) return;
  EDIT.dirty = false; EDIT.layout = null;
  if (await act('POST', '/designs/' + id + '/apply', {}, 'Tasarım uygulandı', false)) { S.me = await req('GET', '/me'); S.scr = await req('GET', '/screen'); drawBrand(); render(true); }
}
async function applyStarter(k) {
  const v = (S.cat.starters || []).find(x => x.key === k); if (!v) return;
  if (!await UI.ask(`"${v.name}" paketi uygulansın mı? Ekran düzeniniz ve renkleriniz değişir (medya, logo ve diğer ayarlar korunur).`)) return;
  const body = { key: k };
  if (v.menu && S.me && S.me.tenant && (S.me.tenant.menuCount || 0) > 0) body.replaceMenu = await UI.ask('Mevcut fiyat listenizin yerine örnek liste konsun mu?\n\nTamam: örnek liste gelir (eski liste silinir)\nİptal: fiyat listeniz korunur', { cancel: 'İptal' });
  if (await act('POST', '/starter', body, 'Paket uygulandı', false)) { S.me = await req('GET', '/me'); drawBrand(); refresh(); }
}
async function applyTpl(k) {
  if (EDIT.dirty && !await UI.ask('Mevcut düzenin yerine bu şablon konsun mu?')) return;
  snap(); EDIT.layout = { cols: 24, rows: 24, widgets: clone(S.cat.templates[k].widgets) }; EDIT.sel = -1;
  drawCanvas(); drawProps(); drawPal(); toast('Şablon uygulandı; beğendiyseniz "Düzeni kaydet"e basın');
  $('cw').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
async function saveL() {
  if (badSet().size) return toast('Bazı kutular üst üste biniyor (kırmızı). Önce düzeltin.', true);
  const ok = await act('PUT', '/screen', { layout: EDIT.layout }, 'Düzen kaydedildi, TV güncellendi', false);
  if (ok) { EDIT.dirty = false; lbarSync(); S.scr = await req('GET', '/screen'); render(true); }
}
function dragSetup() {
  const wrap = $('cw'); let st = null;
  wrap.onpointerdown = e => {
    const el = e.target.closest('.wb'); if (!el) { EDIT.sel = -1; drawCanvas(); drawProps(); return; }
    const i = +el.dataset.i; EDIT.sel = i;
    st = { i, x0: e.clientX, y0: e.clientY, w0: clone(EDIT.layout.widgets[i]), rz: e.target.classList.contains('rz') ? e.target.dataset.h : '', moved: false, before: clone(EDIT.layout) };
    wrap.setPointerCapture(e.pointerId); drawCanvas(); drawProps(); e.preventDefault();
  };
  wrap.onpointermove = e => {
    if (!st) return;
    const G = EDIT.layout.cols || 24, r = wrap.getBoundingClientRect(), dx = Math.round((e.clientX - st.x0) / r.width * G), dy = Math.round((e.clientY - st.y0) / r.height * G);
    const w = EDIT.layout.widgets[st.i], o = st.w0, k = G / 24, min = ((S.cat.widgets[w.type] || {}).min || [2, 2]).map(v => v * k);
    if (!st.rz) { w.x = Math.max(0, Math.min(G - o.w, o.x + dx)); w.y = Math.max(0, Math.min(G - o.h, o.y + dy)); }
    else { // her kenar ve köşeden boyutlandırma: karşı kenar sabit kalır
      const d = st.rz, R = o.x + o.w, B = o.y + o.h;
      if (d.includes('e')) w.w = Math.max(min[0], Math.min(G - o.x, o.w + dx));
      if (d.includes('s')) w.h = Math.max(min[1], Math.min(G - o.y, o.h + dy));
      if (d.includes('w')) { w.x = Math.max(0, Math.min(R - min[0], o.x + dx)); w.w = R - w.x; }
      if (d.includes('n')) { w.y = Math.max(0, Math.min(B - min[1], o.y + dy)); w.h = B - w.y; }
    }
    st.moved = w.x !== o.x || w.y !== o.y || w.w !== o.w || w.h !== o.h;
    const el = $('cv').querySelector(`.wb[data-i="${st.i}"]`);
    if (el) { el.style.left = w.x / G * 100 + '%'; el.style.top = w.y / G * 100 + '%'; el.style.width = w.w / G * 100 + '%'; el.style.height = w.h / G * 100 + '%'; el.querySelector('small').textContent = w.w + '×' + w.h; }
  };
  wrap.onpointerup = wrap.onpointercancel = () => {
    if (!st) return;
    if (st.moved) {
      EDIT.hist.push(st.before); EDIT.dirty = true;
      const w = EDIT.layout.widgets[st.i]; // QR kartı kenardan sürüklenerek boyutlandırılırsa QR kutuyla birlikte büyür/küçülür
      if (st.rz && w && w.type === 'qr' && (w.props || {}).size !== 'box') { w.props = { ...(w.props || {}), size: 'box' }; toast('QR boyutu kutuya göre ayarlanır; kutuyu sürükleyerek büyütüp küçültün'); }
    }
    st = null; drawCanvas(); drawProps();
  };
}
async function upAsset(inp) {
  const f = inp.files[0]; inp.value = ''; if (!f) return; const fd = new FormData(); fd.append('file', f);
  try { const j = await req('POST', '/assets', fd); setP('url', j.url); S.db = await req('GET', '/db'); drawProps(); toast('Resim yüklendi; düzeni kaydetmeyi unutmayın'); } catch (e) { toast(e.message, true); }
}
async function resetDesign(sub) {
  const what = { layout: 'Düzen (widget yerleşimi ve ayarları)', colors: 'Renkler ve yazı tipi (logonuz kalır)', tv: 'TV ayarları (kenar payı, efekt)' }[sub];
  if (!await UI.ask(what + ' varsayılana döndürülsün mü? Bu işlem geri alınamaz.')) return;
  if (await act('POST', '/design/reset', { scope: sub }, 'Varsayılana döndürüldü, TV güncellendi', false)) {
    [S.me, S.db, S.scr] = await Promise.all([req('GET', '/me'), req('GET', '/db'), req('GET', '/screen')]);
    EDIT.dirty = false; EDIT.layout = null; drawBrand(); render(true);
  }
}
async function pickTheme(k) { const v = S.cat.themes[k]; await saveTheme({ bg: v.bg, accent: v.accent, accent2: v.accent2, text: v.text, font: v.font, plate: !!(S.me.tenant.theme || {}).plate, box: v.box || (v.glass ? 'glass' : 'accent') }); }
async function saveTheme(body) {
  body = body || { bg: $('th-bg').value, accent: $('th-accent').value, accent2: $('th-accent2').value, text: $('th-text').value, font: $('th-font').value, plate: $('th-plate').value === '1', box: $('th-box').value };
  const { name, ...clean } = body;
  const j = await act('PUT', '/theme', clean, 'Renkler kaydedildi', false);
  if (j) { S.me.tenant.theme = j.theme; drawBrand(); render(true); }
}
async function upLogo(inp) {
  const f = inp.files[0]; if (!f) return; const fd = new FormData(); fd.append('file', f);
  try {
    const j = await req('POST', '/logo', fd); S.me.tenant.logo = j.url; drawBrand();
    let noted = false;
    if (j.bg === 'removed') { toast('Logo yüklendi; beyaz arka planı otomatik kaldırıldı'); noted = true; }
    else if (j.bg === 'opaque') { toast('Logonun arka planı kalkık değil: şeffaf PNG/SVG yükleyin ya da Logo zemini seçeneğinden "Beyaz zemin"i seçin'); noted = true; }
    const th = (await themesFromLogo(j.url))[0];
    if (th) {
      th.plate = false;
      const r = await req('PUT', '/theme', th); S.me.tenant.theme = r.theme; drawBrand(); toast('Logo yüklendi, renkler logonuza göre ayarlandı');
    }
    else if (!noted) toast('Logo yüklendi');
    inp.value = '';
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
  const font = (S.me.tenant.theme || {}).font || 'Montserrat', plate = false;
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
    return head('Medya', 'Ekranda sırayla oynayan video, fotoğraf ve hazır afişler. Sürükleyerek sıralayın; saat simgesiyle gün ve saat verin.') + tabs('media', [['files', 'Medya ve sıra'], ['posters', 'Hazır içerikler']])
      + card('Dosya ekle', 'Video (MP4, MOV…) ya da fotoğraf (JPG, PNG). Yüklenen dosyalar TV için otomatik küçültülür; hazır olunca ekrana girer.',
        `<div id="drop" onclick="$('files').click()"><b>Dosyaları buraya bırakın ya da tıklayın</b><span class="muted">Birden fazla dosya seçebilirsiniz</span></div><input type="file" id="files" multiple accept="video/*,image/*" hidden onchange="upFiles(this.files)"><div id="ups"></div><div class="row mt" style="align-items:center"><span class="muted" style="flex:1;font-size:13px">Tasarımcınız yok mu? Ürün fotoğrafından birkaç saniyede afiş hazırlayın.</span><button class="btn g s" onclick="openStudio()">📷 Fotoğraftan afiş yap</button></div>`)
      + card('YouTube bağlantısı ekle', 'Bir YouTube videosunun bağlantısını yapıştırın; ekranda sırası gelince belirttiğiniz süre boyunca oynar (video kısaysa baştan döner). Ses kapalı oynar.',
        `<div class="row" style="align-items:center;gap:8px"><input type="text" id="yt-url" placeholder="https://www.youtube.com/watch?v=..." style="flex:1;min-width:200px"><input type="number" id="yt-dur" min="5" max="3600" value="30" style="width:90px" title="Süre (saniye)"><span class="muted">saniye</span><button class="btn" onclick="addYt()">Ekle</button></div>`)
      + card(`Gösterim sırası <span class="muted">· ${v.length} dosya</span>`, '', v.length ? `<div id="mbulk" class="mbulk" hidden></div><div class="mgrid" id="mgrid">${v.map((x, i) => `<div class="tile${MSEL.has(x.id) ? ' picked' : ''}" draggable="true" data-id="${x.id}">
          <div class="th ${x.hidden ? 'off' : ''}" onclick="${x.type === 'poster' ? `editPoster('${x.id}')` : x.design ? `openStudio('${x.id}')` : `pvMedia(${S.db.videos.indexOf(x)})`}">${thumb(x)}<label class="pick" title="Seç" onclick="event.stopPropagation()"><input type="checkbox" ${MSEL.has(x.id) ? 'checked' : ''} onchange="mPick('${x.id}',this.checked)"></label><span class="no">${i + 1}</span><span class="ty">${TYPE_NAMES[x.type] || 'Video'}${durTxt(x) ? `<i class="tyd"> · ${durTxt(x)}</i>` : ''}</span>${x.sch ? `<span class="sch" title="${esc(schText(x.sch))}">${ic('calendar-clock')} ${esc(schShort(x.sch))}</span>` : ''}${x.hidden ? `<span class="hid">${ic('eye-off')} Kapalı</span>` : ''}${x.status === 'processing' ? '<div class="proc">Hazırlanıyor…</div>' : ''}</div>
          <div class="m"><span class="grip" title="Sürükleyerek sıralayın">${ic('grip-vertical')}</span><span title="${esc(x.name)}">${esc(x.name)}</span><button class="btn xs g ib" onclick="openSched('video','${x.id}')" title="Zamanla">${ic('clock')}</button><button class="btn xs g ib" onclick="tileMenu(event,'${x.id}')" title="Diğer işlemler">${ic('ellipsis')}</button></div></div>`).join('')}</div>`
        : '<div class="empty">Henüz dosya yok. Yukarıdan ekleyin.</div>')
      + `<div class="grid g2">` + card('Fotoğraf süresi', 'Her fotoğraf ekranda kaç saniye kalsın.', `<div class="row"><input type="number" id="imgsec" min="3" max="120" value="${S.db.imageSeconds}" style="max-width:120px"><span class="muted">saniye</span><span style="flex:1"></span><button class="btn" data-save onclick="act('PUT','/settings',{imageSeconds:+$('imgsec').value},'Kaydedildi')">Kaydet</button></div>`)
      + card('Depolama', '', `<div id="stor" class="muted">Hesaplanıyor…</div>`) + `</div>`;
  },
  async after() {
    if (SUB.media === 'posters') return drawPosterGallery();
    drawThumbs(); drawMBulk();
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
        + (!sys.ffmpeg ? '<p class="mt">Sunucuda video küçültme aracı (ffmpeg) yok; dosyalar olduğu gibi kullanılır.</p>' :
          `<div class="row mt" style="align-items:center"><span style="flex:1">Video bitince sonraki içeriğe geçmeden önce bekleme:</span><select style="width:auto;min-width:190px" onchange="opt('videoGapSec',+this.value)">${[[0, 'Hemen'], [2, '2 sn'], [3, '3 sn — önerilen'], [5, '5 sn'], [10, '10 sn'], [20, '20 sn']].map(([v, l]) => `<option value="${v}" ${(S.db.videoGapSec === undefined ? 3 : S.db.videoGapSec) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`
        + `<div class="row mt" style="align-items:center"><span style="flex:1">İçerikler arası geçiş (yumuşak sönme):</span><select style="width:auto;min-width:190px" onchange="opt('xfadeSec',+this.value)">${[[0.4, 'Hızlı'], [1.2, 'Yumuşak — önerilen'], [2.2, 'Çok yumuşak'], [3.5, 'Yavaş']].map(([v, l]) => `<option value="${v}" ${(S.db.xfadeSec === undefined ? 1.2 : S.db.xfadeSec) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`
        + `<div class="row mt" style="align-items:center"><span style="flex:1">Video kalitesi — zayıf TV kutusunda takılma olursa 720p deneyin:</span><select style="width:auto;min-width:190px" onchange="opt('videoMaxH',+this.value).then(()=>toast('Yeni yüklemeler bu kalitede işlenecek; eskiler için yeniden küçültmeye basın'))">${[[1080, '1080p — önerilen'], [720, '720p — daha akıcı'], [480, '480p — en akıcı']].map(([v, l]) => `<option value="${v}"${(S.db.videoMaxH || 1080) === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`
          + (unopt ? `<div class="row mt"><span>${unopt} dosya küçültülmemiş.</span><button class="btn s g" onclick="act('POST','/media/optimize-all',undefined,'Küçültme başladı')">Şimdi küçült</button></div>`
            : (S.db.videos || []).some(v => v.type === 'video') ? `<div class="row mt"><span class="muted" style="flex:1">Mevcut videoları seçilen kaliteyle yeniden işlemek için:</span><button class="btn s" onclick="reoptAll()">Videoları yeniden küçült</button></div>` : ''));
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
// Medya kartı: süre etiketi (video uzunluğu ya da fotoğraf süresi)
const durTxt = x => x.type === 'video' ? (x.dur ? Math.floor(x.dur / 60) + ':' + String(Math.round(x.dur % 60)).padStart(2, '0') : '') : (S.db.imageSeconds || 10) + ' sn';
// Başa / sona al: sıra istemciden hesaplanıp tek seferde gönderilir
function mvEdge(id, first) { const ids = S.db.videos.map(x => x.id).filter(x => x !== id); first ? ids.unshift(id) : ids.push(id); act('POST', '/videos/reorder', { ids }, 'Sıra kaydedildi'); }
// "⋯" menüsü: kartın ikincil işlemleri (sıralama, aç/kapat, sil)
function tileMenu(ev, id) {
  ev.stopPropagation(); const v = S.db.videos.find(x => x.id === id); if (!v) return;
  popMenu(ev.currentTarget, [
    ['Başa al', 'arrow-up-to-line', () => mvEdge(id, true)], ['Bir öne al', 'chevron-left', () => mvMedia(id, 'up')],
    ['Bir arkaya al', 'chevron-right', () => mvMedia(id, 'down')], ['Sona al', 'arrow-down-to-line', () => mvEdge(id, false)], null,
    [v.hidden ? 'Ekranda göster' : 'Ekrandan kaldır (gizle)', v.hidden ? 'eye' : 'eye-off', () => togHide(id)], null,
    ['Sil', 'trash-2', () => delMedia(id), 1]]);
}
// Çoklu seçim (A5): seçilenler için üstte işlem çubuğu
const MSEL = new Set();
function mPick(id, on) { on ? MSEL.add(id) : MSEL.delete(id); const t = document.querySelector(`.tile[data-id="${id}"]`); if (t) t.classList.toggle('picked', on); drawMBulk(); }
function drawMBulk() {
  const b = $('mbulk'); if (!b) return; [...MSEL].forEach(id => { if (!S.db.videos.some(x => x.id === id)) MSEL.delete(id); });
  b.hidden = !MSEL.size; if (!MSEL.size) return;
  b.innerHTML = `<b>${MSEL.size} dosya seçili</b><span style="flex:1"></span><button class="btn s g" onclick="mBulk('show')">${ic('eye')} Göster</button><button class="btn s g" onclick="mBulk('hide')">${ic('eye-off')} Gizle</button><button class="btn s d" onclick="mBulk('del')">${ic('trash-2')} Sil</button><button class="btn s g" onclick="MSEL.clear();render(true)">Seçimi kaldır</button>`;
}
async function mBulk(k) {
  const ids = [...MSEL];
  if (k === 'del') { MSEL.clear(); return delMedia(ids); }
  try { await Promise.all(ids.map(id => req('PUT', '/videos/' + id, { hidden: k === 'hide' }))); toast(k === 'hide' ? 'Gizlendi; ekranda oynamaz' : 'Ekranda gösteriliyor'); } catch (e) { toast(e.message, true); }
  MSEL.clear(); refresh();
}
// Medya silme: Anında onay alınarak sunucudan ve tüm depolamadan kalıcı olarak silinir
async function delMedia(ids) {
  ids = [].concat(ids).filter(Boolean);
  if (!ids.length) return;
  const names = ids.map(id => (S.db.videos.find(x => x.id === id) || {}).name).filter(Boolean);
  const msg = ids.length > 1
    ? `${ids.length} dosya kalıcı olarak silinsin mi? Bu işlem geri alınamaz ve dosya depolamadan tamamen silinir.`
    : `"${names[0] || 'Seçilen içerik'}" kalıcı olarak silinsin mi? Bu işlem geri alınamaz ve dosya sunucudan tamamen silinir.`;
  const ok = await UI.ask(msg, { ok: 'Sil', danger: true });
  if (!ok) return;
  try {
    await Promise.all(ids.map(id => req('DELETE', '/videos/' + id)));
    toast(ids.length > 1 ? `${ids.length} dosya kalıcı olarak silindi` : 'Dosya kalıcı olarak silindi');
    await refresh();
  } catch (e) {
    toast(e.message, true);
  }
}
const togHide = id => { const v = S.db.videos.find(x => x.id === id); act('PUT', '/videos/' + id, { hidden: !v.hidden }, v.hidden ? 'Ekranda gösteriliyor' : 'Gizlendi; ekranda oynamaz'); };
async function addYt() {
  const url = $('yt-url').value.trim(); if (!url) return toast('Bağlantıyı yapıştırın', true);
  const ok = await act('POST', '/videos/youtube', { url, dur: $('yt-dur').value }, 'YouTube içeriği eklendi');
  if (ok) refresh();
}
function pvMedia(i) { const v = S.db.videos[i]; if (v.type === 'youtube') return openModal(`<iframe src="https://www.youtube.com/embed/${esc(v.yt)}?rel=0" style="width:100%;aspect-ratio:16/9;border:0" allow="encrypted-media"></iframe><div class="muted">${i + 1}. ${esc(v.name)}</div>`); const u = S.me.upBase + v.file; openModal((v.type === 'image' ? `<img src="${u}">` : `<video src="${u}" controls autoplay muted></video>`) + `<div class="muted">${i + 1}. ${esc(v.name)}</div>`); }

/* ================= FİYAT LİSTESİ ================= */
let MENU = null;
SECTIONS.menu = {
  html() {
    if (!MENU || !MENU.__dirty) MENU = clone(S.db.menu || { title: 'Fiyat Listesi', currency: '₺', categories: [] });
    return head('Fiyat Listesi', 'Ürünler ve fiyatlar. Düzene "Fiyat tarifesi" widget\'ı eklenince ekranda sayfa sayfa döner.', `<button class="btn" data-save onclick="saveMenu()">Kaydet</button>`)
      + lock('Fiyat listesi')
      + card('Liste bilgisi', 'Kafe ve restoranlar giriş kapısındaki fiyat tarifesini dijital panoda da gösterebilir (Fiyat Etiketi Yönetmeliği). Giriş ekranı için Tasarım\'da "Vitrin" düzenini kullanabilirsiniz.',
        `<div class="f">${fl('Başlık', `<input type="text" id="mtitle" maxlength="40" value="${esc(MENU.title)}" oninput="MENU.title=this.value;MENU.__dirty=1">`)}${fl('Para birimi', `<input type="text" id="mcur" maxlength="4" value="${esc(MENU.currency || '₺')}" oninput="MENU.currency=this.value;MENU.__dirty=1">`)}</div>`)
      + langCard()
      + happyCard()
      + card('Gün akışı', 'Bugün hangi kategori hangi saatlerde ekranda. Kategorinin ⏱ düğmesinden kahvaltı, öğle, akşam gibi saat verin; saati geçen kategori kendiliğinden kalkar.', '<div id="mflow"></div>')
      + `<div id="mcats"></div><div class="row" style="margin-bottom:18px"><button class="btn g" onclick="addCat()">＋ Kategori ekle</button><span style="flex:1"></span><button class="btn" data-save onclick="saveMenu()">Kaydet</button></div>`
      + card('Toplu ekle', 'Her satıra bir ürün: <code>Ürün ; fiyat ; açıklama</code>. Kategori satırı <code>#</code> ile başlar. Örnek: <code># Sıcak İçecekler</code> · <code>Türk Kahvesi ; 90</code>',
        `<div class="row" style="margin-bottom:10px"><button class="btn g" onclick="menuTemplate()">⬇ Excel şablonunu indir</button><button class="btn g" onclick="$('mfile').click()">⬆ Doldurduğum dosyayı yükle</button><input id="mfile" type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" style="display:none" onchange="menuFile(this)"></div><div class="muted" style="font-size:13px;margin-bottom:10px">Şablonu indirin, Excel'de ürünlerinizle doldurun, <b>CSV (virgülle/noktalı virgülle ayrılmış)</b> olarak kaydedip buraya yükleyin. Dosyadaki liste aşağıya yazılır; kontrol edip "Listeye ekle" ya da "Listeyi bununla değiştir"e basın.</div><textarea id="mbulk" rows="6" placeholder="# Sıcak İçecekler&#10;Türk Kahvesi ; 90&#10;Latte ; 120 ; Yulaf sütüyle +15"></textarea><div class="row mt"><button class="btn g" onclick="bulk(false)">Listeye ekle</button><button class="btn d" onclick="bulk(true)">Listeyi bununla değiştir</button></div>`);
  },
  after() { drawMenu(); },
};
function drawMenu() {
  const c = MENU.categories;
  $('mcats').innerHTML = c.length ? c.map((cat, ci) => `<div class="mcat"><div class="chd"><input type="text" value="${esc(cat.name)}" placeholder="Kategori adı" maxlength="40" oninput="MENU.categories[${ci}].name=this.value;MENU.__dirty=1" style="font-weight:700">
      <button class="btn xs g" onclick="mE(()=>mv(MENU.categories,${ci},-1))">↑</button><button class="btn xs g" onclick="mE(()=>mv(MENU.categories,${ci},1))">↓</button><button class="btn xs g" onclick="openSched('cat',${ci})" title="Bu kategori hangi gün ve saatlerde görünsün">⏱ ${cat.sch ? esc(schShort(cat.sch)) : 'Her zaman'}</button>${MENU.happy ? `<button class="btn xs ${cat.happy ? '' : 'g'}" title="Bu kategori indirim saatinde indirimli fiyatla görünsün" onclick="mE(()=>{const x=MENU.categories[${ci}];x.happy=!x.happy})">% ${cat.happy ? esc(MENU.happy.label || 'Happy Hour') : 'İndirimsiz'}</button>` : ''}<button class="btn xs d" onclick="UI.ask('Kategori silinsin mi?', { ok: 'Sil', danger: true }).then(ok=>{if(ok)mE(()=>MENU.categories.splice(${ci},1))})">Sil</button></div>
      ${langList().length ? `<div class="mtr">${langList().map(l => `<input type="text" placeholder="${LANG_NAMES[l]} kategori adı" maxlength="40" value="${esc((cat.t || {})[l] || '')}" oninput="mT(${ci},-1,'${l}','name',this.value)">`).join('')}</div>` : ''}
      ${cat.items.map((it, ii) => `<div class="mrow${MENU.happy && cat.happy ? ' hp' : ''}"><input type="text" value="${esc(it.name)}" placeholder="Ürün" maxlength="60" oninput="MENU.categories[${ci}].items[${ii}].name=this.value;MENU.__dirty=1"><input class="md" type="text" value="${esc(it.desc || '')}" placeholder="Açıklama (isteğe bağlı)" maxlength="90" oninput="MENU.categories[${ci}].items[${ii}].desc=this.value;MENU.__dirty=1"><input type="text" value="${esc(it.price)}" placeholder="Fiyat" maxlength="16" oninput="MENU.categories[${ci}].items[${ii}].price=this.value;MENU.__dirty=1">${MENU.happy && cat.happy ? `<input type="text" class="mhp" value="${esc(it.hp || '')}" placeholder="${esc(happyPrice(it.price) || 'İnd. fiyat')}" title="İndirim saatindeki fiyat (boşsa %${MENU.happy.pct || 0} indirimle hesaplanır)" maxlength="16" oninput="MENU.categories[${ci}].items[${ii}].hp=this.value;MENU.__dirty=1">` : ''}<span class="row" style="gap:4px;flex-wrap:nowrap"><button class="btn xs g" title="${it.kcal ? 'Kaloriyi kaldır' : 'Ürün adından kalori bilgisini getir'}" onclick="kcalBtn(${ci},${ii})">${it.kcal ? '🔥 ' + esc(it.kcal) + ' ✕' : '🔥'}</button><button class="btn xs ${it.off ? 'd' : 'g'}" title="Tükendi olarak işaretle" onclick="mE(()=>{const x=MENU.categories[${ci}].items[${ii}];x.off=!x.off})">${it.off ? 'Tükendi' : 'Var'}</button><button class="btn xs g" onclick="mE(()=>mv(MENU.categories[${ci}].items,${ii},-1))">↑</button><button class="btn xs d" onclick="mE(()=>MENU.categories[${ci}].items.splice(${ii},1))">✕</button></span></div>
      ${langList().length ? `<div class="mtr">${langList().map(l => `<input type="text" placeholder="${LANG_NAMES[l]}: ${esc(it.name || 'ürün adı')}" maxlength="60" value="${esc(((it.t || {})[l] || {}).name || '')}" oninput="mT(${ci},${ii},'${l}','name',this.value)"><input class="md" type="text" placeholder="${LANG_NAMES[l]} açıklama" maxlength="90" value="${esc(((it.t || {})[l] || {}).desc || '')}" oninput="mT(${ci},${ii},'${l}','desc',this.value)">`).join('')}</div>` : ''}`).join('')}
      <button class="btn xs g" onclick="mE(()=>MENU.categories[${ci}].items.push({name:'',price:'',desc:''}))">＋ Ürün</button></div>`).join('')
    : '<div class="empty" style="margin-bottom:14px">Henüz kategori yok. "Kategori ekle" ile başlayın ya da aşağıdan toplu yapıştırın.</div>';
  drawFlow();
}
// ---- indirim saati (happy hour) ----
const pnum = v => { const x = String(v || '').replace(/\s|₺|TL/gi, ''); if (!/^\d[\d.,]*$/.test(x)) return null; const n = Number(/,\d{1,2}$/.test(x) ? x.replace(/\./g, '').replace(',', '.') : x.replace(/[.,](?=\d{3}(\D|$))/g, '')); return isFinite(n) ? n : null; };
function happyPrice(p) { const h = MENU && MENU.happy, n = pnum(p); if (!h || !h.pct || n == null) return ''; const v = n * (1 - h.pct / 100); return /,\d{1,2}$/.test(String(p)) && n % 1 ? v.toFixed(2).replace('.', ',') : String(Math.round(v)); }
function happyCard() {
  const h = MENU.happy;
  const body = h ? `<div class="f">${fl('Ekranda görünecek ad', `<input type="text" maxlength="24" value="${esc(h.label || '')}" placeholder="Happy Hour" oninput="MENU.happy.label=this.value;MENU.__dirty=1">`)}${fl('İndirim (%)', `<input type="number" min="0" max="90" value="${h.pct || 0}" oninput="MENU.happy.pct=+this.value||0;MENU.__dirty=1;drawMenu()">`)}</div>
      <div class="row mt" style="align-items:center"><button class="btn g" onclick="openSched('happy')">⏱ ${h.sch ? esc(schText(h.sch)) : 'Saat seçin'}</button><span class="muted" style="flex:1;font-size:13px">${h.sch ? (happyNowP() ? '<b style="color:var(--ok,#3fb27f)">● Şu an indirim saatinde</b>' : 'Şu an indirim saatinde değil') : 'Saat aralığı vermeden indirim ekranda görünmez.'}</span><button class="btn xs d" onclick="UI.ask('İndirim saati kaldırılsın mı?', { ok: 'Sil', danger: true }).then(ok=>{if(ok){mE(()=>{delete MENU.happy;MENU.categories.forEach(c=>{delete c.happy;c.items.forEach(i=>delete i.hp)})});render(true)}})">Kaldır</button></div>
      <p class="muted" style="font-size:12.5px;margin:10px 0 0">Kategorilerde <b>%</b> düğmesiyle indirime dahil edin. Ürünün yanındaki küçük kutuya ayrı bir indirimli fiyat yazabilirsiniz; boşsa yüzdeyle hesaplanır. Ekranda eski fiyat üstü çizili, yanında yeni fiyat görünür ve liste başlığına "${esc(h.label || 'Happy Hour')}" eklenir.</p>`
    : `<div class="row"><span class="muted" style="flex:1">Örneğin hafta içi 17:00–19:00 arası kokteyllerde %30 indirim. Saat gelince fiyatlar kendiliğinden düşer, bitince eski hâline döner.</span><button class="btn" onclick="mE(()=>{MENU.happy={label:'Happy Hour',pct:20,sch:{from:'17:00',to:'19:00'}}});render(true)">İndirim saati ekle</button></div>`;
  return card('İndirim saati (happy hour)', 'Belirli saatlerde seçili kategorilerde indirimli fiyat.', body);
}
const happyNowP = () => MENU.happy && MENU.happy.sch && schAt(MENU.happy.sch, new Date());
// Zamanlama kuralı verilen anda geçerli mi (sunucudaki sched.active ile aynı mantık; panelin saat dilimi kullanılır)
function schAt(s, d) {
  if (!s) return true;
  const ymd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), dow = (d.getDay() + 6) % 7 + 1;
  if (s.start && ymd < s.start) return false;
  if (s.end && ymd > s.end) return false;
  if (s.from && s.to) {
    const inside = s.from < s.to ? hm >= s.from && hm < s.to : hm >= s.from || hm < s.to;
    if (!inside) return false;
    const dd = s.from > s.to && hm < s.to ? (dow + 5) % 7 + 1 : dow;
    if (s.days && !s.days.includes(dd)) return false;
  } else if (s.days && !s.days.includes(dow)) return false;
  return true;
}
// Gün akışı: bugünün 24 saati, yarım saatlik dilimler; her kategori için görünür olduğu dilimler dolu çizilir
function drawFlow() {
  const box = $('mflow'); if (!box) return;
  const rows = MENU.categories.filter(c => c.name || c.items.length).map(c => ({ name: c.name || 'Adsız kategori', sch: c.sch }));
  if (MENU.happy && MENU.happy.sch) rows.push({ name: '% ' + (MENU.happy.label || 'Happy Hour'), sch: MENU.happy.sch, happy: true });
  if (!rows.length) { box.innerHTML = '<div class="empty">Kategori ekleyince burada görünür.</div>'; return; }
  const now = new Date(), base = new Date(now.getFullYear(), now.getMonth(), now.getDate()), nowPos = (now.getHours() * 60 + now.getMinutes()) / 1440 * 100;
  const slot = (r, i) => schAt(r.sch, new Date(base.getTime() + (i * 30 + 15) * 60000));
  box.innerHTML = `<div class="flow">${rows.map(r => `<div class="fr"><span class="fn" title="${esc(r.name)}">${esc(r.name)}</span><div class="ft">${Array.from({ length: 48 }, (_, i) => `<i class="${slot(r, i) ? (r.happy ? 'hp' : 'on') : ''}"></i>`).join('')}<b style="left:${nowPos}%"></b></div></div>`).join('')}
    <div class="fr"><span class="fn"></span><div class="fh">${[0, 3, 6, 9, 12, 15, 18, 21, 24].map(h => `<span style="left:${h / 24 * 100}%">${String(h).padStart(2, '0')}</span>`).join('')}</div></div></div>`;
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
async function bulk(replace) {
  const lines = $('mbulk').value.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return toast('Önce listeyi yapıştırın', true);
  if (replace && !await UI.ask('Mevcut liste silinip bununla değiştirilsin mi?')) return;
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
    const sec = ['leagues', 'table', 'big'].includes(SUB.sport) ? SUB.sport : 'leagues'; // eski #sport/manual bağlantısı da açılsın
    const TABS = [['leagues', 'Maçlar ve ligler'], ['table', 'Puan durumu'], ['big', 'Büyük maç']];
    const body = { leagues: () => (''
      + card('Takip edilen ligler', 'Seçtiğiniz liglerin bugünkü maçları ve canlı skorları gösterilir; gol olunca ekranda animasyon çıkar.',
        Object.entries(groups).map(([g, items]) => { const n = items.filter(l => L.enabled.includes(l.code)).length; return `<details class="lgrp" ${n ? 'open' : ''}><summary><b>${esc(g)}</b><span class="cnt" data-of="${items.length}">${n}/${items.length}</span></summary><div class="chips">${items.map(l => `<span class="chip ${L.enabled.includes(l.code) ? 'on' : ''}" data-code="${l.code}" onclick="this.classList.toggle('on');spCount()">${esc(l.label)}</span>`).join('')}</div></details>`; }).join('')
        + `<div class="row end"><button class="btn" onclick="saveLeagues()">Ligleri kaydet</button></div>`)
), table: () => (''
      + card('Puan durumu', 'Lig maçlarının ardından o ligin puan tablosu gösterilir.', `<div class="chips">${tbl.map(l => `<span class="chip ${(L.hideTables || []).includes(l.code) ? '' : 'on'}" onclick="togTable('${l.code}')">${esc(l.label)}</span>`).join('') || '<span class="muted">Puan tablosu olan bir lig seçin.</span>'}</div>`,
        sw(db.showStandings !== false, "opt('showStandings',this.checked).then(()=>render(true))"), db.showStandings === false ? 'off' : '')
), big: () => (''
      + card('Büyük maç duyurusu', 'Dört büyüklerin derbileri ve Avrupa maçları, başlamadan birkaç gün önce ekranda tam sayfa görselle duyurulur.',
        `<div class="fl"><span>Tasarım <span class="muted">· ön izlemek için tıklayın</span></span><div class="bstyles">${BIG_STYLES.map(([k, l, d]) => `<button type="button" class="bsty ${bigCur() === k ? 'on' : ''}" onclick="bigPreview('${k}')"><span class="bth t-${k}"><i></i><i></i><i></i></span><b>${l}${bigCur() === k ? ' <em>✓ Seçili</em>' : ''}</b><span>${d}</span></button>`).join('')}</div></div>
         <details class="adv mt"><summary>Gelişmiş ayarlar <span class="muted">· alt not, sıklık, süre, alt bilgiler</span></summary>
         <div class="f mt">${fl('Alt not', `<input type="text" id="bg-note" maxlength="140" value="${esc(bc.note)}">`)}${fl('Kaç gün önceden', `<input type="number" id="bg-days" min="1" max="7" value="${bc.days}">`)}${fl('Kaç dakikada bir', `<input type="number" id="bg-every" min="2" max="60" value="${bc.everyMin}">`)}${fl('Kaç saniye kalsın', `<input type="number" id="bg-dur" min="5" max="60" value="${bc.durSec}">`)}</div>
         <div class="f mt">${[0, 1, 2].map(i => fl(`Alt bilgi ${i + 1}`, `<input type="text" id="bg-i${i}" maxlength="60" value="${esc((bc.info || [])[i] || '')}" placeholder="${['örn. adresiniz', 'örn. dev ekran', 'örn. rezervasyon tel.'][i]}">`)).join('')}</div></details>
         <div class="fl mt"><span>Takım / oyuncu fotoğrafları (isteğe bağlı, arkası şeffaf PNG en iyisi)</span><div class="row"><input type="text" id="bg-team" list="bgteams" placeholder="Takım adı" style="max-width:220px"><datalist id="bgteams"><option>Galatasaray</option><option>Fenerbahçe</option><option>Beşiktaş</option><option>Trabzonspor</option></datalist><input type="file" id="bg-file" accept="image/*" hidden onchange="upBigPhoto(this)"><button class="btn g s" onclick="$('bg-team').value.trim()?$('bg-file').click():toast('Önce takım adını yazın',true)">Fotoğraf yükle</button></div><div class="thumbs" id="bgphotos"></div></div>
         <div class="row mt"><span id="bglist" class="muted" style="flex:1"></span><button class="btn g s" onclick="bigTest()">Şimdi dene</button><button class="btn" data-save onclick="saveBig()">Kaydet</button></div>`,
        sw(bc.enabled, "act('PUT','/bigmatch',{enabled:this.checked},this.checked?'Açıldı':'Kapatıldı')"), bc.enabled ? '' : 'off')
) }[sec]();
    return head('Spor', 'Maçlar, canlı skorlar, puan durumu ve gol anı. "Maçlar ve bilgi sayfaları" widget\'ında ve kayan bantta görünür.', `<button class="btn g s" onclick="testGoal()">⚽ Gol animasyonunu dene</button>`)
      + lock('Maç ve spor özellikleri')
      + `<div class="spsum" id="sp-sum"></div>` + tabs('sport', TABS) + body;
  },
  async after() {
    const n = S.lg.enabled.length;
    const sum = (big) => { const el = $('sp-sum'); if (el) el.innerHTML = `<span><b>${n}</b> <span>lig açık</span></span><span>${big}</span>`; };
    sum('');
    try {
      const j = await req('GET', '/bigmatch');
      if ($('bgphotos')) $('bgphotos').innerHTML = j.photos.map(p => `<div class="t" title="${esc(p.name)}"><img src="${esc(p.url)}"><button onclick="act('DELETE','/bigmatch/photo/${p.id}',undefined,'Silindi')">✕</button></div>`).join('');
      const up = j.items.length ? 'Yaklaşan: ' + j.items.map(m => `${esc(m.home)} – ${esc(m.away)} (${new Date(m.ts).toLocaleDateString(I18N.locale, { day: 'numeric', month: 'short' })})`).join(', ') : 'Şu an duyurulacak büyük maç yok.';
      if ($('bglist')) $('bglist').innerHTML = up;
      sum(up);
    } catch (e) {}
  },
};
// Lig gruplarındaki "seçili/toplam" sayaçları
function spCount() { document.querySelectorAll('.lgrp').forEach(d => { const c = d.querySelector('.cnt'); if (c) c.textContent = d.querySelectorAll('.chip.on').length + '/' + c.dataset.of; }); }
const testGoal = () => act('POST', '/goal/test', undefined, 'Gol animasyonu gönderildi', false);
async function saveLeagues() { const enabled = [...document.querySelectorAll('[data-code].on')].map(x => x.dataset.code); if (await act('PUT', '/leagues', { enabled }, 'Ligler kaydedildi', false)) { S.lg = await req('GET', '/leagues'); render(true); } }
async function togTable(c) { const h = S.lg.hideTables || []; S.lg.hideTables = h.includes(c) ? h.filter(x => x !== c) : [...h, c]; await act('PUT', '/options', { hideTables: S.lg.hideTables }, 'Kaydedildi', false); render(true); }
// Büyük maç tasarımları: kart ön izlemesi panelde gerçek TV sayfasıyla (?bigdemo=) gösterilir
const BIG_STYLES = [
  ['prime', 'Prime Yayın (Ultra Profesyonel)', '2026 beIN & UCL stüdyo stili: Cam podyumlar, derin stadyum ışığı, net armalar, saat ve kanal rozetleri'],
  ['uyum', 'Klasik (ekrana uyumlu)', 'Takım renkleri, büyük armalar ve oyuncu fotoğrafları; medya alanına göre ölçeklenir'],
  ['stadyum', 'Stadyum', 'Takım renkleriyle çapraz sahne, ışık huzmeleri, parlayan armalar'],
  ['bant', 'Yayın bandı', 'TV yayınlarındaki gibi alt skorbord; medya arkada oynamaya devam eder'],
  ['sayac', 'Geri sayım', 'Takım renkli dev parlayan armalar ve canlı geri sayan dev saat'],
  ['poster', 'Poster', 'Dev tipografi ve çift çerçeveyle maç afişi'],
  ['duello', 'Düello', 'İki takım karşı karşıya; ortada 3D dönen büyük turnuva logosu, duman ve kıvılcım efektleri'],
  ['turnuva', 'Düello (Turnuva Madalyonlu)', 'Düello sahnesi; merkezde altın turnuva madalyonu ve stadyum ışık huzmeleri'],
  ['arena', 'Şampiyonlar Arenası', 'Dev altın yıldız kemerli stadyum sahnesi, 3D yansımalı podyumlar, dönen turnuva küresi ve takım ışımaları'],
  ['matchday', 'Canlı Yayın (Matchday)', 'Gerçek stadyum çimi, projektörler, havai fişekler, takım renkli tribün dumanları ve TV yayın bantları'],
  ['neonarena', 'Neon Arena', 'Fütüristik sekizgen kalkan çerçeveler, siber ızgara ve neon lazer hüzmeleri'],
];
const bigCur = () => { const st = (S.db.bigMatch || {}).style; return BIG_STYLES.some(x => x[0] === st) ? st : 'prime'; };
function bigPreview(k) {
  const x = BIG_STYLES.find(y => y[0] === k) || BIG_STYLES[0];
  openModal(`<div class="bpv"><div class="row" style="justify-content:space-between;width:100%"><div><h3 style="margin:0">${x[1]}</h3><p class="muted" style="margin:4px 0 0">${x[2]}</p></div>
    <div class="row">${BIG_STYLES.map(([kk, l]) => `<button class="btn xs ${kk === k ? '' : 'g'}" onclick="bigPreview('${kk}')">${l}</button>`).join('')}</div></div>
    <div class="pv"><iframe src="/tv?preview=1&bigdemo=${k}" title="Ön izleme"></iframe></div>
    <p class="muted" style="margin:0">Logonuz, renkleriniz, alt notunuz ve alt bilgilerinizle gösterilir. Yaklaşan büyük maç yoksa örnek bir derbi kullanılır.</p>
    <div class="row end" style="width:100%"><button class="btn g" onclick="closeModal()">Kapat</button>${bigCur() === k ? '<span class="pill ok">Seçili tasarım</span>' : `<button class="btn" onclick="bigStyle('${k}').then(closeModal)">Bu tasarımı seç</button>`}</div></div>`);
  setTimeout(scalePv, 30); setTimeout(scalePv, 300);
}
// Büyük maç kartını bağlı TV'lerde seçili tasarımla hemen gösterir
async function bigTest() {
  try {
    const j = await req('POST', '/bigmatch/test');
    if (!j.online) toast('Şu an bağlı TV yok; TV açıkken tekrar deneyin', true);
    else toast(j.sample ? 'Yaklaşan büyük maç yok; örnek maç TV\'de gösteriliyor' : 'Büyük maç kartı TV\'de gösteriliyor');
  } catch (e) { toast(e.message, true); }
}
const bigStyle = async k => { if (await act('PUT', '/bigmatch', { style: k }, 'Tasarım seçildi', false)) { S.db.bigMatch = Object.assign({}, S.db.bigMatch, { style: k }); render(true); } };
const saveBig = () => act('PUT', '/bigmatch', { note: $('bg-note').value, days: $('bg-days').value, everyMin: $('bg-every').value, durSec: $('bg-dur').value, info: [0, 1, 2].map(i => $('bg-i' + i).value) }, 'Kaydedildi');
async function upBigPhoto(inp) { const f = inp.files[0]; inp.value = ''; if (!f) return; const fd = new FormData(); fd.append('team', $('bg-team').value.trim()); fd.append('file', f); try { await req('POST', '/bigmatch/photo', fd); toast('Fotoğraf yüklendi'); refresh(); } catch (e) { toast(e.message, true); } }

/* ================= DUYURULAR ================= */
SECTIONS.promo = {
  after() { if ($('ig-st')) drawInsta(); (S.db.campaigns || []).forEach(c => updateCampPrev(c.id)); },
  html() {
    const db = S.db;
    return head('Kampanya ve yorumlar', 'Kampanya kartı, Google ve Instagram yorumları.')
      + (db.campaigns || []).map(campCard).join('')
      + lock('Google yorumları ve Instagram')
      + googleCard() + instaCard();
  },
};
function campCard(c) {
  const x = c.qrX != null ? c.qrX : 85, y = c.qrY != null ? c.qrY : 75, sz = c.qrSize || 26;
  return card('🎁 Kampanya', 'Fotoğraf yükleyin, bir bağlantıdan QR kodu oluşturun ve QR\'ı fotoğrafın istediğiniz yerine sürükleyin. Belirli aralıklarla medya yerine tam ekran çıkar.',
    `<div class="camp-grid">
      <div class="camp-form">
        <div class="f">${fl('Bağlantı (QR kodu buraya gider)', `<input type="text" id="c-url-${c.id}" value="${esc(c.url)}" placeholder="https://g.page/r/.../review">`)}${fl('Kampanya adı (yalnız raporlarda görünür)', `<input type="text" id="c-h-${c.id}" maxlength="120" value="${esc(c.headline || '')}">`)}</div>
        <div class="mt">
          <label class="lbl"><b>Kampanya fotoğrafı</b></label>
          <div class="camp-img-box">
            ${c.image ? `<img src="${esc(c.image)}" class="camp-img-thumb" alt=""><div style="flex:1;min-width:0"><b style="font-size:13px;display:block">Yüklü fotoğraf</b><span class="muted" style="font-size:12px">Tam ekran gösterilir</span></div><button class="btn s d" type="button" onclick="removeCampImg('${c.id}')">Kaldır</button>` : `<div style="flex:1"><span class="muted" style="font-size:12.5px">Henüz fotoğraf yok. 16:9 (1920×1080) önerilir.</span></div>`}
            <label class="btn s g" style="margin:0;cursor:pointer">
              <span>${c.image ? 'Değiştir' : 'Fotoğraf seç'}</span>
              <input type="file" accept="image/*" style="display:none" onchange="uploadCampImg('${c.id}',this)">
            </label>
          </div>
        </div>
        <div class="f mt">${fl('QR boyutu', `<input type="range" id="c-size-${c.id}" min="10" max="50" value="${sz}" oninput="updateCampPrev('${c.id}')">`)}${fl('Kaç dakikada bir', `<input type="number" id="c-e-${c.id}" min="1" max="60" value="${c.everyMin}">`)}${fl('Kaç saniye kalsın', `<input type="number" id="c-d-${c.id}" min="8" max="60" value="${c.durSec}">`)}</div>
        <input type="hidden" id="c-x-${c.id}" value="${x}"><input type="hidden" id="c-y-${c.id}" value="${y}">
        <div class="row end mt" style="gap:8px">
          <button class="btn g s" type="button" onclick="openSched('camp','${c.id}')">⏱ ${c.sch ? esc(schShort(c.sch)) : 'Zamanla'}</button>
          <button class="btn g s" type="button" onclick="act('POST','/campaigns/${c.id}/test',undefined,'Kart TV\\'de gösteriliyor',false)">📺 TV'de test et</button>
          <button class="btn" data-save type="button" onclick="saveCamp('${c.id}')">Kaydet</button>
        </div>
      </div>
      <div class="camp-prev-wrap">
        <div class="camp-prev-head"><span>ÖNİZLEME</span><span style="color:var(--accent2);font-weight:800">QR'ı sürükleyin</span></div>
        <div class="camp-prev-screen" id="camp-prev-${c.id}" style="background:#000">
          ${c.image ? `<img src="${esc(c.image)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none">` : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#889;font-size:13px">Önce fotoğraf yükleyin</div>`}
          <div class="cpv-qr" style="position:absolute;transform:translate(-50%,-50%);aspect-ratio:1;background:#fff;border-radius:8%;box-shadow:0 4px 14px rgba(0,0,0,.55);cursor:grab;touch-action:none;left:${x}%;top:${y}%;height:${sz}%"><div style="position:absolute;inset:6%;pointer-events:none" class="cpv-in">${c.svg || '<svg viewBox="0 0 100 100" style="width:100%;height:100%"><rect width="100" height="100" fill="#e5e7eb"/><text x="50" y="56" font-size="16" text-anchor="middle" fill="#6b7280">QR</text></svg>'}</div></div>
        </div>
        <div style="font-size:12px;color:var(--mute);line-height:1.4;text-align:center">QR kodunu fare ya da parmakla fotoğrafın istediğiniz yerine taşıyın; değişiklik için Kaydet\'e basın.</div>
      </div>
    </div>`,
    sw(c.enabled, `campToggle('${c.id}',this)`));
}
// "Her zaman üstte" kapalıyken QR'ın gizlenebileceği içerikler (TV'de qrCtx ile aynı anahtarlar)
const QR_HIDE = [['video', 'Videolar'], ['image', 'Fotoğraflar'], ['poster', 'Afişler / kitaplar'], ['trailer', 'Film fragmanı'], ['camp', 'Kampanya kartı'], ['big', 'Büyük maç kartı'], ['goal', 'Gol bildirimi']];
let qrEditId = null;
SECTIONS.qr = {
  html() {
    const db = S.db;
    const item = q => `<div class="qi"><div class="it"><div class="qr">${q.svg}</div><div class="b"><b>${esc(q.label)}</b><span>${q.kind === 'wifi' ? 'Wi-Fi' : q.kind === 'hub' ? 'Tek QR sayfası: ' + esc(hubSummary(q.hub)) : esc(q.text)}</span></div>
        <span class="chip ${q.pin !== false ? 'on' : ''}" onclick="qrPin('${q.id}',${q.pin === false})">📌 Her zaman üstte</span>
        <button class="btn xs" onclick="qrEdit('${q.id}')">Düzenle</button><button class="btn xs d" onclick="act('DELETE','/qrs/${q.id}',undefined,'Silindi')">Sil</button></div>
        ${q.pin === false ? `<div class="qh"><span class="muted">Şu içeriklerde gizle:</span><div class="chips">${QR_HIDE.map(([k, l]) => `<span class="chip ${(q.hide || []).includes(k) ? 'on' : ''}" onclick="qrHide('${q.id}','${k}')">${l}</span>`).join('')}</div></div>` : ''}</div>`;
    return head('QR Kodlar', 'QR kodlarınız Tasarım → Ekran düzeni\'ndeki "QR kart" widget\'ı ile gösterilir; her karta ayrı QR seçebilirsiniz.')
      + card('▣ QR kodlar', '"Her zaman üstte" açıkken QR kart ekranda sürekli en üstte durur; kapalıyken seçtiğiniz içeriklerde (video, fotoğraf…) gizlenir.',
        `<div id="q-mode" class="muted" style="font-weight:700;margin-bottom:8px">Yeni QR ekle</div>
         <div class="f">${fl('Tür', `<select id="q-kind" onchange="qrKindUi()"><option value="link">Bağlantı / metin</option><option value="wifi">Wi-Fi</option><option value="hub">Tek QR · menü, Wi-Fi, bağlantılar</option></select>`)}${fl('Etiket (QR altında)', '<input type="text" id="q-label" maxlength="40" placeholder="örn. Menü için okutun">')}</div>
         <div class="f mt" id="q-link">${fl('Bağlantı', '<input type="text" id="q-text" placeholder="https://instagram.com/..." oninput="qrPrev()">')}</div>
         <div class="f mt" id="q-wifi" hidden>${fl('Ağ adı (SSID)', '<input type="text" id="q-ssid" oninput="qrPrev()">')}${fl('Şifre', '<input type="text" id="q-pass" oninput="qrPrev()">')}${fl('Güvenlik', '<select id="q-sec" onchange="qrPrev()"><option value="WPA">WPA/WPA2</option><option value="WEP">WEP</option><option value="nopass">Şifresiz</option></select>')}${fl('Wi-Fi şifre yazısı (boşsa QR\'daki şifre)', `<input type="text" maxlength="120" value="${esc(db.wifiText || '')}" onchange="opt('wifiText',this.value)">`)}</div>
         <div id="q-hub" hidden>${hubForm(db)}</div>
         <div class="row mt" style="align-items:center"><div id="q-prev" class="qprev"><span class="muted">QR, bilgileri yazdıkça burada oluşur</span></div><span style="flex:1"></span><button class="btn g" id="q-cancel" onclick="qrCancel()" hidden>Vazgeç</button><button class="btn" id="q-save" onclick="addQr()">QR ekle</button></div>
         <hr class="sep2">${(db.qrs || []).length ? `<div class="list">${db.qrs.map(item).join('')}</div>` : '<div class="empty">Henüz QR kod yok</div>'}`);
  },
};
const qrPin = (id, v) => act('PATCH', '/qrs/' + id, { pin: v }, 'Kaydedildi');
function qrHide(id, k) {
  const q = (S.db.qrs || []).find(x => x.id === id); if (!q) return;
  const h = new Set(q.hide || []); h.has(k) ? h.delete(k) : h.add(k);
  act('PATCH', '/qrs/' + id, { hide: [...h] }, 'Kaydedildi');
}
// "Tek QR" türü: okutan kişi bir sayfa görür; menü, Wi-Fi ve bağlantı butonları
const hubSummary = h => { h = h || {}; return [h.menu || h.menuUrl ? 'Menü' : '', h.wifi ? 'Wi-Fi' : '', ...(h.links || []).map(l => l.label)].filter(Boolean).join(', '); };
function hubForm(db) {
  const wifis = (db.qrs || []).filter(q => q.kind === 'wifi');
  const rows = [0, 1, 2, 3, 4].map(i => `<div class="f mt">${fl(i ? '' : 'Ek butonlar (en çok 5)', `<input type="text" id="q-hl${i}" maxlength="30" placeholder="Buton yazısı (örn. Instagram)" oninput="qrPrev()">`)}${fl(i ? '' : 'Bağlantı', `<input type="text" id="q-hu${i}" placeholder="https://instagram.com/..." oninput="qrPrev()">`)}</div>`).join('');
  return `<p class="muted" style="margin:10px 0 0">Okutan kişi bir sayfa görür; Menü, Wi-Fi ve bağlantı butonlarından istediğine basar. Wi-Fi butonunda iPhone Wi-Fi profilini yükler; Android şifreyi kopyalayıp Wi-Fi ayarlarını açar (web sayfası telefonu ağa kendiliğinden bağlayamaz).</p>
    <div class="f mt">${fl('Sayfa başlığı (boşsa işletme adı)', '<input type="text" id="q-htitle" maxlength="50" placeholder="Hoş geldiniz">')}${fl('Wi-Fi butonu için ağ', `<select id="q-hwifi" onchange="qrPrev()"><option value="">Wi-Fi butonu yok</option>${wifis.map(w => `<option value="${w.id}">${esc(w.label)} · ${esc(wifiParse(w.text).ssid)}</option>`).join('')}</select>`)}</div>
    ${wifis.length ? '' : '<p class="muted" style="margin:6px 0 0">Wi-Fi butonu için önce "Wi-Fi" türünde bir QR ekleyin.</p>'}
    <div class="f mt">${fl('Menü bağlantısı (Menü butonu buraya gider)', '<input type="text" id="q-hmurl" placeholder="https://.../menu" oninput="qrPrev()">')}</div>
    ${rows}`;
}
function qrKindUi() {
  const k = $('q-kind').value;
  $('q-link').hidden = k !== 'link'; $('q-wifi').hidden = k !== 'wifi'; $('q-hub').hidden = k !== 'hub';
  if (k === 'wifi' && !$('q-label').value) $('q-label').placeholder = 'Wi-Fi Şifresi';
  if (k === 'hub' && !$('q-label').value) $('q-label').placeholder = 'Menü ve Wi-Fi için okutun';
  qrPrev();
}
const hubRead = () => ({ title: $('q-htitle').value.trim(), menuUrl: $('q-hmurl').value.trim(), wifi: $('q-hwifi').value, links: [0, 1, 2, 3, 4].map(i => ({ label: $('q-hl' + i).value.trim(), url: $('q-hu' + i).value.trim() })).filter(l => l.label || l.url) });
// Wi-Fi QR metninden (WIFI:T:WPA;S:ad;P:şifre;;) alanları geri okur
function wifiParse(t) {
  const g = k => { const m = new RegExp(k + ':((?:\\\\.|[^;])*);').exec(t || ''); return m ? m[1].replace(/\\(.)/g, '$1') : ''; };
  return { ssid: g('S'), password: g('P'), security: g('T') || 'WPA' };
}
function qrEdit(id) {
  const q = (S.db.qrs || []).find(x => x.id === id); if (!q) return;
  qrEditId = id;
  $('q-kind').value = q.kind === 'wifi' ? 'wifi' : q.kind === 'hub' ? 'hub' : 'link';
  $('q-link').hidden = q.kind !== 'link' && q.kind !== undefined; $('q-wifi').hidden = q.kind !== 'wifi'; $('q-hub').hidden = q.kind !== 'hub';
  $('q-label').value = q.label || '';
  if (q.kind === 'hub') { const h = q.hub || {}; $('q-htitle').value = h.title || ''; $('q-hmurl').value = h.menuUrl || ''; $('q-hwifi').value = h.wifi || ''; [0, 1, 2, 3, 4].forEach(i => { const l = (h.links || [])[i] || {}; $('q-hl' + i).value = l.label || ''; $('q-hu' + i).value = l.url || ''; }); }
  else if (q.kind === 'wifi') { const w = wifiParse(q.text); $('q-ssid').value = w.ssid; $('q-pass').value = w.password; $('q-sec').value = w.security; } else $('q-text').value = q.text || '';
  $('q-mode').textContent = 'QR düzenleniyor: ' + (q.label || ''); $('q-save').textContent = 'Kaydet'; $('q-cancel').hidden = false;
  qrPrev(); $('q-mode').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('q-label').focus();
}
const qrCancel = () => { qrEditId = null; render(true); };
// Önizleme: QR kutusunun boyutu ve sürükleme (konum yüzde olarak gizli alanlara yazılır)
function updateCampPrev(id) {
  const prev = $('camp-prev-' + id); if (!prev) return;
  const q = prev.querySelector('.cpv-qr'), sz = $('c-size-' + id), hx = $('c-x-' + id), hy = $('c-y-' + id);
  if (!q || !sz || !hx || !hy) return;
  q.style.height = sz.value + '%'; q.style.left = hx.value + '%'; q.style.top = hy.value + '%';
  if (q.dataset.on) return; q.dataset.on = '1';
  q.addEventListener('pointerdown', ev => {
    ev.preventDefault(); q.setPointerCapture(ev.pointerId); q.style.cursor = 'grabbing';
    const mv = e => {
      const r = prev.getBoundingClientRect();
      const px = Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)), py = Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100));
      hx.value = px.toFixed(1); hy.value = py.toFixed(1); q.style.left = px + '%'; q.style.top = py + '%';
    };
    const up = () => { q.style.cursor = 'grab'; q.removeEventListener('pointermove', mv); q.removeEventListener('pointerup', up); q.removeEventListener('pointercancel', up); };
    q.addEventListener('pointermove', mv); q.addEventListener('pointerup', up); q.addEventListener('pointercancel', up);
  });
}
async function uploadCampImg(id, input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    const res = await fetch('/api/admin/campaigns/' + id + '/image', { credentials: 'same-origin', method: 'POST', body: fd });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || 'Yüklenemedi');
    const c = (S.db.campaigns || []).find(x => x.id === id);
    if (c) c.image = j.url;
    toast('Görsel yüklendi');
    render(true);
  } catch (e) { toast(e.message, true); }
}
async function removeCampImg(id) {
  if (!await UI.ask('Kampanya görseli kaldırılsın mı?')) return;
  try {
    await req('DELETE', '/campaigns/' + id + '/image');
    const c = (S.db.campaigns || []).find(x => x.id === id);
    if (c) c.image = null;
    toast('Görsel kaldırıldı');
    render(true);
  } catch (e) { toast(e.message, true); }
}
const saveCamp = id => {
  const g = k => { const el = $('c-' + k + '-' + id) || $('c-' + k); return el ? el.value : ''; };
  return act('PUT', '/campaigns/' + id, {
    url: g('url'), headline: g('h'), everyMin: g('e'), durSec: g('d'),
    qrX: g('x'), qrY: g('y'), qrSize: g('size'),
  }, 'Kampanya kaydedildi');
};
async function campToggle(id, el) {
  const urlEl = $('c-url-' + id) || $('c-url');
  const url = (urlEl ? urlEl.value : '').trim();
  const ok = await act('PUT', '/campaigns/' + id, { url, enabled: el.checked }, el.checked ? 'Kampanya açıldı' : 'Kampanya kapatıldı');
  if (!ok) el.checked = !el.checked;
}
// yazarken canlı QR önizlemesi (kaydetmeden üretilir)
let qrPrevT = 0;
function qrPrev() {
  clearTimeout(qrPrevT);
  qrPrevT = setTimeout(async () => {
    const box = $('q-prev'); if (!box) return;
    const kind = $('q-kind').value, b = { kind };
    if (kind === 'wifi') Object.assign(b, { ssid: $('q-ssid').value.trim(), password: $('q-pass').value, security: $('q-sec').value }); else if (kind === 'link') b.text = $('q-text').value.trim();
    if (kind === 'wifi' ? !b.ssid : kind === 'link' && !b.text) { box.innerHTML = `<span class="muted">${kind === 'wifi' ? 'Ağ adını ve şifreyi yazın, QR burada oluşur' : 'Bağlantıyı yazın, QR burada oluşur'}</span>`; return; }
    try { const j = await req('POST', '/qrs/preview', b); if ($('q-prev')) $('q-prev').innerHTML = `<div class="qr">${j.svg}</div><span class="muted">Önizleme · kaydetmek için “QR ekle”</span>`; } catch (e) { box.innerHTML = `<span class="muted">${esc(e.message)}</span>`; }
  }, 350);
}
function addQr() {
  const kind = $('q-kind').value, b = { kind, label: $('q-label').value.trim() };
  if (kind === 'wifi') Object.assign(b, { ssid: $('q-ssid').value.trim(), password: $('q-pass').value, security: $('q-sec').value }); else if (kind === 'hub') b.hub = hubRead(); else b.text = $('q-text').value.trim();
  if (qrEditId) { const id = qrEditId; qrEditId = null; act('PATCH', '/qrs/' + id, b, 'QR kaydedildi'); } else act('POST', '/qrs', b, 'QR kod eklendi');
}

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
         <div class="row mt"><button class="btn g s" onclick="act('POST','/birthday/fire',undefined,'Kutlama gösteriliyor',false)">Şimdi göster</button><span style="flex:1"></span><button class="btn" data-save onclick="saveTimes()">Kaydet</button></div>`)
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
async function upCeleb(day, inp) { const f = inp.files[0]; inp.value = ''; if (!f) return; const fd = new FormData(); fd.append('day', day); fd.append('file', f); try { await req('POST', '/celebrate/photos', fd); toast('Fotoğraf eklendi'); render(true); } catch (e) { toast(e.message, true); } }

/* ================= BİLGİ BANDI ================= */
SECTIONS.info = {
  html() {
    const db = S.db, ph = db.pharmacy || {}, nw = db.news || {}, mv = db.movies || {}, bk = db.breaking || {}, ic = db.infoCfg || {}, idur = ic.dur || {}, imax = ic.max || {};
    const ist = /istanbul|İstanbul/i.test((db.location || {}).city || '');
    const defSec = ic.pageSec || 12;
    // süre / öğe sayısı kutuları (boş = genel değer)
    const durIn = (k, d) => `<label class="ibf"><span>Ekranda kalma süresi</span><span class="ibn"><input type="number" class="ic-d" data-t="${k}" min="5" max="60" value="${idur[k] || ''}" placeholder="${d || defSec}"><em>sn</em></span></label>`;
    const maxIn = (k, d, lo, hi) => `<label class="ibf"><span>En çok kaç öğe</span><span class="ibn"><input type="number" class="ic-m" data-t="${k}" min="${lo}" max="${hi}" value="${imax[k] || ''}" placeholder="${d}"><em>adet</em></span></label>`;
    const tile = (icon, title, desc, on, js, body = '', extra = '') => `<div class="ibc ${on === null || on ? '' : 'off'}"><div class="ibh"><span class="ibi">${icon}</span><div class="b"><b>${title}</b><span>${desc}</span></div>${on === null ? '' : sw(on, js)}</div><div class="ibb">${body}</div>${extra ? `<details class="ibx"><summary>Diğer ayarlar</summary><div>${extra}</div></details>` : ''}</div>`;
    return head('Bilgi Bandı', '"Maçlar ve bilgi sayfaları" widget\'ında sırayla dönen ve kayan bantta akan bilgiler. Maç yokken ekranı canlı tutar.')
      + lock('Bilgi bandı')
      + card('Genel süre', 'Her sayfa ekranda bu kadar kalır. Aşağıda bir içerik için ayrı süre girerseniz o içerik için o geçerli olur. Tüm ekranlar sunucu saatine göre aynı sayfada kalır.',
        `<div class="ibg"><input type="range" id="ic-def" min="5" max="60" step="1" value="${defSec}" oninput="$('ic-defv').textContent=this.value+' sn'"><b id="ic-defv">${defSec} sn</b></div>
         <div class="row end mt"><button class="btn" onclick="saveInfoCfg()">Süreleri kaydet</button></div>`)
      + `<div class="ibgrid">`
      + tile('⚽', 'Maç sayfaları', 'Seçili liglerin yaklaşan maçları', null, '', durIn('league') + `<p class="muted" style="font-size:12px;margin:0">Ligleri <a href="#sport">Spor</a> sayfasından seçin.</p>`)
      + tile('🏆', 'Puan durumu', 'Ligin puan tablosu (birden çok sayfa olabilir)', db.showStandings !== false, "opt('showStandings',this.checked)", durIn('table'))
      + tile('🚨', 'Son dakika', 'Seçtiğiniz kaynakların başlıkları; yeni haber gelince üstte kırmızı bantla da çıkar', bk.enabled !== false, "act('PUT','/breaking',{enabled:this.checked},'Kaydedildi')",
          durIn('breaking') + maxIn('breaking', 8, 1, 12),
          `<div class="swr"><div class="b"><b>Ekranda bildirim bandı</b><span>Yeni son dakika gelince birkaç saniye üstte gösterilir</span></div>${sw(bk.banner !== false, "act('PUT','/breaking',{banner:this.checked},'Kaydedildi',false)")}</div>
           <div class="row mt" style="flex-wrap:wrap;align-items:center;gap:10px"><span class="muted">Kaynaklar:</span>${[['trt', 'TRT Haber'], ['aa', 'Anadolu Ajansı'], ['ntv', 'NTV']].map(([k, n]) => `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px"><input type="checkbox" ${(bk.sources || ['trt']).includes(k) ? 'checked' : ''} onchange="brkSrc('${k}',this.checked)"> ${n}</label>`).join('')}</div>`)
      + tile('📰', 'Haberler', 'Türkiye gündeminden başlıklar (TRT, AA, NTV)', nw.enabled !== false, "act('PUT','/news',{enabled:this.checked},'Kaydedildi')",
          durIn('news') + maxIn('news', 'hepsi', 1, 20),
          `<div class="f">${fl('Kategori', `<select onchange="act('PUT','/news',{tag:this.value},'Kaydedildi')">${[['mix', 'Son dakika · TRT + AA + NTV'], ['trt', 'Son dakika · TRT Haber'], ['aa', 'Son dakika · Anadolu Ajansı'], ['ntv', 'Gündem · NTV'], ['general', 'Genel'], ['economy', 'Ekonomi'], ['sport', 'Spor'], ['technology', 'Teknoloji']].map(([v, l]) => `<option value="${v}" ${(nw.tag || 'mix') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}</div>`)
      + tile('💊', 'Nöbetçi eczaneler', 'Bugünkü nöbetçi eczaneler (konumdan otomatik ya da ilçe seçerek)', ph.enabled !== false, "act('PUT','/pharmacy',{enabled:this.checked},'Kaydedildi')",
          durIn('pharm') + maxIn('pharm', 'hepsi', 1, 12), pharmBox(ph, db.location || {}))
      + tile('🎬', 'Bu hafta vizyona girenler', 'Vizyona girecek filmler; fragmanlar arada medya yerine oynar', mv.enabled !== false, "act('PUT','/movies',{enabled:this.checked},'Kaydedildi')",
          durIn('movies') + maxIn('movies', 'hepsi', 1, 20),
          `<div class="swr"><div class="b"><b>Fragmanları oynat</b><span>Sessiz; sıklığını aşağıdan ayarlayın</span></div>${sw(mv.trailers !== false, "act('PUT','/movies',{trailers:this.checked},'Kaydedildi',false)")}</div>
           <div class="f mt">${fl('Kaç içerikte bir fragman', `<input type="number" id="mv-every" min="2" max="20" value="${mv.every || 4}">`)}${fl('Fragmanlar arası en az (dakika)', `<input type="number" id="mv-gap" min="5" max="180" value="${mv.gapMin || 8}">`)}</div><div class="row end mt"><button class="btn s g" onclick="act('PUT','/movies',{every:+\$('mv-every').value,gapMin:+\$('mv-gap').value},'Fragman ayarı kaydedildi')">Kaydet</button></div>`)
      + tile('📚', 'Yeni çıkan kitaplar', 'Haftanın yeni kitapları (bilgi sayfası ve medyada kitap slaytı)', db.showBooks !== false, "opt('showBooks',this.checked)",
          durIn('books') + maxIn('books', 'hepsi', 1, 40),
          `<div class="swr"><div class="b"><b>Medya döngüsünde kitap slaytı</b><span>Fotoğraf ve videoların arasında 4\'lü kitap kartı</span></div>${sw(db.showBookSlides !== false, "opt('showBookSlides',this.checked)")}</div>
           <div class="f mt">${fl('Kaç içerikte bir kitap slaytı', `<input type="number" min="1" max="50" value="${db.bookEvery || 6}" onchange="opt('bookEvery',+this.value)">`)}${fl('Kitap slaytları arası en az (dakika)', `<input type="number" min="0" max="120" value="${db.bookGapMin || 0}" placeholder="0" onchange="opt('bookGapMin',+this.value)">`)}</div>
           <p class="muted" style="font-size:12px;margin:6px 0 0">Örnek: 10 ve 5 yazarsanız 10 içerik oynadıktan sonra, en az 5 dakika geçmişse kitap slaytı gelir. Dakika 0 ise yalnız içerik sayısına bakılır.</p>`)
      + tile('📜', 'Tarihte bugün', 'Vikipedi\'den bugünün tarihinde yaşanan olaylar', db.showOnThisDay !== false, "opt('showOnThisDay',this.checked)", durIn('otd') + maxIn('otd', 'hepsi', 1, 12))
      + tile('🚗', 'Canlı trafik', ist ? 'İstanbul trafik haritası ve yoğunluk yüzdesi' : 'Yalnızca İstanbul\'daki işletmelerde gösterilir', db.showTraffic !== false, "opt('showTraffic',this.checked)", durIn('traffic'))
      + `</div><div class="row end mt"><button class="btn" onclick="saveInfoCfg()">Süreleri ve sınırları kaydet</button></div>`;
  },
};
async function saveInfoCfg() {
  const dur = {}, max = {};
  document.querySelectorAll('.ic-d').forEach(e => { dur[e.dataset.t] = e.value; });
  document.querySelectorAll('.ic-m').forEach(e => { max[e.dataset.t] = e.value; });
  if (await act('PUT', '/infocfg', { pageSec: $('ic-def').value, dur, max }, 'Bilgi bandı ayarları kaydedildi', false)) { S.db = await req('GET', '/db'); render(true); }
}
const IL81 = ['Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Aksaray', 'Amasya', 'Ankara', 'Antalya', 'Ardahan', 'Artvin', 'Aydın', 'Balıkesir', 'Bartın', 'Batman', 'Bayburt', 'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum', 'Denizli', 'Diyarbakır', 'Düzce', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari', 'Hatay', 'Iğdır', 'Isparta', 'İstanbul', 'İzmir', 'Kahramanmaraş', 'Karabük', 'Karaman', 'Kars', 'Kastamonu', 'Kayseri', 'Kilis', 'Kırıkkale', 'Kırklareli', 'Kırşehir', 'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Mardin', 'Mersin', 'Muğla', 'Muş', 'Nevşehir', 'Niğde', 'Ordu', 'Osmaniye', 'Rize', 'Sakarya', 'Samsun', 'Şanlıurfa', 'Siirt', 'Sinop', 'Sivas', 'Şırnak', 'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Uşak', 'Van', 'Yalova', 'Yozgat', 'Zonguldak'];
const pharmAuto = ph => ph.mode === 'auto' || ph.mode === 'manual' ? ph.mode === 'auto' : !(ph.districts || []).length;
// Nöbetçi eczane ayarı: otomatik (konumdan) ya da elle (il + ilçe)
function pharmBox(ph, loc) {
  const auto = pharmAuto(ph), a = ph.auto || {};
  const chips = `<div class="chips"><span class="chip ${auto ? 'on' : ''}" onclick="pharmMode('auto')">📍 Otomatik (konumum)</span><span class="chip ${auto ? '' : 'on'}" onclick="pharmMode('manual')">✍ Elle seç</span></div>`;
  let body;
  if (auto) {
    const ok = loc.custom && a.district && a.lat === loc.lat && a.lon === loc.lon;
    body = `<p class="muted mt" id="ph-auto">${!loc.custom ? 'Konumunuz henüz seçilmemiş. <a href="#settings/business">Ayarlar › İşletme</a> bölümünden konumunuzu seçin.' : ok ? `<span>Konumunuz</span>: ${esc(loc.city)}. <span>Nöbetçi eczaneler</span>: <b>${esc(a.district)}, ${esc(a.il)}</b>` : 'Konumunuzdan ilçe bulunuyor… Birkaç saniye sonra sayfayı yenileyin ya da elle seçin.'}</p>
      <div class="row end mt"><span id="ph-res" class="muted" style="flex:1"></span><button class="btn g s" onclick="testPharm()">Dene</button></div>`;
  } else {
    body = `<div class="f mt">${fl('İl', `<select id="ph-il">${IL81.map(x => `<option ${x === (ph.il || 'İstanbul') ? 'selected' : ''}>${x}</option>`).join('')}</select>`)}${fl('İlçe(ler), virgülle (en fazla 2)', `<input type="text" id="ph-d" value="${esc((ph.districts || []).join(', '))}" placeholder="örn. Kadıköy, Üsküdar">`)}</div>
      <div class="row end mt"><span id="ph-res" class="muted" style="flex:1"></span><button class="btn g s" onclick="testPharm()">Dene</button><button class="btn s" data-save onclick="savePharm()">Kaydet</button></div>`;
  }
  return chips + body;
}
async function pharmMode(m) {
  const j = await act('PUT', '/pharmacy', { mode: m }, '', false);
  if (j && j.warn) toast(j.warn, true); else if (j) toast('Kaydedildi');
  S.db = await req('GET', '/db'); render(true);
}
const pharmBody = () => pharmAuto(S.db.pharmacy || {}) ? { mode: 'auto' } : { mode: 'manual', il: $('ph-il').value.trim(), districts: $('ph-d').value.split(',').map(x => x.trim()).filter(Boolean) };
const savePharm = () => act('PUT', '/pharmacy', pharmBody(), 'Eczane ayarı kaydedildi');
async function testPharm() {
  $('ph-res').textContent = 'Sorgulanıyor…';
  try { const j = await req('POST', '/pharmacy/test', pharmBody()); $('ph-res').textContent = `${j.count} nöbetçi eczane bulundu${j.sample[0] ? ': ' + j.sample[0].name : ''}`; }
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
        <div class="row end mt"><button class="btn" data-save onclick="saveProfile()">Kaydet</button></div>`);
    } else if (sub === 'devices') {
      h += devicesPage();
      window.__pair = null;
    } else if (sub === 'users') {
      h += `<div class="grid g2">` + (owner() ? card('Kullanıcılar', 'Personel hesapları içerik ekleyebilir (medya, duyuru, doğum günü); yedek geri yükleme ve kullanıcı yönetimi yapamaz.', `<div id="ulist" class="list"><div class="muted">Yükleniyor…</div></div>
          <hr class="sep2"><div class="f">${fl('Kullanıcı adı', '<input type="text" id="u-n" autocomplete="off">')}${fl('Şifre (en az 8)', '<input type="password" id="u-p" autocomplete="new-password">')}</div><div class="row end mt"><button class="btn" onclick="addUser()">Ekle</button></div>`) : '')
        + card('Şifremi değiştir', '', `<div class="f">${fl('Mevcut şifre', '<input type="password" id="pw-c" autocomplete="current-password">')}${fl('Yeni şifre (en az 8)', '<input type="password" id="pw-n" autocomplete="new-password">')}</div><div class="row end mt"><button class="btn" onclick="changePw()">Değiştir</button></div>`) + `</div>`;
    } else if (sub === 'plan') {
      const p = t.plan, u = S.me.usage, acc = t.access;
      const m = (l, used, lim, f = x => x) => `<div class="row" style="justify-content:space-between;font-size:14px"><span>${l}</span><span class="muted">${f(used)} / ${lim >= 999 || (p.id === 'sinirsiz' && l !== 'Cihaz') ? '∞' : f(lim)}</span></div><div class="meter" style="margin-bottom:12px"><i style="width:${Math.max(2, Math.min(100, lim >= 999 ? 0 : used / lim * 100))}%"></i></div>`;
      h += `<div class="grid g2">` + card('Paketiniz', '', `<div style="font-size:24px;font-weight:700;color:var(--accent2)">${esc(p.name)}</div><p class="muted" style="margin:2px 0 16px">${acc.kind === 'unlimited' ? 'Süresiz · tüm özellikler açık, sınır yok' : !acc.ok ? 'Süresi doldu' : (acc.kind === 'trial' ? 'Deneme · ' : 'Aktif · ') + fmtDate(acc.until) + ' tarihine kadar'}</p>
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
    if (sub === 'devices') { drawDevStatus(); const pc = $('pcode'); if (pc && pc.value) pc.focus(); }
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
const delDev = async id => { if (await UI.ask('Bu cihaz listeden kaldırılsın mı? Kutu bağlantısını kaybeder.', { ok: 'Sil', danger: true })) act('DELETE', '/devices/' + id, undefined, 'Cihaz kaldırıldı'); };
const logoutDev = async id => { if (await UI.ask('TV kutusundaki uygulamadan çıkış yapılsın mı? Ekran giriş ekranına döner; yeniden bağlamak için kod ya da kullanıcı adı ve şifre gerekir.')) act('POST', '/devices/' + id + '/logout', undefined, 'Çıkış yapıldı; TV giriş ekranına döndü'); };
async function addUser() { if (await act('POST', '/users', { username: $('u-n').value.trim(), password: $('u-p').value }, 'Kullanıcı eklendi', false)) { S.me = await req('GET', '/me'); render(true); } }
const delUser = async (id, n) => { if (await UI.ask(`"${n}" silinsin mi?`, { ok: 'Sil', danger: true })) act('DELETE', '/users/' + id, undefined, 'Silindi'); };
async function changePw() { if (await act('PUT', '/password', { current: $('pw-c').value, next: $('pw-n').value }, 'Şifre değiştirildi', false)) { $('pw-c').value = $('pw-n').value = ''; } }
const restore = async n => { if (await UI.ask('Bu yedek geri yüklensin mi? Mevcut ayarlar önce yedeklenir.')) act('POST', `/backups/${encodeURIComponent(n)}/restore`, undefined, 'Yedek geri yüklendi'); };

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
  if (kind === 'happy') return (MENU.happy || {}).sch;
}
// Kategori ve indirim saati için hazır saat dilimleri
const SCH_PRESETS = { cat: [['Kahvaltı', '07:00', '12:00'], ['Öğle', '11:30', '16:00'], ['Akşam', '17:00', '00:00'], ['Gece', '22:00', '03:00']], happy: [['17:00–19:00', '17:00', '19:00'], ['16:00–20:00', '16:00', '20:00'], ['Öğle 14:00–17:00', '14:00', '17:00']] };
const schPreset = (f, t) => { $('sc-from').value = f; $('sc-to').value = t; };
function openSched(kind, id) {
  const sc = schOf(kind, id) || {}, d = new Set(sc.days || []);
  const pre = SCH_PRESETS[kind];
  const title = kind === 'happy' ? 'İndirim ne zaman geçerli?' : kind === 'cat' ? 'Kategori ne zaman görünsün?' : kind === 'camp' ? 'Kampanya ne zaman çıksın?' : 'Bu içerik ne zaman oynasın?';
  openModal(`<h3 style="margin:0 0 6px">${title}</h3><p class="muted" style="margin:0 0 16px">Boş bırakılan alanlar sınır koymaz. Hiçbiri seçilmezse her zaman görünür.</p>
    <div class="fl"><span>Günler</span><div class="chips" id="sc-days">${DAYS.map((n, i) => `<span class="chip ${d.has(i + 1) ? 'on' : ''}" data-d="${i + 1}" onclick="this.classList.toggle('on')">${n}</span>`).join('')}
      <span class="chip" onclick="schPick([1,2,3,4,5])">Hafta içi</span><span class="chip" onclick="schPick([6,7])">Hafta sonu</span></div></div>
    ${pre ? `<div class="fl mt"><span>Hazır saatler</span><div class="chips">${pre.map(([n, f, t]) => `<span class="chip" onclick="schPreset('${f}','${t}')">${n}${n.includes(':') ? '' : ` <span class="muted">${f}–${t}</span>`}</span>`).join('')}</div></div>` : ''}
    <div class="f mt">${fl('Başlangıç saati', `<input type="time" id="sc-from" value="${sc.from || ''}">`)}${fl('Bitiş saati', `<input type="time" id="sc-to" value="${sc.to || ''}">`)}</div>
    <p class="muted" style="font-size:12.5px;margin:6px 0 0">Bitiş başlangıçtan önceyse gece yarısını geçer (22:00 – 02:00 gibi).</p>
    <div class="f mt">${fl('İlk gün', `<input type="date" id="sc-start" value="${sc.start || ''}">`)}${fl('Son gün', `<input type="date" id="sc-end" value="${sc.end || ''}">`)}</div>
    <div class="row mt" style="justify-content:space-between"><button class="btn g" onclick="saveSched('${kind}','${id}',true)">Her zaman göster</button><span class="row"><button class="btn g" onclick="closeModal()">Vazgeç</button><button class="btn" data-save onclick="saveSched('${kind}','${id}')">Kaydet</button></span></div>`);
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
  if (kind === 'happy') { if (!sc || !sc.from) return toast('İndirim saati için başlangıç ve bitiş saati girin', true); MENU.happy.sch = sc; MENU.__dirty = 1; closeModal(); render(true); return saveMenu(); }
  const ok = await act('PUT', kind === 'camp' ? `/campaigns/${id}/sch` : `/videos/${id}`, { sch: sc }, sc ? 'Zamanlama kaydedildi: ' + schText(sc) : 'Her zaman gösterilecek');
  if (ok) closeModal();
}

/* ================= HAZIR İÇERİKLER (afişler) ================= */
const themeVars = () => { const th = S.me.tenant.theme || {}; return `--bg:${th.bg};--accent:${th.accent};--accent2:${th.accent2};--white:${th.text};--font:'${th.font || 'Montserrat'}'`; };
const posterItem = x => ({ ...x, image: x.image ? S.me.upBase + x.image : null });
function thumb(x) {
  if (x.type === 'youtube') return `<img src="https://i.ytimg.com/vi/${esc(x.yt)}/mqdefault.jpg" loading="lazy"><span style="position:absolute;left:6px;bottom:6px;background:rgba(0,0,0,.75);color:#fff;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:700">▶ YouTube · ${x.dur || 30} sn</span>`;
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
  const mine = S.db.videos.filter(v => v.type === 'poster' || v.design);
  return card('Fotoğraftan afiş', '', `<div class="stu-hero"><p class="muted">Ürününüzün fotoğrafını seçin, adını ve fiyatını yazın: dört hazır tasarımdan birini seçip medyaya ekleyin. Renkler fotoğraftan alınır; isterseniz okutmaları sayılan bir QR kod da eklenir.</p><button class="btn" onclick="openStudio()">📷 Fotoğraftan afiş yap</button></div>`)
    + card('Şablonlar', 'Birini seçin, yazıları değiştirin. Renkler ekranınızın temasından gelir; Tasarım → Renk ve logo bölümünde renkleri değiştirince afişler de değişir.',
      `<div class="pgal">${Object.entries(SPPoster.TEMPLATES).filter(([, t]) => !t.hidden).map(([k, t]) => `<button class="pcard" onclick="editPoster(null,'${k}')"><div class="pmini" data-tpl="${k}" style="${themeVars()}"></div><b>${esc(t.name)}</b></button>`).join('')}</div>`)
    + card(`Afişleriniz <span class="muted">· ${mine.length}</span>`, 'Medya sırasında yer alırlar; sırayı "Medya ve sıra" sekmesinden değiştirebilirsiniz.',
      mine.length ? `<div class="pgal">${mine.map(x => `<button class="pcard" onclick="${x.design ? `openStudio('${x.id}')` : `editPoster('${x.id}')`}">${x.design ? `<div class="pmini"><img src="${S.me.upBase}${x.file}" loading="lazy" alt=""></div>` : `<div class="pmini" data-pid="${x.id}" style="${themeVars()}"></div>`}<b>${esc(x.name)}</b><span class="muted" style="font-size:12px">${x.sch ? '⏱ ' + esc(schShort(x.sch)) : 'Her zaman'}${x.hidden ? ' · gizli' : ''}</span></button>`).join('')}</div>` : '<div class="empty">Henüz afiş yok. Yukarıdan bir şablon seçin.</div>');
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
    <div class="row mt" style="justify-content:space-between">${id ? `<button class="btn d" onclick="UI.ask('Afiş silinsin mi?', { ok: 'Sil', danger: true }).then(ok=>{if(ok){closeModal();act('DELETE','/videos/${id}',undefined,'Silindi')}})">Sil</button>` : '<span></span>'}
      <span class="row"><button class="btn g" onclick="closeModal()">Vazgeç</button>${id ? `<button class="btn g" onclick="closeModal();openSched('video','${id}')">⏱ Zamanla</button>` : ''}<button class="btn" onclick="savePoster()">${id ? 'Kaydet' : 'Medyaya ekle'}</button></span></div>`);
  pedDraw();
}
function pedSet(k, l, v) { if (l) PED.i18n[l] = { ...(PED.i18n[l] || {}), [k]: v }; else PED.fields[k] = v; pedDraw(); }
function pedDraw() { const el = $('ped-pv'); if (!el) return; el.innerHTML = SPPoster.html(posterItem(PED)); SPPoster.fit(el.firstChild); }
async function pedImg(inp) {
  const f = inp.files[0]; inp.value = ''; if (!f) return; const fd = new FormData(); fd.append('file', f);
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
        <button class="btn g s" onclick="act('POST','/google/refresh',undefined,'Yorumlar yenilendi')">Yenile</button><button class="btn d s" onclick="UI.ask('Google bağlantısı kaldırılsın mı?', { ok: 'Kaldır', danger: true }).then(ok=>{if(ok)act('DELETE','/google',undefined,'Kaldırıldı')})">Kaldır</button></div>
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
          <button class="btn g s" onclick="act('POST','/instagram/refresh',undefined,'Paylaşımlar yenilendi')">Yenile</button><button class="btn d s" onclick="UI.ask('Instagram bağlantısı kaldırılsın mı?', { ok: 'Kaldır', danger: true }).then(ok=>{if(ok)act('DELETE','/instagram',undefined,'Kaldırıldı')})">Kaldır</button></div>
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
const musDiag = m => {
  if (!m || !m.on) return 'Kapalı';
  const pr = { yt: 'YouTube', ytm: 'YT Music', ytmix: 'Kendi listesi', spotify: 'Spotify', radio: 'Radyo' }[m.provider] || m.provider || '?';
  if (m.err) return `<b style="color:#e6a23c">${pr}: ${esc(m.err)}</b>`;
  if (!m.playing) return `${pr} · duraklatılmış`;
  if (m.spConnect) return `Spotify Connect · telefondan çalıyor`;
  if (m.provider === 'radio') return m.radio && !m.radio.paused ? `Radyo çalıyor · ses %${m.radio.vol}${m.radio.muted ? ' · ⚠ susturulmuş' : ''}` : 'Radyo sessiz — yayın yok';
  const yt = m.yt;
  if (yt) {
    if (yt.state === 1) return `${pr} çalıyor · ses %${yt.vol}${yt.muted ? ' · <b style="color:#e6a23c">⚠ muted</b>' : ''}`;
    if (yt.state === 5) return `${pr} · hazırlanıyor`;
    if (yt.state === 2) return `${pr} · YT tarafında duraklatılmış`;
    if (yt.state === 0) return `${pr} · bitişte`;
    if (yt.state === -1) return `${pr} · YT başlamadı`;
  }
  return m.needUnlock ? `${pr} · ses kilidi bekliyor (kutuya bir kez dokunun)` : `${pr} · çalışıyor`;
};
const upFmt = s => s < 3600 ? Math.round(s / 60) + ' dk' : s < 86400 ? Math.round(s / 3600) + ' saat' : Math.round(s / 86400) + ' gün';
const omLbl = m => m >= 1440 ? '1 gün' : m >= 60 ? (m >= 720 ? '12 saat' : (m / 60) + ' saat') : m + ' dakika';
// ================= CİHAZLAR SEKMESİ =================
// Tek yerde: durum özeti, her cihaz için bir kart (durum + işlemler + ayrıntı), cihaz ekleme adımları, uyarılar ve performans
let DEVADD = false;     // cihaz ekleme bölümü açık mı (tür değişince kapanmasın)
let DEVT = 'android';   // bağlanacak cihaz türü: android | windows
let DEVST = null;       // /devices/status yanıtı (cihaz ayrıntıları için)
const refreshDev = () => render(true);
function devicesPage() {
  const devs = S.scr.devices, lim = S.scr.limit, full = lim !== 999 && devs.length >= lim, on = devs.filter(d => d.online).length;
  const top = `<div class="dv-top"><div><b>${devs.length ? `${on}/${devs.length} cihaz çevrimiçi` : 'Henüz cihaz yok'}</b><span>${lim === 999 ? 'Paketinizde cihaz sayısı sınırsız' : `Paketiniz ${lim} cihaza kadar izin verir`}</span></div>${devs.length ? `<button class="btn g s" onclick="act('POST','/devices/reload',undefined,'Yenileme komutu gönderildi',false)">${ic('refresh-cw')}Tüm ekranları yenile</button>` : ''}</div>`;
  return top + `<div id="dvcards" class="dv-grid">${devCards()}</div>` + devAddHtml(!devs.length || !!window.__pair, full) + `<div id="dvmore">${devMoreHtml()}</div>`;
}
function devCards() {
  const devs = S.scr.devices;
  if (!devs.length) return `<div class="dv-empty">${ic('tv')}<b>Henüz bağlı cihaz yok</b><span>Aşağıdaki üç adımla ilk TV kutunuzu bağlayın.</span></div>`;
  const st = new Map(((DEVST && DEVST.devices) || []).map(x => [x.id, x]));
  return devs.map(d => devCard(d, (st.get(d.id) || {}).report || {})).join('');
}
// Kaynak çubuğu: yüzde değerine göre renk (yeşil / sarı / kırmızı)
function devMeter(label, pct, text) {
  const p = Math.max(0, Math.min(100, Math.round(pct))), c = p >= 90 ? 'r' : p >= 70 ? 'y' : 'g';
  return `<div class="dv-m"><span class="l">${label}</span><span class="bar"><i class="${c}" style="width:${p}%"></i></span><b>${esc(text)}</b></div>`;
}
function devRes(r, on) {
  const x = r.res; if (!x || !on) return '';
  const m = [];
  if (x.cpu >= 0 && x.cpu !== undefined) m.push(devMeter('İşlemci', x.cpu, '%' + Math.round(x.cpu)));
  if (x.ramApp > 0 && x.ramTotal > 0) m.push(devMeter('Bellek (uygulama)', x.ramApp / x.ramTotal * 100, `${x.ramApp} / ${x.ramTotal} MB`));
  if (x.ramTotal > 0 && x.ramFree >= 0 && x.ramFree !== undefined) m.push(devMeter('Cihaz belleği', (x.ramTotal - x.ramFree) / x.ramTotal * 100, `${x.ramTotal - x.ramFree} MB dolu`));
  if (x.gfx > 0) m.push(devMeter('Grafik belleği', x.ramTotal > 0 ? x.gfx / x.ramTotal * 100 : 0, x.gfx + ' MB'));
  if (!m.length && !x.gpu) return '';
  const info = [x.gpu ? 'Ekran kartı: ' + x.gpu : '', x.cores ? x.cores + ' çekirdek' : ''].filter(Boolean).join(' · ');
  return `<div class="dv-res"><h4>Kaynak kullanımı</h4>${m.join('')}${info ? `<small>${esc(info)}</small>` : ''}</div>`;
}
// Bir cihazın uyarıları ve bilgi satırları (kart ve yan pencere aynı veriyi kullanır)
function devInfo(d, r) {
  const old = !!(DEVST && DEVST.build && r.build && r.build !== DEVST.build), flags = [];
  if (old) flags.push('Eski sürüm: birkaç dakika içinde kendini güncellemeli');
  if (r.boot === 'izin-yok') flags.push('Kutu açılınca ekran gelmez: kutuda Ayarlar › Uygulamalar › ScreenPano › “Diğer uygulamaların üzerinde göster” iznini açın');
  // birkaç kısa aksama (video/fotoğraf geçişi gibi) normaldir; ancak hız düşükse ya da dakikada çok aksama varsa uyar (takılma testinin ölçütüyle uyumlu)
  if (r.jank && (r.jank.fps < 50 || r.jank.drops > 25)) flags.push(`Ekranda takılma var (~${r.jank.fps} fps, dakikada ${r.jank.drops} aksama): ayrıntı için “Takılma testi”ni çalıştırın`);
  if (r.weak && r.fx >= 2) flags.push('Düşük bellekli cihaz: “çok hafif” mod otomatik açıldı. Videoları Medya sekmesinde 720p ya da 480p yapmanız önerilir');
  else if (r.fxAuto && r.fx >= 2) flags.push('Cihaz takıldığı için “çok hafif” moda otomatik geçti. Efekt modunu Ayarlar › Cihazlar altında değiştirebilirsiniz');
  if (r.res && r.res.low) flags.push('Cihazın belleği doldu: uygulama yavaşlayabilir, kutuyu yeniden başlatın');
  if (r.mus && r.mus.on && r.mus.err) flags.push('Müzik: ' + r.mus.err);
  if (r.lastError) flags.push('Son hata: ' + r.lastError);
  const rows = [['Model', r.model], ['Adres', r.ip], ['Uygulama', r.app], ['Yayın sürümü', r.build ? r.build.slice(0, 8) + (old ? ' ⚠' : '') : ''], ['Ekran', r.screen], ['Açık kalma', r.uptime ? upFmt(r.uptime) : ''], ['Müzik', r.mus ? musDiag(r.mus) : '', 1], ['Akıcılık', r.jank ? `~${r.jank.fps} fps` : ''], ['Görüntü modu', r.fx === 2 ? 'Çok hafif' : r.fx === 1 ? 'Hafif' : r.fx === 0 && r.app ? 'Tam' : ''], ['Çevrimdışı önbellek', r.cached ? `${r.cached} dosya${r.cacheMB ? ', ' + r.cacheMB + ' MB' : ''}` : ''], ['Eklendi', fmtDate(d.created)]].filter(x => x[1]);
  return { flags, rows };
}
const devRep = id => ((((DEVST && DEVST.devices) || []).find(x => x.id === id)) || {}).report || {};
// Kart: kısa özet (durum, şu an oynayan, üç ölçüm, uyarı sayısı). Ayrıntılar ve araçlar yan pencerede açılır; sayfa uzamaz.
function devCard(d, r) {
  const on = !!d.online, { flags } = devInfo(d, r), x = r.res || {};
  const m = [];
  if (on && x.cpu >= 0 && x.cpu !== undefined) m.push(devMeter('İşlemci', x.cpu, '%' + Math.round(x.cpu)));
  if (on && x.ramApp > 0 && x.ramTotal > 0) m.push(devMeter('Bellek (uygulama)', x.ramApp / x.ramTotal * 100, `${x.ramApp} / ${x.ramTotal} MB`));
  if (on && x.ramTotal > 0 && x.ramFree >= 0 && x.ramFree !== undefined) m.push(devMeter('Cihaz belleği', (x.ramTotal - x.ramFree) / x.ramTotal * 100, `${x.ramTotal - x.ramFree} MB dolu`));
  return `<article class="dv ${on ? 'on' : 'off'}">
    <header><span class="dot ${on ? 'on' : ''}"></span><div class="t"><h3>${esc(d.name || 'TV kutusu')}</h3><p>${on ? 'Çevrimiçi' : 'Çevrimdışı · son görülme ' + ago(d.last_seen)}</p></div>
      <details class="dv-menu"><summary title="Diğer işlemler" aria-label="Diğer işlemler">${ic('ellipsis')}</summary><div class="pop">
        <button type="button" data-nm="${esc(d.name || '')}" onclick="renDev('${d.id}', this.dataset.nm)">${ic('pencil')}Adlandır</button>
        <button type="button" onclick="logoutDev('${d.id}')">${ic('log-out')}Uygulamadan çıkış yaptır</button>
        <button type="button" class="d" onclick="delDev('${d.id}')">${ic('trash-2')}Cihazı kaldır</button></div></details></header>
    ${r.playing ? `<div class="dv-now">${ic('play-f')}<span>Şu an: ${esc(r.playing)}</span></div>` : ''}
    ${m.length ? `<div class="dv-res c">${m.join('')}</div>` : ''}
    ${on ? '' : `<div class="dv-off">${ic('wifi-off')}<span>Cihaz kapalı ya da internete bağlı değil: elektriğini ve internetini kontrol edin.</span></div>`}
    <button type="button" class="dv-open" onclick="devOpen('${d.id}')">${flags.length ? `<span class="n">${ic('triangle-alert')}${flags.length} uyarı</span>` : '<span class="ok">' + ic('circle-check') + 'Sorun yok</span>'}<span class="g">Ayrıntılar ve araçlar${ic('chevron-right')}</span></button></article>`;
}
// Yan pencere: bir cihazın tüm bilgisi ve araçları. Çıktılar (ekran görüntüsü, test) yenilemede silinmesin diye bilgi bölümü ayrı çizilir.
let DRW = null;
function devOpen(id) {
  DRW = id;
  let el = $('dvd'); if (!el) { el = document.createElement('div'); el.id = 'dvd'; document.body.appendChild(el); }
  const d = S.scr.devices.find(x => x.id === id); if (!d) return devClose();
  el.innerHTML = `<div class="dvd-bg" onclick="devClose()"></div><aside class="dvd-p" role="dialog" aria-label="Cihaz ayrıntıları">
    <div class="dvd-h"><b id="dvd-t"></b><button type="button" class="dvd-x" onclick="devClose()" aria-label="Kapat">${ic('x')}</button></div>
    <div class="dvd-b"><div id="dvd-info"></div>
      <section class="dvd-s"><h4>Araçlar</h4><div id="dvd-tools"></div><div id="snap-${id}" class="dv-out"></div><div id="perf-${id}" class="dv-out"></div></section>
      <div id="dvd-more"></div></div></aside>`;
  el.className = 'on'; document.body.classList.add('dvd-open');
  devDrawInfo();
}
function devClose() { DRW = null; const el = $('dvd'); if (el) el.remove(); document.body.classList.remove('dvd-open'); }
function devDrawInfo() {
  if (!DRW || !$('dvd-info')) return;
  const d = S.scr.devices.find(x => x.id === DRW); if (!d) return devClose();
  const r = devRep(d.id), on = !!d.online, { flags, rows } = devInfo(d, r);
  $('dvd-t').innerHTML = `<span class="dot ${on ? 'on' : ''}"></span>${esc(d.name || 'TV kutusu')}<small>${on ? 'Çevrimiçi' : 'Çevrimdışı · son görülme ' + ago(d.last_seen)}</small>`;
  $('dvd-info').innerHTML = (r.playing ? `<div class="dv-now">${ic('play-f')}<span>Şu an: ${esc(r.playing)}</span></div>` : '')
    + (flags.length ? `<section class="dvd-s"><h4>Uyarılar</h4>${flags.map(f => `<div class="dv-flag">${ic('triangle-alert')}<span>${esc(f)}</span></div>`).join('')}</section>` : '')
    + (devRes(r, on) ? `<section class="dvd-s">${devRes(r, on)}</section>` : '');
  $('dvd-tools').innerHTML = on ? `<div class="dv-act"><button type="button" class="dv-b" onclick="snapDev('${d.id}')">${ic('camera')}Ekran görüntüsü</button><button type="button" class="dv-b" onclick="perfDev('${d.id}')">${ic('activity')}Takılma testi</button></div>` : `<div class="dv-off">${ic('wifi-off')}<span>Cihaz kapalı: araçlar yalnız çevrimiçi cihazda çalışır.</span></div>`;
  $('dvd-more').innerHTML = `<section class="dvd-s"><h4>Bilgiler</h4>${rows.length ? `<dl class="dvd-dl">${rows.map(([k, v, raw]) => `<dt>${k}</dt><dd>${raw ? v : esc(String(v))}</dd>`).join('')}</dl>` : '<p class="muted">Henüz bilgi gelmedi.</p>'}</section>
    <section class="dvd-s"><div class="swr"><div class="b"><b>Yerel ekran (deneysel)</b><span>Ekranı sayfa yerine uygulamanın kendi bileşenleriyle çizer (Android 3.3+)</span></div>${sw(!!d.native, `act('PUT','/devices/${d.id}',{native:this.checked},'Kaydedildi')`)}</div></section>`;
}
addEventListener('keydown', e => { if (e.key === 'Escape' && DRW) devClose(); });
addEventListener('hashchange', () => { if (DRW) devClose(); });
function devAddHtml(open, full) {
  const win = DEVT === 'windows', nm = encodeURIComponent(S.me.tenant.name);
  const pair = window.__pair ? window.__pair.replace(/(\d{3})(\d{3})/, '$1 $2') : '';
  return `<details class="dv-add" ${open || DEVADD ? 'open' : ''} ontoggle="DEVADD=this.open"><summary>${ic('plus')}<b>Cihaz ekle</b><span>Android TV kutusu ya da Windows bilgisayar</span></summary>
    ${full ? `<div class="dv-flag">${ic('triangle-alert')}<span>Paket sınırına ulaştınız. Yeni cihaz için önce eskisini kaldırın.</span></div>` : ''}
    <div class="dv-types"><button type="button" class="${win ? '' : 'on'}" onclick="DEVT='android';refreshDev()">${ic('tv')}Android TV kutusu</button><button type="button" class="${win ? 'on' : ''}" onclick="DEVT='windows';refreshDev()">${ic('monitor')}Windows bilgisayar</button></div>
    <ol class="dv-steps">
      <li><span class="n">1</span><b>Uygulamayı indirin</b><p>${win ? 'Televizyona bağlı bilgisayara kurun; televizyon ikinci ekransa yayın oraya açılır.' : 'Kutuya kurun. Tek kutu, HDMI dağıtıcıyla tüm TV’lere aynı görüntüyü verir.'}</p><a class="btn s" href="${win ? '/app.exe' : '/app.apk?name=' + nm}">${ic('download')}${win ? 'Windows uygulaması' : 'Android uygulaması (APK)'}</a></li>
      <li><span class="n">2</span><b>Uygulamayı açın</b><p>Ekranda giriş formu ve 6 haneli bir kod çıkar.</p></li>
      <li><span class="n">3</span><b>Kodu yazın</b><p>TV’deki QR’ı telefonla okutursanız kod kendiliğinden dolar. İsterseniz kutuda kullanıcı adı ve şifrenizle de giriş yapabilirsiniz.</p>
        <div class="row"><input type="text" id="pcode" class="code-in" inputmode="numeric" maxlength="7" placeholder="123 456" value="${pair}" ${full ? 'disabled' : ''}><button class="btn" onclick="pairTv()" ${full ? 'disabled' : ''}>Bağla</button></div></li>
    </ol></details>`;
}
function devMoreHtml() {
  const perf = card('Performans', 'Ekran takılıyorsa efektleri azaltın; video ağırlıklı takılmada Medya sekmesindeki kaliteyi 720p\'ye düşürün. TV kutusunda "Otomatik" zaten hafif modu seçer.',
    `<div class="f">${fl('Efekt modu', `<select onchange="opt('fxMode',this.value)">${[['auto', 'Otomatik (cihaza göre ayarlanır)'], ['lite', 'Hafif (her yerde)'], ['ultra', 'Çok hafif (zayıf cihazlar için)'], ['full', 'Tam (her yerde)']].map(([v, l]) => `<option value="${v}" ${(S.db.fxMode || 'auto') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}</div>`);
  const j = DEVST;
  return `<div class="grid g2" style="margin-top:18px">${j ? notifyCard(j) : card('Uyarılar', '', '<div class="muted">Yükleniyor…</div>')}${perf}</div>`;
}
function notifyCard(j) {
  const n = j.notify || {}, om = n.offlineMin || j.offlineMin;
  return card('Uyarılar', `Kutu ${omLbl(j.offlineMin)} boyunca bağlantı vermezse burada ve e-postanızda uyarı görürsünüz.`,
      `${owner() ? `<div class="row"><input type="email" id="nt-mail" placeholder="ornek@isletme.com" value="${esc(n.email || '')}" style="flex:1"><button class="btn" data-save onclick="saveNotify()">Kaydet</button>${n.email && j.mail ? '<button class="btn g" onclick="act(\'POST\',\'/notify/test\',undefined,\'Deneme e-postası gönderildi\',false)">Dene</button>' : ''}</div>
       <div class="row mt" style="align-items:center"><span style="flex:1">Kutunun uyarılmadan bağlantısız kalabileceği süre:</span><select id="nt-offmin" style="width:130px">${[5, 10, 15, 30, 60, 120, 360, 720, 1440].map(m => `<option value="${m}"${m === om ? ' selected' : ''}>${omLbl(m)}</option>`).join('')}</select></div>
       <div class="swr mt"><div class="b"><b>Ekran kapanınca</b></div>${sw(n.offline !== false, '', 'id="nt-off"')}</div><div class="swr"><div class="b"><b>Ekran geri açılınca</b></div>${sw(n.online !== false, '', 'id="nt-on"')}</div>
       <div class="swr"><div class="b"><b>Haftalık özet</b><span>Her pazartesi sabah: ekran süresi, kampanya okutmaları, reklam gösterimleri</span></div>${sw(!!n.weekly, '', 'id="nt-wk"')}</div>${n.email && j.mail ? `<div class="row end"><button class="btn xs g" onclick="act('POST','/notify/weekly-test',undefined,'Haftalık özet örneği gönderildi',false)">Özet örneğini şimdi gönder</button></div>` : ''}
       ${j.mail ? '' : '<p class="muted" style="font-size:12.5px">Sunucuda e-posta gönderimi henüz ayarlı değil; uyarılar şimdilik yalnız burada görünür.</p>'}` : ''}
       <div class="list mt">${(j.alerts || []).length ? j.alerts.slice(0, 12).map(a => `<div class="it"><span class="dot ${a.kind === 'online' ? 'on' : ''}"></span><div class="b"><b>${esc(a.text)}</b><span>${new Date(a.at).toLocaleString(I18N.locale, { dateStyle: 'short', timeStyle: 'short' })}</span></div></div>`).join('') + `<div class="row end"><button class="btn xs g" onclick="act('DELETE','/alerts',undefined,'Temizlendi',false).then(drawDevStatus)">Temizle</button></div>` : '<div class="muted">Uyarı yok.</div>'}</div>`);
}
// açık cihaz menüsü dışarı tıklanınca kapanır
document.addEventListener('click', e => { document.querySelectorAll('.dv-menu[open]').forEach(d => { if (!d.contains(e.target)) d.removeAttribute('open'); }); });
async function drawDevStatus() {
  let j; try { j = await req('GET', '/devices/status'); } catch (e) { return; }
  DEVST = j;
  const c = $('dvcards'); if (c) c.innerHTML = devCards();
  if (DRW) devDrawInfo();
  const m = $('dvmore'); if (m) m.innerHTML = devMoreHtml();
}
const saveNotify = () => act('PUT', '/notify', { email: $('nt-mail').value.trim(), offline: $('nt-off').checked, online: $('nt-on').checked, offlineMin: $('nt-offmin') ? +$('nt-offmin').value : undefined, weekly: $('nt-wk') ? $('nt-wk').checked : undefined }, 'Uyarı ayarları kaydedildi', false);
async function snapDev(id) {
  const box = $('snap-' + id); if (!box) return; box.innerHTML = '<p class="muted">Ekran görüntüsü isteniyor…</p>';
  try { await req('POST', `/devices/${id}/snapshot`); } catch (e) { box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
  const t0 = Date.now();
  const poll = async () => {
    try { const j = await req('GET', `/devices/${id}/snapshot`); if (j.at >= t0 - 1000) { box.innerHTML = `<img src="${j.data}" style="width:100%;border-radius:10px;margin-top:12px;background:#000"><p class="muted" style="font-size:12.5px">${new Date(j.at).toLocaleTimeString(I18N.locale)} · videolar bazı kutularda siyah görünebilir</p>`; return; } } catch (e) {}
    if (Date.now() - t0 < 12000) setTimeout(poll, 1500); else box.innerHTML = '<p class="muted">Görüntü gelmedi. Kutudaki uygulama güncel değilse (sürüm 2.1 öncesi) bu özellik çalışmaz.</p>';
  };
  setTimeout(poll, 1200);
}

// Takılma testi: kutu sayfanın parçalarını sırayla kapatıp kare hızını ölçer; hangi parça takılma yapıyor söyler
const PERF_WHY = {
  'medya geçişi yok': 'Medya geçişleri (video ve fotoğraf değişimi) takılmaya neden oluyor. Videoların kalitesini Medya sekmesinde 720p\'ye düşürün, çok büyük fotoğrafları küçültün.',
  'kayan bant durdu': 'Alttaki kayan bant takılmaya neden oluyor. Bilgi bandını kapatın ya da kısaltın.',
  'tüm animasyonlar durdu': 'Sayfadaki animasyonlar kutuyu zorluyor. Tasarım ve duyurularda efektleri azaltın.',
  'müzik oynatıcısı gizli': 'Müzik oynatıcısı (YouTube) kutuyu zorluyor. Bu kutuda müziği kapatın ya da radyo/Spotify kullanın.',
  'sağ panel gizli': 'Yandaki paneller (fiyat listesi, saat, hava vb.) takılmaya neden oluyor. Bu panelleri azaltın.',
};
async function perfDev(id) {
  const box = $('perf-' + id); if (!box) return;
  if (!await UI.ask('Test yaklaşık 1 dakika sürer. Bu sırada kutunun ekranında bazı parçalar kısa süreliğine kaybolup geri gelir. Başlatılsın mı?')) return;
  box.innerHTML = '<p class="muted">Test başlıyor…</p>';
  try { await req('POST', `/devices/${id}/perf`, { sec: 8 }); } catch (e) { box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
  const t0 = Date.now();
  const poll = async () => {
    if (!$('perf-' + id)) return;
    try { const j = await req('GET', `/devices/${id}/perf`); if (j.at >= t0 - 1000) return perfShow(id, j.result); } catch (e) { /* sonuç henüz yok */ }
    const sec = Math.round((Date.now() - t0) / 1000);
    if (sec < 150) { box.innerHTML = `<p class="muted">Ölçülüyor… ${sec} sn (yaklaşık 70 sn sürer)</p>`; setTimeout(poll, 3000); }
    else box.innerHTML = '<p class="muted">Sonuç gelmedi. Kutudaki uygulama eskiyse bu test çalışmaz; uygulamayı güncelleyin.</p>';
  };
  setTimeout(poll, 5000);
}
function perfShow(id, r) {
  const box = $('perf-' + id); if (!box) return;
  const st = (r && r.steps) || [], base = st.find(x => x.step === 'tam'), blank = st.find(x => x.step === 'boş sayfa');
  if (!base) { box.innerHTML = '<p class="muted">Sonuç okunamadı.</p>'; return; }
  let best = null;
  for (const x of st) if (x !== base && x !== blank && PERF_WHY[x.step] && (!best || x.fps - x.miss * 0.0 > best.fps)) best = x;
  const gain = best ? best.fps - base.fps : 0, missCut = best ? base.miss - best.miss : 0;
  let msg, ok = false;
  if (base.fps >= 55 && base.long <= 3) { msg = 'Sorun yok: kutu akıcı çalışıyor.'; ok = true; }
  else if (best && (gain >= 6 || missCut >= Math.max(5, base.miss * 0.4))) msg = PERF_WHY[best.step];
  else if (blank && blank.fps < 50) msg = 'Sayfa boşken bile akıcı değil: sebep içerik değil, kutunun kendisi (donanım ya da TV çözünürlüğü). Kutuda ekran çözünürlüğünü 1080p yapın; sürüyorsa kutu bu iş için zayıf.';
  else msg = 'Tek bir parça belirgin sebep değil: takılma birkaç şeyin toplamından. Efektleri azaltmak ve videoları 720p yapmak yardımcı olur.';
  const rows = st.map(x => `<tr class="${x === base ? 'b' : ''}"><td>${esc(x.step)}</td><td>${x.fps} fps</td><td>${x.long}</td></tr>`).join('');
  box.innerHTML = `<div class="dv-flag" style="${ok ? 'background:rgba(62,207,142,.12);color:#7fe3b4' : ''}">${ic(ok ? 'circle-check' : 'triangle-alert')}<span><b>Sonuç:</b> ${esc(msg)}</span></div>
    <details class="dv-more"><summary>Ölçüm ayrıntıları</summary><table class="dv-pt"><thead><tr><th>Adım</th><th>Hız</th><th>Büyük takılma</th></tr></thead><tbody>${rows}</tbody></table></details>`;
}

/* ================= İSTATİSTİK ================= */
let STDAYS = 30;
SECTIONS.stats = {
  html() {
    return head('İstatistik', 'Ekranınız ne kadar açık kaldı, hangi içerik kaç kez oynadı, QR kodlarınız kaç kez okutuldu.', `<div class="row" style="gap:10px;align-items:center"><div class="tabs" style="margin:0">${[7, 30, 90].map(d => `<button class="${STDAYS === d ? 'on' : ''}" onclick="STDAYS=${d};render(true)">${d} gün</button>`).join('')}</div><a class="btn xs g" href="/api/admin/stats.csv?days=${STDAYS}">Excel (CSV) indir</a></div>`)
      + '<div id="stv"><div class="loading">Yükleniyor…</div></div>';
  },
  async after() {
    let j; try { j = await req('GET', '/stats?days=' + STDAYS); } catch (e) { $('stv').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const hrs = m => (m / 60).toFixed(m < 600 ? 1 : 0).replace('.', ',');
    const nf = n => Number(n || 0).toLocaleString(I18N.locale);
    const T = I18N.t, dur = sec => sec >= 3600 ? hrs(sec / 60) + ' ' + T('sa') : Math.max(1, Math.round(sec / 60)) + ' ' + T('dk');
    // önceki dönemle karşılaştırma; goodUp=false ise artış kötüdür (kesinti)
    const dl = (cur, prev, goodUp = true) => { if (!prev) return ''; const p = Math.round((cur - prev) / prev * 100); if (!p) return ''; const good = (p > 0) === goodUp; return `<br><b class="dl ${good ? 'up' : 'dn'}">${p > 0 ? '▲' : '▼'} ${Math.abs(p)}%</b> <span>önceki döneme göre</span>`; };
    const max = Math.max(60, ...j.daily.map(d => d.online));
    const active = j.daily.filter(d => d.online > 0).length;
    const wd = i => new Date(2024, 0, 1 + i).toLocaleDateString(I18N.locale, { weekday: 'long' });
    const wds = i => new Date(2024, 0, 1 + i).toLocaleDateString(I18N.locale, { weekday: 'short' });
    const hh = h => String(h).padStart(2, '0') + ':00';
    // en yoğun gün-saat
    let pk = { v: 0, d: 0, h: 0 }; j.heat.forEach((row, d) => row.forEach((v, h) => { if (v > pk.v) pk = { v, d, h }; }));
    const hmax = Math.max(1, ...j.heat.flat());
    const stat = (b, label, extra = '') => `<div class="stat"><b>${b}</b><span>${label}</span>${extra ? `<span class="dlw">${extra}</span>` : ''}</div>`;
    const dvTxt = d => { const n = d.ios + d.android + d.other; if (!n) return ''; const p = v => Math.round(v / n * 100) + '%'; return [d.ios ? 'iPhone ' + p(d.ios) : '', d.android ? 'Android ' + p(d.android) : '', d.other ? T('Diğer') + ' ' + p(d.other) : ''].filter(Boolean).join(' · '); };
    const qrRow = q => {
      if (!q.tracked) return `<div class="it"><div class="b"><b>${esc(q.label)}</b><span>${q.kind === 'wifi' ? 'Wi-Fi QR\'ı sayılamaz (telefon doğrudan ağa bağlanır)' : 'Düz metin QR\'ı sayılamaz (yalnızca bağlantı QR\'ları sayılır)'}</span></div></div>`;
      const mx = Math.max(1, ...q.daily), ph = q.hours.indexOf(Math.max(...q.hours));
      return `<div class="it qst"><div class="b"><b>${esc(q.label)}${q.kind === 'camp' ? ' <span class="muted" style="font-weight:400">· Kampanya kartı</span>' : ''}</b>
          <span>${q.scans ? `${T('En yoğun saat')}: ${hh(ph)}${dvTxt(q.dev) ? ' · ' + dvTxt(q.dev) : ''}` : 'Bu dönemde okutulmadı'}</span></div>
        <div class="mini" role="img" aria-label="Günlük okutma">${q.daily.map((v, i) => `<div title="${fmtD(j.daily[i].day)}: ${v}"><i style="height:${Math.round(v / mx * 100)}%"></i></div>`).join('')}</div>
        <div class="big">${nf(q.scans)}</div></div>`;
    };
    $('stv').innerHTML = `<div class="grid g3" style="margin-bottom:18px">`
      + stat(hrs(j.totals.online) + ' ' + T('saat'), `Ekran açık kaldı (${active} gün)`, dl(j.totals.online, j.prev.online))
      + stat(nf(j.totals.plays), 'İçerik oynatıldı', dl(j.totals.plays, j.prev.plays))
      + stat(nf(j.totals.scans), 'QR okutuldu', dl(j.totals.scans, j.prev.scans))
      + stat(nf(j.totals.drops), j.totals.drops ? `Kesinti (toplam ${dur(j.totals.dropsec)})` : 'Kesinti', dl(j.totals.drops, j.prev.drops, false))
      + stat((active ? hrs(j.totals.online / active) : '0') + ' ' + T('saat'), 'Açık olduğu günlerde ortalama')
      + stat(pk.v ? `${wd(pk.d)} ${hh(pk.h)}` : '—', 'İçeriklerin en çok gösterildiği zaman')
      + `</div>`
      + impactCard(j, nf)
      + card('Günlük ekran süresi', 'Saat cinsinden; bağlı tüm kutuların toplamı.', `<div class="bars" role="img" aria-label="Günlük ekran süresi grafiği">${j.daily.map(d => `<div title="${new Date(d.day + 'T12:00').toLocaleDateString(I18N.locale, { day: 'numeric', month: 'long' })}: ${hrs(d.online)} saat, ${d.plays} oynatma"><i style="height:${Math.round(d.online / max * 100)}%"></i></div>`).join('')}</div>
        <div class="row" style="justify-content:space-between;font-size:12px" class="muted"><span class="muted">${fmtD(j.daily[0].day)}</span><span class="muted">${fmtD(j.daily[j.daily.length - 1].day)}</span></div>`)
      + card('QR okutmaları', 'Bağlantı QR\'ları ve kampanya QR\'ı kaç kez okutuldu. Aynı telefonun kısa sürede tekrar açması ve bot ziyaretleri sayılmaz; kişisel bilgi saklanmaz.', j.qr.length ? `<div class="list">${j.qr.map(qrRow).join('')}</div>` : '<div class="empty">Henüz QR kod yok. QR Kodlar sayfasından ekleyin.</div>')
      + card('Saat bazında yoğunluk', 'İçeriklerin gün ve saate göre gösterilme yoğunluğu (koyu renk daha yoğun).', pk.v ? `<div class="heat"><div></div>${Array.from({ length: 24 }, (_, h) => `<span class="hl">${h % 3 === 0 ? h : ''}</span>`).join('')}${j.heat.map((row, d) => `<span class="dn">${wds(d)}</span>${row.map((v, h) => `<i title="${wd(d)} ${hh(h)}: ${v}" style="background:rgba(var(--a2),${v ? (0.12 + v / hmax * 0.88).toFixed(2) : 0.04})"></i>`).join('')}`).join('')}</div>` : '<div class="empty">Henüz veri yok. Ekran açık kaldıkça burada görünür.</div>')
      + `<div class="grid g2">` + card('Kesintiler', 'Ekranın internet bağlantısı 2 dakikadan uzun koptuğunda sayılır.', j.totals.drops ? `<div class="scroll"><table class="tbl"><thead><tr><th>Gün</th><th>Kesinti</th><th>Toplam süre</th></tr></thead><tbody>${j.daily.filter(d => d.drops).reverse().slice(0, 14).map(d => `<tr><td>${fmtD(d.day)}</td><td>${d.drops}</td><td>${dur(d.dropsec)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Bu dönemde kesinti olmadı.</div>')
      + card('Özel kartlar', 'Ekranlarda kaç kez gösterildi.', `<div class="grid g3">${stat(nf(j.shown.camp), 'Kampanya kartı')}${stat(nf(j.shown.big), 'Büyük maç kartı')}${stat(nf(j.shown.goal), 'Gol bildirimi')}</div>`) + `</div>`
      + card('İçerikler', 'En çok oynayandan aza.', j.items.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>İçerik</th><th>Tür</th><th>Oynatma</th><th>Toplam süre</th><th>Son</th></tr></thead><tbody>${j.items.slice(0, 50).map(it => `<tr><td>${esc(it.name)}</td><td>${{ video: 'Video', image: 'Fotoğraf', poster: 'Afiş', instagram: 'Instagram', trailer: 'Fragman', gone: '—' }[it.type] || it.type}</td><td>${it.plays.toLocaleString(I18N.locale)}</td><td>${it.sec ? (it.sec >= 3600 ? hrs(it.sec / 60) + ' sa' : Math.round(it.sec / 60) + ' dk') : '—'}</td><td>${fmtD(it.last)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Henüz veri yok. Ekran açık kaldıkça burada görünür.</div>');
  },
};

// Kampanya etkisi: gösterim → QR okutma. Oran düşükse kartın metni/teklifi, yüksekse saati ve sıklığı yorumlanır.
function impactCard(j, nf) {
  const L = j.impact || [];
  const KIND = { camp: 'Kampanya kartı', poster: 'QR\'lı afiş', ad: 'Reklam' };
  const T = I18N.t, hh = h => String(h).padStart(2, '0') + ':00';
  const trend = x => { if (!x.prevScans) return x.scans ? '<span class="muted">yeni</span>' : ''; const p = Math.round((x.scans - x.prevScans) / x.prevScans * 100); return p ? `<b class="dl ${p > 0 ? 'up' : 'dn'}">${p > 0 ? '▲' : '▼'} ${Math.abs(p)}%</b>` : '<span class="muted">aynı</span>'; };
  const rates = L.filter(x => x.shown >= 20 && x.rate != null), avg = rates.length ? rates.reduce((a, x) => a + x.rate, 0) / rates.length : null;
  const verdict = x => {
    if (x.kind !== 'camp' && !x.tracked) return '<span class="muted">QR yok; yalnız gösterim sayılır</span>';
    if (x.shown < 20) return '<span class="muted">Yorum için daha fazla gösterim gerekiyor</span>';
    if (!x.scans) return '<span style="color:#e6a23c">Hiç okutulmadı: teklifi güçlendirin (ör. "ilk siparişe ikram") ya da QR\'ı büyütün</span>';
    if (avg && x.rate >= avg * 1.5) return `<span style="color:var(--ok,#3fb27f)">Çok iyi çalışıyor${x.peakHour >= 0 ? ` · en çok ${hh(x.peakHour)} civarı` : ''}</span>`;
    if (avg && x.rate <= avg * 0.5) return '<span style="color:#e6a23c">Ortalamanın altında: başlığı kısaltın, teklifi öne çıkarın</span>';
    return `<span class="muted">Ortalama${x.peakHour >= 0 ? ` · en çok ${hh(x.peakHour)} civarı` : ''}</span>`;
  };
  const body = L.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>İçerik</th><th>Tür</th><th>Gösterim</th><th>QR okutma</th><th>100 gösterimde</th><th>Önceki döneme göre</th><th>Yorum</th></tr></thead><tbody>${L.map(x => `<tr><td><b>${esc(x.name)}</b>${x.enabled === false ? ' <span class="muted">· kapalı</span>' : ''}</td><td>${KIND[x.kind] || ''}</td><td>${nf(x.shown)}</td><td>${x.kind === 'camp' || x.tracked ? nf(x.scans) : '—'}</td><td>${x.rate != null && (x.kind === 'camp' || x.tracked) ? String(x.rate).replace('.', ',') : '—'}</td><td>${x.kind === 'camp' || x.tracked ? trend(x) : ''}</td><td style="min-width:220px">${verdict(x)}</td></tr>`).join('')}</tbody></table></div>`
    + (avg != null ? `<p class="muted" style="font-size:12.5px;margin:10px 0 0">Ortalama: 100 gösterimde ${avg.toFixed(1).replace('.', ',')} okutma. Kampanya kartlarının gösterim sayımı bu sürümle başladı; eski günler için gösterim sıfır görünebilir.</p>` : '')
    : `<div class="empty">Henüz ölçülecek kampanya yok. <a href="#promo">Kampanya ve yorumlar</a> sayfasından kampanya kartını açın ya da <a href="#media/posters">Fotoğraftan afiş</a> ile QR'lı bir afiş hazırlayın; ekranda kaç kez göründüğü ve QR'ının kaç kez okutulduğu burada karşılaştırılır.</div>`;
  return card('Kampanya etkisi', 'Her kampanya ekranda kaç kez göründü ve müşteriler QR\'ını kaç kez okuttu. "100 gösterimde" sütunu kampanyaları birbiriyle karşılaştırmanın en adil yolu.', body);
}

/* ================= MÜZİK — YouTube Music düzeninde (YouTube, YouTube Music, Spotify, radyo; telefondan uzaktan kumanda) =================
 * Görünüm: üstte arama, altında bölüm çipleri (Ana sayfa · Keşfet · Kitaplık · Hesaplar · Kurulum), raflar ve kare kapaklı kartlar,
 * liste sayfası (büyük kapak + Oynat), en altta sabit çalar çubuğu. Spotify hesabı OAuth ile bağlanır (server/spotify.js). */
const MUSIC_PRESETS = [
  { title: 'Kafe & Lofi Chill Beats (7/24)', category: 'Kafe & Akustik', provider: 'ytm', url: 'https://music.youtube.com/watch?v=lTRiuFIWV54', desc: 'Kafeler ve çalışma alanları için kesintisiz sakin Lofi & enstrümantal ritimler.', thumb: 'https://i.ytimg.com/vi/lTRiuFIWV54/hqdefault.jpg' },
  { title: 'Restoran & Smooth Jazz / Bossa Nova', category: 'Restoran & Caz', provider: 'ytm', url: 'https://music.youtube.com/watch?v=Dx5qFachd3A', desc: 'Yemek ve sohbet ortamına uygun sıcak saksafon, piyano ve Bossa Nova.', thumb: 'https://i.ytimg.com/vi/Dx5qFachd3A/hqdefault.jpg' },
  { title: 'Lounge & Deep Chill Synth / House', category: 'Lounge & Bar', provider: 'ytm', url: 'https://music.youtube.com/watch?v=4xDzrJKXOOY', desc: 'Akşam saatleri, pub ve lounge mekânlar için modern atmosferik müzik.', thumb: 'https://i.ytimg.com/vi/4xDzrJKXOOY/hqdefault.jpg' },
  { title: 'Spotify Chill Hits · Kafe & Lounge', category: 'Kafe & Lounge', provider: 'spotify', url: 'https://open.spotify.com/playlist/37i9dQZF1DX4WYpdgoIcn6', desc: 'Spotify’ın en sevilen güncel sakin ve popüler mekan şarkıları listesi.' },
  { title: 'Spotify Türkçe Pop & Güncel Hitler', category: 'Türkçe Pop', provider: 'spotify', url: 'https://open.spotify.com/playlist/7uGniGmKxD4fmxGJWPqZAl', desc: 'Mekânlarda en çok dinlenen güncel Türkçe pop parçalar.' },
  { title: 'Spotify Coffee Table Jazz', category: 'Kafe & Caz', provider: 'spotify', url: 'https://open.spotify.com/playlist/37i9dQZF1DWVqfgj8NZEp1', desc: 'Kahve dükkanları ve pastaneler için yumuşak caz klasikleri.' },
  { title: 'Spor Salonu & Yüksek Enerji (Beast Mode)', category: 'Spor & Fitness', provider: 'spotify', url: 'https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP', desc: 'Spor salonları ve antrenman saatleri için yüksek tempolu motivasyon listesi.' },
  { title: 'Maç Öncesi & Sosyal Mekân Ritmi', category: 'Maç Günü', provider: 'ytm', url: 'https://music.youtube.com/watch?v=4xDzrJKXOOY', desc: 'Maç öncesi toplanma saatlerinde arka planda akıcı ritmik yayın.', thumb: 'https://i.ytimg.com/vi/4xDzrJKXOOY/hqdefault.jpg' },
];
function musicData() {
  if (!S.db.music || typeof S.db.music !== 'object') S.db.music = { enabled: false, playing: true, volume: 75, muteVideo: true, showNowPlaying: true, activeId: '', playlists: [], spotify: {} };
  if (!Array.isArray(S.db.music.playlists)) S.db.music.playlists = [];
  if (!S.db.music.spotify || typeof S.db.music.spotify !== 'object') S.db.music.spotify = {};
  return S.db.music;
}
const PROV = p => p === 'spotify' ? 'Spotify' : p === 'ytm' ? 'YouTube Music' : p === 'ytmix' ? 'Kendi listem' : p === 'yt' ? 'YouTube' : 'Canlı radyo';
const provIc = p => p === 'spotify' ? 'headphones' : p === 'radio' ? 'radio-tower' : p === 'ytmix' ? 'list-music' : 'music';
const kindName = it => it.provider === 'radio' ? 'Radyo' : it.provider === 'spotify' && it.spotifyType === 'track' || (it.provider === 'yt' || it.provider === 'ytm') && !it.listId && it.videoId ? 'Şarkı' : it.provider === 'spotify' && it.spotifyType === 'album' ? 'Albüm' : 'Çalma listesi';
const fmtDur = s => !s ? '' : (s >= 3600 ? Math.floor(s / 3600) + ':' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') : Math.floor(s / 60)) + ':' + String(s % 60).padStart(2, '0');
const fmtLong = s => !s ? '' : s >= 3600 ? `${Math.floor(s / 3600)} sa ${Math.floor(s % 3600 / 60)} dk` : `${Math.max(1, Math.round(s / 60))} dk`;
let MV = null;               // açık liste: { src: 'lib'|'yt'|'sp', id, provider, title, thumb, url, listId, spType, spId, count, tracks }
let MNOW = null, MNOW_T = 0; // o an çalan (TV'nin bildirdiği ya da Spotify'ın verdiği)
const TRK = new Map();       // YouTube listId -> { items, err, reconnect }
const SPTRK = new Map();     // 'tür:kimlik' -> { items, err, hidden }
let LF = 'all';              // kitaplık süzgeci
let MSRC = 'yt';             // arama kaynağı: yt | sp
const musicActive = () => { const m = musicData(); return m.playlists.find(x => x.id === m.activeId) || m.playlists[0] || null; };
// ---- Kaynak seçimi: işletme Müzik'e girince YouTube Music ya da Spotify'ı seçer; tüm sayfa seçilene döner ----
let MSRCV = null;
const isSp = x => x.provider === 'spotify';
// kaynak kullanılabilir: Spotify için hesap bağlı olmalı (hesapsız çalamaz); YouTube için hesap bağlı ya da kitaplıkta herkese açık liste var. Değilse bağlanana kadar pasif
const srcAvail = k => { if (k === 'spotify') return !!(SPACC.st && SPACC.st.connected); return !!(YTACC.st && YTACC.st.connected) || musicData().playlists.some(x => !isSp(x)); };
function srcView() {
  let v = MSRCV;
  if (!v) { try { v = localStorage.getItem('mus.src'); } catch (e) { /* kayıt yoksa varsayılan */ } }
  if (v !== 'yt' && v !== 'spotify') { const a = musicActive(); v = a && isSp(a) ? 'spotify' : 'yt'; }
  const ya = srcAvail('yt'), sa = srcAvail('spotify');
  if (v === 'spotify' && !sa && ya) v = 'yt';
  if (v === 'yt' && !ya && sa) v = 'spotify';
  return v;
}
const SPMODE = () => srcView() === 'spotify';
function setSrc(k) {
  if (!srcAvail(k) && (srcAvail('yt') || srcAvail('spotify'))) { goM('accounts'); return toast(k === 'spotify' ? 'Spotify pasif: önce hesabı bağlayın' : 'YouTube pasif: önce hesabı bağlayın', true); }
  MSRCV = k; try { localStorage.setItem('mus.src', k); } catch (e) { /* tarayıcı kaydı kapalıysa yalnız bu oturumda geçerli */ }
  MV = null; MSEARCH.q = ''; SPS = { q: '', r: null, busy: false, err: '' }; LF = 'all';
  if ((SUB.music || 'home') === 'explore' && k === 'spotify') SUB.music = 'home';
  render(true); spDevLoadIf();
}
// music.* sol menüsünden kaynak değişir: sayfa o kaynağa geçer, o kaynağın son listesi TV'de çalmaya başlar, diğer kaynak durur ve sıfırlanır
let MERR = '';
async function switchSrc(k) {
  MERR = '';
  if (!SPACC.st) await spAccLoad(); if (!YTACC.st) await ytAccLoad(); // durum henüz gelmediyse yanlış "bağlı değil" demesin
  if (!srcAvail(k)) {
    MERR = k === 'spotify' ? 'Spotify hesabı bağlı değil. Hesaplar bölümünden Spotify’ı bağlayın.' : 'YouTube hesabı bağlı değil ve kitaplıkta herkese açık liste yok. Hesaplar bölümünden bağlayın.';
    MV = null; go('music/accounts'); render(true); return;
  }
  const cur = srcView(); if (cur === k && !MV) { go('music/home'); return; }
  MSRCV = k; try { localStorage.setItem('mus.src', k); } catch (e) { /* kayıt kapalıysa yalnız bu oturumda */ }
  MV = null; MNOW = null; MSEARCH.q = ''; SPS = { q: '', r: null, busy: false, err: '' }; LF = 'all';
  if (SUB.music === 'explore' && k === 'spotify') SUB.music = 'home';
  go('music/home'); render(true);
  await musicCmd('source', { source: k }); // yanıt gelmezse (liste yok vb.) hata şeritte görünür
}
function merrHtml() {
  const n = MNOW, a = musicActive();
  const nerr = n && n.err && (n.provider === 'spotify') === SPMODE() && (!a || !n.itemId || n.itemId === a.id) ? n.err : '';
  const e = MERR || nerr || (SPMODE() ? SPACC.err : YTACC.err) || '';
  return e ? `<div class="ytm-merr" role="alert">${ic('triangle-alert')}<span>${esc(e)}</span><button type="button" aria-label="Kapat" onclick="MERR='';drawMerr()">${ic('x')}</button></div>` : '';
}
function drawMerr() { const b = $('merrbox'); if (b) b.innerHTML = merrHtml(); }
function spDevLoadIf() { if (SPMODE() && (SUB.music || '') === 'accounts' && SPACC.st && SPACC.st.connected && !SPACC.devs) spDevLoad(); }
function srcPicker() {
  if (window.__ONLY === 'music') return ''; // kaynak sol menüden seçilir
  const v = srcView(), none = !srcAvail('yt') && !srcAvail('spotify');
  const b = (k, name, icn) => { const av = none || srcAvail(k); return `<button type="button" class="${v === k ? 'on' : ''} ${av ? '' : 'off'}" ${av ? '' : 'title="Hesap bağlanana kadar pasif"'} onclick="setSrc('${k}')">${ic(icn)}<span>${name}</span>${av ? '' : `<small>Pasif</small>`}</button>`; };
  return `<div class="ytm-pick" role="group" aria-label="Müzik kaynağı">${b('yt', 'YouTube Music', 'music')}${b('spotify', 'Spotify', 'headphones')}</div>`;
}
const MSUB = { yt: 'accounts', add: 'accounts', presets: 'explore' }; // eski bağlantılar

SECTIONS.music = {
  after() {
    ytAccLoad(); spAccLoad(); musicNowLoad();
    clearInterval(MNOW_T); MNOW_T = setInterval(() => { if (TAB !== 'music') return clearInterval(MNOW_T); musicNowLoad(); }, 6000);
    if (MV && MV.listId && (MV.provider === 'yt' || MV.provider === 'ytm')) loadTracks(MV.listId);
    if (MV && MV.provider === 'spotify' && MV.spId) loadSpTracks(MV.spType, MV.spId);
    if ((SUB.music || 'home') === 'accounts' && SPACC.st && SPACC.st.connected && !SPACC.devs) spDevLoad();
  },
  html() {
    let sub = MSUB[SUB.music] || SUB.music;
    if (!['home', 'explore', 'lib', 'search', 'accounts', 'setup'].includes(sub)) sub = 'home';
    if (SPMODE() && sub === 'explore') sub = 'home'; // Keşfet YouTube hazır listeleridir; Spotify görünümünde yok
    const body = MV ? detailHtml() : { home: homeHtml, explore: exploreHtml, lib: libHtml, search: searchHtml, accounts: accountsHtml, setup: setupHtml }[sub]();
    return `<div class="ytm${SPMODE() ? ' sp' : ''}"><div id="merrbox">${merrHtml()}</div>${ytmTop(sub)}<div class="ytm-body">${body}</div></div><div id="mnowbox">${nowBar()}</div>`;
  },
};
const goM = k => { MV = null; go('music/' + k); };

// ---- Üst şerit: arama + bölüm çipleri ----
function ytmTop(sub) {
  const chips = SPMODE() ? [['home', 'house', 'Ana sayfa'], ['lib', 'library', 'Kitaplığın'], ['accounts', 'link', 'Hesaplar'], ['setup', 'book-open', 'Kurulum']]
    : [['home', 'house', 'Ana sayfa'], ['explore', 'compass', 'Keşfet'], ['lib', 'library', 'Kitaplık'], ['accounts', 'link', 'Hesaplar'], ['setup', 'book-open', 'Kurulum']];
  return `${srcPicker()}<div class="ytm-top">
      <form class="ytm-search" onsubmit="musicSearch();return false">${ic('search')}<input type="search" id="ms-q" placeholder="${SPMODE() ? 'Ne çalmak istersin?' : 'Şarkı, sanatçı ya da liste arayın'}" value="${esc(MSEARCH.q)}" autocomplete="off"></form>
      <button class="ytm-ib" type="button" title="Bağlantı ekle" onclick="goM('accounts');setTimeout(()=>{const e=$('m-url');if(e){e.scrollIntoView({block:'center'});e.focus();}},120)">${ic('plus')}</button>
    </div>
    <div class="ytm-chips">${chips.map(([k, i, l]) => `<button type="button" class="${!MV && sub === k ? 'on' : ''}" onclick="goM('${k}')">${ic(i)}${l}</button>`).join('')}</div>`;
}

// ---- Kart, raf, satır ----
function mcard(o) {
  return `<div class="ytm-card ${o.on ? 'on' : ''}">
    <div class="ytm-cov ${o.round ? 'round' : ''}"><button type="button" class="ytm-open" onclick="${o.open}" aria-label="${esc(o.title)}">${o.thumb ? `<img src="${esc(o.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<i>${ic(o.ic || 'music')}</i>`}</button>
      ${o.on && o.playing ? '<em class="meq"><b></b><b></b><b></b></em>' : ''}${o.play ? `<button type="button" class="ytm-cplay" title="TV'de çal" onclick="${o.play}">${ic(o.on && o.playing ? 'pause-f' : 'play-f')}</button>` : ''}</div>
    <button type="button" class="ytm-ct" onclick="${o.open}"><b>${esc(o.title)}</b><span>${o.sub || ''}</span></button></div>`;
}
const shelf = (title, cards, more = '', sub = '') => cards.length ? `<section class="ytm-shelf"><div class="ytm-sh"><div>${sub ? `<small>${sub}</small>` : ''}<h2>${title}</h2></div>${more}</div><div class="ytm-row">${cards.join('')}</div></section>` : '';
const moreBtn = (k, l = 'Tümü') => `<button type="button" class="ytm-more" onclick="goM('${k}')">${l}</button>`;
function libCard(it) {
  const m = musicData(), act = musicActive(), on = !!(act && act.id === it.id);
  return mcard({ thumb: it.thumb, ic: provIc(it.provider), title: it.title, sub: `${kindName(it)} • ${PROV(it.provider)}${isPriv(it.listId) ? ' • 🔒' : ''}`, open: `openList('lib','${it.id}')`, play: on && m.enabled && m.playing ? "musicCmd('pause')" : `musicSelect('${it.id}')`, on, playing: m.enabled && m.playing });
}
function trow(o) { // YouTube Music şarkı satırı: kapak (üstünde oynat), ad, sanatçı, süre, işlemler
  return `<div class="ytm-tr ${o.on ? 'on' : ''}" ${o.v ? `data-v="${esc(o.v)}"` : ''} ${o.uri ? `data-u="${esc(o.uri)}"` : ''}>
    <button type="button" class="ytm-tth" title="TV'de çal" onclick="${o.play}">${o.thumb ? `<img src="${esc(o.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<i></i>'}<span>${ic('play-f')}</span>${o.on ? '<em class="meq"><b></b><b></b><b></b></em>' : ''}</button>
    <button type="button" class="ytm-tb" onclick="${o.play}"><b>${esc(o.title)}</b><span class="m">${esc(o.artist || '')}</span></button>
    <span class="ytm-ta">${esc(o.artist || '')}</span><span class="ytm-td">${fmtDur(o.dur)}</span><span class="ytm-tx">${o.acts || ''}</span></div>`;
}

// ---- Alt çalar çubuğu ----
function nowBar() {
  const m = musicData(), act = musicActive();
  const n = MNOW && act && (!MNOW.itemId || MNOW.itemId === act.id) ? MNOW : null;
  const on = !!m.enabled, playing = on && (n && n.provider === 'spotify' && n.playing != null ? n.playing : m.playing), err = n && n.err;
  const title = n && n.title ? n.title : act ? act.title : 'Henüz liste seçilmedi';
  const sub = err ? err : !on ? 'Müzik kapalı' : n && n.artist ? `${n.artist}${act ? ' • ' + act.title : ''}` : act ? `${kindName(act)} • ${PROV(act.provider)}` : 'Kitaplığınızdan bir liste seçin';
  const thumb = (n && n.thumb) || (act && act.thumb) || '';
  const prog = n && n.dur ? Math.min(100, Math.round((n.progress || 0) / n.dur * 100)) : 0;
  return `<div class="ytm-bar ${err ? 'err' : ''} ${on ? '' : 'off'}">${prog ? `<i class="ytm-prog" style="width:${prog}%"></i>` : ''}
    <div class="ytm-bar-ctl">
      <button type="button" title="Önceki" onclick="musicCmd('prev')">${ic('skip-back-f')}</button>
      <button type="button" class="big" title="${playing ? 'Duraklat' : 'TV\'de oynat'}" onclick="musicCmd(${on ? "'toggle'" : "'play'"})">${ic(playing ? 'pause-f' : 'play-f')}</button>
      <button type="button" title="Sonraki" onclick="musicCmd('next')">${ic('skip-forward-f')}</button>
    </div>
    <button type="button" class="ytm-bar-np" onclick="${act ? `openList('lib','${act.id}')` : "goM('lib')"}">
      <span class="c">${thumb ? `<img src="${esc(thumb)}" alt="" referrerpolicy="no-referrer">` : ic('music')}</span>
      <span class="t"><b>${esc(title)}</b><span>${esc(sub)}</span></span></button>
    <div class="ytm-bar-r">
      <label class="ytm-vol" title="Ses">${ic('volume-2')}<input type="range" min="0" max="100" value="${m.volume ?? 75}" onchange="musicCmd('volume',{volume:+this.value})"></label>
      <span class="ytm-onoff" title="Müzik açık / kapalı">${sw(on, "musicOpt({enabled:this.checked,playing:true})")}</span>
    </div></div>`;
}
async function musicNowLoad() {
  try {
    const n = await req('GET', '/music/now'), k = JSON.stringify(n);
    if (k === JSON.stringify(MNOW)) return;
    MNOW = n && n.at ? n : null;
    const box = $('mnowbox'); if (box) box.innerHTML = nowBar(); drawMerr();
    document.querySelectorAll('.ytm-tr').forEach(r => r.classList.toggle('on', !!(MNOW && (MNOW.videoId && r.dataset.v === MNOW.videoId || MNOW.uri && r.dataset.u === MNOW.uri))));
  } catch (e) {}
}

// ---- Ana sayfa ----
function spHomeHtml() {
  const m = musicData(), act = musicActive(), h = new Date().getHours();
  const hi = h < 6 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar';
  const libSp = m.playlists.filter(x => x.provider === 'spotify');
  const tile = it => { const on = !!(act && act.id === it.id), pl = on && m.enabled && m.playing;
    return `<div class="sp-tile ${on ? 'on' : ''}"><button type="button" class="o" onclick="openList('lib','${it.id}')">${it.thumb ? `<img src="${esc(it.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<i>${ic('headphones')}</i>`}<b>${esc(it.title)}</b></button><button type="button" class="p" title="TV'de çal" onclick="${pl ? "musicCmd('pause')" : `musicSelect('${it.id}')`}">${ic(pl ? 'pause-f' : 'play-f')}</button></div>`; };
  const acct = SPACC.st && SPACC.st.connected ? (SPACC.items || []).slice(0, 12).map(p => mcard({ thumb: p.thumb, ic: 'headphones', title: p.title, sub: `Çalma listesi • ${p.count} şarkı`, open: `openList('sp','${esc(p.id)}')`, play: `spAdd('${esc(p.id)}',true)` })) : [];
  const empty = !libSp.length && !acct.length ? `<div class="ytm-empty">${ic('headphones')}<b>Spotify listen boş</b><span>Hesabını bağla; listelerin burada görünür.</span><div class="row"><button class="ytm-btn w" onclick="goM('accounts')">${ic('link')}Hesap bağla</button></div></div>` : '';
  return `<div class="sp-hi"><h1>${hi}</h1></div>` + spWarn() + (libSp.length ? `<div class="sp-tiles">${libSp.slice(0, 8).map(tile).join('')}</div>` : '') + empty
    + shelf('Kitaplığın', libSp.map(libCard), '', '')
    + shelf('Spotify listelerin', acct, moreBtn('accounts', 'Hesap'), SPACC.st && SPACC.st.name ? esc(SPACC.st.name) : '');
}
function homeHtml() {
  if (SPMODE()) return spHomeHtml();
  const m = musicData(), act = musicActive();
  const lib = m.playlists.filter(x => !isSp(x)).map(libCard);
  const yt = YTACC.st && YTACC.st.connected ? (YTACC.items || []).slice(0, 12).map(p => mcard({ thumb: p.thumb, title: p.title, sub: `Çalma listesi • ${p.count} şarkı`, open: `openList('yt','${esc(p.id)}')`, play: `ytAccAdd('${esc(p.id)}',true)` })) : [];
  const pre = MUSIC_PRESETS.map((p, i) => ({ p, i })).filter(o => o.p.provider !== 'spotify').map(({ p, i }) => mcard({ thumb: p.thumb, ic: provIc(p.provider), title: p.title, sub: `${esc(p.category)} • ${PROV(p.provider)}`, open: `addMusicPreset(${i},false)`, play: `addMusicPreset(${i},true)` }));
  const hero = act && !isSp(act) ? `<div class="ytm-hero"><div class="c">${act.thumb ? `<img src="${esc(act.thumb)}" alt="" referrerpolicy="no-referrer">` : ic(provIc(act.provider))}</div><div class="b"><small>${m.enabled && m.playing ? 'TV\'de çalıyor' : 'Son çalınan'}</small><h2>${esc(act.title)}</h2><span>${kindName(act)} • ${PROV(act.provider)}</span>
      <div class="row"><button class="ytm-btn w" onclick="${m.enabled && m.playing ? "musicCmd('pause')" : `musicSelect('${act.id}')`}">${ic(m.enabled && m.playing ? 'pause-f' : 'play-f')}${m.enabled && m.playing ? 'Duraklat' : 'Oynat'}</button><button class="ytm-btn" onclick="openList('lib','${act.id}')">${ic('list-music')}Şarkılar</button></div></div></div>` : '';
  const empty = !lib.length ? `<div class="ytm-empty">${ic('music')}<b>Kitaplığınız boş</b><span>Hesabınızı bağlayın, şarkı arayın ya da aşağıdaki hazır listelerden birini çalın.</span><div class="row"><button class="ytm-btn w" onclick="goM('accounts')">${ic('link')}Hesap bağla</button><button class="ytm-btn" onclick="goM('setup')">${ic('book-open')}Kurulum adımları</button></div></div>` : '';
  return hero + empty
    + shelf('Kitaplığınız', lib.slice(0, 14), lib.length > 14 ? moreBtn('lib') : '', 'Tekrar dinleyin')
    + shelf('YouTube listeleriniz', yt, moreBtn('accounts', 'Hesap'), YTACC.st && YTACC.st.name ? esc(YTACC.st.name) : '')
    + shelf('Mekânınız için hazır listeler', pre, moreBtn('explore', 'Keşfet'));
}

// ---- Keşfet: hazır listeler kategoriye göre ----
function exploreHtml() {
  const PRE = MUSIC_PRESETS.map((p, i) => ({ p, i })).filter(o => o.p.provider !== 'spotify');
  const cats = [...new Set(PRE.map(o => o.p.category))];
  return `<div class="ytm-moods">${cats.map(c => `<button type="button" onclick="document.getElementById('cat-${esc(c).replace(/[^a-z0-9]/gi, '')}').scrollIntoView({behavior:'smooth',block:'center'})">${esc(c)}</button>`).join('')}</div>`
    + `<div class="ytm-grid">${PRE.map(({ p, i }) => `<div class="ytm-pre" id="cat-${esc(p.category).replace(/[^a-z0-9]/gi, '')}">${mcard({ thumb: p.thumb, ic: provIc(p.provider), title: p.title, sub: `${esc(p.category)} • ${PROV(p.provider)}`, open: `addMusicPreset(${i},false)`, play: `addMusicPreset(${i},true)` })}<p>${esc(p.desc)}</p></div>`).join('')}</div>`;
}

// ---- Kitaplık ----
function libHtml() {
  const m = musicData();
  const F = { all: () => true, mine: x => x.provider === 'ytmix', yt: x => x.provider === 'yt' || x.provider === 'ytm', sp: x => x.provider === 'spotify', radio: x => x.provider === 'radio' };
  if (SPMODE()) { const l = m.playlists.filter(F.sp); return `<div class="ytm-sh"><div><h2>Kitaplığın</h2></div></div>` + (l.length ? `<div class="ytm-grid">${l.map(libCard).join('')}</div>` : `<div class="ytm-empty">${ic('headphones')}<b>Spotify listen boş</b><span>Hesabını bağla ya da arama yapıp liste ekle.</span><button class="ytm-btn w" onclick="goM('accounts')">${ic('link')}Hesap bağla</button></div>`); }
  const list = m.playlists.filter(x => !isSp(x)).filter(F[LF] || F.all);
  const chips = [['all', 'Tümü'], ['mine', 'Kendi listelerim'], ['yt', 'YouTube'], ['radio', 'Radyo']];
  return `<div class="ytm-sh"><div><h2>Kitaplık</h2></div></div><div class="ytm-filt">${chips.map(([k, l]) => `<button type="button" class="${LF === k ? 'on' : ''}" onclick="LF='${k}';render(true)">${l}</button>`).join('')}</div>`
    + (list.length ? `<div class="ytm-grid">${list.map(libCard).join('')}</div>`
      : `<div class="ytm-empty">${ic('library')}<b>${m.playlists.some(x => !isSp(x)) ? 'Bu süzgeçte liste yok' : 'Kitaplığınız boş'}</b><span>Arama yapın, hesabınızı bağlayın ya da Keşfet'ten hazır liste ekleyin.</span></div>`);
}
function openList(src, id) {
  if (src === 'lib') {
    const it = musicData().playlists.find(x => x.id === id); if (!it) return;
    MV = { src, id, provider: it.provider, title: it.title, thumb: it.thumb, url: it.url || '', listId: it.listId || '', videoId: it.videoId || '', spType: it.spotifyType || '', spId: it.spotifyId || '', tracks: it.provider === 'ytmix' ? (it.tracks || []) : null, count: it.provider === 'ytmix' ? (it.tracks || []).length : 0 };
  } else if (src === 'yt') {
    const p = (YTACC.items || []).find(x => x.id === id); if (!p) return;
    MV = { src, id, listId: p.id, title: p.title, thumb: p.thumb, provider: 'ytm', url: 'https://music.youtube.com/playlist?list=' + p.id, count: p.count };
  } else {
    const p = (SPACC.items || []).concat((SPS.r && SPS.r.playlists) || []).find(x => x.id === id); if (!p) return;
    MV = { src, id, provider: 'spotify', spType: 'playlist', spId: p.id, title: p.title, thumb: p.thumb, url: p.url, count: p.count, owner: p.owner };
  }
  render(); scrollTo(0, 0);
}
const isPriv = listId => !!listId && !!((YTACC.items || []).find(x => x.id === listId) || {}).priv; // gizli YouTube listesi (TV çalamaz)
const libByList = listId => musicData().playlists.find(x => x.listId && x.listId === listId);
const libBySp = id => musicData().playlists.find(x => x.provider === 'spotify' && x.spotifyId === id);

// ---- Liste sayfası (büyük kapak, Oynat, şarkılar) ----
function detailHtml() {
  const v = MV, m = musicData(), act = musicActive();
  const inLib = v.src === 'lib' ? m.playlists.find(x => x.id === v.id) : v.provider === 'spotify' ? libBySp(v.spId) : libByList(v.listId);
  const cur = inLib && act && act.id === inLib.id, playingNow = cur && m.enabled && m.playing;
  const playJs = inLib ? (playingNow ? "musicCmd('pause')" : `musicSelect('${inLib.id}')`) : v.provider === 'spotify' ? `spAdd('${esc(v.spId)}',true)` : `ytAccAdd('${esc(v.listId)}',true)`;
  const acts = `<button class="ytm-btn w" onclick="${playJs}">${ic(playingNow ? 'pause-f' : 'play-f')}${playingNow ? 'Duraklat' : 'Oynat'}</button>`
    + (!inLib ? `<button class="ytm-btn" onclick="${v.provider === 'spotify' ? `spAdd('${esc(v.spId)}',false)` : `ytAccAdd('${esc(v.listId)}',false)`}">${ic('plus')}Kitaplığa ekle</button>` : '')
    + (v.provider === 'ytmix' && inLib ? `<button class="ytm-ib" title="Düzenle" onclick="editCustom('${inLib.id}')">${ic('pencil')}</button>` : '')
    + ((v.url || (inLib && inLib.url)) ? `<a class="ytm-ib" title="Uygulamada aç" href="${esc(v.url || inLib.url)}" target="_blank" rel="noopener">${ic('external-link')}</a>` : '')
    + (v.src === 'lib' && inLib ? `<button class="ytm-ib" title="Kitaplıktan sil" onclick="delMusicPlaylist('${inLib.id}')">${ic('trash-2')}</button>` : '');
  let body;
  if (v.provider === 'ytmix' && Array.isArray(v.tracks)) {
    const sum = v.tracks.reduce((a, t) => a + (t.d || 0), 0);
    body = v.tracks.length ? v.tracks.map((t, i) => trow({ v: t.v, thumb: t.th, title: t.t, artist: t.c, dur: t.d, on: MNOW && MNOW.videoId === t.v, play: `playCustomTrack(${i})` })).join('') : '<div class="ytm-empty sm">Bu listede şarkı yok.</div>';
    setTimeout(() => { const el = $('mcount'); if (el) el.textContent = `${v.tracks.length} şarkı • ${fmtLong(sum)}`; }, 0);
  }
  else if (v.listId && (v.provider === 'yt' || v.provider === 'ytm')) body = '<div id="mtracks"><div class="ytm-empty sm">Şarkılar yükleniyor…</div></div>';
  else if (v.provider === 'spotify' && v.spId) body = '<div id="mtracks"><div class="ytm-empty sm">Şarkılar yükleniyor…</div></div>';
  else if (v.provider === 'radio') body = '<div class="ytm-empty sm">Canlı radyo yayını: tek bir akıştır, şarkı listesi yoktur.</div>';
  else body = '<div class="ytm-empty sm">Tek şarkı; liste değil.</div>';
  const privW = isPriv(v.listId) ? `<div class="ytm-warn">${ic('lock')}<span>Bu liste gizli: TV'deki oynatıcı sizin hesabınızla giriş yapmadığı için çalamaz. YouTube'da listeyi “Liste dışı” ya da “Herkese açık” yapın.</span></div>` : '';
  const spW = v.provider === 'spotify' ? spWarn() : '';
  const kind = inLib ? kindName(inLib) : 'Çalma listesi';
  return `<button type="button" class="ytm-back" onclick="MV=null;render()">${ic('chevron-left')}Geri</button>
    <div class="ytm-head"><div class="c">${v.thumb ? `<img src="${esc(v.thumb)}" alt="" referrerpolicy="no-referrer">` : ic(provIc(v.provider))}</div>
      <div class="b"><h1>${esc(v.title)}</h1><p class="meta">${kind} • ${PROV(v.provider)}${v.owner ? ' • ' + esc(v.owner) : ''}</p><p class="meta" id="mcount">${v.count ? `${v.count} şarkı` : ''}</p><div class="row">${acts}</div></div></div>
    ${privW}${spW}<div class="ytm-tracks">${body}</div>`;
}
function spWarn() { // Spotify listesinin TV'de çalabilmesi için eksik adım
  const st = SPACC.st || {};
  if (!st.connected) return `<div class="ytm-warn">${ic('info')}<span>Spotify listelerini TV'de çalmak için Spotify hesabınızı bağlayın.</span><button class="ytm-btn sm" onclick="goM('accounts')">Bağla</button></div>`;
  if (!st.target) return `<div class="ytm-warn">${ic('speaker')}<span>Müziğin hangi cihazda çalacağını seçin (TV kutusundaki Spotify uygulaması önerilir).</span><button class="ytm-btn sm" onclick="goM('accounts')">Cihaz seç</button></div>`;
  if (!st.premium) return `<div class="ytm-warn">${ic('triangle-alert')}<span>Spotify'ı panelden yönetmek için Spotify Premium gerekir.</span></div>`;
  return '';
}
async function loadTracks(listId) {
  const c = TRK.get(listId);
  if (!c) {
    try { TRK.set(listId, { items: (await req('GET', '/music/tracks?list=' + encodeURIComponent(listId))).items }); }
    catch (e) { TRK.set(listId, { err: e.message, reconnect: /bağla/i.test(e.message) }); }
  }
  drawTracks(listId);
}
function drawTracks(listId) {
  const box = $('mtracks'); if (!box || !MV || MV.listId !== listId) return;
  const c = TRK.get(listId) || {};
  if (c.err) { box.innerHTML = `<div class="ytm-empty sm">${esc(c.err)}${c.reconnect ? ` <a href="#music/accounts">Hesaplar</a>` : ''}</div>`; return; }
  const items = c.items || [];
  if ($('mcount')) $('mcount').textContent = `${items.length} şarkı • ${fmtLong(items.reduce((a, x) => a + x.dur, 0))}`;
  box.innerHTML = items.length ? items.map((t, i) => trow({ v: t.videoId, thumb: t.thumb, title: t.title, artist: t.channel, dur: t.dur, on: MNOW && MNOW.videoId === t.videoId, play: `playTrack(${i})` })).join('') : '<div class="ytm-empty sm">Bu listede şarkı yok.</div>';
}
async function playTrack(i) {
  const v = MV, t = ((TRK.get(v.listId) || {}).items || [])[i]; if (!t) return;
  let it = v.src === 'lib' ? musicData().playlists.find(x => x.id === v.id) : libByList(v.listId);
  if (!it) { // YouTube hesabından: önce kütüphaneye eklenir
    const j = await act('POST', '/music/playlist', { url: 'https://music.youtube.com/playlist?list=' + encodeURIComponent(v.listId), title: v.title, thumb: v.thumb, category: 'YouTube hesabım' }, '', false);
    if (!j || !j.item) return; S.db.music = j.music; it = j.item;
  }
  const j = await act('POST', '/music/cmd', { cmd: 'select', id: it.id, index: t.idx, videoId: t.videoId }, `TV'de çalıyor: ${t.title}`, false);
  if (j && j.music) { S.db.music = j.music; MNOW = { ...(MNOW || {}), itemId: it.id, title: t.title, artist: t.channel, thumb: `https://i.ytimg.com/vi/${t.videoId}/mqdefault.jpg`, videoId: t.videoId, err: '', at: Date.now() }; render(true); }
}
// Spotify listesinin şarkıları
async function loadSpTracks(type, id) {
  const k = (type || 'playlist') + ':' + id;
  if (!SPTRK.has(k)) {
    if (!(SPACC.st && SPACC.st.connected)) { SPTRK.set(k, { err: 'Şarkıları görmek için Spotify hesabınızı bağlayın.', reconnect: true }); }
    else {
      try { SPTRK.set(k, { items: (await req('GET', `/music/spotify/tracks?type=${encodeURIComponent(type || 'playlist')}&id=${encodeURIComponent(id)}`)).items }); }
      catch (e) { SPTRK.set(k, { err: e.message, reconnect: /bağla/i.test(e.message) }); }
    }
  }
  const box = $('mtracks'); if (!box || !MV || MV.spId !== id) return;
  const c = SPTRK.get(k) || {};
  if (c.err) { box.innerHTML = `<div class="ytm-empty sm">${esc(c.err)}${c.reconnect ? ` <a href="#music/accounts">Hesaplar</a>` : ''}</div>`; return; }
  const items = c.items || [];
  if ($('mcount')) $('mcount').textContent = `${items.length} şarkı • ${fmtLong(items.reduce((a, x) => a + x.dur, 0))}`;
  box.innerHTML = items.length ? items.map((t, i) => trow({ uri: t.uri, thumb: t.thumb, title: t.title, artist: t.artist, dur: t.dur, on: MNOW && MNOW.uri === t.uri, play: `playSpTrack(${i})` })).join('') : '<div class="ytm-empty sm">Bu listede şarkı yok.</div>';
}
async function playSpTrack(i) {
  const v = MV, t = ((SPTRK.get((v.spType || 'playlist') + ':' + v.spId) || {}).items || [])[i]; if (!t) return;
  let it = v.src === 'lib' ? musicData().playlists.find(x => x.id === v.id) : libBySp(v.spId);
  if (!it) { const j = await act('POST', '/music/playlist', { url: v.url || `https://open.spotify.com/playlist/${v.spId}`, title: v.title, thumb: v.thumb, category: 'Spotify hesabım' }, '', false); if (!j || !j.item) return; S.db.music = j.music; it = j.item; }
  const j = await act('POST', '/music/cmd', { cmd: 'select', id: it.id, uri: t.uri }, `TV'de çalıyor: ${t.title}`, false);
  if (j && j.warn) toast(j.warn, true);
  if (j && j.music) { S.db.music = j.music; MNOW = { ...(MNOW || {}), provider: 'spotify', itemId: it.id, title: t.title, artist: t.artist, thumb: t.thumb, uri: t.uri, err: '', at: Date.now() }; render(true); }
}

// ---- Arama: YouTube (kendi listemi kur) ve Spotify ----
let MSEARCH = { q: '', items: null, busy: false, err: '' }; // YouTube araması
let SPS = { q: '', r: null, busy: false, err: '' };          // Spotify araması
let MDRAFT = null; // kurulmakta olan liste: { id: düzenleme ise liste kimliği, title, tracks: [{v,t,c,th,d}] }
function searchHtml() {
  const spOn = SPACC.st && SPACC.st.connected;
  MSRC = SPMODE() ? 'sp' : 'yt';
  const src = true ? '' : `<div class="ytm-filt">${[['yt', 'YouTube'], ['sp', 'Spotify']].map(([k, l]) => `<button type="button" class="${MSRC === k ? 'on' : ''}" onclick="MSRC='${k}';musicSearch()">${l}</button>`).join('')}</div>`;
  let out = `<div class="ytm-sh"><div><small>Arama sonuçları</small><h2>“${esc(MSEARCH.q || SPS.q)}”</h2></div></div>` + src;
  if (MSRC === 'sp') {
    if (!spOn) return out + `<div class="ytm-empty">${ic('headphones')}<b>Spotify hesabı bağlı değil</b><span>Spotify'da arama yapmak için önce hesabınızı bağlayın.</span><button class="ytm-btn w" onclick="goM('accounts')">${ic('link')}Hesaplar</button></div>`;
    const r = SPS; out += spWarn();
    if (r.busy) return out + '<div class="ytm-empty sm">Aranıyor…</div>';
    if (r.err) return out + `<div class="ytm-empty sm">${esc(r.err)}</div>`;
    if (!r.r) return out;
    const tr = r.r.tracks || [], pl = r.r.playlists || [];
    return out + (tr.length ? `<section class="ytm-shelf"><div class="ytm-sh"><div><h2>Şarkılar</h2></div></div><div class="ytm-tracks">${tr.map((t, i) => trow({ uri: t.uri, thumb: t.thumb, title: t.title, artist: t.artist, dur: t.dur, on: MNOW && MNOW.uri === t.uri, play: `spPlayHit(${i})`, acts: `<button class="ytm-ib sm" title="Kitaplığa ekle" onclick="spAddHit(${i})">${ic('plus')}</button>` })).join('')}</div></section>` : '')
      + shelf('Listeler', pl.map(p => mcard({ thumb: p.thumb, ic: 'headphones', title: p.title, sub: `Çalma listesi • ${esc(p.owner || 'Spotify')}`, open: `openList('sp','${esc(p.id)}')`, play: `spAdd('${esc(p.id)}',true)` })))
      + (!tr.length && !pl.length ? '<div class="ytm-empty sm">Sonuç bulunamadı.</div>' : '');
  }
  const r = MSEARCH, d = MDRAFT;
  const res = r.busy ? '<div class="ytm-empty sm">Aranıyor…</div>'
    : r.err ? `<div class="ytm-empty sm">${esc(r.err)}</div>`
    : !r.items ? '<div class="ytm-empty sm">Yukarıdaki arama kutusuna şarkı ya da sanatçı adı yazın.</div>'
    : r.items.length ? r.items.map((t, i) => trow({ v: t.videoId, thumb: t.thumb, title: t.title, artist: t.channel, dur: t.dur, on: MNOW && MNOW.videoId === t.videoId, play: `playNowVideo(${i})`, acts: `<button class="ytm-ib sm" title="Listeme ekle" onclick="draftAdd(${i})">${ic('plus')}</button>` })).join('')
    : '<div class="ytm-empty sm">Sonuç bulunamadı.</div>';
  out += `<section class="ytm-shelf"><div class="ytm-sh"><div><h2>Şarkılar</h2></div><span class="ytm-hint">${ic('plus')} ile kendi listenizi kurun</span></div><div class="ytm-tracks">${res}</div></section>`;
  if (d) {
    out += `<section class="ytm-draft"><div class="ytm-sh"><div><small>${d.id ? 'Listemi düzenle' : 'Yeni listem'}</small><h2>${d.tracks.length} şarkı</h2></div></div>
      <input type="text" id="md-title" class="ytm-in" placeholder="Liste başlığı (örn. Akşam Listem)" value="${esc(d.title)}" maxlength="90">
      <div class="ytm-tracks">${d.tracks.length ? d.tracks.map((t, i) => trow({ v: t.v, thumb: t.th, title: t.t, artist: t.c, dur: t.d, play: '', acts: `<button class="ytm-ib sm" title="Yukarı taşı" onclick="draftMove(${i},-1)">${ic('chevron-up')}</button><button class="ytm-ib sm" title="Aşağı taşı" onclick="draftMove(${i},1)">${ic('chevron-down')}</button><button class="ytm-ib sm" title="Listeden çıkar" onclick="draftDel(${i})">${ic('x')}</button>` })).join('') : '<div class="ytm-empty sm">Arama sonuçlarından + ile şarkı ekleyin.</div>'}</div>
      <div class="row end"><button class="ytm-btn" onclick="draftClear()">Temizle</button><button class="ytm-btn" data-save onclick="draftSave(false)">Kaydet</button><button class="ytm-btn w" onclick="draftSave(true)">${ic('play-f')}Kaydet ve TV'de çal</button></div></section>`;
  }
  return out;
}
async function musicSearch() {
  const inp = $('ms-q'), q = ((inp && inp.value) || MSEARCH.q || SPS.q || '').trim();
  if (q.length < 2) { toast('En az 2 harf yazın', true); return; }
  MV = null;
  MSRC = SPMODE() ? 'sp' : 'yt';
  if (MSRC === 'sp' && !(SPACC.st && SPACC.st.connected)) { toast('Önce Spotify hesabınızı bağlayın', true); return goM('accounts'); }
  if (MSRC === 'sp') {
    SPS = { q, r: null, busy: true, err: '' }; MSEARCH.q = q;
    if ((SUB.music || '') !== 'search') go('music/search'); else render(true);
    try { SPS = { q, r: await req('GET', '/music/spotify/search?q=' + encodeURIComponent(q)), busy: false, err: '' }; }
    catch (e) { SPS = { q, r: null, busy: false, err: e.message }; }
  } else {
    MSEARCH = { q, items: null, busy: true, err: '' }; SPS.q = q;
    if ((SUB.music || '') !== 'search') go('music/search'); else render(true);
    try { MSEARCH = { q, items: (await req('GET', '/music/search?q=' + encodeURIComponent(q))).items, busy: false, err: '' }; }
    catch (e) { MSEARCH = { q, items: null, busy: false, err: e.message }; }
  }
  if (TAB === 'music') render(true);
}
function draftAdd(i) {
  const t = (MSEARCH.items || [])[i]; if (!t) return;
  if (!MDRAFT) MDRAFT = { id: '', title: MSEARCH.q.slice(0, 60), tracks: [] };
  if (MDRAFT.tracks.some(x => x.v === t.videoId)) return toast('Bu şarkı listede zaten var');
  MDRAFT.tracks.push({ v: t.videoId, t: t.title, c: t.channel, th: t.thumb, d: t.dur });
  render(true);
}
function draftMove(i, dir) {
  const a = MDRAFT && MDRAFT.tracks, j = i + dir;
  if (!a || j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]]; render(true);
}
function draftDel(i) { if (MDRAFT) { MDRAFT.tracks.splice(i, 1); render(true); } }
function draftClear() { MDRAFT = null; render(true); }
async function draftSave(playNow) {
  if (!MDRAFT || !MDRAFT.tracks.length) return toast('Listeye en az bir şarkı ekleyin', true);
  const body = { title: ($('md-title').value || '').trim(), tracks: MDRAFT.tracks, playNow };
  const j = MDRAFT.id ? await act('PUT', '/music/custom/' + MDRAFT.id, body, '', false) : await act('POST', '/music/custom', body, '', false);
  if (j && j.music) { S.db.music = j.music; MDRAFT = null; toast(playNow ? 'Liste kaydedildi ve TV\'de başlatıldı' : 'Listeniz kaydedildi'); goM('lib'); }
}
async function playNowVideo(i) { // arama sonucunu tek şarkı olarak TV'de çal
  const t = (MSEARCH.items || [])[i]; if (!t) return;
  const j = await act('POST', '/music/playlist', { url: 'https://music.youtube.com/watch?v=' + t.videoId, title: t.title, thumb: t.thumb, playNow: true }, '', false);
  if (j && j.music) { S.db.music = j.music; MNOW = { ...(MNOW || {}), title: t.title, artist: t.channel, thumb: t.thumb, videoId: t.videoId, err: '', at: Date.now() }; render(true); }
}
function editCustom(id) {
  const it = musicData().playlists.find(x => x.id === id);
  if (!it || it.provider !== 'ytmix') return;
  MDRAFT = { id: it.id, title: it.title, tracks: (it.tracks || []).map(t => ({ ...t })) };
  MSRC = 'yt'; goM('search'); scrollTo(0, 0);
}
async function playCustomTrack(i) {
  const it = musicData().playlists.find(x => x.id === MV.id); if (!it) return;
  const t = (it.tracks || [])[i]; if (!t) return;
  const j = await act('POST', '/music/cmd', { cmd: 'select', id: it.id, index: i, videoId: t.v }, `TV'de çalıyor: ${t.t}`, false);
  if (j && j.music) { S.db.music = j.music; MNOW = { ...(MNOW || {}), itemId: it.id, title: t.t, artist: t.c, thumb: t.th, videoId: t.v, err: '', at: Date.now() }; render(true); }
}
async function spPlayHit(i) { // Spotify arama sonucu: tek şarkı olarak TV'de çal
  const t = ((SPS.r || {}).tracks || [])[i]; if (!t) return;
  const id = t.uri.split(':')[2];
  const j = await act('POST', '/music/playlist', { url: 'https://open.spotify.com/track/' + id, title: t.title, thumb: t.thumb, playNow: true }, `TV'de çalıyor: ${t.title}`, false);
  if (j && j.warn) toast(j.warn, true);
  if (j && j.music) { S.db.music = j.music; render(true); }
}
async function spAddHit(i) {
  const t = ((SPS.r || {}).tracks || [])[i]; if (!t) return;
  if (libBySp(t.uri.split(':')[2])) return toast('Bu şarkı kitaplığınızda zaten var');
  const j = await act('POST', '/music/playlist', { url: 'https://open.spotify.com/track/' + t.uri.split(':')[2], title: t.title, thumb: t.thumb, category: 'Spotify' }, 'Kitaplığa eklendi', false);
  if (j && j.music) { S.db.music = j.music; }
}

// ---- Hesaplar: YouTube, Spotify, ayarlar, bağlantı ekle ----
let YTACC = { st: null, items: null, err: '' };
let SPACC = { st: null, items: null, err: '', devs: null, devErr: '' };
let YTBUSY = false; // aynı anda tek yükleme; hata olunca sayfa her çizimde yeniden istek atıp döngüye girmesin
async function ytAccLoad(force) {
  if (YTBUSY) return;
  YTBUSY = true;
  try {
    if (!YTACC.st || force) YTACC.st = await req('GET', '/music/google');
    if (YTACC.st.connected && (force || (!YTACC.items && !YTACC.err))) {
      try { YTACC.items = (await req('GET', '/music/google/playlists' + (force ? '?force=1' : ''))).items || []; YTACC.err = ''; }
      catch (e) { YTACC.items = null; YTACC.err = e.message || 'Listeler alınamadı'; YTACC.st = await req('GET', '/music/google'); }
      if (TAB === 'music') { YTBUSY = false; render(true); }
    }
  } catch (e) { YTACC.err = e.message || 'Hata'; }
  YTBUSY = false;
}
async function spAccLoad(force) {
  try {
    const was = JSON.stringify(SPACC.st);
    if (!SPACC.st || force) SPACC.st = await req('GET', '/music/spotify');
    let changed = was !== JSON.stringify(SPACC.st);
    if (SPACC.st.connected && (force || (!SPACC.items && !SPACC.err))) {
      try { SPACC.items = (await req('GET', '/music/spotify/playlists' + (force ? '?force=1' : ''))).items || []; SPACC.err = ''; }
      catch (e) { SPACC.items = []; SPACC.err = e.message; }
      changed = true;
    }
    if (changed && TAB === 'music') render(true);
  } catch (e) { SPACC.err = e.message; }
}
async function spDevLoad() {
  SPACC.devErr = '';
  try { SPACC.devs = (await req('GET', '/music/spotify/devices')).items; } catch (e) { SPACC.devs = []; SPACC.devErr = e.message; }
  if (TAB === 'music' && (SUB.music || '') === 'accounts') render(true);
}
async function spSetDevice(id, name) {
  const j = await act('PUT', '/music/spotify/device', { id, name }, 'Çalınacak cihaz kaydedildi', false);
  if (j && j.music) { S.db.music = j.music; SPACC.st = j.status; render(true); }
}
async function spOff() {
  if (!await UI.ask('Spotify hesabının bağlantısı kesilsin mi? Kitaplığınızdaki listeler kalır.')) return;
  const j = await act('DELETE', '/music/spotify', undefined, 'Spotify bağlantısı kesildi', false);
  if (j) { if (j.music) S.db.music = j.music; SPACC = { st: null, items: null, err: '', devs: null, devErr: '' }; SPTRK.clear(); spAccLoad(true); }
}
async function spAdd(id, playNow) {
  const p = (SPACC.items || []).concat((SPS.r && SPS.r.playlists) || []).find(x => x.id === id) || (MV && MV.spId === id ? MV : null); if (!p) return;
  const ex = libBySp(id);
  if (ex) { if (playNow) return musicSelect(ex.id); return toast('Bu liste kitaplığınızda zaten var'); }
  const j = await act('POST', '/music/playlist', { url: p.url || `https://open.spotify.com/playlist/${id}`, title: p.title, thumb: p.thumb, category: 'Spotify hesabım', playNow }, playNow ? 'Liste eklendi ve TV\'de başlatıldı' : 'Kitaplığa eklendi', false);
  if (j && j.warn) toast(j.warn, true);
  if (j && j.music) { S.db.music = j.music; render(true); }
}
// ---- İşletmenin kendi Google / Spotify uygulaması: yönetimden bağımsız hesap bağlama ----
const APPSTEPS = {
  google: [
    ['Google Cloud\'da yeni bir proje oluşturun (adı: ScreenPano).', 'https://console.cloud.google.com/projectcreate', 'Proje oluştur'],
    ['Bu projede “YouTube Data API v3” hizmetini etkinleştirin (Enable).', 'https://console.cloud.google.com/apis/library/youtube.googleapis.com', 'API sayfasını aç'],
    ['Google Auth Platform\'u kurun: uygulama adı ScreenPano, destek e-postanız, Audience: External. Data Access bölümünde “youtube.readonly” iznini ekleyin.', 'https://console.cloud.google.com/auth/overview', 'Auth Platform\'u aç'],
    ['Clients › Create client: Application type “Web application”. Authorized redirect URIs bölümüne aşağıdaki adresi ekleyip Create\'e basın.', 'https://console.cloud.google.com/auth/clients', 'Clients sayfasını aç'],
    ['Audience sayfasında “Publish app” düğmesine basın (durum “In production” olsun; bağlantı 7 günde bir düşmesin). Google “doğrulanmamış uygulama” uyarısı gösterirse Gelişmiş › “git” ile devam edin.', 'https://console.cloud.google.com/auth/audience', 'Audience sayfasını aç'],
    ['Çıkan Client ID ve Client Secret\'ı aşağıdaki kutulara yapıştırıp Kaydet\'e basın.'],
  ],
  spotify: [
    ['Spotify hesabınızla Developer Dashboard\'a girin ve “Create app” düğmesine basın.', 'https://developer.spotify.com/dashboard', 'Dashboard\'ı aç'],
    ['App name: ScreenPano. Açıklama: istediğiniz bir cümle. Redirect URI: aşağıdaki adresi yapıştırıp “Add” deyin. “Which API/SDKs” bölümünde Web API ve Web Playback SDK\'yı işaretleyin, şartları kabul edip Save\'e basın.'],
    ['Açılan uygulamada Settings\'e girin: Client ID\'yi kopyalayın; “View client secret” ile Client Secret\'ı da kopyalayın.'],
    ['İkisini aşağıdaki kutulara yapıştırıp Kaydet\'e basın.'],
  ],
};
function appBox(k, st, open) {
  if (!owner()) return '<p class="ytm-muted">Hesap bağlamayı yalnız işletme sahibi yapabilir.</p>';
  const uri = location.origin + '/api/oauth/' + k + '/callback', G = k === 'google';
  return `<details class="ytm-app" ${open ? 'open' : ''}><summary>${ic('settings')}${G ? 'Kendi Google uygulamamla bağlan' : 'Kendi Spotify uygulamamla bağlan'}</summary>
    <p class="ytm-muted">Bu kurulum yalnız bir kez yapılır; ScreenPano yöneticisinden izin ya da onay gerekmez. Uygulama sizin hesabınızda oluşur, anahtarlar yalnız bu işletmede saklanır.</p>
    <ol class="ytm-gd">${APPSTEPS[k].map(([t, u, l]) => `<li><span>${t}</span>${u ? `<a class="ytm-btn sm" href="${u}" target="_blank" rel="noopener">${l} ↗</a>` : ''}</li>`).join('')}</ol>
    <div class="ytm-copy"><code>${esc(uri)}</code><button type="button" class="ytm-btn sm" data-t="${esc(uri)}" onclick="navigator.clipboard&&navigator.clipboard.writeText(this.dataset.t).then(()=>{this.textContent='Kopyalandı'})">Kopyala</button></div>
    <div class="ytm-add"><input type="text" id="app-${k}-id" class="ytm-in" autocomplete="off" placeholder="Client ID"><input type="password" id="app-${k}-sec" class="ytm-in" autocomplete="off" placeholder="Client Secret"></div>
    <div class="row"><button class="ytm-btn w" onclick="appSave('${k}')">${ic('link')}Kaydet ve hesabı bağla</button></div></details>`;
}
const appOwn = (k, st) => owner() ? `<p class="ytm-muted" style="margin-top:12px">${ic('settings')}Kendi uygulamanız kullanılıyor <code>${esc(String(st.appId || '').slice(0, 14))}…</code> <button class="ytm-more" onclick="appDel('${k}')">Kaldır</button></p>` : '';
async function appSave(k) {
  const id = ($('app-' + k + '-id').value || '').trim(), secret = ($('app-' + k + '-sec').value || '').trim();
  if (!id || !secret) return toast('Client ID ve Client Secret\'ı yapıştırın', true);
  if (await act('PUT', '/music/app/' + k, { id, secret }, '', false)) location.href = '/api/admin/music/' + k + '/connect';
}
async function appDel(k) {
  if (!await UI.ask('Kendi uygulama anahtarınız kaldırılsın mı? Bağlı hesap da kesilir.', { ok: 'Kaldır', danger: true })) return;
  if (await act('DELETE', '/music/app/' + k, undefined, 'Kaldırıldı', false)) { if (k === 'google') { YTACC = { st: null, items: null, err: '' }; ytAccLoad(true); } else { SPACC = { st: null, items: null, devs: null, err: '' }; spAccLoad(true); } render(true); }
}
function accountsHtml() {
  const m = musicData(), yst = YTACC.st || {}, sst = SPACC.st || {};
  const own = owner();
  const ytBody = !yst.configured ? appBox('google', yst, true)
    : yst.expired ? `<p class="ytm-muted">Bağlantının süresi doldu. Listelerinizi görmek için yeniden bağlanın.</p>${own ? `<a class="ytm-btn w" href="/api/admin/music/google/connect">${ic('refresh-cw')}Yeniden bağlan</a>` : ''}`
    : !yst.connected ? `<p class="ytm-muted">YouTube ve YouTube Music'te oluşturduğunuz listeler kitaplığınızda görünür. Yalnız okuma izni istenir.</p>${own ? `<a class="ytm-btn w" href="/api/admin/music/google/connect">${ic('link')}YouTube ile bağlan</a>` : '<p class="ytm-muted">Hesap bağlamayı yalnız işletme sahibi yapabilir.</p>'}${yst.own ? appOwn('google', yst) : appBox('google', yst, false)}`
    : `<p class="ytm-ok">${ic('circle-check')}Bağlı: <b>${esc(yst.name || 'YouTube')}</b> • ${(YTACC.items || []).length} liste</p>${YTACC.err ? `<p class="ytm-muted">${esc(YTACC.err)}</p>` : ''}<div class="row"><button class="ytm-btn" onclick="ytAccLoad(true)">${ic('refresh-cw')}Listeleri yenile</button>${own ? `<button class="ytm-btn" onclick="ytAccOff()">Bağlantıyı kes</button>` : ''}</div>${yst.own ? appOwn('google', yst) : ''}`;
  let spBody;
  if (!sst.configured) spBody = appBox('spotify', sst, true);
  else if (sst.expired) spBody = `<p class="ytm-muted">Bağlantının süresi doldu; yeniden bağlanın.</p>${own ? `<a class="ytm-btn w" href="/api/admin/music/spotify/connect">${ic('refresh-cw')}Yeniden bağlan</a>` : ''}`;
  else if (!sst.connected) spBody = `<p class="ytm-muted">Spotify listeleriniz kitaplığınızda görünür; panelden ya da telefondan TV'deki müziği yönetirsiniz. Uzaktan kumanda için <b>Spotify Premium</b> gerekir.</p>${own ? `<a class="ytm-btn w" href="/api/admin/music/spotify/connect">${ic('link')}Spotify ile bağlan</a>` : '<p class="ytm-muted">Hesap bağlamayı yalnız işletme sahibi yapabilir.</p>'}${sst.own ? appOwn('spotify', sst) : appBox('spotify', sst, false)}`;
  else {
    const devs = SPACC.devs, tgt = sst.target;
    const opt = (id, name, sub, icn, on) => `<button type="button" class="ytm-dev ${on ? 'on' : ''}" onclick="spSetDevice('${esc(id)}','${esc(name).replace(/'/g, '')}')"><span class="i">${ic(icn)}</span><span class="t"><b>${esc(name)}</b><span>${sub}</span></span>${on ? ic('circle-check') : ''}</button>`;
    const devList = devs == null ? '<p class="ytm-muted">Cihazlar yükleniyor…</p>'
      : (devs.map(d => opt(d.id, d.name, `${d.type === 'TV' ? 'TV' : d.type === 'Smartphone' ? 'Telefon' : d.type === 'Computer' ? 'Bilgisayar' : d.type || 'Cihaz'}${d.active ? ' • şu an çalıyor' : ''}`, d.type === 'Smartphone' ? 'smartphone' : d.type === 'Computer' ? 'monitor' : 'tv', tgt === d.id || !devs.some(x => x.id === tgt) && sst.targetName === d.name)).join('')
        + opt('screenpano', 'ScreenPano oynatıcısı', 'Deneme: Spotify uygulaması kurulamayan ekranlar için (her kutuda çalışmayabilir)', 'monitor', tgt === 'screenpano'))
        + (SPACC.devErr ? `<p class="ytm-muted">${esc(SPACC.devErr)}</p>` : '')
        + (devs && !devs.length ? '<p class="ytm-muted">Spotify cihazı görünmüyor: TV kutusunda Spotify uygulamasını açıp aynı hesapla giriş yapın, sonra Yenile\'ye basın.</p>' : '');
    spBody = `<p class="ytm-ok">${ic('circle-check')}Bağlı: <b>${esc(sst.name || 'Spotify')}</b> • ${sst.product ? (sst.premium ? 'Premium' : 'Ücretsiz') + ' • ' : ''}${(SPACC.items || []).length} liste</p>
      ${tgt === 'screenpano' ? `<div class="ytm-warn">${ic('triangle-alert')}<span>“ScreenPano oynatıcısı” çoğu TV kutusunda çalışmaz. Kutuya Spotify uygulamasını kurup yukarıdaki listeden onu seçin.</span></div>` : ''}
      ${!sst.premium ? `<div class="ytm-warn">${ic('triangle-alert')}<span>Hesap Premium değil: listeleriniz görünür ama Spotify, panelden çalma/duraklatma kumandasına yalnız Premium hesaplarda izin verir.</span></div>` : ''}
      <div class="ytm-sh sm"><div><h3>Çalınacak cihaz</h3></div><button class="ytm-more" onclick="SPACC.devs=null;render(true);spDevLoad()">${ic('refresh-cw')}Yenile</button></div>
      <div class="ytm-devs">${devList}</div>
      ${SPACC.err ? `<p class="ytm-muted">${esc(SPACC.err)}</p>` : ''}
      <div class="row"><button class="ytm-btn" onclick="spAccLoad(true)">${ic('refresh-cw')}Listeleri yenile</button>${own ? `<button class="ytm-btn" onclick="spOff()">Bağlantıyı kes</button>` : ''}</div>${sst.own ? appOwn('spotify', sst) : ''}`;
  }
  const acc = (name, cls, body, help) => `<section class="ytm-acc ${cls}"><div class="h"><span class="lg">${ic(cls === 'sp' ? 'headphones' : 'music')}</span><h2>${name}</h2><button class="ytm-more" onclick="goM('setup')">${ic('book-open')}${help}</button></div>${body}</section>`;
  return `<div class="ytm-sh"><div><h2>Hesaplar</h2></div></div><p class="ytm-muted" style="margin:-6px 0 14px">${ic('lock')}Bağladığınız hesap yalnız bu işletmeye aittir; başka işletmeler hesabınızı ve listelerinizi göremez.</p><div class="ytm-accs">`
    + (!SPMODE() || !srcAvail('yt') ? acc('YouTube ve YouTube Music', 'yt', ytBody, 'Kurulum') : '')
    + (SPMODE() || !srcAvail('spotify') ? acc('Spotify', 'sp', spBody, 'Kurulum') : '')
    + `</div><section class="ytm-acc"><div class="h"><span class="lg">${ic('link')}</span><h2>Bağlantı ekle</h2></div>
        <p class="ytm-muted">Spotify, YouTube Music ya da YouTube bağlantısı veya radyo yayın adresi yapıştırın; ad ve kapak otomatik gelir.</p>
        <div class="ytm-add"><input type="url" id="m-url" class="ytm-in" placeholder="https://open.spotify.com/playlist/… ya da https://music.youtube.com/…"><input type="text" id="m-title" class="ytm-in" maxlength="90" placeholder="Başlık (isteğe bağlı)"></div>
        <div class="row"><button class="ytm-btn" onclick="addMusicPlaylist(false)">${ic('plus')}Kitaplığa ekle</button><button class="ytm-btn w" onclick="addMusicPlaylist(true)">${ic('play-f')}Ekle ve TV'de çal</button></div></section>
      <section class="ytm-acc"><div class="h"><span class="lg">${ic('settings')}</span><h2>Ekran ayarları</h2></div>
        <div class="swr"><div class="b"><b>Ses düzeyi</b><span>TV'deki müziğin sesi</span></div><input type="range" min="0" max="100" value="${m.volume ?? 75}" style="width:160px;accent-color:#fff" onchange="musicCmd('volume',{volume:+this.value})"></div>
        <div class="swr"><div class="b"><b>"Şu an çalıyor" çubuğu</b><span>TV ekranının köşesinde çalan şarkıyı gösterir</span></div>${sw(m.showNowPlaying !== false, "musicOpt({showNowPlaying:this.checked})")}</div>
        <div class="swr"><div class="b"><b>Videoların sesini kapat</b><span>Müzik çalarken medyadaki videolar sessiz oynar</span></div>${sw(m.muteVideo !== false, "musicOpt({muteVideo:this.checked})")}</div></section>`;
}
async function ytAccOff() {
  if (!await UI.ask('YouTube hesabının bağlantısı kesilsin mi? Eklediğiniz listeler kalır.')) return;
  if (await act('DELETE', '/music/google', undefined, 'YouTube bağlantısı kesildi', false)) { YTACC = { st: null, items: null, err: '' }; TRK.clear(); ytAccLoad(true); }
}
async function ytAccAdd(id, playNow) {
  const p = (YTACC.items || []).find(x => x.id === id) || (MV && MV.listId === id ? MV : null); if (!p) return;
  const ex = libByList(id);
  if (ex) { if (playNow) return musicSelect(ex.id); return toast('Bu liste kitaplığınızda zaten var'); }
  const j = await act('POST', '/music/playlist', { url: 'https://music.youtube.com/playlist?list=' + encodeURIComponent(id), title: p.title, thumb: p.thumb, category: 'YouTube hesabım', playNow }, playNow ? 'Liste eklendi ve TV\'de başlatıldı' : 'Kitaplığa eklendi', false);
  if (j && j.music) { S.db.music = j.music; render(true); }
}
// Google ve Spotify'dan dönüşte sonucu bildir ve adres çubuğunu temizle
(function oauthReturn() {
  const q = new URLSearchParams(location.search);
  for (const [k, name] of [['yt', 'YouTube'], ['sp', 'Spotify']]) {
    const c = q.get(k); if (!c) continue;
    history.replaceState(null, '', (window.__ONLY ? '/music' : '/panel') + '#music/accounts');
    setTimeout(() => {
      if (c === 'ok') toast(`${name} hesabı bağlandı`);
      else if (c === 'denied') toast(`${name} izni verilmedi`, true);
      else if (c === 'expired') toast('Giriş oturumunun süresi doldu; yeniden deneyin', true);
      else if (c === 'nocfg') toast(`${name} bağlantısı henüz açılmadı`, true);
      else toast(`${name} hesabı bağlanamadı` + (q.get(k + 'm') ? ': ' + q.get(k + 'm') : ''), true);
    }, 600);
  }
})();

// ---- Kurulum: resimli adımlar (YouTube Music ve Spotify) ----
// Küçük çizimler: telefon/panel, giriş, liste, TV, TV kutusu, hoparlör, Premium rozeti. Renkler: --sv servis rengi
function ill(k) {
  const S0 = '<svg viewBox="0 0 160 100" aria-hidden="true">', E = '</svg>';
  const tv = (x, y, w, h, inner = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#151718" stroke="#3a3f41" stroke-width="2"/>${inner}<rect x="${x + w / 2 - 14}" y="${y + h + 2}" width="28" height="4" rx="2" fill="#3a3f41"/>`;
  const phone = (x, y, inner = '') => `<rect x="${x}" y="${y}" width="40" height="72" rx="7" fill="#151718" stroke="#3a3f41" stroke-width="2"/>${inner}`;
  const D = {
    login: S0 + phone(60, 14, `<rect x="66" y="26" width="28" height="5" rx="2" fill="#5b6163"/><rect x="66" y="36" width="28" height="7" rx="3" fill="#2a2e30"/><rect x="66" y="47" width="28" height="7" rx="3" fill="#2a2e30"/><rect x="66" y="60" width="28" height="9" rx="4.5" fill="var(--sv)"/>`) + `<path d="M112 50h22m-6-6 6 6-6 6" stroke="var(--sv)" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="30" cy="50" r="13" fill="none" stroke="#5b6163" stroke-width="2.5"/><path d="M24 50l4 4 8-8" stroke="var(--sv)" stroke-width="3" fill="none" stroke-linecap="round"/>` + E,
    list: S0 + [0, 1, 2].map(i => `<rect x="${20 + i * 42}" y="18" width="36" height="36" rx="5" fill="${i === 1 ? 'var(--sv)' : '#2a2e30'}"/><rect x="${20 + i * 42}" y="60" width="32" height="5" rx="2" fill="#5b6163"/><rect x="${20 + i * 42}" y="70" width="22" height="4" rx="2" fill="#3a3f41"/>`).join('') + `<circle cx="80" cy="36" r="9" fill="#fff"/><path d="M77 31.5v9l7.5-4.5z" fill="#111"/>` + E,
    play: S0 + tv(26, 10, 108, 66, `<rect x="32" y="16" width="64" height="54" rx="3" fill="#202426"/><rect x="100" y="16" width="28" height="24" rx="3" fill="#202426"/><rect x="100" y="44" width="28" height="26" rx="3" fill="#202426"/><circle cx="64" cy="43" r="11" fill="var(--sv)"/><path d="M60 37.5v11l9-5.5z" fill="#fff"/><g fill="var(--sv)"><rect x="104" y="58" width="3" height="8" rx="1"/><rect x="109" y="53" width="3" height="13" rx="1"/><rect x="114" y="56" width="3" height="10" rx="1"/></g>`) + E,
    remote: S0 + phone(22, 14, `<rect x="28" y="24" width="28" height="22" rx="3" fill="var(--sv)" opacity=".85"/><rect x="28" y="50" width="28" height="4" rx="2" fill="#5b6163"/><circle cx="34" cy="64" r="3" fill="#5b6163"/><circle cx="42" cy="64" r="4.5" fill="#fff"/><circle cx="50" cy="64" r="3" fill="#5b6163"/>`) + `<path d="M70 38c8-8 8-16 0-24M78 44c14-14 14-30 0-44" stroke="#5b6163" stroke-width="2.5" fill="none" stroke-linecap="round" transform="translate(0 20)"/>` + tv(96, 26, 50, 34, '<circle cx="121" cy="43" r="7" fill="var(--sv)"/>') + E,
    box: S0 + `<rect x="14" y="56" width="52" height="16" rx="5" fill="#202426" stroke="#3a3f41" stroke-width="2"/><circle cx="58" cy="64" r="2" fill="#3ecf74"/><path d="M66 64h14" stroke="#3a3f41" stroke-width="3"/>` + tv(82, 14, 66, 46, `<rect x="90" y="22" width="16" height="16" rx="4" fill="#2a2e30"/><rect x="110" y="22" width="16" height="16" rx="4" fill="var(--sv)"/><rect x="130" y="22" width="12" height="16" rx="4" fill="#2a2e30"/><rect x="90" y="42" width="52" height="10" rx="3" fill="#202426"/><path d="M114 30h8" stroke="#111" stroke-width="2.5" stroke-linecap="round"/>`) + `<path d="M28 44v-18h24v18" stroke="#5b6163" stroke-width="2.5" fill="none" stroke-linejoin="round"/><path d="M34 30l6 6 6-6" stroke="var(--sv)" stroke-width="3" fill="none" stroke-linecap="round"/>` + E,
    device: S0 + phone(18, 14, `<rect x="24" y="24" width="28" height="4" rx="2" fill="#5b6163"/><rect x="24" y="34" width="28" height="10" rx="3" fill="#2a2e30"/><rect x="24" y="48" width="28" height="10" rx="3" fill="var(--sv)"/><rect x="24" y="62" width="28" height="10" rx="3" fill="#2a2e30"/>`) + `<path d="M66 53h18m-6-6 6 6-6 6" stroke="var(--sv)" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` + tv(94, 22, 54, 38, `<rect x="112" y="30" width="18" height="22" rx="3" fill="none" stroke="var(--sv)" stroke-width="2.5"/><circle cx="121" cy="44" r="4" fill="var(--sv)"/>`) + E,
    premium: S0 + `<rect x="34" y="22" width="92" height="56" rx="10" fill="#202426" stroke="#3a3f41" stroke-width="2"/><path d="M58 60l6-20 10 12 6-16 6 16 10-12 6 20z" fill="var(--sv)"/><rect x="58" y="62" width="44" height="5" rx="2.5" fill="var(--sv)"/>` + E,
    panel: S0 + `<rect x="18" y="14" width="124" height="70" rx="6" fill="#151718" stroke="#3a3f41" stroke-width="2"/><rect x="18" y="14" width="30" height="70" rx="6" fill="#202426"/><rect x="24" y="24" width="18" height="4" rx="2" fill="#5b6163"/><rect x="24" y="34" width="18" height="4" rx="2" fill="var(--sv)"/><rect x="24" y="44" width="18" height="4" rx="2" fill="#5b6163"/><rect x="56" y="22" width="78" height="9" rx="4.5" fill="#2a2e30"/>${[0, 1, 2].map(i => `<rect x="${56 + i * 27}" y="38" width="22" height="22" rx="3" fill="${i ? '#2a2e30' : 'var(--sv)'}"/>`).join('')}<rect x="56" y="68" width="78" height="10" rx="3" fill="#202426"/>` + E,
  };
  return D[k] || '';
}
function setupHtml() {
  const flow = (cls, title, sub, steps) => `<section class="ytm-flow ${cls}"><div class="ytm-sh"><div><small>${sub}</small><h2>${title}</h2></div></div>
    <ol class="ytm-steps">${steps.map(([k, h, p, lk], i) => `<li><div class="ill">${ill(k)}</div><span class="n">${i + 1}</span><b>${h}</b><p>${p}</p>${lk ? `<a class="ytm-btn sm" href="${lk[0]}"${lk[0][0] === '#' ? '' : ' target="_blank" rel="noopener"'}>${lk[1]}</a>` : ''}</li>`).join('')}</ol></section>`;
  return `<div class="ytm-sh"><div><small>Adım adım</small><h2>Müzik kurulumu</h2></div></div>`
    + (!SPMODE() || !srcAvail('yt') ? flow('yt', 'YouTube Music', 'Ücretsiz • 4 adım', [
      ['login', 'Hesabı bağlayın', 'Hesaplar sayfasında “YouTube ile bağlan”a basın. Google hesabınızı seçin ve “İzin ver”e tıklayın; yalnız okuma izni istenir.', ['#music/accounts', 'Hesaplar sayfasına git']],
      ['list', 'Listenizi seçin', 'Listeleriniz Kitaplık’ta görünür. Listeniz yoksa YouTube Music’te oluşturun; “Özel” listeler görünmez, “Liste dışı” ya da “Herkese açık” yapın.', ['https://music.youtube.com/library/playlists', 'YouTube Music listelerim']],
      ['play', 'TV’de çalın', 'Listeyi açıp “Oynat”a basın. Müzik birkaç saniye içinde TV kutusunda başlar.'],
      ['remote', 'Telefondan yönetin', 'Alttaki çalar çubuğundan duraklatın, şarkı değiştirin, sesi ayarlayın.'],
    ]) : '')
    + (SPMODE() || !srcAvail('spotify') ? flow('sp', 'Spotify', 'Spotify Premium • 5 adım', [
      ['premium', 'Premium hesap', 'Panelden çalma ve kumanda için Spotify Premium gerekir. Ücretsiz hesapta listeler görünür ama kumanda edilemez.', ['https://www.spotify.com/premium/', 'Premium sayfasını aç']],
      ['box', 'Spotify’ı TV kutusuna kurun', 'Kutunun Google Play mağazasından Spotify’ı kurun ve aynı hesapla bir kez giriş yapın.', ['https://play.google.com/store/apps/details?id=com.spotify.tv.android', 'Play Store sayfası']],
      ['login', 'Hesabı bağlayın', 'Hesaplar sayfasında “Spotify ile bağlan”a basın. Spotify hesabınızla giriş yapıp “Kabul ediyorum”a tıklayın.', ['#music/accounts', 'Hesaplar sayfasına git']],
      ['device', 'Cihazı seçin', '“Çalınacak cihaz” listesinden TV kutusunu seçin. Görünmüyorsa kutuda Spotify’ı açıp Yenile’ye basın.'],
      ['play', 'Listeden çalın', 'Spotify listenizi açıp “Oynat”a basın. Çalan şarkı TV’de ve panelde görünür.'],
    ]) : '')
    + `<p class="ytm-muted" style="margin-top:6px">${ic('info')} Ses TV kutusundan gelir: TV’nin ya da ses sisteminin sesi açık olmalı. Spotify ve YouTube hesap kuralları kişisel kullanım içindir; mekânda ticari yayın için ilgili lisansları kontrol edin.</p>`;
}

// ---- Komutlar ----
async function musicCmd(cmd, extra = {}) {
  const j = await act('POST', '/music/cmd', { cmd, ...extra }, '', false);
  if (!j) MERR = LASTERR; else if (j.warn) { MERR = j.warn; toast(j.warn, true); } else if (cmd !== 'volume') MERR = '';
  drawMerr();
  if (j && j.music) { S.db.music = j.music; if (TAB === 'music') { const box = $('mnowbox'); if (box) box.innerHTML = nowBar(); if (cmd === 'source' || cmd === 'select' || (!MV && ['home', 'lib', 'explore'].includes(MSUB[SUB.music] || SUB.music || 'home'))) render(true); else if (MV) render(true); } setTimeout(musicNowLoad, 1500); }
}
async function musicOpt(patch) {
  const j = await act('PUT', '/music', patch, 'Müzik ayarları güncellendi', false);
  if (j && j.music) { S.db.music = j.music; render(true); }
}
async function musicSelect(id) {
  const j = await act('POST', '/music/cmd', { cmd: 'select', id }, 'TV ekranında çalmaya başladı', false);
  if (!j) MERR = LASTERR; else if (j.warn) { MERR = j.warn; toast(j.warn, true); } else MERR = '';
  drawMerr();
  if (j && j.music) { S.db.music = j.music; MNOW = null; render(true); setTimeout(musicNowLoad, 1500); }
}
async function addMusicPlaylist(playNow) {
  const url = ($('m-url').value || '').trim(), title = ($('m-title').value || '').trim();
  if (!url) return toast('Lütfen bir Spotify veya YouTube Music bağlantısı yapıştırın', true);
  const j = await act('POST', '/music/playlist', { url, title, playNow }, playNow ? 'Liste eklendi ve TV\'de başlatıldı' : 'Çalma listesi eklendi', false);
  if (j && j.warn) toast(j.warn, true);
  if (j && j.music) { S.db.music = j.music; goM('lib'); }
}
async function addMusicPreset(idx, playNow) {
  const p = MUSIC_PRESETS[idx]; if (!p) return;
  const existing = musicData().playlists.find(x => x.url === p.url);
  if (existing) { if (playNow) return musicSelect(existing.id); MV = null; return openList('lib', existing.id); }
  const j = await act('POST', '/music/playlist', { url: p.url, title: p.title, thumb: p.thumb || '', category: p.category, playNow }, playNow ? `${p.title} TV'de başlatıldı` : 'Hazır liste kütüphanenize eklendi', false);
  if (j && j.warn) toast(j.warn, true);
  if (j && j.music) { S.db.music = j.music; if (!playNow && j.item) return openList('lib', j.item.id); render(true); }
}
async function delMusicPlaylist(id) {
  if (!await UI.ask('Bu liste kütüphaneden silinsin mi?', { ok: 'Sil', danger: true })) return;
  const j = await act('DELETE', '/music/playlist/' + id, undefined, 'Liste silindi', false);
  if (j && j.music) { S.db.music = j.music; MV = null; render(true); }
}

/* ================= ŞUBELER ================= */
const PARTS_TR = [['layout', 'Ekran düzeni'], ['theme', 'Renkler ve logo'], ['media', 'Medya ve afişler'], ['menu', 'Fiyat listesi'], ['promo', 'Kampanya ve QR kodlar'], ['lang', 'Dil ayarları']];
function branchesHtml() {
  return card('Şubeleriniz', 'Her şubenin kendi ekranı, cihazları ve içeriği olur; hepsine bu hesapla girersiniz. Şubeye geçince panel o şubeyi yönetir.', '<div id="brlist" class="list"><div class="muted">Yükleniyor…</div></div>')
    + `<div id="brmore"></div>`;
}
async function drawBranches() {
  let j; try { j = await req('GET', '/branches'); } catch (e) { return; } S.br = j;
  $('brlist').innerHTML = j.list.map(b => `<div class="it"><span class="dot ${b.online ? 'on' : ''}"></span><div class="b"><b>${esc(b.name)}${b.id === j.current ? ' <span style="color:var(--accent2);font-weight:600"> · şu an burada</span>' : ''}${b.home ? ' <span class="muted" style="font-weight:400">· ana hesap</span>' : ''}</b><span>${b.online}/${b.devices} cihaz bağlı · ${b.media} içerik · ${b.access.ok ? (b.access.kind === 'trial' ? 'deneme · ' : '') + fmtDate(b.access.until) + ' tarihine kadar' : 'süresi dolmuş'}</span></div>
      ${b.id !== j.current ? `<button class="btn xs" onclick="switchBranch('${b.id}')">Bu şubeye geç</button>` : ''}${owner() ? `<button class="btn xs g" data-nm="${esc(b.name)}" onclick="renBranch('${b.id}', this.dataset.nm)">Adlandır</button>` : ''}</div>`).join('');
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
async function addBranch() { const name = $('br-n').value.trim(); if (name.length < 2) return toast('Şube adını yazın', true); try { const j = await req('POST', '/branches', { name }); toast('Şube açıldı'); if (await UI.ask('Yeni şubeye şimdi geçilsin mi?')) return switchBranch(j.id); drawBranches(); drawBranchSwitch(); } catch (e) { toast(e.message, true); } }
const renBranch = (id, cur) => { const n = prompt('Şube adı:', cur); if (n && n.trim()) act('PUT', '/branches/' + id, { name: n.trim() }, 'Kaydedildi', false).then(() => { drawBranches(); drawBranchSwitch(); }); };
async function copyBranches() {
  const targets = [...document.querySelectorAll('#cp-t .chip.on')].map(x => x.dataset.id), parts = [...document.querySelectorAll('#cp-p .chip.on')].map(x => x.dataset.k);
  if (!targets.length || !parts.length) return toast('Şube ve kopyalanacak içerik seçin', true);
  if (!await UI.ask(`${targets.length} şubeye kopyalansın mı? Seçilen bölümler hedefte bununla değişir.`)) return;
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
  if (!await UI.ask('30 gün sonra tüm veriler kalıcı olarak silinecek. Devam edilsin mi?', { danger: true })) return;
  if (await act('POST', '/privacy/delete', { password: pw }, 'Silme talebi alındı', false)) { S.db = await req('GET', '/db'); render(true); drawBanner(); }
}

/* ================= açılış ================= */
function drawBrand() {
  // D2: işletmenin tema rengi panel arayüzünü boyamaz (yalnız TV, önizleme ve afiş küçük resimleri themeVars() ile alır)
  const t = S.me.tenant, th = t.theme || {};
  $('brand').innerHTML = t.logo ? `<img src="${esc(t.logo)}" alt="${esc(t.name)}"${th.plate ? ' style="background:#fff;padding:6px 10px;border-radius:8px"' : ''}>` : `<b>${esc(t.name)}</b>`; document.title = t.name + ' · ' + S.me.brand;
  const an = $('acctn'); if (an) an.textContent = (S.me.user && (S.me.user.name || S.me.user.username)) || 'Hesap';
}
(async function boot() {
  try { [S.me, S.db, S.cat, S.scr, S.lg] = await Promise.all([req('GET', '/me'), req('GET', '/db'), req('GET', '/catalog'), req('GET', '/screen'), req('GET', '/leagues')]); }
  catch (e) { $('view').innerHTML = `<div class="empty">Panel yüklenemedi: ${esc(e.message)}</div>`; return; }
  drawBrand(); drawBanner(); route(); drawBranchSwitch();
  setInterval(async () => { if (document.hidden) return; try { S.scr = await req('GET', '/screen'); } catch (e) {} }, 30000);
})();
addEventListener('beforeunload', e => { if (EDIT.dirty || (MENU && MENU.__dirty) || document.querySelector('#view .card.dirty')) { e.preventDefault(); e.returnValue = ''; } });
/* A2: ortak kayıt çubuğu. Kaydedilmemiş değişiklik olunca altta çıkar; "Kaydet" ilgili bölümü kaydeder, "Vazgeç" son kaydı geri getirir. */
function savebar() {
  const b = $('savebar'); if (!b) return;
  let n = 0, save = null, cancel = () => render(true);
  if (TAB === 'design' && EDIT.dirty) { n = 1; save = saveL; cancel = () => { EDIT.dirty = false; EDIT.layout = null; render(true); }; }
  else if (TAB === 'menu' && MENU && MENU.__dirty) { n = 1; save = saveMenu; cancel = () => { MENU.__dirty = 0; MENU = null; render(true); }; }
  else { const d = [...document.querySelectorAll('#view .card.dirty')]; n = d.length; save = () => { d.forEach(c => { const x = c.querySelector('[data-save]'); c.classList.remove('dirty'); if (x) x.click(); }); }; }
  const was = b.classList.contains('on'); b.classList.toggle('on', n > 0); document.body.classList.toggle('sbon', n > 0);
  if (!n) return;
  const msg = n > 1 ? `${n} bölümde kaydedilmemiş değişiklik var` : 'Kaydedilmemiş değişiklikler var';
  if (!was || b.dataset.n != n) { b.querySelector('span').textContent = msg; b.dataset.n = n; }
  b._save = save; b._cancel = cancel;
}
setInterval(savebar, 600);
document.addEventListener('input', e => { const c = e.target.closest && e.target.closest('#view .card'); if (c && c.querySelector('[data-save]') && !e.target.closest('.ch')) { c.classList.add('dirty'); savebar(); } }, true);
document.addEventListener('change', e => { const c = e.target.closest && e.target.closest('#view .card'); if (c && c.querySelector('[data-save]') && !e.target.closest('.ch') && /^(SELECT|INPUT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'file') { c.classList.add('dirty'); savebar(); } }, true);
document.addEventListener('click', e => { const x = e.target.closest && e.target.closest('[data-save]'); if (x) { const c = x.closest('.card'); if (c) c.classList.remove('dirty'); setTimeout(savebar, 50); } }, true);
// A7: anahtar değişince kart etiketi anında güncellenir
document.addEventListener('change', e => { const sw = e.target.closest && e.target.closest('.card > .ch label.sw'); if (!sw) return; const c = sw.closest('.card'), on = e.target.checked, p = c.querySelector('.stp'); c.classList.toggle('swon', on); c.classList.toggle('swoff', !on); if (p) { p.classList.toggle('on', on); p.textContent = on ? 'Yayında' : 'Kapalı'; } });
