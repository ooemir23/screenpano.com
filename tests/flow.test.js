// Akış özeti (günlük kuş bakışı) benzetimi: TV kurallarına (kampanya/fragman/büyük maç araya girişi, zamanlama, özel yayın) uyduğunu doğrular
const { test } = require('node:test');
const assert = require('node:assert');

let STATE = {};
const statePath = require.resolve('../server/state');
require.cache[statePath] = { id: statePath, filename: statePath, loaded: true, exports: { publicState: () => STATE } };
const { summary, kindOf } = require('../server/flow');

const vid = (id, dur, extra) => ({ id, name: id, type: 'video', dur, ...extra });
const T = (special) => ({ db: { special: special || [], videos: [] } });
const sum = (h, k) => h.strip.filter(x => x[0] === k).reduce((a, b) => a + b[1], 0);
const total = h => h.strip.reduce((a, b) => a + b[1], 0);
const plays = (r, k) => (r.totals.find(x => x.kind === k) || { plays: 0 }).plays;

test('tür ayrımı', () => {
  assert.equal(kindOf({ id: 'pad:1', type: 'video' }), 'ad');
  assert.equal(kindOf({ id: 'bk1', type: 'poster', tpl: 'kitap' }), 'book');
  assert.equal(kindOf({ id: 'x', type: 'poster', tpl: 'insta' }), 'insta');
  assert.equal(kindOf({ id: 'y', type: 'youtube' }), 'youtube');
  assert.equal(kindOf({ id: 'p', type: 'poster', tpl: 'x' }), 'poster');
  assert.equal(kindOf({ id: 'i', type: 'image' }), 'image');
});

test('engelli ekran: boş harita ve neden', () => {
  STATE = { blocked: 'Süre doldu' };
  const r = summary(T(), undefined, 0);
  assert.equal(r.blocked, 'Süre doldu'); assert.equal(r.totals.length, 0);
});

test('boş liste: toplam yok', () => {
  STATE = { videos: [], campaigns: [], bigMatches: [] };
  assert.equal(summary(T(), undefined, 0).totals.length, 0);
});

test('24 saat dolu: her saat 3600 sn, gün toplamı 86400', () => {
  STATE = { imageSeconds: 10, videos: [vid('a', 20), vid('b', 40)], campaigns: [], bigMatches: [] };
  const r = summary(T(), undefined, 0);
  assert.equal(r.hours.length, 24);
  r.hours.forEach(h => assert.equal(total(h), 3600));
  assert.equal(r.totals.reduce((a, b) => a + b.sec, 0) >= 86400, true);
  assert.equal(r.hours[0].n, 2); assert.equal(r.hours[0].round, 60);
});

test('gün parametresi sınırlanır; 7 gün ileri', () => {
  STATE = { imageSeconds: 10, videos: [vid('a', 20)], campaigns: [], bigMatches: [] };
  assert.equal(summary(T(), undefined, 99).day, 6);
  assert.equal(summary(T(), undefined, -3).day, 0);
  assert.equal(summary(T(), undefined, 0).nowHour != null, true);
  assert.equal(summary(T(), undefined, 1).nowHour, null);
});

test('süresiz video 30 sn sayılır; görsel varsayılan süre', () => {
  STATE = { imageSeconds: 8, videos: [vid('a', 0), { id: 'b', name: 'b', type: 'image' }], campaigns: [], bigMatches: [] };
  const r = summary(T(), undefined, 0);
  assert.equal(r.hours[0].round, 38);
});

test('kampanya: everyMin aralıkla tekrarlar (saatte ~20, içerik bitişini beklediği için biraz az)', () => {
  STATE = { imageSeconds: 10, videos: [vid('a', 20), vid('b', 20)], campaigns: [{ id: 'c1', headline: 'Kahve', everyMin: 3, durSec: 15 }], bigMatches: [] };
  const r = summary(T(), undefined, 0);
  const n = r.hours[5].counts.camp;
  assert.ok(n >= 17 && n <= 20, 'saatlik kampanya sayısı ' + n);
  assert.ok(sum(r.hours[5], 'camp') >= 17 * 15);
});

test('zamanlı kampanya yalnız kendi saatinde çıkar (indirim saati)', () => {
  STATE = { imageSeconds: 10, videos: [vid('a', 20)], campaigns: [{ id: 'h', headline: 'Happy', everyMin: 2, durSec: 15, sch: { from: '09:00', to: '12:00' } }], bigMatches: [] };
  const r = summary(T(), undefined, 0);
  assert.ok(r.hours[10].counts.camp > 10);
  assert.ok(!r.hours[13].counts.camp && !r.hours[8].counts.camp);
});

test('zamanlı içerik: yalnız kendi saatinde döngüye girer', () => {
  STATE = { imageSeconds: 10, videos: [vid('a', 20), { id: 'p', name: 'Menü', type: 'poster', dur: 20, sch: { from: '09:00', to: '12:00' } }], campaigns: [], bigMatches: [] };
  const r = summary(T(), undefined, 0);
  assert.ok(sum(r.hours[10], 'poster') > 1000);
  assert.equal(sum(r.hours[13], 'poster'), 0);
  assert.equal(r.hours[10].n, 2); assert.equal(r.hours[13].n, 1);
});

test('fragman: her N içerikte bir ve en az gap dk arayla', () => {
  STATE = { imageSeconds: 10, videos: [vid('a', 30), vid('b', 30)], showTrailers: true, trailerEvery: 3, trailerGapMin: 1, movies: { items: [{ title: 'Film', trailer: 'x' }] }, campaigns: [], bigMatches: [] };
  const r = summary(T(), undefined, 0);
  assert.ok(plays(r, 'trailer') > 100);
  assert.equal(r.rules.trailer.every, 3);
});

test('büyük maç: tüm maçlar peş peşe, everyMin aralığıyla', () => {
  STATE = { imageSeconds: 10, videos: [vid('a', 40)], bigCfg: { everyMin: 6, durSec: 15 }, bigMatches: [{ name: 'M1' }, { name: 'M2' }], campaigns: [] };
  const r = summary(T(), undefined, 0);
  assert.equal(plays(r, 'big') % 2, 0);
  assert.ok(r.hours[3].counts.big >= 18 && r.hours[3].counts.big <= 20);
});

test('özel yayın: o saatlerde yalnız seçili içerik, araya kampanya/fragman girmez', () => {
  const t = { db: { videos: [{ id: 'v1', name: 'Maç Açılış', type: 'video', dur: 20 }], special: [{ on: true, name: 'Derbi', items: ['v1'], sch: { from: '20:00', to: '22:00' } }] } };
  STATE = { imageSeconds: 10, videos: [vid('a', 20)], showTrailers: true, movies: { items: [{ title: 'F', trailer: 'x' }] }, campaigns: [{ id: 'c', headline: 'K', everyMin: 1, durSec: 10 }], bigMatches: [{ name: 'M' }] };
  const r = summary(t, undefined, 0);
  assert.equal(r.hours[20].special, 'Derbi'); assert.equal(r.hours[19].special, null);
  assert.ok(!r.hours[20].counts.camp && !r.hours[20].counts.big && !r.hours[20].counts.trailer);
  assert.ok(r.hours[19].counts.camp > 0);
});

test('en çok tekrar eden içerikler sıralı ve en fazla 8', () => {
  STATE = { imageSeconds: 10, videos: Array.from({ length: 12 }, (_, i) => vid('v' + i, i === 0 ? 10 : 30)), campaigns: [], bigMatches: [] };
  const r = summary(T(), undefined, 0);
  assert.ok(r.top.length <= 8);
  for (let i = 1; i < r.top.length; i++) assert.ok(r.top[i - 1].plays >= r.top[i].plays);
});

test('tek çizgi: olaylar sıralı, art arda ve toplamlarla tutarlı', () => {
  STATE = { imageSeconds: 10, videos: [vid('a', 45), { id: 'i', name: 'Latte', type: 'image' }, vid('pad:1', 15)], showTrailers: true, trailerEvery: 3, trailerGapMin: 1, movies: { items: [{ title: 'Film', trailer: 'x' }] }, campaigns: [{ id: 'c', headline: 'K', everyMin: 4, durSec: 15 }], bigMatches: [] };
  const r = summary(T(), undefined, 0);
  assert.ok(r.ev.length > 500);
  for (let i = 1; i < r.ev.length; i++) assert.equal(r.ev[i][0], r.ev[i - 1][0] + r.ev[i - 1][3]); // boşluksuz, sıralı
  assert.equal(r.ev[0][0], 0);
  r.ev.forEach(([at, k, ni, dur]) => { assert.ok(r.kinds[k]); assert.ok(r.names[ni] != null); assert.ok(dur >= 1 && at < 86400); });
  const camps = r.ev.filter(e => r.kinds[e[1]] === 'camp').length;
  assert.equal(camps, plays(r, 'camp'));
  assert.equal(r.nowSec != null, true);
  assert.equal(summary(T(), undefined, 1).nowSec, null);
});

test('tek tur: ana döngü bir kez döner, araya girenler dahil, şimdiden başlar', () => {
  STATE = { imageSeconds: 10, videos: [vid('a', 45), { id: 'i', name: 'Latte', type: 'image' }, vid('pad:1', 15)], showTrailers: true, trailerEvery: 2, trailerGapMin: 0, movies: { items: [{ title: 'Film', trailer: 'x' }] }, campaigns: [{ id: 'c', headline: 'K', everyMin: 1, durSec: 15 }], bigMatches: [] };
  const r = summary(T(), undefined, 0, { rounds: 1 });
  assert.equal(r.round, true); assert.equal(r.rounds, 1);
  const main = r.ev.filter(e => ['video', 'image', 'ad'].includes(r.kinds[e[1]]));
  assert.equal(main.length, 3);                       // 3 ana içerik tam bir kez
  assert.ok(r.ev.some(e => r.kinds[e[1]] === 'camp')); // kampanya araya girdi
  assert.equal(r.ev[0][0], 0);
  assert.equal(r.totalSec, r.ev.reduce((a, e) => a + e[3], 0));
  const r3 = summary(T(), undefined, 0, { rounds: 3 });
  assert.equal(r3.ev.filter(e => ['video', 'image', 'ad'].includes(r3.kinds[e[1]])).length, 9);
});

test('tek tur: boş listede boş akış', () => {
  STATE = { videos: [], campaigns: [], bigMatches: [] };
  assert.equal(summary(T(), undefined, 0, { rounds: 1 }).ev.length, 0);
});
