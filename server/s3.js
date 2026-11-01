// S3 uyumlu depo istemcisi (Cloudflare R2, AWS S3, MinIO). Bağımlılık yok: AWS Signature V4 elle imzalanır.
// R2 ayarları ortam değişkenlerinden gelir; hiçbiri verilmezse depo kapalıdır ve her şey yerel diskte kalır.
const fs = require('fs');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

// Panele yapıştırılırken eklenen boşluk, satır sonu ve tırnakları temizle
const clean = v => String(v || '').trim().replace(/^["'`]+|["'`]+$/g, '').trim();
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(R2|S3)_/.test(k)).map(([k, v]) => [k, clean(v)]));
const account = (env.R2_ACCOUNT_ID || '').replace(/^https?:\/\//, '').replace(/\.r2\.cloudflarestorage\.com.*$/, '');
const cfg = {
  endpoint: (env.S3_ENDPOINT || (account ? `https://${account}.r2.cloudflarestorage.com` : '')).replace(/\/+$/, ''),
  bucket: env.R2_BUCKET || env.S3_BUCKET || '',
  key: env.R2_ACCESS_KEY_ID || env.S3_ACCESS_KEY_ID || '',
  secret: env.R2_SECRET_ACCESS_KEY || env.S3_SECRET_ACCESS_KEY || '',
  region: env.S3_REGION || 'auto',
  publicUrl: (env.R2_PUBLIC_URL || env.S3_PUBLIC_URL || '').replace(/\/+$/, ''),
};
// R2'de Access Key ID 32, Secret 64 karakterdir; ters girildiyse yer değiştir
if (cfg.key.length === 64 && cfg.secret.length === 32) { const k = cfg.key; cfg.key = cfg.secret; cfg.secret = k; console.log('[R2] Access Key ID ile Secret ters girilmiş; düzeltildi.'); }
// Yanlış girilmiş değeri adıyla bildir (değerin kendisi asla yazılmaz)
const SAFE = /^[\x21-\x7e]+$/;
const configError = !(cfg.endpoint && cfg.bucket && cfg.key && cfg.secret) ? ''
  : !/^[a-f0-9]{32}$/i.test(account) && !env.S3_ENDPOINT ? 'R2_ACCOUNT_ID 32 karakterlik hesap kimliği olmalı'
  : !SAFE.test(cfg.key) ? 'R2_ACCESS_KEY_ID geçersiz karakter içeriyor (boşluk, Türkçe harf ya da satır sonu olmamalı)'
  : !SAFE.test(cfg.secret) ? 'R2_SECRET_ACCESS_KEY geçersiz karakter içeriyor (boşluk, Türkçe harf ya da satır sonu olmamalı)'
  : !env.S3_ENDPOINT && cfg.key.length !== 32 ? `R2_ACCESS_KEY_ID 32 karakter olmalı (şu an ${cfg.key.length}); Cloudflare'deki "Access Key ID" değerini girin`
  : !env.S3_ENDPOINT && cfg.secret.length !== 64 ? `R2_SECRET_ACCESS_KEY 64 karakter olmalı (şu an ${cfg.secret.length}); "Secret Access Key" değerini girin, cfat_ ile başlayan token değerini değil`
  : !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(cfg.bucket) ? 'R2_BUCKET geçersiz' : '';
if (configError) console.error('[R2] ' + configError + ' — depo kapalı, dosyalar yerel diskte kalır.');
const enabled = !!(cfg.endpoint && cfg.bucket && cfg.key && cfg.secret) && !configError;

const sha = (d, enc = 'hex') => crypto.createHash('sha256').update(d).digest(enc);
const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
// RFC 3986: S3 anahtarlarında "/" korunur
const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const encKey = k => k.split('/').map(enc).join('/');

// İmzalı istek başlıkları. payloadHash verilmezse UNSIGNED-PAYLOAD (R2 ve S3 kabul eder).
function sign({ method, key = '', query = {}, headers = {}, payloadHash = 'UNSIGNED-PAYLOAD', now = new Date() }) {
  const u = new URL(cfg.endpoint);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''), date = amzDate.slice(0, 8);
  const path = `/${enc(cfg.bucket)}${key ? '/' + encKey(key) : ''}`;
  const qs = Object.keys(query).sort().map(k => `${enc(k)}=${enc(String(query[k]))}`).join('&');
  const h = { ...headers, host: u.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const names = Object.keys(h).map(k => k.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const canonical = [method, path, qs, names.map(n => `${n}:${lower[n]}\n`).join(''), names.join(';'), payloadHash].join('\n');
  const scope = `${date}/${cfg.region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha(canonical)].join('\n');
  const kSign = hmac(hmac(hmac(hmac('AWS4' + cfg.secret, date), cfg.region), 's3'), 'aws4_request');
  const signature = crypto.createHmac('sha256', kSign).update(toSign).digest('hex');
  lower.authorization = `AWS4-HMAC-SHA256 Credential=${cfg.key}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
  return { url: `${u.protocol}//${u.host}${path}${qs ? '?' + qs : ''}`, headers: lower };
}

// Ham istek: gövde Buffer, akış ya da yok. Yanıtı akış olarak döndürmek için stream:true.
function request({ method, key, query, headers, body, stream, payloadHash }) {
  return new Promise((resolve, reject) => {
    if (!enabled) return reject(new Error('Depo (R2) ayarlı değil'));
    const isBuf = Buffer.isBuffer(body) || typeof body === 'string';
    const hdr = { ...(headers || {}) };
    if (isBuf) hdr['content-length'] = Buffer.byteLength(body);
    const s = sign({ method, key, query, headers: hdr, payloadHash: payloadHash || (isBuf ? sha(body) : 'UNSIGNED-PAYLOAD') });
    const lib = s.url.startsWith('https:') ? https : http;
    const rq = lib.request(s.url, { method, headers: s.headers, timeout: 120000 }, res => {
      if (stream && res.statusCode < 300) return resolve(res);
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        if (res.statusCode >= 300 && !(stream && res.statusCode === 304)) {
          const m = /<Message>([^<]*)<\/Message>/.exec(text) || /<Code>([^<]*)<\/Code>/.exec(text);
          const e = new Error(`Depo hatası ${res.statusCode}${m ? ': ' + m[1] : ''}`); e.status = res.statusCode; return reject(e);
        }
        resolve({ status: res.statusCode, headers: res.headers, text });
      });
    });
    rq.on('timeout', () => rq.destroy(new Error('Depo zaman aşımı')));
    rq.on('error', reject);
    if (body && !isBuf && body.pipe) body.pipe(rq); else rq.end(body);
  });
}

const putFile = (key, file, type = 'application/octet-stream', cache = 'public, max-age=31536000, immutable') =>
  request({ method: 'PUT', key, body: fs.createReadStream(file), headers: { 'content-type': type, 'content-length': fs.statSync(file).size, 'cache-control': cache } });
const putBuffer = (key, buf, type = 'application/octet-stream') => request({ method: 'PUT', key, body: buf, headers: { 'content-type': type } });
const del = key => request({ method: 'DELETE', key }).catch(e => { if (e.status !== 404) throw e; });
const head = key => request({ method: 'HEAD', key }).then(r => ({ size: Number(r.headers['content-length']) || 0 })).catch(e => { if (e.status === 404) return null; throw e; });
// Okuma akışı (Range desteğiyle: video ileri sarma için)
const getStream = (key, range) => request({ method: 'GET', key, headers: range ? { range } : {}, stream: true });
async function list(prefix) {
  const out = []; let token = '';
  do {
    const r = await request({ method: 'GET', query: { 'list-type': 2, prefix, ...(token ? { 'continuation-token': token } : {}) } });
    for (const m of r.text.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const g = t => (new RegExp(`<${t}>([^<]*)</${t}>`).exec(m[1]) || [])[1] || '';
      out.push({ key: g('Key').replace(/&amp;/g, '&'), size: Number(g('Size')) || 0, modified: Date.parse(g('LastModified')) || 0 });
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(r.text) ? ((/<NextContinuationToken>([^<]*)</.exec(r.text) || [])[1] || '') : '';
  } while (token);
  return out;
}
const publicUrl = key => (cfg.publicUrl ? `${cfg.publicUrl}/${encKey(key)}` : '');

module.exports = { enabled, configError, cfg: { endpoint: cfg.endpoint, bucket: cfg.bucket, publicUrl: cfg.publicUrl }, sign, request, putFile, putBuffer, del, head, getStream, list, publicUrl, _secret: () => cfg.secret };
