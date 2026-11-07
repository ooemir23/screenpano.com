// Platform reklamları: süper yönetimden satılan reklamlar, seçilen işletmelerin (varsayılan: hepsi) ekran döngüsüne girer.
// Reklam: { id, advertiser, contact, phone, email, title, note, creatives:[{id,file,type,name,dur}], price, packageId, start, end,
//           payments:[{id,amount,date,method,note}], allowUnpaid, paused, every, target:{mode:'all'|'plan'|'city', plans:[], cities:[], exclude:[]}, token, created }
// Dosyalar DATA_DIR/platform-ads içinde durur, /u/ads/<dosya> adresinden sunulur. Gösterimler işletme istatistiğine 'pad:<görsel>' anahtarıyla yazılır.
// Reklam verene giriş istemeyen rapor adresi: /ra/<token> (fiyat ve ödeme bilgisi içermez, işletme adı vermez).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('./config');
const store = require('./store');
const auth = require('./auth');
const tenants = require('./tenants');
const hub = require('./hub');
const SCH = require('./sched');
const { PLANS } = require('./plans');
const media = require('./media');

let sharp = null; try { sharp = require('sharp'); } catch (e) { /* yok */ }
const DIR = path.join(config.DATA_DIR, 'platform-ads');
fs.mkdirSync(DIR, { recursive: true });
const KEY = 'platformAds', PKG = 'adPackages';

const s = (v, n) => String(v ?? '').trim().slice(0, n);
const num = v => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0; };
const ymd = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const today = () => SCH.parts().ymd;
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const METHODS = ['havale', 'nakit', 'kart', 'online', 'diger'];

const load = () => { try { return JSON.parse(store.setting(KEY, '[]')) || []; } catch { return []; } };
const save = list => store.setSetting(KEY, JSON.stringify(list));
const packages = () => { try { return JSON.parse(store.setting(PKG, '[]')) || []; } catch { return []; } };

const paid = a => (a.payments || []).reduce((x, p) => x + (Number(p.amount) || 0), 0);
// Ödeme durumu: ücretsiz / ödenmedi / kısmi / ödendi
function payState(a) {
  const price = Number(a.price) || 0, got = paid(a);
  if (price <= 0) return 'free';
  if (got >= price) return 'paid';
  return got > 0 ? 'partial' : 'unpaid';
}
// Yayın durumu: taslak (görsel yok) / durduruldu / bitti / bekliyor (başlamadı) / ödeme bekliyor / yayında
function status(a) {
  const d = today();
  if (a.paused) return 'paused';
  if (!(a.creatives || []).length) return 'draft';
  if (a.end && d > a.end) return 'ended';
  if (a.start && d < a.start) return 'scheduled';
  if (!a.allowUnpaid && payState(a) === 'unpaid') return 'awaiting';
  return 'live';
}
// Hedef: tüm işletmeler / belirli paketler / belirli şehirler; tek tek işletme hariç tutulabilir
function eligible(a, t) {
  const g = a.target || { mode: 'all' };
  if ((g.exclude || []).includes(t.id)) return false;
  if (g.mode === 'plan') return (g.plans || []).includes(t.db && t.db.unlimited ? 'pro' : t.plan);
  if (g.mode === 'city') { const c = String(((t.db || {}).location || {}).city || '').toLocaleLowerCase('tr-TR'); return (g.cities || []).some(x => String(x).toLocaleLowerCase('tr-TR') === c); }
  return true;
}
const liveFor = t => load().filter(a => status(a) === 'live' && eligible(a, t));

// Medya döngüsüne reklam ekler: her reklam "every" içerikte bir, görselleri sırayla. Ekranda başka içerik yoksa yalnız reklamlar döner.
function inject(t, list) {
  const ads = liveFor(t); if (!ads.length) return list;
  const pools = ads.map(a => ({ items: a.creatives.map(c => ({ id: 'pad:' + c.id, name: a.title || a.advertiser, url: '/u/ads/' + c.file, type: c.type, dur: c.type === 'image' ? null : (c.dur || null), sch: null, ad: true })), k: 0, every: Math.max(1, Math.min(20, Number(a.every) || 4)) }));
  if (!list.length) return pools.flatMap(p => p.items);
  const out = [];
  list.forEach((v, i) => {
    out.push(v);
    for (const p of pools) if ((i + 1) % p.every === 0) out.push(p.items[p.k++ % p.items.length]);
  });
  for (const p of pools) if (list.length < p.every) out.push(p.items[0]); // kısa listede de en az bir kez
  return out;
}

// Gösterim istatistikleri (tüm zamanlar): işletme bazlı oynatma sayısı ve ekranda kalma süresi
function perf(a) {
  const ids = new Map((a.creatives || []).map(c => [c.id, c]));
  const o = { shown: 0, sec: 0, tenants: new Set(), daily: {}, byTenant: {}, byCreative: {} };
  for (const r of store.q.statPad.all()) {
    const id = String(r.key).slice(4); if (!ids.has(id)) continue;
    const c = o.byCreative[id] || (o.byCreative[id] = { shown: 0, sec: 0 });
    if (r.kind === 'play') { o.shown += r.value; c.shown += r.value; o.tenants.add(r.tenant_id); o.daily[r.day] = (o.daily[r.day] || 0) + r.value; o.byTenant[r.tenant_id] = (o.byTenant[r.tenant_id] || 0) + r.value; }
    else if (r.kind === 'sec') { o.sec += r.value; c.sec += r.value; }
  }
  return o;
}

function derive(a, withPerf) {
  const d = today(), price = Number(a.price) || 0, got = paid(a);
  const total = a.start && a.end ? dayDiff(a.start, a.end) + 1 : null;
  const left = a.end ? Math.max(0, dayDiff(d, a.end) + 1) : null;
  const elapsed = total ? Math.max(0, Math.min(total, a.start && d >= a.start ? dayDiff(a.start, d) + 1 : 0)) : null;
  const out = { ...a, status: status(a), pay: payState(a), paid: got, due: Math.max(0, price - got), totalDays: total, daysLeft: a.end && d <= a.end ? left : (a.end ? 0 : null), elapsed,
    overdue: payState(a) === 'unpaid' && !!a.start && d >= a.start, url: `${config.BASE_URL}/ra/${a.token}` };
  if (withPerf) { const p = perf(a); out.perf = { shown: p.shown, sec: p.sec, tenants: p.tenants.size }; }
  return out;
}

function summary(list) {
  const d = today(), m = d.slice(0, 7);
  const rows = list.map(a => derive(a));
  const sum = f => rows.reduce((x, a) => x + f(a), 0);
  return {
    live: rows.filter(a => a.status === 'live').length,
    awaiting: rows.filter(a => a.status === 'awaiting').length,
    scheduled: rows.filter(a => a.status === 'scheduled').length,
    expiring: rows.filter(a => a.status === 'live' && a.daysLeft !== null && a.daysLeft <= 7).length,
    contracted: sum(a => Number(a.price) || 0),
    collected: sum(a => a.paid),
    outstanding: sum(a => (a.status === 'ended' || a.status === 'live' || a.status === 'scheduled' || a.status === 'awaiting' || a.status === 'paused') ? a.due : 0),
    monthCollected: list.reduce((x, a) => x + (a.payments || []).filter(p => String(p.date || '').startsWith(m)).reduce((y, p) => y + (Number(p.amount) || 0), 0), 0),
  };
}

function cleanTarget(b, old) {
  const g = { mode: ['all', 'plan', 'city'].includes(b.mode) ? b.mode : 'all', plans: [], cities: [], exclude: [] };
  if (g.mode === 'plan') g.plans = [...new Set((b.plans || []).map(String).filter(p => PLANS[p]))];
  if (g.mode === 'city') g.cities = [...new Set((b.cities || []).map(x => s(x, 40)).filter(Boolean))].slice(0, 40);
  g.exclude = [...new Set((b.exclude || []).map(String).filter(id => tenants.get(id)))].slice(0, 200);
  if (g.mode === 'plan' && !g.plans.length) g.mode = 'all';
  if (g.mode === 'city' && !g.cities.length) g.mode = 'all';
  return g;
}
function clean(b, a) {
  if ('advertiser' in b) a.advertiser = s(b.advertiser, 80) || a.advertiser || 'Reklam veren';
  for (const [k, n] of [['contact', 80], ['phone', 30], ['email', 80], ['title', 80], ['note', 300]]) if (k in b) a[k] = s(b[k], n) || undefined;
  if ('price' in b) a.price = num(b.price);
  if ('packageId' in b) a.packageId = s(b.packageId, 24) || undefined;
  if ('start' in b) a.start = ymd(b.start) || undefined;
  if ('end' in b) a.end = ymd(b.end) || undefined;
  if (a.start && a.end && a.end < a.start) a.end = a.start;
  if ('every' in b) a.every = Math.max(1, Math.min(20, Math.round(Number(b.every)) || 4));
  if (typeof b.allowUnpaid === 'boolean') a.allowUnpaid = b.allowUnpaid || undefined;
  if (typeof b.paused === 'boolean') a.paused = b.paused || undefined;
  if (b.target && typeof b.target === 'object') a.target = cleanTarget(b.target, a.target);
  return a;
}

const pushAll = () => { for (const t of tenants.all()) { try { hub.pushTenant(t.id); } catch (e) { /* bağlı ekran yok */ } } };

// Tarih geçişleri (başlangıç/bitiş günü, ödeme) için: yayındaki reklam kümesi değişince ekranlara bildir
let lastSig = '';
const sig = () => load().filter(a => status(a) === 'live').map(a => a.id + ':' + a.creatives.length + ':' + (a.every || 4) + ':' + JSON.stringify(a.target || {})).join('|');
function watch() { lastSig = sig(); setInterval(() => { const n = sig(); if (n !== lastSig) { lastSig = n; pushAll(); } }, 5 * 60 * 1000).unref(); }

// Eski sistem (işletme kendi reklam alanı): kaldırıldı; kalan reklam kayıtları ve görselleri bir kez temizlenir
function purgeLegacy() {
  let n = 0;
  for (const t of tenants.all()) {
    const has = (t.db.ads && t.db.ads.length) || (t.db.videos || []).some(v => v.ad);
    if (!has) continue;
    for (const v of t.db.videos.filter(x => x.ad)) {
      for (const f of [v.file, v.design && v.design.photo]) if (f) { try { require('./storage').remove(t, f); } catch (e) { /* yok */ } }
      n++;
    }
    t.db.videos = t.db.videos.filter(x => !x.ad); delete t.db.ads;
    tenants.save(t);
  }
  if (n) console.log(`Eski işletme reklamları temizlendi (${n} görsel)`);
}

// ---------- görsel / video yükleme ----------
const upload = multer({
  storage: multer.diskStorage({ destination: (req, f, cb) => cb(null, DIR), filename: (_, f, cb) => cb(null, 'raw-' + auth.uid(16) + path.extname(f.originalname).toLowerCase().slice(0, 6)) }),
  limits: { fileSize: 300 * 1024 * 1024, files: 10 },
});
async function prepare(file) {
  const src = path.join(DIR, file.filename), isImg = /^image\//.test(file.mimetype), id = auth.uid(10);
  try {
    if (isImg) {
      if (!sharp || /svg/.test(file.mimetype)) throw new Error('Yalnız JPG, PNG veya WEBP görsel yüklenebilir');
      const keep = /png|webp/.test(file.mimetype), name = id + '-' + auth.uid(8) + (keep ? '.png' : '.jpg');
      let img = sharp(src).rotate().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true });
      img = keep ? img.png({ compressionLevel: 9 }) : img.jpeg({ quality: 86 });
      await img.toFile(path.join(DIR, name));
      return { id, file: name, type: 'image', name: s(file.originalname, 80) };
    }
    if (!media.ffmpegOk) throw new Error('Video işlemek için ffmpeg gerekli');
    const name = id + '-' + auth.uid(8) + '.mp4', out = path.join(DIR, name);
    await require('./feeds').runFfmpeg(['-y', '-i', src, '-vf', "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=fps='min(source_fps,30)',format=yuv420p",
      '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.1', '-preset', 'veryfast', '-crf', '23', '-maxrate', '6M', '-bufsize', '12M', '-an', '-movflags', '+faststart', '-threads', '2', out]);
    return { id, file: name, type: 'video', name: s(file.originalname, 80), dur: await media.probeDur(out) };
  } finally { fs.rmSync(src, { force: true }); }
}
const rm = c => { if (c && /^[\w.-]+$/.test(c.file)) fs.rmSync(path.join(DIR, c.file), { force: true }); };

function routes(r) {
  const find = (req, res) => { const list = load(), a = list.find(x => x.id === req.params.id); if (!a) { res.status(404).json({ error: 'Reklam bulunamadı' }); return null; } return { list, a }; };
  const cities = () => [...new Set(tenants.all().map(t => String(((t.db || {}).location || {}).city || '').trim()).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'tr'));
  r.get('/pads', (req, res) => {
    const list = load();
    res.json({
      ads: list.map(a => derive(a, true)).sort((x, y) => y.created - x.created), packages: packages(), summary: summary(list), methods: METHODS,
      plans: Object.entries(PLANS).map(([id, p]) => ({ id, name: p.name })), cities: cities(), tenants: tenants.all().map(t => ({ id: t.id, name: t.name, city: ((t.db || {}).location || {}).city || '' })).sort((x, y) => x.name.localeCompare(y.name, 'tr')),
    });
  });
  r.get('/pads/:id', (req, res) => {
    const f = find(req, res); if (!f) return;
    const p = perf(f.a), names = new Map(tenants.all().map(t => [t.id, t.name]));
    const days = Object.keys(p.daily).sort();
    res.json({ ad: derive(f.a, true), perf: { shown: p.shown, sec: p.sec, tenants: p.tenants.size, daily: days.slice(-60).map(d => ({ day: d, shown: p.daily[d] })),
      byTenant: Object.entries(p.byTenant).map(([id, n]) => ({ id, name: names.get(id) || '-', shown: n })).sort((x, y) => y.shown - x.shown).slice(0, 30), byCreative: p.byCreative } });
  });
  r.post('/pads', (req, res) => {
    const list = load(); if (list.length >= 500) return res.status(400).json({ error: 'En fazla 500 reklam kaydı tutulur; eskileri silin' });
    const b = req.body || {}; if (!s(b.advertiser, 80)) return res.status(400).json({ error: 'Reklam veren (işletme) adı gerekli' });
    const a = clean(b, { id: auth.uid(10), token: crypto.randomBytes(15).toString('base64url'), created: Date.now(), every: 4, creatives: [], payments: [], target: { mode: 'all', plans: [], cities: [], exclude: [] } });
    list.push(a); save(list); res.json({ ok: true, id: a.id });
  });
  r.put('/pads/:id', (req, res) => { const f = find(req, res); if (!f) return; clean(req.body || {}, f.a); save(f.list); pushAll(); res.json({ ok: true, ad: derive(f.a) }); });
  r.delete('/pads/:id', (req, res) => { const f = find(req, res); if (!f) return; f.a.creatives.forEach(rm); save(f.list.filter(x => x !== f.a)); pushAll(); res.json({ ok: true }); });
  r.post('/pads/:id/token', (req, res) => { const f = find(req, res); if (!f) return; f.a.token = crypto.randomBytes(15).toString('base64url'); save(f.list); res.json({ ok: true, url: `${config.BASE_URL}/ra/${f.a.token}` }); });
  r.post('/pads/:id/media', upload.array('files'), async (req, res) => {
    const f = find(req, res); if (!f) { for (const x of req.files || []) fs.rmSync(x.path, { force: true }); return; }
    const errs = [];
    for (const x of req.files || []) {
      if (f.a.creatives.length >= 12) { fs.rmSync(x.path, { force: true }); errs.push('En fazla 12 görsel'); continue; }
      try { f.a.creatives.push(await prepare(x)); } catch (e) { errs.push(e.message); }
    }
    save(f.list); pushAll(); res.json({ ok: true, errors: errs, ad: derive(f.a) });
  });
  r.delete('/pads/:id/media/:cid', (req, res) => {
    const f = find(req, res); if (!f) return; const c = f.a.creatives.find(x => x.id === req.params.cid);
    if (c) { rm(c); f.a.creatives = f.a.creatives.filter(x => x !== c); save(f.list); pushAll(); }
    res.json({ ok: true, ad: derive(f.a) });
  });
  r.post('/pads/:id/payments', (req, res) => {
    const f = find(req, res); if (!f) return; const b = req.body || {}, amount = num(b.amount);
    if (!(amount > 0)) return res.status(400).json({ error: 'Tutar sıfırdan büyük olmalı' });
    f.a.payments = f.a.payments || [];
    f.a.payments.push({ id: auth.uid(8), amount, date: ymd(b.date) || today(), method: METHODS.includes(b.method) ? b.method : 'diger', note: s(b.note, 120) || undefined });
    save(f.list); pushAll(); res.json({ ok: true, ad: derive(f.a) });
  });
  r.delete('/pads/:id/payments/:pid', (req, res) => {
    const f = find(req, res); if (!f) return; f.a.payments = (f.a.payments || []).filter(p => p.id !== req.params.pid);
    save(f.list); pushAll(); res.json({ ok: true, ad: derive(f.a) });
  });
  r.put('/pad-packages', (req, res) => {
    const out = (Array.isArray((req.body || {}).packages) ? req.body.packages : []).slice(0, 20).map(p => ({ id: s(p.id, 24) || auth.uid(6), name: s(p.name, 40), days: Math.max(1, Math.min(730, Math.round(Number(p.days)) || 30)), price: num(p.price) })).filter(p => p.name);
    store.setSetting(PKG, JSON.stringify(out)); res.json({ ok: true, packages: out });
  });
}

// Reklam verene açık rapor sayfası
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function page(req, res) {
  res.set('Cache-Control', 'no-store'); res.set('X-Robots-Tag', 'noindex, nofollow');
  const tk = String(req.params.token || ''), a = /^[\w-]{16,40}$/.test(tk) ? load().find(x => x.token === tk) : null;
  if (!a) return res.status(404).type('text/plain; charset=utf-8').send('Rapor bulunamadı');
  const d = derive(a), p = perf(a), nf = n => Number(n || 0).toLocaleString('tr-TR');
  const fd = v => v ? new Date(v + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const dur = sec => sec >= 3600 ? (sec / 3600).toFixed(1).replace('.', ',') + ' saat' : Math.max(sec ? 1 : 0, Math.round(sec / 60)) + ' dakika';
  const ST = { live: 'Yayında', scheduled: 'Başlamadı', ended: 'Sona erdi', paused: 'Durduruldu', draft: 'Hazırlanıyor', awaiting: 'Başlamayı bekliyor' };
  const days = Object.keys(p.daily).sort().slice(-60), mx = Math.max(1, ...days.map(x => p.daily[x]));
  res.type('html').send(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Reklam raporu · ${esc(a.title || a.advertiser)}</title><style>
@font-face{font-family:M;src:url(/fonts/montserrat-latin.woff2) format('woff2');font-weight:100 900;unicode-range:U+0000-00FF,U+0131,U+2000-206F,U+20BA}
@font-face{font-family:M;src:url(/fonts/montserrat-latin-ext.woff2) format('woff2');font-weight:100 900;unicode-range:U+0100-024F}
*{box-sizing:border-box}body{margin:0;font-family:M,system-ui,sans-serif;background:#f4f1ec;color:#1d1a16;line-height:1.45}.w{max-width:860px;margin:0 auto;padding:32px 20px 48px}
h1{font-size:28px;margin:4px 0 2px}.mut{color:#7a7166;font-size:14px}.pill{display:inline-block;padding:4px 12px;border-radius:20px;font-weight:700;font-size:13px;background:#e6dccd}.pill.live{background:#d5f0de;color:#1c6b3a}
.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:22px 0}.c{background:#fff;border-radius:14px;padding:16px 18px;box-shadow:0 1px 2px rgba(0,0,0,.05)}.c b{display:block;font-size:30px;font-weight:800}.c span{color:#7a7166;font-size:13px}
.bx{background:#fff;border-radius:14px;padding:18px;margin-top:14px;box-shadow:0 1px 2px rgba(0,0,0,.05)}h2{font-size:16px;margin:0 0 12px}.bars{display:flex;align-items:flex-end;gap:2px;height:130px}.bars div{flex:1;height:100%;display:flex;align-items:flex-end}
.bars i{display:block;width:100%;background:#c9955c;border-radius:3px 3px 0 0;min-height:2px}.ft{margin-top:24px;font-size:12px;color:#9a9086}@media print{body{background:#fff}.c,.bx{box-shadow:none;border:1px solid #e6dccd}.np{display:none}}
</style></head><body><div class="w"><div class="mut">${esc(a.advertiser)} · ekran reklam raporu</div><h1>${esc(a.title || a.advertiser)}</h1>
<div class="mut">${fd(a.start)}${a.end ? ' – ' + fd(a.end) : ''}${d.daysLeft !== null && d.status === 'live' ? ` · ${d.daysLeft} gün kaldı` : ''}</div>
<div style="margin-top:10px"><span class="pill ${d.status === 'live' ? 'live' : ''}">${ST[d.status] || ''}</span> <button class="np" onclick="print()" style="margin-left:8px;border:0;background:#1d1a16;color:#fff;border-radius:8px;padding:6px 12px;cursor:pointer">Yazdır / PDF</button></div>
<div class="g"><div class="c"><b>${nf(p.shown)}</b><span>kez ekranda gösterildi</span></div><div class="c"><b>${nf(p.tenants.size)}</b><span>farklı mekânda yayınlandı</span></div><div class="c"><b>${dur(p.sec)}</b><span>toplam ekranda kalma süresi</span></div></div>
${days.length ? `<div class="bx"><h2>Günlük gösterim</h2><div class="bars">${days.map(x => `<div title="${fd(x)}: ${nf(p.daily[x])} gösterim"><i style="height:${Math.max(2, Math.round(p.daily[x] / mx * 100))}%"></i></div>`).join('')}</div>
<div class="mut" style="display:flex;justify-content:space-between;font-size:12px;margin-top:4px"><span>${fd(days[0])}</span><span>${fd(days[days.length - 1])}</span></div></div>` : ''}
<div class="ft">Sayılar, reklamın yayınlandığı mekânlardaki ekranların bildirdiği oynatmalardan otomatik oluşur. Son güncelleme: ${new Date().toLocaleString('tr-TR')}</div></div></body></html>`);
}

// /u/ads/<dosya>
function serve(req, res) {
  const f = String(req.params.file || '');
  if (!/^[\w-]+\.[a-z0-9]{1,5}$/i.test(f)) return res.status(400).end();
  const p = path.join(DIR, f); if (!fs.existsSync(p)) return res.status(404).end();
  res.set('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox"); res.set('X-Content-Type-Options', 'nosniff');
  res.set('Cache-Control', 'public, max-age=31536000, immutable'); res.sendFile(p);
}

module.exports = { inject, routes, page, serve, watch, purgeLegacy, status, DIR };
