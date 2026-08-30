import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { log } from './logger';

/**
 * Otomatik güncelleme.
 *
 * Yalnızca paketlenmiş uygulamada ve bir yayın kaynağı tanımlıysa devreye
 * giriyor. Kaynak tanımlı değilken sessizce atlanıyor: yayına çıkmamış bir
 * uygulamada güncelleme aramak, kullanıcıya açıklayamayacağımız ağ hataları
 * göstermekten başka bir işe yaramaz.
 *
 * Yayın kaynağı `package.json` içindeki `repository` alanından okunuyor; farklı
 * bir sunucu kullanılacaksa `URHOBA_UPDATE_FEED` ortam değişkeniyle geçilebilir.
 */
export function initializeUpdates(): void {
  if (!app.isPackaged) return;

  const feedUrl = process.env.URHOBA_UPDATE_FEED?.trim();
  const repository = getRepositoryUrl();
  if (!feedUrl && !repository) {
    log('info', 'Güncelleme kaynağı tanımlı değil; otomatik güncelleme kapalı');
    return;
  }

  void import('update-electron-app')
    .then(({ updateElectronApp, UpdateSourceType }) => {
      const logger = {
        log: (message: string) => log('info', `[güncelleme] ${message}`),
        info: (message: string) => log('info', `[güncelleme] ${message}`),
        warn: (message: string) => log('warn', `[güncelleme] ${message}`),
        error: (message: string) => log('error', `[güncelleme] ${message}`),
      };

      if (feedUrl) {
        updateElectronApp({
          updateSource: { type: UpdateSourceType.StaticStorage, baseUrl: feedUrl },
          // Saatte bir kontrol; daha sık aramak kullanıcıya bir şey kazandırmıyor.
          updateInterval: '1 hour',
          logger,
        });
        return;
      }

      // Kaynak verilmediğinde paket, package.json'daki depoyu kullanıyor.
      updateElectronApp({ updateInterval: '1 hour', logger });
    })
    .catch((error) => log('warn', 'Otomatik güncelleme başlatılamadı', error));
}

function getRepositoryUrl(): string | null {
  try {
    // Paketlenmiş uygulamada package.json asar arşivinin içinde; Electron'un
    // fs katmanı asar yollarını şeffaf şekilde okuyabiliyor.
    const manifestPath = path.join(app.getAppPath(), 'package.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      repository?: string | { url?: string };
    };
    const repository = manifest.repository;
    if (!repository) return null;
    return typeof repository === 'string' ? repository : (repository.url ?? null);
  } catch {
    return null;
  }
}
