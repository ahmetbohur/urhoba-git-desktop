import { app, BrowserWindow, Menu, nativeTheme, session, shell } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { registerIpcHandlers } from './ipc';
import * as autopull from './services/autopull';
import * as store from './services/store';
import { stopWatching } from './services/watcher';

// Windows'ta kurulum/kaldırma sırasında kısayolları Squirrel yönetiyor.
if (started) {
  app.quit();
}

const isDevelopment = !!MAIN_WINDOW_VITE_DEV_SERVER_URL;

/**
 * İçerik güvenlik politikası.
 *
 * Geliştirmede Vite'ın HMR istemcisi satır içi script ve websocket kullanıyor,
 * bu yüzden politika orada gevşek.
 *
 * Paketlenmiş uygulamada script yalnızca uygulamanın kendisinden geliyor ve
 * arayüzün ağa çıkışı yok: GitHub API çağrılarının tamamı ana süreçte, dolayısıyla
 * `connect-src` kapalı kalabiliyor. Tek istisna GitHub avatar sunucusu —
 * profil resmini göstermek için gereken tek dış kaynak. Bu yalnızca resim
 * indirmeye izin veriyor; oraya veri gönderilemiyor.
 */
function applyContentSecurityPolicy(): void {
  const policy = isDevelopment
    ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://avatars.githubusercontent.com; font-src 'self' data:; connect-src 'self' ws: http://localhost:*"
    : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://avatars.githubusercontent.com; font-src 'self' data:; connect-src 'self'";

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy],
      },
    });
  });
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Urhoba',
      submenu: [
        { role: 'about', label: 'Urhoba Git Desktop Hakkında' },
        { type: 'separator' },
        { role: 'quit', label: 'Çıkış' },
      ],
    },
    {
      label: 'Düzen',
      submenu: [
        { role: 'undo', label: 'Geri al' },
        { role: 'redo', label: 'Yinele' },
        { type: 'separator' },
        { role: 'cut', label: 'Kes' },
        { role: 'copy', label: 'Kopyala' },
        { role: 'paste', label: 'Yapıştır' },
        { role: 'selectAll', label: 'Tümünü seç' },
      ],
    },
    {
      label: 'Görünüm',
      submenu: [
        { role: 'reload', label: 'Yeniden yükle' },
        { role: 'toggleDevTools', label: 'Geliştirici araçları' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Yakınlaştırmayı sıfırla' },
        { role: 'zoomIn', label: 'Yakınlaştır' },
        { role: 'zoomOut', label: 'Uzaklaştır' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Tam ekran' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 620,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#131218' : '#f4f3f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Güvenlik sınırı burada tanımlanıyor: renderer'da Node yok, ayrı bağlamda
      // çalışıyor ve sandbox açık. Tek geçiş yolu preload'daki sözleşme.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Uygulama içinde harici bağlantı açılmasın; sistem tarayıcısına yönlendir.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL ?? 'file://')) {
      event.preventDefault();
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

app.on('ready', () => {
  applyContentSecurityPolicy();
  buildMenu();
  registerIpcHandlers();

  nativeTheme.themeSource = store.getSettings().theme;
  autopull.reconcileSchedules();

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  autopull.stopAll();
  void stopWatching();
});
