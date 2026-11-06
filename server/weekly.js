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
  const camp = j.impact.filter(x => x.kind !== 'ad' && (x.scans || x.shown)).slice(0, 5);
  if (camp.length) {
    L.push('', 'Kampanya etkisi (gösterim → QR okutma):');
    for (const x of camp) L.push(`• ${x.name}: ${nf(x.shown)} gösterim, ${nf(x.scans)} okutma${x.rate != null && x.shown ? ` (100 gösterimde ${String(x.rate).replace('.', ',')})` : ''}`);
  }
  const ads = (t.db.ads || []).map(a => { const rows = j.impact.filter(x => x.kind === 'ad' && (t.db.videos.find(v => v.id === x.id) || {}).ad === a.id); return { a, shown: rows.reduce((s, x) => s + x.shown, 0), scans: rows.reduce((s, x) => s + x.scans, 0) }; }).filter(x => x.shown || x.scans);
  if (ads.length) { L.push('', 'Reklamlar:'); for (const x of ads) L.push(`• ${x.a.name}: ${nf(x.shown)} gösterim${x.scans ? `, ${nf(x.scans)} QR okutma` : ''}`); }
  const best = j.impact.find(x => x.scans);
  if (best && best.peakHour >= 0) L.push('', `İpucu: "${best.name}" en çok ${String(best.peakHour).padStart(2, '0')}:00 civarında okutuluyor; bu saatlerde daha sık göstermeyi deneyebilirsiniz.`);
  L.push('', `Ayrıntılar: ${config.BASE_URL}/panel#stats`, 'Bu e-postayı Ayarlar → Bildirimler bölümünden kapatabilirsiniz.');
  return L.join('\n');
}

// Pazartesi 09:00'dan sonra haftada bir kez (sunucu yeniden başlasa da aynı hafta ikinci kez gitmez)
async function tick() {
  const n = SCH.parts();
  if (n.dow !== 1 || n.hm < '09:00') return;
  const monitor = require('./monitor');
  if (!monitor.mailEnabled()) return;
  for (const t of tenants.all()) {
    const no = t.db.notify || {};
    if (!no.email || !no.weekly || no.weeklyAt === n.ymd) continue;
    if (!require('./plans').access(t).ok) continue;
    no.weeklyAt = n.ymd; tenants.save(t);
    try { await monitor.sendMail(no.email, `${config.BRAND}: haftalık özet · ${t.name}`, text(t)); } catch (e) { console.error('Haftalık özet:', e.message); }
  }
}
function start() { setInterval(() => tick().catch(e => console.error('Haftalık özet:', e.message)), 10 * 60000); setTimeout(() => tick().catch(() => {}), 90000); }

module.exports = { start, text };
