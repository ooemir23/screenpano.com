/* Panel, süper yönetim ve giriş sayfası için çeviri katmanı (tr / en / de / ar).
 * Kaynak dil Türkçedir: sayfalardaki Türkçe metin sözlükte aranır, bulunursa seçili dile çevrilir; bulunamazsa Türkçe kalır.
 * Sözlük: /i18n/<dil>.js (tools/i18n/panel.tsv dosyasından tools/i18n/build.py ile üretilir).
 * Anahtar biçimleri:
 *   - düz metin:                 "Kaydet"
 *   - değişken parça:            "{} dosya yükleniyor ({})…"   ({} = herhangi bir metin; çeviride aynı sırayla kullanılır)
 *   - satır içi etiketli cümle:  "<0>Medya</0> sayfasından eklenir."  (0,1,.. = cümledeki sıra numarası; etiketin kendisi korunur)
 * Yeni bir arayüz metni eklediğinizde tools/i18n/panel.tsv'ye en, de, ar çevirisini de yazın (eksikse Türkçe görünür).
 */
(function () {
  const NAMES = { tr: 'Türkçe', en: 'English', de: 'Deutsch', ar: 'العربية' };
  const LOCALE = { tr: 'tr-TR', en: 'en-GB', de: 'de-DE', ar: 'ar-u-nu-latn' };
  let lang = 'tr';
  try { const s = localStorage.getItem('lang'); if (NAMES[s]) lang = s; } catch (e) {}
  const de = document.documentElement;
  de.lang = lang; de.dir = lang === 'ar' ? 'rtl' : 'ltr';

  let D = {}, PAT = [];
  const norm = s => String(s).replace(/\s+/g, ' ').trim();
  function load() {
    D = window.I18N_DICT || {}; PAT = [];
    for (const k of Object.keys(D)) if (k.includes('{}')) {
      const re = new RegExp('^' + k.split('{}').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.+?)') + '$', 's');
      PAT.push([re, D[k]]);
    }
    PAT.sort((a, b) => b[0].source.length - a[0].source.length); // en uzun (en özel) kalıp önce
  }
  if (lang !== 'tr') {
    try { document.write('<script src="/i18n/' + lang + '.js?v=' + (window.I18N_V || '1') + '"><\/script>'); } catch (e) {}
  }

  function t(s) {
    if (lang === 'tr' || s == null) return s;
    const k = norm(s); if (!k) return s;
    let r = D[k];
    if (r === undefined) {
      for (const [re, tpl] of PAT) { const m = re.exec(k); if (m) { let i = 1; r = tpl.replace(/\{\}/g, () => m[i++] ?? ''); break; } }
    }
    if (r === undefined) { if (I18N.collect) I18N.misses.add(k); return s; }
    return String(s).match(/^\s*/)[0] + r + String(s).match(/\s*$/)[0];
  }

  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'IFRAME', 'SVG', 'svg', 'NOSCRIPT']);
  const INLINE = new Set(['B', 'I', 'A', 'SPAN', 'EM', 'STRONG', 'KBD', 'U', 'SMALL', 'MARK', 'LABEL']);
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  const done = new WeakSet();

  // satır içi etiketli (kalın, bağlantı...) cümleyi bir bütün olarak çevirir
  function mixed(el) {
    const kids = [...el.childNodes]; let text = 0, els = [];
    for (const c of kids) {
      if (c.nodeType === 3) { if (c.nodeValue.trim()) text++; }
      else if (c.nodeType === 1) {
        if (c.tagName === 'BR') continue;
        if (!INLINE.has(c.tagName) || c.children.length) return false;
        els.push(c);
      } else if (c.nodeType !== 8) return false;
    }
    if (!els.length || !text) return false;
    let n = 0, key = '';
    for (const c of kids) {
      if (c.nodeType === 3) key += c.nodeValue;
      else if (c.tagName === 'BR') key += '<br>';
      else if (c.nodeType === 1) key += `<${n++}>${c.textContent}</${n - 1}>`;
    }
    const nk = norm(key), exact = D[nk];
    let r = exact !== undefined ? exact : null;
    if (r === null) for (const [re, tpl] of PAT) { const m = re.exec(nk); if (m) { let i = 1; r = tpl.replace(/\{\}/g, () => m[i++] ?? ''); break; } }
    if (r === null) { if (I18N.collect) I18N.misses.add(nk); return false; } // bütünü çevrilemedi: parçalar tek tek çevrilmeyi dener
    const pad = key.match(/^\s*/)[0], tail = key.match(/\s*$/)[0];
    el.textContent = '';
    if (pad) el.appendChild(document.createTextNode(pad));
    const parts = r.split(/(<\d+>.*?<\/\d+>|<br>)/s);
    for (const p of parts) {
      let m;
      if (p === '<br>') el.appendChild(document.createElement('br'));
      else if ((m = /^<(\d+)>(.*)<\/\1>$/s.exec(p)) && els[+m[1]]) { els[+m[1]].textContent = m[2]; el.appendChild(els[+m[1]]); done.add(els[+m[1]]); }
      else if (p) el.appendChild(document.createTextNode(p));
    }
    if (tail) el.appendChild(document.createTextNode(tail));
    done.add(el);
    return true;
  }

  function walk(node) {
    if (node.nodeType === 3) {
      const p = node.parentNode;
      if (p && !SKIP.has(p.tagName) && !done.has(p) && node.nodeValue.trim()) { const v = t(node.nodeValue); if (v !== node.nodeValue) node.nodeValue = v; }
      return;
    }
    if (node.nodeType !== 1 || SKIP.has(node.tagName) || node.hasAttribute('translate') && node.getAttribute('translate') === 'no') return;
    if (done.has(node) && !node.isConnected) return;
    for (const a of ATTRS) if (node.hasAttribute(a)) { const v = node.getAttribute(a), r = t(v); if (r !== v) node.setAttribute(a, r); }
    if (node.tagName === 'INPUT' && /^(button|submit)$/.test(node.type) && node.value) { const r = t(node.value); if (r !== node.value) node.value = r; }
    if (node.tagName === 'OPTION' && node.label === undefined) { /* option metni alt düğümde çevrilir */ }
    if (mixed(node)) return;
    for (const c of [...node.childNodes]) walk(c);
  }

  let busy = false, obs;
  function apply(root) {
    if (lang === 'tr') return;
    busy = true;
    try { walk(root || document.body); } finally { busy = false; if (obs) obs.takeRecords(); }
  }
  function start() {
    if (lang === 'tr' && !I18N.collect) return;
    load(); apply(document.body); if (document.title) document.title = t(document.title);
    let queued = false; const pending = new Set();
    obs = new MutationObserver(recs => {
      if (busy) return;
      for (const r of recs) {
        if (r.type === 'characterData') pending.add(r.target.parentNode || document.body);
        else if (r.type === 'attributes') pending.add(r.target);
        else for (const n of r.addedNodes) pending.add(n.nodeType === 1 ? n : n.parentNode);
      }
      if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; const l = [...pending]; pending.clear(); for (const n of l) if (n && n.isConnected) { done.delete(n); apply(n); } }); }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  // tarayıcı iletişim kutuları
  const _a = window.alert.bind(window), _c = window.confirm.bind(window), _p = window.prompt.bind(window);
  window.alert = m => _a(t(m));
  window.confirm = m => _c(t(m));
  window.prompt = (m, d) => _p(t(m), d);

  function picker() {
    return `<select class="langsel" aria-label="Language" translate="no" onchange="I18N.set(this.value)">${Object.entries(NAMES).map(([k, v]) => `<option value="${k}"${k === lang ? ' selected' : ''}>${v}</option>`).join('')}</select>`;
  }
  function fill() { for (const el of document.querySelectorAll('[data-langpick]')) el.innerHTML = picker(); }

  window.I18N = {
    lang, t, locale: LOCALE[lang], rtl: lang === 'ar', names: NAMES, picker, misses: window.__I18N_MISSES || new Set(), collect: !!window.__I18N_COLLECT,
    set(l) { try { localStorage.setItem('lang', l); } catch (e) {} location.reload(); },
  };
  const boot = () => { fill(); start(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
