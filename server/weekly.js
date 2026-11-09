// Haftalık özet e-postası: her pazartesi sabah, bildirim adresi girilmiş ve "haftalık özet" açık işletmelere
// son 7 günün özeti gider: ekran süresi, oynatma, QR okutma, en iyi kampanyalar, reklam gösterimleri, kesintiler.
const config = require('./config');
const tenants = require('./tenants');
const stats = require('./stats');
const SCH = require('./sched');

const nf = n => Number(n || 0).toLocaleString('tr-TR');
const pct = (cur, prev) => { if (!prev) return ''; const p = Math.round((cur - prev) / prev * 100); return p ? ` (${p > 0 ? '+' : ''}${p}% önceki haftaya göre)` : ''; };

function text(t) {
  const j = stats.summary(t, 7), T = j.totals, hrs = m => (m / 60).toFixed(1).replace('.', ',');
  const L = [`${t.name} · ${config.BRAND} haftalık özet (${j.daily[0].day} – ${j.daily[j.daily.length - 1].day})`, ''];
  L.push(`Ekran açık: ${hrs(T.online)} saat${pct(T.online, j.prev.online)}`);
  L.push(`İçerik oynatıldı: ${nf(T.plays)} kez${pct(T.plays, j.prev.plays)}`);
  L.push(`QR okutuldu: ${nf(T.scans)} kez${pct(T.scans, j.prev.scans)}`);
  if (T.drops) L.push(`Kesinti: ${T.drops} kez, toplam ${Math.round(T.dropsec / 60)} dk`);
  const camp = j.impact.filter(x => (x.scans || x.shown)).slice(0, 5);
  if (camp.length) {
    L.push('', 'Kampanya etkisi (gösterim → QR okutma):');
    for (const x of camp) L.push(`• ${x.name}: ${nf(x.shown)} gösterim, ${nf(x.scans)} okutma${x.rate != null && x.shown ? ` (100 gösterimde ${String(x.rate).replace('.', ',')})` : ''}`);
  }
  const best = j.impact.find(x => x.scans);
  if (best && best.peakHour >= 0) L.push('', `İpucu: "${best.name}" en çok ${String(best.peakHour).padStart(2, '0')}:00 civarında okutuluyor; bu saatlerde daha sık göstermeyi deneyebilirsiniz.`);
  L.push('', `Ayrıntılar: ${config.BASE_URL}/panel#stats`, 'Bu e-postayı Ayarlar → Bildirimler bölümünden kapatabilirsiniz.');
  return L.join('\n');
}

// aynı özetin şablonlu HTML biçimi (mailtpl)
function html(t) {
  const tpl = require('./mailtpl');
  const j = stats.summary(t, 7), T = j.totals, hrs = m => (m / 60).toFixed(1).replace('.', ',');
  const rows = [
    ['Dönem', tpl.e(`${j.daily[0].day} – ${j.daily[j.daily.length - 1].day}`)],
    ['Ekran açık', `${tpl.e(hrs(T.online))} saat${tpl.e(pct(T.online, j.prev.online))}`],
    ['İçerik oynatıldı', `${tpl.e(nf(T.plays))} kez${tpl.e(pct(T.plays, j.prev.plays))}`],
    ['QR okutuldu', `${tpl.e(nf(T.scans))} kez${tpl.e(pct(T.scans, j.prev.scans))}`],
  ];
  if (T.drops) rows.push(['Kesinti', `${T.drops} kez · toplam ${Math.round(T.dropsec / 60)} dk`]);
  const camp = j.impact.filter(x => (x.scans || x.shown)).slice(0, 5)
    .map(x => `<b>${tpl.e(x.name)}</b>: ${nf(x.shown)} gösterim, ${nf(x.scans)} okutma${x.rate != null && x.shown ? ` <span style="color:#5b6470">(100 gösterimde ${String(x.rate).replace('.', ',')})</span>` : ''}`);
  const best = j.impact.find(x => x.scans);
  return tpl.html({
    title: `Haftalık Özet · ${tpl.e(t.name)}`,
    body: tpl.p('Son 7 günün özeti aşağıda. Ayrıntılı grafikler için panele bakın.')
      + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px">${rows.map(([k, v]) => tpl.kv(k, v)).join('')}</table>`,
    cta: `${config.BASE_URL}/panel#stats`, ctaLabel: 'Ayrıntılı İstatistikler',
    small: (camp.length ? '<b>Kampanya etkisi</b> (gösterim → QR okutma)<br>' + camp.join('<br>') + '<br><br>' : '')
      + (best && best.peakHour >= 0 ? `<b>İpucu:</b> "${tpl.e(best.name)}" en çok ${String(best.peakHour).padStart(2, '0')}:00 civarında okutuluyor; bu saatlerde daha sık göstermeyi deneyebilirsiniz.<br><br>` : '')
      + 'Bu e-postayı Ayarlar → Bildirimler bölümünden kapatabilirsiniz.',
  });
}

// Pazartesi 09:00'dan sonra haftada bir kez (sunucu yeniden başlasa da aynı hafta ikinci kez gitmez)
const fails = new Map(); // işletme|gün -> başarısız gönderim sayısı
let running = false;
async function tick() {
  if (running) return; // önceki tur (yavaş SMTP) bitmeden ikinci tur başlamasın: aynı özet iki kez gitmesin
  running = true;
  try { await tickInner(); } finally { running = false; }
}
async function tickInner() {
  const n = SCH.parts();
  if (n.dow !== 1 || n.hm < '09:00') return;
  const monitor = require('./monitor');
  if (!monitor.mailEnabled()) return;
  for (const t of tenants.all()) {
    const no = t.db.notify || {};
    if (!no.email || !no.weekly || no.weeklyAt === n.ymd) continue;
    if (!require('./plans').access(t).ok) continue;
    // gönderilemezse o hafta kaybolmasın: işaret geri alınır, sonraki turda (10 dk) yeniden denenir; günde en çok 3 deneme
    const key = t.id + '|' + n.ymd, tries = (fails.get(key) || 0); if (tries >= 3) continue;
    const prev = no.weeklyAt; no.weeklyAt = n.ymd; tenants.save(t);
    let ok = false;
    try { ok = await monitor.sendMail(no.email, `${config.BRAND}: haftalık özet · ${t.name}`, text(t), html(t)); } catch (e) { console.error('Haftalık özet:', e.message); }
    if (!ok) { fails.set(key, tries + 1); no.weeklyAt = prev; tenants.save(t); }
  }
}
function start() { setInterval(() => tick().catch(e => console.error('Haftalık özet:', e.message)), 10 * 60000); setTimeout(() => tick().catch(() => {}), 90000); }

module.exports = { start, text, html };
