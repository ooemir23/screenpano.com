// Tahmin Ligi: hafta sınırları (Salı–Salı, Türkiye saati), puanlama ve puan durumu sıralaması
const { test } = require('node:test');
const assert = require('node:assert');
const os = require('os'), path = require('path'), fs = require('fs');

process.env.DATA_DIR = process.env.DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'pred-'));
const stub = (rel, exports) => { const p = require.resolve(rel); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
const T = []; stub('../server/tenants', { all: () => T, get: id => T.find(t => t.id === id), save: () => {} });
stub('../server/plans', { plan: () => ({ pro: true }), access: () => ({ ok: true }) });
const MAILS = []; stub('../server/mailer', { send: async m => { MAILS.push(m); return {}; }, enabled: () => true });
const P = require('../server/predict');

const tr = s => Date.parse(s + '+03:00'); // Türkiye saatiyle tarih

test('hafta Salı 00:00 (TR) başlar; Cuma–Pazartesi maçları aynı haftadadır', () => {
  assert.equal(P.weekKey(tr('2026-11-17T00:00:00')), '2026-11-17'); // Salı
  assert.equal(P.weekKey(tr('2026-11-16T23:59:00')), '2026-11-10'); // Pazartesi gecesi bir önceki hafta
  const fri = P.weekKey(tr('2026-11-20T20:00:00')), mon = P.weekKey(tr('2026-11-23T20:00:00'));
  assert.equal(fri, '2026-11-17'); assert.equal(mon, '2026-11-17');
  const [s, e] = P.weekRange('2026-11-17'); assert.equal(s, tr('2026-11-17T00:00:00')); assert.equal(e - s, 7 * 86400e3);
  assert.equal(P.weekLabel('2026-11-17'), '17–23 Kasım');
  assert.equal(P.weekLabel('2026-12-29'), '29 Aralık – 4 Ocak');
});

const M = { id: '1', st: 'post', sc: [2, 1], res: { goals: { '10': 2, '11': 0 }, assists: { '20': 1 }, yc: 4, rc: 1 } };
test('puanlama: tam skor 5 (sonuç puanı ayrıca eklenmez), sonuç 2, golcü her gol 3, asist 2, sarı 2, kırmızı 2', () => {
  assert.deepEqual(P.PTS, { exact: 5, result: 2, goal: 3, assist: 2, yellow: 2, red: 2 });
  const full = P.pointsFor({ h: 2, a: 1, g: '10', as: '20', yc: 4, rc: true }, M);
  assert.equal(full.score, 5); assert.equal(full.goal, 6); assert.equal(full.assist, 2); assert.equal(full.yellow, 2); assert.equal(full.red, 2); assert.equal(full.total, 17); assert.ok(full.exact);
  assert.equal(P.pointsFor({ h: 3, a: 0 }, M).total, 2, 'yalnız sonuç');
  assert.equal(P.pointsFor({ h: 1, a: 1 }, M).total, 0, 'yanlış sonuç');
  assert.equal(P.pointsFor({ g: '99', yc: 3, rc: false }, M).total, 0, 'tutmayan golcü / kart');
  assert.equal(P.pointsFor({ rc: false }, { ...M, res: { ...M.res, rc: 0 } }).red, 2, 'kırmızı çıkmaz bildi');
  assert.equal(P.pointsFor({ h: 2, a: 1 }, { ...M, st: 'pre' }), null, 'bitmemiş maç puanlanmaz');
  assert.equal(P.pointsFor({ h: 2, a: 1 }, { ...M, res: null }), null, 'istatistik gelmeden puan yok');
});

test('puan durumu: puan, sonra tam skor, sonra erken tahmin; kapatılan katılımcı görünmez', () => {
  const wk = '2026-11-17', at = tr('2026-11-21T19:00:00');
  Object.assign(P.matches, {
    a: { id: 'a', at, wk, st: 'post', sc: [1, 0], res: { goals: {}, assists: {}, yc: 2, rc: 0 } },
    b: { id: 'b', at, wk, st: 'post', sc: [2, 2], res: { goals: {}, assists: {}, yc: 5, rc: 0 } },
  });
  const t = { id: 't1', name: 'X', db: { predict: { on: true, users: {
    u1: { nick: 'Ali', email: 'a@x.co' }, u2: { nick: 'Ayşe', email: 'b@x.co' }, u3: { nick: 'Can', email: 'c@x.co' }, u4: { nick: 'Hileci', email: 'd@x.co', off: true } },
    picks: {
      u1: { a: { h: 2, a: 1, at: 3 }, b: { h: 0, a: 0, at: 3 } },          // 2 + 2 = 4, tam skor 0
      u2: { a: { h: 1, a: 0, at: 5 } },                                    // 5 = tam skor
      u3: { a: { h: 3, a: 0, at: 1 }, b: { yc: 5, at: 1 } },                // 2 + 2 = 4, tam skor 0, daha erken
      u4: { a: { h: 1, a: 0, at: 0 }, b: { h: 2, a: 2, at: 0 } },
    }, awards: {} } } };
  T.push(t);
  const b = P.board(t, wk);
  assert.deepEqual(b.map(r => r.nick), ['Ayşe', 'Can', 'Ali']);
  assert.deepEqual(b.map(r => r.pts), [5, 4, 4]);
  assert.equal(P.board(t, '2026-11-24').length, 0, 'başka hafta boş');
});

test('hafta kapanınca birinci kesinleşir, bir kez e-posta gider; puan alan yoksa kazanan yok', async () => {
  const prev = P.weekKey(Date.now() - 7 * 86400e3), [s] = P.weekRange(prev), at = s + 3 * 86400e3;
  Object.assign(P.matches, { p1: { id: 'p1', at, wk: prev, st: 'post', sc: [0, 0], res: { goals: {}, assists: {}, yc: 1, rc: 0 } }, p2: { id: 'p2', at, wk: prev, st: 'off', sc: null, res: null } });
  const t = { id: 't2', name: 'Kafe', db: { predict: { on: true, prize: 'Tatlı', users: { w: { nick: 'Kazanan', email: 'w@x.co' }, l: { nick: 'Diğer', email: 'l@x.co' } },
    picks: { w: { p1: { h: 0, a: 0, at: 1 } }, l: { p1: { h: 1, a: 0, at: 1 } } }, awards: {} } } };
  const empty = { id: 't3', name: 'Boş', db: { predict: { on: true, users: { z: { nick: 'Z', email: 'z@x.co' } }, picks: { z: { p1: { h: 1, a: 0, yc: 4, at: 1 } } }, awards: {} } } };
  T.push(t, empty);
  assert.ok(P.weekDone(prev), 'ertelenen maç haftayı bekletmez');
  await P.settle(); await P.settle();
  assert.equal(t.db.predict.awards[prev].nick, 'Kazanan'); assert.equal(t.db.predict.awards[prev].pts, 5); assert.equal(t.db.predict.awards[prev].prize, 'Tatlı');
  assert.ok(empty.db.predict.awards[prev].none);
  assert.equal(MAILS.filter(m => m.to === 'w@x.co').length, 1, 'kazanana tek e-posta');
});

test('doğum tarihi doğrulama ve yaş', () => {
  const { birth } = require('../server/routes-predict');
  assert.equal(birth('1990-02-30'), null);
  assert.equal(birth('1899-12-31'), null);
  assert.equal(birth('3000-01-01'), null);
  assert.equal(birth('abc'), null);
  const b = birth('2000-01-01'); assert.equal(b.bd, '2000-01-01'); assert.ok(b.age >= 26);
});
