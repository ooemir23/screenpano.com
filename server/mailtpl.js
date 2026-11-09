// Ortak e-posta şablon motoru: ScreenPano'dan giden tüm postalar (doğrulama, şifre sıfırlama,
// ekran çevrimdışı/açık uyarıları, haftalık özet, platform uyarıları ve testler)
// uygulamanın kurumsal kimliği (Sahne - sinematik koyu / sıcak bakır) ile uyumlu,
// modern ve tüm e-posta istemcilerinde (Gmail, Apple Mail, Outlook) kusursuz çalışan şablonlara bürünür.
const config = require('./config');

const e = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Renk paleti (tokens.css ile uyumlu)
const GOLD = '#c9955c';       // ScreenPano sıcak bakır/altın vurgusu
const GOLD_DARK = '#906538';  // Koyu bakır
const INK = '#111827';        // Başlık ve koyu yazı
const BODY_TEXT = '#374151';  // Gövde metni
const SOFT = '#6b7280';       // Yardımcı metin
const MUTE = '#9ca3af';       // Açık dipnot
const LINE = '#e5e7eb';       // Çerçeve ve ayırıcı çizgi
const BG_PAGE = '#eef1f5';    // Sayfa zemini
const BG_CARD = '#ffffff';    // Kart zemini
const BG_HEADER = '#111315';  // Başlık bandı (ScreenPano koyu teması)

// Rozet (badge) stilleri
const BADGE_STYLES = {
  danger:  'background:#fef2f2;color:#991b1b;border:1px solid #fecaca;',
  success: 'background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;',
  warning: 'background:#fffbeb;color:#92400e;border:1px solid #fde68a;',
  info:    'background:#f0f9ff;color:#075985;border:1px solid #bae6fd;',
  brand:   'background:#222527;color:#c9955c;border:1px solid rgba(201,149,92,0.45);',
};

// Paragraf
const p = (text, cls) => `<p style="margin:0 0 14px;font:400 15px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${cls === 'soft' ? SOFT : BODY_TEXT}">${text}</p>`;

// Bilgi tablosu satırı (anahtar / değer)
const kv = (label, value) => `<tr>
  <td style="padding:11px 0;border-bottom:1px solid ${LINE};font:600 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${SOFT};white-space:nowrap;vertical-align:top">${label}</td>
  <td style="padding:11px 0 11px 16px;border-bottom:1px solid ${LINE};font:700 14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${INK};text-align:right;vertical-align:top">${value}</td>
</tr>`;

// Vurgulu kutu (ipucu, uyarı veya bilgilendirme kutusu)
function callout(text, type = 'tip') {
  const cfg = {
    tip:     { bg: '#fefbf6', border: GOLD, text: '#78350f', icon: '💡' },
    warning: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e', icon: '⚠️' },
    danger:  { bg: '#fef2f2', border: '#ef4444', text: '#991b1b', icon: '🛑' },
    success: { bg: '#f0fdf4', border: '#22c55e', text: '#166534', icon: '✓' },
    info:    { bg: '#f0f9ff', border: '#0ea5e9', text: '#075985', icon: 'ℹ️' },
  }[type] || { bg: '#fefbf6', border: GOLD, text: '#78350f', icon: '💡' };

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:${cfg.bg};border-left:4px solid ${cfg.border};border-radius:0 10px 10px 0">
    <tr><td style="padding:14px 16px;font:400 14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${cfg.text}">
      ${text}
    </td></tr>
  </table>`;
}

// Kontrol listesi / madde işaretleri
function ul(items, title) {
  if (!items || !items.length) return '';
  const head = title ? `<div style="margin:0 0 10px;font:700 14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${INK}">${e(title)}</div>` : '';
  const rows = items.map(item => `<tr>
    <td style="padding:4px 10px 8px 0;vertical-align:top;font:700 14px/1 -apple-system,BlinkMacSystemFont,sans-serif;color:${GOLD}">•</td>
    <td style="padding:0 0 8px 0;vertical-align:top;font:400 14px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${BODY_TEXT}">${item}</td>
  </tr>`).join('');
  return `<div style="margin:16px 0 12px">${head}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></div>`;
}

// 2x2 veya 1x4 Metrik Izgarası (Haftalık özet ve performans için)
function metricGrid(cards) {
  if (!cards || !cards.length) return '';
  const cells = cards.map(c => `
    <td width="50%" style="padding:6px;vertical-align:top">
      <div style="background:#f9fafb;border:1px solid ${LINE};border-radius:10px;padding:14px 14px 12px;text-align:left">
        <div style="font:600 11px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${SOFT};text-transform:uppercase;letter-spacing:0.04em">${c.label}</div>
        <div style="font:700 20px/1.25 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${c.color || INK};margin:6px 0 3px">${c.value} <span style="font-size:13px;font-weight:500;color:${SOFT}">${c.unit || ''}</span></div>
        ${c.sub ? `<div style="font:500 12px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${c.subColor || SOFT}">${c.sub}</div>` : ''}
      </div>
    </td>`);

  const rows = [];
  for (let i = 0; i < cells.length; i += 2) {
    rows.push(`<tr>${cells[i]}${cells[i + 1] || '<td width="50%"></td>'}</tr>`);
  }

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px -6px 18px">${rows.join('')}</table>`;
}

// Ana e-posta çerçevesi: Koyu marka başlığı + rozet + beyaz kart + CTA düğmesi + alt bilgi
function html({ title, badge, badgeColor = 'brand', preheader, body, cta, ctaLabel, small }) {
  const brand = config.BRAND || 'ScreenPano';
  const preview = preheader || title;
  const bStyle = BADGE_STYLES[badgeColor] || BADGE_STYLES.brand;

  // Başlık bandındaki ScreenPano logosu ve rozet
  const brandMarkup = brand === 'ScreenPano'
    ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;padding-right:11px">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:linear-gradient(135deg,#c9955c,#906538);border-radius:8px;padding:5px 8px;font:700 16px/1 -apple-system,BlinkMacSystemFont,sans-serif;color:#ffffff;text-align:center">
            📺
          </td></tr></table>
        </td>
        <td style="vertical-align:middle">
          <div style="line-height:1">
            <span style="color:#ffffff;font:700 21px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;letter-spacing:-0.02em">Screen</span><span style="color:${GOLD};font:700 21px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;letter-spacing:-0.02em">Pano</span>
          </div>
          <div style="color:#8a939e;font:500 10.5px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;letter-spacing:0.04em;text-transform:uppercase;margin-top:3px">Dijital Ekran ve Menü Panosu</div>
        </td>
      </tr></table>`
    : `<span style="color:#ffffff;font:700 20px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">${e(brand)}</span>`;

  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${e(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BG_PAGE};-webkit-font-smoothing:antialiased">
  <!-- Gelen kutusu önizleme metni (inbox preview snippet) -->
  <div style="display:none;font-size:1px;color:${BG_PAGE};line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;">
    ${e(preview)} &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG_PAGE};padding:28px 12px 40px">
    <tr>
      <td align="center">
        <!-- Ana Kart -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background-color:${BG_CARD};border:1px solid ${LINE};border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,0.04)">
          <!-- Başlık Bandı (Sinematik Koyu Zemin) -->
          <tr>
            <td style="background-color:${BG_HEADER};padding:22px 28px;border-bottom:3px solid ${GOLD}">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle">${brandMarkup}</td>
                  ${badge ? `<td align="right" style="vertical-align:middle">
                    <span style="display:inline-block;padding:5px 12px;border-radius:20px;font:700 11px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;letter-spacing:0.04em;text-transform:uppercase;${bStyle}">${e(badge)}</span>
                  </td>` : ''}
                </tr>
              </table>
            </td>
          </tr>

          <!-- İçerik Gövdesi -->
          <tr>
            <td style="padding:28px 32px 8px">
              <h1 style="margin:0 0 16px;font:700 21px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${INK};letter-spacing:-0.01em">${title}</h1>
              ${body || ''}
            </td>
          </tr>

          <!-- CTA Düğmesi (Varsa) -->
          ${cta ? `<tr>
            <td style="padding:10px 32px 14px" align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 14px">
                <tr>
                  <td style="border-radius:10px;background:linear-gradient(135deg,#d59f65,#c9955c);box-shadow:0 3px 10px rgba(201,149,92,0.28)">
                    <a href="${e(cta)}" style="display:inline-block;padding:14px 34px;font:700 15px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#181104;text-decoration:none;border-radius:10px;letter-spacing:0.01em">${e(ctaLabel || 'Görüntüle')} &rarr;</a>
                  </td>
                </tr>
              </table>
              <p style="margin:6px 0 0;font:400 12px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${SOFT}">Düğme açılmıyorsa aşağıdaki bağlantıyı tarayıcınıza kopyalayabilirsiniz:<br><a href="${e(cta)}" style="color:${GOLD_DARK};word-break:break-all;text-decoration:underline">${e(cta)}</a></p>
            </td>
          </tr>` : ''}

          <!-- Dipnot / Güvenlik Notu (Varsa) -->
          ${small ? `<tr>
            <td style="padding:10px 32px 24px">
              <div style="font:400 13px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${SOFT}">${small}</div>
            </td>
          </tr>` : '<tr><td style="padding-bottom:18px"></td></tr>'}

          <!-- Alt Bilgi (Footer) -->
          <tr>
            <td style="background-color:#f8fafc;border-top:1px solid ${LINE};padding:22px 32px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font:400 12px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#64748b">
                    <strong style="color:#1e293b">${e(brand)}</strong> · Bulut Tabanlı Dijital Ekran ve Menü Panosu<br>
                    <span style="color:#94a3b8">Bu ileti, ${e(brand)} sisteminde kayıtlı bildirim adresinize otomatik olarak gönderilmiştir.</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:12px;font:500 12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#64748b">
                    <a href="${e(config.BASE_URL)}/panel" style="color:${GOLD_DARK};text-decoration:none">İşletme Paneli</a> &nbsp;·&nbsp;
                    <a href="${e(config.BASE_URL)}/panel#settings" style="color:${GOLD_DARK};text-decoration:none">Bildirim Ayarları</a> &nbsp;·&nbsp;
                    <a href="${e(config.BASE_URL)}" style="color:${GOLD_DARK};text-decoration:none">${e(config.BASE_URL.replace(/^https?:\/\//, ''))}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Uyarı e-postaları (ekran çevrimdışı/açık, platform sınırları, bildirim testleri)
function alert({ title, badge, badgeColor = 'brand', preheader, lead, rows, bullets, bulletTitle, callout: calloutText, calloutType = 'tip', cta, ctaLabel, small }) {
  let body = '';
  if (lead) body += p(lead);
  if (rows && rows.length) {
    body += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 18px">${rows.map(([k, v]) => kv(k, v)).join('')}</table>`;
  }
  if (bullets && bullets.length) {
    body += ul(bullets, bulletTitle);
  }
  if (calloutText) {
    body += callout(calloutText, calloutType);
  }
  return html({ title, badge, badgeColor, preheader, body, cta, ctaLabel, small });
}

module.exports = {
  html,
  alert,
  p,
  kv,
  ul,
  callout,
  metricGrid,
  e,
  GOLD,
  INK,
  SOFT,
  LINE,
};
