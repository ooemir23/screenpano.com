// API duman testi: sunucu gerçek süreç olarak geçici veri diziniyle açılır, temel akışlar HTTP üzerinden doğrulanır
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const { mkdtempSync, rmSync, readdirSync } = require('fs');
const { tmpdir } = require('os');
const path = require('path');
const crypto = require('crypto');

const PORT = 20000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = mkdtempSync(path.join(tmpdir(), 'sp-smoke-'));
const SUPER_PASS = 'super-test-parola-123';
let child = null;
let branchId = null; // kiracı izolasyon testi için

// basit çerez kavanozu: son oturumu tutar
const jar = {};
async function req(method, p, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (jar.cookie) headers.cookie = jar.cookie;
  const r = await fetch(BASE + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const sc = r.headers.get('set-cookie');
  if (sc) jar.cookie = sc.split(';')[0];
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}

before(async () => {
  child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), SUPER_PASS, SESSION_SECRET: crypto.randomBytes(32).toString('hex'), APP_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', d => process.stderr.write(d));
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { const r = await fetch(BASE + '/health'); if (r.ok) return; } catch {}
  }
  throw new Error('sunucu zamanında açılmadı');
});

after(async () => {
  if (child) child.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 400));
  try { rmSync(DATA, { recursive: true, force: true }); } catch {}
});

test('sağlık ucu ve ana sayfa çalışır', async () => {
  assert.equal((await fetch(BASE + '/health')).status, 200);
  assert.equal((await fetch(BASE + '/')).status, 200);
});

test('süper giriş → işletme → şube limitleri (3 dahil, sonrası ücret onayı)', async () => {
  let r = await req('POST', '/api/auth/login', { username: 'admin', password: SUPER_PASS });
  assert.equal(r.status, 200); assert.equal(r.j.role, 'super');

  const un = 'duman' + Date.now();
  r = await req('POST', '/api/super/tenants', { name: 'Duman Kafe', username: un, password: 'parola-12345', plan: 'pro', days: 30 });
  assert.equal(r.status, 200);
  const tid = r.j.id;

  r = await req('POST', `/api/super/tenants/${tid}/impersonate`, {});
  assert.equal(r.status, 200);

  r = await req('GET', '/api/admin/branches');
  assert.equal(r.j.included, 3);

  for (const n of ['Şube A', 'Şube B']) {
    r = await req('POST', '/api/admin/branches', { name: n });
    assert.equal(r.status, 200); assert.equal(r.j.fee, 0);
    branchId = r.j.id;
  }
  // pakete dahil 3 lokasyon doldu: üçüncü şube ücret onayı ister
  r = await req('POST', '/api/admin/branches', { name: 'Şube C' });
  assert.equal(r.status, 400); assert.equal(r.j.needConfirm, true); assert.ok(r.j.fee > 0);
  r = await req('POST', '/api/admin/branches', { name: 'Şube C', confirmFee: true });
  assert.equal(r.status, 200); assert.ok(r.j.fee > 0);
});

test('kiracı izolasyonu: başka işletmenin şubesine dokunulamaz', async () => {
  const un = 'izo' + Date.now();
  let r = await req('POST', '/api/super/tenants', { name: 'İzo Kafe', username: un, password: 'parola-12345', plan: 'pro', days: 30 });
  assert.equal(r.status, 200);
  // İzo sahibiyle giriş yap (çerez üzerine yazar)
  r = await req('POST', '/api/auth/login', { username: un, password: 'parola-12345' });
  assert.equal(r.status, 200);
  r = await req('PUT', `/api/admin/branches/${branchId}`, { name: 'çalınan şube' });
  assert.equal(r.status, 404);
  r = await req('DELETE', `/api/admin/branches/${branchId}`, { confirm: 'Şube A' });
  assert.equal(r.status, 404);
});

test('TV eşleştirme kodu hız sınırı: 16. istek reddedilir', async () => {
  let last = null;
  for (let i = 0; i < 18; i++) {
    last = await fetch(BASE + '/api/tv/pair/start', { method: 'POST' });
    if (last.status === 429) break;
  }
  assert.equal(last.status, 429);
});

test('platform anahtarları maskelenir; maskeli kayıt eskiyi korur, null siler', async () => {
  await req('POST', '/api/auth/login', { username: 'admin', password: SUPER_PASS });
  const db = new (require('better-sqlite3'))(path.join(DATA, 'platform.db'), { readonly: true });
  try {
    let r = await req('PUT', '/api/super/settings', { collect_key: 'gizli-anahtar-9876' });
    assert.equal(r.status, 200);
    r = await req('GET', '/api/super/overview');
    assert.ok(r.j.settings.collect_key.startsWith('••••'), 'maskeli değil: ' + r.j.settings.collect_key);
    assert.ok(r.j.settings.collect_key.endsWith('9876'));
    // maskeli ipucu geri gönderilince gerçek değer korunmalı
    r = await req('PUT', '/api/super/settings', { collect_key: r.j.settings.collect_key });
    assert.equal(db.prepare("SELECT value FROM settings WHERE key='collect_key'").get().value, 'gizli-anahtar-9876');
    // null → siler
    r = await req('PUT', '/api/super/settings', { collect_key: null });
    assert.equal(db.prepare("SELECT value FROM settings WHERE key='collect_key'").get().value, '');
  } finally { db.close(); }
});

test('superAccess yetkisi gizli anahtar ve işletme yönetimine yetmez', async () => {
  await req('POST', '/api/auth/login', { username: 'admin', password: SUPER_PASS });
  const un = 'supacc' + Date.now();
  let r = await req('POST', '/api/super/tenants', { name: 'SupAcc Kafe', username: un, password: 'parola-12345', plan: 'pro', days: 30 });
  const tid = r.j.id;
  r = await req('PUT', `/api/super/tenants/${tid}`, { superAccess: true });
  assert.equal(r.status, 200);
  // sahibiyle giriş: genel bakış açılır ama gizli işlemler 403
  await req('POST', '/api/auth/login', { username: un, password: 'parola-12345' });
  r = await req('GET', '/api/super/overview'); assert.equal(r.status, 200);
  r = await req('PUT', '/api/super/settings', { tmdb_key: 'deneme' }); assert.equal(r.status, 403);
  r = await req('DELETE', `/api/super/tenants/${tid}`, { confirm: 'SupAcc Kafe' }); assert.equal(r.status, 403);
  r = await req('POST', `/api/super/tenants/${tid}/password`, {}); assert.equal(r.status, 403);
});

test('süper parola sıfırlama: düz parola dönmez, bağlantı tek kullanımlık, eski oturum düşer', async () => {
  await req('POST', '/api/auth/login', { username: 'admin', password: SUPER_PASS });
  const un = 'epok' + Date.now();
  let r = await req('POST', '/api/super/tenants', { name: 'Epok Kafe', username: un, password: 'parola-12345', plan: 'pro', days: 30 });
  const tid = r.j.id;
  // sahibi giriş yapsın; çerezi sakla
  await req('POST', '/api/auth/login', { username: un, password: 'parola-12345' });
  const ownerCookie = jar.cookie;
  r = await req('GET', '/api/admin/me'); assert.equal(r.status, 200);
  // süper sıfırlama bağlantısı üret
  await req('POST', '/api/auth/login', { username: 'admin', password: SUPER_PASS });
  r = await req('POST', `/api/super/tenants/${tid}/password`, {});
  assert.equal(r.status, 200);
  assert.ok(!('password' in r.j), 'yanıtta düz parola döndü');
  assert.ok(typeof r.j.resetUrl === 'string' && r.j.resetUrl.includes('#reset='));
  const resetUrl = r.j.resetUrl;
  // sahibin eski çerezi geçersiz (token_epoch arttı)
  jar.cookie = ownerCookie;
  r = await req('GET', '/api/admin/me'); assert.equal(r.status, 401);
  // bağlantıyla yeni parola belirlenir ve giriş yapılır
  const token = decodeURIComponent(resetUrl.split('#reset=')[1]);
  r = await req('POST', '/api/auth/reset', { token, password: 'yeni-parola-99' });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  r = await req('GET', '/api/admin/me'); assert.equal(r.status, 200);
  // aynı bağlantı ikinci kez kullanılamaz
  const again = await req('POST', '/api/auth/reset', { token, password: 'baska-parola-1' });
  assert.equal(again.status, 400);
});

test('kota: Content-Length başlığı olmadan (chunked) yükleme reddedilir ve dosya silinir', async () => {
  await req('POST', '/api/auth/login', { username: 'admin', password: SUPER_PASS });
  const un = 'kota' + Date.now();
  let r = await req('POST', '/api/super/tenants', { name: 'Kota Kafe', username: un, password: 'parola-12345', plan: 'pro', days: 30 });
  const tid = r.j.id;
  await req('POST', `/api/super/tenants/${tid}/impersonate`, {});
  // sahte R2 nesne kayıtlarıyla 21 GB "kullanım" oluştur (diskte dosya yok)
  const Database = require('better-sqlite3');
  const db = new Database(path.join(DATA, 'platform.db'));
  try {
    const ins = db.prepare('INSERT INTO objects (tenant_id, file, size, uploaded) VALUES (?, ?, ?, ?)');
    for (let i = 0; i < 21; i++) ins.run(tid, 'fake' + i + '.bin', 1024 * 1024 * 1024, Date.now());
    // Content-Length göndermeyen (chunked) multipart yükleme: ön kontrol aşılır, yazım sonrası kontrol yakalar
    const boundary = '----spTest';
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const parts = [
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="t.png"\r\nContent-Type: image/png\r\n\r\n`),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ];
    const { Readable } = require('stream');
    const up = await fetch(BASE + '/api/admin/logo', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=' + boundary, cookie: jar.cookie },
      body: Readable.toWeb(Readable.from(parts)),
      duplex: 'half',
    });
    assert.equal(up.status, 413, 'chunked yükleme kota aşımında reddedilmeli');
    // reddedilen dosya diskten silinmiş olmalı
    const updir = path.join(DATA, 'tenants', tid, 'uploads');
    assert.equal(readdirSync(updir).filter(f => !f.endsWith('.part')).length, 0, 'aşan dosya silinmeli');
    // sahte kullanım temizlenince normal yükleme geçer (yanlış 413 yok)
    db.prepare('DELETE FROM objects WHERE tenant_id = ?').run(tid);
    const fd = new FormData();
    fd.append('file', new Blob([png], { type: 'image/png' }), 't.png');
    const up2 = await fetch(BASE + '/api/admin/logo', { method: 'POST', headers: { cookie: jar.cookie }, body: fd });
    assert.equal(up2.status, 200, 'kota dahilinde normal yükleme geçmeli');
  } finally { db.close(); }
});
