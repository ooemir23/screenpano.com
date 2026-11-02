// SMTP gönderimi. Bazı sunucu sağlayıcıları (ör. Hetzner) 465 portunu engeller; 465'te bağlantı
// zaman aşımına uğrarsa aynı sunucuya 587 (STARTTLS) ile yeniden denenir ve işe yarayan ayar hatırlanır.
const nodemailer = require('nodemailer');
const e = process.env;
const enabled = () => !!e.SMTP_HOST;
const auth = () => (e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined);
const primary = () => { const port = Number(e.SMTP_PORT) || 587; return { port, secure: e.SMTP_SECURE === 'true' || port === 465 }; };
let working = null; // { port, secure }
const transport = o => nodemailer.createTransport({ host: e.SMTP_HOST, port: o.port, secure: o.secure, requireTLS: !o.secure, auth: auth(), connectionTimeout: 12000, greetingTimeout: 12000 });
const isConnErr = err => /timeout|ETIMEDOUT|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|ESOCKET|ECONNECTION|EDNS/i.test(`${err && err.code} ${err && err.message}`);

async function send(msg) {
  if (!enabled()) throw new Error('SMTP ayarlı değil');
  const mail = { from: e.SMTP_FROM || e.SMTP_USER, ...msg };
  const tries = working ? [working] : [primary(), ...(primary().port !== 587 ? [{ port: 587, secure: false }] : []), ...(primary().port !== 465 ? [{ port: 465, secure: true }] : [])];
  let last;
  for (const o of tries) {
    try { await transport(o).sendMail(mail); if (!working || working.port !== o.port) { working = o; if (o.port !== primary().port) console.log(`[SMTP] ${primary().port} çalışmadı, ${o.port} kullanılıyor`); } return o; }
    catch (err) { last = err; if (!isConnErr(err)) break; }
  }
  working = null;
  throw last;
}
module.exports = { send, enabled };
