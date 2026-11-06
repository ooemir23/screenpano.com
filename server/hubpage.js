// "Tek QR, çok buton" açılış sayfası: QR /q/kod → /h/kod. Sayfada Menü, Wi-Fi ve işletmenin eklediği bağlantı butonları bulunur.
// Telefon web sayfasından ağa kendiliğinden bağlanamaz: iPhone için Wi-Fi profili (.mobileconfig) verilir, Android'de şifre kopyalanır.
const crypto = require('crypto');
const tenants = require('./tenants');
const qrtrack = require('./qrtrack');
const { plan, access } = require('./plans');

const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const col = (v, d) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : d);

// WIFI:T:WPA;S:ad;P:şifre;; metninden alanları okur
function parseWifi(text) {
  const g = k => { const m = new RegExp('(?:^|;)' + k + ':((?:\\\\.|[^;])*)(?=;)').exec(String(text || '').replace(/^WIFI:/, '')); return m ? m[1].replace(/\\(.)/g, '$1') : ''; };
  return { ssid: g('S'), pass: g('P'), sec: g('T') || 'WPA' };
}

// kod → { t, q, hub, wifi } ; geçersiz/engelli ise null
function resolve(code) {
  code = String(code || '').toLowerCase();
  const e = /^[a-z0-9]{5,12}$/.test(code) ? qrtrack.find(code) : null;
  const t = e && e.kind === 'qr' && tenants.get(e.tid);
  const q = t && (t.db.qrs || []).find(x => x.id === e.id && x.kind === 'hub' && x.code === code);
  if (!q || !q.hub || !access(t).ok) return null;
  const w = q.hub.wifi && (t.db.qrs || []).find(x => x.id === q.hub.wifi && x.kind === 'wifi');
  return { t, q, hub: q.hub, wifi: w ? parseWifi(w.text) : null };
}

function menuHtml(t) {
  if (!plan(t).pro) return '';
  const m = require('./state').menuView(t.db.menu);
  const cats = (m && m.categories || []).filter(c => (c.items || []).length);
  if (!cats.length) return '';
  const cur = m.currency || '₺';
  return cats.map(c => `<h3>${esc(c.name)}</h3>` + c.items.filter(i => !i.off).map(i => `<div class="it"><div class="b"><b>${esc(i.name)}</b>${i.desc ? `<span>${esc(i.desc)}</span>` : ''}</div><div class="pr">${i.was ? `<s>${esc(i.was)}</s> ` : ''}${esc(i.price)}${i.price ? ' ' + esc(cur) : ''}</div></div>`).join('')).join('');
}

function page(req, res) {
  const r = resolve(req.params.code);
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
  if (!r) return res.status(404).type('text/plain; charset=utf-8').send('Sayfa bulunamadı');
  const { t, q, hub, wifi } = r, th = t.db.theme || {};
  const bg = col(th.bg, '#151717'), ac = col(th.accent, '#906538'), ac2 = col(th.accent2, '#c9955c'), tx = col(th.text, '#fbfbfb');
  const menu = hub.menu ? menuHtml(t) : '';
  const logo = t.db.logo ? t.upBase + t.db.logo : '';
  const btns = [];
  if (menu) btns.push(`<button class="btn" data-go="menu"><span>Menü</span><i>›</i></button>`);
  if (wifi && wifi.ssid) btns.push(`<button class="btn" data-go="wifi"><span>Wi-Fi'ye bağlan</span><i>›</i></button>`);
  for (const l of hub.links || []) btns.push(`<a class="btn" href="${esc(l.url)}" rel="noopener"><span>${esc(l.label)}</span><i>↗</i></a>`);
  const wifiBox = wifi && wifi.ssid ? `<section id="s-wifi" hidden><button class="back" data-go="">‹ Geri</button><h2>Wi-Fi</h2>
    <div class="kv"><small>Ağ adı</small><b id="w-ssid">${esc(wifi.ssid)}</b></div>
    ${wifi.sec !== 'nopass' && wifi.pass ? `<div class="kv"><small>Şifre</small><b id="w-pass">${esc(wifi.pass)}</b></div><button class="btn sm" id="w-copy"><span>Şifreyi kopyala</span></button>` : '<p class="note">Bu ağ şifresizdir.</p>'}
    <a class="btn sm ios" id="w-ios" href="${esc(req.baseUrl || '')}/h/${esc(q.code)}/wifi.mobileconfig" hidden><span>iPhone: Wi-Fi profilini yükle</span></a>
    <p class="note" id="w-note">Ağ adını Wi-Fi ayarlarından seçip şifreyi yapıştırın.</p></section>` : '';
  res.type('html').send(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(t.name)}</title>
<style>:root{--bg:${bg};--a:${ac};--a2:${ac2};--tx:${tx}}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(120% 60% at 50% 0,${ac}55,transparent 70%),var(--bg);color:var(--tx);font:16px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;justify-content:center}
main{width:100%;max-width:460px;padding:28px 18px 40px;text-align:center}.logo{max-width:150px;max-height:90px;object-fit:contain;margin:6px auto 14px;display:block}h1{margin:0 0 4px;font-size:26px}.sub{opacity:.75;margin:0 0 24px}
.btn{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;margin:0 0 12px;padding:17px 20px;border-radius:16px;border:1px solid ${ac2}66;background:linear-gradient(135deg,var(--a),${ac}aa);color:#fff;font:700 18px system-ui,sans-serif;text-decoration:none;cursor:pointer;text-align:left}.btn i{font-style:normal;opacity:.8;font-size:22px}.btn.sm{padding:13px 18px;font-size:16px;justify-content:center}
h2{margin:6px 0 16px}h3{margin:22px 0 6px;text-align:left;color:var(--a2);text-transform:uppercase;letter-spacing:.08em;font-size:14px}.it{display:flex;gap:12px;justify-content:space-between;text-align:left;padding:10px 0;border-bottom:1px solid #ffffff1f}.it .b span{display:block;opacity:.65;font-size:13px}.pr{white-space:nowrap;font-weight:700;color:var(--a2)}.pr s{opacity:.5;font-weight:400}
.back{background:none;border:0;color:var(--a2);font:600 16px system-ui;padding:6px 0;margin-bottom:6px;cursor:pointer;display:block}.kv{background:#ffffff14;border-radius:14px;padding:12px 16px;margin:0 0 12px;text-align:left}.kv small{display:block;opacity:.65}.kv b{font-size:20px;word-break:break-all;user-select:all}.note{opacity:.7;font-size:14px}
</style></head><body><main>${logo ? `<img class="logo" src="${esc(logo)}" alt="">` : ''}<h1>${esc(hub.title || t.name)}</h1>${hub.title ? `<p class="sub">${esc(t.name)}</p>` : '<p class="sub"></p>'}
<section id="s-home">${btns.join('')}</section>
${menu ? `<section id="s-menu" hidden><button class="back" data-go="">‹ Geri</button><h2>Menü</h2>${menu}</section>` : ''}${wifiBox}
</main><script>
(function(){var s=['home','menu','wifi'];function go(n){s.forEach(function(k){var e=document.getElementById('s-'+k);if(e)e.hidden=k!==(n||'home')});scrollTo(0,0)}
document.addEventListener('click',function(e){var b=e.target.closest('[data-go]');if(b)go(b.getAttribute('data-go'))});
var ua=navigator.userAgent,ios=/iPhone|iPad|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1),an=/Android/i.test(ua);
var i=document.getElementById('w-ios'),n=document.getElementById('w-note');if(i&&ios){i.hidden=false;n.textContent='Profili yükledikten sonra Ayarlar → Genel → VPN ve Aygıt Yönetimi bölümünden onaylayın; telefon ağa kendisi bağlanır. İsterseniz Wi-Fi ayarlarından ağı seçip şifreyi yapıştırabilirsiniz.'}
else if(an&&n)n.textContent='Şifreyi kopyalayın, Wi-Fi ayarlarında bu ağı seçip şifreyi yapıştırın.';
var c=document.getElementById('w-copy');if(c)c.addEventListener('click',function(){var p=document.getElementById('w-pass').textContent,d=function(){c.firstChild.textContent='Kopyalandı ✓'};
if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(p).then(d,fb);else fb();function fb(){var r=document.createRange();r.selectNode(document.getElementById('w-pass'));getSelection().removeAllRanges();getSelection().addRange(r);try{document.execCommand('copy');d()}catch(e){}}});
})();</script></body></html>`);
}

const x = v => String(v).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const uuid = s => { const h = crypto.createHash('sha1').update(s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`.toUpperCase(); };
function profile(req, res) {
  const r = resolve(req.params.code);
  if (!r || !r.wifi || !r.wifi.ssid) return res.status(404).type('text/plain; charset=utf-8').send('Sayfa bulunamadı');
  const { t, q, wifi } = r, enc = wifi.sec === 'nopass' || !wifi.pass ? 'None' : wifi.sec === 'WEP' ? 'WEP' : 'WPA';
  const id = 'com.screenpano.wifi.' + q.code;
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Content-Type': 'application/x-apple-aspen-config; charset=utf-8', 'Content-Disposition': 'attachment; filename="wifi.mobileconfig"' });
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>PayloadContent</key><array><dict>
<key>PayloadType</key><string>com.apple.wifi.managed</string><key>PayloadVersion</key><integer>1</integer>
<key>PayloadIdentifier</key><string>${id}.net</string><key>PayloadUUID</key><string>${uuid(id + '.net')}</string>
<key>PayloadDisplayName</key><string>Wi-Fi: ${x(wifi.ssid)}</string>
<key>SSID_STR</key><string>${x(wifi.ssid)}</string><key>HIDDEN_NETWORK</key><false/><key>AutoJoin</key><true/>
<key>EncryptionType</key><string>${enc}</string>${enc === 'None' ? '' : `<key>Password</key><string>${x(wifi.pass)}</string>`}
</dict></array>
<key>PayloadType</key><string>Configuration</string><key>PayloadVersion</key><integer>1</integer>
<key>PayloadIdentifier</key><string>${id}</string><key>PayloadUUID</key><string>${uuid(id)}</string>
<key>PayloadDisplayName</key><string>${x(t.name)} Wi-Fi</string><key>PayloadRemovalDisallowed</key><false/>
</dict></plist>`);
}

module.exports = { page, profile, parseWifi };
