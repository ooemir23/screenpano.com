// i18n tutarlılığı: TSV sözlükleri derlenebilmeli, sözlükler ve arayüz metinleri tutarlı olmalı
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');

test('TSV sözlükleri sorunsuz derlenir', () => {
  const r = spawnSync('python3', [path.join(ROOT, 'tools', 'i18n', 'build.py')], { encoding: 'utf8' });
  assert.equal(r.status, 0, (r.stdout || '') + (r.stderr || ''));
});

test('sözlük dosyaları ayrıştırılır; mekân yazımı kalmamıştır', () => {
  for (const l of ['en', 'de', 'ar']) {
    const raw = fs.readFileSync(path.join(ROOT, 'public', 'i18n', `${l}.js`), 'utf8');
    const dict = JSON.parse(raw.replace(/^window\.I18N_DICT=/, '').replace(/;\s*$/, ''));
    assert.ok(Object.keys(dict).length > 2000, `${l}: sözlük küçük geldi`);
    for (const k of Object.keys(dict)) assert.ok(!/mekân/i.test(k), `${l}: ${k}`);
  }
});

test('site i18n dosyaları ayrıştırılır ve _dil anahtarı tüm dillerde vardır', () => {
  for (const l of ['tr', 'en', 'de', 'ar']) {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'site', 'i18n', `${l}.json`), 'utf8'));
    assert.ok(typeof j._dil === 'string' && j._dil.length > 10, `${l}: _dil yok`);
  }
});

test('panel ve sunucu metinlerinde mekân yazımı kalmamıştır', () => {
  for (const f of ['public/panel.js', 'server/platformads.js', 'server/legal.js']) {
    assert.ok(!/mekân/i.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), f);
  }
});
