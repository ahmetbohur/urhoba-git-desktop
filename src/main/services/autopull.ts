import { pull } from '../git/remote';
import { emitAppEvent } from './events';
import * as store from './store';
import type { AutoPullResult, PullResult } from '@shared/types';

/**
 * Otomatik pull zamanlayıcısı.
 *
 * Her deponun kendi aralığı olduğu için tek bir genel zamanlayıcı yerine depo
 * başına timer tutuyoruz. Güvenlik varsayılanları bilinçli olarak muhafazakâr:
 * çalışma dizini kirliyse dokunma, geçmişler ayrılmışsa birleştirme — arka planda
 * sessizce merge commit'i üretmek, kullanıcının sonradan anlamlandıramayacağı bir
 * geçmiş bırakır.
 *
 * Bir depoda pull çalışırken aynı depo için ikinci bir tur başlamaz; git komut
 * sırası zaten seri çalıştırır ama sırayı gereksiz işle doldurmanın anlamı yok.
 */

interface Scheduled {
  timer: NodeJS.Timeout;
  running: boolean;
}

const scheduled = new Map<string, Scheduled>();

async function runOnce(repoId: string): Promise<PullResult> {
  const repo = store.findRepo(repoId);
  if (!repo) {
    return { outcome: 'error', message: 'Depo bulunamadı.', commitsPulled: 0 };
  }
  const settings = store.getRepoSettings(repoId);

  const result = await pull(repoId, repo.path, {
    fastForwardOnly: settings.autoPull.fastForwardOnly,
    requireClean: settings.autoPull.onlyWhenClean,
  });

  const enriched: AutoPullResult = { ...result, repoId, at: new Date().toISOString() };
  emitAppEvent({ type: 'autopull:result', result: enriched });
  if (result.commitsPulled > 0) {
    emitAppEvent({ type: 'repo:changed', repoId });
  }
  return result;
}

/** Kullanıcı "şimdi çek" dediğinde zamanlayıcıdan bağımsız çalışır. */
export async function pullNow(repoId: string): Promise<PullResult> {
  const entry = scheduled.get(repoId);
  if (entry?.running) {
    return { outcome: 'skipped-operation-in-progress', message: 'Zaten çekiliyor.', commitsPulled: 0 };
  }
  if (entry) entry.running = true;
  try {
    return await runOnce(repoId);
  } finally {
    if (entry) entry.running = false;
  }
}

function schedule(repoId: string, intervalMinutes: number): void {
  clearFor(repoId);
  const entry: Scheduled = {
    running: false,
    timer: setInterval(
      () => {
        if (entry.running) return;
        entry.running = true;
        void runOnce(repoId).finally(() => {
          entry.running = false;
        });
      },
      Math.max(1, intervalMinutes) * 60_000,
    ),
  };
  scheduled.set(repoId, entry);
}

function clearFor(repoId: string): void {
  const entry = scheduled.get(repoId);
  if (entry) {
    clearInterval(entry.timer);
    scheduled.delete(repoId);
  }
}

/**
 * Ayarlar her değiştiğinde çağrılır: kayıtlı bütün depoları gezip
 * zamanlayıcıları güncel ayara göre yeniden kurar.
 */
export function reconcileSchedules(): void {
  const active = new Set<string>();
  for (const { repo, settings } of store.getAllRepoSettings()) {
    if (!settings.autoPull.enabled) continue;
    active.add(repo.id);
    schedule(repo.id, settings.autoPull.intervalMinutes);
  }
  for (const repoId of [...scheduled.keys()]) {
    if (!active.has(repoId)) clearFor(repoId);
  }
}

export function stopAll(): void {
  for (const repoId of [...scheduled.keys()]) clearFor(repoId);
}
