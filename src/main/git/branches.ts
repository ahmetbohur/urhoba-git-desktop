import { run } from './client';
import { REF_FORMAT, parseRefLines } from './parse';
import type { BranchList, CheckoutResult } from '@shared/types';

export async function getBranches(repoId: string, repoPath: string): Promise<BranchList> {
  const result = await run({
    repoId,
    repoPath,
    args: ['for-each-ref', `--format=${REF_FORMAT}`, 'refs/heads', 'refs/remotes'],
    skipQueue: true,
    allowFailure: true,
  });
  if (!result.ok) return { current: null, local: [], remote: [] };
  return parseRefLines(result.stdout);
}

export async function createBranch(
  repoId: string,
  repoPath: string,
  name: string,
  from: string | undefined,
  checkout: boolean,
): Promise<void> {
  if (checkout) {
    const args = ['checkout', '-b', name];
    if (from) args.push(from);
    await run({ repoId, repoPath, args });
    return;
  }
  const args = ['branch', name];
  if (from) args.push(from);
  await run({ repoId, repoPath, args });
}

/**
 * `checkout` engellendiğinde git etkilenen dosyaları stderr'de listeler:
 *
 *     error: Your local changes to the following files would be overwritten...
 *     \tsrc/app.ts
 *     Please commit your changes or stash them before you switch branches.
 */
function overwrittenPaths(stderr: string): string[] {
  const lines = stderr.split('\n');
  const start = lines.findIndex((line) => line.includes('would be overwritten'));
  if (start === -1) return [];

  const paths: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith('\t')) break;
    paths.push(line.trim());
  }
  return paths;
}

/**
 * Dal değiştirir.
 *
 * Kirli çalışma dizinini önceden kontrol etmek yerine git'in kararına
 * güveniyoruz: hangi değişikliğin gerçekten üzerine yazılacağını en doğru o
 * biliyor (aynı dosya iki dalda aynıysa checkout sorunsuz geçer). Bizim işimiz
 * hatayı, kullanıcının ne yapabileceğini söyleyen bir sonuca çevirmek.
 */
export async function checkout(
  repoId: string,
  repoPath: string,
  name: string,
): Promise<CheckoutResult> {
  // Uzak dala geçerken aynı adla yerel bir izleme dalı kurulur; `git checkout`
  // bunu kendiliğinden yapıyor, ayrıca ele almaya gerek yok.
  const result = await run({ repoId, repoPath, args: ['checkout', name], allowFailure: true });
  if (result.ok) {
    return { outcome: 'switched', message: `${name} dalına geçildi.`, blockingPaths: [] };
  }

  const blockingPaths = overwrittenPaths(result.stderr);
  if (blockingPaths.length > 0) {
    return {
      outcome: 'blocked-dirty',
      message:
        'Kaydedilmemiş değişikliklerin üzerine yazılacağı için geçiş yapılmadı. Değişiklikleri commit’le ya da stash’le.',
      blockingPaths,
    };
  }

  return {
    outcome: 'error',
    message: result.stderr.split('\n').find((line) => line.trim().length > 0) ?? 'Dal değiştirilemedi.',
    blockingPaths: [],
  };
}

/**
 * Dal siler. `force` olmadan git birleştirilmemiş dalı silmeyi reddeder;
 * bu koruma bilerek korunuyor, arayüz zorlamayı ayrı bir onayla istiyor.
 */
export async function deleteBranch(
  repoId: string,
  repoPath: string,
  name: string,
  force: boolean,
): Promise<void> {
  await run({ repoId, repoPath, args: ['branch', force ? '-D' : '-d', name] });
}
