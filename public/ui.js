/* Panel ve süper yönetim için ortak arayüz parçaları (A3): tarayıcının kendi onay penceresi yerine temaya uygun onay penceresi
 * ve geri alınabilen işlemler için "Geri al" bildirimi. Metinler Türkçe yazılır; i18n.js seçili dile çevirir.
 *   if (!await UI.ask('Silinsin mi?', { ok: 'Sil', danger: true })) return;
 *   const ad = await UI.ask('Yeni ad', { input: 'eski ad' });   // metin döner, vazgeçilirse null
 *   UI.undo('Silindi', () => geriAl());                           // 6 sn içinde "Geri al"a basılırsa çağrılır
 */
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let box = null, done = null;
  function close(v) { if (!box) return; box.classList.remove('on'); box.innerHTML = ''; const d = done; done = null; if (d) d(v); }
  function ask(msg, o = {}) {
    if (!box) { box = document.createElement('div'); box.id = 'uidlg'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); document.body.appendChild(box);
      box.addEventListener('mousedown', e => { if (e.target === box) close(o.input != null ? null : false); });
      document.addEventListener('keydown', e => { if (!box.classList.contains('on')) return; if (e.key === 'Escape') close(box.querySelector('input') ? null : false); if (e.key === 'Enter') box.querySelector('[data-ok]').click(); }); }
    if (done) close(o.input != null ? null : false);
    const inp = o.input != null;
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
    if (!c) { c = document.createElement('div'); c.id = 'toasts'; document.body.appendChild(c); }
    const t = document.createElement('div'); t.className = 'toast undo';
    t.innerHTML = `<span>${esc(msg)}</span><button type="button">${esc('Geri al')}</button>`;
    let used = false; const kill = () => t.remove();
    t.querySelector('button').onclick = () => { if (used) return; used = true; kill(); fn(); };
    c.appendChild(t); setTimeout(kill, ms);
  }
  window.UI = { ask, undo };
})();
