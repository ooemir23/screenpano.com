// Spotify müziği yalnız işletmenin TV kutusundan çalar: kutu seçimi ve eski "screenpano" hedefinin temizlenmesi
const { test } = require('node:test');
const assert = require('node:assert');

// spotify.js yalnız tenants.save ve store'u kullanır: veritabanı açmadan sahteleriyle yüklenir
const stub = (rel, exports) => { const p = require.resolve(rel); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
let saves = 0;
stub('../server/tenants', { save: () => { saves++; } });
stub('../server/store', { q: {} });
const SP = require('../server/spotify');

const T = sp => ({ id: 't1', db: { music: { spotify: { refreshToken: 'r', ...sp } } } });
const dev = (id, type, extra = {}) => ({ id, name: id + '-ad', type, active: false, box: SP.isBox({ type }), ...extra });

test('kutu türleri: TV, STB, CastVideo kutu; telefon, bilgisayar, hoparlör değil', () => {
  for (const t of ['TV', 'STB', 'CastVideo', 'tv']) assert.ok(SP.isBox({ type: t }), t);
  for (const t of ['Smartphone', 'Computer', 'Speaker', 'CastAudio', '']) assert.ok(!SP.isBox({ type: t }), t);
});

test('tek kutu varsa otomatik seçilir; telefon/bilgisayar asla seçilmez', () => {
  const t = T({});
  const d = SP.resolveBox(t, [dev('pc', 'Computer', { active: true }), dev('box1', 'TV'), dev('tel', 'Smartphone')]);
  assert.equal(d.id, 'box1');
  assert.equal(t.db.music.spotify.target, 'box1');
  assert.equal(t.db.music.spotify.targetName, 'box1-ad');
});

test('eski "screenpano" hedefi kutu yoksa temizlenir, kutu varsa kutuya geçer', () => {
  const t = T({ target: 'screenpano' });
  assert.equal(SP.resolveBox(t, [dev('pc', 'Computer')]), null);
  assert.equal(t.db.music.spotify.target, '');
  const t2 = T({ target: 'screenpano' });
  assert.equal(SP.resolveBox(t2, [dev('box1', 'TV')]).id, 'box1');
  assert.equal(SP.status(t2).target, 'box1');
});

test('kimliği değişen kutu adından bulunur; birden çok kutuda o an çalan seçilir', () => {
  const t = T({ target: 'eski', targetName: 'box2-ad' });
  assert.equal(SP.resolveBox(t, [dev('box1', 'TV'), dev('box2', 'TV')]).id, 'box2');
  const t2 = T({});
  assert.equal(SP.resolveBox(t2, [dev('box1', 'TV'), dev('box2', 'STB', { active: true })]).id, 'box2');
  const t3 = T({});
  assert.equal(SP.resolveBox(t3, [dev('box1', 'TV'), dev('box2', 'TV')]), null, 'iki kutu, hiçbiri çalmıyor: tahmin edilmez');
});

test('kayıtlı hedef kutu değilse (bilgisayar) kutuya geçilir', () => {
  const t = T({ target: 'pc', targetName: 'pc-ad' });
  assert.equal(SP.resolveBox(t, [dev('pc', 'Computer'), dev('box1', 'TV')]).id, 'box1');
});

test('bağlı hesapta müziği her zaman harici cihaz (kutudaki Spotify) çalar', () => {
  assert.equal(SP.external(T({})), true);
  assert.equal(SP.external(T({ target: 'screenpano' })), true);
  assert.equal(SP.external({ id: 'x', db: { music: { spotify: {} } } }), false);
});

test('TV\'ye giden müzik: Spotify anahtarları ayıklanır, harici cihaz bayrağı (ext) vardır', () => {
  // state.js sunucu modüllerini (zamanlayıcılar, veritabanı) yükler: ayrı süreçte, geçici veri klasörüyle çalıştırılır
  const os = require('os'), path = require('path'), fs = require('fs'), { spawnSync } = require('child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-test-'));
  const code = `const { tvMusic } = require(${JSON.stringify(path.join(__dirname, '..', 'server', 'state'))});
    const m = { enabled: true, playlists: [], spotify: { refreshToken: 'gizli-r', accessToken: 'gizli-a', expiresAt: 1, target: 'screenpano', targetName: 'x', name: 'hesap' } };
    const x = tvMusic(m);
    process.stdout.write(JSON.stringify({ x, kept: m.spotify.refreshToken, empty: tvMusic({ playlists: [], spotify: {} }).spotify.ext }));
    process.exit(0);`;
  const r = spawnSync(process.execPath, ['-e', code], { env: { ...process.env, DATA_DIR: dir }, encoding: 'utf8', timeout: 30000 });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stderr);
  const o = JSON.parse(r.stdout), s = JSON.stringify(o.x);
  assert.ok(!s.includes('gizli-r') && !s.includes('gizli-a'), 'anahtar sızdı');
  assert.equal(o.x.spotify.ext, true);
  assert.equal(o.x.spotify.target, '');
  assert.equal(o.kept, 'gizli-r', 'kayıtlı veri değişmemeli');
  assert.equal(o.empty, false);
});

test('routes-ext: TV\'ye giden her music_cmd mesajı tvMusic ile ayıklanır', () => {
  const src = require('fs').readFileSync(require.resolve('../server/routes-ext.js'), 'utf8');
  const sends = src.match(/sendTo\([^\n]*type: 'music_cmd'[^\n]*/g) || [];
  assert.ok(sends.length >= 4);
  for (const l of sends) assert.ok(/music: tvMusic\(m\)/.test(l), l.trim().slice(0, 120));
});
