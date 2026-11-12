// Birim: oturum belirteci imzası ve parola karma işlemleri (FAZ 2'de epoch testleri eklenir)
const { mkdtempSync, rmSync } = require('fs');
const { tmpdir } = require('os');
const path = require('path');
const crypto = require('crypto');

// modüllerrequire edilmeden önce geçici veri dizini şart
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'sp-auth-'));
process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');

const { test, after } = require('node:test');
const assert = require('node:assert');
const auth = require('../server/auth');

after(() => { try { rmSync(process.env.DATA_DIR, { recursive: true, force: true }); } catch {} });

test('belirteç imzalanıp doğrulanır', () => {
  const t = auth.sign({ uid: 'x1', exp: Date.now() + 60000 });
  const p = auth.verify(t);
  assert.ok(p && p.uid === 'x1');
});

test('üzerinde oynanan belirteç reddedilir', () => {
  const t = auth.sign({ uid: 'x1', exp: Date.now() + 60000 });
  const sahte = Buffer.from(JSON.stringify({ uid: 'admin', exp: Date.now() + 60000 })).toString('base64url') + '.' + t.split('.')[1];
  assert.equal(auth.verify(sahte), null);
});

test('süresi dolmuş belirteç reddedilir', () => {
  assert.equal(auth.verify(auth.sign({ uid: 'x1', exp: Date.now() - 1000 })), null);
});

test('parola karma eşleşir, yanlış parola reddedilir', () => {
  const h = auth.hashPassword('guclu-parola-1');
  assert.ok(auth.checkPassword('guclu-parola-1', h));
  assert.equal(auth.checkPassword('yanlis-parola', h), false);
});
