import { periodStart, repoActivity } from '../git/activity';
import * as store from './store';
import type { ActivityPeriod, ActivitySummary, RepoActivity } from '@shared/types';

/**
 * Bütün depoların etkinlik özeti.
 *
 * Depo sayısı elliyi geçebiliyor ve her depo birkaç git çağrısı istiyor. Hepsini
 * birden başlatmak yüzlerce süreç açıyor ve makineyi kilitliyor; sırayla
 * çalıştırmak ise dakikalar sürüyor. Aradaki yol: sınırlı sayıda eşzamanlı iş.
 */

/** Aynı anda kaç depo işlensin. */
const CONCURRENCY = 8;

async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(runners);
  return results;
}

export async function collectActivity(period: ActivityPeriod): Promise<ActivitySummary> {
  return collectSince(periodStart(period, Date.now()), period);
}

/**
 * Belirli bir andan bugüne. Kendiliğinden çıkan özet bunu kullanıyor: uygulama
 * kapalıyken geçen süre atlanmamalı, o yüzden aralık "son özetten beri" oluyor.
 */
export async function collectSince(
  since: Date,
  period: ActivityPeriod,
): Promise<ActivitySummary> {
  const repos = store.getRepos();

  const collected = await mapWithLimit(repos, CONCURRENCY, async (repo) => {
    try {
      return await repoActivity(repo.id, repo.name, repo.path, since);
    } catch {
      /*
       * Silinmiş ya da bozulmuş bir depo bütün özeti düşürmemeli; o depo
       * boş görünür ve diğerleri gelmeye devam eder.
       */
      return {
        repoId: repo.id,
        repoName: repo.name,
        authored: [],
        arrived: [],
        hasRemote: false,
      } satisfies RepoActivity;
    }
  });

  // Boş depolar listede yer kaplamasın; özet "ne oldu" sorusuna cevap veriyor.
  const active = collected.filter(
    (entry) => entry.authored.length > 0 || entry.arrived.length > 0,
  );

  return {
    since: since.toISOString(),
    period,
    repos: active,
    authoredCount: active.reduce((sum, entry) => sum + entry.authored.length, 0),
    arrivedCount: active.reduce((sum, entry) => sum + entry.arrived.length, 0),
  };
}
