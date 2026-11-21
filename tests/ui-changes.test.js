// Arayüz değişiklik takibi ve onay penceresi birim testleri (public/ui.js)
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const UI_SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'ui.js'), 'utf8');

function makeDom() {
  const docListeners = [];

  class ClassList {
    constructor(el) { this.el = el; this.set = new Set(); }
    add(...cls) { cls.filter(Boolean).forEach(c => this.set.add(c)); }
    remove(...cls) { cls.forEach(c => this.set.delete(c)); }
    toggle(c, force) {
      if (force === undefined) {
        if (this.set.has(c)) { this.set.delete(c); return false; }
        this.set.add(c); return true;
      }
      if (force) this.set.add(c); else this.set.delete(c);
      return !!force;
    }
    contains(c) { return this.set.has(c); }
    toString() { return [...this.set].join(' '); }
  }

  class El {
    constructor(tag, opts = {}) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.classList = new ClassList(this);
      this.dataset = Object.assign({}, opts.dataset);
      this.attrs = Object.assign({}, opts.attrs);
      this.listeners = [];
      this.id = opts.id || '';
      this.type = opts.type || '';
      this.value = opts.value != null ? opts.value : '';
      this.checked = !!opts.checked;
      this.disabled = !!opts.disabled;
      this.readOnly = !!opts.readOnly;
      this.hidden = !!opts.hidden;
      this.textContent = opts.textContent || '';
      this.options = opts.options || null;
      this.files = opts.files || null;
      this._innerHTML = '';
      if (opts.className) opts.className.split(/\s+/).forEach(c => this.classList.add(c));
      for (const [k, v] of Object.entries(this.attrs)) {
        if (k.startsWith('data-')) {
          const camel = k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
          this.dataset[camel] = String(v);
        }
      }
    }
    get parentElement() { return this.parentNode && this.parentNode.tagName ? this.parentNode : null; }
    get isConnected() {
      let cur = this;
      while (cur) {
        if (cur === body) return true;
        cur = cur.parentNode;
      }
      return false;
    }
    get innerHTML() { return this._innerHTML; }
    set innerHTML(html) {
      this._innerHTML = String(html || '');
      if (this.id === 'uidlg' && this._innerHTML) {
        const okBtn = new El('button', { attrs: { 'data-ok': '' } });
        const noBtn = new El('button', { attrs: { 'data-no': '' } });
        const inp = /<input\b/.test(this._innerHTML) ? new El('input', { type: 'text' }) : null;
        this._dlgNodes = { okBtn, noBtn, inp };
      } else {
        this._dlgNodes = null;
      }
    }
    hasAttribute(k) {
      if (k === 'disabled') return this.disabled;
      if (k in this.attrs) return true;
      if (k.startsWith('data-')) {
        const camel = k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        return camel in this.dataset;
      }
      return false;
    }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    removeAttribute(k) { delete this.attrs[k]; }
    appendChild(ch) {
      if (ch.parentNode) ch.parentNode.children = ch.parentNode.children.filter(x => x !== ch);
      ch.parentNode = this;
      this.children.push(ch);
      return ch;
    }
    insertBefore(ch, ref) {
      if (ch.parentNode) ch.parentNode.children = ch.parentNode.children.filter(x => x !== ch);
      ch.parentNode = this;
      const idx = ref ? this.children.indexOf(ref) : -1;
      if (idx >= 0) this.children.splice(idx, 0, ch);
      else this.children.push(ch);
      return ch;
    }
    remove() {
      if (this.parentNode) {
        this.parentNode.children = this.parentNode.children.filter(x => x !== this);
        this.parentNode = null;
      }
    }
    addEventListener(t, fn, cap) { this.listeners.push({ t, fn, cap: !!cap }); }
    removeEventListener(t, fn, cap) {
      this.listeners = this.listeners.filter(l => !(l.t === t && l.fn === fn && l.cap === !!cap));
    }
    focus() { document.activeElement = this; }
    select() {}
    click() { if (typeof this.onclick === 'function') this.onclick({ target: this }); }
    matches(sel) {
      return sel.split(',').map(s => s.trim()).some(part => {
        if (part.startsWith('.')) return this.classList.contains(part.slice(1));
        if (part.startsWith('#')) return this.id === part.slice(1);
        if (part.startsWith('[') && part.endsWith(']')) return this.hasAttribute(part.slice(1, -1));
        return this.tagName === part.toUpperCase();
      });
    }
    closest(sel) {
      let cur = this;
      while (cur) {
        if (cur.matches && cur.matches(sel)) return cur;
        cur = cur.parentElement;
      }
      return null;
    }
    querySelectorAll(sel) {
      if (this._dlgNodes) {
        if (sel === '[data-ok]') return [this._dlgNodes.okBtn];
        if (sel === '[data-no]') return [this._dlgNodes.noBtn];
        if (sel === 'input,button') return [this._dlgNodes.inp, this._dlgNodes.noBtn, this._dlgNodes.okBtn].filter(Boolean);
      }
      const out = [];
      const walk = n => {
        for (const c of n.children) {
          if (c.matches(sel)) out.push(c);
          walk(c);
        }
      };
      walk(this);
      return out;
    }
    querySelector(sel) {
      if (this._dlgNodes) {
        if (sel === '[data-ok]') return this._dlgNodes.okBtn;
        if (sel === '[data-no]') return this._dlgNodes.noBtn;
        if (sel === 'input') return this._dlgNodes.inp;
      }
      return this.querySelectorAll(sel)[0] || null;
    }
  }

  const body = new El('body');
  const document = {
    body,
    activeElement: body,
    createElement(tag) { return new El(tag); },
    getElementById(id) { return body.querySelector('#' + id); },
    addEventListener(t, fn, cap) { docListeners.push({ t, fn, cap: !!cap }); },
  };

  function dispatch(target, type, ev = {}) {
    const chain = [];
    for (let cur = target; cur; cur = cur.parentNode) chain.push(cur);
    const e = Object.assign({ type, target, preventDefault() {}, stopPropagation() {} }, ev);
    for (let i = chain.length - 1; i >= 0; i--) {
      for (const l of chain[i].listeners) if (l.t === type && l.cap) l.fn(e);
    }
    const inline = target['on' + type];
    if (typeof inline === 'function') inline.call(target, e);
    for (let i = 0; i < chain.length; i++) {
      for (const l of chain[i].listeners) if (l.t === type && !l.cap) l.fn(e);
    }
  }

  function dispatchDocKey(key) {
    const e = { key, target: body, preventDefault() {}, stopPropagation() {} };
    for (const l of docListeners) if (l.t === 'keydown') l.fn(e);
  }

  const sandbox = {
    window: {},
    document,
    setTimeout,
    clearTimeout,
  };
  sandbox.window.window = sandbox.window;
  sandbox.window.I18N = { t: s => s };
  vm.runInNewContext(UI_SRC, sandbox);
  return { UI: sandbox.window.UI, El, body, document, dispatch, dispatchDocKey };
}

test('summarizeChanges tek, çoklu, gizli, boş ve +N özetlerini üretir', () => {
  const { UI } = makeDom();

  assert.deepStrictEqual({ ...UI.summarizeChanges([]) }, { count: 0, text: '', title: '' });
  assert.deepStrictEqual({ ...UI.summarizeChanges(null) }, { count: 0, text: '', title: '' });

  // Tek kısa değişiklik: eski → yeni gösterir
  const s1 = UI.summarizeChanges([{ label: 'Ek not', from: '', to: 'Kampanya' }]);
  assert.equal(s1.count, 1);
  assert.equal(s1.text, 'Ek not: boş → Kampanya');
  assert.equal(s1.title, '• Ek not: boş → Kampanya');

  // Tek uzun değişiklik: "<alan> değişti" fallback
  const sLong = UI.summarizeChanges([{ label: 'Uzun açıklama alanı', from: 'Birinci çok uzun metin değeri burada yer alıyor', to: 'İkinci çok uzun metin değeri burada yer alıyor' }]);
  assert.equal(sLong.text, 'Uzun açıklama alanı değişti');

  // detail tipi değişiklik
  const sDet = UI.summarizeChanges([{ label: 'Eklenen ligler', detail: 'Süper Lig, 1. Lig' }]);
  assert.equal(sDet.text, 'Eklenen ligler: Süper Lig, 1. Lig');

  // İki ve üç değişiklik (+N daha)
  const s2 = UI.summarizeChanges([
    { label: 'Ad', from: 'A', to: 'B' },
    { label: 'Fiyat', from: '100', to: '150' },
  ]);
  assert.equal(s2.text, 'Ad, Fiyat');

  const s3 = UI.summarizeChanges([
    { label: 'Ad', from: 'A', to: 'B' },
    { label: 'Fiyat', from: '100', to: '150' },
    { label: 'KDV', from: 'Hariç', to: 'Dahil' },
    { label: 'Not', from: '', to: 'Yeni' },
  ]);
  assert.equal(s3.text, 'Ad, Fiyat +2 daha');

  // Secret alan ham değeri sızdırmaz
  const sSec = UI.summarizeChanges([{ label: 'API Anahtarı', from: '••••1234', to: 'super-secret-value', secret: true }]);
  assert.ok(!sSec.text.includes('super-secret-value'));
  assert.ok(!sSec.title.includes('super-secret-value'));
  assert.equal(sSec.text, 'API Anahtarı: ••••1234 → Yeni değer girildi');

  // 16+ değişiklikte title sonunda "+N değişiklik daha"
  const many = Array.from({ length: 18 }, (_, i) => ({ label: `Alan ${i + 1}`, from: '1', to: '2' }));
  const sMany = UI.summarizeChanges(many);
  assert.equal(sMany.count, 18);
  assert.ok(sMany.title.endsWith('+3 değişiklik daha'));
});

test('UI.track değişiklikte Kaydet düğmesini açar, geri alınınca gizler ve normalizasyon uygular', () => {
  const { UI, El, body, dispatch } = makeDom();

  const card = new El('div', { className: 'card' });
  const header = new El('div', { className: 'ch' });
  const hSwitch = new El('input', { type: 'checkbox' });
  header.appendChild(hSwitch);
  card.appendChild(header);

  const lblPrice = new El('label');
  const spPrice = new El('span', { textContent: 'Fiyat' });
  const inpPrice = new El('input', { type: 'text', value: '2.000', dataset: { norm: 'int' } });
  lblPrice.appendChild(spPrice);
  lblPrice.appendChild(inpPrice);
  card.appendChild(lblPrice);

  const inpDec = new El('input', { type: 'text', value: '2500.00', dataset: { norm: 'dec', label: 'Play Fiyatı' } });
  card.appendChild(inpDec);

  const inpSecret = new El('input', { type: 'password', value: '••••abcd', dataset: { secret: '1', label: 'Gizli Anahtar' } });
  card.appendChild(inpSecret);

  const inpIgn = new El('input', { type: 'text', value: 'x', dataset: { noTrack: '1' } });
  card.appendChild(inpIgn);

  const foot = new El('div', { className: 'cardfoot' });
  const saveBtn = new El('button', { attrs: { 'data-save-btn': '' }, hidden: true, textContent: 'Kaydet' });
  foot.appendChild(saveBtn);
  card.appendChild(foot);
  body.appendChild(card);

  const tr = UI.track(card);

  // İlk durum: gizli, dirty yok
  assert.equal(saveBtn.hidden, true);
  assert.equal(card.classList.contains('dirty'), false);
  assert.equal(foot.classList.contains('save-row-empty'), true);
  assert.equal(tr.live.hidden, true);

  // Yalnız biçim farkı (2.000 -> 2000, 2500.00 -> 2500,00) değişiklik sayılmaz
  inpPrice.value = '2000';
  inpDec.value = '2500,00';
  dispatch(inpPrice, 'input');
  assert.equal(saveBtn.hidden, true);

  // .ch içindeki veya data-no-track alan değişimi yok sayılır
  hSwitch.checked = true;
  dispatch(hSwitch, 'change');
  inpIgn.value = 'degisti';
  dispatch(inpIgn, 'input');
  assert.equal(saveBtn.hidden, true);

  // Masked secret boşaltılırsa mevcut anahtar korunacağı için kirlenmez
  inpSecret.value = '   ';
  dispatch(inpSecret, 'input');
  assert.equal(saveBtn.hidden, true);

  // Gerçek değer değişimi düğmeyi ve canlı özeti açar
  inpPrice.value = '2500';
  dispatch(inpPrice, 'input');
  assert.equal(saveBtn.hidden, false);
  assert.equal(card.classList.contains('dirty'), true);
  assert.equal(foot.classList.contains('save-row-empty'), false);
  assert.equal(tr.live.hidden, false);
  assert.equal(tr.live.textContent, 'Fiyat: 2.000 → 2500');

  // Eski değere dönülünce yeniden gizlenir
  inpPrice.value = '2.000';
  dispatch(inpPrice, 'input');
  assert.equal(saveBtn.hidden, true);
  assert.equal(card.classList.contains('dirty'), false);

  // Yeni secret girilince maskeli gösterir, ham değeri sızdırmaz
  inpSecret.value = 'yeni-cok-gizli-123';
  dispatch(inpSecret, 'input');
  assert.equal(saveBtn.hidden, false);
  const diff = tr.diff();
  assert.equal(diff.length, 1);
  assert.equal(diff[0].secret, true);
  assert.equal(diff[0].to, 'Yeni değer girildi');
  assert.ok(!tr.live.textContent.includes('yeni-cok-gizli-123'));

  // reset() tüm değerleri başlangıca döndürür
  tr.reset();
  assert.equal(inpSecret.value, '••••abcd');
  assert.equal(saveBtn.hidden, true);
});

test('UI.track rebaseline(scope), captureNew, extra, inline bubble sırası ve non-masked secret temizlemeyi yönetir', () => {
  const { UI, El, body, dispatch } = makeDom();

  const card = new El('div', { className: 'card' });
  const webBox = new El('div', { id: 'web' });
  const inpWeb = new El('input', { type: 'text', value: '100', dataset: { label: 'Web' } });
  const inpSib = new El('input', { type: 'text', value: '5', dataset: { label: 'Tekrar' } });
  // Inline oninput sibling input'u sıfırladığında sync() kabarcıklama fazında bu değişikliği yakalamalı
  inpWeb.oninput = () => { inpSib.value = '0'; };
  webBox.appendChild(inpWeb);
  webBox.appendChild(inpSib);

  const playBox = new El('div', { id: 'play' });
  const inpPlay = new El('input', { type: 'text', value: '120', dataset: { label: 'Play' } });
  playBox.appendChild(inpPlay);

  const pwBox = new El('div', { id: 'pw' });
  const inpNewPw = new El('input', { type: 'password', value: 'initialpw', dataset: { secret: '1', label: 'Şifre' } });
  pwBox.appendChild(inpNewPw);

  const saveBtn = new El('button', { attrs: { 'data-save-btn': '' }, hidden: true });
  card.appendChild(webBox);
  card.appendChild(playBox);
  card.appendChild(pwBox);
  card.appendChild(saveBtn);
  body.appendChild(card);

  let chipChanged = false;
  const tr = UI.track(card, {
    extra: () => (chipChanged ? [{ label: 'Ligler', detail: 'Süper Lig' }] : []),
  });

  // Inline handler sibling değişikliği kabarcıklama sırasında yakalanır
  inpWeb.value = '200';
  dispatch(inpWeb, 'input');
  assert.equal(tr.diff().length, 2);
  assert.ok(tr.diff().some(c => c.label === 'Tekrar' && c.from === '5' && c.to === '0'));

  // Kısmi rebaseline(webBox): webBox temizlenir ama playBox'taki bekleyen değişiklik korunur
  inpPlay.value = '150';
  dispatch(inpPlay, 'input');
  tr.rebaseline(webBox);
  assert.equal(tr.diff().length, 1);
  assert.equal(tr.diff()[0].label, 'Play');

  // captureNew dinamik eklenen alanı başlangıç olarak ekler, mevcut Play değişikliğini bozmaz
  const dyn = new El('input', { type: 'text', value: 'dyn0', dataset: { label: 'Dinamik' } });
  playBox.appendChild(dyn);
  tr.captureNew(playBox);
  assert.equal(tr.diff().length, 1);
  dyn.value = 'dyn1';
  dispatch(dyn, 'input');
  assert.equal(tr.diff().length, 2);

  // extra diff
  chipChanged = true;
  tr.sync();
  assert.equal(tr.diff().length, 3);

  // Masked olmayan secret temizlenirse secret:false (boş olarak gösterilebilir)
  inpNewPw.value = '';
  dispatch(inpNewPw, 'input');
  const pwDiff = tr.diff().find(c => c.label === 'Şifre');
  assert.ok(pwDiff);
  assert.equal(pwDiff.secret, false);
  assert.equal(pwDiff.to, '');
});

test('UI.confirmChanges boşta false döner, farkları ve uyarıyı işler, onayla true / vazgeç ve Esc ile false döner', async () => {
  const { UI, body, dispatchDocKey } = makeDom();

  // Boş değişiklik dizisinde modal açmadan false döner
  assert.equal(await UI.confirmChanges([]), false);
  assert.equal(body.querySelector('#uidlg'), null);

  // Uyarı ve fark listesi ile onay
  const pOk = UI.confirmChanges([
    { label: 'Başlangıç · Aylık', from: '2000', to: '2500' },
    { label: 'Eklenen ligler', detail: 'Süper Lig' },
  ], { title: 'Fiyatları kaydet', warn: 'Canlı Play fiyatı değişir' });

  const dlg = body.querySelector('#uidlg');
  assert.ok(dlg);
  assert.ok(dlg.classList.contains('on'));
  assert.ok(dlg.innerHTML.includes('Canlı Play fiyatı değişir'));
  assert.ok(dlg.innerHTML.includes('2000'));
  assert.ok(dlg.innerHTML.includes('2500'));
  assert.ok(dlg.innerHTML.includes('Süper Lig'));
  dlg.querySelector('[data-ok]').click();
  assert.equal(await pOk, true);
  assert.equal(dlg.classList.contains('on'), false);

  // Vazgeç
  const pNo = UI.confirmChanges([{ label: 'Ad', from: 'A', to: 'B' }]);
  dlg.querySelector('[data-no]').click();
  assert.equal(await pNo, false);

  // Escape
  const pEsc = UI.confirmChanges([{ label: 'Ad', from: 'A', to: 'B' }]);
  dispatchDocKey('Escape');
  assert.equal(await pEsc, false);
});
