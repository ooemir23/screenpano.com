// Sayfa ↔ yerel uygulama köprüsü (GeckoView'da addJavascriptInterface olmadığından WebExtension mesajlaşmasıyla).
// 1) Sayfa dünyasına SENKRON window.TVNative enjekte eder (tv.html eşdeğer API bekler: getToken, versionCode…)
// 2) Sabit bilgileri (sürüm, cihaz kimliği) yerel taraftan çekip sayfaya yayınlar
// 3) installUpdate / snapshot çağrılarını yerel uygulamaya aktarır
(function () {
  if (window.__tvnInjected) return;
  window.__tvnInjected = 1;

  var pageScript = "(" + function () {
    if (window.TVNative) return;
    window.__tvnSeq = 0;
    window.__tvnWaiters = {};
    window.__tvnCache = { versionName: '', versionCode: 0, hwId: '', model: '' };
    window.addEventListener('message', function (e) {
      var d = e.data;
      if (!d || !d.__tvn) return;
      if (d.info) { for (var k in d.info) window.__tvnCache[k] = d.info[k]; }
      if (d.respId && window.__tvnWaiters[d.respId]) { var w = window.__tvnWaiters[d.respId]; delete window.__tvnWaiters[d.respId]; w(d.data); }
    });
    var send = function (cmd, extra, cb) {
      var m = { __tvn: 1, cmd: cmd };
      if (extra) for (var k in extra) m[k] = extra[k];
      if (cb) { var id = ++window.__tvnSeq; m.id = id; window.__tvnWaiters[id] = cb; }
      window.postMessage(m, '*');
    };
    window.TVNative = {
      isNative: function () { return true; },
      desktop: false,
      getToken: function () { try { return localStorage.getItem('dtoken') || ''; } catch (e) { return ''; } },
      saveToken: function (t) { try { if (t) localStorage.setItem('dtoken', t); else localStorage.removeItem('dtoken'); } catch (e) {} },
      versionName: function () { return window.__tvnCache.versionName || ''; },
      versionCode: function () { return window.__tvnCache.versionCode || 0; },
      hwId: function () { return window.__tvnCache.hwId || ''; },
      model: function () { return window.__tvnCache.model || ''; },
      installUpdate: function (url) { send('installUpdate', { url: String(url || '') }); },
      snapshotAsync: function () { return new Promise(function (res) { send('snapshot', null, function (d) { res(d && d.data ? d.data : ''); }); }); }
    };
  } + ")();";
  var s = document.createElement('script');
  s.textContent = pageScript;
  (document.head || document.documentElement).appendChild(s);

  // sabit bilgiler: yerel taraftan çek, sayfaya yayınla (sayfa ilk kullanana dek hazır olur)
  try {
    browser.runtime.sendNativeMessage('tvnative', { cmd: 'info' }).then(function (r) {
      if (r) window.postMessage({ __tvn: 1, info: r }, '*');
    }, function () {});
  } catch (e) {}

  // sayfa → yerel komutları
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.__tvn !== 1 || !d.cmd) return;
    if (d.cmd === 'installUpdate') {
      try { browser.runtime.sendNativeMessage('tvnative', { cmd: 'installUpdate', url: String(d.url || '') }); } catch (x) {}
    } else if (d.cmd === 'snapshot') {
      var back = function (r) { window.postMessage({ __tvn: 1, respId: d.id, data: r || null }, '*'); };
      try { browser.runtime.sendNativeMessage('tvnative', { cmd: 'snapshot' }).then(back, function () { back(null); }); }
      catch (x) { back(null); }
    }
  });
})();
