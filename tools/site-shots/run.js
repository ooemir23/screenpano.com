#!/usr/bin/env node
// Tanıtım sitesinin ekran görüntülerini uygulamanın kendisinden üretir.
// Geçici bir veri klasörüyle sunucuyu açar, üç örnek işletme kurar (kafe, spor bar, pastane),
// public/site/features.json içindeki "shots" listesindeki her görüntüyü çeker ve public/site/<ad>.webp olarak yazar.
//
//   npm run site-shots                 hepsi
//   npm run site-shots -- tv-gol p-ozet   yalnız bunlar
//
// Gerekenler: devDependencies (npm install), Chromium (npx playwright install chromium) ya da CHROME_PATH.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium, request } = require('playwright');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'public/site');
const PHOTOS = path.join(__dirname, 'photos');
const PORT = Number(process.env.SHOTS_PORT || 3199);
const B = `http://127.0.0.1:${PORT}`;
const PASS = 'Demo-12345678';
const { shots } = JSON.parse(fs.readFileSync(path.join(OUT, 'features.json'), 'utf8'));
const only = process.argv.slice(2);
const wanted = Object.entries(shots).filter(([k]) => !only.length || only.includes(k));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('[site-shots]', ...a);

// ---------- örnek işletmeler ----------
const W = (type, x, y, w, h, props) => ({ type, x, y, w, h, ...(props ? { props } : {}) });
const MENU = { title: 'Fiyat Listesi', currency: '₺', categories: [
  { name: 'Sıcak İçecekler', t: { en: 'Hot Drinks' }, items: [['Türk Kahvesi', '90', 'Turkish Coffee'], ['Latte', '120'], ['Filtre Kahve', '105', 'Filter Coffee'], ['Flat White', '125'], ['Sahlep', '110', 'Salep'], ['Çay', '35', 'Tea']].map(([name, price, en]) => ({ name, price, ...(en ? { t: { en: { name: en } } } : {}) })) },
  { name: 'Tatlılar', t: { en: 'Desserts' }, items: [['San Sebastian', '180'], ['Brownie', '140'], ['Fıstıklı Baklava', '220', 'Pistachio Baklava'], ['Tiramisu', '170']].map(([name, price, en]) => ({ name, price, ...(en ? { t: { en: { name: en } } } : {}) })) },
  { name: 'Soğuk İçecekler', t: { en: 'Cold Drinks' }, items: [['Ice Latte', '130'], ['Limonata', '95', 'Lemonade'], ['Taze Portakal Suyu', '110', 'Fresh Orange Juice']].map(([name, price, en]) => ({ name, price, ...(en ? { t: { en: { name: en } } } : {}) })) },
] };
const TENANTS = {
  kafe: {
    user: 'demo-kafe', name: 'Sahil Kafe',
    theme: { bg: '#151717', accent: '#906538', accent2: '#c9955c', text: '#fbfbfb', font: 'Montserrat' },
    layout: [W('media', 0, 0, 16, 22), W('logo', 16, 0, 8, 3), W('menu', 16, 3, 8, 13), W('clock', 16, 16, 8, 6), W('ticker', 0, 22, 24, 2)],
    posters: [
      ['kahvalti', { title: 'Serpme Kahvaltı', price: '450 ₺', sub: 'Hafta sonu 09:00 – 13:00', note: 'Sınırsız çay ile' }, 'kahvalti.jpg'],
      ['yeni', { badge: 'Yeni', title: 'Fıstıklı Latte', price: '145 ₺', sub: 'Antep fıstığı, espresso, süt köpüğü' }, 'latte.jpg'],
      ['happy', { title: 'Happy Hour', sub: '17:00 – 19:00', note: 'Tüm kokteyllerde %30 indirim' }],
      ['gunun', { title: 'Günün Menüsü', body: 'Mercimek çorbası\nTavuk sote, pilav\nMevsim salata\nAyran', price: '280 ₺' }],
    ],
    media: [['kahve.jpg', 'Kahve keyfi'], ['mekan.jpg', 'Mekân fotoğrafı']],
    campaign: true, birthday: true, stats: true,
  },
  spor: {
    user: 'demo-spor', name: 'Gol Spor Bar',
    theme: { bg: '#0e1420', accent: '#1f6f43', accent2: '#3ecf7a', text: '#f5f7fa', font: 'Montserrat' },
    layout: [W('media', 0, 0, 17, 19), W('reviews', 0, 19, 17, 3), W('logo', 17, 0, 7, 3), W('info', 17, 3, 7, 13), W('rates', 17, 16, 7, 6), W('ticker', 0, 22, 24, 2)],
    posters: [
      ['etkinlik', { badge: 'Bu akşam 20:00', title: 'Galatasaray – Fenerbahçe', sub: 'Dev ekranda canlı', note: 'Masanızı ayırtın' }, 'mac.jpg'],
      ['indirim', { badge: '%20', title: 'Maç boyunca biralar indirimli', sub: 'Her maç gecesi' }],
    ],
    media: [['kalabalik.jpg', 'Maç gecesi']],
  },
  vitrin: {
    user: 'demo-vitrin', name: 'Lezzet Pastanesi',
    theme: { bg: '#160e10', accent: '#7a1f2b', accent2: '#d0606d', text: '#fbf6f4', font: 'Montserrat' },
    layout: [W('logo', 0, 0, 8, 4), W('clock', 16, 0, 8, 4), W('text', 8, 0, 8, 4, { title: 'Hoş geldiniz', body: '', align: 'center', size: 'm' }), W('menu', 0, 4, 16, 20), W('qr', 16, 4, 8, 10), W('rates', 16, 14, 8, 10)],
    posters: [], media: [],
  },
};

async function seed(key) {
  const t = TENANTS[key];
  const r = await request.newContext({ baseURL: B });
  const ok = async (p, what) => { const x = await p; if (!x.ok()) throw new Error(`${key} ${what}: ${x.status()} ${await x.text()}`); return x.json(); };
  await ok(r.post('/api/auth/signup', { data: { business: t.name, username: t.user, password: PASS, accept: true } }), 'kayıt');
  await ok(r.put('/api/admin/theme', { data: t.theme }), 'tema');
  await ok(r.put('/api/admin/screen', { data: { layout: { cols: 24, rows: 24, widgets: t.layout } } }), 'düzen');
  await ok(r.put('/api/admin/menu', { data: MENU }), 'menü');
  for (const [tpl, fields, photo] of t.posters) {
    let image;
    if (photo) image = (await ok(r.post('/api/admin/posters/image', { multipart: { file: { name: photo, mimeType: 'image/jpeg', buffer: fs.readFileSync(path.join(PHOTOS, photo)) } } }), 'afiş görseli')).file;
    await ok(r.post('/api/admin/posters', { data: { tpl, fields, image } }), 'afiş');
  }
  for (const [photo, name] of t.media) {
    await ok(r.post('/api/admin/videos', { multipart: { files: { name: photo, mimeType: 'image/jpeg', buffer: fs.readFileSync(path.join(PHOTOS, photo)) } } }), 'medya');
    const db = await ok(r.get('/api/admin/db'), 'db'), v = db.videos.find(x => x.name === photo);
    if (v) await ok(r.put(`/api/admin/videos/${v.id}`, { data: { name } }), 'medya adı');
  }
  for (const [author, rating, text] of [['Elif K.', 5, 'Kahveleri harika, ortam çok sıcak. Maç akşamları ayrı bir keyif!'], ['Murat D.', 5, "San Sebastian'ı mutlaka deneyin. Personel çok ilgili."], ['Selin A.', 4, 'Hafta sonu kahvaltısı için favori mekânımız oldu.']])
    await ok(r.post('/api/admin/reviews', { data: { author, rating, text } }), 'yorum');
  for (const [home, away, time, league, channel] of [['Galatasaray', 'Fenerbahçe', '20:00', 'Süper Lig', 'beIN Sports 1'], ['Beşiktaş', 'Trabzonspor', '19:00', 'Süper Lig', 'beIN Sports 2']])
    await ok(r.post('/api/admin/matches', { data: { home, away, time, league, channel } }), 'maç');
  await ok(r.post('/api/admin/qrs', { data: { label: 'Menü için okutun', kind: 'link', text: 'https://screenpano.com' } }), 'qr');
  await ok(r.put('/api/admin/options', { data: { wifiText: 'Wi-Fi: Misafir · Şifre: hosgeldiniz', showQr: true } }), 'seçenekler');
  if (t.campaign) await ok(r.put('/api/admin/campaigns/google-yorum', { data: { url: 'https://g.page/r/ornek/review', headline: 'Yorumunuz bizim için çok değerli!', sub: "Google'da bizi değerlendirin", note: 'Kasada gösterin, kahveniz bizden', enabled: true } }), 'kampanya');
  if (t.birthday) await ok(r.post('/api/admin/birthdays', { data: { name: 'Zeynep', text: `İyi ki doğdun Zeynep! 🎂 ${t.name} ailesi olarak nice mutlu yıllar dileriz.` } }), 'doğum günü');
  const token = (await ok(r.post('/api/tv/login', { data: { username: t.user, password: PASS } }), 'tv')).deviceToken;
  t.token = token; t.state = await r.storageState();
  await r.dispose();
}

// son 30 günün kullanım istatistiği (panel/istatistik görüntüsü boş görünmesin)
function fakeStats(dataDir, key) {
  const Database = require('better-sqlite3');
  const db = new Database(path.join(dataDir, 'platform.db'));
  const row = db.prepare('SELECT id, data FROM tenants WHERE name = ?').get(TENANTS[key].name);
  const dev = db.prepare('SELECT id FROM devices WHERE tenant_id = ?').get(row.id);
  const vids = JSON.parse(row.data).videos;
  const ins = db.prepare('INSERT OR REPLACE INTO stats (tenant_id, day, kind, key, value) VALUES (?, ?, ?, ?, ?)');
  let seedN = 7; const rnd = () => ((seedN = (seedN * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 30; i++) {
    const d = new Date(Date.now() - i * 864e5), day = d.toISOString().slice(0, 10);
    const on = 600 + Math.round(rnd() * 160) + ([0, 6].includes(d.getDay()) ? 90 : 0);
    ins.run(row.id, day, 'online', dev.id, on);
    vids.forEach((v, j) => { const n = Math.max(1, Math.round(on / (vids.length * 1.2) * (0.6 + rnd() * 0.7) * (j < 2 ? 1.4 : 1))); ins.run(row.id, day, 'play', v.id, n); ins.run(row.id, day, 'sec', v.id, n * 10); });
  }
  db.close();
}

async function save(buf, name, width) {
  await sharp(buf).resize({ width, withoutEnlargement: true }).webp({ quality: 80, effort: 6 }).toFile(path.join(OUT, name + '.webp'));
  log('yazıldı', name + '.webp');
}

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-shots-'));
  const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, SUPER_PASS: PASS + 'x', ALLOW_SIGNUP: 'true', LOGIN_LIMIT: 'off' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', d => process.stderr.write(d));
  let browser;
  try {
    for (let i = 0; ; i++) { try { if ((await fetch(B + '/api/auth/config')).ok) break; } catch (e) {} if (i > 60) throw new Error('sunucu açılmadı'); await sleep(500); }
    const need = new Set(wanted.map(([, s]) => s.tenant).filter(Boolean));
    for (const k of need) { log('örnek işletme:', TENANTS[k].name); await seed(k); }
    await sleep(4000); // maç, hava, kur verileri gelsin; işletme verisi diske yazılsın
    if (need.has('kafe')) fakeStats(dataDir, 'kafe');

    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
    const tvPage = async key => {
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      await ctx.addInitScript(tok => localStorage.setItem('dtoken', tok), TENANTS[key].token);
      const pg = await ctx.newPage(); await pg.goto(B + '/tv'); await pg.waitForTimeout(9000); return pg;
    };
    // panel görüntülerinde cihaz "bağlı" görünsün diye kafe ekranı açık kalır
    const keepTv = need.has('kafe') ? await tvPage('kafe') : null;

    for (const [name, s] of wanted) {
      if (s.view === 'pair') {
        const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } }), pg = await ctx.newPage();
        await pg.goto(B + '/tv'); await pg.waitForTimeout(4000); await save(await pg.screenshot(), name, s.width || 1600); await ctx.close(); continue;
      }
      const t = TENANTS[s.tenant];
      if (s.view === 'tv') {
        const pg = await tvPage(s.tenant);
        if (s.eval) await pg.evaluate(s.eval);
        if (s.api) { const r = await request.newContext({ baseURL: B, storageState: t.state }); await r.fetch(s.api[1], { method: s.api[0], data: s.body || {} }); await r.dispose(); }
        if (s.eval || s.api) await pg.waitForTimeout(s.after || 2000);
        await save(await pg.screenshot(), name, s.width || 1600); await pg.context().close(); continue;
      }
      const mobile = s.view === 'mobile';
      const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: mobile ? 2 : 1, storageState: t.state });
      await ctx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.bn.trial{display:none!important}'; document.head.appendChild(st); }));
      const pg = await ctx.newPage(); await pg.goto(B + '/panel#' + (s.hash || 'home')); await pg.waitForTimeout(3500);
      if (s.scroll) { await pg.evaluate(y => scrollTo(0, y), s.scroll); await pg.waitForTimeout(400); }
      await save(await pg.screenshot(), name, s.width || (mobile ? 780 : 1440)); await ctx.close();
    }
    if (keepTv) await keepTv.context().close();
  } finally {
    if (browser) await browser.close();
    srv.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exit(1); });
