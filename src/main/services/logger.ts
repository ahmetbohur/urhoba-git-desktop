import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Dosya günlüğü.
 *
 * Bir masaüstü uygulamasında hata ayıklamanın en zor yanı, kullanıcının
 * yaşadığı sorunu geliştirici konsolu olmadan anlayabilmek. Bu günlük tam da
 * bunun için: uygulama açılışı, git komut hataları ve yakalanmamış istisnalar
 * diske yazılıyor, kullanıcı da dosyayı tek tıkla açıp paylaşabiliyor.
 *
 * Dosya sınırsız büyümesin diye belirli bir boyutu aşınca bir öncekinin üzerine
 * dönülüyor — iki dosya tutmak, son oturumun kaybolmamasını sağlıyor.
 */

const MAX_BYTES = 2 * 1024 * 1024;

let logPath: string | null = null;

function ensurePath(): string {
  if (logPath) return logPath;
  const directory = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(directory, { recursive: true });
  logPath = path.join(directory, 'urhoba.log');
  return logPath;
}

function rotateIfNeeded(file: string): void {
  try {
    const stats = fs.statSync(file);
    if (stats.size < MAX_BYTES) return;
    fs.renameSync(file, `${file}.1`);
  } catch {
    // Dosya yoksa döndürecek bir şey de yok.
  }
}

export function log(level: 'info' | 'warn' | 'error', message: string, detail?: unknown): void {
  try {
    const file = ensurePath();
    rotateIfNeeded(file);
    const detailText =
      detail === undefined
        ? ''
        : ` | ${detail instanceof Error ? (detail.stack ?? detail.message) : JSON.stringify(detail)}`;
    fs.appendFileSync(file, `${new Date().toISOString()} [${level}] ${message}${detailText}\n`);
  } catch {
    // Günlük yazamamak uygulamayı durdurmamalı.
  }
}

export function getLogPath(): string {
  return ensurePath();
}

/**
 * Yakalanmamış hataları da dosyaya düşürür.
 * Bunlar olmadan uygulama sessizce tuhaf davranır ve elimizde hiçbir iz kalmaz.
 */
export function installCrashHandlers(): void {
  process.on('uncaughtException', (error) => {
    log('error', 'Yakalanmamış istisna', error);
  });
  process.on('unhandledRejection', (reason) => {
    log('error', 'Ele alınmamış promise reddi', reason);
  });
}
