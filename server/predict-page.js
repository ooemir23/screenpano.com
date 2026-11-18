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
.gls{margin-top:12px;display:flex;flex-direction:column;gap:10px}
.gsd{border:1px solid var(--bd);border-radius:14px;padding:10px;background:color-mix(in srgb,var(--tx) 4%,transparent)}
.gsd h4{margin:0 0 8px;font-size:13px;display:flex;align-items:center;gap:8px}.gsd h4 img{width:20px;height:20px;object-fit:contain}.gsd h4 span{color:var(--mut);font-weight:600;margin-left:auto;font-size:12px}
.gsl{display:grid;grid-template-columns:28px 1fr;gap:8px;align-items:start}.gsl+.gsl{margin-top:10px;padding-top:10px;border-top:1px dashed var(--bd)}.gsl .bt{display:flex;flex-direction:column;gap:6px;min-width:0}.gsl .no{margin-top:9px}
.gsl .no{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:13px;background:var(--a2);color:#111;font-weight:800}
.pkb{display:flex;align-items:center;gap:7px;min-width:0;width:100%;text-align:left;border:1px dashed var(--bd);background:transparent;color:var(--mut);border-radius:10px;padding:8px 9px;font:600 13px inherit;cursor:pointer;min-height:44px}
.pkb.on{border-style:solid;border-color:color-mix(in srgb,var(--a2) 60%,transparent);background:color-mix(in srgb,var(--a2) 14%,transparent);color:var(--tx)}
.pkb .ic{flex:none;font-size:14px}.pkb .nr{flex:none;font-weight:800;color:var(--mut);font-size:12px;min-width:22px;text-align:right}.pkb.a{min-height:38px;padding:6px 9px;font-size:12.5px}.pkb .tx{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pkb small{display:block;font-size:10.5px;color:var(--mut);font-weight:700;letter-spacing:.04em}
.ps{flex:none;font-size:10px;font-weight:800;letter-spacing:.04em;padding:2px 6px;border-radius:6px;color:#fff}
.ps.F{background:#e5484d}.ps.M{background:#30a46c}.ps.D{background:#3e63dd}.ps.G{background:#f5a524;color:#111}.ps.X{background:#666}
.hint{font-size:12.5px;color:var(--mut);text-align:center;padding:4px 0 0}
#sheet{position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;justify-content:flex-end;background:rgba(0,0,0,.55);backdrop-filter:blur(3px)}
#sheet .sh{background:var(--bg);border-top:1px solid var(--bd);border-radius:20px 20px 0 0;max-height:86vh;display:flex;flex-direction:column;box-shadow:0 -10px 40px rgba(0,0,0,.5);max-width:560px;width:100%;margin:0 auto}
#sheet .hd{padding:10px 16px 10px;border-bottom:1px solid var(--bd)}#sheet .grab{width:42px;height:5px;border-radius:9px;background:var(--bd);margin:0 auto 10px}
#sheet .tt{display:flex;align-items:center;gap:10px}#sheet .tt img{width:30px;height:30px;object-fit:contain}#sheet .tt b{font-size:16px;display:block}#sheet .tt small{color:var(--mut);font-size:12.5px}
#sheet .x{margin-left:auto;width:36px;height:36px;border-radius:50%;border:0;background:var(--card);color:var(--tx);font-size:20px}
#sheet input{margin-top:10px}
#sheet .ls{overflow:auto;padding:4px 10px calc(16px + env(safe-area-inset-bottom));-webkit-overflow-scrolling:touch}
#sheet .gp{font-size:11.5px;font-weight:800;letter-spacing:.1em;color:var(--mut);text-transform:uppercase;padding:12px 6px 6px;display:flex;align-items:center;gap:8px}
#sheet .pl{display:flex;align-items:center;gap:12px;width:100%;border:0;background:transparent;color:var(--tx);padding:9px 8px;border-radius:12px;font:600 15px inherit;text-align:left;cursor:pointer}
#sheet .pl:active,#sheet .pl.sel{background:color-mix(in srgb,var(--a2) 16%,transparent)}#sheet .pl:disabled{opacity:.35}
#sheet .jn{flex:none;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:14px;background:color-mix(in srgb,var(--tx) 10%,transparent);border:2px solid var(--bd)}
#sheet .pl.sel .jn{background:var(--a2);color:#111;border-color:var(--a2)}
#sheet .pn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#sheet .ck{color:var(--a2);font-weight:900}
#sheet .clr{color:var(--bad)}
[hidden]{display:none!important}
</style></head><body><main>
<header>${logo ? `<img src="${esc(logo)}" alt="">` : ''}<h1>${esc(name)} Tahmin Ligi</h1><p id="wk">Süper Lig</p></header>
<div class="prize" id="prize" hidden><span class="i">🏆</span><div>Haftanın birincisine: <b id="prizeT"></b></div></div>
<section id="auth" hidden>
  <div class="card" id="a1">
    <b id="a1T">Katıl, tahmin et, haftanın birincisi ol</b>
    <p class="note" id="a1N"></p>
    <a class="gbtn" id="gg" href="#"><svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg><span id="ggT">Google ile devam et</span></a>
    <div class="err" id="e1"></div>
  </div>
  <div class="card" id="ag" hidden>
    <b>Son adım</b><p class="note" id="gTo"></p>
    <div class="two"><div><label for="gad">Ad</label><input id="gad" maxlength="30" autocomplete="given-name"></div><div><label for="gsy">Soyad</label><input id="gsy" maxlength="30" autocomplete="family-name"></div></div>
    <label for="gbd">Doğum tarihi</label><input id="gbd" type="date" min="1900-01-01" autocomplete="bday">
    <p class="note" id="nkP"></p>
    <div class="chk"><input type="checkbox" id="gok"><label for="gok" style="margin:0">Adımın, soyadımın, e-postamın ve doğum tarihimin tahmin ligi için işlenmesini kabul ediyorum. <details><summary>Aydınlatma metni</summary>
    <p>Veri sorumlusu: ${esc(name)}. İşlenen veriler: adınız, soyadınız, Google hesabınızın e-posta adresi, doğum tarihiniz ve tahminleriniz. Puan durumunda yalnız adınız ve soyadınızın baş harfinden oluşan kullanıcı adı görünür. Amaç: tahmin ligine katılımınız, puan durumunun gösterilmesi, haftanın birincisine ödül bildirimi, yaş sınırı varsa uygunluğun kontrolü. E-posta adresinize yalnız haftalık puan durumu ve birincilik bildirimi gönderilir (dilediğiniz an kapatabilirsiniz); reklam, kampanya veya tanıtım e-postası gönderilmez. Verileriniz bu amaç dışında kullanılmaz, üçüncü kişilere satılmaz; hizmet altyapısı ScreenPano tarafından sağlanır. Tahminler yaklaşık bir sezon saklanır. Hesabınızı ve tahminlerinizi bu sayfadan dilediğiniz an silebilirsiniz. KVKK kapsamındaki haklarınız için işletmeye başvurabilirsiniz.</p></details></label></div>
    <div class="noad"><span>🔒</span><span>Sana hiçbir reklam, kampanya veya tanıtım e-postası gönderilmez. E-postana yalnız haftalık puan durumu gelir; istediğin an kapatabilirsin.</span></div>
    <button class="btn" id="gsv">Katıl</button><div class="err" id="eg"></div>
  </div>
</section>
<div class="acc" id="acc" hidden><span id="accT"></span><span><button class="btn sm ghost" id="out">Çıkış</button></span></div>
<label class="acc" id="mailR" hidden style="justify-content:flex-start;cursor:pointer"><input type="checkbox" id="mailC" style="width:18px;height:18px;margin:0"> Haftalık puan durumu e-postası</label>
<nav class="tabs" id="tabs" hidden><button data-t="m" class="on">Maçlar</button><button data-t="b">Puan durumu</button><button data-t="k">Kurallar</button></nav>
<section id="t-m"></section><section id="t-b" hidden></section>
<section id="t-k" hidden><div class="card"><b>Puanlar</b><table id="ptsT"></table>
  <p class="note">İstediğin maçlara tahmin girersin; maç sayısı zorunlu değildir. Her maçta alanların hepsini doldurman gerekmez, yalnız doldurduklarından puan alırsın. Tahminler maç başlayana kadar değiştirilebilir.</p>
  <p class="note">Hafta Salı'dan Pazartesi'ye kadardır. Haftanın birincisi, o haftanın maçlarından en çok puanı toplayandır. Eşitlikte daha çok tam skor bilen, o da eşitse tahminlerini daha önce tamamlayan öne geçer. Kura veya çekiliş yoktur; katılım ücretsizdir ve alışveriş şartı yoktur.</p>
  <p class="note">Skoru kaç gol tahmin edersen o kadar golcü ve asist seçebilirsin; her golün golcüsü ve asisti yalnız o golü atan takımdan seçilir. Aynı oyuncuyu birden çok gole yazabilirsin; oyuncu maçta kaç gol attıysa (asist yaptıysa) o kadarı puan alır. Kendi kalesine atılan gol sayılmaz. Maç sonuçları ve istatistikler maçtan sonra otomatik işlenir. Ertelenen maçtan puan çıkmaz.</p>
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
  if (!inn) authView();
  $('mailR').hidden = !inn; if (inn) $('mailC').checked = S.me.mail !== false;
  if (inn) $('accT').textContent = S.me.nick + ' · ' + S.me.email;
  for (const b of $('tabs').children) b.classList.toggle('on', b.dataset.t === tab);
  $('t-m').hidden = !inn || tab !== 'm'; $('t-b').hidden = inn ? tab !== 'b' : false; $('t-k').hidden = inn ? tab !== 'k' : false;
  const P = S.pts;
  $('ptsT').innerHTML = [['Tam skor', P.exact], ['Doğru sonuç (1 / X / 2)', P.result], ['Her doğru golcü', P.goal], ['Her doğru asist', P.assist], ['Sarı kart sayısı tam', P.yellow], ['Kırmızı kart çıkar / çıkmaz', P.red]].map(([a, b]) => '<tr><td>' + a + '</td><td>' + b + ' puan</td></tr>').join('');
  if (inn) renderMatches();
  renderBoard();
}
const POS = { F: ['FV', 'Forvetler'], M: ['OS', 'Orta sahalar'], D: ['DF', 'Defans oyuncuları'], G: ['KL', 'Kaleciler'] };
const psChip = p => '<span class="ps ' + (POS[p] ? p : 'X') + '">' + (POS[p] ? POS[p][0] : '–') + '</span>';
function pickRows(m) {
  const p = m.pick, o = m.pts; if (!p) return '<div class="note">Bu maça tahmin girmedin.</div>';
  const pp = v => o ? '<span class="p' + (v ? '' : ' z') + '">' + (v ? '+' + v : '0') + '</span>' : '<span class="p z">–</span>';
  let h = '<div class="mine">';
  if (p.h != null) h += '<div><span>Skor: ' + p.h + ' – ' + p.a + '</span>' + pp(o && o.score) + '</div>';
  const gl = p.gl || (p.g || p.as ? [{ g: p.g, gn: p.gn, a: p.as, an: p.asn }] : []);
  gl.forEach((x, i) => {
    const sl = o && o.slots ? o.slots[i] : null, tm = x.s ? (x.s === 'h' ? m.home.name : m.away.name) : '';
    if (x.g) h += '<div><span>⚽ ' + E(x.gn || '') + (tm ? ' <small style="color:var(--mut)">(' + E(tm) + ')</small>' : '') + '</span>' + pp(sl && sl.g) + '</div>';
    if (x.a) h += '<div><span>👟 Asist: ' + E(x.an || '') + '</span>' + pp(sl && sl.a) + '</div>';
  });
  if (p.yc != null) h += '<div><span>Sarı kart: ' + p.yc + (m.res ? ' (maçta ' + m.res.yc + ')' : '') + '</span>' + pp(o && o.yellow) + '</div>';
  if (p.rc != null) h += '<div><span>Kırmızı kart: ' + (p.rc ? 'çıkar' : 'çıkmaz') + (m.res ? ' (maçta ' + m.res.rc + ')' : '') + '</span>' + pp(o && o.red) + '</div>';
  if (o) h += '<div><b>Bu maçtan</b><span class="tot">' + o.total + ' puan</span></div>';
  return h + '</div>';
}
const allM = () => [...S.matches, ...(S.next ? S.next.matches : [])];
const plOf = (mid, side, id) => { const sq = SQ[mid]; if (!sq || !id) return null; return (sq[side === 'h' ? 'home' : 'away'].players || []).find(x => x.id === id) || null; };
// skor kadar gol kutusu: her kutuda golcü + asist; yalnız golü atan takımın oyuncuları
function goalsHtml(m, d) {
  const n = { h: d.h || 0, a: d.a || 0 };
  d.gl = (d.gl || []).filter(x => x && (x.s === 'h' || x.s === 'a'));
  for (const side of ['h', 'a']) { const k = d.gl.filter(x => x.s === side); if (k.length > n[side]) d.gl = d.gl.filter(x => x.s !== side || k.indexOf(x) < n[side]); }
  if (d.h == null || d.a == null) return '<div class="hint">Golcü ve asist seçmek için önce skoru yaz.</div>';
  if (!n.h && !n.a) return '<div class="hint">Golsüz tahminde golcü ve asist seçilmez.</div>';
  let h = '';
  for (const side of ['h', 'a']) {
    if (!n[side]) continue;
    const tm = side === 'h' ? m.home : m.away, own = d.gl.filter(x => x.s === side);
    h += '<div class="gsd"><h4>' + (tm.logo ? '<img src="' + E(tm.logo) + '" alt="">' : '') + E(tm.name) + ' golleri<span>' + n[side] + ' gol</span></h4>';
    for (let i = 0; i < n[side]; i++) {
      const x = own[i] || {}, gp = plOf(m.id, side, x.g), ap = plOf(m.id, side, x.a);
      const btn = (k, pl, nm, ph, ic) => '<button type="button" class="pkb' + (k === 'a' ? ' a' : '') + (nm ? ' on' : '') + '" data-pk="' + k + '" data-sd="' + side + '" data-i="' + i + '"><span class="ic">' + ic + '</span>' + (nm ? '<span class="tx"><small>' + (k === 'g' ? 'GOLCÜ' : 'ASİST') + '</small>' + E(nm) + '</span><span style="flex:1"></span>' + (pl && pl.no ? '<span class="nr">#' + E(pl.no) + '</span>' : '') + (pl ? psChip(pl.pos) : '') : '<span class="tx">' + ph + '</span>') + '</button>';
      h += '<div class="gsl"><span class="no">' + (i + 1) + '</span><div class="bt">' + btn('g', gp, x.gn, 'Golcüyü seç', '⚽') + btn('a', ap, x.an, 'Asist yapanı seç (isteğe bağlı)', '👟') + '</div></div>';
    }
    h += '</div>';
  }
  return h;
}
function matchCard(m) {
  const d = draft[m.id] || (draft[m.id] = m.pick ? JSON.parse(JSON.stringify(m.pick)) : {});
  if (!d.gl && (d.g || d.as)) d.gl = [];
  const st = m.st === 'in' ? '<span class="badge live">Canlı</span>' : m.st === 'post' ? '<span class="badge">Bitti</span>' : m.st === 'off' ? '<span class="badge">Ertelendi</span>' : '';
  const mid = m.sc ? '<div class="s">' + m.sc[0] + ' – ' + m.sc[1] + '</div>' + st : '<div class="t">' + when(m.at) + '</div>' + (m.pick ? '<span class="badge ok">Tahmin var</span>' : '');
  let h = '<div class="card" data-m="' + m.id + '"><div class="m-top"><div class="tm">' + (m.home.logo ? '<img src="' + E(m.home.logo) + '" alt="">' : '') + '<span>' + E(m.home.name) + '</span></div><div class="mid">' + mid + '</div><div class="tm">' + (m.away.logo ? '<img src="' + E(m.away.logo) + '" alt="">' : '') + '<span>' + E(m.away.name) + '</span></div></div>';
  if (m.locked) return h + pickRows(m) + '</div>';
  const stp = (k, v) => '<div class="step"><button type="button" data-st="' + k + '" data-d="-1">−</button><input data-f="' + k + '" inputmode="numeric" value="' + (v == null ? '' : v) + '" placeholder="–" maxlength="2"><button type="button" data-st="' + k + '" data-d="1">+</button></div>';
  h += '<label>Skor</label><div class="sc">' + stp('h', d.h) + '<span class="x">–</span>' + stp('a', d.a) + '</div>';
  h += '<div class="gls" data-gls>' + goalsHtml(m, d) + '</div>';
  h += '<div class="two"><div><label>Sarı kart (toplam)</label>' + stp('yc', d.yc) + '</div><div><label>Kırmızı kart</label><div class="seg"><button type="button" data-rc="1" class="' + (d.rc === true ? 'on' : '') + '">Çıkar</button><button type="button" data-rc="0" class="' + (d.rc === false ? 'on' : '') + '">Çıkmaz</button></div></div></div>';
  h += '<button class="btn" data-save="' + m.id + '">' + (m.pick ? 'Tahmini güncelle' : 'Tahmini kaydet') + '</button><div class="saved" data-ok="' + m.id + '"></div><div class="err" data-er="' + m.id + '"></div></div>';
  if (!SQ[m.id]) loadSquad(m.id);
  return h;
}
function refreshGoals(card, id) { const m = allM().find(x => x.id === id), el = card.querySelector('[data-gls]'); if (m && el) el.innerHTML = goalsHtml(m, draft[id]); }
async function loadSquad(id) {
  if (SQ[id] === 0) return; SQ[id] = 0;
  try { SQ[id] = await api('GET', '/squad/' + id); } catch (e) { SQ[id] = { home: { name: '', players: [] }, away: { name: '', players: [] } }; }
  const el = document.querySelector('[data-m="' + id + '"]'); if (el) refreshGoals(el, id);
}
// oyuncu seçme paneli (alttan açılır): mevkiye göre gruplu, forma numarası, arama
let SH = null;
function openSheet(mid, side, i, k) {
  const m = allM().find(x => x.id === mid), d = draft[mid], tm = side === 'h' ? m.home : m.away;
  const own = d.gl.filter(x => x.s === side); while (own.length <= i) { const n = { s: side }; d.gl.push(n); own.push(n); }
  SH = { mid, side, slot: own[i], k, q: '' };
  const el = document.createElement('div'); el.id = 'sheet';
  el.innerHTML = '<div class="sh" role="dialog" aria-modal="true"><div class="hd"><div class="grab"></div><div class="tt">' + (tm.logo ? '<img src="' + E(tm.logo) + '" alt="">' : '') + '<div><b>' + (k === 'g' ? (i + 1) + '. golü kim atar?' : (i + 1) + '. gole kim asist yapar?') + '</b><small>' + E(tm.name) + ' oyuncuları</small></div><button class="x" data-shx aria-label="Kapat">×</button></div><input type="search" id="shq" placeholder="Oyuncu ara" autocomplete="off"></div><div class="ls" id="shl"></div></div>';
  document.body.appendChild(el); document.body.style.overflow = 'hidden';
  drawSheet();
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-shx]')) closeSheet(); });
  el.querySelector('#shq').addEventListener('input', e => { SH.q = e.target.value; drawSheet(); });
}
function drawSheet() {
  const sq = SQ[SH.mid], box = document.getElementById('shl'); if (!box) return;
  if (!sq) { box.innerHTML = '<div class="empty">Kadro yükleniyor…</div>'; loadSquad(SH.mid).then(drawSheet); return; }
  const list = (sq[SH.side === 'h' ? 'home' : 'away'].players || []), q = SH.q.trim().toLocaleLowerCase('tr');
  const cur = SH.slot[SH.k], other = SH.slot[SH.k === 'g' ? 'a' : 'g'];
  let h = cur ? '<button class="pl clr" data-pl=""><span class="jn">×</span><span class="pn">Seçimi kaldır</span></button>' : '';
  for (const pos of ['F', 'M', 'D', 'G', '']) {
    const ps = list.filter(p => (pos ? p.pos === pos : !POS[p.pos]) && (!q || p.name.toLocaleLowerCase('tr').includes(q)));
    if (!ps.length) continue;
    h += '<div class="gp">' + psChip(pos) + (POS[pos] ? POS[pos][1] : 'Diğer') + '</div>';
    h += ps.map(p => '<button class="pl' + (p.id === cur ? ' sel' : '') + '" data-pl="' + p.id + '"' + (p.id === other ? ' disabled' : '') + '><span class="jn">' + (p.no || '–') + '</span><span class="pn">' + E(p.name) + '</span>' + (p.id === cur ? '<span class="ck">✓</span>' : p.id === other ? '<small style="color:var(--mut)">' + (SH.k === 'g' ? 'asist' : 'golcü') + '</small>' : '') + '</button>').join('');
  }
  box.innerHTML = h || '<div class="empty">' + (list.length ? 'Oyuncu bulunamadı.' : 'Kadro alınamadı; biraz sonra tekrar dene.') + '</div>';
}
function closeSheet() { const el = document.getElementById('sheet'); if (el) el.remove(); document.body.style.overflow = ''; SH = null; }
document.addEventListener('click', e => {
  const b = e.target.closest('#sheet [data-pl]'); if (!b || !SH) return;
  const id = b.dataset.pl, pl = id ? plOf(SH.mid, SH.side, id) : null, k = SH.k;
  if (id) { SH.slot[k] = id; SH.slot[k + 'n'] = pl ? pl.name : ''; } else { delete SH.slot[k]; delete SH.slot[k + 'n']; }
  const card = document.querySelector('[data-m="' + SH.mid + '"]'), mid = SH.mid; closeSheet(); if (card) refreshGoals(card, mid);
});
addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
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
  try { S = await api('GET', '/state' + (K ? '?k=' + encodeURIComponent(K) : '')); }
  catch (e) { if (e.status === 404) { document.body.innerHTML = '<main><div class="card empty">' + E(e.message) + '</div></main>'; return; } throw e; }
  if (!S.me && tok) { tok = ''; try { localStorage.removeItem(KEY); } catch (e) {} }
  // ekrandaki QR'dan gelen ve giriş yapmamış müşteri doğrudan Google girişine gider (hata dönüşünde döngüye girmez)
  if (!S.me && !gTok && !gErr && K && S.google && once('lig_go_' + K)) { gStart(); return; }
  render();
}
// --- giriş (yalnız Google) ---
const K = new URLSearchParams(location.search).get('k') || '';
let gErr = '';
const once = k => { try { if (sessionStorage.getItem(k)) return false; sessionStorage.setItem(k, '1'); } catch (e) {} return true; };
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); $('gbd').max = today;
const gStart = () => { location.href = '/api/auth/google/lig/' + encodeURIComponent(CODE) + (K ? '?k=' + encodeURIComponent(K) : ''); };
// Google dönüşü: #tk= oturum, #gs= kayıt belirteci, #gerr= hata (adres çubuğundan hemen silinir)
function onHash() {
  const h = new URLSearchParams(location.hash.slice(1)); if (!/(^|&)(tk|gs|gerr)=/.test(location.hash.slice(1))) return false;
  history.replaceState(null, '', location.pathname + location.search);
  if (/^[a-f0-9]{64}$/.test(h.get('tk') || '')) { tok = h.get('tk'); try { localStorage.setItem(KEY, tok); } catch (e) {} }
  if (h.get('gs')) { gTok = h.get('gs'); $('gTo').textContent = (h.get('ge') || '') + ' Google hesabıyla katılıyorsun.'; $('gad').value = h.get('ga') || ''; $('gsy').value = h.get('gy') || ''; nickPrev(); }
  gErr = h.get('gerr') || '';
  return true;
}
const ERR = { cancel: 'Google girişi iptal edildi.', unverified: 'Google hesabının e-postası doğrulanmamış.', kapatildi: 'Bu hesap işletme tarafından kapatıldı.', limit: 'Çok fazla deneme; biraz sonra tekrar dene.', qr: 'Kayıt yalnız işletmede, ekrandaki QR kod okutularak yapılır. Ekrandaki QR kodu yeniden okut.' };
function authView() {
  const reg = !!gTok;
  $('a1').hidden = reg; $('ag').hidden = !reg;
  if (reg) return;
  const inStore = !!S.qr;
  $('a1T').textContent = inStore ? 'Katıl, tahmin et, haftanın birincisi ol' : 'Tahmin ligine giriş';
  $('a1N').textContent = inStore ? 'Katılım ücretsizdir. Google hesabınla tek dokunuşla katıl; istediğin maçlara tahmin gir, skor, golcü, asist ve kartlardan puan topla.' + (S.minAge ? ' ' + S.minAge + ' yaş ve üzeri katılabilir.' : '')
    : 'Daha önce katıldıysan Google ile giriş yap. Yeni katılım yalnız işletmede, ekrandaki QR kod okutularak yapılır.';
  $('ggT').textContent = inStore ? 'Google ile katıl' : 'Google ile giriş yap';
  $('gg').hidden = !S.google;
  $('e1').textContent = gErr ? (ERR[gErr] || 'Google ile giriş yapılamadı; tekrar dene.') : S.google ? '' : 'Giriş şu an kullanılamıyor; işletmeye haber ver.';
}
function nickPrev() {
  const a = $('gad').value.trim().split(/\s+/)[0] || '', y = $('gsy').value.trim();
  $('nkP').textContent = a && y ? 'Puan durumunda görünecek kullanıcı adın: ' + a.charAt(0).toLocaleUpperCase('tr') + a.slice(1).toLocaleLowerCase('tr') + ' ' + y.charAt(0).toLocaleUpperCase('tr') + '.' : 'Kullanıcı adın adından ve soyadının baş harfinden otomatik oluşturulur (ör. Ahmet Y.).';
}
$('gad').addEventListener('input', nickPrev); $('gsy').addEventListener('input', nickPrev); nickPrev();
onHash();
addEventListener('hashchange', () => { if (onHash()) load().catch(() => {}); });
$('gg').onclick = e => { e.preventDefault(); gStart(); };
$('gsv').onclick = async () => {
  $('eg').textContent = ''; $('gsv').disabled = true;
  try { const j = await api('POST', '/gsignup', { gt: gTok, ad: $('gad').value, soyad: $('gsy').value, bd: $('gbd').value, consent: $('gok').checked }); tok = j.token; gTok = ''; try { localStorage.setItem(KEY, tok); } catch (e) {} tab = 'm'; await load(); }
  catch (e) { $('eg').textContent = e.message; if (/süresi doldu/.test(e.message)) gTok = ''; }
  $('gsv').disabled = false;
};
$('mailC').onchange = async () => { try { await api('POST', '/mail', { on: $('mailC').checked }); S.me.mail = $('mailC').checked; } catch (e) { $('mailC').checked = !$('mailC').checked; } };
$('out').onclick = async () => { try { await api('POST', '/logout'); } catch (e) {} tok = ''; try { localStorage.removeItem(KEY); } catch (e) {} load(); };
$('del').onclick = async () => { if (!confirm('Hesabın ve tüm tahminlerin silinecek. Emin misin?')) return; try { await api('DELETE', '/me'); } catch (e) {} tok = ''; try { localStorage.removeItem(KEY); } catch (e) {} load(); };
$('tabs').onclick = e => { const b = e.target.closest('button[data-t]'); if (!b) return; tab = b.dataset.t; render(); scrollTo(0, 0); };
// --- tahmin formu ---
document.addEventListener('click', async e => {
  const bv = e.target.closest('[data-bv]'); if (bv) { bView = bv.dataset.bv; renderBoard(); return; }
  const card = e.target.closest('[data-m]'); if (!card) return; const id = card.dataset.m, d = draft[id] || (draft[id] = {});
  const st = e.target.closest('[data-st]');
  if (st) { const k = st.dataset.st, inp = card.querySelector('[data-f="' + k + '"]'); let v = inp.value === '' ? (+st.dataset.d > 0 ? -1 : 1) : +inp.value; v = Math.max(0, Math.min(k === 'yc' ? 15 : 10, v + +st.dataset.d)); inp.value = v; d[k] = v; if (k !== 'yc') { if (d.h == null && k === 'a') { d.h = 0; card.querySelector('[data-f="h"]').value = 0; } if (d.a == null && k === 'h') { d.a = 0; card.querySelector('[data-f="a"]').value = 0; } refreshGoals(card, id); } return; }
  const pk = e.target.closest('[data-pk]'); if (pk) { openSheet(id, pk.dataset.sd, +pk.dataset.i, pk.dataset.pk); return; }
  const rc = e.target.closest('[data-rc]');
  if (rc) { const v = rc.dataset.rc === '1'; d.rc = d.rc === v ? undefined : v; for (const b of card.querySelectorAll('[data-rc]')) b.classList.toggle('on', d.rc === (b.dataset.rc === '1')); return; }
  const sv = e.target.closest('[data-save]');
  if (sv) {
    const er = card.querySelector('[data-er]'), ok = card.querySelector('[data-ok]'); er.textContent = ''; ok.textContent = '';
    if ((d.h == null) !== (d.a == null)) { er.textContent = 'Skor için iki takımın golünü de yaz'; return; }
    sv.disabled = true;
    try {
      const j = await api('POST', '/pick', { mid: id, h: d.h, a: d.a, gl: (d.gl || []).filter(x => x.g || x.a), yc: d.yc, rc: d.rc });
      const m = allM().find(x => x.id === id); if (m) m.pick = j.pick;
      ok.textContent = j.pick ? 'Kaydedildi ✓' : 'Tahmin silindi'; sv.textContent = j.pick ? 'Tahmini güncelle' : 'Tahmini kaydet';
    } catch (x) { er.textContent = x.message; if (x.status === 409) setTimeout(load, 1200); }
    sv.disabled = false;
  }
});
document.addEventListener('input', e => {
  const f = e.target.closest('[data-f]'), card = e.target.closest('[data-m]'); if (!f || !card) return;
  const d = draft[card.dataset.m] || (draft[card.dataset.m] = {}), k = f.dataset.f;
  if (f.tagName === 'SELECT') d[k] = f.value || undefined;
  else { const v = f.value.replace(/\\D/g, '').slice(0, 2); f.value = v; d[k] = v === '' ? undefined : Math.min(k === 'yc' ? 15 : 10, +v); if (k !== 'yc') refreshGoals(card, card.dataset.m); }
});
document.addEventListener('change', e => { const f = e.target.closest('select[data-f]'), card = e.target.closest('[data-m]'); if (f && card) { (draft[card.dataset.m] || (draft[card.dataset.m] = {}))[f.dataset.f] = f.value || undefined; } });
load().catch(e => { document.body.insertAdjacentHTML('beforeend', '<p class="err" style="text-align:center">' + E(e.message) + '</p>'); });
setInterval(() => { if (document.visibilityState === 'visible' && S && S.me && !document.activeElement.closest('[data-m]')) load().catch(() => {}); }, 60000);
})();
</script></body></html>`;
}
module.exports = { html };
