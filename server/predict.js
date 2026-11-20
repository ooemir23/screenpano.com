// Tahmin Ligi (Süper Lig): müşteri ekrandaki QR'ı okutur, e-postasına gelen kodla kaydolur ve haftanın maçlarından
// istediklerine tahmin girer (maç sayısı zorunlu değil): skor, golcü, kırmızı kart çıkar mı.
// Puanlar sabittir (PTS). Haftanın lideri işletmeden ikram kazanır; puan durumu ekranlarda döngü arasında gösterilir.
//
// Veri: ESPN'in açık (resmi olmayan) Süper Lig verisi — fikstür, kadrolar ve maç sonu oyuncu istatistikleri (gol, asist, kart).
// Hafta: Salı 00:00 → Salı 00:00 (Türkiye saati). Süper Lig haftası Cuma–Pazartesi oynandığı için bir hafta bölünmez;
// kazanan Salı sabahı, haftanın tüm maçları bitince kesinleşir.
// Katılım ücretsizdir; kura/çekiliş yoktur, kazanan önceden ilan edilen puan kuralıyla belirlenir.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const config = require('./config');
const tenants = require('./tenants');

const LEAGUE = 'tur.1';
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer/' + LEAGUE;
const PTS = Object.freeze({ exact: 5, result: 2, goal: 3, red: 2 });
const TZ_MS = 3 * 3600e3; // Türkiye UTC+3 (yaz saati yok)
const DAY = 86400e3;
const CACHE_FILE = path.join(config.DATA_DIR, 'predict-cache.json');
const KEEP_MS = 140 * DAY; // maç sonuçları ve tahminler yaklaşık bir sezon tutulur

// ---------- hafta ----------
// Haftanın anahtarı: o haftanın Salı günü (YYYY-AA-GG, Türkiye saati)
function weekStart(ms) {
  const d = new Date(ms + TZ_MS), dow = d.getUTCDay(); // 0 Pazar … 2 Salı
  const back = (dow + 7 - 2) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back) - TZ_MS;
}
const weekKey = ms => new Date(weekStart(ms) + TZ_MS).toISOString().slice(0, 10);
const weekRange = key => { const s = Date.parse(key + 'T00:00:00Z') - TZ_MS; return [s, s + 7 * DAY]; };
const TR_MON = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
function weekLabel(key) {
  const [s, e] = weekRange(key), a = new Date(s + TZ_MS), b = new Date(e - DAY + TZ_MS);
  return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}–${b.getUTCDate()} ${TR_MON[b.getUTCMonth()]}` : `${a.getUTCDate()} ${TR_MON[a.getUTCMonth()]} – ${b.getUTCDate()} ${TR_MON[b.getUTCMonth()]}`;
}

// ---------- veri önbelleği (tüm işletmeler ortak) ----------
// matches: id → { id, at, wk, st: 'pre'|'in'|'post'|'off', home:{id,name,logo}, away:{…}, sc:[h,a]|null, res:{goals,assists,yc,rc}|null }
let C = { matches: {}, squads: {} };
try { const j = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); if (j && j.matches) C = { matches: j.matches, squads: j.squads || {} }; } catch (e) {}
let saveT = null;
const saveCache = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { fs.writeFileSync(CACHE_FILE + '.tmp', JSON.stringify(C)); fs.renameSync(CACHE_FILE + '.tmp', CACHE_FILE); } catch (e) { console.error('Tahmin ligi önbelleği yazılamadı', e.message); } }, 1500); };

const jget = async (u, ms = 12000) => {
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(u, { signal: ac.signal, headers: { 'User-Agent': 'ScreenPano/1.0' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(to); }
};
const trName = n => { try { return require('./feeds').trTeam(n); } catch (e) { return n; } };
const team = c => ({ id: String((c.team || {}).id || ''), name: trName((c.team || {}).displayName || (c.team || {}).shortDisplayName || ''), logo: (c.team || {}).logo || ((c.team || {}).logos || [])[0]?.href || '' });
const stateOf = ev => { const t = ((ev.status || {}).type || {}); if (t.completed) return 'post'; if (/POSTPONED|CANCELED|CANCELLED|SUSPENDED|ABANDONED/i.test(t.name || '')) return 'off'; return t.state === 'in' ? 'in' : t.state === 'post' ? 'post' : 'pre'; };
const ymd = ms => new Date(ms + TZ_MS).toISOString().slice(0, 10).replace(/-/g, '');

// Bu ve gelecek haftanın fikstürü (gün gün; ESPN tarih aralığını desteklemiyor)
let fixAt = 0, fixBusy = false;
async function refreshFixtures(force) {
  if (fixBusy || (!force && Date.now() - fixAt < 10 * 60e3)) return;
  fixBusy = true;
  try {
    const s = weekStart(Date.now()), days = [];
    for (let d = s - DAY; d < s + 14 * DAY; d += DAY) days.push(ymd(d));
    for (const day of days) {
      let j; try { j = await jget(`${ESPN}/scoreboard?dates=${day}`); } catch (e) { continue; }
      for (const ev of j.events || []) {
        const c = (ev.competitions || [])[0] || {}, cs = c.competitors || [];
        const h = cs.find(x => x.homeAway === 'home'), a = cs.find(x => x.homeAway === 'away');
        if (!h || !a) continue;
        const at = Date.parse(ev.date), old = C.matches[ev.id] || {};
        const st = stateOf(ev);
        C.matches[ev.id] = { ...old, id: String(ev.id), at, wk: weekKey(at), st: old.res ? 'post' : st, home: team(h), away: team(a),
          sc: st === 'pre' || st === 'off' ? null : [Number(h.score) || 0, Number(a.score) || 0] };
      }
    }
    // eski maçlar atılır
    const cut = Date.now() - KEEP_MS;
    for (const [id, m] of Object.entries(C.matches)) if (m.at < cut) delete C.matches[id];
    fixAt = Date.now(); saveCache();
  } finally { fixBusy = false; }
}

// Biten maçın oyuncu istatistikleri: gol (kendi kalesine hariç), asist, sarı ve kırmızı kart toplamı
async function fetchResult(m) {
  const s = await jget(`${ESPN}/summary?event=${m.id}`);
  const goals = {}, assists = {}, ycp = {}, rcp = {}; let yc = 0, rc = 0, seen = 0;
  for (const tm of s.rosters || []) for (const p of tm.roster || []) {
    const st = {}; for (const x of p.stats || []) st[x.name] = Number(x.value) || 0;
    const id = String((p.athlete || {}).id || ''); if (!id) continue; seen++;
    if (st.totalGoals > 0) goals[id] = st.totalGoals;
    if (st.goalAssists > 0) assists[id] = st.goalAssists;
    if (st.yellowCards > 0) ycp[id] = st.yellowCards;
    if (st.redCards > 0) rcp[id] = st.redCards;
    yc += st.yellowCards || 0; rc += st.redCards || 0;
  }
  if (!seen) throw new Error('Maç istatistiği henüz yok');
  const cs = (((s.header || {}).competitions || [])[0] || {}).competitors || [];
  const h = cs.find(x => x.homeAway === 'home'), a = cs.find(x => x.homeAway === 'away');
  const sc = h && a ? [Number(h.score) || 0, Number(a.score) || 0] : m.sc;
  return { sc, res: { goals, assists, yc, rc, ycp, rcp } };
}
// Biten ama sonucu alınmamış maçlar (maç bittikten 15 dk sonra; istatistikler geç oturur, 6 saat boyunca tazelenir)
let resBusy = false;
async function refreshResults() {
  if (resBusy) return; resBusy = true;
  try {
    const now = Date.now();
    for (const m of Object.values(C.matches)) {
      if (m.st !== 'post' && !(m.st === 'in' && now - m.at > 3 * 3600e3)) continue;
      const doneAt = m.at + 115 * 60e3;
      if (now < doneAt + 15 * 60e3) continue;
      const fresh = m.res && (m.resAt || 0) > doneAt + 6 * 3600e3; // son tazeleme maçtan 6 saat sonra: artık kesin
      if (fresh || (m.res && now - (m.resAt || 0) < 60 * 60e3)) continue;
      try { const r = await fetchResult(m); m.sc = r.sc; m.res = r.res; m.st = 'post'; m.resAt = now; saveCache(); }
      catch (e) { /* bir sonraki turda yeniden denenir */ }
    }
  } finally { resBusy = false; }
}

// Kadro (golcü / asist seçimi için): takım başına günde bir
async function squad(teamId) {
  const c = C.squads[teamId];
  if (c && c.v === 2 && Date.now() - c.at < DAY) return c.list;
  try {
    const j = await jget(`${ESPN}/teams/${encodeURIComponent(teamId)}/roster`);
    const ORDER = { F: 0, M: 1, D: 2, G: 3 };
    const list = (j.athletes || []).filter(a => a && a.id).map(a => ({ id: String(a.id), name: String(a.displayName || '').slice(0, 60), pos: ((a.position || {}).abbreviation || '').slice(0, 2), no: /^\d{1,3}$/.test(String(a.jersey || '')) ? String(a.jersey) : '' }))
      .sort((a, b) => (ORDER[a.pos] ?? 9) - (ORDER[b.pos] ?? 9) || a.name.localeCompare(b.name, 'tr'));
    C.squads[teamId] = { at: Date.now(), v: 2, list }; saveCache();
    return list;
  } catch (e) { return c ? c.list : []; }
}

// ---------- puan ----------
const sign = (h, a) => Math.sign(h - a);
function pointsFor(p, m) {
  if (!p || !m || m.st !== 'post' || !m.res || !m.sc) return null;
  const r = m.res, o = { score: 0, goal: 0, red: 0, exact: false };
  if (Number.isInteger(p.h) && Number.isInteger(p.a)) {
    if (p.h === m.sc[0] && p.a === m.sc[1]) { o.score = PTS.exact; o.exact = true; }
    else if (sign(p.h, p.a) === sign(m.sc[0], m.sc[1])) o.score = PTS.result;
  }
  // gol kutuları: her kutu bir golün golcüsü (g). Aynı oyuncu birden çok kutuda olabilir; oyuncunun maçtaki gol
  // sayısını aşan kutular puan almaz. Eski biçim (tek g) ve eski tahminlerdeki asist / sarı kart alanları okunur ama puanlanmaz.
  const slots = Array.isArray(p.gl) ? p.gl : [{ g: p.g }].filter(x => x.g);
  const gl = { ...(r.goals || {}) };
  o.slots = slots.map(x => {
    const v = { g: 0 };
    if (x.g && gl[x.g] > 0) { gl[x.g]--; v.g = PTS.goal; }
    o.goal += v.g; return v;
  });
  if (typeof p.rc === 'boolean' && p.rc === r.rc > 0) o.red = PTS.red;
  o.total = o.score + o.goal + o.red;
  return o;
}

// ---------- işletme verisi ----------
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
const rnd = n => { const b = crypto.randomBytes(n); let s = ''; for (const x of b) s += ALPHA[x % ALPHA.length]; return s; };
const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');
function cfg(t) {
  const d = t.db.predict || (t.db.predict = {});
  if (!d.code) d.code = rnd(8);
  if (!d.qk) d.qk = rnd(16); // ekrandaki QR anahtarı ve e-posta aboneliğinden çıkma bağlantısı için işletmeye özel sır
  d.users = d.users || {}; d.picks = d.picks || {}; d.awards = d.awards || {};
  if (typeof d.prize !== 'string') d.prize = '';
  return d;
}
// Canlıda Tahmin Ligi kendi alt alanındadır (tahmin.<taban>/<kod>); test ortamında alt alan yok: <taban>/lig/<kod>
const LIG_HOST = (() => { try { const h = new URL(config.BASE_URL).hostname.toLowerCase(); return config.APP_ENV === 'live' && h.includes('.') ? 'tahmin.' + h : ''; } catch (e) { return ''; } })();
const ligUrl = code => LIG_HOST ? `https://${LIG_HOST}/${encodeURIComponent(code)}` : `${config.BASE_URL}/lig/${encodeURIComponent(code)}`;
const urlOf = t => ligUrl(cfg(t).code);
// Ekrandaki QR'da 2 saatte bir değişen anahtar (k): yeni kayıt yalnız bununla yapılır; işletmede olmayan,
// eski/paylaşılmış bağlantıyla gelen kişi kayıt olamaz. Geçerlilik: içinde bulunulan ve bir önceki pencere (2–4 saat).
const QR_WIN = 2 * 3600e3;
const qrWin = (ms = Date.now()) => Math.floor(ms / QR_WIN);
const qrKey = (t, w = qrWin()) => sha(cfg(t).qk + '|' + w).slice(0, 10);
const qrValid = (t, k) => { k = String(k || ''); return /^[a-f0-9]{10}$/.test(k) && (k === qrKey(t) || k === qrKey(t, qrWin() - 1)); };
const joinUrl = t => `${urlOf(t)}?k=${qrKey(t)}`;
const unsubSig = (t, uid) => sha(cfg(t).qk + '|mail|' + uid).slice(0, 24);
const unsubUrl = (t, uid) => `${config.BASE_URL}/api/lig/${cfg(t).code}/unsub?u=${uid}&s=${unsubSig(t, uid)}`;
let codeIdx = null, codeAt = 0;
function byCode(code) {
  code = String(code || '').toLowerCase();
  if (!/^[a-z0-9]{6,12}$/.test(code)) return null;
  if (!codeIdx || Date.now() - codeAt > 10000 || !codeIdx.has(code)) {
    codeIdx = new Map(); codeAt = Date.now();
    for (const t of tenants.all()) if (t.db.predict && t.db.predict.code) codeIdx.set(t.db.predict.code, t.id);
  }
  const tid = codeIdx.get(code); return tid ? tenants.get(tid) : null;
}
// lig çalışır: açık + Tahmin Ligi ek aboneliği etkin + işletmenin erişimi açık (paket fark etmez)
const isOn = t => { const p = t && t.db.predict; return !!(p && p.on && require('./addons').active(t, 'tahmin_ligi') && require('./plans').access(t).ok); };

// Haftalık puan durumu (ve genel): eşitlikte daha çok tam skor, sonra son tahmini erken giren önde
function board(t, key) {
  const d = cfg(t), rows = [];
  for (const [uid, picks] of Object.entries(d.picks)) {
    const u = d.users[uid]; if (!u || u.off) continue;
    let pts = 0, exact = 0, n = 0, last = 0;
    for (const [mid, p] of Object.entries(picks)) {
      const m = C.matches[mid]; if (!m || (key && m.wk !== key)) continue;
      n++; last = Math.max(last, p.at || 0);
      const o = pointsFor(p, m); if (o) { pts += o.total; if (o.exact) exact++; }
    }
    if (n) rows.push({ uid, nick: u.nick, pts, exact, n, last });
  }
  rows.sort((a, b) => b.pts - a.pts || b.exact - a.exact || a.last - b.last || a.nick.localeCompare(b.nick, 'tr'));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}
const weekMatches = key => Object.values(C.matches).filter(m => m.wk === key).sort((a, b) => a.at - b.at);
// haftanın tüm maçları bitti (ya da ertelendi) ve hafta kapandı mı
const weekDone = key => { const [, e] = weekRange(key), ms = weekMatches(key); return Date.now() >= e && ms.length > 0 && ms.every(m => m.st === 'off' || (m.st === 'post' && m.res)); };

// Hafta kapanınca kazanan kesinleşir ve kazanana e-posta gider (bir kez)
async function settle() {
  const prev = weekKey(Date.now() - 7 * DAY);
  if (!weekDone(prev)) return;
  for (const t of tenants.all()) {
    if (!t.db.predict || !t.db.predict.on) continue;
    const d = cfg(t); if (d.awards[prev]) continue;
    const b = board(t, prev), w = b[0];
    d.awards[prev] = w && w.pts > 0 ? { uid: w.uid, nick: w.nick, pts: w.pts, at: Date.now(), given: false, prize: d.prize || '' } : { none: true, at: Date.now() };
    tenants.save(t);
    mailWeek(t, prev, b).catch(e => console.error('Tahmin ligi haftalık e-postaları gönderilemedi', t.id, e.message));
  }
}

// Haftalık puan durumu e-postası: her katılımcıya bir e-posta (birinciye tebrik + ödül, diğerlerine kendi sırası).
// Reklam içermez; her e-postada tek tıkla çıkma bağlantısı vardır. Hafta başına bir kez (awards[hafta].mailed).
const escH = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function mailWeek(t, key, b) {
  const d = cfg(t), aw = d.awards[key]; if (!aw || aw.mailed) return;
  aw.mailed = Date.now(); tenants.save(t);
  const T = require('./mailtpl'), mailer = require('./mailer'), label = weekLabel(key), top = b.slice(0, 10), w = !aw.none && b[0];
  const byUid = new Map(b.map(r => [r.uid, r]));
  const table = top.length ? `<table style="width:100%;border-collapse:collapse;font-size:14px">${top.map(r => `<tr><td style="padding:6px 4px;border-bottom:1px solid #eee;width:28px;color:#888;font-weight:700">${r.rank}</td><td style="padding:6px 4px;border-bottom:1px solid #eee">${escH(r.nick)}</td><td style="padding:6px 4px;border-bottom:1px solid #eee;text-align:right;font-weight:800">${r.pts}</td></tr>`).join('')}</table>` : '<p>Bu hafta puan alan olmadı.</p>';
  for (const [uid, u] of Object.entries(d.users)) {
    if (!u || u.off || u.noMail || !u.email) continue;
    const me = byUid.get(uid), won = w && w.uid === uid && w.pts > 0;
    const head = won ? `<p>Tebrikler <b>${escH(u.nick)}</b>! <b>${w.pts} puanla</b> haftanın birincisi oldunuz.</p>${aw.prize ? `<p>Ödülünüz: <b>${escH(aw.prize)}</b>. Almak için işletmeye bu e-postayı ve kullanıcı adınızı gösterin.</p>` : ''}`
      : me ? `<p>Merhaba ${escH(u.nick)}, bu hafta <b>${me.pts} puanla ${me.rank}. sıradasınız</b>.</p>` : `<p>Merhaba ${escH(u.nick)}, bu hafta tahmin girmediniz. Yeni haftanın maçları tahmine açık.</p>`;
    const body = `${head}<p style="margin:16px 0 6px;font-weight:700">${escH(label)} puan durumu</p>${table}${w && !won ? `<p>🏆 Haftanın birincisi: <b>${escH(w.nick)}</b> (${w.pts} puan)</p>` : ''}`
      + `<p><a href="${urlOf(t)}">Yeni haftanın tahminlerini gir</a></p><p style="color:#888;font-size:12px">Bu e-posta yalnız tahmin ligi puan durumu içindir; reklam içermez. Haftalık e-postaları almak istemiyorsanız: <a href="${unsubUrl(t, uid)}">e-postaları kapat</a></p>`;
    try {
      await mailer.send({ to: u.email, subject: won ? `${t.name}: haftanın tahmin ligi birincisisiniz!` : `${t.name} Tahmin Ligi · ${label} puan durumu`,
        text: `${t.name} Tahmin Ligi · ${label}\n` + (won ? `Tebrikler, ${w.pts} puanla haftanın birincisi oldunuz.${aw.prize ? ' Ödülünüz: ' + aw.prize + '.' : ''}\n` : me ? `Bu hafta ${me.pts} puanla ${me.rank}. sıradasınız.\n` : '')
          + top.map(r => `${r.rank}. ${r.nick} — ${r.pts}`).join('\n') + `\n\nTahmin: ${urlOf(t)}\nE-postaları kapat: ${unsubUrl(t, uid)}`,
        html: T.html({ title: won ? 'Haftanın birincisisiniz!' : 'Haftalık puan durumu', preheader: `${t.name} Tahmin Ligi`, body }) });
    } catch (e) { console.error('Tahmin ligi e-postası gönderilemedi', t.id, e.message); }
    await new Promise(r => setTimeout(r, 300)); // SMTP'yi boğmamak için
  }
}

// Eski tahminler atılır (maç önbellekten çıkınca)
function prune(t) {
  const d = cfg(t); let ch = false;
  for (const [uid, picks] of Object.entries(d.picks)) {
    for (const mid of Object.keys(picks)) if (!C.matches[mid]) { delete picks[mid]; ch = true; }
    if (!Object.keys(picks).length) { delete d.picks[uid]; ch = true; }
  }
  const cut = weekKey(Date.now() - KEEP_MS);
  for (const k of Object.keys(d.awards)) if (k < cut) { delete d.awards[k]; ch = true; }
  if (ch) tenants.save(t);
}

let started = false, lastWin = null, lastDay = null;
function start() {
  if (started) return; started = true;
  const tick = async () => {
    // gün değişti: "Bugün doğanlar" afişi yenilensin (lig kapalı olsa da)
    const day = mdOf().join('-');
    if (lastDay !== null && day !== lastDay) for (const t of tenants.all()) if (bdayCfg(t).on) { try { require('./hub').pushTenant(t.id); } catch (e) {} }
    lastDay = day;
    const any = tenants.all().some(t => t.db.predict && t.db.predict.on);
    if (!any) return;
    const w = qrWin(); // QR anahtarı değişti: ekranlara yeni QR gitsin
    if (lastWin !== null && w !== lastWin) for (const t of tenants.all()) if (t.db.predict && t.db.predict.on) { try { require('./hub').pushTenant(t.id); } catch (e) {} }
    lastWin = w;
    try { await refreshFixtures(); await refreshResults(); await settle(); } catch (e) { console.error('Tahmin ligi güncellenemedi', e.message); }
  };
  setTimeout(tick, 20e3);
  setInterval(tick, 5 * 60e3).unref();
  setInterval(() => { for (const t of tenants.all()) if (t.db.predict) prune(t); }, 6 * 3600e3).unref();
}

// ---------- doğum günleri ----------
// Türkiye tarihine göre ay-gün; 29 Şubat doğumlular artık olmayan yıllarda 28 Şubat'ta kutlanır
const trDate = (ms = Date.now()) => new Date(ms + TZ_MS);
function mdOf(ms = Date.now()) { const d = trDate(ms); return [d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCFullYear()]; }
const leap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
function bornOn(bd, ms = Date.now()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bd || ''); if (!m) return false;
  const [mo, da, y] = mdOf(ms), bm = +m[2], bdd = +m[3];
  if (bm === mo && bdd === da) return true;
  return bm === 2 && bdd === 29 && !leap(y) && mo === 2 && da === 28;
}
// bugün (ya da verilen gün) doğan katılımcılar; ekranda yalnız izin verenler gösterilir
function bdayList(t, ms = Date.now()) {
  const d = cfg(t), y = mdOf(ms)[2], out = [];
  for (const [uid, u] of Object.entries(d.users)) if (u && !u.off && bornOn(u.bd, ms)) out.push({ uid, u, age: y - +u.bd.slice(0, 4) });
  return out.sort((a, b) => a.u.nick.localeCompare(b.u.nick, 'tr'));
}
const bdayCfg = t => t.db.bdayShow || {};
// TV: "Bugün doğanlar" afişi (izin veren, bugün doğan müşteriler; Pro)
function bdayView(t) {
  const c = bdayCfg(t); if (!c.on || !t.db.predict || !require('./plans').plan(t).pro || !require('./plans').access(t).ok) return null;
  const names = bdayList(t).filter(x => x.u.showBday).map(x => x.u.nick);
  if (!names.length) return null;
  return { names, biz: t.name || '', day: weekLabelDay(), every: Math.max(3, Math.min(30, Number(c.every) || 6)) };
}
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const weekLabelDay = (ms = Date.now()) => { const [mo, da] = mdOf(ms); return da + ' ' + AYLAR[mo - 1]; };

// ---------- TV ----------
const qrCache = new Map();
// Eşzamanlı SVG: ilk yayında da QR hazır olsun (önbellek ısınmasını beklemek ilk afişi QR'sız bırakıyordu)
function qrSvg(url) {
  if (qrCache.has(url)) return qrCache.get(url);
  const q = QRCode.create(url, { errorCorrectionLevel: 'M' }), n = q.modules.size, data = q.modules.data, m = 1, W = n + 2 * m;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (data[y * n + x]) d += `M${x + m} ${y + m}h1v1h-1z`;
  const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" shape-rendering="crispEdges"><rect width="${W}" height="${W}" fill="#fff"/><path d="${d}" fill="#111"/></svg>`;
  qrCache.set(url, s); if (qrCache.size > 500) qrCache.delete(qrCache.keys().next().value);
  return s;
}
// TV'de döngü arasına giren "Tahmin Ligi" afişi için veri (yalnız açıkken)
function tvView(t) {
  if (!isOn(t)) return null;
  const d = cfg(t), key = weekKey(Date.now()), url = joinUrl(t);
  const top = board(t, key).slice(0, 5).map(r => ({ nick: r.nick, pts: r.pts }));
  const lastKey = weekKey(Date.now() - 7 * DAY), lw = d.awards[lastKey];
  const left = weekMatches(key).filter(m => m.st === 'pre' && m.at > Date.now()).length;
  let qr = ''; try { qr = qrSvg(url); } catch (e) {}
  return { url, qr, biz: t.name || '', prize: d.prize || '', week: weekLabel(key), top, open: left,
    last: lw && !lw.none ? { nick: lw.nick, pts: lw.pts, week: weekLabel(lastKey) } : null, every: Math.max(3, Math.min(30, Number(d.every) || 8)) };
}

module.exports = { LIG_HOST, ligUrl, bornOn, bdayList, bdayView, PTS, LEAGUE, qrKey, qrValid, joinUrl, unsubSig, mailWeek, start, cfg, urlOf, byCode, isOn, board, pointsFor, weekKey, weekLabel, weekRange, weekStart, weekMatches, weekDone,
  squad, refreshFixtures, refreshResults, settle, tvView, qrSvg, sha, rnd, prune, get matches() { return C.matches; }, _cache: C };
