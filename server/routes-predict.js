// Tahmin Ligi yolları: müşteri sayfası (/lig/:kod), müşteri API'si (/api/lig/:kod/...) ve panel API'si (/api/admin/predict...).
// Müşteri girişi yalnız Google ile; yeni kayıt ekrandaki QR'ın değişen anahtarını (k) ister. Oturum anahtarının yalnız özeti saklanır.
const express = require('express');
const crypto = require('crypto');
const P = require('./predict');
const tenants = require('./tenants');
const auth = require('./auth');
const { clientIp } = auth;

const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const col = (v, d) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : d);
const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/i;
const NICK = /^[\p{L}\p{N} ._-]{3,20}$/u;
const now = () => Date.now();
// doğum tarihi: YYYY-AA-GG, gerçek bir gün, 1900 sonrası ve geçmişte; yaş (tam yıl) döner
function birth(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || '').trim()); if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3], dt = new Date(Date.UTC(y, mo - 1, d));
  if (y < 1900 || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  const t = new Date(now() + 3 * 3600e3); // Türkiye saati
  let age = t.getUTCFullYear() - y; if (t.getUTCMonth() + 1 < mo || (t.getUTCMonth() + 1 === mo && t.getUTCDate() < d)) age--;
  if (age < 0 || age > 120) return null;
  return { bd: m[0], age };
}
// ad / soyad: harf, boşluk, kesme ve tire; 2–30 karakter
const NAME = /^[\p{L}][\p{L} '’.-]{1,29}$/u;
const cap = v => String(v || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr').replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('tr'));
// telefon: Türkiye cep (05xx…) +90 biçimine çevrilir; yurt dışı numaralar + ile 10–15 hane
function phone(v) {
  const raw = String(v || '').replace(/[\s().-]/g, '');
  let m = /^(?:\+?90|0)?(5\d{9})$/.exec(raw); if (m) return '+90' + m[1];
  m = /^(?:\+|00)(\d{10,15})$/.exec(raw); if (m && !m[1].startsWith('90')) return '+' + m[1];
  return null;
}
const telFmt = t => { const m = /^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(t || ''); return m ? `0${m[1]} ${m[2]} ${m[3]} ${m[4]}` : (t || ''); };
// yeni katılımcı bilgileri: hata metni ya da null
function newUserError(d, { ad, soyad, bd, tel, consent }) {
  if (!NAME.test(ad)) return 'Adınızı yazın';
  if (!NAME.test(soyad)) return 'Soyadınızı yazın';
  const b = birth(bd); if (!b) return bd ? 'Geçerli bir doğum tarihi girin' : 'Doğum tarihinizi girin';
  if (d.minAge && b.age < d.minAge) return `Bu lige ${d.minAge} yaş ve üzeri katılabilir`;
  if (!phone(tel)) return tel ? 'Geçerli bir cep telefonu numarası yazın (05xx xxx xx xx)' : 'Telefon numaranızı yazın';
  if (consent !== true) return 'Devam etmek için aydınlatma metnini onaylayın';
  return null;
}
const nickTaken = (d, nick, except) => Object.entries(d.users).some(([id, u]) => id !== except && u.nick.toLocaleLowerCase('tr') === nick.toLocaleLowerCase('tr'));
// kullanıcı adı: "Ahmet Y." — doluysa "Ahmet Y. 2", "Ahmet Y. 3"…
function makeNick(d, ad, soyad) {
  const first = ad.split(' ')[0].replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 14) || 'Oyuncu', base = `${first} ${soyad.replace(/[^\p{L}]/gu, '').charAt(0).toLocaleUpperCase('tr')}.`;
  if (!nickTaken(d, base)) return base;
  for (let i = 2; i < 10000; i++) { const n = `${base} ${i}`; if (!nickTaken(d, n)) return n; }
  return base + ' ' + P.rnd(4);
}
function newUser(d, { email, ad, soyad, bd, tel, showBday, consentAt, via }) {
  if (Object.keys(d.users).length >= 5000) return null;
  const uid = P.rnd(10); d.users[uid] = { nick: makeNick(d, ad, soyad), ad, soyad, email, bd, tel, via, at: now(), consentAt, tk: [] };
  if (showBday) d.users[uid].showBday = true;
  return uid;
}
function issue(t, u) {
  const tk = crypto.randomBytes(32).toString('hex');
  u.tk = [P.sha(tk), ...(u.tk || [])].slice(0, 5); u.seen = now();
  tenants.save(t);
  return tk;
}

// ---- basit hız sınırı (bellekte) ----
const hits = new Map();
function limited(key, max, winMs) {
  const t = now(), h = hits.get(key) || [];
  const recent = h.filter(x => t - x < winMs);
  if (recent.length >= max) { hits.set(key, recent); return true; }
  recent.push(t); hits.set(key, recent);
  if (hits.size > 20000) for (const [k, v] of hits) if (!v.length || t - v[v.length - 1] > 3600e3) hits.delete(k);
  return false;
}
// ---- müşteri isteği: işletme ve (varsa) oturumdaki kullanıcı ----
function ctx(req, res) {
  const t = P.byCode(req.params.code);
  if (!t || !P.isOn(t)) { res.status(404).json({ error: 'Bu tahmin ligi şu an kapalı' }); return null; }
  const d = P.cfg(t);
  const tk = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  let uid = null;
  if (/^[a-f0-9]{64}$/.test(tk)) { const h = P.sha(tk); for (const [id, u] of Object.entries(d.users)) if (!u.off && (u.tk || []).includes(h)) { uid = id; break; } }
  return { t, d, uid, user: uid ? d.users[uid] : null };
}

// maç → müşteriye giden görünüm (kendi tahmini ve puanı ile)
function matchView(m, pick) {
  const locked = m.st !== 'pre' || m.at <= now();
  const o = pick ? P.pointsFor(pick, m) : null;
  return { id: m.id, at: m.at, st: m.st, locked, home: m.home, away: m.away, sc: m.st === 'pre' ? null : m.sc,
    res: m.res ? { yc: m.res.yc, rc: m.res.rc } : null, pick: pick || null, pts: o };
}

const googleOn = () => { try { const g = require('./routes-auth').gCfg(); return !!(g.id && g.secret); } catch (e) { return false; } };
const pub = express.Router();
pub.use((req, res, next) => { res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }); next(); });

// Durum: haftanın maçları, kendi tahminleri, puan durumu (haftalık + genel), geçen haftanın birincisi
pub.get('/:code/state', async (req, res) => {
  const c = ctx(req, res); if (!c) return;
  P.refreshFixtures().catch(() => {});
  const { t, d, uid, user } = c, key = P.weekKey(now()), picks = (uid && d.picks[uid]) || {};
  const nextKey = P.weekKey(now() + 7 * 86400e3);
  let ms = P.weekMatches(key);
  // bu haftanın tüm maçları başladıysa gelecek haftanınkiler de açılır (Salı'dan önce tahmin girilebilsin)
  const openNow = ms.some(m => m.st === 'pre' && m.at > now());
  const next = openNow ? [] : P.weekMatches(nextKey);
  const wk = P.board(t, key), all = P.board(t, null);
  const mine = r => r.find(x => x.uid === uid) || null;
  const strip = r => r && { rank: r.rank, nick: r.nick, pts: r.pts, me: r.uid === uid };
  const lastKey = P.weekKey(now() - 7 * 86400e3), lw = d.awards[lastKey];
  res.json({
    biz: t.name, prize: d.prize || '', pts: P.PTS, google: googleOn(), minAge: d.minAge || 0, qr: P.qrValid(t, req.query.k),
    me: user ? { nick: user.nick, mail: !user.noMail, name: [user.ad, user.soyad].filter(Boolean).join(' '), email: user.email.replace(/^(.).*?(.)?@/, (m, a, b) => a + '•••' + (b || '') + '@') } : null,
    week: { key, label: P.weekLabel(key) }, matches: ms.map(m => matchView(m, picks[m.id])),
    next: next.length ? { key: nextKey, label: P.weekLabel(nextKey), matches: next.map(m => matchView(m, picks[m.id])) } : null,
    board: { week: wk.slice(0, 20).map(strip), weekMe: strip(mine(wk)), all: all.slice(0, 20).map(strip), allMe: strip(mine(all)), players: wk.length },
    last: lw && !lw.none ? { nick: lw.nick, pts: lw.pts, week: P.weekLabel(lastKey) } : null,
  });
});

// Maçın iki takımının kadrosu (golcü / asist seçimi)
pub.get('/:code/squad/:mid', async (req, res) => {
  const c = ctx(req, res); if (!c) return;
  const m = P.matches[String(req.params.mid)]; if (!m) return res.status(404).json({ error: 'Maç bulunamadı' });
  const [h, a] = await Promise.all([P.squad(m.home.id), P.squad(m.away.id)]);
  res.set('Cache-Control', 'private, max-age=600');
  res.json({ home: { name: m.home.name, players: h }, away: { name: m.away.name, players: a } });
});

// Google ile ilk kayıt: Google dönüşündeki imzalı belirteç (gt; QR anahtarı orada doğrulandı) + ad, soyad, doğum tarihi, onay
pub.post('/:code/gsignup', (req, res) => {
  const c = ctx(req, res); if (!c) return;
  const b = req.body || {}, g = auth.verify(String(b.gt || ''));
  if (!g || g.kind !== 'lig_g' || g.tid !== c.t.id || !g.email) return res.status(400).json({ error: 'Oturumun süresi doldu; ekrandaki QR kodu yeniden okutun' });
  const d = c.d, email = String(g.email).toLowerCase();
  let uid = Object.keys(d.users).find(id => d.users[id].email === email);
  if (!uid) {
    const ad = cap(b.ad), soyad = cap(b.soyad);
    const er = newUserError(d, { ad, soyad, bd: b.bd, tel: b.tel, consent: b.consent });
    if (er) return res.status(400).json({ error: er });
    uid = newUser(d, { email, ad, soyad, bd: birth(b.bd).bd, tel: phone(b.tel), showBday: b.showBday === true, consentAt: now(), via: 'google' });
    if (!uid) return res.status(403).json({ error: 'Lig dolu' });
  } else if (d.users[uid].off) return res.status(403).json({ error: 'Bu hesap işletme tarafından kapatıldı' });
  const u = d.users[uid];
  res.json({ ok: true, token: issue(c.t, u), nick: u.nick });
});
// Google dönüşü (routes-auth geri çağrısından): kayıtlıysa oturum aç; değilse QR anahtarı geçerliyse kayıt formuna imzalı e-posta taşı.
// Oturum anahtarı adres çubuğunda # içinde taşınır (sunucuya ve günlüklere gitmez), sayfa hemen siler.
function googleDone(req, res, code, email, k, gn) {
  const t = P.byCode(code), back = h => res.redirect(`/lig/${encodeURIComponent(String(code))}#${h}`);
  if (!t || !P.isOn(t)) return back('gerr=kapali');
  const d = P.cfg(t), uid = Object.keys(d.users).find(id => d.users[id].email === email);
  if (uid) {
    if (d.users[uid].off) return back('gerr=kapatildi');
    return back('tk=' + issue(t, d.users[uid]));
  }
  if (!P.qrValid(t, k)) return back('gerr=qr'); // işletmedeki ekranı okutmadan yeni kayıt yok
  const q = new URLSearchParams({ gs: auth.sign({ kind: 'lig_g', tid: t.id, email, exp: now() + 20 * 60e3 }), ge: email, ga: cap(gn && gn.ad).slice(0, 30), gy: cap(gn && gn.soyad).slice(0, 30) });
  back(q.toString());
}
// Haftalık e-postayı kapat / aç
pub.get('/:code/unsub', (req, res) => {
  const t = P.byCode(req.params.code), uid = String(req.query.u || ''), d = t && P.cfg(t), u = d && d.users[uid];
  res.type('html');
  if (!u || String(req.query.s || '') !== P.unsubSig(t, uid)) return res.status(400).send('<meta charset="utf-8"><p style="font:16px sans-serif;padding:24px">Bağlantı geçersiz.</p>');
  u.noMail = true; tenants.save(t);
  res.send(`<meta charset="utf-8"><meta name="viewport" content="width=device-width"><p style="font:16px sans-serif;padding:24px">${esc(t.name)} Tahmin Ligi haftalık e-postaları kapatıldı. Tahmin sayfasından yeniden açabilirsiniz.</p>`);
});
pub.post('/:code/mail', (req, res) => {
  const c = ctx(req, res); if (!c) return;
  if (!c.uid) return res.status(401).json({ error: 'Önce giriş yapın' });
  c.user.noMail = (req.body || {}).on === false ? true : undefined; if (!c.user.noMail) delete c.user.noMail;
  tenants.save(c.t); res.json({ ok: true, mail: !c.user.noMail });
});

// Tahmin kaydet (maç başlayana kadar değiştirilebilir). Boş alanlar tahmin edilmemiş sayılır.
pub.post('/:code/pick', async (req, res) => {
  const c = ctx(req, res); if (!c) return;
  if (!c.uid) return res.status(401).json({ error: 'Önce giriş yapın' });
  if (limited('pk|' + c.t.id + '|' + c.uid, 60, 60e3)) return res.status(429).json({ error: 'Çok hızlı; biraz bekleyin' });
  const b = req.body || {}, m = P.matches[String(b.mid || '')];
  if (!m) return res.status(404).json({ error: 'Maç bulunamadı' });
  const nowWk = P.weekKey(now()), nextWk = P.weekKey(now() + 7 * 86400e3);
  if (m.wk !== nowWk && m.wk !== nextWk) return res.status(400).json({ error: 'Bu maça tahmin girilemez' });
  if (m.st !== 'pre' || m.at <= now()) return res.status(409).json({ error: 'Maç başladı; tahmin değiştirilemez' });
  const int = (v, lo, hi) => (v === '' || v == null ? undefined : Number.isInteger(+v) && +v >= lo && +v <= hi ? +v : NaN);
  const h = int(b.h, 0, 20), a = int(b.a, 0, 20), yc = int(b.yc, 0, 20);
  if ([h, a, yc].some(Number.isNaN)) return res.status(400).json({ error: 'Geçersiz sayı' });
  if ((h === undefined) !== (a === undefined)) return res.status(400).json({ error: 'Skor için iki takımın golünü de yazın' });
  const rc = typeof b.rc === 'boolean' ? b.rc : undefined;
  // gol kutuları: tahmin edilen skordan fazla olamaz; golcü ve asist yalnız golü atan takımdan, asist golcünün kendisi olamaz
  const raw = Array.isArray(b.gl) ? b.gl.slice(0, 41) : [];
  const want = { h: h || 0, a: a || 0 }, cnt = { h: 0, a: 0 }, gl = [];
  const ycr = Array.isArray(b.ycl) ? b.ycl.slice(0, 21) : [], rcr = Array.isArray(b.rcl) ? b.rcl.slice(0, 6) : [];
  const sq = {};
  for (const side of ['h', 'a']) if (raw.some(x => x && x.s === side) || ycr.length || rcr.length) {
    const list = await P.squad((side === 'h' ? m.home : m.away).id); sq[side] = new Map(list.map(x => [x.id, x]));
  }
  for (const x of raw) {
    if (!x || (x.s !== 'h' && x.s !== 'a')) return res.status(400).json({ error: 'Geçersiz gol seçimi' });
    const g = x.g ? String(x.g) : '', as = x.a ? String(x.a) : '';
    if (!g && !as) continue;
    if (h === undefined) return res.status(400).json({ error: 'Golcü ve asist seçmek için önce skoru yazın' });
    if (++cnt[x.s] > want[x.s]) return res.status(400).json({ error: 'Golcü ve asist sayısı tahmin ettiğiniz gol sayısını geçemez' });
    const M = sq[x.s], team = x.s === 'h' ? m.home.name : m.away.name;
    for (const id of [g, as]) if (id && (!/^\d{1,12}$/.test(id) || (M.size && !M.has(id)))) return res.status(400).json({ error: `Golcü ve asist yalnız ${team} oyuncularından seçilebilir` });
    if (g && g === as) return res.status(400).json({ error: 'Oyuncu kendi golüne asist yapamaz' });
    const nm = (id, v) => (M.get(id) || {}).name || String(v || '').slice(0, 60);
    const o = { s: x.s }; if (g) { o.g = g; o.gn = nm(g, x.gn); } if (as) { o.a = as; o.an = nm(as, x.an); }
    gl.push(o);
  }
  // kart görecek oyuncular: sarıda en fazla tahmin edilen sarı kart sayısı kadar, kırmızıda "çıkar" denmişse en fazla 3; iki takımdan da seçilebilir
  const cardList = (list, max, what) => {
    const out = [], seen = new Set();
    for (const x of list) {
      const id = String((x && x.id) || ''); if (!id) continue;
      if (seen.has(id)) return { error: `Aynı oyuncu ${what} listesinde iki kez seçilemez` };
      if (!/^\d{1,12}$/.test(id)) return { error: 'Geçersiz oyuncu' };
      const side = sq.h && sq.h.has(id) ? 'h' : sq.a && sq.a.has(id) ? 'a' : (sq.h && sq.h.size) || (sq.a && sq.a.size) ? null : (x.s === 'a' ? 'a' : 'h');
      if (!side) return { error: 'Oyuncu bu maçın takımlarında değil' };
      seen.add(id); out.push({ id, n: ((sq[side] && sq[side].get(id)) || {}).name || String(x.n || '').slice(0, 60), s: side });
    }
    if (out.length > max) return { error: max ? `En fazla ${max} oyuncu seçebilirsiniz` : (what === 'sarı kart' ? 'Sarı kart görecek oyuncu seçmek için önce sarı kart sayısını yazın' : 'Kırmızı kart görecek oyuncu seçmek için "Çıkar" seçin') };
    return { out };
  };
  const yr = cardList(ycr, yc || 0, 'sarı kart'); if (yr.error) return res.status(400).json({ error: yr.error });
  const rr = cardList(rcr, rc === true ? 3 : 0, 'kırmızı kart'); if (rr.error) return res.status(400).json({ error: rr.error });
  const p = { at: now() };
  if (h !== undefined) { p.h = h; p.a = a; }
  if (yr.out.length) p.ycl = yr.out;
  if (rr.out.length) p.rcl = rr.out;
  if (gl.length) p.gl = gl;
  if (yc !== undefined) p.yc = yc;
  if (rc !== undefined) p.rc = rc;
  const picks = c.d.picks[c.uid] || (c.d.picks[c.uid] = {});
  if (Object.keys(p).length === 1) delete picks[m.id]; else picks[m.id] = p; // hepsi boş: tahmin silinir
  tenants.save(c.t);
  res.json({ ok: true, pick: picks[m.id] || null });
});

pub.post('/:code/logout', (req, res) => {
  const c = ctx(req, res); if (!c) return;
  if (c.user) { const h = P.sha(String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()); c.user.tk = (c.user.tk || []).filter(x => x !== h); tenants.save(c.t); }
  res.json({ ok: true });
});
// KVKK: hesabı ve tahminleri sil
pub.delete('/:code/me', (req, res) => {
  const c = ctx(req, res); if (!c) return;
  if (!c.uid) return res.status(401).json({ error: 'Önce giriş yapın' });
  delete c.d.users[c.uid]; delete c.d.picks[c.uid];
  tenants.save(c.t);
  res.json({ ok: true });
});

// ---- müşteri sayfası ----
function page(req, res) {
  const t = P.byCode(req.params.code);
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
  if (!t || !P.isOn(t)) return res.status(404).type('text/plain; charset=utf-8').send('Bu tahmin ligi şu an kapalı');
  const th = t.db.theme || {}, bg = col(th.bg, '#151717'), ac = col(th.accent, '#906538'), ac2 = col(th.accent2, '#c9955c'), tx = col(th.text, '#fbfbfb');
  const logo = t.db.logo ? t.upBase + t.db.logo : '';
  const code = P.cfg(t).code;
  res.type('html').send(require('./predict-page').html({ name: t.name, logo, code, bg, ac, ac2, tx, esc }));
}

// ---- panel ----
function admin(r, { changed, ownerOnly }) {
  const view = t => {
    const d = P.cfg(t), key = P.weekKey(now()), lastKey = P.weekKey(now() - 7 * 86400e3);
    const mask = e => String(e || '').replace(/^(.{1,2}).*?@/, (m, a) => a + '•••@');
    return {
      on: !!d.on, pro: require('./plans').plan(t).pro, prize: d.prize || '', every: Number(d.every) || 8, url: P.urlOf(t), pts: P.PTS,
      week: { key, label: P.weekLabel(key), board: P.board(t, key).slice(0, 50).map(({ uid, nick, pts, exact, n }) => ({ uid, nick, pts, exact, n })) },
      all: P.board(t, null).slice(0, 50).map(({ uid, nick, pts, exact, n }) => ({ uid, nick, pts, exact, n })),
      last: { key: lastKey, label: P.weekLabel(lastKey), done: P.weekDone(lastKey) },
      awards: Object.entries(d.awards).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12).map(([k, a]) => ({ key: k, label: P.weekLabel(k), ...(a.none ? { none: true } : { nick: a.nick, pts: a.pts, given: !!a.given, prize: a.prize || '', email: mask((d.users[a.uid] || {}).email) }) })),
      minAge: d.minAge || 0,
      google: googleOn(),
      users: Object.entries(d.users).map(([uid, u]) => { const b = birth(u.bd); return { uid, nick: u.nick, name: [u.ad, u.soyad].filter(Boolean).join(' '), mail: !u.noMail, tel: u.tel ? telFmt(u.tel).replace(/\d{2} \d{2}$/, '•• ••') : '', showBday: !!u.showBday, email: mask(u.email), at: u.at, off: !!u.off, age: b ? b.age : null, via: u.via || 'email', n: Object.keys(d.picks[uid] || {}).length }; }).sort((a, b) => b.at - a.at).slice(0, 500),
      userCount: Object.keys(d.users).length,
    };
  };
  r.get('/predict', (req, res) => res.json(view(req.t)));
  r.put('/predict', ownerOnly, (req, res) => {
    const d = P.cfg(req.t), b = req.body || {};
    if (typeof b.on === 'boolean') d.on = b.on;
    if (typeof b.prize === 'string') d.prize = b.prize.trim().slice(0, 120);
    if (b.minAge != null) d.minAge = [0, 18].includes(+b.minAge) ? +b.minAge : 0;
    if (b.every != null) d.every = Math.max(3, Math.min(30, Math.round(Number(b.every)) || 8));
    if (d.on) P.start();
    changed(req.t);
    res.json(view(req.t));
  });
  // ödül verildi işareti
  r.post('/predict/award/:key', (req, res) => {
    const d = P.cfg(req.t), a = d.awards[String(req.params.key)];
    if (!a || a.none) return res.status(404).json({ error: 'Bu hafta için kazanan yok' });
    a.given = !!(req.body || {}).given; a.givenAt = a.given ? now() : undefined;
    changed(req.t); res.json(view(req.t));
  });
  // katılımcıyı düzenle: tam bilgiler yalnız sahibe (e-posta maskesiz)
  r.get('/predict/user/:uid', ownerOnly, (req, res) => {
    const d = P.cfg(req.t), uid = String(req.params.uid), u = d.users[uid];
    if (!u) return res.status(404).json({ error: 'Katılımcı bulunamadı' });
    res.json({ uid, nick: u.nick, ad: u.ad || '', soyad: u.soyad || '', mail: !u.noMail, tel: telFmt(u.tel), showBday: !!u.showBday, email: u.email, bd: u.bd || '', via: u.via || 'email', at: u.at, off: !!u.off, picks: Object.keys(d.picks[uid] || {}).length });
  });
  r.put('/predict/user/:uid', ownerOnly, (req, res) => {
    const d = P.cfg(req.t), uid = String(req.params.uid), u = d.users[uid], b = req.body || {};
    if (!u) return res.status(404).json({ error: 'Katılımcı bulunamadı' });
    const nick = String(b.nick == null ? u.nick : b.nick).trim().replace(/\s+/g, ' ');
    const email = String(b.email == null ? u.email : b.email).trim().toLowerCase().slice(0, 200);
    if (!NICK.test(nick)) return res.status(400).json({ error: 'Kullanıcı adı 3–20 karakter olmalı (harf, rakam, boşluk, . _ -)' });
    if (nickTaken(d, nick, uid)) return res.status(409).json({ error: 'Bu kullanıcı adı başka bir katılımcıda' });
    if (!EMAIL.test(email)) return res.status(400).json({ error: 'Geçerli bir e-posta adresi yazın' });
    if (Object.entries(d.users).some(([id, x]) => id !== uid && x.email === email)) return res.status(409).json({ error: 'Bu e-posta başka bir katılımcıda' });
    let bd = u.bd;
    if (b.bd != null) { if (b.bd === '') bd = undefined; else { const x = birth(b.bd); if (!x) return res.status(400).json({ error: 'Doğum tarihi geçersiz' }); bd = x.bd; } }
    const ad = b.ad == null ? u.ad : cap(b.ad), soyad = b.soyad == null ? u.soyad : cap(b.soyad);
    if (ad && !NAME.test(ad)) return res.status(400).json({ error: 'Ad geçersiz' });
    if (soyad && !NAME.test(soyad)) return res.status(400).json({ error: 'Soyad geçersiz' });
    let tel = u.tel;
    if (b.tel != null) { if (b.tel === '') tel = undefined; else { tel = phone(b.tel); if (!tel) return res.status(400).json({ error: 'Telefon numarası geçersiz' }); } }
    if (email !== u.email) u.tk = []; // e-posta değişince eski oturumlar kapanır
    if (tel) u.tel = tel; else delete u.tel;
    if (typeof b.showBday === 'boolean') { if (b.showBday) u.showBday = true; else delete u.showBday; }
    if (ad) u.ad = ad; if (soyad) u.soyad = soyad;
    if (typeof b.mail === 'boolean') { if (b.mail) delete u.noMail; else u.noMail = true; }
    u.nick = nick; u.email = email; if (bd) u.bd = bd; else delete u.bd;
    // kesinleşmiş haftalık birincilik kayıtlarındaki takma ad da güncellensin
    for (const a of Object.values(d.awards)) if (a && a.uid === uid) a.nick = nick;
    changed(req.t); res.json(view(req.t));
  });
  // Bugün doğanlar: ekran ayarı ve listeler (bugün + önümüzdeki 7 gün)
  const bdayView = t => {
    const c = t.db.bdayShow || {}, row = x => ({ uid: x.uid, nick: x.u.nick, name: [x.u.ad, x.u.soyad].filter(Boolean).join(' '), age: x.age, tel: telFmt(x.u.tel), ok: !!x.u.showBday });
    const next = []; for (let i = 1; i <= 7; i++) { const ms = now() + i * 86400e3; for (const x of P.bdayList(t, ms)) next.push({ ...row(x), in: i }); }
    return { on: !!c.on, every: Number(c.every) || 6, pro: require('./plans').plan(t).pro, today: P.bdayList(t).map(row), next, users: Object.keys(P.cfg(t).users).length };
  };
  r.get('/predict/bday', (req, res) => res.json(bdayView(req.t)));
  r.put('/predict/bday', ownerOnly, (req, res) => {
    const b = req.body || {}, c = req.t.db.bdayShow || (req.t.db.bdayShow = {});
    if (typeof b.on === 'boolean') c.on = b.on;
    if (b.every != null) c.every = Math.max(3, Math.min(30, Math.round(Number(b.every)) || 6));
    changed(req.t); res.json(bdayView(req.t));
  });
  // müşteri listesi (Excel uyumlu CSV: ; ayraçlı, UTF-8 BOM) — yalnız işletme sahibi
  r.get('/predict/export.csv', ownerOnly, (req, res) => {
    const d = P.cfg(req.t), q = v => { const x = String(v == null ? '' : v); return /[";\n\r]|^[=+\-@]/.test(x) ? '"' + x.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""') + '"' : x; };
    const day = ms => (ms ? new Date(ms + 3 * 3600e3).toISOString().slice(0, 10) : '');
    const rows = [['Kullanıcı adı', 'Ad', 'Soyad', 'E-posta', 'Telefon', 'Doğum tarihi', 'Yaş', 'Kayıt tarihi', 'Haftalık e-posta', 'Doğum gününde ekranda', 'Durum']];
    for (const u of Object.values(d.users).sort((a, b) => (a.at || 0) - (b.at || 0))) {
      const bb = birth(u.bd);
      rows.push([u.nick, u.ad || '', u.soyad || '', u.email, telFmt(u.tel), u.bd || '', bb ? bb.age : '', day(u.at), u.noMail ? 'Hayır' : 'Evet', u.showBday ? 'Evet' : 'Hayır', u.off ? 'Ligden çıkarıldı' : 'Aktif']);
    }
    const name = 'musteriler-' + day(now()) + '.csv';
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' });
    res.send('\ufeff' + rows.map(r => r.map(q).join(';')).join('\r\n'));
  });
  // katılımcıyı ve tahminlerini sil (geçmiş birincilik kaydı takma adla kalır)
  r.delete('/predict/user/:uid', ownerOnly, (req, res) => {
    const d = P.cfg(req.t), uid = String(req.params.uid);
    if (!d.users[uid]) return res.status(404).json({ error: 'Katılımcı bulunamadı' });
    delete d.users[uid]; delete d.picks[uid];
    changed(req.t); res.json(view(req.t));
  });
  // kural dışı katılımcıyı kapat / aç (puan durumundan çıkar)
  r.post('/predict/user/:uid', ownerOnly, (req, res) => {
    const d = P.cfg(req.t), u = d.users[String(req.params.uid)];
    if (!u) return res.status(404).json({ error: 'Katılımcı bulunamadı' });
    u.off = !!(req.body || {}).off; if (u.off) u.tk = [];
    changed(req.t); res.json(view(req.t));
  });
}

module.exports = { pub, page, admin, googleDone, birth, phone };
