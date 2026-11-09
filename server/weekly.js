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
  const L = [`${t.name} · ${config.BRAND || 'ScreenPano'} Haftalık Ekran ve Performans Özeti (${j.daily[0].day} – ${j.daily[j.daily.length - 1].day})`, ''];
  L.push(`• Toplam Yayın Süresi: ${hrs(T.online)} saat${pct(T.online, j.prev.online)}`);
  L.push(`• Oynatılan İçerik: ${nf(T.plays)} kez${pct(T.plays, j.prev.plays)}`);
  L.push(`• QR Okutma & Etkileşim: ${nf(T.scans)} kez${pct(T.scans, j.prev.scans)}`);
  L.push(T.drops ? `• Kesinti: ${T.drops} kez, toplam ${Math.round(T.dropsec / 60)} dakika` : '• Kesintisiz Yayın: %100 Uptime (Sıfır kesinti)');
  const camp = j.impact.filter(x => (x.scans || x.shown)).slice(0, 5);
  if (camp.length) {
    L.push('', 'Kampanya Etkisi (Gösterim → QR Okutma):');
    for (const x of camp) L.push(`• ${x.name}: ${nf(x.shown)} gösterim, ${nf(x.scans)} okutma${x.rate != null && x.shown ? ` (100 gösterimde ${String(x.rate).replace('.', ',')})` : ''}`);
  }
  const best = j.impact.find(x => x.scans);
  if (best && best.peakHour >= 0) L.push('', `💡 Akıllı İpucu: "${best.name}" en çok ${String(best.peakHour).padStart(2, '0')}:00 civarında okutuluyor; bu saatlerde daha sık göstermeyi deneyebilirsiniz.`);
  L.push('', `Ayrıntılar: ${config.BASE_URL}/panel#stats`, 'Bu e-postayı İşletme Paneli > Ayarlar > Bildirimler bölümünden kapatabilirsiniz.');
  return L.join('\n');
}

// aynı özetin şablonlu HTML biçimi (mailtpl)
function html(t) {
  const tpl = require('./mailtpl');
  const j = stats.summary(t, 7), T = j.totals, hrs = m => (m / 60).toFixed(1).replace('.', ',');
  const periodStr = `${j.daily[0].day} – ${j.daily[j.daily.length - 1].day}`;

  const trendSub = (cur, prev) => {
    if (!prev) return 'Geçen hafta verisi yok';
    const p = Math.round((cur - prev) / prev * 100);
    if (!p) return 'Geçen hafta ile aynı';
    return `${p > 0 ? '▲ +' : '▼ '}${p}% geçen haftaya göre`;
  };
  const trendColor = (cur, prev) => {
    if (!prev) return '#6b7280';
    const p = Math.round((cur - prev) / prev * 100);
    return p > 0 ? '#15803d' : p < 0 ? '#b91c1c' : '#6b7280';
  };

  const metricCards = [
    {
      label: 'Toplam Yayın',
      value: hrs(T.online),
      unit: 'saat',
      sub: trendSub(T.online, j.prev.online),
      subColor: trendColor(T.online, j.prev.online),
    },
    {
      label: 'Oynatılan İçerik',
      value: nf(T.plays),
      unit: 'kez',
      sub: trendSub(T.plays, j.prev.plays),
      subColor: trendColor(T.plays, j.prev.plays),
    },
    {
      label: 'QR Menü & Etkileşim',
      value: nf(T.scans),
      unit: 'okutma',
      color: tpl.GOLD,
      sub: trendSub(T.scans, j.prev.scans),
      subColor: trendColor(T.scans, j.prev.scans),
    },
    {
      label: 'Yayın Kararlılığı',
      value: T.drops ? `${T.drops}` : '%100',
      unit: T.drops ? 'kesinti' : 'Uptime',
      color: T.drops ? '#b91c1c' : '#15803d',
      sub: T.drops ? `Toplam ${Math.round(T.dropsec / 60)} dakika` : 'Kesintisiz yayın',
      subColor: T.drops ? '#b91c1c' : '#15803d',
    },
  ];

  let body = tpl.p(`Merhaba <b>${tpl.e(t.name)}</b>,`)
    + tpl.p(`<b>${tpl.e(periodStr)}</b> tarihleri arasındaki haftalık ekran yayın süreleriniz, içerik gösterimleriniz ve müşteri etkileşim özetiniz aşağıdadır:`)
    + tpl.metricGrid(metricCards);

  const camp = j.impact.filter(x => (x.scans || x.shown)).slice(0, 5);
  if (camp.length) {
    const campRows = camp.map((x, i) => `<tr>
      <td style="padding:10px 14px;border-bottom:${i === camp.length - 1 ? 'none' : '1px solid ' + tpl.LINE};font:600 13px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;color:${tpl.INK}">${tpl.e(x.name)}</td>
      <td align="right" style="padding:10px 14px;border-bottom:${i === camp.length - 1 ? 'none' : '1px solid ' + tpl.LINE};font:500 13px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;color:${tpl.SOFT}">${nf(x.shown)}</td>
      <td align="right" style="padding:10px 14px;border-bottom:${i === camp.length - 1 ? 'none' : '1px solid ' + tpl.LINE};font:700 13px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;color:${tpl.GOLD}">${nf(x.scans)}</td>
      <td align="right" style="padding:10px 14px;border-bottom:${i === camp.length - 1 ? 'none' : '1px solid ' + tpl.LINE};font:600 13px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;color:${tpl.INK}">${x.rate != null && x.shown ? `%${String(x.rate).replace('.', ',')}` : '—'}</td>
    </tr>`).join('');

    body += `<div style="margin:22px 0 16px">
      <div style="font:700 14px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${tpl.INK};margin-bottom:8px">Öne Çıkan Kampanyalar ve Menü Etkileşimi</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${tpl.LINE};border-radius:10px;overflow:hidden">
        <tr style="background:#f8fafc">
          <th align="left" style="padding:9px 14px;font:600 11px/1.3 -apple-system,BlinkMacSystemFont,sans-serif;color:${tpl.SOFT};border-bottom:1px solid ${tpl.LINE};text-transform:uppercase;letter-spacing:0.04em">İçerik / Kampanya</th>
          <th align="right" style="padding:9px 14px;font:600 11px/1.3 -apple-system,BlinkMacSystemFont,sans-serif;color:${tpl.SOFT};border-bottom:1px solid ${tpl.LINE};text-transform:uppercase;letter-spacing:0.04em">Gösterim</th>
          <th align="right" style="padding:9px 14px;font:600 11px/1.3 -apple-system,BlinkMacSystemFont,sans-serif;color:${tpl.SOFT};border-bottom:1px solid ${tpl.LINE};text-transform:uppercase;letter-spacing:0.04em">QR Okutma</th>
          <th align="right" style="padding:9px 14px;font:600 11px/1.3 -apple-system,BlinkMacSystemFont,sans-serif;color:${tpl.SOFT};border-bottom:1px solid ${tpl.LINE};text-transform:uppercase;letter-spacing:0.04em">Dönüşüm</th>
        </tr>
        ${campRows}
      </table>
    </div>`;
  }

  const best = j.impact.find(x => x.scans);
  if (best && best.peakHour >= 0) {
    body += tpl.callout(`💡 <b>Akıllı İşletme İpucu:</b> "<b>${tpl.e(best.name)}</b>" kampanyanız en yoğun etkileşimi saat <b>${String(best.peakHour).padStart(2, '0')}:00</b> civarında alıyor. Bu saat diliminde içeriğe oynatma listesinde daha sık yer vererek müşteri etkileşimini artırabilirsiniz.`, 'tip');
  }

  return tpl.html({
    title: 'Haftalık Ekran ve Performans Özeti',
    badge: 'Haftalık Rapor',
    badgeColor: 'brand',
    preheader: `${t.name} için son 7 günün ekran süresi, oynatma ve QR etkileşim karnesi.`,
    body,
    cta: `${config.BASE_URL}/panel#stats`,
    ctaLabel: 'Ayrıntılı Grafikleri Panelde Gör',
    small: 'Bu haftalık özet raporunu dilediğiniz an İşletme Paneli > Ayarlar > Bildirimler bölümünden kapatabilirsiniz.',
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
    try { ok = await monitor.sendMail(no.email, `📊 ${config.BRAND || 'ScreenPano'} — Haftalık Ekran ve Performans Özeti · ${t.name}`, text(t), html(t)); } catch (e) { console.error('Haftalık özet:', e.message); }
    if (!ok) { fails.set(key, tries + 1); no.weeklyAt = prev; tenants.save(t); }
  }
}
function start() { setInterval(() => tick().catch(e => console.error('Haftalık özet:', e.message)), 10 * 60000); setTimeout(() => tick().catch(() => {}), 90000); }

module.exports = { start, text, html };
