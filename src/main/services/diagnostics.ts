import { app, shell } from 'electron';
import path from 'node:path';
import { getGitVersion } from '../git/client';
import { getLogPath } from './logger';
import type { Diagnostics } from '@shared/types';

/**
 * Tanılama bilgisi.
 *
 * Bir sorun bildirilirken ilk sorulan şeyler: hangi sürüm, hangi git, ayarlar
 * nerede. Bunları kullanıcıya kopyalanabilir bir blok hâlinde vermek, karşılıklı
 * soru-cevabı tek adıma indiriyor.
 */
export async function collect(): Promise<Diagnostics> {
  const embeddedGitDirectory = process.env.LOCAL_GIT_DIRECTORY ?? null;
  return {
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    platform: `${process.platform} ${process.arch}`,
    gitVersion: await getGitVersion(),
    // Gömülü git kullanılıyorsa yolu dolu gelir; boşsa sistemdeki git devrede.
    embeddedGitDirectory,
    usesEmbeddedGit: embeddedGitDirectory !== null,
    userDataPath: app.getPath('userData'),
    logPath: getLogPath(),
  };
}

export async function openLogFolder(): Promise<void> {
  await shell.openPath(path.dirname(getLogPath()));
}
