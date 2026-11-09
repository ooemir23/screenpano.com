// SMTP gönderimi.
//   SMTP_PORT=465            SSL (önerilen)
//   SMTP_PORT=587            SMTP_STARTTLS ile: true = şifreleme zorunlu, false = şifresiz (Natro gibi
//                            587'de STARTTLS desteklemeyen sağlayıcılar), boş = sunucu destekliyorsa kullan
// Bazı sunucu sağlayıcıları (ör. Hetzner) 465'i engeller: bağlantı kurulamazsa diğer port denenir.
// STARTTLS el sıkışması bozuksa (ve zorunlu tutulmadıysa) aynı port şifresiz denenir. İşe yarayan ayar hatırlanır.
const nodemailer = require('nodemailer');
const config = require('./config');
const e = process.env;
const enabled = () => !!e.SMTP_HOST;
const auth = () => (e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined);
const startTls = () => { const v = String(e.SMTP_STARTTLS || '').toLowerCase(); return ['true', '1', 'on', 'evet'].includes(v) ? 'require' : ['false', '0', 'off', 'hayir', 'hayır', 'yok'].includes(v) ? 'off' : 'auto'; };
const primary = () => { const port = Number(e.SMTP_PORT) || 587, secure = e.SMTP_SECURE === 'true' || port === 465; return { port, secure, tls: secure ? 'ssl' : startTls() }; };
let working = null; // { port, secure, tls }

const transport = o => nodemailer.createTransport({
  host: e.SMTP_HOST, port: o.port, secure: o.secure,
  requireTLS: o.tls === 'require', ignoreTLS: o.tls === 'off',
  auth: auth(), connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 20000,
});
const isConnErr = err => /timeout|ETIMEDOUT|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|ESOCKET|ECONNECTION|EDNS/i.test(`${err && err.code} ${err && err.message}`);
const isTlsErr = err => /STARTTLS|ETLS|TLS|SSL|certificate|wrong version|handshake/i.test(`${err && err.code} ${err && err.message}`);
const label = o => `${o.port} (${{ ssl: 'SSL', require: 'STARTTLS', auto: 'STARTTLS varsa', off: 'şifresiz' }[o.tls]})`;

function plan() {
  const p = primary(), list = [p];
  // STARTTLS bozuksa aynı port şifresiz (kullanıcı şifrelemeyi zorunlu tutmadıysa)
  if (!p.secure && p.tls === 'auto') list.push({ ...p, tls: 'off' });
  // port engelliyse diğeri
  if (p.port !== 465) list.push({ port: 465, secure: true, tls: 'ssl' });
  if (p.port !== 587) list.push({ port: 587, secure: false, tls: startTls() }, ...(startTls() === 'auto' ? [{ port: 587, secure: false, tls: 'off' }] : []));
  return list;
}

async function send(msg) {
  if (!enabled()) throw new Error('SMTP ayarlı değil');
  const brand = config.BRAND || 'ScreenPano';
  const rawFrom = (msg && msg.from) || e.SMTP_FROM || e.SMTP_USER || '';
  const from = rawFrom && !rawFrom.includes('<') ? `"${brand}" <${rawFrom}>` : rawFrom;
  const mail = { from, ...msg };
  const tries = working ? [working] : plan();
  let last;
  for (let i = 0; i < tries.length; i++) {
    const o = tries[i];
    try {
      await transport(o).sendMail(mail);
      if (!working || label(working) !== label(o)) { working = o; if (i > 0) console.log(`[SMTP] ${label(tries[0])} çalışmadı, ${label(o)} kullanılıyor`); }
      return { ...o, mode: label(o) };
    } catch (err) {
      last = err;
      const next = tries[i + 1];
      // yalnız bağlantı ya da şifreleme sorunlarında sonraki ayara geç; şifre yanlışsa boşuna deneme
      const retry = next && (isConnErr(err) || isTlsErr(err));
      console.log(`[SMTP] ${label(o)} başarısız: ${err && err.message ? err.message.split('\n')[0] : err}`);
      if (!retry) break;
    }
  }
  working = null;
  throw last;
}
module.exports = { send, enabled, mode: () => (working ? label(working) : label(primary())) };
