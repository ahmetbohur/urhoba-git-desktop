import { run } from './client';
import type { Worktree } from '@shared/types';

/**
 * Çalışma ağaçları (worktree).
 *
 * Bir depo aynı anda birden fazla klasörde açık olabiliyor ve her biri ayrı
 * bir dalda duruyor. Uygulama bunu bilmediğinde iki sorun çıkıyordu: başka
 * ağaçta açık bir dala geçmeye çalışınca git anlaşılmaz bir hata veriyor, ve
 * kullanıcı diğer ağaçların var olduğunu hiç görmüyor.
 */

/**
 * `git worktree list --porcelain` çıktısı boş satırla ayrılmış bloklar hâlinde:
 *
 *     worktree /yol
 *     HEAD <sha>
 *     branch refs/heads/main
 *
 * Ayrık HEAD'de `branch` satırı yerine `detached` geliyor.
 */
export function parseWorktrees(raw: string): Worktree[] {
  return raw
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.startsWith('worktree '))
    .map((block) => {
      const lines = block.split('\n');
      const value = (prefix: string) =>
        lines.find((line) => line.startsWith(`${prefix} `))?.slice(prefix.length + 1) ?? '';
      const branch = value('branch');
      return {
        path: value('worktree'),
        sha: value('HEAD'),
        branch: branch ? branch.replace('refs/heads/', '') : null,
        isMain: false,
        locked: lines.includes('locked') || lines.some((line) => line.startsWith('locked ')),
      };
    })
    .map((entry, index) => ({
      // İlk blok her zaman ana çalışma ağacı; git onu başa koyuyor.
      ...entry,
      isMain: index === 0,
    }));
}

export async function listWorktrees(repoId: string, repoPath: string): Promise<Worktree[]> {
  const { stdout } = await run({
    repoId,
    repoPath,
    args: ['worktree', 'list', '--porcelain'],
    skipQueue: true,
    allowFailure: true,
  });
  return parseWorktrees(stdout);
}
