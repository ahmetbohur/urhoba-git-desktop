import { watch, type FSWatcher } from 'chokidar';
import path from 'node:path';
import { emitAppEvent } from './events';

/**
 * Aktif deponun canlı takibi.
 *
 * Yalnızca ekranda açık olan depoyu izliyoruz: büyük bir çalışma ağacını sürekli
 * izlemek yüzlerce megabayt bellek ve sürekli disk trafiği demek. `.git/objects`
 * dışarıda, çünkü her fetch binlerce dosya üretir ve hiçbiri arayüzü ilgilendirmez;
 * buna karşılık `.git/HEAD`, `.git/index` ve `refs` izleniyor — dal değişimi ve
 * commit bunlardan anlaşılıyor.
 */

const DEBOUNCE_MS = 250;

let watcher: FSWatcher | null = null;
let watchedRepoId: string | null = null;
let debounceTimer: NodeJS.Timeout | null = null;

function scheduleNotification(repoId: string): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    emitAppEvent({ type: 'repo:changed', repoId });
  }, DEBOUNCE_MS);
}

export async function watchRepo(repoId: string, repoPath: string): Promise<void> {
  if (watchedRepoId === repoId) return;
  await stopWatching();

  watchedRepoId = repoId;
  watcher = watch(repoPath, {
    ignoreInitial: true,
    followSymlinks: false,
    // Aynı anda binlerce olay yerine kısa bir sessizlik bekle.
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
    ignored: (candidate: string) => {
      const relative = path.relative(repoPath, candidate);
      if (relative.startsWith('..')) return true;
      const segments = relative.split(path.sep);
      if (segments.includes('node_modules')) return true;
      if (segments[0] === '.git') {
        // .git içinde sadece durum değiştiren birkaç yolu izliyoruz.
        const inner = segments[1];
        return !(
          inner === undefined ||
          inner === 'HEAD' ||
          inner === 'index' ||
          inner === 'refs' ||
          inner === 'MERGE_HEAD' ||
          inner === 'CHERRY_PICK_HEAD' ||
          inner === 'REVERT_HEAD' ||
          inner === 'rebase-merge' ||
          inner === 'rebase-apply'
        );
      }
      return false;
    },
  });

  watcher.on('all', () => {
    if (watchedRepoId) scheduleNotification(watchedRepoId);
  });
  // İzleyicinin kendi hataları (izin reddi gibi) uygulamayı düşürmemeli.
  watcher.on('error', () => undefined);
}

export async function stopWatching(): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (watcher) {
    await watcher.close();
    watcher = null;
  }
  watchedRepoId = null;
}
