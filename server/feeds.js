// Paylaşılan veri akışları. Herkese ortak veri (maç, kur, haber…) bir kez çekilir; hava ve eczane konum başına bir kez.
// Müşteri sayısı arttıkça dış API çağrısı neredeyse sabit kalır.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const config = require('./config');
const store = require('./store');
const tenants = require('./tenants');
const { plan, access } = require('./plans');
const hub = require('./hub');

const { DATA_DIR, TZ } = config;
const MIN = 60 * 1000, HOUR = 60 * MIN;

// ---- Diske yazılan önbellek: yeniden başlatmada elde veri olur ----
const CACHE_FILE = path.join(DATA_DIR, 'cache.json');
let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch (e) { /* ilk açılış */ }
let cacheTimer;
const cacheSave = () => { clearTimeout(cacheTimer); cacheTimer = setTimeout(() => fs.writeFile(CACHE_FILE, JSON.stringify(cache), () => {}), 1500); };
const cacheAge = key => (cache[key] ? Date.now() - cache[key].at : Infinity);
const cacheGet = key => (cache[key] ? cache[key].data : null);
const cachePut = (key, data) => { cache[key] = { at: Date.now(), data }; cacheSave(); };

const ymd = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const hm = d => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').toLowerCase();

// Ekranı çalışan işletmeler (deneme/ödeme süresi geçerli)
const liveTenants = () => tenants.all().filter(t => access(t).ok);
const proTenants = () => liveTenants().filter(t => plan(t).pro);
const platformKey = name => store.setting(name, '');

// ESPN takım adlarını ASCII verir (Fenerbahce, Besiktas…): Türkçe karakterli hâle çevrilir
const TR_WORDS = { Fenerbahce: 'Fenerbahçe', Besiktas: 'Beşiktaş', Goztepe: 'Göztepe', Basaksehir: 'Başakşehir', Istanbul: 'İstanbul', Kasimpasa: 'Kasımpaşa', Caykur: 'Çaykur', Genclerbirligi: 'Gençlerbirliği', Karagumruk: 'Karagümrük', Eyupspor: 'Eyüpspor', Umraniyespor: 'Ümraniyespor', Ankaragucu: 'Ankaragücü', Kecioren: 'Keçiören', Keciorengucu: 'Keçiörengücü', Bandirma: 'Bandırma', Corum: 'Çorum', Sanliurfa: 'Şanlıurfa', Igdir: 'Iğdır', Gazisehir: 'Gazişehir', Buyuksehir: 'Büyükşehir', Umraniye: 'Ümraniye', Bodrumspor: 'Bodrum', Genc: 'Genç', Gucu: 'Gücü', Cagdas: 'Çağdaş', Eskisehirspor: 'Eskişehirspor', Altinordu: 'Altınordu', Gencler: 'Gençler', Kirklarelispor: 'Kırklarelispor', Kirikkale: 'Kırıkkale', Usakspor: 'Uşakspor', Sanliurfaspor: 'Şanlıurfaspor', Istanbulspor: 'İstanbulspor' };
const trTeam = n => String(n || '').replace(/[A-Za-z]+/g, w => TR_WORDS[w] || w);

// ================= HAVA DURUMU: konum başına =================
const locKey = t => { const l = t.db.location || {}; return `${Number(l.lat || 41.01).toFixed(2)},${Number(l.lon || 28.98).toFixed(2)}`; };
const weather = new Map(Object.entries(cacheGet('weatherByLoc') || {}));
const weatherAt = new Map();
async function refreshWeather() {
  const keys = new Set(liveTenants().map(locKey));
  for (const key of keys) {
    if (weather.has(key) && Date.now() - (weatherAt.get(key) || 0) < 30 * MIN) continue;
    const [lat, lon] = key.split(',');
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=Europe%2FIstanbul&forecast_days=1`);
      const j = await r.json();
      weather.set(key, { temp: j.current.temperature_2m, feels: j.current.apparent_temperature, code: j.current.weather_code, wind: j.current.wind_speed_10m, day: !!j.current.is_day, max: j.daily.temperature_2m_max[0], min: j.daily.temperature_2m_min[0] });
      weatherAt.set(key, Date.now());
      for (const t of liveTenants()) if (locKey(t) === key) hub.pushTenant(t.id);
    } catch (e) { console.error('Hava durumu alınamadı', key, e.message); }
  }
  cachePut('weatherByLoc', Object.fromEntries(weather));
}

// ================= KURLAR: herkese ortak =================
let rates = cacheGet('rates') || { usd: null, eur: null, gold: null, updated: null };
async function refreshRates() {
  if (cacheAge('rates:fx') > 60 * MIN || rates.gbp == null) {
    try {
      const j = await (await fetch('https://open.er-api.com/v6/latest/USD')).json();
      const t = j.rates.TRY;
      rates = { ...rates, usd: t, eur: t / j.rates.EUR, gbp: j.rates.GBP ? t / j.rates.GBP : rates.gbp, updated: new Date().toISOString() };
      cachePut('rates:fx', true); cachePut('rates', rates);
      hub.send(() => true, { type: 'rates', rates });
    } catch (e) { console.error('Kur alınamadı:', e.message); }
  }
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const pv = t => (parts.find(p => p.type === t) || {}).value;
  const mins = Number(pv('hour')) * 60 + Number(pv('minute')), weekday = !['Sat', 'Sun'].includes(pv('weekday'));
  const marketOpen = weekday && mins >= 9 * 60 + 30 && mins <= 18 * 60 + 30;
  if (cacheAge('rates:gold') > (marketOpen ? 15 * MIN : 2 * HOUR) || rates.bist == null) {
    try {
      const g = await (await fetch('https://finans.truncgil.com/v4/today.json')).json();
      rates = { ...rates, gold: Number(g.GRA.Selling), goldCh: Number(g.GRA.Change) };
      if (g.XU100 && Number(g.XU100.Selling) > 0) rates = { ...rates, bist: Number(g.XU100.Selling), bistCh: Number(g.XU100.Change) };
      cachePut('rates:gold', true); cachePut('rates', rates);
      hub.send(() => true, { type: 'rates', rates });
    } catch (e) { console.error('Altın/BIST alınamadı:', e.message); }
  }
  if (cacheAge('rates:btc') > 10 * MIN) {
    try {
      let btc;
      try {
        const j = await (await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true')).json();
        btc = { usd: Number(j.bitcoin.usd), ch: Number(j.bitcoin.usd_24h_change) };
        if (!(btc.usd > 0)) throw new Error('boş');
      } catch (e1) {
        const j = await (await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT')).json();
        btc = { usd: Number(j.lastPrice), ch: Number(j.priceChangePercent) };
        if (!(btc.usd > 0)) throw new Error('Bitcoin verisi alınamadı');
      }
      rates = { ...rates, btc: btc.usd, btcCh: btc.ch };
      cachePut('rates:btc', true); cachePut('rates', rates);
      hub.send(() => true, { type: 'rates', rates });
    } catch (e) { console.error('Bitcoin alınamadı:', e.message); }
  }
}

// ================= MAÇLAR VE PUAN DURUMU (yalnızca Pro işletmeler; seçili liglerin birleşimi çekilir) =================
const CATALOG = [
  ['tur.1', 'Süper Lig', 'Türkiye'], ['tur.2', 'TFF 1. Lig', 'Türkiye'],
  ['uefa.champions', 'Şampiyonlar Ligi', 'Avrupa Kupaları'], ['uefa.europa', 'Avrupa Ligi', 'Avrupa Kupaları'],
  ['uefa.europa.conf', 'Konferans Ligi', 'Avrupa Kupaları'], ['uefa.nations', 'UEFA Uluslar Ligi', 'Avrupa Kupaları'],
  ['uefa.champions_qual', 'Şampiyonlar Ligi Eleme', 'Avrupa Kupaları'], ['uefa.euro', 'Avrupa Şampiyonası', 'Avrupa Kupaları'],
  ['esp.1', 'La Liga', 'İspanya'], ['esp.2', 'La Liga 2', 'İspanya'],
  ['eng.1', 'Premier Lig', 'İngiltere'], ['eng.2', 'Championship', 'İngiltere'], ['eng.fa', 'FA Cup', 'İngiltere'],
  ['ita.1', 'Serie A', 'İtalya'], ['ita.2', 'Serie B', 'İtalya'],
  ['ger.1', 'Bundesliga', 'Almanya'], ['ger.2', '2. Bundesliga', 'Almanya'],
  ['fra.1', 'Ligue 1', 'Fransa'], ['fra.2', 'Ligue 2', 'Fransa'],
  ['ned.1', 'Hollanda Eredivisie', 'Diğer Ülkeler'], ['por.1', 'Portekiz Ligi', 'Diğer Ülkeler'],
  ['bel.1', 'Belçika Ligi', 'Diğer Ülkeler'], ['sco.1', 'İskoçya Ligi', 'Diğer Ülkeler'],
  ['gre.1', 'Yunanistan Süper Ligi', 'Diğer Ülkeler'], ['aut.1', 'Avusturya Ligi', 'Diğer Ülkeler'],
  ['sui.1', 'İsviçre Ligi', 'Diğer Ülkeler'], ['rus.1', 'Rusya Ligi', 'Diğer Ülkeler'],
  ['usa.1', 'MLS', 'Diğer Ülkeler'], ['bra.1', 'Brezilya Serie A', 'Diğer Ülkeler'], ['arg.1', 'Arjantin Ligi', 'Diğer Ülkeler'],
  ['fifa.world', 'Dünya Kupası', 'Diğer Ülkeler'],
];
const DEFAULT_LEAGUES = ['uefa.champions', 'uefa.europa', 'tur.1', 'tur.2', 'esp.1', 'eng.1', 'ita.1', 'ger.1', 'fra.1'];
const NO_TABLE = new Set(['eng.fa', 'fifa.world']);
const enabledLeagues = t => CATALOG.filter(([code]) => (t.db.leagues || DEFAULT_LEAGUES).includes(code)).map(([code, label]) => [code, label]);
const unionLeagues = () => { const set = new Set(); for (const t of proTenants()) for (const [c] of enabledLeagues(t)) set.add(c); return CATALOG.filter(([c]) => set.has(c)).map(([c, l]) => [c, l]); };

const standings = new Map();
for (const k of Object.keys(cache)) if (k.startsWith('standings:')) standings.set(k.slice(10), cache[k].data);
const standingsDirty = new Set();
async function refreshStandings() {
  const want = new Set(unionLeagues().map(([c]) => c));
  const targets = CATALOG.filter(([code, , group]) => want.has(code) && group !== 'Avrupa Kupaları' && !NO_TABLE.has(code));
  await Promise.all(targets.map(async ([code]) => {
    if (!standingsDirty.has(code) && standings.has(code) && cacheAge('standings:' + code) < 6 * HOUR) return;
    try {
      standingsDirty.delete(code);
      const j = await (await fetch(`https://site.api.espn.com/apis/v2/sports/soccer/${code}/standings`)).json();
      const ch = j.children || [];
      if (ch.length !== 1) { standings.delete(code); return; }
      const num = (e, n) => { const x = e.stats.find(s => s.name === n); return x ? (x.displayValue ?? String(x.value)) : ''; };
      const rows = ch[0].standings.entries.map(e => ({
        rank: Number(num(e, 'rank')), name: trTeam(e.team.shortDisplayName || e.team.displayName),
        logo: (e.team.logos || [])[0] ? e.team.logos[0].href : null,
        gp: num(e, 'gamesPlayed'), w: num(e, 'wins'), d: num(e, 'ties'), l: num(e, 'losses'), gd: num(e, 'pointDifferential'), pts: num(e, 'points'),
      })).sort((a, b) => a.rank - b.rank);
      standings.set(code, rows); cachePut('standings:' + code, rows);
    } catch (err) { console.error('Puan durumu alınamadı', code, err.message); }
  }));
  hub.pushAll();
}

let autoMatches = cacheAge('matches') < 20 * MIN ? (cacheGet('matches') || []) : [];
const finalSeen = new Set();
let finalBaseline = false;
const prevScores = new Map();
async function refreshMatches() {
  const leagues = unionLeagues();
  if (!leagues.length) { autoMatches = []; return; }
  const out = [], today = ymd(new Date()), nowMs = Date.now();
  const localNow = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(nowMs);
  const offsetMs = Math.round((Date.parse(localNow.replace(' ', 'T') + 'Z') - nowMs) / 60000) * 60000;
  const todayStart = Date.parse(today + 'T00:00:00Z') - offsetMs;
  const MATCH_MS = 2 * 3600 * 1000;
  for (const q of ['', '?dates=' + today.replace(/-/g, '')]) {
    await Promise.all(leagues.map(async ([code, label]) => {
      try {
        const j = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/scoreboard${q}`)).json();
        for (const e of j.events || []) {
          const st = e.status.type.state, when = new Date(e.date);
          if (st === 'post' && when.getTime() < todayStart && when.getTime() + MATCH_MS <= todayStart) continue;
          if (st === 'pre' && ymd(when) !== today) continue;
          const c = e.competitions[0].competitors;
          const home = c.find(x => x.homeAway === 'home'), away = c.find(x => x.homeAway === 'away');
          const d = ymd(when);
          out.push({
            id: e.id, league: label, home: trTeam(home.team.shortDisplayName || home.team.displayName), away: trTeam(away.team.shortDisplayName || away.team.displayName),
            ts: when.getTime(), day: d >= today || st !== 'pre' ? (d > today ? 'Yarın' : 'Bugün') : 'Dün', time: hm(when),
            hl: home.team.logo || null, al: away.team.logo || null, live: st === 'in', final: st === 'post',
            hs: st === 'pre' ? null : home.score, as: st === 'pre' ? null : away.score, clock: st === 'in' ? e.status.displayClock : null,
            lastGoal: (() => { const g = (e.competitions[0].details || []).filter(d => d.scoringPlay).pop(); return g ? { min: g.clock && g.clock.displayValue, player: ((g.athletesInvolved || [])[0] || {}).displayName || '', own: !!g.ownGoal, pen: !!g.penaltyKick } : null; })(),
          });
        }
      } catch (err) { console.error('Maç alınamadı', code, err.message); }
    }));
  }
  const seen = new Set(), rank = m => (m.live ? 0 : m.final ? 2 : 1);
  autoMatches = out.filter(m => !seen.has(m.id) && seen.add(m.id)).sort((a, b) => rank(a) - rank(b) || a.ts - b.ts);
  cachePut('matches', autoMatches);
  for (const m of autoMatches.filter(x => x.final)) {
    if (finalSeen.has(m.id)) continue;
    finalSeen.add(m.id);
    if (finalBaseline) { const c = CATALOG.find(([, label]) => label === m.league); if (c) { standingsDirty.add(c[0]); setTimeout(refreshStandings, 3 * MIN); setTimeout(refreshStandings, 15 * MIN); } }
  }
  finalBaseline = true;
  for (const m of autoMatches) {
    if (!m.live) continue;
    const cur = { h: +m.hs || 0, a: +m.as || 0 }, prev = prevScores.get(m.id);
    if (prev && (cur.h > prev.h || cur.a > prev.a)) {
      const g = m.lastGoal || {};
      const goal = { at: Date.now(), id: m.id, league: m.league, home: m.home, away: m.away, hs: m.hs, as: m.as, side: cur.h > prev.h ? 'home' : 'away', minute: g.min || m.clock, player: g.player || '', own: !!g.own, pen: !!g.pen };
      // gol yalnızca o ligi seçmiş Pro işletmelerin ekranlarına gider
      hub.send(t => plan(t).pro && access(t).ok && enabledLeagues(t).some(([, l]) => l === m.league), { type: 'goal', goal });
    }
    prevScores.set(m.id, cur);
  }
  hub.pushAll();
}
async function matchLoop() {
  await refreshMatches().catch(e => console.error('Maç döngüsü:', e.message));
  const now = Date.now(), live = autoMatches.some(m => m.live);
  const soon = autoMatches.some(m => !m.live && !m.final && m.ts - now < 3 * HOUR && m.ts - now > -15 * MIN);
  setTimeout(matchLoop, live ? 25 * 1000 : soon ? 2 * MIN : 10 * MIN);
}

// ================= TARİHTE BUGÜN (Vikipedi) =================
let onThisDay = cacheGet('onthisday');
async function refreshOnThisDay() {
  const today = ymd(new Date());
  if (onThisDay && onThisDay.date === today) return;
  const [, M, D] = today.split('-');
  try {
    const j = await (await fetch(`https://tr.wikipedia.org/api/rest_v1/feed/onthisday/events/${M}/${D}`, { headers: { accept: 'application/json', 'user-agent': `${config.BRAND}/2.0 (cafe display)` } })).json();
    const ev = (j.events || []).filter(e => e.year && e.text && e.text.length >= 30 && e.text.length <= 230).sort((a, b) => a.year - b.year);
    if (!ev.length) throw new Error('liste boş');
    const n = Math.min(6, ev.length), items = [];
    for (let i = 0; i < n; i++) items.push(ev[Math.floor(i * ev.length / n)]);
    onThisDay = { date: today, items: items.map(e => ({ year: e.year, text: e.text })) };
    cachePut('onthisday', onThisDay);
    hub.pushAll();
  } catch (e) { console.error('Tarihte bugün alınamadı:', e.message); }
}

// ================= CollectAPI: eczane (il+ilçe başına), haber (kategori başına), kitap =================
const dutyDay = () => ymd(new Date(Date.now() - 9 * HOUR)); // nöbet sabah 09:00'da değişir
const collectKey = () => platformKey('collect_key');
const collectPaid = () => platformKey('collect_paid') === '1';
const QUOTA = { pharm: { limit: 100, cap: 92 }, news: { limit: 1000, cap: 960 }, books: { limit: 1000, cap: 150 }, cal: { limit: 100, cap: 90 } };
const monthKey = () => ymd(new Date()).slice(0, 7);
let quota = cacheGet('quota') || {};
if (quota.month !== monthKey()) quota = { month: monthKey(), pharm: 0, news: 0, books: 0 };
const collectStats = { day: '', n: 0 };
let collectNext = 0;
async function collectFetch(url, key, svc) {
  if (quota.month !== monthKey()) quota = { month: monthKey(), pharm: 0, news: 0, books: 0 };
  if (svc && !collectPaid() && QUOTA[svc].cap - (quota[svc] || 0) <= 0) throw new Error(`Aylık ücretsiz kota doldu (${svc}). Süper yönetimden ücretli plan işaretlenebilir.`);
  if (svc) { quota[svc] = (quota[svc] || 0) + 1; cachePut('quota', quota); }
  const t = Math.max(Date.now(), collectNext);
  collectNext = t + (collectPaid() ? 1500 : 17000); // ücretsiz planda istek sınırı ~16 sn
  if (t > Date.now()) await new Promise(r => setTimeout(r, t - Date.now()));
  const day = ymd(new Date()); if (collectStats.day !== day) { collectStats.day = day; collectStats.n = 0; } collectStats.n++;
  const r = await fetch(url, { headers: { authorization: 'apikey ' + key, 'content-type': 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (r.status === 429) throw new Error('İstek sınırı aşıldı (429)');
  if (!r.ok || j.success === false) throw new Error(j.message || j.error || ('HTTP ' + r.status));
  return j;
}

// ---- Kalori (CollectAPI /food/calories): her ürün adı için yalnız BİR kez çağrılır, sonuç diskte süresiz saklanır (bulunamayanlar 60 gün) ----
let calDb = cacheGet('calories') || {}; let calPending = Promise.resolve();
const calKey = q => norm(q).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
async function calories(query) {
  const k = calKey(query); if (!k) throw new Error('Ürün adı gerekli');
  const hit = calDb[k];
  if (hit && (hit.kcal || Date.now() - hit.at < 60 * 24 * HOUR)) return hit.kcal ? { name: hit.name, kcal: hit.kcal, cached: true } : null;
  const key = collectKey(); if (!key) throw new Error('Kalori servisi henüz platformda etkin değil');
  const run = calPending.then(async () => {
    if (calDb[k] && (calDb[k].kcal || Date.now() - calDb[k].at < 60 * 24 * HOUR)) return calDb[k]; // sırada bekleyen aynı istek zaten çözüldü
    const j = await collectFetch(`${config.PHARM_BASE}/food/calories?query=${encodeURIComponent(query.trim())}`, key, 'cal');
    const list = (j.result || []).filter(x => x && x.kalori);
    const pick = list.find(x => calKey(x.name) === k) || list.find(x => calKey(x.name).startsWith(k)) || list[0];
    calDb[k] = pick ? { name: String(pick.name || query), kcal: String(pick.kalori).trim(), at: Date.now() } : { name: '', kcal: '', at: Date.now() };
    cachePut('calories', calDb);
    return calDb[k];
  });
  calPending = run.catch(() => {});
  const r = await run;
  return r.kcal ? { name: r.name, kcal: r.kcal } : null;
}

const pharmCfg = t => t.db.pharmacy || {};
const pharmSig = t => JSON.stringify([pharmCfg(t).il || 'İstanbul', (pharmCfg(t).districts || []).map(d => norm(d)).sort()]);
const pharmacies = new Map(Object.entries(cacheGet('pharmByLoc') || {}));
const pharmFail = new Map(); let pharmError = '';
async function fetchPharmacies(il, districts, key) {
  const out = [];
  for (const d of districts) {
    const j = await collectFetch(`${config.PHARM_BASE}/health/dutyPharmacy?ilce=${encodeURIComponent(d)}&il=${encodeURIComponent(il || 'İstanbul')}`, key, 'pharm');
    for (const p of j.result || []) out.push({ district: p.dist || p.district || d, name: p.name || p.pharmacyName || '', address: p.address || '', phone: p.phone || '' });
  }
  return out;
}
async function refreshPharmacies(force) {
  const key = collectKey(); if (!key) return;
  const bySig = new Map();
  for (const t of proTenants()) { const c = pharmCfg(t); if (c.enabled !== false && (c.districts || []).length) bySig.set(pharmSig(t), t); }
  const duty = dutyDay();
  for (const [sig, t] of bySig) {
    const cur = pharmacies.get(sig);
    if (!force && cur && cur.duty === duty && cur.items.length) continue;
    if (!force && Date.now() - (pharmFail.get(sig) || 0) < 3 * HOUR) continue;
    try {
      const c = pharmCfg(t);
      const items = await fetchPharmacies(c.il, c.districts.slice(0, 2), key);
      if (!items.length) throw new Error('Servis boş liste döndürdü');
      pharmacies.set(sig, { duty, items, updated: new Date().toISOString() });
      pharmError = ''; cachePut('pharmByLoc', Object.fromEntries(pharmacies));
      for (const x of proTenants()) if (pharmSig(x) === sig) hub.pushTenant(x.id);
    } catch (e) { pharmError = e.message; pharmFail.set(sig, Date.now()); console.error('Nöbetçi eczane alınamadı:', e.message); }
  }
}
const pharmFor = t => { const p = pharmacies.get(pharmSig(t)); return p && p.duty === dutyDay() ? { items: p.items, districts: pharmCfg(t).districts || [] } : null; };

const NEWS_TAGS = ['general', 'economy', 'sport', 'technology', 'trt', 'aa', 'ntv', 'mix'];
const news = new Map(Object.entries(cacheGet('newsByTag') || {}));
const newsFail = new Map(); let newsError = '';
// ---- Haber kaynakları: RSS (TRT, AA, NTV) anahtarsız ve kotasız; CollectAPI kategorileri anahtar ister ----
const RSS = {
  trt: { name: 'TRT Haber', url: 'https://www.trthaber.com/sondakika.rss' },
  aa: { name: 'Anadolu Ajansı', url: 'https://www.aa.com.tr/tr/rss/default?cat=guncel' },
  ntv: { name: 'NTV', url: 'https://www.ntv.com.tr/gundem.rss' },
};
const RSS_TAGS = ['trt', 'aa', 'ntv', 'mix'];
const NEWS_DEFAULT = 'mix';
const NOISE = /deprem mi oldu|son depremler|çekiliş sonuçları|bayram mı|tatil mi/i; // her gün tekrarlanan hizmet başlıkları
const xmlText = v => String(v || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')
  .replace(/&(amp|lt|gt|quot|apos|#39|#x27|nbsp);/g, (m, c) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#x27': "'", nbsp: ' ' }[c])).replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
function parseFeed(xml, source) { // RSS 2.0 (<item>) ve Atom (<entry>) ikisini de okur
  const out = [], blocks = String(xml).match(/<(item|entry)[\s>][\s\S]*?<\/\1>/g) || [];
  for (const bl of blocks) {
    const g = tag => { const m = bl.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i')); return m ? xmlText(m[1]) : ''; };
    const title = g('title'), d = Date.parse(g('pubDate') || g('published') || g('updated') || g('dc:date'));
    if (title && !NOISE.test(title)) out.push({ title, source, date: isFinite(d) ? new Date(d).toISOString() : null });
  }
  return out;
}
async function fetchRss(id) {
  const f = RSS[id];
  const r = await fetch(f.url, { signal: AbortSignal.timeout(12000), headers: { 'user-agent': 'Mozilla/5.0 ScreenPano', accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' } });
  if (!r.ok) throw new Error(`${f.name}: HTTP ${r.status}`);
  const items = parseFeed(await r.text(), f.name);
  if (!items.length) throw new Error(`${f.name}: haber bulunamadı`);
  return items;
}
async function fetchRssTag(tag) {
  const ids = tag === 'mix' ? ['trt', 'aa', 'ntv'] : [tag];
  const res = await Promise.allSettled(ids.map(fetchRss)), ok = res.filter(x => x.status === 'fulfilled').map(x => x.value);
  if (!ok.length) throw new Error(res.map(x => x.reason && x.reason.message).filter(Boolean).join(' · ') || 'haber alınamadı');
  const day = Date.now() - 36 * HOUR, seen = new Set(), all = [];
  for (const list of ok) {
    const fresh = list.filter(x => !x.date || Date.parse(x.date) > day).sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
    all.push(fresh.length >= 3 ? fresh : list.slice(0, 5));
  }
  const out = []; // kaynaklar sırayla karıştırılır (her kaynaktan bir), yinelenen başlıklar atlanır
  for (let i = 0; out.length < 12 && all.some(l => i < l.length); i++) for (const l of all) { const x = l[i]; if (!x) continue; const k = norm(x.title).slice(0, 60); if (seen.has(k)) continue; seen.add(k); out.push(x); }
  return out;
}
async function fetchNews(key, tag) {
  if (RSS_TAGS.includes(tag)) return fetchRssTag(tag);
  const j = await collectFetch(`${config.PHARM_BASE}/news/getNews?country=tr&tag=${encodeURIComponent(tag || 'general')}`, key, 'news');
  const seen = new Set(), items = [];
  for (const n of j.result || []) { const title = String(n.name || '').trim(); if (!title || seen.has(title)) continue; seen.add(title); items.push({ title, source: n.source || '', date: n.date || null }); if (items.length >= 8) break; }
  if (!items.length) throw new Error('haber listesi boş');
  return items;
}
// ---- Son dakika: TRT Haber son dakika yayını; haberler sayfasından bağımsız, ekranda bant + alt şeritte "SON DAKİKA" olarak çıkar ----
let breaking = cacheGet('breaking'); let breakingFail = 0;
const breakingOn = t => (t.db.breaking || {}).enabled !== false;
async function refreshBreaking(force) {
  if (!force && !proTenants().some(breakingOn)) return;
  if (!force && Date.now() - breakingFail < 2 * MIN) return;
  try {
    const items = (await fetchRss('trt')).filter(x => x.date).sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 6);
    breaking = { items, updated: new Date().toISOString() }; cachePut('breaking', breaking); hub.pushAll();
  } catch (e) { breakingFail = Date.now(); console.error('Son dakika alınamadı:', e.message); }
}
const breakingFor = () => breaking && Date.now() - Date.parse(breaking.updated) < 2 * HOUR ? { items: breaking.items.filter(x => Date.now() - Date.parse(x.date) < 3 * HOUR) } : null;
const newsTag = t => (t.db.news || {}).tag || NEWS_DEFAULT;
async function refreshNews(force) {
  const key = collectKey();
  const tags = new Set(proTenants().filter(t => (t.db.news || {}).enabled !== false).map(newsTag));
  for (const tag of tags) {
    const rss = RSS_TAGS.includes(tag);
    if (!rss && !key) continue;
    const cur = news.get(tag);
    if (!force && cur && Date.now() - Date.parse(cur.updated) < (rss ? 5 * MIN : 3 * HOUR)) continue;
    if (!force && Date.now() - (newsFail.get(tag) || 0) < (rss ? 3 * MIN : HOUR)) continue;
    try { news.set(tag, { items: await fetchNews(key, tag), updated: new Date().toISOString() }); newsError = ''; cachePut('newsByTag', Object.fromEntries(news)); hub.pushAll(); }
    catch (e) { newsError = e.message; newsFail.set(tag, Date.now()); console.error('Haber alınamadı:', e.message); }
  }
}
const newsFor = t => { const n = news.get(newsTag(t)); return n && Date.now() - Date.parse(n.updated) < 12 * HOUR ? { items: n.items } : null; };

let books = cacheGet('books'); let booksError = '', booksFailAt = 0, coverErr = '';
const coverMiss = new Set();
const gbKey = () => String(process.env.GOOGLE_BOOKS_KEY || platformKey('books_key') || '').trim();
const titleToks = t => norm(t).split(/[^a-z0-9]+/).filter(w => w.length >= 3);
// Başlık eşleşmesi: yazar uyuyorsa %75, uymuyorsa ya da bilinmiyorsa başlığın tamamı (en az 2 sözcük) tutmalı; yanlış kitabın kapağı çıkmasın
const titleMatch = (ours, cand, ourAuthor, candAuthors) => {
  const a = titleToks(String(ours).split(/\s[-–:]\s/)[0]), c = new Set(titleToks(cand));
  if (!a.length) return false;
  const ratio = a.filter(w => c.has(w)).length / a.length;
  const sur = titleToks(String(ourAuthor || '')).pop(), ca = norm(String(candAuthors || ''));
  if (sur && ca && ca.includes(sur)) return ratio >= 0.75;
  return ratio === 1 && a.length >= 2;
};
async function olCover(b) {
  const head = b.title.split(/\s[-–:]\s/)[0];
  try {
    for (const q of [head + ' ' + (b.author || ''), head]) {
      const r = await fetch(`https://openlibrary.org/search.json?limit=8&fields=cover_i,title,author_name&q=${encodeURIComponent(q.trim())}`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return null;
      const d = ((await r.json()).docs || []).find(x => x.cover_i && titleMatch(b.title, x.title, b.author, (x.author_name || []).join(' ')));
      if (d) return `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`;
    }
    return null;
  } catch (e) { return null; }
}
async function bookCover(b) {
  const q = t => `https://www.googleapis.com/books/v1/volumes?maxResults=8&printType=books${gbKey() ? '&key=' + encodeURIComponent(gbKey()) : ''}&q=${encodeURIComponent(t)}`;
  const clean = b.title.split(/\s[-–:]\s/)[0];
  let failed = false;
  for (const t of [`intitle:${clean}${b.author ? ' inauthor:' + b.author : ''}`, `intitle:${clean}`, `${b.title} ${b.author || ''}`.trim()]) {
    try {
      let r = await fetch(q(t), { signal: AbortSignal.timeout(10000) });
      if (r.status === 503 || r.status === 500) { await new Promise(x => setTimeout(x, 1500)); r = await fetch(q(t), { signal: AbortSignal.timeout(10000) }); } // Google geçici hata verirse bir kez daha dene
      if (!r.ok) { failed = true; coverErr = 'Google Books ' + await gbWhy(r); break; }
      for (const v of (await r.json()).items || []) {
        const vi = v.volumeInfo || {}, l = vi.imageLinks, u = l && (l.thumbnail || l.smallThumbnail);
        if (u && titleMatch(b.title, [vi.title, vi.subtitle].filter(Boolean).join(' '), b.author, (vi.authors || []).join(' '))) return u.replace(/^http:/, 'https:').replace('&edge=curl', '');
      }
    } catch (e) { failed = true; coverErr = 'Google Books: ' + e.message; break; }
    await new Promise(r => setTimeout(r, 300));
  }
  const ol = await olCover(b);
  if (ol) return ol;
  return failed ? null : '';
}
// Kapak indirme: görüntü gerçekten inmeli (içerik türü başlığı yoksa dosya imzasına bakılır); inenler bellekte tutulur
const coverHash = u => require('crypto').createHash('sha1').update(String(u)).digest('hex').slice(0, 12);
const coverBuf = new Map();
const sniff = b => b.length > 4 && ((b[0] === 0xff && b[1] === 0xd8) ? 'image/jpeg' : (b[0] === 0x89 && b[1] === 0x50) ? 'image/png' : (b.slice(0, 4).toString() === 'RIFF') ? 'image/webp' : (b.slice(0, 3).toString() === 'GIF') ? 'image/gif' : '');
async function coverGet(url) {
  const h = coverHash(url);
  if (coverBuf.has(h)) return coverBuf.get(h);
  try {
    const u = String(url).replace(/^\/\//, 'https://').replace(/^http:/, 'https:');
    const r = await fetch(u, { signal: AbortSignal.timeout(12000), redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36', accept: 'image/*,*/*;q=0.5' } });
    if (!r.ok) { coverErr = `Kapak indirilemedi (${r.status}): ${new URL(u).hostname}`; return null; }
    const buf = Buffer.from(await r.arrayBuffer()), type = sniff(buf);
    if (!type || buf.length < 1500 || buf.length > 3e6) { coverErr = `Kapak geçersiz (${buf.length} bayt): ${new URL(u).hostname}`; return null; }
    const c = { buf, type }; coverBuf.set(h, c);
    if (coverBuf.size > 60) coverBuf.delete(coverBuf.keys().next().value);
    return c;
  } catch (e) { coverErr = 'Kapak indirilemedi: ' + e.message; return null; }
}
async function verifyCovers() { // indirilemeyen kapağı listeden düşür; fillCovers yedek kaynaklardan arasın
  if (!books) return;
  if (books.coverVer !== 2) { for (const b of books.items) b.image = ''; coverMiss.clear(); books.coverVer = 2; cachePut('books', books); } // eski (yanlış eşleşmiş olabilen) kapaklar bir kez sıfırlanır
  let drop = 0, fresh = 0;
  for (const b of books.items) {
    if (!b.image || coverBuf.has(coverHash(b.image))) continue;
    if (await coverGet(b.image)) { fresh++; continue; }
    b.image = ''; coverMiss.delete(b.title); drop++;
  }
  if (drop) cachePut('books', books);
  if (drop || fresh) hub.pushAll(); // kapaklar doğrulandı: ekranlar gerçek kapakları hemen göstersin
}
async function fillCovers() {
  if (!books) return;
  await verifyCovers();
  let n = 0;
  for (const b of books.items) {
    if (b.image || coverMiss.has(b.title)) continue;
    await new Promise(r => setTimeout(r, 400));
    const u = await bookCover(b);
    if (u === null) continue;
    b.image = u;
    if (u && !(await coverGet(u))) { b.image = ''; coverMiss.add(b.title); continue; } // yedek kaynağın da kapağı inmedi
    if (u) { n++; coverErr = ''; } else coverMiss.add(b.title);
  }
  if (n) { cachePut('books', books); hub.pushAll(); }
}
// ---- Yeni kitaplar: Google Books (yayınevine göre en yeniler, kapaklı) — başarısız ya da az çıkarsa CollectAPI (D&R) listesine dönülür ----
const BOOK_PUBLISHERS = ['Can Yayınları', 'Yapı Kredi Yayınları', 'İletişim Yayınları', 'İş Bankası Kültür Yayınları', 'Doğan Kitap', 'Everest Yayınları', 'Domingo Yayınları', 'Timaş Yayınları', 'Epsilon Yayınevi', 'Metis Yayınları'];
const bookPublishers = () => { const l = String(platformKey('books_publishers') || '').split(',').map(x => x.trim()).filter(Boolean); return l.length ? l.slice(0, 15) : BOOK_PUBLISHERS; };
async function gbWhy(r) { // Google'ın hata gövdesinden (reason + message) kısa neden
  try { const j = JSON.parse(await r.text()), e = j.error || {}; return `${r.status} ${((e.errors || [])[0] || {}).reason || e.status || ''} ${String(e.message || '').replace(/\s+/g, ' ').slice(0, 140)}`.trim(); }
  catch (x) { return String(r.status); }
}
const AUDIO = /sesli|audio|dinle|\bmp3\b|podcast/i;
const pubDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '')); return m ? Date.parse(`${m[1]}-${m[2]}-${m[3]}`) : NaN; }; // yalnız gün-gün tarih: "o hafta çıkan" ancak böyle doğrulanır
async function googleNewBooks() {
  const key = gbKey(), since = Date.now() - 7 * 24 * HOUR, found = []; // yalnız son 7 günde çıkanlar
  let calls = 0, firstErr = '';
  const st = { ham: 0, kapaksiz: 0, sesli: 0, yazarsiz: 0, tarih: 0, yayinevi: 0 };
  for (const pub of bookPublishers()) {
    try {
      calls++;
      const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(`inpublisher:"${pub}"`)}&orderBy=newest&langRestrict=tr&printType=books&maxResults=15&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) { firstErr = firstErr || 'Google Books ' + await gbWhy(r); if (r.status === 403 || r.status === 429) break; continue; }
      const list = [];
      for (const v of (await r.json()).items || []) {
        const vi = v.volumeInfo || {}, l = vi.imageLinks, u = l && (l.thumbnail || l.smallThumbnail), d = pubDate(vi.publishedDate);
        st.ham++;
        if (AUDIO.test([vi.title, vi.subtitle, vi.publisher, (vi.categories || []).join(' ')].join(' '))) { st.sesli++; continue; } // sesli kitaplar alınmaz
        if (!u || !vi.title) { st.kapaksiz++; continue; }
        if (!(vi.authors || []).length) { st.yazarsiz++; continue; }
        if (!isFinite(d) || d < since || d > Date.now() + 3 * 24 * HOUR) { st.tarih++; continue; }
        if (norm(vi.publisher || '') && !norm(vi.publisher).includes(norm(pub).split(' ')[0])) { st.yayinevi++; continue; } // başka yayınevinin kitabı karışmasın
        list.push({ image: u.replace(/^http:/, 'https:').replace('&edge=curl', ''), title: [vi.title, vi.subtitle].filter(Boolean).join(' - ').slice(0, 90), author: vi.authors.slice(0, 2).join(', '), publisher: vi.publisher || pub, d });
      }
      list.sort((a, b) => b.d - a.d); found.push(list.slice(0, 3));
    } catch (e) { firstErr = firstErr || 'Google Books: ' + e.message; }
    await new Promise(r => setTimeout(r, 1200));
  }
  const seen = new Set(), items = [];
  for (let i = 0; i < 3 && items.length < 8; i++) for (const l of found) { const x = l[i]; if (!x || seen.has(norm(x.title))) continue; seen.add(norm(x.title)); const { d, ...rest } = x; items.push(rest); }
  const dbg = `gelen ${st.ham}: kapaksız ${st.kapaksiz}, sesli ${st.sesli}, yazarsız ${st.yazarsiz}, tarih dışı ${st.tarih}, başka yayınevi ${st.yayinevi}`;
  if (items.length < 1) throw new Error(`Google Books: bu hafta çıkan kitap bulunamadı (${items.length}; ${dbg})${firstErr ? ' · ' + firstErr : ''}`);
  return items.slice(0, 8);
}
async function collectNewBooks(key) {
  const j = await collectFetch(`${config.PHARM_BASE}/book/newBook`, key, 'books');
  const seen = new Set(), items = [];
  for (const b of j.result || []) {
    const title = String(b.title || '').trim(); if (!title || seen.has(title) || AUDIO.test(title + ' ' + (b['yayın'] || b.yayin || ''))) continue; seen.add(title);
    items.push({ image: String(b.image || b.resim || b.img || b.gorsel || b.cover || '').trim(), title, author: String(b.yazar || '').trim(), publisher: String(b['yayın'] || b.yayin || '').trim() });
    if (items.length >= 8) break;
  }
  if (!items.length) throw new Error('kitap listesi boş');
  return items;
}
let booksSource = '';
async function refreshBooks(force) {
  const want = platformKey('books_source') === 'collect' ? 'collect' : 'google', ck = collectKey();
  if (!(want === 'google' && gbKey()) && !ck) return;
  if (!proTenants().some(t => t.db.showBooks !== false)) return;
  const switchNow = want === 'google' && gbKey() && books && books.source !== 'google'; // kaynak değiştirildi: ilk açılışta hemen dene (başarısızsa 3 saat sonra)
  if (!force && books && cacheAge('books') < 24 * HOUR && !switchNow) return;
  if (!force && Date.now() - booksFailAt < 3 * HOUR) return;
  let items = null, src = '', gerr = '';
  if (want === 'google' && gbKey()) { try { items = await googleNewBooks(); src = 'google'; } catch (e) { gerr = e.message; console.error('Google Books listesi alınamadı:', e.message); } }
  try {
    if (!items) { if (!ck) throw new Error(gerr || 'kitap kaynağı yok'); items = await collectNewBooks(ck); src = 'collect'; }
    books = { items, coverVer: 2, source: src, updated: new Date().toISOString() }; booksSource = src; booksError = gerr ? 'Google yedeğe düştü: ' + gerr : ''; cachePut('books', books); fillCovers(); hub.pushAll();
  } catch (e) { booksError = e.message; booksFailAt = Date.now(); console.error('Kitaplar alınamadı:', e.message); }
}

// ================= SİNEMA (TMDB, platform anahtarı) =================
let movies = cacheGet('movies'); let moviesError = '', moviesFailAt = 0;
const TMDB = 'https://api.themoviedb.org/3';
async function tmdb(p, key) {
  const r = await fetch(`${TMDB}${p}${p.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(key)}`, { headers: { accept: 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.status_message || ('HTTP ' + r.status));
  return j;
}
async function fetchMovies(key) {
  const now = new Date(), dow = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(now);
  const back = { Fri: 0, Sat: 1, Sun: 2, Mon: 3, Tue: 4, Wed: 5, Thu: 6 }[dow];
  const from = ymd(new Date(now.getTime() - (back + 14) * 24 * HOUR)), to = ymd(new Date(now.getTime() + (6 - back) * 24 * HOUR));
  const j = await tmdb(`/discover/movie?region=TR&with_release_type=3&release_date.gte=${from}&release_date.lte=${to}&language=tr-TR&sort_by=popularity.desc&include_adult=false`, key);
  const items = [];
  for (const m of (j.results || []).slice(0, 10)) {
    let alts = [];
    try {
      const cand = [];
      for (const lang of ['tr-TR', 'en-US']) {
        const v = await tmdb(`/movie/${m.id}/videos?language=${lang}`, key);
        for (const t of (v.results || []).filter(x => x.site === 'YouTube' && (x.type === 'Trailer' || x.type === 'Teaser')).sort((x, y) => (y.type === 'Trailer') - (x.type === 'Trailer') || (y.official === true) - (x.official === true)))
          if (!cand.includes(t.key)) cand.push(t.key);
      }
      for (const k of cand.slice(0, 6)) {
        try { const o = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + k)}`); if (!o.ok) continue; } catch (e) { /* ağ hatası: yine de dene */ }
        alts.push(k); if (alts.length >= 3) break;
      }
    } catch (e) { /* fragmansız */ }
    items.push({ id: m.id, title: m.title, original: m.original_title !== m.title ? m.original_title : '', date: m.release_date || '', rating: m.vote_average ? Math.round(m.vote_average * 10) / 10 : 0, poster: m.poster_path ? 'https://image.tmdb.org/t/p/w185' + m.poster_path : '', trailer: alts[0] || '', alts });
  }
  if (!items.length) throw new Error('bu hafta için vizyon listesi boş');
  return { from, to, items };
}
async function refreshMovies(force) {
  const key = platformKey('tmdb_key');
  if (!key || !proTenants().some(t => (t.db.movies || {}).enabled !== false)) return;
  if (!force && movies && cacheAge('movies') < 12 * HOUR) return;
  if (!force && Date.now() - moviesFailAt < 3 * HOUR) return;
  try { movies = { ...(await fetchMovies(key)), updated: new Date().toISOString() }; moviesError = ''; cachePut('movies', movies); hub.pushAll(); }
  catch (e) { moviesError = e.message; moviesFailAt = Date.now(); console.error('Filmler alınamadı:', e.message); }
}

// ================= BÜYÜK MAÇ DUYURUSU =================
const isBig4 = name => ['galatasaray', 'fenerbahce', 'besiktas', 'trabzonspor'].some(k => norm(name).includes(k));
const BIG_LEAGUES = [['tur.1', 'Süper Lig'], ['uefa.champions', 'Şampiyonlar Ligi'], ['uefa.europa', 'Avrupa Ligi'], ['uefa.europa.conf', 'Konferans Ligi'], ['uefa.champions_qual', 'Şampiyonlar Ligi Eleme']];
const bigCfg = t => ({ enabled: true, note: 'Rezervasyon yaptırmayı unutmayın!', days: 3, everyMin: 6, durSec: 15, info: ['', '', ''], ...(t.db.bigMatch || {}) });
let bigMatches = cacheGet('bigmatches') || [];
let bigError = '';
async function refreshBigMatches() {
  const users = proTenants().filter(t => bigCfg(t).enabled);
  if (!users.length) return;
  const days = Math.max(1, Math.min(7, ...users.map(t => Number(bigCfg(t).days) || 3)));
  const now = Date.now(), dates = Array.from({ length: days + 1 }, (_, i) => ymd(new Date(now + i * 24 * HOUR)).replace(/-/g, ''));
  const out = []; let ok = 0;
  for (const [code, label] of BIG_LEAGUES) {
    for (const dt of dates) try {
      const j = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/scoreboard?dates=${dt}`)).json();
      ok++;
      for (const e of j.events || []) {
        if (e.status.type.state !== 'pre') continue;
        const c = e.competitions[0].competitors, home = c.find(x => x.homeAway === 'home'), away = c.find(x => x.homeAway === 'away');
        if (!home || !away) continue;
        const hb = isBig4(home.team.displayName), ab = isBig4(away.team.displayName), derby = code === 'tur.1' && hb && ab;
        if (!derby && (code === 'tur.1' || !(hb || ab))) continue;
        out.push({ id: e.id, league: label, home: trTeam(home.team.shortDisplayName || home.team.displayName), away: trTeam(away.team.shortDisplayName || away.team.displayName), ts: new Date(e.date).getTime(), hl: home.team.logo || null, al: away.team.logo || null, hcol: home.team.color || '', acol: away.team.color || '', hcol2: home.team.alternateColor || '', acol2: away.team.alternateColor || '', derby });
      }
    } catch (err) { bigError = err.message; console.error('Büyük maç alınamadı', code, err.message); }
  }
  if (!ok) return;
  bigError = '';
  const seen = new Set();
  bigMatches = out.filter(m => !seen.has(m.id) && seen.add(m.id)).sort((a, b) => a.ts - b.ts);
  cachePut('bigmatches', bigMatches);
  hub.pushAll();
}
const TEAM_COLORS = { galatasaray: '#a5142a', fenerbahce: '#12307f', besiktas: '#2c2c30', trabzonspor: '#7a1236' };
const lum = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return -1; const n = parseInt(m[1], 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const teamColor = (name, c1, c2) => {
  const k = Object.keys(TEAM_COLORS).find(x => norm(name).includes(x)); if (k) return TEAM_COLORS[k];
  for (const c of [c1, c2]) { const l = lum(c); if (l > 0.12 && l < 0.55) return '#' + c.replace('#', ''); }
  return '#2b3550';
};
const teamPhoto = (t, name) => { const p = (t.db.bigPhotos || []).find(x => norm(name).includes(x.key)); return p ? t.upBase + p.file : null; };
const activeBig = t => {
  const now = Date.now(), lim = Math.max(1, Math.min(7, Number(bigCfg(t).days) || 3)) * 24 * HOUR;
  return bigMatches.filter(m => m.ts > now && m.ts - now <= lim).map(m => ({ ...m, hl: localLogo(m.hl), al: localLogo(m.al), hc: teamColor(m.home, m.hcol, m.hcol2), ac: teamColor(m.away, m.acol, m.acol2), hp: teamPhoto(t, m.home), ap: teamPhoto(t, m.away) }));
};

// ================= RESMÎ GÜN KUTLAMALARI =================
const HOLIDAYS = [
  { id: 'nisan23', photoPrefix: 'nisan23-', md: '04-23', title: '23 Nisan Ulusal Egemenlik ve Çocuk Bayramı', quotes: ['Egemenlik kayıtsız şartsız milletindir.', 'Çocuklar geleceğimizin güvencesi, yaşatıcısıdır.', 'Küçük hanımlar, küçük beyler! Sizler hepiniz geleceğin bir gül bahçesinin gülleri, yıldızları, ışıklarısınız.', 'Yurtta sulh, cihanda sulh.'] },
  { id: 'mayis19', photoPrefix: 'mayis19-', md: '05-19', title: "19 Mayıs Atatürk'ü Anma, Gençlik ve Spor Bayramı", quotes: ['Bütün ümidim gençliktedir.', 'Ey Türk gençliği! Birinci vazifen, Türk istiklalini, Türk Cumhuriyetini ilelebet muhafaza ve müdafaa etmektir.', 'Hayatta en hakiki mürşit ilimdir.', "Ne mutlu Türk'üm diyene!"] },
  { id: 'agustos30', photoPrefix: 'agustos30-', md: '08-30', title: '30 Ağustos Zafer Bayramı', quotes: ['Hatt-ı müdafaa yoktur, sath-ı müdafaa vardır. O satıh bütün vatandır.', "Ordular! İlk hedefiniz Akdeniz'dir, ileri!", 'Yurtta sulh, cihanda sulh.', "Ne mutlu Türk'üm diyene!"] },
  { id: 'ekim29', md: '10-29', photoPrefix: 'cumhuriyet-', title: '29 Ekim Cumhuriyet Bayramı', quotes: ["Ne mutlu Türk'üm diyene!", 'Cumhuriyeti biz kurduk, onu yükseltecek ve yaşatacak sizsiniz.', 'Benim naçiz vücudum elbet bir gün toprak olacaktır, fakat Türkiye Cumhuriyeti ilelebet payidar kalacaktır.', 'Egemenlik kayıtsız şartsız milletindir.', 'Yurtta sulh, cihanda sulh.'] },
  { id: 'kasim10', md: '11-10', photoPrefix: 'anma-', mourn: true, silence: '09:05', title: "10 Kasım Atatürk'ü Anma Günü", quotes: ['Benim naçiz vücudum elbet bir gün toprak olacaktır, fakat Türkiye Cumhuriyeti ilelebet payidar kalacaktır.', 'Hayatta en hakiki mürşit ilimdir.', 'Ben, manevi miras olarak hiçbir ayet, hiçbir dogma, hiçbir donmuş ve kalıplaşmış kural bırakmıyorum. Benim manevi mirasım ilim ve akıldır.', 'Yurtta sulh, cihanda sulh.'] },
];
const CELEB_DIR = path.join(config.PUBLIC_DIR, 'celebrate');
const celebPhotos = (t, h) => [
  ...(h.photoPrefix && fs.existsSync(CELEB_DIR) ? fs.readdirSync(CELEB_DIR).filter(f => /\.(jpe?g|png|webp)$/i.test(f) && f.startsWith(h.photoPrefix)).sort().map(f => ({ url: '/celebrate/' + f })) : []),
  ...(t.db.celebPhotos || []).filter(p => p.day === h.id).map(p => ({ id: p.id, url: t.upBase + p.file })),
];
const celebMode = (t, id) => ((t.db.celebMode || {})[id]) || 'auto';
function activeCelebration(t) {
  const db = t.db;
  if (db.showCelebrations === false) return null;
  let h = null, until = 0;
  if (db.celebPreview && db.celebPreviewUntil > Date.now()) { h = HOLIDAYS.find(x => x.id === db.celebPreview); until = db.celebPreviewUntil; }
  if (!h) { h = HOLIDAYS.find(x => celebMode(t, x.id) === 'on'); if (h) until = Date.now() + 30 * 24 * HOUR; }
  if (!h) {
    const today = ymd(new Date()).slice(5), early = ymd(new Date(Date.now() - 3 * HOUR)).slice(5);
    h = HOLIDAYS.find(x => celebMode(t, x.id) === 'auto' && (x.md === today || x.md === early));
    if (h) { const [y, m, d] = ymd(new Date(Date.now() - (h.md === today ? 0 : 3 * HOUR))).split('-').map(Number); until = Date.UTC(y, m - 1, d + 1, 0, 0, 0); }
  }
  return h ? { id: h.id, title: h.title, quotes: h.quotes, mourn: !!h.mourn, silence: h.silence || null, photos: celebPhotos(t, h).map(x => x.url), until } : null;
}

// ================= TRAFİK (İstanbul): İBB endeksi + sunucuda çizilen harita =================
let traffic = null;
function trafficSecret() {
  let s = platformKey('traffic_secret');
  if (!s) { s = crypto.randomBytes(32).toString('hex'); store.setSetting('traffic_secret', s); }
  return s;
}
function reportTraffic({ all, asia, europe, ts, sig }) {
  if (![all, asia, europe, ts].every(n => typeof n === 'number' && isFinite(n)) || typeof sig !== 'string') return [400, 'eksik veri'];
  const exp = crypto.createHmac('sha256', trafficSecret()).update(`${all}|${asia}|${europe}|${ts}`).digest('hex');
  if (sig.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return [403, 'imza geçersiz'];
  if (Math.abs(Date.now() - ts) > 10 * MIN) return [400, 'veri çok eski'];
  if (!traffic || ts > traffic.at) { traffic = { all, asia, europe, source: 'ibb', at: ts, updated: new Date(ts).toISOString() }; hub.pushAll(); }
  return [200, 'ok'];
}
const isIstanbul = t => norm((t.db.location || {}).city).includes('istanbul');
const wantsTraffic = t => t.db.showTraffic !== false && isIstanbul(t) && plan(t).pro;

const MAP_DIR = path.join(DATA_DIR, 'map'); fs.mkdirSync(MAP_DIR, { recursive: true });
const MAP_FILE = path.join(MAP_DIR, 'traffic.jpg');
const MAP_URL = 'https://yandex.com.tr/map-widget/v1/?ll=28.95%2C41.04&z=11&l=map%2Ctrf&lang=tr_TR';
let mapAt = fs.existsSync(MAP_FILE) ? fs.statSync(MAP_FILE).mtimeMs : null;
let mapErr = '', mapBusy = false;
function runCmd(cmd, args, timeoutMs = 20 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    try { require('os').setPriority(p.pid, 15); } catch (e) { /* düşürülemedi */ }
    let err = '';
    p.stderr.on('data', d => { err = (err + d).slice(-1500); });
    const tm = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.on('error', e => { clearTimeout(tm); reject(e); });
    p.on('close', code => { clearTimeout(tm); code === 0 ? resolve() : reject(new Error(path.basename(cmd) + ' ' + code + ': ' + err.trim().split('\n').slice(-2).join(' | '))); });
  });
}
const runFfmpeg = (args, timeoutMs) => runCmd(config.FFMPEG, ['-nostdin', ...args], timeoutMs);
async function renderMap() {
  if (mapBusy) return { ok: false, error: 'zaten çalışıyor' };
  mapBusy = true;
  const raw = path.join(MAP_DIR, 'raw.png'), tmp = path.join(MAP_DIR, 'next.jpg');
  const ud = fs.mkdtempSync(path.join(require('os').tmpdir(), 'chr-'));
  try {
    fs.rmSync(raw, { force: true });
    await runCmd(config.CHROMIUM, ['--headless', '--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--hide-scrollbars', '--window-size=1000,1300', '--virtual-time-budget=60000', '--user-data-dir=' + ud, '--screenshot=' + raw, MAP_URL], 150000);
    if (!fs.existsSync(raw) || fs.statSync(raw).size < 300000) throw new Error('harita çizilemedi (görüntü boş)');
    await runFfmpeg(['-y', '-i', raw, '-vf', 'crop=900:1030:30:55,negate,hue=h=180:s=1.15,eq=contrast=1.05:brightness=-0.03:saturation=1.1', '-frames:v', '1', '-q:v', '4', tmp], 60000);
    fs.renameSync(tmp, MAP_FILE);
    mapAt = Date.now(); mapErr = '';
    hub.pushAll();
    return { ok: true };
  } catch (e) { mapErr = String(e.message).slice(0, 200); console.error('Harita çizilemedi:', mapErr); return { ok: false, error: mapErr }; }
  finally { fs.rmSync(ud, { recursive: true, force: true }); fs.rmSync(raw, { force: true }); fs.rmSync(tmp, { force: true }); mapBusy = false; }
}
function maybeRenderMap() { // haritayı isteyen bir ekran bağlı değilse boşuna çizme
  const stale = !mapAt || Date.now() - mapAt > 9.5 * MIN;
  if (!stale) return;
  const ids = hub.connectedTenantIds();
  if ([...ids].some(id => { const t = tenants.get(id); return t && wantsTraffic(t); })) renderMap();
}

// ================= TAKIM LOGOLARI (küçük sürüm, diskte önbellekli) =================
const LOGO_DIR = path.join(DATA_DIR, 'logos'); fs.mkdirSync(LOGO_DIR, { recursive: true });
const localLogo = u => { const m = typeof u === 'string' && u.match(/teamlogos\/soccer\/500\/(\d+)\.png/); return m ? `/logo/${m[1]}.png` : u; };
async function makeLogo(id) {
  const out = path.join(LOGO_DIR, id + '.png');
  if (fs.existsSync(out)) return out;
  const r = await fetch(`https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png`);
  if (!r.ok) throw new Error('logo yok ' + r.status);
  const raw = path.join(LOGO_DIR, id + '.raw.png');
  fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
  try { await runFfmpeg(['-y', '-i', raw, '-vf', 'scale=128:128:force_original_aspect_ratio=decrease', '-frames:v', '1', out], 60000); fs.rmSync(raw, { force: true }); }
  catch (e) { fs.renameSync(raw, out); }
  return out;
}

// ================= ZAMANLAYICILAR =================
function start() {
  refreshWeather(); setInterval(refreshWeather, 10 * MIN);
  refreshRates(); setInterval(refreshRates, 5 * MIN);
  refreshStandings(); setInterval(refreshStandings, 20 * MIN);
  matchLoop();
  setTimeout(refreshOnThisDay, 2000); setInterval(refreshOnThisDay, 30 * MIN);
  setTimeout(refreshPharmacies, 4000); setInterval(refreshPharmacies, 30 * MIN);
  setTimeout(refreshNews, 6000); setInterval(refreshNews, 5 * MIN); setTimeout(refreshBreaking, 7000); setInterval(refreshBreaking, 3 * MIN);
  setTimeout(refreshBigMatches, 7000); setInterval(refreshBigMatches, 30 * MIN);
  setTimeout(refreshBooks, 9000); setInterval(refreshBooks, 30 * MIN);
  setTimeout(fillCovers, 12000); setInterval(fillCovers, 30 * MIN);
  setTimeout(refreshMovies, 11000); setInterval(refreshMovies, 30 * MIN);
  setTimeout(maybeRenderMap, 20000); setInterval(maybeRenderMap, 3 * MIN);
  // yeni işletme ya da lig seçimi değişince maç listesini beklemeden yenile
  let lastU = JSON.stringify(unionLeagues());
  setInterval(() => { const u = JSON.stringify(unionLeagues()); if (u !== lastU) { lastU = u; refreshMatches(); refreshStandings(); refreshBigMatches(); } }, 30 * 1000);
}

module.exports = {
  start, ymd, hm, norm, HOUR, MIN, TR_WORDS, trTeam,
  CATALOG, DEFAULT_LEAGUES, NO_TABLE, enabledLeagues, standings,
  get rates() { return rates; }, weatherFor: t => weather.get(locKey(t)) || null,
  get autoMatches() { return autoMatches; }, refreshMatches, refreshStandings,
  get onThisDay() { return onThisDay; },
  pharmFor, fetchPharmacies, refreshPharmacies, pharmSig, get pharmError() { return pharmError; }, dutyDay,
  newsFor, breakingFor, breakingOn, refreshBreaking, fetchNews, refreshNews, NEWS_TAGS, parseFeed, RSS_TAGS, NEWS_DEFAULT, get newsError() { return newsError; },
  coverHash, coverGet, coverReady: u => coverBuf.has(coverHash(u)), get books() { return books; }, get booksError() { return booksError; }, booksInfo: () => ({ kaynak: (books && books.source) || '', adet: books ? books.items.length : 0, kapak: books ? books.items.filter(b => b.image && coverBuf.has(coverHash(b.image))).length : 0, anahtar: !!gbKey(), hata: booksError, kapakHata: coverErr, dk: Math.round(cacheAge('books') / 60000) }), refreshBooksNow: async () => { await refreshBooks(true); await fillCovers(); }, get booksSource() { return (books && books.source) || ''; }, get coverErr() { return coverErr; }, refreshBooks, fillCovers,
  get movies() { return movies; }, get moviesError() { return moviesError; }, refreshMovies, fetchMovies,
  bigCfg, activeBig, get bigMatches() { return bigMatches; }, get bigError() { return bigError; }, refreshBigMatches, TEAM_COLORS, teamPhoto,
  HOLIDAYS, celebPhotos, celebMode, activeCelebration,
  get traffic() { return traffic; }, reportTraffic, trafficSecret, wantsTraffic, renderMap, maybeRenderMap, MAP_FILE, get mapAt() { return mapAt; }, get mapErr() { return mapErr; },
  localLogo, makeLogo, runCmd, runFfmpeg,
  calories, googleNewBooks, cacheAge, get quota() { return quota; }, QUOTA, collectStats, refreshWeather,
};
