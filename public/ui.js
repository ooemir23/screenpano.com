/* Panel ve süper yönetim için ortak arayüz parçaları (A3): temaya uygun onay penceresi,
 * değişiklik takibi / eski → yeni onay özeti ve "Geri al" bildirimi. Metinler Türkçe yazılır; i18n.js seçili dile çevirir.
 *   if (!await UI.ask('Silinsin mi?', { ok: 'Sil', danger: true })) return;
 *   const ad = await UI.ask('Yeni ad', { input: 'eski ad' });          // metin döner, vazgeçilirse null
 *   if (!await UI.confirmChanges(changes, { title: '...' })) return;    // eski → yeni listesiyle onay
 *   const tr = UI.track(cardEl, { extra, onChange });                   // değişiklik olunca Kaydet'i açar
 *   UI.undo('Silindi', () => geriAl());                                  // 6 sn içinde "Geri al"a basılırsa çağrılır
 */
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = s => (window.I18N && typeof window.I18N.t === 'function' ? window.I18N.t(s) : s);
  const trunc = (s, max = 120) => { s = String(s ?? ''); return s.length > max ? s.slice(0, max - 1) + '…' : s; };

  let box = null, done = null, cur = {}, prevFocus = null;
  function close(v) {
    if (!box) return;
    box.classList.remove('on');
    box.innerHTML = '';
    const d = done; done = null;
    if (d) d(v);
    if (prevFocus && prevFocus.isConnected) { try { prevFocus.focus(); } catch (e) {} }
    prevFocus = null;
  }
  function ensureDialog() {
    if (box) return box;
    box = document.createElement('div');
    box.id = 'uidlg';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    document.body.appendChild(box);
    box.addEventListener('mousedown', e => { if (e.target === box) close(cur.inp ? null : false); });
    document.addEventListener('keydown', e => {
      if (!box.classList.contains('on')) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(cur.inp ? null : false); return; }
      // Enter yalnız metin kutusundayken veya hiçbir düğmede odak yokken onaylar; "Vazgeç" üzerindeyken kendi düğmesi çalışır
      if (e.key === 'Enter') { const t = e.target; if (t && t.tagName === 'BUTTON') return; e.preventDefault(); const ok = box.querySelector('[data-ok]'); if (ok) ok.click(); return; }
      // Tab odağı pencerenin içinde tutar
      if (e.key === 'Tab') {
        const f = [...box.querySelectorAll('input,button')].filter(x => !x.disabled);
        if (!f.length) return;
        const a = document.activeElement, i = f.indexOf(a);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
      }
    }, true);
    return box;
  }

  function ask(msg, o = {}) {
    ensureDialog();
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

  function confirmChanges(changes, o = {}) {
    if (!Array.isArray(changes) || !changes.length) return Promise.resolve(false);
    ensureDialog();
    if (done) close(false);
    cur = { inp: false };
    if (!prevFocus) prevFocus = document.activeElement;
    const title = T(o.title || 'Değişiklikleri kaydet');
    const sub = o.sub ? T(o.sub) : (changes.length === 1 ? T('1 değişiklik kaydedilecek:') : T(`${changes.length} değişiklik kaydedilecek:`));
    const emptyTxt = T('boş'), newSecretTxt = T('Yeni değer girildi');
    const rows = changes.map(c => {
      const k = `<span class="chg-k">${esc(T(c.label))}</span>`;
      if (c.detail != null && c.from === undefined && c.to === undefined) {
        return `<li>${k}<span class="chg-d" translate="no">${esc(trunc(T(c.detail), 180))}</span></li>`;
      }
      const fEmpty = c.from == null || c.from === '';
      const tEmpty = !c.secret && (c.to == null || c.to === '');
      const fTxt = fEmpty ? emptyTxt : trunc(c.from);
      const tTxt = c.secret ? newSecretTxt : (tEmpty ? emptyTxt : trunc(c.to));
      return `<li>${k}<span class="chg-v"><span class="chg-from${fEmpty ? ' chg-empty' : ''}"${fEmpty ? '' : ' translate="no"'}>${esc(fTxt)}</span><span class="chg-arr" aria-hidden="true">→</span><span class="chg-to${tEmpty ? ' chg-empty' : ''}"${!c.secret && !tEmpty ? ' translate="no"' : ''}>${esc(tTxt)}</span></span></li>`;
    }).join('');
    box.setAttribute('aria-label', title);
    box.innerHTML = `<div class="box wide"><h4>${esc(title)}</h4><p class="chg-sub">${esc(sub)}</p>${o.warn ? `<div class="chg-warn">${esc(T(o.warn))}</div>` : ''}<ul class="chg-list">${rows}</ul>
      <div class="acts"><button class="btn g" data-no>${esc(T(o.cancel || 'Vazgeç'))}</button><button class="btn${o.danger ? ' dz' : ''}" data-ok>${esc(T(o.ok || 'Kaydet'))}</button></div></div>`;
    box.classList.add('on');
    return new Promise(res => {
      done = res;
      box.querySelector('[data-no]').onclick = () => close(false);
      box.querySelector('[data-ok]').onclick = () => close(true);
      setTimeout(() => { const f = box.querySelector('[data-ok]'); if (f) f.focus(); }, 30);
    });
  }

  function summarizeChanges(changes) {
    if (!Array.isArray(changes) || !changes.length) return { count: 0, text: '', title: '' };
    const emptyTxt = T('boş'), newSecretTxt = T('Yeni değer girildi');
    const lines = changes.slice(0, 15).map(c => {
      const lbl = T(c.label);
      if (c.detail != null && c.from === undefined && c.to === undefined) return `• ${lbl}: ${trunc(T(c.detail), 80)}`;
      const f = (c.from == null || c.from === '') ? emptyTxt : trunc(c.from, 40);
      const t = c.secret ? newSecretTxt : ((c.to == null || c.to === '') ? emptyTxt : trunc(c.to, 40));
      return `• ${lbl}: ${f} → ${t}`;
    });
    if (changes.length > 15) lines.push(T(`+${changes.length - 15} değişiklik daha`));
    let text = '';
    if (changes.length === 1) {
      const c = changes[0], lbl = T(c.label);
      if (c.detail != null && c.from === undefined && c.to === undefined) {
        const d = String(T(c.detail));
        text = d.length <= 44 ? `${lbl}: ${d}` : T(`${lbl} değişti`);
      } else {
        const f = (c.from == null || c.from === '') ? emptyTxt : String(c.from);
        const t = c.secret ? newSecretTxt : ((c.to == null || c.to === '') ? emptyTxt : String(c.to));
        const full = `${lbl}: ${f} → ${t}`;
        text = full.length <= 64 ? full : T(`${lbl} değişti`);
      }
    } else {
      const names = [...new Set(changes.map(c => T(c.label)))];
      const shown = names.slice(0, 2).join(', '), rest = names.length - 2;
      text = rest > 0 ? `${shown} ${T(`+${rest} daha`)}` : shown;
    }
    return { count: changes.length, text, title: lines.join('\n') };
  }

  function _normInt(v) {
    const n = Math.round(Number(String(v ?? '').replace(/[^\d]/g, '')));
    return String(Number.isFinite(n) && n > 0 ? n : 0);
  }
  function _normDec(v) {
    let s = String(v ?? '').trim().replace(/[^\d.,]/g, '');
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d+\.\d{1,2}$/.test(s.replace(/,/g, ''))) s = s.replace(/,/g, '');
    else s = s.replace(/[.,]/g, '');
    const n = Math.round(Number(s) * 100) / 100;
    return Number.isFinite(n) && n > 0 ? String(n) : '0';
  }

  function selectText(el, val) {
    const opts = el.options ? [...el.options] : [];
    const opt = opts.find(o => o.value === val);
    return opt ? (opt.textContent || '').trim() || val : val;
  }

  function resolveLabel(el) {
    if (el.dataset && el.dataset.label) return el.dataset.label;
    const ibc = el.closest && el.closest('.ibc');
    if (ibc) {
      const ttEl = ibc.querySelector('.ibh .b b');
      const tt = ttEl ? ttEl.textContent.trim() : '';
      const f = el.closest('.ibf, .fl, label');
      let fl = '';
      if (f) {
        const sp = (f.children && [...f.children].find(c => c.tagName === 'SPAN' || c.tagName === 'LABEL')) || f;
        fl = (sp.textContent || '').replace(/:\s*$/, '').trim();
      }
      if (!fl && el.parentElement) {
        const lb = el.parentElement.children && [...el.parentElement.children].find(c => c.tagName === 'LABEL');
        if (lb) fl = (lb.textContent || '').replace(/:\s*$/, '').trim();
      }
      if (tt && fl) return `${tt} · ${fl}`;
      if (tt) return tt;
    }
    const lbl = el.closest && el.closest('label');
    if (lbl) {
      if (lbl.classList && lbl.classList.contains('check-box-label')) {
        const b = lbl.querySelector('b');
        if (b && b.textContent.trim()) return b.textContent.trim();
      }
      const sp = lbl.children && [...lbl.children].find(c => c.tagName === 'SPAN');
      if (sp) {
        const tx = sp.textContent.replace(/:\s*$/, '').trim();
        if (tx) return tx;
      }
      if (typeof lbl.cloneNode === 'function') {
        const cl = lbl.cloneNode(true);
        cl.querySelectorAll('input,select,textarea,small,button').forEach(x => x.remove());
        const tx = cl.textContent.replace(/:\s*$/, '').trim();
        if (tx) return tx;
      }
    }
    const p = el.parentElement;
    if (p && p.children) {
      const lb = [...p.children].find(c => c.tagName === 'LABEL');
      if (lb) {
        const tx = lb.textContent.replace(/:\s*$/, '').trim();
        if (tx) return tx;
      }
    }
    return (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('placeholder'))) || el.id || 'Ayar';
  }

  function fmtDisp(el, raw) {
    if (el.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.split('-').reverse().join('.');
    return String(raw ?? '').trim();
  }

  function readSnap(el) {
    if (el.type === 'checkbox') return { kind: 'check', val: !!el.checked };
    if (el.type === 'file') {
      const files = el.files ? [...el.files] : [];
      return { kind: 'file', val: files.map(f => `${f.name}:${f.size}`).join('|'), disp: files.map(f => f.name).join(', ') };
    }
    const isSecret = el.type === 'password' || (el.dataset && el.dataset.secret === '1');
    if (isSecret) {
      const raw = String(el.value ?? '');
      return { kind: 'secret', val: raw, disp: raw.startsWith('••••') ? raw : (raw ? '••••' : '') };
    }
    if (el.tagName === 'SELECT') return { kind: 'select', val: String(el.value ?? '') };
    const norm = el.dataset && el.dataset.norm;
    const raw = String(el.value ?? '');
    if (norm === 'int') {
      const val = _normInt(raw);
      return { kind: 'text', norm, raw, val, disp: val === '0' ? (raw.trim() === '0' ? '0' : '') : raw.trim() };
    }
    if (norm === 'dec') {
      const val = _normDec(raw);
      return { kind: 'text', norm, raw, val, disp: val === '0' ? (raw.trim() === '0' ? '0' : '') : raw.trim() };
    }
    return { kind: 'text', norm: '', raw, val: raw, disp: fmtDisp(el, raw) };
  }

  function track(root, opts = {}) {
    if (!root) return null;
    if (root._tracker && typeof root._tracker.destroy === 'function') root._tracker.destroy();

    const showInline = opts.showInline !== false;
    const snaps = new Map();
    const buttons = opts.buttons
      ? [...opts.buttons].filter(Boolean)
      : [...root.querySelectorAll('[data-save-btn], [data-save]')];

    let live = showInline ? (opts.live || root.querySelector('.chg-live') || null) : null;
    let ownsLive = false;
    if (showInline && !live && buttons.length) {
      const b0 = buttons[0];
      if (b0 && b0.parentNode) {
        live = document.createElement('span');
        live.className = 'chg-live';
        live.hidden = true;
        b0.parentNode.insertBefore(live, b0);
        ownsLive = true;
      }
    }

    function shouldIgnore(el) {
      if (!el) return true;
      if (el.disabled || el.readOnly) return true;
      const t = (el.type || '').toLowerCase();
      if (t === 'search' || t === 'button' || t === 'submit' || t === 'reset') return true;
      if (t === 'hidden' && !(el.hasAttribute && el.hasAttribute('data-track-hidden'))) return true;
      if (t === 'file' && !(el.hasAttribute && el.hasAttribute('data-track-file'))) return true;
      if (el.dataset && el.dataset.noTrack != null) return true;
      if (el.closest && (el.closest('.ch') || el.closest('[data-no-track]') || el.closest('[disabled]'))) return true;
      return false;
    }

    function initSnap(scope) {
      for (const el of (scope || root).querySelectorAll('input, select, textarea')) {
        if (shouldIgnore(el)) continue;
        snaps.set(el, readSnap(el));
      }
    }

    function diff() {
      const out = [];
      for (const [el, init] of snaps.entries()) {
        if (!el.isConnected) continue;
        if (shouldIgnore(el)) continue;
        const curSnap = readSnap(el);
        const label = resolveLabel(el);
        if (init.kind === 'check') {
          if (curSnap.val !== init.val) out.push({ label, from: init.val ? T('Açık') : T('Kapalı'), to: curSnap.val ? T('Açık') : T('Kapalı'), el });
        } else if (init.kind === 'select') {
          if (curSnap.val !== init.val) out.push({ label, from: selectText(el, init.val), to: selectText(el, curSnap.val), el });
        } else if (init.kind === 'secret') {
          const iv = init.val, cv = curSnap.val;
          if (iv.startsWith('••••')) {
            if (cv.trim() && !cv.startsWith('••••')) out.push({ label, from: iv, to: T('Yeni değer girildi'), secret: true, el });
          } else if (cv !== iv) {
            const hasNew = !!cv.trim();
            out.push({ label, from: init.disp, to: hasNew ? T('Yeni değer girildi') : '', secret: hasNew, el });
          }
        } else if (init.kind === 'file') {
          if (curSnap.val !== init.val) out.push({ label, from: init.disp, to: curSnap.disp, el });
        } else {
          if (curSnap.val !== init.val) out.push({ label, from: init.disp, to: curSnap.disp, el });
        }
      }
      if (typeof opts.extra === 'function') {
        const ex = opts.extra();
        if (Array.isArray(ex)) for (const x of ex) if (x) out.push(x);
      }
      return out;
    }

    function syncRowEmpty() {
      for (const b of buttons) {
        const p = b.parentElement;
        if (!p || !p.classList) continue;
        const isWrap = p.classList.contains('cardfoot') || p.classList.contains('save-row') || (p.classList.contains('row') && p.classList.contains('end'));
        if (!isWrap) continue;
        const empty = [...p.children].every(ch => ch.hidden || ch.classList.contains('chg-live'));
        p.classList.toggle('save-row-empty', empty);
      }
    }

    function sync() {
      const changes = diff();
      const dirty = changes.length > 0;
      if (root.classList) root.classList.toggle('dirty', dirty);
      for (const b of buttons) b.hidden = showInline ? !dirty : true;
      if (live) {
        const showLive = showInline && dirty;
        const sum = showLive ? summarizeChanges(changes) : null;
        live.hidden = !showLive;
        live.textContent = showLive ? sum.text : '';
        if (showLive) live.setAttribute('title', sum.title);
        else live.removeAttribute('title');
      }
      syncRowEmpty();
      if (typeof opts.onChange === 'function') opts.onChange(changes, dirty);
      return changes;
    }

    function rebaseline(scope) {
      const target = scope || root;
      for (const el of target.querySelectorAll('input, select, textarea')) {
        if (shouldIgnore(el)) snaps.delete(el);
        else snaps.set(el, readSnap(el));
      }
      for (const el of [...snaps.keys()]) {
        if (!el.isConnected || (scope && scope.contains && scope.contains(el) && shouldIgnore(el))) snaps.delete(el);
      }
      return sync();
    }

    function captureNew(scope) {
      const target = scope || root;
      for (const el of [...snaps.keys()]) if (!el.isConnected) snaps.delete(el);
      for (const el of target.querySelectorAll('input, select, textarea')) {
        if (shouldIgnore(el) || snaps.has(el)) continue;
        snaps.set(el, readSnap(el));
      }
      return sync();
    }

    function reset() {
      for (const [el, init] of snaps.entries()) {
        if (!el.isConnected) continue;
        if (init.kind === 'check') el.checked = init.val;
        else if (init.kind === 'file') { try { el.value = ''; } catch (e) {} }
        else {
          el.value = init.raw !== undefined ? init.raw : init.val;
          if (el.type === 'color' && el.nextElementSibling && el.nextElementSibling.tagName === 'CODE') {
            el.nextElementSibling.textContent = el.value;
          }
        }
      }
      if (typeof opts.onReset === 'function') opts.onReset();
      return sync();
    }

    const onEv = () => sync();
    root.addEventListener('input', onEv, false);
    root.addEventListener('change', onEv, false);

    function destroy() {
      root.removeEventListener('input', onEv, false);
      root.removeEventListener('change', onEv, false);
      if (ownsLive && live && live.parentNode) live.remove();
      if (root._tracker === api) delete root._tracker;
    }

    initSnap(root);
    const api = { diff, sync, rebaseline, captureNew, reset, destroy, buttons, live };
    root._tracker = api;
    sync();
    return api;
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
  window.UI = { ask, undo, confirmChanges, summarizeChanges, track, _normInt, _normDec };
})();
