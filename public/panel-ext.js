/* Çok işletmeli sürümün panel eklemeleri: ekranlar, düzen editörü, tema/logo, fiyat tarifesi, işletme ayarları. */
let SCREENS = [], ORPHANS = [], SLIMIT = 1, CAT = null, MENU = null, USERS = [];
const ICONS = { media: '🎞', logo: '🏷', clock: '🕒', rates: '💱', ticker: '📰', text: '📝', image: '🖼', qr: '▣', info: '⚽', reviews: '★', menu: '🧾' };
const jfetch = async (url, opt = {}) => {
  const r = await fetch(url, { ...opt, headers: opt.body && !(opt.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'İşlem başarısız (' + r.status + ')');
  return j;
};
const fmtDate = ms => ms ? new Date(ms).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';
const ago2 = ms => { if (!ms) return 'hiç bağlanmadı'; const m = Math.round((Date.now() - ms) / 60000); return m < 2 ? 'az önce' : m < 60 ? m + ' dk önce' : m < 1440 ? Math.round(m / 60) + ' saat önce' : Math.round(m / 1440) + ' gün önce'; };
const isPro = () => ME && ME.tenant.plan.pro;

/* ================= açılış ================= */
async function extInit() {
  try { ME = await jfetch('/api/admin/me'); } catch (e) { location.href = '/login'; return; }
  UP = ME.upBase;
  const t = ME.tenant;
  $('brandt').innerHTML = t.logo ? `<img src="${esc(t.logo)}" alt="">` : esc(t.name);
  document.title = t.name + ' · ' + ME.brand;
  // üst şerit
  const tb = $('topbar'), acc = t.access, days = acc.until ? Math.ceil((acc.until - Date.now()) / 86400000) : 0;
  let html = '', cls = '';
  if (ME.user.impersonating) { cls = 'imp'; html = `Süper yönetici olarak <b>${esc(t.name)}</b> işletmesini görüntülüyorsunuz. <button class="btn sm ghost" onclick="unimp()">Süper yönetime dön</button>`; }
  else if (!acc.ok) { cls = 'bad'; html = acc.reason === 'suspended' ? '<b>Hesabınız askıya alındı.</b> Ekranlarınız şu an kapalı. Destek ile iletişime geçin.' : '<b>Abonelik süreniz doldu.</b> Ekranlarınız duraklatıldı; paketinizi yenileyince kendiliğinden açılır.'; }
  else if (acc.kind === 'trial') { cls = 'trial'; html = `Deneme süreniz <b>${days} gün</b> sonra (${fmtDate(acc.until)}) bitiyor. Deneme süresince tüm Pro özellikler açık.`; }
  if (html) { tb.className = 'on ' + cls; tb.innerHTML = html; }
  // Pro kilitleri
  if (!isPro()) document.querySelectorAll('.nav[data-pro]').forEach(b => {
    b.classList.add('locked'); b.insertAdjacentHTML('beforeend', '<span class="pro">PRO</span>');
    const sec = $('sec-' + b.dataset.tab);
    if (sec) sec.querySelector('.sub').insertAdjacentHTML('afterend', '<div class="lockmsg">🔒 Bu özellik <b>Pro</b> pakette. Ayarlarınızı şimdiden yapabilirsiniz; ekranda görünmesi için paketinizi yükseltin (İşletme sekmesi).</div>');
  });
  CAT = await jfetch('/api/admin/catalog');
  $('stpl').innerHTML = $('dtpl').innerHTML = '<option value="">Şablon seçin…</option>' + Object.entries(CAT.templates).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join('');
  $('stpl').value = isPro() ? 'spor' : 'temel';
  $('th-font').innerHTML = CAT.fonts.map(f => `<option>${esc(f)}</option>`).join('');
  $('themes').innerHTML = Object.entries(CAT.themes).map(([k, v]) => `<div class="chip" onclick="pickTheme('${k}')"><span style="display:inline-flex;gap:3px">${[v.bg, v.accent, v.accent2].map(c => `<i style="width:14px;height:14px;border-radius:50%;background:${c};border:1px solid rgba(255,255,255,.2)"></i>`).join('')}</span>${esc(v.name)}</div>`).join('');
  fillTheme(t.theme);
  renderLogo(t.logo);
  renderAccount();
  // TV'deki QR okutulunca: #pair=123456
  const m = /^#pair=(\d{6})$/.exec(location.hash);
  if (m) { $('pcode').value = m[1].replace(/(\d{3})(\d{3})/, '$1 $2'); }
  window.__boot().then(() => { if (m) { show('screens'); $('pscreen').focus(); toast('Kod dolduruldu: ekranı seçip "TV\'yi bağla"ya basın'); } });
}
async function extLoad() {
  await loadScreens();
  MENU = MENU && MENU.__dirty ? MENU : JSON.parse(JSON.stringify(db.menu || { title: 'Fiyat Listesi', currency: '₺', categories: [] }));
  renderMenu();
  if (ME && ME.user.role !== 'staff') loadUsers();
}
function onTab(tab) {
  if (tab === 'design') { setTimeout(() => { renderCanvas(); scalePv(); }, 30); }
  if (tab === 'account') renderAccount();
}
const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.href = '/login'; };
const unimp = async () => { await fetch('/api/super/unimpersonate', { method: 'POST' }); location.href = '/super'; };

/* ================= ekranlar ve cihazlar ================= */
async function loadScreens() {
  try { const j = await jfetch('/api/admin/screens'); SCREENS = j.screens; ORPHANS = j.orphan; SLIMIT = j.limit; } catch (e) { return; }
  const opts = SCREENS.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  const keep = (id, v) => { const el = $(id), old = el.value; el.innerHTML = opts; el.value = SCREENS.some(s => s.id === old) ? old : (v || (SCREENS[0] || {}).id || ''); };
  keep('pscreen'); keep('dscreen');
  $('b-screens').textContent = SCREENS.length;
  $('slimit').textContent = `Paketinizde ${SLIMIT >= 999 ? 'sınırsız' : SLIMIT} ekran hakkı var; ${SCREENS.length} tanesi kullanılıyor.`;
  const online = SCREENS.reduce((a, s) => a + s.devices.filter(d => d.online).length, 0);
  const sel = id => SCREENS.map(s => `<option value="${s.id}"${s.id === id ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  const devRow = d => `<div class="dev"><span class="dot ${d.online ? 'on' : ''}"></span><b style="min-width:90px">${esc(d.name || 'TV')}</b><span style="color:var(--mute);flex:1">${d.online ? 'Bağlı' : 'Son görülme: ' + ago2(d.last_seen)}</span>
    <select onchange="moveDev('${d.id}',this.value)" title="Bu TV'de gösterilecek ekran">${d.screen_id ? '' : '<option>Ekran seçin</option>'}${sel(d.screen_id)}</select>
    <button class="btn ghost sm" onclick="renameDev('${d.id}','${esc(d.name || '').replace(/'/g, '')}')">Adlandır</button>
    <button class="btn danger sm" onclick="delDev('${d.id}')">Kaldır</button></div>`;
  $('screenlist').innerHTML = SCREENS.map(s => `<div class="scard"><div class="sh">
      <input type="text" value="${esc(s.name)}" maxlength="40" onchange="renameScreen('${s.id}',this.value)">
      <span style="color:var(--mute);font-size:13px">${s.layout.widgets.length} widget · ${s.devices.length} TV</span><span style="flex:1"></span>
      <button class="btn ghost sm" onclick="editDesign('${s.id}')">🎨 Düzeni düzenle</button>
      <a class="btn ghost sm" style="text-decoration:none" href="/tv?preview=${s.id}" target="_blank">Önizle ↗</a>
      ${SCREENS.length > 1 ? `<button class="btn danger sm" onclick="delScreen('${s.id}','${esc(s.name).replace(/'/g, '')}')">Sil</button>` : ''}</div>
      ${s.devices.length ? s.devices.map(devRow).join('') : '<div class="empty" style="padding:16px">Bu ekrana bağlı TV yok. Yukarıdan kodla ekleyin ya da TV\'de giriş yapıp bu ekranı seçin.</div>'}</div>`).join('')
    + (ORPHANS.length ? `<div class="scard"><div class="sh"><b>Ekranı silinmiş TV'ler</b></div>${ORPHANS.map(devRow).join('')}</div>` : '');
  // önizlemeler
  const first = (SCREENS[0] || {}).id;
  if (first) {
    const pv = $('pvf'); if (pv.dataset.sid !== first) { pv.dataset.sid = first; pv.src = '/tv?preview=' + first; }
    document.querySelectorAll('a.tvlink').forEach(a => { a.href = '/tv?preview=' + first; });
  }
  const ds = $('dscreen').value, pv2 = $('pvf2');
  if (ds && pv2.dataset.sid !== ds) { pv2.dataset.sid = ds; pv2.src = '/tv?preview=' + ds; }
  if (!EDIT.sid || (EDIT.sid !== $('dscreen').value) || !EDIT.dirty) loadDesign(true);
  window.__online = online;
}
async function pairTv() {
  const code = $('pcode').value.replace(/\D/g, '');
  if (code.length !== 6) return toast('TV ekranındaki 6 haneli kodu girin', true);
  try { await jfetch('/api/admin/pair', { method: 'POST', body: JSON.stringify({ code, screenId: $('pscreen').value }) }); toast('TV bağlandı, birkaç saniye içinde ekranınız açılacak'); $('pcode').value = ''; if (location.hash.startsWith('#pair=')) history.replaceState(null, '', '#screens'); setTimeout(loadScreens, 2500); }
  catch (e) { toast(e.message, true); }
}
async function addScreen() {
  const ok = await api('POST', '/screens', { name: $('sname').value.trim(), template: $('stpl').value }, 'Ekran eklendi');
  if (ok) $('sname').value = '';
}
const renameScreen = (id, name) => api('PUT', '/screens/' + id, { name }, 'Ekran adı kaydedildi');
const delScreen = (id, name) => { if (confirm(`"${name}" ekranı silinsin mi? Bağlı TV'ler ekransız kalır.`)) api('DELETE', '/screens/' + id, undefined, 'Ekran silindi'); };
const moveDev = (id, screenId) => api('PUT', '/devices/' + id, { screenId }, 'TV başka ekrana alındı');
const renameDev = (id, cur) => { const n = prompt('TV için bir ad (örn. Salon sol):', cur); if (n !== null) api('PUT', '/devices/' + id, { name: n }, 'Kaydedildi'); };
const delDev = id => { if (confirm('Bu TV\'nin oturumu kapatılsın mı? TV giriş ekranına döner.')) api('DELETE', '/devices/' + id, undefined, 'TV kaldırıldı'); };
const reloadTvs = () => post('/devices/reload', 'Tüm TV\'lere yenileme komutu gönderildi');
function editDesign(id) { $('dscreen').value = id; loadDesign(); show('design'); }

/* ================= düzen editörü ================= */
const EDIT = { sid: null, layout: null, sel: -1, hist: [], dirty: false };
const clone = o => JSON.parse(JSON.stringify(o));
function loadDesign(silent) {
  const s = SCREENS.find(x => x.id === $('dscreen').value);
  if (!s) return;
  if (!silent && EDIT.dirty && EDIT.sid && EDIT.sid !== s.id && !confirm('Kaydedilmemiş düzen değişiklikleri kaybolacak. Devam edilsin mi?')) { $('dscreen').value = EDIT.sid; return; }
  EDIT.sid = s.id; EDIT.layout = clone(s.layout); EDIT.sel = -1; EDIT.hist = []; EDIT.dirty = false;
  const pv2 = $('pvf2'); if (pv2.dataset.sid !== s.id) { pv2.dataset.sid = s.id; pv2.src = '/tv?preview=' + s.id; }
  renderCanvas(); renderProps(); renderPalette();
}
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const badSet = () => { const ws = EDIT.layout.widgets, bad = new Set(); ws.forEach((a, i) => ws.forEach((b, j) => { if (i < j && overlap(a, b)) { bad.add(i); bad.add(j); } })); return bad; };
function renderCanvas() {
  const c = $('canvas'); if (!c || !EDIT.layout || !CAT) return;
  const bad = badSet(), C = EDIT.layout.cols, R = EDIT.layout.rows;
  c.innerHTML = EDIT.layout.widgets.map((w, i) => {
    const d = CAT.widgets[w.type] || { name: w.type };
    const locked = d.pro && !CAT.pro;
    return `<div class="wb${i === EDIT.sel ? ' sel' : ''}${bad.has(i) ? ' bad' : ''}" data-i="${i}" style="left:${w.x / C * 100}%;top:${w.y / R * 100}%;width:${w.w / C * 100}%;height:${w.h / R * 100}%">
      <span class="ic">${ICONS[w.type] || '▢'}</span>${esc(d.name)}${locked ? '<small>🔒 Pro</small>' : `<small>${w.w}×${w.h}</small>`}<i class="rz"></i></div>`;
  }).join('');
}
function snapshot() { EDIT.hist.push(clone(EDIT.layout)); if (EDIT.hist.length > 40) EDIT.hist.shift(); EDIT.dirty = true; }
function undoLayout() { if (!EDIT.hist.length) return toast('Geri alınacak değişiklik yok'); EDIT.layout = EDIT.hist.pop(); EDIT.sel = -1; renderCanvas(); renderProps(); renderPalette(); }
(function dragSetup() {
  const wrap = $('canvasw'); let st = null;
  wrap.addEventListener('pointerdown', e => {
    const el = e.target.closest('.wb'); if (!el) { EDIT.sel = -1; renderCanvas(); renderProps(); return; }
    const i = Number(el.dataset.i), w = EDIT.layout.widgets[i];
    EDIT.sel = i; st = { i, x0: e.clientX, y0: e.clientY, w0: clone(w), mode: e.target.classList.contains('rz') ? 'rz' : 'mv', moved: false, before: clone(EDIT.layout) };
    wrap.setPointerCapture(e.pointerId); renderCanvas(); renderProps(); e.preventDefault();
  });
  wrap.addEventListener('pointermove', e => {
    if (!st) return;
    const r = wrap.getBoundingClientRect(), C = EDIT.layout.cols, R = EDIT.layout.rows;
    const dx = Math.round((e.clientX - st.x0) / r.width * C), dy = Math.round((e.clientY - st.y0) / r.height * R);
    const w = EDIT.layout.widgets[st.i], min = (CAT.widgets[w.type] || {}).min || [2, 2], o = st.w0;
    if (st.mode === 'mv') { w.x = Math.max(0, Math.min(C - o.w, o.x + dx)); w.y = Math.max(0, Math.min(R - o.h, o.y + dy)); }
    else { w.w = Math.max(min[0], Math.min(C - o.x, o.w + dx)); w.h = Math.max(min[1], Math.min(R - o.y, o.h + dy)); }
    if (w.x !== o.x || w.y !== o.y || w.w !== o.w || w.h !== o.h) st.moved = true;
    const el = $('canvas').querySelector(`.wb[data-i="${st.i}"]`);
    if (el) { el.style.left = w.x / C * 100 + '%'; el.style.top = w.y / R * 100 + '%'; el.style.width = w.w / C * 100 + '%'; el.style.height = w.h / R * 100 + '%'; el.classList.add('dragging'); el.querySelector('small').textContent = `${w.w}×${w.h}`; }
  });
  const end = () => { if (!st) return; if (st.moved) { EDIT.hist.push(st.before); EDIT.dirty = true; } st = null; renderCanvas(); renderProps(); };
  wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
})();
function renderPalette() {
  if (!CAT || !EDIT.layout) return;
  const used = new Set(EDIT.layout.widgets.map(w => w.type));
  $('palette').innerHTML = Object.entries(CAT.widgets).map(([k, d]) => {
    const locked = d.pro && !CAT.pro;
    return `<div class="chip${locked ? ' lock' : ''}${used.has(k) ? ' used' : ''}" title="${esc(d.desc)}" onclick="addWidget('${k}')"><span>${ICONS[k] || '▢'}</span>${esc(d.name)}${locked ? ' 🔒' : used.has(k) ? ' ✓' : ''}</div>`;
  }).join('');
}
function addWidget(type) {
  const d = CAT.widgets[type];
  if (d.pro && !CAT.pro) return toast('Bu widget Pro pakette', true);
  if (EDIT.layout.widgets.some(w => w.type === type)) return toast('Bu widget düzende zaten var (her widget bir kez kullanılabilir)', true);
  const [mw, mh] = d.min || [4, 3], C = EDIT.layout.cols, R = EDIT.layout.rows;
  let spot = null;
  for (let y = 0; y <= R - mh && !spot; y++) for (let x = 0; x <= C - mw && !spot; x++) { const c = { x, y, w: mw, h: mh }; if (!EDIT.layout.widgets.some(w => overlap(w, c))) spot = c; }
  snapshot();
  const w = { type, ...(spot || { x: 0, y: 0, w: mw, h: mh }) };
  if (d.props) w.props = clone(d.props);
  EDIT.layout.widgets.push(w); EDIT.sel = EDIT.layout.widgets.length - 1;
  renderCanvas(); renderProps(); renderPalette();
  if (!spot) toast('Boş yer yok: kutu sol üste kondu, diğerlerini küçültüp yerleştirin', true);
}
function removeWidget(i) { snapshot(); EDIT.layout.widgets.splice(i, 1); EDIT.sel = -1; renderCanvas(); renderProps(); renderPalette(); }
function setProp(k, v) { const w = EDIT.layout.widgets[EDIT.sel]; if (!w) return; snapshot(); w.props = { ...(w.props || {}), [k]: v }; }
const HINTS = {
  media: 'Videolar ve fotoğraflar <b>Medya</b> bölümünden yönetilir. Kampanya kartları, büyük maç duyurusu ve fragmanlar da bu kutunun içinde çıkar.',
  info: 'Maçlar <b>Maçlar</b>, diğer sayfalar (eczane, haber, sinema, tarihte bugün) <b>Bilgi Sayfaları</b> bölümünden açılıp kapanır.',
  reviews: 'Yorumlar <b>Yorumlar</b> bölümünden eklenir.', qr: 'QR kodlar <b>QR Kod</b> bölümünden eklenir; burada sırayla döner.',
  logo: 'Logo bu sayfanın altındaki <b>Logo</b> kartından yüklenir.', menu: 'Ürünler ve fiyatlar <b>Fiyat Tarifesi</b> bölümünden girilir.',
};
function renderProps() {
  const box = $('props'), w = EDIT.layout && EDIT.layout.widgets[EDIT.sel];
  if (!w) { box.innerHTML = '<h3>Widget ayarları</h3><p class="hint">Ayarlarını görmek için düzendeki bir kutuya tıklayın. Yeni widget eklemek için alttaki listeyi kullanın.</p>' + (badSet().size ? '<p class="hint" style="color:var(--bad)">Kırmızı kutular üst üste biniyor; kaydetmeden önce düzeltin.</p>' : ''); return; }
  const d = CAT.widgets[w.type] || {}, p = w.props || {};
  const chk = (k, label) => `<div class="item"><label class="sw"><input type="checkbox" ${p[k] !== false ? 'checked' : ''} onchange="setProp('${k}',this.checked)"><i></i></label><div class="body"><b>${label}</b></div></div>`;
  let f = '';
  if (w.type === 'clock') f = `<div class="item"><label class="sw"><input type="checkbox" ${p.seconds ? 'checked' : ''} onchange="setProp('seconds',this.checked)"><i></i></label><div class="body"><b>Saniyeyi göster</b></div></div>`;
  if (w.type === 'rates') f = chk('weather', 'Hava durumu') + chk('rates', 'Döviz, altın, borsa');
  if (w.type === 'ticker') f = chk('clock', 'Solda saat kutusu');
  if (w.type === 'text') f = `<div class="fld"><label class="f">Başlık</label><input type="text" maxlength="200" value="${esc(p.title || '')}" onchange="setProp('title',this.value)"></div>
    <div class="fld"><label class="f">Metin</label><textarea rows="4" maxlength="400" onchange="setProp('body',this.value)">${esc(p.body || '')}</textarea></div>
    <div class="row"><div class="fld"><label class="f">Hizalama</label><select onchange="setProp('align',this.value)">${[['left', 'Sola'], ['center', 'Ortaya'], ['right', 'Sağa']].map(([v, l]) => `<option value="${v}"${p.align === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="fld"><label class="f">Yazı boyu</label><select onchange="setProp('size',this.value)">${[['s', 'Küçük'], ['m', 'Orta'], ['l', 'Büyük']].map(([v, l]) => `<option value="${v}"${(p.size || 'm') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div></div>`;
  if (w.type === 'image') f = `${p.url ? `<img src="${esc(p.url)}" style="width:100%;border-radius:8px;margin-bottom:10px;max-height:160px;object-fit:contain;background:#000">` : ''}
    <input type="file" id="assetfile" accept="image/*" style="display:none" onchange="uploadAsset()"><button class="btn sm" onclick="$('assetfile').click()">Resim yükle</button>
    <div class="fld" style="margin-top:12px"><label class="f">Yerleşim</label><select onchange="setProp('fit',this.value)"><option value="cover"${p.fit !== 'contain' ? ' selected' : ''}>Kutuyu doldur (kırpılabilir)</option><option value="contain"${p.fit === 'contain' ? ' selected' : ''}>Tamamı görünsün</option></select></div>
    ${(db.assets || []).length ? `<label class="f">Daha önce yüklenenler</label><div style="display:flex;gap:6px;flex-wrap:wrap">${db.assets.slice(-12).reverse().map(a => `<img src="${UP}${a.file}" title="${esc(a.name)}" onclick="setProp('url','${UP}${a.file}');renderProps()" style="width:56px;height:40px;object-fit:cover;border-radius:6px;cursor:pointer;border:1px solid var(--line)">`).join('')}</div>` : ''}`;
  if (w.type === 'menu') f = `<div class="fld"><label class="f">Başlık (boşsa fiyat listesinin başlığı)</label><input type="text" maxlength="40" value="${esc(p.title || '')}" onchange="setProp('title',this.value)"></div>`;
  box.innerHTML = `<h3>${ICONS[w.type] || ''} ${esc(d.name || w.type)}</h3><p class="hint">${esc(d.desc || '')}${HINTS[w.type] ? '<br><br>' + HINTS[w.type] : ''}</p>${f}
    <p class="hint" style="margin-top:12px">Konum: ${w.x},${w.y} · Boyut: ${w.w}×${w.h} (ızgara 24×24)</p>
    <button class="btn danger sm" onclick="removeWidget(${EDIT.sel})">Bu widget'ı kaldır</button>`;
}
async function uploadAsset() {
  const f = $('assetfile').files[0]; if (!f) return;
  const fd = new FormData(); fd.append('file', f);
  try { const j = await jfetch('/api/admin/assets', { method: 'POST', body: fd }); setProp('url', j.url); db.assets = (db.assets || []).concat({ file: j.url.split('/').pop(), name: f.name }); renderProps(); toast('Resim yüklendi; düzeni kaydetmeyi unutmayın'); }
  catch (e) { toast(e.message, true); }
}
function applyTpl() {
  const k = $('dtpl').value; if (!k) return toast('Önce bir şablon seçin', true);
  const tpl = CAT.templates[k];
  const locked = tpl.widgets.filter(w => CAT.widgets[w.type].pro && !CAT.pro);
  snapshot(); EDIT.layout = { cols: CAT.cols, rows: CAT.rows, widgets: clone(tpl.widgets) }; EDIT.sel = -1;
  renderCanvas(); renderProps(); renderPalette();
  toast(locked.length ? 'Şablon uygulandı; kilitli (Pro) widget\'lar paketinizde görünmez' : 'Şablon uygulandı; beğendiyseniz "Düzeni kaydet"e basın');
}
async function saveLayout() {
  if (badSet().size) return toast('Bazı kutular üst üste biniyor (kırmızı). Önce düzeltin.', true);
  try { await jfetch('/api/admin/screens/' + EDIT.sid, { method: 'PUT', body: JSON.stringify({ layout: EDIT.layout }) }); EDIT.dirty = false; toast('Düzen kaydedildi, TV\'ler güncellendi'); await loadScreens(); }
  catch (e) { toast(e.message, true); }
}
addEventListener('beforeunload', e => { if (EDIT.dirty) { e.preventDefault(); e.returnValue = ''; } });

/* ================= tema ve logo ================= */
function fillTheme(t) { ['bg', 'accent', 'accent2', 'text'].forEach(k => { $('th-' + k).value = t[k]; }); $('th-font').value = t.font || 'Montserrat'; }
function pickTheme(k) { const t = CAT.themes[k]; fillTheme(t); saveTheme(); }
async function saveTheme() {
  const body = { bg: $('th-bg').value, accent: $('th-accent').value, accent2: $('th-accent2').value, text: $('th-text').value, font: $('th-font').value };
  try { const j = await jfetch('/api/admin/theme', { method: 'PUT', body: JSON.stringify(body) }); ME.tenant.theme = j.theme; toast('Renkler kaydedildi, TV\'ler güncellendi'); }
  catch (e) { toast(e.message, true); }
}
function renderLogo(url) {
  $('logobox').innerHTML = url ? `<div style="background:#0d0f0f;border:1px solid var(--line);border-radius:12px;padding:18px;text-align:center"><img src="${esc(url)}" style="max-width:100%;max-height:120px;object-fit:contain"></div>` : `<div class="empty">Logo yüklenmedi. Ekranda "${esc(ME.tenant.name)}" yazısı görünür.</div>`;
}
async function uploadLogo() {
  const f = $('logofile').files[0]; if (!f) return;
  const fd = new FormData(); fd.append('file', f);
  try { const j = await jfetch('/api/admin/logo', { method: 'POST', body: fd }); ME.tenant.logo = j.url; renderLogo(j.url); $('brandt').innerHTML = `<img src="${esc(j.url)}" alt="">`; toast('Logo yüklendi'); }
  catch (e) { toast(e.message, true); }
  $('logofile').value = '';
}
async function removeLogo() { try { await jfetch('/api/admin/logo', { method: 'DELETE' }); ME.tenant.logo = null; renderLogo(null); $('brandt').textContent = ME.tenant.name; toast('Logo kaldırıldı'); } catch (e) { toast(e.message, true); } }

/* ================= fiyat tarifesi ================= */
function renderMenu() {
  if (!MENU) return;
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#menucats')) return; // yazarken yeniden çizme
  $('mtitle').value = MENU.title || ''; $('mcur').value = MENU.currency || '₺';
  $('menucats').innerHTML = MENU.categories.length ? MENU.categories.map((c, ci) => `<div class="mcat"><div class="ch">
      <input type="text" value="${esc(c.name)}" placeholder="Kategori adı (örn. Sıcak İçecekler)" maxlength="40" oninput="MENU.categories[${ci}].name=this.value;MENU.__dirty=1" style="font-weight:700">
      <button class="btn ghost sm" onclick="mvCat(${ci},-1)" title="Yukarı">↑</button><button class="btn ghost sm" onclick="mvCat(${ci},1)" title="Aşağı">↓</button>
      <button class="btn danger sm" onclick="rmCat(${ci})">Sil</button></div>
      ${c.items.map((it, ii) => `<div class="mrow">
        <input type="text" value="${esc(it.name)}" placeholder="Ürün" maxlength="60" oninput="MENU.categories[${ci}].items[${ii}].name=this.value;MENU.__dirty=1">
        <input class="md" type="text" value="${esc(it.desc || '')}" placeholder="Açıklama (isteğe bağlı)" maxlength="90" oninput="MENU.categories[${ci}].items[${ii}].desc=this.value;MENU.__dirty=1">
        <input type="text" value="${esc(it.price)}" placeholder="Fiyat" maxlength="16" oninput="MENU.categories[${ci}].items[${ii}].price=this.value;MENU.__dirty=1">
        <button class="btn ghost sm" onclick="mvItem(${ci},${ii},-1)">↑</button><button class="btn ghost sm" onclick="mvItem(${ci},${ii},1)">↓</button>
        <button class="btn danger sm" onclick="rmItem(${ci},${ii})">✕</button></div>`).join('')}
      <button class="btn ghost sm" style="margin-top:6px" onclick="addItem(${ci})">＋ Ürün ekle</button></div>`).join('')
    : '<div class="empty" style="margin-bottom:14px">Henüz kategori yok. "Kategori ekle" ile başlayın ya da aşağıdan toplu yapıştırın.</div>';
}
const menuEdit = fn => { fn(); MENU.__dirty = 1; const a = document.activeElement; if (a && a.blur) a.blur(); renderMenu(); };
const addCat = () => menuEdit(() => MENU.categories.push({ name: '', items: [{ name: '', price: '', desc: '' }] }));
const rmCat = ci => { if (confirm('Kategori ve içindeki ürünler silinsin mi?')) menuEdit(() => MENU.categories.splice(ci, 1)); };
const mvCat = (ci, d) => menuEdit(() => { const a = MENU.categories, j = ci + d; if (j >= 0 && j < a.length) [a[ci], a[j]] = [a[j], a[ci]]; });
const addItem = ci => menuEdit(() => MENU.categories[ci].items.push({ name: '', price: '', desc: '' }));
const rmItem = (ci, ii) => menuEdit(() => MENU.categories[ci].items.splice(ii, 1));
const mvItem = (ci, ii, d) => menuEdit(() => { const a = MENU.categories[ci].items, j = ii + d; if (j >= 0 && j < a.length) [a[ii], a[j]] = [a[j], a[ii]]; });
async function saveMenu() {
  MENU.title = $('mtitle').value.trim(); MENU.currency = $('mcur').value.trim() || '₺';
  try { await jfetch('/api/admin/menu', { method: 'PUT', body: JSON.stringify(MENU) }); MENU.__dirty = 0; toast('Fiyat listesi kaydedildi'); await load(); }
  catch (e) { toast(e.message, true); }
}
function bulkMenu(replace) {
  const lines = $('mbulk').value.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return toast('Önce listeyi yapıştırın', true);
  if (replace && !confirm('Mevcut liste silinip yapıştırdığınızla değiştirilsin mi?')) return;
  const cats = replace ? [] : MENU.categories;
  let cur = null;
  for (const l of lines) {
    if (l.startsWith('#')) { cur = { name: l.replace(/^#+\s*/, ''), items: [] }; cats.push(cur); continue; }
    const [name, price = '', desc = ''] = l.split(/[;\t|]/).map(x => x.trim());
    if (!cur) { cur = { name: 'Ürünler', items: [] }; cats.push(cur); }
    if (name) cur.items.push({ name, price, desc });
  }
  MENU.categories = cats; MENU.__dirty = 1; renderMenu(); $('mbulk').value = '';
  toast('Eklendi; kontrol edip "Kaydet"e basın');
}

/* ================= işletme ve paket ================= */
let GEO = null;
function renderAccount() {
  if (!ME) return;
  const t = ME.tenant, p = t.plan, u = ME.usage, acc = t.access;
  const status = !acc.ok ? (acc.reason === 'suspended' ? '<b style="color:var(--bad)">Askıda</b>' : '<b style="color:var(--bad)">Süresi doldu</b>') : acc.kind === 'trial' ? `Deneme · ${fmtDate(acc.until)} tarihine kadar` : `Aktif · ${fmtDate(acc.until)} tarihine kadar`;
  const meter = (label, used, lim, fmt = x => x, unl = lim >= 999) => `<div style="display:flex;justify-content:space-between;font-size:13px"><span>${label}</span><span style="color:var(--mute)">${fmt(used)} / ${unl ? 'sınırsız' : fmt(lim)}</span></div><div class="meter"><i style="width:${unl ? 5 : Math.max(2, Math.min(100, used / lim * 100))}%"></i></div>`;
  $('planbox').innerHTML = `<div style="font-size:22px;font-weight:700;color:var(--accent2)">${esc(p.name)}</div><p class="hint" style="margin:4px 0 16px">${status}</p>
    ${meter('Ekran', u.screens, p.screens)}${meter('Depolama', Math.round(u.storageBytes / 1048576), p.storageMB, x => x >= 1024 ? (x / 1024).toFixed(1) + ' GB' : x + ' MB', false)}${meter('Kullanıcı', u.users, p.users)}
    <div class="plans">${Object.values(ME.plans).map(x => `<div class="${x.id === p.id ? 'cur' : ''}"><b>${esc(x.name)}</b>${x.screens >= 999 ? 'Sınırsız' : x.screens} ekran<br>${x.storageMB >= 1024 ? x.storageMB / 1024 + ' GB' : x.storageMB + ' MB'} depolama<br>${x.users} kullanıcı<br>${x.pro ? 'Maçlar, fiyat tarifesi, yorumlar, doğum günü' : 'Temel widget\'lar'}${x.badge ? '<br><span style="color:var(--mute)">Köşede ürün ibaresi</span>' : ''}</div>`).join('')}</div>
    <p class="hint" style="margin:14px 0 0">Paket değişikliği ve ödeme için bizimle iletişime geçin.</p>`;
  if (document.activeElement !== $('acname')) $('acname').value = t.name;
  $('acloc').textContent = t.location ? `Hava durumu konumu: ${t.location.city} (${Number(t.location.lat).toFixed(2)}, ${Number(t.location.lon).toFixed(2)})` : '';
}
let geoT;
function geoSearch() {
  clearTimeout(geoT);
  geoT = setTimeout(async () => {
    const q = $('accity').value.trim(); if (q.length < 2) { $('georesults').innerHTML = ''; return; }
    try {
      const list = await jfetch('/api/admin/geo?q=' + encodeURIComponent(q));
      $('georesults').innerHTML = list.map((x, i) => `<button type="button" onclick="pickGeo(${i})">${esc(x.city)}${x.admin ? ' · ' + esc(x.admin) : ''}</button>`).join('') || '<span class="hint">Sonuç yok</span>';
      window.__geo = list;
    } catch (e) { $('georesults').innerHTML = `<span class="hint">${esc(e.message)}</span>`; }
  }, 350);
}
function pickGeo(i) { GEO = window.__geo[i]; $('accity').value = GEO.city + (GEO.admin ? ', ' + GEO.admin : ''); $('georesults').innerHTML = ''; }
async function saveProfile() {
  const body = { name: $('acname').value.trim() };
  if (GEO) body.location = { city: GEO.city, lat: GEO.lat, lon: GEO.lon };
  try { await jfetch('/api/admin/profile', { method: 'PUT', body: JSON.stringify(body) }); toast('İşletme bilgileri kaydedildi'); ME = await jfetch('/api/admin/me'); GEO = null; $('accity').value = ''; renderAccount(); }
  catch (e) { toast(e.message, true); }
}
async function loadUsers() {
  try { USERS = await jfetch('/api/admin/users'); } catch (e) { return; }
  $('userlist').innerHTML = USERS.map(u => `<div class="item"><div class="body"><b>${esc(u.username)}</b><span>${u.role === 'owner' ? 'İşletme sahibi' : 'Personel'} · son giriş: ${u.last_login ? ago2(u.last_login) : 'hiç'}</span></div>${u.role === 'staff' ? `<button class="btn danger sm" onclick="delUser('${u.id}','${esc(u.username)}')">Sil</button>` : ''}</div>`).join('');
}
async function addUser() {
  try { await jfetch('/api/admin/users', { method: 'POST', body: JSON.stringify({ username: $('nuname').value.trim(), password: $('nupass').value }) }); $('nuname').value = $('nupass').value = ''; toast('Kullanıcı eklendi'); loadUsers(); }
  catch (e) { toast(e.message, true); }
}
async function delUser(id, name) { if (!confirm(`"${name}" kullanıcısı silinsin mi?`)) return; try { await jfetch('/api/admin/users/' + id, { method: 'DELETE' }); loadUsers(); } catch (e) { toast(e.message, true); } }
async function changePw() {
  try { await jfetch('/api/admin/password', { method: 'PUT', body: JSON.stringify({ current: $('pwcur').value, next: $('pwnew').value }) }); $('pwcur').value = $('pwnew').value = ''; toast('Şifre değiştirildi'); }
  catch (e) { toast(e.message, true); }
}

extInit();
