// API duman testi: sunucu gerçek süreç olarak geçici veri diziniyle açılır, temel akışlar HTTP üzerinden doğrulanır
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const { mkdtempSync, rmSync } = require('fs');
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
