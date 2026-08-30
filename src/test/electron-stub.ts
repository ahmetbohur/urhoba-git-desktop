/**
 * Testlerde `electron` modülünün yerine geçer.
 *
 * Git katmanı yalnızca olay yayınlamak için Electron'a dokunuyor; testlerde
 * pencere olmadığı için yayınlanacak bir yer de yok. Bu sayede git modüllerini
 * gerçek depolara karşı, Electron çalıştırmadan test edebiliyoruz.
 */

export const BrowserWindow = {
  getAllWindows: () => [] as Array<{ isDestroyed: () => boolean; webContents: { send: () => void } }>,
};

/**
 * `app` nesnesi bilerek değiştirilebilir: otomatik başlatma testleri kurulu
 * uygulama ile geliştirme ortamını ayırt etmek için `isPackaged` değerini
 * değiştirmek zorunda.
 */
export const app = {
  getPath: (name?: string) => (name === 'exe' ? '/opt/urhoba/urhoba-git-desktop' : '/tmp/urhoba-test'),
  isPackaged: false,
  getLoginItemSettings: () => ({ openAtLogin: false }),
  setLoginItemSettings: () => undefined,
};

export const dialog = {
  showOpenDialog: async () => ({ canceled: true, filePaths: [] as string[] }),
};

export const shell = { openPath: async () => '' };
export const clipboard = { writeText: () => undefined };
export const ipcMain = { handle: () => undefined };
export const nativeTheme = { themeSource: 'system' };
export const Menu = { setApplicationMenu: () => undefined, buildFromTemplate: () => undefined };
export const session = { defaultSession: { webRequest: { onHeadersReceived: () => undefined } } };
