// Tahmin Ligi (Süper Lig): müşteri ekrandaki QR'ı okutur, e-postasına gelen kodla kaydolur ve haftanın maçlarından
// istediklerine tahmin girer (maç sayısı zorunlu değil): skor, golcü, asist yapan, sarı kart sayısı, kırmızı kart çıkar mı.
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
const PTS = Object.freeze({ exact: 5, result: 2, goal: 3, assist: 2, yellow: 2, red: 2 });
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
  const goals = {}, assists = {}; let yc = 0, rc = 0, seen = 0;
  for (const tm of s.rosters || []) for (const p of tm.roster || []) {
    const st = {}; for (const x of p.stats || []) st[x.name] = Number(x.value) || 0;
    const id = String((p.athlete || {}).id || ''); if (!id) continue; seen++;
    if (st.totalGoals > 0) goals[id] = st.totalGoals;
    if (st.goalAssists > 0) assists[id] = st.goalAssists;
    yc += st.yellowCards || 0; rc += st.redCards || 0;
  }
  if (!seen) throw new Error('Maç istatistiği henüz yok');
  const cs = (((s.header || {}).competitions || [])[0] || {}).competitors || [];
  const h = cs.find(x => x.homeAway === 'home'), a = cs.find(x => x.homeAway === 'away');
  const sc = h && a ? [Number(h.score) || 0, Number(a.score) || 0] : m.sc;
  return { sc, res: { goals, assists, yc, rc } };
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
  if (c && Date.now() - c.at < DAY) return c.list;
  try {
    const j = await jget(`${ESPN}/teams/${encodeURIComponent(teamId)}/roster`);
    const ORDER = { F: 0, M: 1, D: 2, G: 3 };
    const list = (j.athletes || []).filter(a => a && a.id).map(a => ({ id: String(a.id), name: String(a.displayName || '').slice(0, 60), pos: ((a.position || {}).abbreviation || '').slice(0, 2) }))
      .sort((a, b) => (ORDER[a.pos] ?? 9) - (ORDER[b.pos] ?? 9) || a.name.localeCompare(b.name, 'tr'));
    C.squads[teamId] = { at: Date.now(), list }; saveCache();
    return list;
  } catch (e) { return c ? c.list : []; }
}

// ---------- puan ----------
const sign = (h, a) => Math.sign(h - a);
function pointsFor(p, m) {
  if (!p || !m || m.st !== 'post' || !m.res || !m.sc) return null;
  const r = m.res, o = { score: 0, goal: 0, assist: 0, yellow: 0, red: 0, exact: false };
  if (Number.isInteger(p.h) && Number.isInteger(p.a)) {
    if (p.h === m.sc[0] && p.a === m.sc[1]) { o.score = PTS.exact; o.exact = true; }
    else if (sign(p.h, p.a) === sign(m.sc[0], m.sc[1])) o.score = PTS.result;
  }
  if (p.g && r.goals[p.g]) o.goal = PTS.goal * r.goals[p.g];
  if (p.as && r.assists[p.as]) o.assist = PTS.assist * r.assists[p.as];
  if (Number.isInteger(p.yc) && p.yc === r.yc) o.yellow = PTS.yellow;
  if (typeof p.rc === 'boolean' && p.rc === r.rc > 0) o.red = PTS.red;
  o.total = o.score + o.goal + o.assist + o.yellow + o.red;
  return o;
}

// ---------- işletme verisi ----------
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
const rnd = n => { const b = crypto.randomBytes(n); let s = ''; for (const x of b) s += ALPHA[x % ALPHA.length]; return s; };
const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');
function cfg(t) {
  const d = t.db.predict || (t.db.predict = {});
  if (!d.code) d.code = rnd(8);
  d.users = d.users || {}; d.picks = d.picks || {}; d.awards = d.awards || {};
  if (typeof d.prize !== 'string') d.prize = '';
  return d;
}
const urlOf = t => `${config.BASE_URL}/lig/${cfg(t).code}`;
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
const isOn = t => { const p = t && t.db.predict; return !!(p && p.on && require('./plans').plan(t).pro && require('./plans').access(t).ok); };

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
    const u = w && w.pts > 0 && d.users[w.uid];
    if (u && u.email) {
      try {
        const T = require('./mailtpl'), esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        await require('./mailer').send({ to: u.email, subject: `${t.name}: haftanın tahmin ligi birincisisiniz!`,
          text: `Tebrikler ${u.nick}! ${weekLabel(prev)} haftasında ${w.pts} puanla ${t.name} tahmin liginin birincisi oldunuz.${d.prize ? ' Ödülünüz: ' + d.prize + '.' : ''} Ödülünüzü almak için işletmeye bu e-postayı ve takma adınızı gösterin.`,
          html: T.html({ title: 'Haftanın birincisisiniz!', preheader: `${t.name} tahmin ligi`, body: `<p>Tebrikler <b>${esc(u.nick)}</b>! ${esc(weekLabel(prev))} haftasında <b>${w.pts} puanla</b> ${esc(t.name)} tahmin liginin birincisi oldunuz.</p>${d.prize ? `<p>Ödülünüz: <b>${esc(d.prize)}</b></p>` : ''}<p>Ödülünüzü almak için işletmeye bu e-postayı ve takma adınızı gösterin.</p>` }) });
      } catch (e) { console.error('Tahmin ligi kazanan e-postası gönderilemedi', t.id, e.message); }
    }
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

let started = false;
function start() {
  if (started) return; started = true;
  const tick = async () => {
    const any = tenants.all().some(t => t.db.predict && t.db.predict.on);
    if (!any) return;
    try { await refreshFixtures(); await refreshResults(); await settle(); } catch (e) { console.error('Tahmin ligi güncellenemedi', e.message); }
  };
  setTimeout(tick, 20e3);
  setInterval(tick, 5 * 60e3).unref();
  setInterval(() => { for (const t of tenants.all()) if (t.db.predict) prune(t); }, 6 * 3600e3).unref();
}

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
  const d = cfg(t), key = weekKey(Date.now()), url = urlOf(t);
  const top = board(t, key).slice(0, 5).map(r => ({ nick: r.nick, pts: r.pts }));
  const lastKey = weekKey(Date.now() - 7 * DAY), lw = d.awards[lastKey];
  const left = weekMatches(key).filter(m => m.st === 'pre' && m.at > Date.now()).length;
  let qr = ''; try { qr = qrSvg(url); } catch (e) {}
  return { url, qr, biz: t.name || '', prize: d.prize || '', week: weekLabel(key), top, open: left,
    last: lw && !lw.none ? { nick: lw.nick, pts: lw.pts, week: weekLabel(lastKey) } : null, every: Math.max(3, Math.min(30, Number(d.every) || 8)) };
}

module.exports = { PTS, LEAGUE, start, cfg, urlOf, byCode, isOn, board, pointsFor, weekKey, weekLabel, weekRange, weekStart, weekMatches, weekDone,
  squad, refreshFixtures, refreshResults, settle, tvView, qrSvg, sha, rnd, prune, get matches() { return C.matches; }, _cache: C };
