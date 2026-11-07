// ScreenPano Windows uygulaması: Android TV kutusu yerine bir bilgisayardan televizyonlara yayın.
// Sunucudaki /tv sayfasını tam ekran açar (Android uygulamasıyla aynı sayfa), cihaz anahtarını saklar,
// ekranı uyutmaz, bilgisayar açılınca kendiliğinden başlar ve GitHub'daki yeni sürümle kendini günceller.
const { app, BrowserWindow, Menu, Tray, screen, ipcMain, powerSaveBlocker, nativeImage, dialog, shell } = require('electron');
const path = require('path');
const cfg = require('./config');

const ICON = path.join(__dirname, 'build', 'icon.png');
let win = null, tray = null, updater = null, updateReady = false, userAsked = false;

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// TV kutusunda olduğu gibi: video donanım hızlandırmasıyla oynasın
app.commandLine.appendSwitch('ignore-gpu-blocklist');

// ---------- hangi ekranda yayın ----------
// "auto": bilgisayara bağlı harici ekran (televizyon/HDMI dağıtıcı) varsa orası, yoksa ana ekran
function targetDisplay() {
  const all = screen.getAllDisplays(), primary = screen.getPrimaryDisplay(), want = cfg.load().display;
  if (want !== 'auto') { const d = all.find(x => String(x.id) === String(want)); if (d) return d; }
  return all.find(x => x.id !== primary.id) || primary;
}
function placeWindow() {
  if (!win) return;
  const b = targetDisplay().bounds;
  win.setFullScreen(false);
  win.setBounds(b);
  win.setFullScreen(true);
}

// ---------- pencere ----------
function createWindow() {
  const d = targetDisplay();
  win = new BrowserWindow({
    x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
    fullscreen: true, frame: false, autoHideMenuBar: true, backgroundColor: '#000000', show: false,
    title: 'ScreenPano', icon: ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.once('ready-to-show', () => { win.show(); placeWindow(); });
  win.loadURL(cfg.load().url + '/tv');

  // bağlantı yoksa ya da sayfa çökerse kendiliğinden yeniden dene (TV önbelleği çevrimdışı da açar)
  win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => { if (isMain) setTimeout(() => win && win.loadURL(cfg.load().url + '/tv'), 10000); });
  win.webContents.on('render-process-gone', () => setTimeout(() => win && win.reload(), 3000));
  win.on('unresponsive', () => setTimeout(() => win && win.reload(), 5000));
  // dış bağlantılar (QR, fragman vb.) uygulamanın içinde açılmaz
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { // adres öneki değil kaynak (origin) karşılaştırılır: screenpano.com.baska.site geçmesin
    try { if (new URL(url).origin !== new URL(cfg.load().url).origin) e.preventDefault(); } catch { e.preventDefault(); }
  });

  // klavye: F11 tam ekran, Ctrl+R yenile, Ctrl+Shift+Q çıkış (Esc ve Menü tuşu TV menüsünü açar)
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (input.control && input.key.toLowerCase() === 'r') { win.reload(); e.preventDefault(); }
    else if (input.control && input.shift && input.key.toLowerCase() === 'q') { app.quit(); }
  });
  win.on('closed', () => { win = null; });
}

// ---------- köprü (preload.js) ----------
ipcMain.on('token:get', e => { e.returnValue = cfg.load().token || ''; });
ipcMain.on('token:set', (e, t) => { cfg.save({ token: t }); });
ipcMain.on('app:versionName', e => { e.returnValue = app.getVersion() + ' Windows'; });
ipcMain.on('app:versionCode', e => { const [a, b, c] = app.getVersion().split('.').map(Number); e.returnValue = a * 10000 + b * 100 + (c || 0); });
// cihaz kimliği: ilk fiziksel ağ kartının MAC adresi (yoksa bilgisayar adı) — panelde "hangi cihaz" diye gösterilir
ipcMain.on('hwid', e => {
  try {
    const os = require('os');
    for (const list of Object.values(os.networkInterfaces())) {
      const nic = (list || []).find(n => n && n.mac && n.mac !== '00:00:00:00:00:00' && !n.internal);
      if (nic) { e.returnValue = nic.mac.replace(/-/g, ':').toLowerCase(); return; }
    }
    e.returnValue = os.hostname() || '';
  } catch (err) { e.returnValue = ''; }
});
ipcMain.on('model', e => { try { e.returnValue = (require('os').hostname() || 'Windows') + ' · Windows'; } catch (err) { e.returnValue = 'Windows'; } });
// panelden istenen ekran görüntüsü (en çok 960 px genişlik, JPEG)
ipcMain.handle('snap', async () => {
  if (!win) return '';
  const img = await win.webContents.capturePage();
  const s = img.getSize(), small = s.width > 960 ? img.resize({ width: 960, quality: 'good' }) : img;
  return 'data:image/jpeg;base64,' + small.toJPEG(70).toString('base64');
});
ipcMain.on('update:check', () => { userAsked = true; checkUpdates(); });

// ---------- otomatik güncelleme (GitHub Releases) ----------
const status = msg => { if (win) win.webContents.executeJavaScript(`window.__updateStatus && window.__updateStatus(${JSON.stringify(msg)})`).catch(() => {}); };
function setupUpdater() {
  if (!app.isPackaged) return;
  try { updater = require('electron-updater').autoUpdater; } catch (e) { return; }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('update-not-available', () => { if (userAsked) status('Uygulama güncel.'); userAsked = false; });
  updater.on('download-progress', p => { if (userAsked) status(`Yeni sürüm indiriliyor… %${Math.round(p.percent)}`); });
  updater.on('error', err => { if (userAsked) status('Güncelleme denetlenemedi: ' + (err && err.message ? err.message.split('\n')[0] : 'bağlantı yok')); userAsked = false; });
  updater.on('update-downloaded', info => {
    updateReady = true; buildTray();
    // kullanıcı istediyse hemen, değilse gece 04:00'te kurulur (yayın gün içinde kesilmesin)
    if (userAsked) { status(`v${info.version} kuruluyor, uygulama birkaç saniye içinde yeniden açılacak…`); setTimeout(() => updater.quitAndInstall(true, true), 3000); }
  });
  setTimeout(checkUpdates, 60 * 1000);
  setInterval(checkUpdates, 6 * 3600 * 1000);
  setInterval(() => { if (updateReady && new Date().getHours() === 4) updater.quitAndInstall(true, true); }, 10 * 60 * 1000);
}
function checkUpdates() {
  if (!updater) { if (userAsked) status(app.isPackaged ? 'Güncelleme denetlenemedi.' : 'Geliştirme sürümü: güncelleme yok.'); userAsked = false; return; }
  if (userAsked) status('Kontrol ediliyor…');
  updater.checkForUpdates().catch(() => {});
}

// ---------- görev çubuğu simgesi ----------
function setAutostart(on) {
  cfg.save({ autostart: on });
  if (process.platform === 'win32' || process.platform === 'darwin') app.setLoginItemSettings({ openAtLogin: on, args: [] });
}
function buildTray() {
  const c = cfg.load(), displays = screen.getAllDisplays(), primary = screen.getPrimaryDisplay();
  const name = (d, i) => `${i + 1}. ekran · ${d.size.width}×${d.size.height}${d.id === primary.id ? ' (ana ekran)' : ''}`;
  const menu = Menu.buildFromTemplate([
    { label: 'ScreenPano ' + app.getVersion(), enabled: false },
    { type: 'separator' },
    { label: 'Yayın ekranı', submenu: [
      { label: 'Otomatik (harici ekran varsa o)', type: 'radio', checked: c.display === 'auto', click: () => { cfg.save({ display: 'auto' }); placeWindow(); } },
      ...displays.map((d, i) => ({ label: name(d, i), type: 'radio', checked: String(c.display) === String(d.id), click: () => { cfg.save({ display: String(d.id) }); placeWindow(); } })),
    ] },
    { label: 'Ekranı göster', click: () => { if (win) { win.show(); placeWindow(); } else createWindow(); } },
    { label: 'Yenile', click: () => win && win.reload() },
    { type: 'separator' },
    { label: 'Bilgisayar açılınca başlat', type: 'checkbox', checked: c.autostart !== false, click: i => setAutostart(i.checked) },
    { label: updateReady ? 'Güncellemeyi şimdi kur' : 'Güncellemeleri denetle', click: () => { if (updateReady) updater.quitAndInstall(true, true); else { userAsked = true; checkUpdates(); } } },
    { label: 'Sunucu: ' + c.url.replace(/^https?:\/\//, ''), click: () => dialog.showMessageBox({ type: 'info', title: 'ScreenPano', message: 'Sunucu adresi', detail: `${c.url}\n\nDeğiştirmek için ayar dosyasını düzenleyin:\n${cfg.FILE()}` }) },
    { type: 'separator' },
    { label: 'Çıkış', click: () => app.quit() },
  ]);
  if (!tray) { tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 })); tray.setToolTip('ScreenPano'); tray.on('click', () => tray.popUpContextMenu()); }
  tray.setContextMenu(menu);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  powerSaveBlocker.start('prevent-display-sleep');
  if (cfg.load().autostart !== false) setAutostart(true);
  createWindow();
  buildTray();
  setupUpdater();
  // televizyon sonradan takılır ya da çıkarılırsa pencere doğru ekrana geçer
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(ev, () => { placeWindow(); buildTray(); });
});
// pencere kapansa da uygulama simgede çalışmaya devam eder; çıkış simge menüsünden
app.on('window-all-closed', () => {});
