#!/usr/bin/env node
// Eski tek-kafe sürümünün verisini (data/db.json + data/uploads) yeni platforma bir işletme olarak aktarır.
//
// Kullanım (sunucu kapalıyken önerilir):
//   node tools/import-legacy.js --data /eski/data --name "Örnek İşletme" --user isletme --pass "guclu-sifre" \
//        [--plan pro] [--days 365] [--logo /eski/public/logo.png]
//
// Eski sürümde işletmenin girdiği API anahtarları (CollectAPI, TMDB, Google Books) ve trafik Worker ayarları
// platform ayarı boşsa oraya taşınır; böylece mevcut Cloudflare Worker imzası da geçerli kalır.
const fs = require('fs');
const path = require('path');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) { const k = a.slice(2); const v = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true; args[k] = v; }
}
const need = ['data', 'name', 'user', 'pass'];
if (need.some(k => !args[k])) {
  console.log('Kullanım: node tools/import-legacy.js --data /eski/data --name "İşletme" --user kullanici --pass sifre [--plan pro] [--days 365] [--logo logo.png]');
  process.exit(1);
}
const dbFile = path.join(args.data, 'db.json');
if (!fs.existsSync(dbFile)) { console.error('db.json bulunamadı:', dbFile); process.exit(1); }

const store = require('../server/store');
const { createTenant, DAY } = require('../server/accounts');
const tenants = require('../server/tenants');

const old = JSON.parse(fs.readFileSync(dbFile, 'utf8'));

// platform ayarları (boşsa)
const setIfEmpty = (k, v) => { if (v && !store.setting(k)) { store.setSetting(k, v); console.log(`  platform ayarı: ${k} aktarıldı`); } };
setIfEmpty('collect_key', (old.pharmacy || {}).key || (old.news || {}).key);
setIfEmpty('tmdb_key', (old.movies || {}).key);
setIfEmpty('books_key', old.booksKey);
setIfEmpty('traffic_api', old.trafficApi);
setIfEmpty('traffic_secret', old.trafficSecret);

// işletmeye ait olmayan alanları ayıkla
const doc = JSON.parse(JSON.stringify(old));
delete doc.trafficApi; delete doc.trafficSecret; delete doc.booksKey;
if (doc.pharmacy) delete doc.pharmacy.key;
if (doc.news) { delete doc.news.key; delete doc.news.hours; }
if (doc.movies) delete doc.movies.key;

const days = Number(args.days) || 0;
const t = createTenant({ name: args.name, username: args.user, password: args.pass, plan: args.plan || 'pro', paidUntil: days ? Date.now() + days * DAY : null, doc, template: 'spor' });
console.log(`İşletme oluşturuldu: ${t.name} (${t.id}), kullanıcı: ${args.user}`);

// medya dosyaları
const src = path.join(args.data, 'uploads');
const files = new Set([...(doc.videos || []), ...(doc.celebPhotos || []), ...(doc.bigPhotos || [])].map(x => x.file).filter(Boolean));
let copied = 0, missing = 0;
for (const f of files) {
  const from = path.join(src, f);
  if (!fs.existsSync(from)) { missing++; continue; }
  fs.copyFileSync(from, path.join(t.dirs.uploads, f)); copied++;
}
console.log(`  medya: ${copied} dosya kopyalandı${missing ? `, ${missing} dosya bulunamadı` : ''}`);

// logo
if (args.logo && fs.existsSync(args.logo)) {
  const name = 'logo' + path.extname(args.logo).toLowerCase();
  fs.copyFileSync(args.logo, path.join(t.dirs.uploads, name));
  t.db.logo = name; tenants.saveNow(t);
  console.log('  logo aktarıldı');
}
tenants.saveNow(t);
console.log('Tamam. TV\'lerde yeni APK ile bu kullanıcı adı ve şifreyle giriş yapın.');
process.exit(0);
