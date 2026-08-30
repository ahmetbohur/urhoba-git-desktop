import { app, BrowserWindow, nativeTheme, session, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { registerIpcHandlers } from './ipc';
import { installCrashHandlers, log } from './services/logger';
import { buildMenu } from './services/menu';
import { initializeUpdates } from './services/updater';
import * as autopull from './services/autopull';
import * as store from './services/store';
import { stopWatching } from './services/watcher';

// Windows'ta kurulum/kaldırma sırasında kısayolları Squirrel yönetiyor.
if (started) {
  app.quit();
}

/**
 * Gömülü git'in yerini dugite'e bildirir.
 *
 * Uygulama kendi git'ini taşıyor: kullanıcının makinesinde git kurulu olmasa da
 * çalışıyor ve herkeste aynı sürüm çalıştığı için "bende oluyor sende olmuyor"
 * sınıfı hatalar ortadan kalkıyor.
 *
 * Yolu dugite'in kendi tahminine bırakmıyoruz. O tahmin kendi dosya konumuna
 * dayanıyor, oysa ana süreç kodu tek bir dosyaya derleniyor ve konum değişiyor.
 * Paketlenmiş uygulamada git `resources/git` altında, geliştirmede node_modules
 * içinde duruyor.
 */
function configureEmbeddedGit(): void {
  /*
   * Uygulamanın nasıl başlatıldığına göre git farklı yerlerde duruyor:
   * paketlenmiş uygulamada `resources/git`, `npm start` ile geliştirmede proje
   * kökündeki node_modules, uçtan uca testlerde ise derlenmiş ana süreç dosyası
   * doğrudan çağrıldığı için çalışma dizininde. Üçünü de sırayla deniyoruz —
   * tek bir yola bel bağlamak bu senaryolardan ikisini kırıyordu.
   */
  const candidates = [
    path.join(process.resourcesPath, 'git'),
    path.join(app.getAppPath(), 'node_modules', 'dugite', 'git'),
    path.join(process.cwd(), 'node_modules', 'dugite', 'git'),
  ];

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (found) {
    process.env.LOCAL_GIT_DIRECTORY = found;
    return;
  }
  // Bulunamazsa değişkeni ayarlamıyoruz: dugite kendi çözümüne düşsün, hata da
  // ilk git komutunda anlaşılır bir mesajla yüzeye çıksın.
  log('warn', 'Gömülü git bulunamadı, sistemdeki git denenecek', { candidates });
}

/**
 * Pencere ikonu.
 *
 * Windows ve macOS'ta ikon paketleyici tarafından ikili dosyaya gömülüyor, ama
 * Linux'ta gömülmüyor: pencereye açıkça verilmezse görev çubuğunda varsayılan
 * Electron ikonu çıkıyor. Gömülü git ile aynı üç senaryo burada da geçerli
 * olduğu için yollar aynı sırayla deneniyor.
 */
function windowIcon(): string | undefined {
  const candidates = [
    path.join(process.resourcesPath, 'icon.png'),
    path.join(app.getAppPath(), 'assets', 'icon.png'),
    path.join(process.cwd(), 'assets', 'icon.png'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
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

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    icon: windowIcon(),
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
  installCrashHandlers();
  configureEmbeddedGit();
  log('info', 'Uygulama başlatıldı', {
    version: app.getVersion(),
    electron: process.versions.electron,
    embeddedGit: process.env.LOCAL_GIT_DIRECTORY ?? 'sistem git',
  });
  applyContentSecurityPolicy();
  buildMenu(store.getSettings().language);
  registerIpcHandlers();

  nativeTheme.themeSource = store.getSettings().theme;
  autopull.reconcileSchedules();
  initializeUpdates();

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
