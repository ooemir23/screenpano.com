// Oturumsuz uçlar: sağlayıcı bildirimleri (webhook), ödeme dönüşü ve ödeme sayfası. index.js'te express.json'dan ÖNCE bağlanır
// (imza ham gövde üzerinden doğrulanır). Bildirimler her zaman işlenir (mod kapalı olsa bile): kesilmiş ödeme kaybolmasın.
const express = require('express');
const config = require('../config');
const core = require('./core');
const iyzico = require('./iyzico');
const paytr = require('./paytr');

const router = express.Router();
router.use(express.raw({ type: () => true, limit: '64kb' }));
const raw = req => (Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '');
const form = req => Object.fromEntries(new URLSearchParams(raw(req)));
const json = req => { try { return JSON.parse(raw(req)); } catch { return null; } };

// Bekleyen iyzico siparişlerinin abonelik referansını tamamla (dönüş atlandıysa/yarıştıysa). Son 24 saat, en çok 20 kayıt.
async function sweepIyzico() {
  if (!iyzico.configured()) return 0;
  const rows = core.sql.prepare("SELECT * FROM payments WHERE provider = 'iyzico' AND provider_ref = '' AND token != '' AND status = 'pending' AND created > ? ORDER BY created DESC LIMIT 20").all(Date.now() - 24 * 3600 * 1000);
  let n = 0;
  for (const p of rows) {
    try { const r = await iyzico.checkoutResult(p.token); if (r.ref) { core.setPay(p.id, { provider_ref: r.ref }); n++; } } catch (e) { /* form henüz tamamlanmamış olabilir */ }
  }
  return n;
}

// iyzico webhook: JSON + X-IYZ-SIGNATURE-V3. Bilinmeyen abonelik → 503 (iyzico yeniden dener; arada sweep ile bağlanır).
router.post('/iyzico/webhook', async (req, res) => {
  const p = json(req);
  if (!p || !iyzico.verifyWebhook(req.get('X-IYZ-SIGNATURE-V3'), p)) return res.status(401).json({ error: 'imza' });
  const type = String(p.iyziEventType || p.eventType || '');
  try {
    let pay = core.payByRef('iyzico', p.subscriptionReferenceCode);
    if (!pay) { await sweepIyzico(); pay = core.payByRef('iyzico', p.subscriptionReferenceCode); }
    if (!pay) return res.status(503).json({ error: 'abonelik henüz eşleşmedi' });
    const eventId = p.orderReferenceCode || `${p.subscriptionReferenceCode}:${p.iyziEventTime || ''}:${type}`;
    if (type === 'subscription.order.success') core.settlePaid({ provider: 'iyzico', eventId, paymentId: pay.id });
    else if (type === 'subscription.order.failure') core.settleFailed({ provider: 'iyzico', eventId, paymentId: pay.id });
    res.json({ ok: true });
  } catch (e) { console.error('[ödeme] iyzico webhook:', e.message); res.status(500).json({ error: 'işlenemedi' }); }
});

// iyzico ödeme formu dönüşü (tarayıcı POST): abonelik referansını bağla, panele dön. Süre YALNIZ webhook ile uzar.
router.post('/iyzico/return', async (req, res) => {
  const token = String(form(req).token || '');
  let ok = false;
  try {
    const pay = core.sql.prepare("SELECT * FROM payments WHERE provider = 'iyzico' AND token = ?").get(token);
    if (pay && token) {
      const r = await iyzico.checkoutResult(token);
      if (r.ref) { core.setPay(pay.id, { provider_ref: r.ref }); ok = r.status === 'ACTIVE' || r.status === 'PENDING'; }
    }
  } catch (e) { console.error('[ödeme] iyzico dönüş:', e.message); }
  res.redirect(303, '/panel?odeme=' + (ok ? 'ok' : 'hata'));
});

// PayTR bildirimi (form POST): imza geçerliyse HER ZAMAN düz "OK" (aksi halde PayTR tekrar dener)
router.post('/paytr/notify', (req, res) => {
  const p = form(req);
  if (!paytr.verifyNotify(p)) return res.status(400).type('text/plain').send('bad hash');
  try {
    if (p.status === 'success') {
      const r = core.settlePaid({ provider: 'paytr', eventId: p.merchant_oid, paymentId: p.merchant_oid, amount: p.total_amount });
      if (!r.ok) console.error('[ödeme] PayTR bildirimi işlenemedi:', p.merchant_oid, r.code);
    } else core.settleFailed({ provider: 'paytr', eventId: p.merchant_oid, paymentId: p.merchant_oid });
  } catch (e) { console.error('[ödeme] PayTR bildirimi:', e.message); return res.status(500).type('text/plain').send('error'); }
  res.type('text/plain').send('OK');
});

// Ödeme sayfası: tek kullanımlık sipariş no ile, 30 dk. Kendi sıkı CSP'si var (genel CSP'ye ödeme alan adları eklenmez).
const PAY_CSP = "default-src 'none'; script-src 'unsafe-inline' https://*.iyzipay.com https://*.iyzico.com https://www.paytr.com; style-src 'unsafe-inline' https:; img-src https: data:; font-src https: data:; connect-src https:; frame-src https://*.iyzipay.com https://*.iyzico.com https://www.paytr.com; form-action https:; base-uri 'none'; frame-ancestors 'none'";
router.get('/pay/:id', (req, res) => {
  res.set({ 'Content-Security-Policy': PAY_CSP, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' });
  const pay = /^[A-Z0-9]{8,40}$/.test(req.params.id) ? core.getPay(req.params.id) : null;
  if (!pay || pay.status !== 'pending' || !pay.pay_data || Date.now() - pay.created > 30 * 60 * 1000) return res.status(404).type('text/plain').send('Ödeme oturumu bulunamadı veya süresi doldu.');
  const head = '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ödeme</title></head><body style="margin:0;font-family:system-ui,sans-serif">';
  const body = pay.provider === 'paytr'
    ? `<script src="https://www.paytr.com/js/iframeResizer.min.js"></script><iframe src="https://www.paytr.com/odeme/guvenli/${encodeURIComponent(pay.pay_data)}" id="paytriframe" frameborder="0" scrolling="no" style="width:100%"></iframe><script>iFrameResize({}, '#paytriframe');</script>`
    : pay.pay_data;
  res.type('html').send(head + body + '</body></html>');
});

module.exports = { router, sweepIyzico, baseUrl: () => config.BASE_URL };
