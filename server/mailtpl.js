// Ortak e-posta şablonu: ScreenPano'dan giden tüm postalar (doğrulama, şifre sıfırlama,
// ekran uyarıları, haftalık özet, platform uyarıları) aynı kurumsal görünüme bürünür.
// E-posta istemcileri CSS'i kısmen destekler: tablo yerleşimi + satır içi stil kullanılır.
const config = require('./config');

const e = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GOLD = '#c9955c', INK = '#171b1f', SOFT = '#5b6470', LINE = '#e4e7eb';

// içerik yardımcıları: paragraf, vurgulu satır çifti (etiket/değer), madde listesi
const p = (t, cls) => `<p style="margin:0 0 14px;font:400 15px/1.65 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${cls === 'soft' ? SOFT : INK}">${t}</p>`;
const kv = (label, value) => `<tr>
  <td style="padding:10px 0;border-bottom:1px solid ${LINE};font:600 13px/1.4 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${SOFT};white-space:nowrap">${label}</td>
  <td style="padding:10px 0 10px 16px;border-bottom:1px solid ${LINE};font:700 15px/1.4 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};text-align:right">${value}</td>
</tr>`;
const ul = items => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 6px">${items.map(t => `<tr><td style="padding:0 0 8px 18px;font:400 15px/1.55 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};position:relative">&#8226;&nbsp;&nbsp;${t}</td></tr>`).join('')}</table>`;

// ana sayfa: başlık bandı + içerik + isteğe bağlı düğme + dipnot + alt bilgi
function html({ title, body, cta, ctaLabel, small }) {
  const brand = config.BRAND || 'ScreenPano';
  const mark = brand === 'ScreenPano'
    ? `<span style="color:#f4f2ee;font:700 22px/1 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;letter-spacing:.01em">Screen</span><span style="color:${GOLD};font:700 22px/1 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;letter-spacing:.01em">Pano</span>`
    : `<span style="color:#f4f2ee;font:700 20px/1 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">${e(brand)}</span>`;
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title></head>
<body style="margin:0;padding:0;background:#eef0f3">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f3;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border:1px solid ${LINE};border-radius:14px;overflow:hidden">
  <tr><td style="background:#101214;padding:26px 32px;border-bottom:3px solid ${GOLD}">${mark}</td></tr>
  <tr><td style="padding:30px 32px 8px">
    <h1 style="margin:0 0 18px;font:700 21px/1.3 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK}">${title}</h1>
    ${body || ''}
  </td></tr>
  ${cta ? `<tr><td style="padding:8px 32px 6px" align="center">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:9px;background:${GOLD}">
      <a href="${e(cta)}" style="display:inline-block;padding:14px 30px;font:700 15px/1 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#191104;text-decoration:none;border-radius:9px">${e(ctaLabel || 'Aç')}</a>
    </td></tr></table>
    <p style="margin:12px 0 0;font:400 12px/1.5 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${SOFT}">Düğme çalışmıyorsa bağlantıyı tarayıcınıza yapıştırın:<br><a href="${e(cta)}" style="color:${GOLD};word-break:break-all">${e(cta)}</a></p>
  </td></tr>` : ''}
  <tr><td style="padding:14px 32px 26px">
    ${small ? `<p style="margin:0 0 10px;font:400 13px/1.6 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${SOFT}">${small}</p>` : ''}
  </td></tr>
  <tr><td style="background:#f6f7f9;border-top:1px solid ${LINE};padding:18px 32px">
    <p style="margin:0;font:400 12px/1.6 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#8a919b">
      ${e(brand)} · Dijital ekran ve menü panosu<br>
      <a href="${e(config.BASE_URL)}" style="color:#8a919b;text-decoration:underline">${e(config.BASE_URL.replace(/^https?:\/\//, ''))}</a> · Bu ileti otomatik olarak gönderilmiştir.
    </p>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

// uyarı postaları (ekran çevrimdışı/açık, platform sınırları): başlık + tanım + tablo + ipuçları
function alert({ title, lead, rows, bullets, cta, ctaLabel, small }) {
  let body = '';
  if (lead) body += p(lead);
  if (rows && rows.length) body += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px">${rows.map(([k, v]) => kv(k, v)).join('')}</table>`;
  if (bullets && bullets.length) body += ul(bullets);
  return html({ title, body, cta, ctaLabel, small });
}

module.exports = { html, alert, e, p, kv, ul };
