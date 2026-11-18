// Tahmin Ligi müşteri sayfası (telefon): kayıt/giriş (e-posta kodu), haftanın maçları ve tahmin formu, puan durumu, kurallar.
// Tek dosya: işletmenin tema renkleriyle sunucuda oluşturulur, veriyi /api/lig/:kod/... uçlarından alır.
function html({ name, logo, code, bg, ac, ac2, tx, esc }) {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><meta name="theme-color" content="${bg}">
<title>${esc(name)} Tahmin Ligi</title>
<style>
:root{--bg:${bg};--a:${ac};--a2:${ac2};--tx:${tx};--mut:color-mix(in srgb,var(--tx) 62%,transparent);--card:color-mix(in srgb,var(--tx) 7%,transparent);--bd:color-mix(in srgb,var(--tx) 14%,transparent);--ok:#3ecf8e;--bad:#ff6b6b}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;min-height:100vh;background:radial-gradient(120% 50% at 50% 0,color-mix(in srgb,var(--a) 45%,transparent),transparent 70%),var(--bg);color:var(--tx);font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:560px;margin:0 auto;padding:18px 14px calc(40px + env(safe-area-inset-bottom))}
header{text-align:center;margin:4px 0 14px}header img{max-width:120px;max-height:64px;object-fit:contain;display:block;margin:0 auto 8px}
header h1{margin:0;font-size:22px;letter-spacing:-.01em}header p{margin:2px 0 0;color:var(--mut);font-size:13px}
.prize{display:flex;gap:10px;align-items:center;background:color-mix(in srgb,var(--a2) 22%,transparent);border:1px solid color-mix(in srgb,var(--a2) 45%,transparent);border-radius:14px;padding:10px 12px;margin:0 0 14px;font-size:14px}
.prize b{color:var(--a2)}.prize .i{font-size:22px}
.tabs{display:flex;gap:6px;background:var(--card);border-radius:12px;padding:4px;margin:0 0 14px;position:sticky;top:6px;z-index:5;backdrop-filter:blur(8px)}
.tabs button{flex:1;border:0;background:none;color:var(--mut);font:600 14px inherit;padding:9px 6px;border-radius:9px}.tabs button.on{background:var(--a2);color:#111}
.card{background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:14px;margin:0 0 12px}
h2{font-size:15px;margin:18px 2px 8px;color:var(--mut);font-weight:700;text-transform:uppercase;letter-spacing:.06em}
label{display:block;font-size:13px;color:var(--mut);margin:10px 0 4px}
input,select{width:100%;font:16px inherit;color:var(--tx);background:color-mix(in srgb,var(--tx) 8%,transparent);border:1px solid var(--bd);border-radius:10px;padding:11px 12px;outline:none}
input:focus,select:focus{border-color:var(--a2)}select option{color:#111}
.btn{display:block;width:100%;border:0;border-radius:12px;padding:13px;font:700 15px inherit;background:var(--a2);color:#111;margin-top:12px;cursor:pointer}.btn:disabled{opacity:.5}
.btn.ghost{background:transparent;color:var(--tx);border:1px solid var(--bd)}.btn.sm{display:inline-block;width:auto;padding:8px 12px;font-size:13px;margin:0}
.err{color:var(--bad);font-size:13px;margin:8px 0 0;min-height:1em}.note{color:var(--mut);font-size:12.5px;margin:8px 0 0}
.chk{display:flex;gap:9px;align-items:flex-start;font-size:13px;color:var(--mut);margin:12px 0 0}.chk input{width:20px;height:20px;flex:none;margin:1px 0 0}
.m-top{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px}
.tm{display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;font-weight:700;font-size:14px;min-width:0}.tm img{width:38px;height:38px;object-fit:contain}
.tm span{overflow-wrap:anywhere}.mid{text-align:center;min-width:70px}.mid .t{font-size:12px;color:var(--mut)}.mid .s{font-size:24px;font-weight:800;letter-spacing:.04em}
.badge{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;background:var(--card);color:var(--mut)}.badge.live{background:var(--bad);color:#fff}.badge.ok{background:color-mix(in srgb,var(--ok) 25%,transparent);color:var(--ok)}
.sc{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;margin-top:12px}.sc .x{font-weight:800;color:var(--mut)}
.step{display:flex;align-items:center;border:1px solid var(--bd);border-radius:12px;overflow:hidden}.step button{width:44px;height:46px;border:0;background:color-mix(in srgb,var(--tx) 8%,transparent);color:var(--tx);font:700 20px inherit}
.step input{border:0;border-radius:0;text-align:center;font-weight:800;font-size:20px;padding:0;height:46px;background:transparent;-moz-appearance:textfield}.step input::-webkit-inner-spin-button{-webkit-appearance:none}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.seg{display:flex;border:1px solid var(--bd);border-radius:12px;overflow:hidden}.seg button{flex:1;border:0;background:transparent;color:var(--mut);font:600 14px inherit;padding:12px 4px}.seg button.on{background:var(--a2);color:#111}
.mine{margin-top:10px;font-size:13.5px}.mine div{display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px dashed var(--bd)}.mine div:last-child{border:0}
.mine .p{font-weight:800}.mine .p.z{color:var(--mut);font-weight:600}.tot{font-size:16px;font-weight:800;color:var(--a2)}
.saved{color:var(--ok);font-size:13px;font-weight:600;margin-top:8px;min-height:1em;text-align:center}
.row{display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center;padding:10px 4px;border-bottom:1px solid var(--bd)}.row:last-child{border:0}
.row .r{font-weight:800;color:var(--mut);text-align:center}.row.me{background:color-mix(in srgb,var(--a2) 16%,transparent);border-radius:10px}.row .n{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.row .v{font-weight:800}
.row.g1 .r{color:#f5c542}.row.g2 .r{color:#c0c7cf}.row.g3 .r{color:#cd8a52}
table{width:100%;border-collapse:collapse;font-size:14px}td{padding:7px 4px;border-bottom:1px solid var(--bd)}td:last-child{text-align:right;font-weight:800}
.empty{text-align:center;color:var(--mut);padding:18px 6px}
.acc{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px;color:var(--mut);margin:-4px 2px 12px}
input[type=date]{min-height:46px;-webkit-appearance:none;appearance:none}
.gbtn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;border:1px solid var(--bd);border-radius:12px;padding:12px;font:700 15px inherit;background:#fff;color:#1f1f1f;margin:12px 0 0;cursor:pointer;text-decoration:none}.gbtn svg{width:20px;height:20px}
.or{display:flex;align-items:center;gap:10px;color:var(--mut);font-size:12px;margin:14px 0 2px}.or:before,.or:after{content:"";flex:1;height:1px;background:var(--bd)}
.noad{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;color:var(--tx);background:color-mix(in srgb,var(--ok) 14%,transparent);border:1px solid color-mix(in srgb,var(--ok) 35%,transparent);border-radius:10px;padding:8px 10px;margin:12px 0 0}
details{font-size:12.5px;color:var(--mut)}details summary{cursor:pointer;color:var(--a2)}
[hidden]{display:none!important}
</style></head><body><main>
<header>${logo ? `<img src="${esc(logo)}" alt="">` : ''}<h1>${esc(name)} Tahmin Ligi</h1><p id="wk">Süper Lig</p></header>
<div class="prize" id="prize" hidden><span class="i">🏆</span><div>Haftanın birincisine: <b id="prizeT"></b></div></div>
<section id="auth" hidden>
  <div class="card" id="a1">
    <b>Katıl, tahmin et, haftanın birincisi ol</b>
    <p class="note">Katılım ücretsizdir. İstediğin maçlara tahmin gir; skor, golcü, asist ve kartlardan puan topla.<span id="ageN"></span></p>
    <a class="gbtn" id="gg" href="#" hidden><svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Google ile devam et</a><div class="or" id="ggOr" hidden>ya da e-posta ile</div>
    <label for="em">E-posta</label><input id="em" type="email" inputmode="email" autocomplete="email" placeholder="ornek@eposta.com">
    <div id="newF"><p class="note">İlk kez katılıyorsan aşağıdakileri de doldur; daha önce katıldıysan e-posta yeter.</p>
    <label for="nk">Takma ad (puan durumunda görünür)</label><input id="nk" maxlength="20" autocomplete="nickname" placeholder="Örn. Aslan10">
    <label for="bd">Doğum tarihi</label><input id="bd" type="date" min="1900-01-01" autocomplete="bday">
    <div class="chk"><input type="checkbox" id="ok"><label for="ok" style="margin:0">Takma adım, e-postam ve doğum tarihimin tahmin ligi ve ödül bildirimi için işlenmesini kabul ediyorum. <details><summary>Aydınlatma metni</summary>
    <p>Veri sorumlusu: ${esc(name)}. İşlenen veriler: takma adınız, e-posta adresiniz, doğum tarihiniz ve tahminleriniz. Amaç: tahmin ligine katılımınız, puan durumunun gösterilmesi (yalnız takma ad), haftanın birincisine ödül bildirimi, yaş sınırı varsa uygunluğun kontrolü. E-posta adresinize yalnız giriş kodu ve birincilik bildirimi gönderilir; reklam, kampanya veya tanıtım e-postası gönderilmez. Verileriniz bu amaç dışında kullanılmaz, üçüncü kişilere satılmaz; hizmet altyapısı ScreenPano tarafından sağlanır. Tahminler yaklaşık bir sezon saklanır. Hesabınızı ve tahminlerinizi bu sayfadan dilediğiniz an silebilirsiniz. KVKK kapsamındaki haklarınız için işletmeye başvurabilirsiniz.</p></details></label></div></div>
    <div class="noad"><span>🔒</span><span>Sana hiçbir reklam, kampanya veya tanıtım e-postası gönderilmez. E-postan yalnız giriş kodu ve birincilik bildirimi için kullanılır.</span></div>
    <button class="btn" id="go">Kod gönder</button><div class="err" id="e1"></div>
  </div>
  <div class="card" id="ag" hidden>
    <b>Son adım</b><p class="note" id="gTo"></p>
    <label for="gnk">Takma ad (puan durumunda görünür)</label><input id="gnk" maxlength="20" autocomplete="nickname" placeholder="Örn. Aslan10">
    <label for="gbd">Doğum tarihi</label><input id="gbd" type="date" min="1900-01-01" autocomplete="bday">
    <div class="chk"><input type="checkbox" id="gok"><label for="gok" style="margin:0">Takma adım, e-postam ve doğum tarihimin tahmin ligi ve ödül bildirimi için işlenmesini kabul ediyorum. <details><summary>Aydınlatma metni</summary>
    <p>Veri sorumlusu: ${esc(name)}. İşlenen veriler: takma adınız, e-posta adresiniz, doğum tarihiniz ve tahminleriniz. Amaç: tahmin ligine katılımınız, puan durumunun gösterilmesi (yalnız takma ad), haftanın birincisine ödül bildirimi, yaş sınırı varsa uygunluğun kontrolü. E-posta adresinize yalnız giriş kodu ve birincilik bildirimi gönderilir; reklam, kampanya veya tanıtım e-postası gönderilmez. Verileriniz bu amaç dışında kullanılmaz, üçüncü kişilere satılmaz; hizmet altyapısı ScreenPano tarafından sağlanır. Tahminler yaklaşık bir sezon saklanır. Hesabınızı ve tahminlerinizi bu sayfadan dilediğiniz an silebilirsiniz. KVKK kapsamındaki haklarınız için işletmeye başvurabilirsiniz.</p></details></label></div>
    <div class="noad"><span>🔒</span><span>Sana hiçbir reklam, kampanya veya tanıtım e-postası gönderilmez. E-postan yalnız giriş kodu ve birincilik bildirimi için kullanılır.</span></div>
    <button class="btn" id="gsv">Katıl</button><button class="btn ghost" id="gcx">Vazgeç</button><div class="err" id="eg"></div>
  </div>
  <div class="card" id="a2" hidden>
    <b>E-postana gelen 6 haneli kodu yaz</b><p class="note" id="sentTo"></p>
    <input id="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" style="text-align:center;font-size:24px;letter-spacing:8px;font-weight:800">
    <button class="btn" id="vf">Giriş yap</button><button class="btn ghost" id="back">E-postayı değiştir</button><div class="err" id="e2"></div>
  </div>
</section>
<div class="acc" id="acc" hidden><span id="accT"></span><span><button class="btn sm ghost" id="out">Çıkış</button></span></div>
<nav class="tabs" id="tabs" hidden><button data-t="m" class="on">Maçlar</button><button data-t="b">Puan durumu</button><button data-t="k">Kurallar</button></nav>
<section id="t-m"></section><section id="t-b" hidden></section>
<section id="t-k" hidden><div class="card"><b>Puanlar</b><table id="ptsT"></table>
  <p class="note">İstediğin maçlara tahmin girersin; maç sayısı zorunlu değildir. Her maçta alanların hepsini doldurman gerekmez, yalnız doldurduklarından puan alırsın. Tahminler maç başlayana kadar değiştirilebilir.</p>
  <p class="note">Hafta Salı'dan Pazartesi'ye kadardır. Haftanın birincisi, o haftanın maçlarından en çok puanı toplayandır. Eşitlikte daha çok tam skor bilen, o da eşitse tahminlerini daha önce tamamlayan öne geçer. Kura veya çekiliş yoktur; katılım ücretsizdir ve alışveriş şartı yoktur.</p>
  <p class="note">Golcü ve asist puanı oyuncunun o maçtaki her golü/asisti için verilir; kendi kalesine atılan gol sayılmaz. Maç sonuçları ve istatistikler maçtan sonra otomatik işlenir. Ertelenen maçtan puan çıkmaz.</p>
  <button class="btn ghost" id="del" hidden>Hesabımı ve tahminlerimi sil</button></div></section>
</main>
<script>
(() => {
const CODE = ${JSON.stringify(code)}, API = '/api/lig/' + CODE, KEY = 'lig_' + CODE;
const $ = id => document.getElementById(id);
const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let tok = ''; try { tok = localStorage.getItem(KEY) || ''; } catch (e) {}
let S = null, tab = 'm', bView = 'week', email = '', gTok = '';
const SQ = {}, draft = {};
async function api(method, p, body) {
  const r = await fetch(API + p, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) { const e = new Error(j.error || 'Bağlantı hatası'); e.status = r.status; throw e; }
  return j;
}
const DAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const when = ms => { const d = new Date(ms); return DAYS[d.getDay()] + ' ' + d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); };
function render() {
  if (!S) return;
  $('wk').textContent = 'Süper Lig · ' + S.week.label + ' haftası';
  $('prize').hidden = !S.prize; $('prizeT').textContent = S.prize;
  const inn = !!S.me;
  $('auth').hidden = inn; $('tabs').hidden = !inn; $('acc').hidden = !inn; $('del').hidden = !inn;
  $('gg').hidden = $('ggOr').hidden = !S.google;
  $('ageN').textContent = S.minAge ? ' ' + S.minAge + ' yaş ve üzeri katılabilir.' : '';
  if (!inn && gTok) { $('a1').hidden = true; $('a2').hidden = true; $('ag').hidden = false; }
  if (inn) $('accT').textContent = S.me.nick + ' · ' + S.me.email;
  for (const b of $('tabs').children) b.classList.toggle('on', b.dataset.t === tab);
  $('t-m').hidden = !inn || tab !== 'm'; $('t-b').hidden = inn ? tab !== 'b' : false; $('t-k').hidden = inn ? tab !== 'k' : false;
  const P = S.pts;
  $('ptsT').innerHTML = [['Tam skor', P.exact], ['Doğru sonuç (1 / X / 2)', P.result], ['Golcü: her golü', P.goal], ['Asist: her asisti', P.assist], ['Sarı kart sayısı tam', P.yellow], ['Kırmızı kart çıkar / çıkmaz', P.red]].map(([a, b]) => '<tr><td>' + a + '</td><td>' + b + ' puan</td></tr>').join('');
  if (inn) renderMatches();
  renderBoard();
}
function pickRows(m) {
  const p = m.pick, o = m.pts; if (!p) return '<div class="note">Bu maça tahmin girmedin.</div>';
  const pp = v => o ? '<span class="p' + (v ? '' : ' z') + '">' + (v ? '+' + v : '0') + '</span>' : '<span class="p z">–</span>';
  let h = '<div class="mine">';
  if (p.h != null) h += '<div><span>Skor: ' + p.h + ' – ' + p.a + '</span>' + pp(o && o.score) + '</div>';
  if (p.g) h += '<div><span>Golcü: ' + E(p.gn || '') + '</span>' + pp(o && o.goal) + '</div>';
  if (p.as) h += '<div><span>Asist: ' + E(p.asn || '') + '</span>' + pp(o && o.assist) + '</div>';
  if (p.yc != null) h += '<div><span>Sarı kart: ' + p.yc + (m.res ? ' (maçta ' + m.res.yc + ')' : '') + '</span>' + pp(o && o.yellow) + '</div>';
  if (p.rc != null) h += '<div><span>Kırmızı kart: ' + (p.rc ? 'çıkar' : 'çıkmaz') + (m.res ? ' (maçta ' + m.res.rc + ')' : '') + '</span>' + pp(o && o.red) + '</div>';
  if (o) h += '<div><b>Bu maçtan</b><span class="tot">' + o.total + ' puan</span></div>';
  return h + '</div>';
}
function matchCard(m) {
  const d = draft[m.id] || (draft[m.id] = m.pick ? { ...m.pick } : {});
  const st = m.st === 'in' ? '<span class="badge live">Canlı</span>' : m.st === 'post' ? '<span class="badge">Bitti</span>' : m.st === 'off' ? '<span class="badge">Ertelendi</span>' : '';
  const mid = m.sc ? '<div class="s">' + m.sc[0] + ' – ' + m.sc[1] + '</div>' + st : '<div class="t">' + when(m.at) + '</div>' + (m.pick ? '<span class="badge ok">Tahmin var</span>' : '');
  let h = '<div class="card" data-m="' + m.id + '"><div class="m-top"><div class="tm">' + (m.home.logo ? '<img src="' + E(m.home.logo) + '" alt="">' : '') + '<span>' + E(m.home.name) + '</span></div><div class="mid">' + mid + '</div><div class="tm">' + (m.away.logo ? '<img src="' + E(m.away.logo) + '" alt="">' : '') + '<span>' + E(m.away.name) + '</span></div></div>';
  if (m.locked) return h + pickRows(m) + '</div>';
  const stp = (k, v, max) => '<div class="step"><button type="button" data-st="' + k + '" data-d="-1">−</button><input data-f="' + k + '" inputmode="numeric" value="' + (v == null ? '' : v) + '" placeholder="–" maxlength="2"><button type="button" data-st="' + k + '" data-d="1">+</button></div>';
  h += '<label>Skor</label><div class="sc">' + stp('h', d.h) + '<span class="x">–</span>' + stp('a', d.a) + '</div>';
  const sq = SQ[m.id];
  const opts = sel => !sq ? '<option value="">Kadro yükleniyor…</option>' : '<option value="">Seçme</option>' + [sq.home, sq.away].map(t => '<optgroup label="' + E(t.name) + '">' + t.players.filter(p => p.pos !== 'G').map(p => '<option value="' + p.id + '"' + (sel === p.id ? ' selected' : '') + '>' + E(p.name) + '</option>').join('') + '</optgroup>').join('');
  h += '<div class="two"><div><label>Golcü</label><select data-f="g">' + opts(d.g) + '</select></div><div><label>Asist</label><select data-f="as">' + opts(d.as) + '</select></div></div>';
  h += '<div class="two"><div><label>Sarı kart (toplam)</label>' + stp('yc', d.yc) + '</div><div><label>Kırmızı kart</label><div class="seg"><button type="button" data-rc="1" class="' + (d.rc === true ? 'on' : '') + '">Çıkar</button><button type="button" data-rc="0" class="' + (d.rc === false ? 'on' : '') + '">Çıkmaz</button></div></div></div>';
  h += '<button class="btn" data-save="' + m.id + '">' + (m.pick ? 'Tahmini güncelle' : 'Tahmini kaydet') + '</button><div class="saved" data-ok="' + m.id + '"></div><div class="err" data-er="' + m.id + '"></div></div>';
  if (!sq) loadSquad(m.id);
  return h;
}
async function loadSquad(id) {
  if (SQ[id] === 0) return; SQ[id] = 0;
  try { SQ[id] = await api('GET', '/squad/' + id); } catch (e) { SQ[id] = { home: { name: '', players: [] }, away: { name: '', players: [] } }; }
  const el = document.querySelector('[data-m="' + id + '"]'); if (el) { const all = [...S.matches, ...(S.next ? S.next.matches : [])], m = all.find(x => x.id === id); if (m) el.outerHTML = matchCard(m); }
}
function renderMatches() {
  const open = S.matches.filter(m => !m.locked), done = S.matches.filter(m => m.locked);
  let h = '';
  if (!S.matches.length && !S.next) h = '<div class="card empty">Bu hafta Süper Lig maçı yok.</div>';
  if (open.length) h += '<h2>Tahmin açık</h2>' + open.map(matchCard).join('');
  if (S.next && S.next.matches.length) h += '<h2>Gelecek hafta · ' + E(S.next.label) + '</h2>' + S.next.matches.map(matchCard).join('');
  if (done.length) h += '<h2>Başlayan / biten maçlar</h2>' + done.slice().reverse().map(matchCard).join('');
  $('t-m').innerHTML = h;
}
function renderBoard() {
  const b = S.board, list = bView === 'week' ? b.week : b.all, me = bView === 'week' ? b.weekMe : b.allMe;
  let h = '<div class="seg" style="margin:0 0 12px"><button data-bv="week" class="' + (bView === 'week' ? 'on' : '') + '">Bu hafta</button><button data-bv="all" class="' + (bView === 'all' ? 'on' : '') + '">Genel</button></div><div class="card">';
  if (S.last) h += '<p class="note" style="margin:0 0 8px">🏆 Geçen haftanın birincisi: <b>' + E(S.last.nick) + '</b> (' + S.last.pts + ' puan)</p>';
  h += list.length ? list.map(r => '<div class="row' + (r.me ? ' me' : '') + (r.rank <= 3 ? ' g' + r.rank : '') + '"><span class="r">' + r.rank + '</span><span class="n">' + E(r.nick) + '</span><span class="v">' + r.pts + '</span></div>').join('') : '<div class="empty">Henüz puan yok. İlk tahmini sen gir!</div>';
  if (me && !list.some(r => r.me)) h += '<div class="row me"><span class="r">' + me.rank + '</span><span class="n">' + E(me.nick) + ' (sen)</span><span class="v">' + me.pts + '</span></div>';
  $('t-b').innerHTML = h + '</div>';
}
async function load() {
  try { S = await api('GET', '/state'); }
  catch (e) { if (e.status === 404) { document.body.innerHTML = '<main><div class="card empty">' + E(e.message) + '</div></main>'; return; } throw e; }
  if (!S.me && tok) { tok = ''; try { localStorage.removeItem(KEY); } catch (e) {} }
  render();
}
// --- giriş ---
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); $('bd').max = $('gbd').max = today;
// Google dönüşü: #tk= oturum, #gs= kayıt belirteci, #gerr= hata (adres çubuğundan hemen silinir)
function onHash() {
  const h = new URLSearchParams(location.hash.slice(1)); if (!/(^|&)(tk|gs|gerr)=/.test(location.hash.slice(1))) return false;
  history.replaceState(null, '', location.pathname + location.search);
  if (/^[a-f0-9]{64}$/.test(h.get('tk') || '')) { tok = h.get('tk'); try { localStorage.setItem(KEY, tok); } catch (e) {} }
  if (h.get('gs')) { gTok = h.get('gs'); $('gTo').textContent = (h.get('ge') || '') + ' ile katılıyorsun.'; }
  const ge = h.get('gerr');
  if (ge) setTimeout(() => { $('e1').textContent = { cancel: 'Google girişi iptal edildi.', unverified: 'Google hesabının e-postası doğrulanmamış.', kapatildi: 'Bu hesap işletme tarafından kapatıldı.', limit: 'Çok fazla deneme; biraz sonra tekrar dene.' }[ge] || 'Google ile giriş yapılamadı; e-posta ile devam edebilirsin.'; }, 0);
  return true;
}
onHash();
addEventListener('hashchange', () => { if (onHash()) load().catch(() => {}); });
$('gg').onclick = e => { e.preventDefault(); location.href = '/api/auth/google/lig/' + encodeURIComponent(CODE); };
$('gsv').onclick = async () => {
  $('eg').textContent = ''; $('gsv').disabled = true;
  try { const j = await api('POST', '/gsignup', { gt: gTok, nick: $('gnk').value.trim(), bd: $('gbd').value, consent: $('gok').checked }); tok = j.token; gTok = ''; try { localStorage.setItem(KEY, tok); } catch (e) {} $('ag').hidden = true; $('a1').hidden = false; tab = 'm'; await load(); }
  catch (e) { $('eg').textContent = e.message; if (/süresi doldu/.test(e.message)) { gTok = ''; } }
  $('gsv').disabled = false;
};
$('gcx').onclick = () => { gTok = ''; $('ag').hidden = true; $('a1').hidden = false; };
$('em').addEventListener('input', () => { $('e1').textContent = ''; });
$('go').onclick = async () => {
  email = $('em').value.trim(); $('e1').textContent = ''; $('go').disabled = true;
  try { const j = await api('POST', '/start', { email, nick: $('nk').value.trim(), bd: $('bd').value, consent: $('ok').checked }); $('a1').hidden = true; $('a2').hidden = false; $('sentTo').textContent = email + ' adresine gönderildi. Gelen kutunda yoksa istenmeyen klasörüne bak.'; $('otp').focus(); }
  catch (e) { $('e1').textContent = e.message; }
  $('go').disabled = false;
};
$('back').onclick = () => { $('a2').hidden = true; $('a1').hidden = false; };
$('vf').onclick = async () => {
  $('e2').textContent = ''; $('vf').disabled = true;
  try { const j = await api('POST', '/verify', { email, otp: $('otp').value }); tok = j.token; try { localStorage.setItem(KEY, tok); } catch (e) {} tab = 'm'; await load(); }
  catch (e) { $('e2').textContent = e.message; }
  $('vf').disabled = false;
};
$('otp').addEventListener('input', () => { if ($('otp').value.replace(/\\D/g, '').length === 6) $('vf').click(); });
$('out').onclick = async () => { try { await api('POST', '/logout'); } catch (e) {} tok = ''; try { localStorage.removeItem(KEY); } catch (e) {} load(); };
$('del').onclick = async () => { if (!confirm('Hesabın ve tüm tahminlerin silinecek. Emin misin?')) return; try { await api('DELETE', '/me'); } catch (e) {} tok = ''; try { localStorage.removeItem(KEY); } catch (e) {} load(); };
$('tabs').onclick = e => { const b = e.target.closest('button[data-t]'); if (!b) return; tab = b.dataset.t; render(); scrollTo(0, 0); };
// --- tahmin formu ---
document.addEventListener('click', async e => {
  const bv = e.target.closest('[data-bv]'); if (bv) { bView = bv.dataset.bv; renderBoard(); return; }
  const card = e.target.closest('[data-m]'); if (!card) return; const id = card.dataset.m, d = draft[id] || (draft[id] = {});
  const st = e.target.closest('[data-st]');
  if (st) { const k = st.dataset.st, inp = card.querySelector('[data-f="' + k + '"]'); let v = inp.value === '' ? (+st.dataset.d > 0 ? -1 : 1) : +inp.value; v = Math.max(0, Math.min(k === 'yc' ? 15 : 15, v + +st.dataset.d)); inp.value = v; d[k] = v; return; }
  const rc = e.target.closest('[data-rc]');
  if (rc) { const v = rc.dataset.rc === '1'; d.rc = d.rc === v ? undefined : v; for (const b of card.querySelectorAll('[data-rc]')) b.classList.toggle('on', d.rc === (b.dataset.rc === '1')); return; }
  const sv = e.target.closest('[data-save]');
  if (sv) {
    const er = card.querySelector('[data-er]'), ok = card.querySelector('[data-ok]'); er.textContent = ''; ok.textContent = '';
    if ((d.h == null) !== (d.a == null)) { er.textContent = 'Skor için iki takımın golünü de yaz'; return; }
    const nm = sel => { const o = card.querySelector('[data-f="' + sel + '"]'); return o && o.selectedIndex > 0 ? o.options[o.selectedIndex].text : ''; };
    sv.disabled = true;
    try {
      const j = await api('POST', '/pick', { mid: id, h: d.h, a: d.a, g: d.g || '', gn: nm('g'), as: d.as || '', asn: nm('as'), yc: d.yc, rc: d.rc });
      const all = [...S.matches, ...(S.next ? S.next.matches : [])], m = all.find(x => x.id === id); if (m) m.pick = j.pick;
      ok.textContent = j.pick ? 'Kaydedildi ✓' : 'Tahmin silindi'; sv.textContent = j.pick ? 'Tahmini güncelle' : 'Tahmini kaydet';
    } catch (x) { er.textContent = x.message; if (x.status === 409) setTimeout(load, 1200); }
    sv.disabled = false;
  }
});
document.addEventListener('input', e => {
  const f = e.target.closest('[data-f]'), card = e.target.closest('[data-m]'); if (!f || !card) return;
  const d = draft[card.dataset.m] || (draft[card.dataset.m] = {}), k = f.dataset.f;
  if (f.tagName === 'SELECT') d[k] = f.value || undefined;
  else { const v = f.value.replace(/\\D/g, '').slice(0, 2); f.value = v; d[k] = v === '' ? undefined : Math.min(15, +v); }
});
document.addEventListener('change', e => { const f = e.target.closest('select[data-f]'), card = e.target.closest('[data-m]'); if (f && card) { (draft[card.dataset.m] || (draft[card.dataset.m] = {}))[f.dataset.f] = f.value || undefined; } });
load().catch(e => { document.body.insertAdjacentHTML('beforeend', '<p class="err" style="text-align:center">' + E(e.message) + '</p>'); });
setInterval(() => { if (document.visibilityState === 'visible' && S && S.me && !document.activeElement.closest('[data-m]')) load().catch(() => {}); }, 60000);
})();
</script></body></html>`;
}
module.exports = { html };
