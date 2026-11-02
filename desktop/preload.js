// TV sayfasına Android uygulamasındaki TVNative köprüsünün Windows karşılığı.
// tv.html: window.__N = window.TVNative; "desktop" bayrağı Android'e özel davranışları kapatır.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('TVNative', {
  desktop: true,
  isNative: () => true,
  getToken: () => ipcRenderer.sendSync('token:get') || '',
  saveToken: t => ipcRenderer.send('token:set', String(t || '')),
  versionName: () => ipcRenderer.sendSync('app:versionName'),
  versionCode: () => ipcRenderer.sendSync('app:versionCode'),
  snapshotAsync: () => ipcRenderer.invoke('snap'),
  checkUpdate: () => ipcRenderer.send('update:check'),
});
