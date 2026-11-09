// Ortak e-posta şablon motoru: ScreenPano'dan giden tüm postalar (doğrulama, şifre sıfırlama,
// ekran çevrimdışı/açık uyarıları, haftalık özet, platform uyarıları ve testler)
// uygulamanın kurumsal kimliği (Sahne - sinematik koyu / sıcak bakır) ile birebir uyumlu,
// modern, koyu temalı (dark mode) ve tüm e-posta istemcilerinde (Gmail, Apple Mail, Outlook)
// kusursuz çalışan şablonlara bürünür.
const config = require('./config');

const e = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Renk paleti (ScreenPano Sahne Koyu Teması)
const BG_PAGE = '#0a0c0d';      // Dış zemin (derin obsidyen)
const BG_CARD = '#141718';      // Ana kart zemini (mat grafit)
const BG_PANEL = '#1b1f21';     // İç paneller ve tablolar (koyu antrasit)
const BG_HEADER = '#101213';    // Başlık bandı
const BG_FOOTER = '#0e1011';    // Alt bilgi bandı

const GOLD = '#c9955c';         // Sıcak ScreenPano bakırı
const GOLD_LIGHT = '#e8b37c';   // Parlak bakır vurgu
const GOLD_GRAD = 'linear-gradient(135deg, #F6C878 0%, #DE9640 45%, #B86C20 100%)';

const TEXT_HEAD = '#ffffff';    // Başlık rengi (parlak beyaz)
const TEXT_BODY = '#cbd5e1';    // Gövde metni (okunaklı açık gri)
const TEXT_SOFT = '#8a939e';    // Yardımcı etiket metni
const TEXT_MUTE = '#64748b';    // Dipnot ve alt bilgi
const LINE = '#252a2d';         // Çerçeve ve sınır çizgisi
const LINE_PANEL = '#2c3236';   // İç panel sınır çizgisi

// Rozet (badge) stilleri — Koyu cam görünümlü modern haplar
const BADGE_STYLES = {
  danger:  'background:rgba(239,91,79,0.14);color:#ff7a6d;border:1px solid rgba(239,91,79,0.38);',
  success: 'background:rgba(62,207,116,0.14);color:#4ade80;border:1px solid rgba(62,207,116,0.38);',
  warning: 'background:rgba(232,177,60,0.14);color:#fbbf24;border:1px solid rgba(232,177,60,0.38);',
  info:    'background:rgba(56,189,248,0.14);color:#38bdf8;border:1px solid rgba(56,189,248,0.38);',
  brand:   'background:rgba(201,149,92,0.16);color:#e8b37c;border:1px solid rgba(201,149,92,0.42);',
};

// Paragraf
const p = (text, cls) => `<p style="margin:0 0 14px;font:400 15px/1.7 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${cls === 'soft' ? TEXT_SOFT : TEXT_BODY}">${text}</p>`;

// Bilgi tablosu satırı (anahtar / değer)
const kv = (label, value) => `<tr>
  <td style="padding:12px 18px;border-bottom:1px solid ${LINE_PANEL};font:600 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${TEXT_SOFT};white-space:nowrap;vertical-align:middle">${label}</td>
  <td style="padding:12px 18px 12px 8px;border-bottom:1px solid ${LINE_PANEL};font:700 14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${TEXT_HEAD};text-align:right;vertical-align:middle">${value}</td>
</tr>`;

// Koyu panel bilgi tablosu
function panelTable(rows) {
  if (!rows || !rows.length) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG_PANEL};border:1px solid ${LINE_PANEL};border-radius:12px;margin:18px 0 20px;overflow:hidden">
    ${rows.map(([k, v], idx) => {
      const isLast = idx === rows.length - 1;
      return `<tr>
        <td style="padding:12px 18px;border-bottom:${isLast ? 'none' : '1px solid ' + LINE_PANEL};font:600 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${TEXT_SOFT};white-space:nowrap;vertical-align:middle">${k}</td>
        <td style="padding:12px 18px 12px 8px;border-bottom:${isLast ? 'none' : '1px solid ' + LINE_PANEL};font:700 14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${TEXT_HEAD};text-align:right;vertical-align:middle">${v}</td>
      </tr>`;
    }).join('')}
  </table>`;
}

// Vurgulu kutu (ipucu, uyarı veya bilgilendirme kutusu)
function callout(text, type = 'tip') {
  const cfg = {
    tip:     { bg: '#181c1e', border: GOLD, text: '#f1f5f9', icon: '💡' },
    warning: { bg: '#1c1914', border: '#e8b13c', text: '#fef3c7', icon: '⚠️' },
    danger:  { bg: '#1e1414', border: '#ef5b4f', text: '#fee2e2', icon: '🛑' },
    success: { bg: '#121d15', border: '#3ecf74', text: '#dcfce7', icon: '✓' },
    info:    { bg: '#131b22', border: '#38bdf8', text: '#e0f2fe', icon: 'ℹ️' },
  }[type] || { bg: '#181c1e', border: GOLD, text: '#f1f5f9', icon: '💡' };

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;background-color:${cfg.bg};border:1px solid ${LINE_PANEL};border-left:4px solid ${cfg.border};border-radius:10px;overflow:hidden">
    <tr><td style="padding:14px 18px;font:400 14px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${cfg.text}">
      ${text}
    </td></tr>
  </table>`;
}

// Kontrol listesi / madde işaretleri
function ul(items, title) {
  if (!items || !items.length) return '';
  const head = title ? `<div style="margin:0 0 10px;font:700 14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${TEXT_HEAD}">${e(title)}</div>` : '';
  const rows = items.map(item => `<tr>
    <td style="padding:4px 12px 8px 0;vertical-align:top;font:700 15px/1 -apple-system,BlinkMacSystemFont,sans-serif;color:${GOLD_LIGHT}">•</td>
    <td style="padding:0 0 8px 0;vertical-align:top;font:400 14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${TEXT_BODY}">${item}</td>
  </tr>`).join('');
  return `<div style="margin:16px 0 14px">${head}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></div>`;
}

// 2x2 veya 1x4 Metrik Izgarası (Haftalık özet ve performans için)
function metricGrid(cards) {
  if (!cards || !cards.length) return '';
  const cells = cards.map(c => `
    <td width="50%" style="padding:6px;vertical-align:top">
      <div style="background-color:${BG_PANEL};border:1px solid ${LINE_PANEL};border-radius:12px;padding:15px 16px 14px;text-align:left">
        <div style="font:600 11px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${TEXT_SOFT};text-transform:uppercase;letter-spacing:0.04em">${c.label}</div>
        <div style="font:700 22px/1.25 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${c.color || TEXT_HEAD};margin:7px 0 3px">${c.value} <span style="font-size:13px;font-weight:500;color:${TEXT_SOFT}">${c.unit || ''}</span></div>
        ${c.sub ? `<div style="font:500 12px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${c.subColor || TEXT_SOFT}">${c.sub}</div>` : ''}
      </div>
    </td>`);

  const rows = [];
  for (let i = 0; i < cells.length; i += 2) {
    rows.push(`<tr>${cells[i]}${cells[i + 1] || '<td width="50%"></td>'}</tr>`);
  }

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px -6px 20px">${rows.join('')}</table>`;
}

// Ana e-posta çerçevesi: Koyu sinematik zemin + modern cam kart + parlayan bakır vurgu + altın buton
function html({ title, badge, badgeColor = 'brand', preheader, body, cta, ctaLabel, small }) {
  const brand = config.BRAND || 'ScreenPano';
  const preview = preheader || title;
  const bStyle = BADGE_STYLES[badgeColor] || BADGE_STYLES.brand;
  const logoUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(config.BASE_URL)
    ? 'https://screenpano.com/logo.png'
    : `${config.BASE_URL}/logo.png`;
  const iconUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(config.BASE_URL)
    ? 'https://screenpano.com/logo-icon.png'
    : `${config.BASE_URL}/logo-icon.png`;

  // Başlık bandındaki ScreenPano logosu ve rozet
  const brandMarkup = brand === 'ScreenPano'
    ? `<a href="${e(config.BASE_URL)}" style="display:inline-block;text-decoration:none" target="_blank">
        <img src="${e(logoUrl)}" alt="ScreenPano" width="165" height="37" style="display:block;width:165px;height:37px;max-width:165px;border:0;outline:none;text-decoration:none;color:#ffffff;font:700 20px/37px -apple-system,BlinkMacSystemFont,sans-serif;-ms-interpolation-mode:bicubic">
      </a>`
    : `<span style="color:#ffffff;font:700 20px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">${e(brand)}</span>`;

  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${e(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BG_PAGE};color:${TEXT_BODY};-webkit-font-smoothing:antialiased">
  <!-- Gelen kutusu önizleme metni (inbox preview snippet) -->
  <div style="display:none;font-size:1px;color:${BG_PAGE};line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;">
    ${e(preview)} &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG_PAGE};padding:32px 12px 48px">
    <tr>
      <td align="center">
        <!-- Ana Koyu Kart -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background-color:${BG_CARD};border:1px solid ${LINE};border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.6)">
          <!-- Üst Parlayan Bakır Vurgu Çizgisi -->
          <tr>
            <td style="height:3px;background:${GOLD_GRAD};line-height:3px;font-size:3px">&nbsp;</td>
          </tr>

          <!-- Başlık Bandı (ScreenPano Markası + Kategori Rozeti) -->
          <tr>
            <td style="background-color:${BG_HEADER};padding:22px 30px;border-bottom:1px solid ${LINE}">
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
            <td style="padding:30px 32px 10px">
              <h1 style="margin:0 0 18px;font:700 23px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${TEXT_HEAD};letter-spacing:-0.02em">${title}</h1>
              ${body || ''}
            </td>
          </tr>

          <!-- CTA Düğmesi (Varsa) -->
          ${cta ? `<tr>
            <td style="padding:10px 32px 16px" align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0 14px">
                <tr>
                  <td style="border-radius:10px;background:${GOLD_GRAD};box-shadow:0 4px 18px rgba(222,150,64,0.32)">
                    <a href="${e(cta)}" style="display:inline-block;padding:15px 38px;font:700 15px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#101214;text-decoration:none;border-radius:10px;letter-spacing:0.02em">${e(ctaLabel || 'Görüntüle')} &rarr;</a>
                  </td>
                </tr>
              </table>
              <div style="background-color:#101213;border:1px solid ${LINE};border-radius:8px;padding:10px 14px;margin:10px auto 0;max-width:500px;text-align:left">
                <div style="font:500 11.5px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;color:${TEXT_SOFT};margin-bottom:4px">Düğme çalışmıyorsa aşağıdaki bağlantıyı tarayıcınıza kopyalayın:</div>
                <a href="${e(cta)}" style="font:400 12px/1.4 'SFMono-Regular',Consolas,monospace;color:${GOLD_LIGHT};word-break:break-all;text-decoration:underline">${e(cta)}</a>
              </div>
            </td>
          </tr>` : ''}

          <!-- Dipnot / Güvenlik Notu (Varsa) -->
          ${small ? `<tr>
            <td style="padding:12px 32px 26px">
              <div style="font:400 13px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${TEXT_SOFT}">${small}</div>
            </td>
          </tr>` : '<tr><td style="padding-bottom:20px"></td></tr>'}

          <!-- Alt Bilgi (Footer) -->
          <tr>
            <td style="background-color:${BG_FOOTER};border-top:1px solid ${LINE};padding:22px 32px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font:400 12px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${TEXT_MUTE}">
                    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:6px"><tr>
                      <td style="vertical-align:middle;padding-right:8px">
                        <img src="${e(iconUrl)}" alt="ScreenPano" width="18" height="18" style="display:block;width:18px;height:18px;border:0;border-radius:4px">
                      </td>
                      <td style="vertical-align:middle;font:600 12.5px/1 -apple-system,BlinkMacSystemFont,sans-serif;color:${TEXT_SOFT}">
                        ${e(brand)} · Bulut Tabanlı Dijital Ekran ve Menü Panosu
                      </td>
                    </tr></table>
                    <span style="color:#525b68">Bu ileti, ${e(brand)} sisteminde kayıtlı bildirim adresinize otomatik olarak gönderilmiştir.</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:12px;font:500 12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${TEXT_MUTE}">
                    <a href="${e(config.BASE_URL)}/panel" style="color:${GOLD_LIGHT};text-decoration:none">İşletme Paneli</a> &nbsp;·&nbsp;
                    <a href="${e(config.BASE_URL)}/panel#settings/notify" style="color:${GOLD_LIGHT};text-decoration:none">Bildirim Ayarları</a> &nbsp;·&nbsp;
                    <a href="${e(config.BASE_URL)}" style="color:${GOLD_LIGHT};text-decoration:none">${e(config.BASE_URL.replace(/^https?:\/\//, ''))}</a>
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
    // Bilgi tablosunu modern antrasit bir panel kartı içine al
    body += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG_PANEL};border:1px solid ${LINE_PANEL};border-radius:12px;margin:16px 0 20px;overflow:hidden">
      ${rows.map(([k, v], idx) => {
        const isLast = idx === rows.length - 1;
        return `<tr>
          <td style="padding:12px 18px;border-bottom:${isLast ? 'none' : '1px solid ' + LINE_PANEL};font:600 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${TEXT_SOFT};white-space:nowrap;vertical-align:middle">${k}</td>
          <td style="padding:12px 18px 12px 8px;border-bottom:${isLast ? 'none' : '1px solid ' + LINE_PANEL};font:700 14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${TEXT_HEAD};text-align:right;vertical-align:middle">${v}</td>
        </tr>`;
      }).join('')}
    </table>`;
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
  panelTable,
  ul,
  callout,
  metricGrid,
  e,
  GOLD,
  GOLD_LIGHT,
  TEXT_HEAD,
  TEXT_BODY,
  TEXT_SOFT,
  LINE,
  LINE_PANEL,
  BG_PANEL,
};
