import { run } from './client';
import type { Stash } from '@shared/types';

const US = '\x1f';

/**
 * Stash yönetimi.
 *
 * `stash@{0}` gibi referansları arayüzden almak yerine sırayı sayı olarak
 * taşıyoruz: kullanıcı bir stash'i silince aradaki bütün referanslar kayıyor,
 * dolayısıyla her işlemden önce listeyi tazelemek zorundayız. Sayı, listedeki
 * konumu anlatan tek dürüst gösterim.
 */
export async function listStashes(repoId: string, repoPath: string): Promise<Stash[]> {
  const result = await run({
    repoId,
    repoPath,
    args: [
      'stash',
      'list',
      `--format=%gd${US}%H${US}%gs${US}%aI`,
    ],
    skipQueue: true,
    allowFailure: true,
  });
  if (!result.ok) return [];

  return result.stdout
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      const [, sha, subject, createdAt] = line.split(US);
      // "%gs" şöyle gelir: "WIP on main: 1a2b3c mesaj" ya da "On main: mesaj"
      const match = /^(?:WIP on|On) ([^:]+): (.*)$/.exec(subject ?? '');
      return {
        index,
        sha: sha ?? '',
        branch: match ? match[1] : null,
        message: match ? match[2] : (subject ?? ''),
        createdAt: createdAt ?? '',
      } satisfies Stash;
    });
}

export async function createStash(
  repoId: string,
  repoPath: string,
  message: string | undefined,
  includeUntracked: boolean,
): Promise<void> {
  const args = ['stash', 'push'];
  if (includeUntracked) args.push('--include-untracked');
  if (message && message.trim().length > 0) args.push('--message', message.trim());

  const result = await run({ repoId, repoPath, args, allowFailure: true });
  if (!result.ok) {
    throw new Error(result.stderr.split('\n')[0] || 'Stash oluşturulamadı.');
  }
  // Saklanacak bir şey yoksa git hata vermiyor, sadece bilgi yazıyor.
  if (result.stdout.includes('No local changes to save')) {
    throw new Error('Saklanacak bir değişiklik yok.');
  }
}

export async function applyStash(
  repoId: string,
  repoPath: string,
  index: number,
  pop: boolean,
): Promise<void> {
  await run({
    repoId,
    repoPath,
    args: ['stash', pop ? 'pop' : 'apply', `stash@{${index}}`],
  });
}

export async function dropStash(repoId: string, repoPath: string, index: number): Promise<void> {
  await run({ repoId, repoPath, args: ['stash', 'drop', `stash@{${index}}`] });
}
