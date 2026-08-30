import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { log } from './logger';
import type { AutostartStatus } from '@shared/types';

/**
 * Sistem açılışında otomatik başlatma.
 *
 * Electron'un `setLoginItemSettings` API'si yalnızca macOS ve Windows'ta iş
 * görüyor; Linux'ta sessizce hiçbir şey yapmıyor. Linux'ta standart yol
 * `~/.config/autostart` altına bir `.desktop` dosyası bırakmak — masaüstü
 * ortamlarının hepsi (GNOME, KDE, XFCE) bu dizini okuyor.
 *
 * Durum ayar dosyamızda tutulmuyor, her seferinde işletim sisteminden okunuyor:
 * kullanıcı bu ayarı sistem ayarlarından da kapatabilir ve o zaman bizim
 * kaydımız gerçeği yansıtmaz.
 */

const DESKTOP_FILE_NAME = 'urhoba-git-desktop.desktop';

function autostartDirectory(): string {
  const base = process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), '.config');
  return path.join(base, 'autostart');
}

function desktopFilePath(): string {
  return path.join(autostartDirectory(), DESKTOP_FILE_NAME);
}

function desktopFileContents(): string {
  // `app.getPath('exe')` paketlenmiş uygulamanın çalıştırılabilir dosyasını verir.
  // Boşluk içeren yollar için tırnak şart.
  const executable = app.getPath('exe');
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Urhoba Git Desktop',
    'Comment=Depolarını tek pencereden takip eden masaüstü Git istemcisi',
    `Exec="${executable}"`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
}

export function getStatus(): AutostartStatus {
  /*
   * Paketlenmemiş uygulamada otomatik başlatma anlamsız: kaydedilecek yol
   * geliştirme çalıştırıcısına işaret eder ve bir sonraki derlemede kırılır.
   * Arayüz bu durumu sebebiyle birlikte gösteriyor.
   */
  if (!app.isPackaged) {
    return {
      supported: false,
      enabled: false,
      reason: 'Otomatik başlatma yalnızca kurulu uygulamada çalışır.',
    };
  }

  if (process.platform === 'linux') {
    return { supported: true, enabled: fs.existsSync(desktopFilePath()) };
  }

  return { supported: true, enabled: app.getLoginItemSettings().openAtLogin };
}

export function setEnabled(enabled: boolean): AutostartStatus {
  const status = getStatus();
  if (!status.supported) return status;

  try {
    if (process.platform === 'linux') {
      if (enabled) {
        fs.mkdirSync(autostartDirectory(), { recursive: true });
        fs.writeFileSync(desktopFilePath(), desktopFileContents(), 'utf8');
      } else {
        fs.rmSync(desktopFilePath(), { force: true });
      }
    } else {
      app.setLoginItemSettings({ openAtLogin: enabled });
    }
  } catch (error) {
    log('warn', 'Otomatik başlatma ayarlanamadı', error);
    return { ...getStatus(), reason: 'Ayar yazılamadı; dosya izinlerini kontrol et.' };
  }

  return getStatus();
}
