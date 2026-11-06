// Reklam alanı: işletme ekranının bir kısmını başka işletmelere (yan dükkân, emlakçı, oto yıkama…) satar.
// db.ads: { id, name, contact, fee, note, sch, every, paused, token, created }
// Reklam görselleri/videoları db.videos içinde durur ve v.ad ile reklama bağlanır (yükleme, küçültme, önbellek aynı).
// Normal sırada oynamazlar; reklam takvimi ve sıklığına göre medya döngüsünün arasına serpiştirilirler.
// Reklam verene paylaşılan rapor adresi (/r/<token>) giriş istemez: gösterim sayısı, ekranda kalma süresi, QR okutma.
const crypto = require('crypto');
const config = require('./config');
const auth = require('./auth');
const tenants = require('./tenants');
const SCH = require('./sched');
const stats = require('./stats');
const { plan } = require('./plans');

const s = (v, n) => String(v ?? '').trim().slice(0, n);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const token = () => crypto.randomBytes(15).toString('base64url');
const today = () => SCH.parts().ymd;

// Reklamın durumu: yayında / bekliyor (başlangıç günü gelmedi) / bitti / durduruldu / görsel yok
function status(t, a) {
  if (a.paused) return 'paused';
  if (a.sch && a.sch.end && today() > a.sch.end) return 'ended';
  if (a.sch && a.sch.start && today() < a.sch.start) return 'waiting';
  if (!creatives(t, a).length) return 'empty';
  return 'live';
}
const creatives = (t, a) => (t.db.videos || []).filter(v => v.ad === a.id && !v.hidden && (v.status !== 'processing' || v.reopt));

// Medya döngüsüne reklam ekler: her reklam "every" içerikte bir, sırayla görsellerinden biri. Saat/gün sınırı
// reklamın takviminden gelir (TV, zamanı dışındaki öğeyi sırada atlar). Ekranda başka içerik yoksa yalnız reklamlar döner.
function inject(t, list, toItem) {
  if (!plan(t).pro) return list;
  const ads = (t.db.ads || []).filter(a => !['paused', 'ended', 'empty'].includes(status(t, a)));
  if (!ads.length) return list;
  const pools = ads.map(a => ({ a, items: creatives(t, a).map(v => ({ ...toItem(v), sch: a.sch || null, ad: a.id })), k: 0, every: Math.max(1, Math.min(20, Number(a.every) || 4)) }));
  if (!list.length) return pools.flatMap(p => p.items);
  const out = [];
  list.forEach((v, i) => {
    out.push(v);
    for (const p of pools) if ((i + 1) % p.every === 0) out.push(p.items[p.k++ % p.items.length]);
  });
  for (const p of pools) if (list.length < p.every) out.push(p.items[0]); // kısa listede de en az bir kez
  return out;
}

// Rapor: reklamın başladığı günden (en çok 365 gün) bugüne
function report(t, a) {
  const start = (a.sch && a.sch.start) || new Date(a.created || Date.now()).toISOString().slice(0, 10);
  const days = Math.max(1, Math.min(365, Math.round((Date.parse(today()) - Date.parse(start)) / 86400000) + 1));
  const j = stats.summary(t, days);
  const ids = new Set((t.db.videos || []).filter(v => v.ad === a.id).map(v => v.id));
  const rows = j.impact.filter(x => ids.has(x.id));
  const daily = j.daily.map((d, i) => ({ day: d.day, shown: 0, scans: rows.reduce((s2, x) => s2 + (x.daily[i] || 0), 0) }));
  // günlük gösterim: oynatma sayaçları günlük tutulur; içerik bazında günlük döküm summary'de yok, ham satırlardan alınır
  const raw = require('./store').q.statRange.all(t.id, j.from);
  const idx = new Map(daily.map((d, i) => [d.day, i]));
  for (const r of raw) if (r.kind === 'play' && ids.has(r.key) && idx.has(r.day)) daily[idx.get(r.day)].shown += r.value;
  return {
    name: a.name, business: t.name, start, end: (a.sch && a.sch.end) || null, sch: a.sch || null, every: a.every, status: status(t, a),
    shown: rows.reduce((x, r) => x + r.shown, 0), sec: rows.reduce((x, r) => x + (r.sec || 0), 0), scans: rows.reduce((x, r) => x + r.scans, 0), tracked: rows.some(r => r.tracked),
    creatives: rows.map(r => ({ name: (t.db.videos.find(v => v.id === r.id) || {}).name || '', shown: r.shown, sec: r.sec || 0, scans: r.scans, tracked: r.tracked })),
    daily,
  };
}

function clean(b, a) {
  a.name = s(b.name, 60) || a.name || 'Reklam';
  if ('contact' in b) a.contact = s(b.contact, 80) || undefined;
  if ('fee' in b) a.fee = s(b.fee, 40) || undefined;
  if ('note' in b) a.note = s(b.note, 200) || undefined;
  if ('every' in b) a.every = Math.max(1, Math.min(20, Math.round(Number(b.every)) || 4));
  if ('sch' in b) { const c = SCH.clean(b.sch); if (c) a.sch = c; else delete a.sch; }
  if (typeof b.paused === 'boolean') a.paused = b.paused || undefined;
  return a;
}

function routes(r, { changed, upload, quota, ownerOnly, rmUpload }) {
  const media = require('./media');
  const find = (req, res) => { const a = (req.t.db.ads || []).find(x => x.id === req.params.id); if (!a) res.status(404).json({ error: 'Reklam bulunamadı' }); return a; };
  const view = t => (t.db.ads || []).map(a => ({ ...a, status: status(t, a), url: `${config.BASE_URL}/r/${a.token}` }));
  r.get('/ads', (req, res) => {
    const j = stats.summary(req.t, 30), by = {};
    for (const x of j.impact) if (x.kind === 'ad') { const v = req.t.db.videos.find(y => y.id === x.id); if (v && v.ad) { const o = by[v.ad] || (by[v.ad] = { shown: 0, scans: 0 }); o.shown += x.shown; o.scans += x.scans; } }
    res.json({ ads: view(req.t).map(a => ({ ...a, last30: by[a.id] || { shown: 0, scans: 0 } })) });
  });
  r.post('/ads', ownerOnly, (req, res) => {
    const t = req.t; t.db.ads = t.db.ads || [];
    if (t.db.ads.length >= 30) return res.status(400).json({ error: 'En fazla 30 reklam eklenebilir; bitenleri silin' });
    const a = clean(req.body || {}, { id: auth.uid(), token: token(), created: Date.now(), every: 4 });
    t.db.ads.push(a); changed(t); res.json({ ok: true, id: a.id });
  });
  r.put('/ads/:id', ownerOnly, (req, res) => { const a = find(req, res); if (!a) return; clean(req.body || {}, a); changed(req.t); res.json({ ok: true }); });
  r.post('/ads/:id/token', ownerOnly, (req, res) => { const a = find(req, res); if (!a) return; a.token = token(); changed(req.t); res.json({ ok: true }); }); // eski rapor adresi geçersiz olur
  r.delete('/ads/:id', ownerOnly, (req, res) => {
    const t = req.t, a = find(req, res); if (!a) return;
    for (const v of t.db.videos.filter(x => x.ad === a.id)) { if (v.file) rmUpload(t, v.file); if (v.design && v.design.photo) rmUpload(t, v.design.photo); }
    t.db.videos = t.db.videos.filter(x => x.ad !== a.id);
    t.db.ads = t.db.ads.filter(x => x.id !== a.id);
    changed(t); res.json({ ok: true });
  });
  // reklam görseli / videosu yükle
  r.post('/ads/:id/media', quota, upload.array('files'), (req, res) => {
    const t = req.t, a = find(req, res); if (!a) { for (const f of req.files || []) rmUpload(t, f.filename); return; }
    for (const f of req.files || []) {
      if (!/^(video|image)\//.test(f.mimetype)) { rmUpload(t, f.filename); continue; }
      const rec = { id: auth.uid(), file: f.filename, name: f.originalname, type: f.mimetype.startsWith('image/') ? 'image' : 'video', status: 'processing', ad: a.id };
      t.db.videos.push(rec); media.enqueue(t.id, rec.id);
    }
    changed(t); res.json({ ok: true });
  });
}

// Herkese açık rapor sayfası (reklam verene gönderilir)
function page(req, res) {
  const tk = String(req.params.token || '');
  res.set('Cache-Control', 'no-store'); res.set('X-Robots-Tag', 'noindex, nofollow');
  let t = null, a = null;
  if (/^[\w-]{16,40}$/.test(tk)) for (const x of tenants.all()) { const f = (x.db.ads || []).find(y => y.token === tk); if (f) { t = x; a = f; break; } }
  if (!a) return res.status(404).type('text/plain; charset=utf-8').send('Rapor bulunamadı');
  const R = report(t, a), nf = n => Number(n || 0).toLocaleString('tr-TR');
  const fd = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const dur = sec => sec >= 3600 ? (sec / 3600).toFixed(1).replace('.', ',') + ' saat' : Math.max(sec ? 1 : 0, Math.round(sec / 60)) + ' dakika';
  const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  const when = R.sch ? [R.sch.days ? R.sch.days.map(d => DAYS[d - 1]).join(', ') : 'Her gün', R.sch.from ? `${R.sch.from}–${R.sch.to}` : 'gün boyu'].join(' · ') : 'Her gün, gün boyu';
  const ST = { live: 'Yayında', waiting: 'Başlamadı', ended: 'Sona erdi', paused: 'Durduruldu', empty: 'Görsel bekleniyor' };
  const show = R.daily.slice(-60), mx = Math.max(1, ...show.map(d => d.shown));
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Reklam raporu · ${esc(R.name)}</title><style>
@font-face{font-family:M;src:url(/fonts/montserrat-latin.woff2) format('woff2');font-weight:100 900;unicode-range:U+0000-00FF,U+0131,U+2000-206F,U+20BA}
@font-face{font-family:M;src:url(/fonts/montserrat-latin-ext.woff2) format('woff2');font-weight:100 900;unicode-range:U+0100-024F}
*{box-sizing:border-box}body{margin:0;font-family:M,system-ui,sans-serif;background:#f4f1ec;color:#1d1a16;line-height:1.45}
.w{max-width:860px;margin:0 auto;padding:32px 20px 48px}.top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
h1{font-size:28px;margin:4px 0 2px}.mut{color:#7a7166;font-size:14px}.pill{display:inline-block;padding:4px 12px;border-radius:20px;font-weight:700;font-size:13px;background:#e6dccd}
.pill.live{background:#d5f0de;color:#1c6b3a}.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:22px 0}
.c{background:#fff;border-radius:14px;padding:16px 18px;box-shadow:0 1px 2px rgba(0,0,0,.05)}.c b{display:block;font-size:30px;font-weight:800}.c span{color:#7a7166;font-size:13px}
.bx{background:#fff;border-radius:14px;padding:18px;margin-top:14px;box-shadow:0 1px 2px rgba(0,0,0,.05)}h2{font-size:16px;margin:0 0 12px}
.bars{display:flex;align-items:flex-end;gap:2px;height:130px}.bars div{flex:1;height:100%;display:flex;align-items:flex-end}.bars i{display:block;width:100%;background:#c9955c;border-radius:3px 3px 0 0;min-height:1px}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:8px 6px;border-bottom:1px solid #eee6da;text-align:left}th{color:#7a7166;font-weight:600}td.n,th.n{text-align:right}
.ft{margin-top:24px;font-size:12px;color:#9a9086}@media print{body{background:#fff}.c,.bx{box-shadow:none;border:1px solid #e6dccd}.np{display:none}}
</style></head><body><div class="w">
<div class="top"><div><div class="mut">${esc(R.business)} · ekran reklam raporu</div><h1>${esc(R.name)}</h1><div class="mut">${fd(R.start)}${R.end ? ' – ' + fd(R.end) : ' başlangıçlı'} · ${esc(when)} · her ${R.every || 4} içerikte bir</div></div>
<div><span class="pill ${R.status === 'live' ? 'live' : ''}">${ST[R.status] || ''}</span> <button class="np" onclick="print()" style="margin-left:8px;border:0;background:#1d1a16;color:#fff;border-radius:8px;padding:7px 12px;font:inherit;cursor:pointer">Yazdır / PDF</button></div></div>
<div class="g"><div class="c"><b>${nf(R.shown)}</b><span>kez ekranda gösterildi</span></div><div class="c"><b>${dur(R.sec)}</b><span>toplam ekranda kalma süresi</span></div>
${R.tracked ? `<div class="c"><b>${nf(R.scans)}</b><span>kez QR kod okutuldu</span></div>` : ''}<div class="c"><b>${nf(R.daily.filter(d => d.shown).length)}</b><span>gün yayında</span></div></div>
<div class="bx"><h2>Günlük gösterim${show.length < R.daily.length ? ' (son 60 gün)' : ''}</h2><div class="bars">${show.map(d => `<div title="${fd(d.day)}: ${d.shown} gösterim${d.scans ? ', ' + d.scans + ' okutma' : ''}"><i style="height:${Math.round(d.shown / mx * 100)}%"></i></div>`).join('')}</div>
<div class="mut" style="display:flex;justify-content:space-between;font-size:12px;margin-top:4px"><span>${fd(show[0].day)}</span><span>${fd(show[show.length - 1].day)}</span></div></div>
${R.creatives.length ? `<div class="bx"><h2>Görseller</h2><table><thead><tr><th>Görsel</th><th class="n">Gösterim</th><th class="n">Süre</th>${R.tracked ? '<th class="n">QR okutma</th>' : ''}</tr></thead><tbody>${R.creatives.map(c => `<tr><td>${esc(c.name)}</td><td class="n">${nf(c.shown)}</td><td class="n">${dur(c.sec)}</td>${R.tracked ? `<td class="n">${c.tracked ? nf(c.scans) : '—'}</td>` : ''}</tr>`).join('')}</tbody></table></div>` : ''}
<div class="ft">Sayılar ${esc(R.business)} mekânındaki ekranların bildirdiği oynatmalardan otomatik oluşur; QR okutmalarında kişisel bilgi tutulmaz. Son güncelleme: ${new Date().toLocaleString('tr-TR', { timeZone: config.TZ })} · ${esc(config.BRAND)}</div>
</div></body></html>`;
  res.type('html').send(html);
}

module.exports = { inject, routes, page, report, status };
