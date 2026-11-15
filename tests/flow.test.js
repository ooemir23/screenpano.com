// Akış özeti benzetimi: TV kurallarına (kampanya/fragman/büyük maç araya girişi) uyduğunu doğrular
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

let STATE = {};
const statePath = require.resolve('../server/state');
require.cache[statePath] = { id: statePath, filename: statePath, loaded: true, exports: { publicState: () => STATE } };
const { summary, kindOf } = require('../server/flow');

const vid = (id, dur, extra) => ({ id, name: id, type: 'video', dur, ...extra });

test('tür ayrımı: reklam, kitap, instagram, youtube, afiş, fotoğraf', () => {
  assert.equal(kindOf({ id: 'pad:1', type: 'video' }), 'ad');
  assert.equal(kindOf({ id: 'bk1', type: 'poster', tpl: 'kitap' }), 'book');
  assert.equal(kindOf({ id: 'x', type: 'poster', tpl: 'insta' }), 'insta');
  assert.equal(kindOf({ id: 'y', type: 'youtube' }), 'youtube');
  assert.equal(kindOf({ id: 'p', type: 'poster', tpl: 'x' }), 'poster');
  assert.equal(kindOf({ id: 'i', type: 'image' }), 'image');
});

test('engelli ekran: boş akış ve neden', () => {
  STATE = { blocked: 'Süre doldu' };
  const r = summary({}, undefined);
  assert.equal(r.blocked, 'Süre doldu'); assert.equal(r.timeline.length, 0);
});

test('döngü süresi: görsel varsayılan süre, süresiz video tahmini işaretlenir', () => {
  STATE = { imageSeconds: 8, videos: [vid('a', 20), { id: 'b', name: 'b', type: 'image' }, vid('c', 0)], movies: null, campaigns: [], bigMatches: [] };
  const r = summary({}, undefined);
  assert.equal(r.loop.length, 3);
  assert.equal(r.loop[1].dur, 8);
  assert.equal(r.loop[2].dur, 30); assert.equal(r.loop[2].est, true);
  assert.equal(r.loopSec, 58);
});

test('kampanya: açılıştan ~25 sn sonra, içerik bitince araya girer ve everyMin sonra tekrarlar', () => {
  STATE = { imageSeconds: 10, videos: [vid('a', 20), vid('b', 20)], campaigns: [{ id: 'c1', headline: 'Kahve', everyMin: 3, durSec: 15 }], bigMatches: [] };
  const r = summary({}, undefined), camps = r.timeline.filter(e => e.kind === 'camp');
  assert.ok(camps.length >= 2);
  assert.equal(camps[0].at, 40);               // a(0-20), b(20-40) -> 40'ta bitti, ilk kampanya
  assert.ok(camps[1].at - camps[0].at >= 180); // en az 3 dk sonra
  const k = r.timeline.findIndex(e => e.kind === 'camp');
  assert.equal(r.timeline[k - 1].kind, 'video'); // kampanyadan önce içerik bitmiş olur
});

test('fragman: her N içerikte bir ve en az gap dk arayla', () => {
  STATE = { imageSeconds: 10, videos: [vid('a', 30), vid('b', 30)], showTrailers: true, trailerEvery: 3, trailerGapMin: 1, movies: { items: [{ title: 'Film', trailer: 'x' }] }, campaigns: [], bigMatches: [] };
  const r = summary({}, undefined), tr = r.timeline.filter(e => e.kind === 'trailer');
  assert.ok(tr.length >= 1);
  const i = r.timeline.findIndex(e => e.kind === 'trailer');
  assert.equal(i, 3);                           // 3 içerikten sonra
  assert.equal(r.timeline[i].est, true);
});

test('büyük maç: açılıştan ~1 dk sonra, tüm maçlar peş peşe', () => {
  STATE = { imageSeconds: 10, videos: [vid('a', 40)], bigCfg: { everyMin: 6, durSec: 15 }, bigMatches: [{ name: 'M1' }, { name: 'M2' }], campaigns: [] };
  const r = summary({}, undefined), big = r.timeline.filter(e => e.kind === 'big');
  assert.equal(big[0].name, 'M1'); assert.equal(big[1].name, 'M2');
  assert.equal(big[0].at, 80);                  // a(0-40), a(40-80) -> 80 >= 60
  assert.equal(big[1].at, 95);
});

test('özel yayın: kampanya, maç ve fragman çıkmaz', () => {
  STATE = { imageSeconds: 10, special: { name: 'Maç' }, videos: [vid('a', 20)], showTrailers: true, movies: { items: [{ title: 'F', trailer: 'x' }] }, campaigns: [{ id: 'c', headline: 'K', everyMin: 1, durSec: 10 }], bigMatches: [{ name: 'M' }] };
  const r = summary({}, undefined);
  assert.ok(r.timeline.length > 0);
  assert.ok(r.timeline.every(e => e.kind === 'video'));
  assert.ok(r.special);
});

test('boş liste: zaman çizelgesi yok', () => {
  STATE = { videos: [], campaigns: [], bigMatches: [] };
  assert.equal(summary({}, undefined).timeline.length, 0);
});
