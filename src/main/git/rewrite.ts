import { run } from './client';
import { getStatus } from './status';
import type { ResetMode, RevertResult } from '@shared/types';

/**
 * Geçmişi değiştiren işlemler.
 *
 * İkisi de arayüzde ayrı onaylar arkasında duruyor. `revert` geçmişi korur —
 * değişikliği geri alan yeni bir commit üretir, dolayısıyla paylaşılmış dallarda
 * güvenlidir. `reset` ise HEAD'i geriye taşır ve paylaşılmış bir dalda
 * yapıldığında karşı tarafta ayrılmış geçmiş bırakır; `hard` modu ayrıca
 * çalışma dizinini de siler.
 */
export async function revert(repoId: string, repoPath: string, sha: string): Promise<RevertResult> {
  const result = await run({
    repoId,
    repoPath,
    // `--no-edit`: commit mesajı için editör açılmasın, git'in ürettiği mesaj kullanılsın.
    args: ['revert', '--no-edit', sha],
    allowFailure: true,
  });

  // Merge sonucu gibi burada da çıkış koduna değil deponun durumuna bakıyoruz.
  const status = await getStatus(repoId, repoPath);
  if (status.conflicted.length > 0) {
    return {
      outcome: 'conflict',
      message: `${status.conflicted.length} dosyada çakışma var. Çözdükten sonra işleme devam et.`,
      conflictedPaths: status.conflicted.map((file) => file.path),
    };
  }
  if (!result.ok) {
    return {
      outcome: 'error',
      message: result.stderr.split('\n').find((line) => line.trim().length > 0) ?? 'Revert başarısız.',
      conflictedPaths: [],
    };
  }
  return { outcome: 'reverted', message: 'Commit geri alındı.', conflictedPaths: [] };
}

export async function reset(
  repoId: string,
  repoPath: string,
  sha: string,
  mode: ResetMode,
): Promise<void> {
  await run({ repoId, repoPath, args: ['reset', `--${mode}`, sha] });
}
