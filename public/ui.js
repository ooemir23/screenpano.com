/* Panel ve süper yönetim için ortak arayüz parçaları (A3): tarayıcının kendi onay penceresi yerine temaya uygun onay penceresi
 * ve geri alınabilen işlemler için "Geri al" bildirimi. Metinler Türkçe yazılır; i18n.js seçili dile çevirir.
 *   if (!await UI.ask('Silinsin mi?', { ok: 'Sil', danger: true })) return;
 *   const ad = await UI.ask('Yeni ad', { input: 'eski ad' });   // metin döner, vazgeçilirse null
 *   UI.undo('Silindi', () => geriAl());                           // 6 sn içinde "Geri al"a basılırsa çağrılır
 */
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let box = null, done = null, cur = {}, prevFocus = null;
  function close(v) { if (!box) return; box.classList.remove('on'); box.innerHTML = ''; const d = done; done = null; if (d) d(v); if (prevFocus && prevFocus.isConnected) { try { prevFocus.focus(); } catch (e) {} } prevFocus = null; }
  function ask(msg, o = {}) {
    if (!box) { box = document.createElement('div'); box.id = 'uidlg'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); document.body.appendChild(box);
      box.addEventListener('mousedown', e => { if (e.target === box) close(cur.inp ? null : false); });
      document.addEventListener('keydown', e => {
        if (!box.classList.contains('on')) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(cur.inp ? null : false); return; }
        // Enter yalnız metin kutusundayken veya hiçbir düğmede odak yokken onaylar; "Vazgeç" üzerindeyken kendi düğmesi çalışır
        if (e.key === 'Enter') { const t = e.target; if (t && t.tagName === 'BUTTON') return; e.preventDefault(); box.querySelector('[data-ok]').click(); return; }
        // Tab odağı pencerenin içinde tutar
        if (e.key === 'Tab') { const f = [...box.querySelectorAll('input,button')].filter(x => !x.disabled); if (!f.length) return;
          const a = document.activeElement, i = f.indexOf(a);
          if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); } }
      }, true); }
    if (done) close(o.input != null ? null : false);
    const inp = o.input != null; cur = { inp };
    if (!prevFocus) prevFocus = document.activeElement;
    box.setAttribute('aria-label', o.title || msg);
    box.innerHTML = `<div class="box">${o.title ? `<h4>${esc(o.title)}</h4>` : ''}<p>${esc(msg)}</p>${inp ? `<input type="text" value="${esc(o.input)}">` : ''}
      <div class="acts"><button class="btn g" data-no>${esc(o.cancel || 'Vazgeç')}</button><button class="btn${o.danger ? ' dz' : ''}" data-ok>${esc(o.ok || 'Tamam')}</button></div></div>`;
    box.classList.add('on');
    return new Promise(res => {
      done = res;
      box.querySelector('[data-no]').onclick = () => close(inp ? null : false);
      box.querySelector('[data-ok]').onclick = () => close(inp ? box.querySelector('input').value : true);
      setTimeout(() => { const f = box.querySelector(inp ? 'input' : '[data-ok]'); if (f) { f.focus(); if (inp) f.select(); } }, 30);
    });
  }
  function undo(msg, fn, ms = 6000) {
    let c = document.getElementById('toasts');
    if (!c) { c = document.createElement('div'); c.id = 'toasts'; c.setAttribute('aria-live', 'polite'); document.body.appendChild(c); }
    const t = document.createElement('div'); t.className = 'toast undo'; t.setAttribute('role', 'status');
    t.innerHTML = `<span>${esc(msg)}</span><button type="button">${esc('Geri al')}</button>`;
    let used = false, tm = null; const kill = () => { clearTimeout(tm); t.remove(); };
    const arm = () => { clearTimeout(tm); tm = setTimeout(kill, ms); };
    t.querySelector('button').onclick = () => { if (used) return; used = true; kill(); fn(); };
    // fare üzerindeyken veya odaktayken süre durur (6 sn çok kısa kalıyordu)
    t.addEventListener('mouseenter', () => clearTimeout(tm)); t.addEventListener('mouseleave', arm);
    t.addEventListener('focusin', () => clearTimeout(tm)); t.addEventListener('focusout', arm);
    c.appendChild(t); arm();
  }
  window.UI = { ask, undo };
})();
