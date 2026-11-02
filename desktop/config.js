// Ayarlar: %APPDATA%\ScreenPano\ayarlar.json
//   url        sunucu adresi (varsayılan https://screenpano.com; komut satırında --url=... ile de verilebilir)
//   display    'auto' (harici ekran varsa o, yoksa ana ekran) ya da ekran kimliği
//   autostart  bilgisayar açılınca başlasın mı (varsayılan evet)
//   token      cihaz anahtarı (şifre saklanmaz)
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const FILE = () => path.join(app.getPath('userData'), 'ayarlar.json');
const DEFAULTS = { url: 'https://screenpano.com', display: 'auto', autostart: true, token: '' };
let cur = null;

function load() {
  if (cur) return cur;
  try { cur = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE(), 'utf8')) }; } catch (e) { cur = { ...DEFAULTS }; }
  const arg = process.argv.find(a => a.startsWith('--url='));
  if (arg) cur.url = arg.slice(6);
  cur.url = String(cur.url || DEFAULTS.url).replace(/\/+$/, '');
  return cur;
}
function save(patch) {
  cur = { ...load(), ...patch };
  try { fs.mkdirSync(path.dirname(FILE()), { recursive: true }); fs.writeFileSync(FILE(), JSON.stringify(cur, null, 2)); } catch (e) { console.error('Ayarlar yazılamadı', e.message); }
  return cur;
}

module.exports = { load, save, FILE };
