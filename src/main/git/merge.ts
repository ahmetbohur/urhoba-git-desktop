import { run } from './client';
import { getStatus } from './status';
import type { MergeResult, RepoOperation } from '@shared/types';

/**
 * Birleştirme, rebase ve yarım kalmış işlemlerin yönetimi.
 *
 * Çakışma bir hata değil, beklenen bir sonuç: git sıfır olmayan kodla çıkıyor
 * ama yapılması gereken şey kullanıcının dosyaları çözmesi. Bu yüzden sonucu
 * istisna yerine `outcome` ile döndürüyoruz; arayüz de çakışmayı kırmızı bir
 * hata kutusu yerine çözüm ekranı açarak karşılıyor.
 */

async function conflictedPaths(repoId: string, repoPath: string): Promise<string[]> {
  const status = await getStatus(repoId, repoPath);
  return status.conflicted.map((file) => file.path);
}

/**
 * Komutun çıkış kodu yerine deponun gerçek durumuna bakarak sonuç üretir.
 *
 * Çıkış koduna güvenemiyoruz: `git merge` çakışmada sıfır olmayan kodla çıksa da
 * kullandığımız istemci bunu her zaman hata olarak yüzeye çıkarmıyor. Çakışan
 * dosya listesi ise tek bir doğru cevap veriyor — diskte çakışma varsa çakışma
 * vardır, komutun ne dediğinden bağımsız.
 */
async function finish(
  repoId: string,
  repoPath: string,
  ok: boolean,
  stderr: string,
  stdout: string,
  successMessage: string,
): Promise<MergeResult> {
  const paths = await conflictedPaths(repoId, repoPath);
  if (paths.length > 0) {
    return {
      outcome: 'conflict',
      message: `${paths.length} dosyada çakışma var. Çözdükten sonra işleme devam edebilirsin.`,
      conflictedPaths: paths,
    };
  }

  if (ok) {
    if (stdout.includes('Already up to date')) {
      return { outcome: 'up-to-date', message: 'Zaten güncel.', conflictedPaths: [] };
    }
    return { outcome: 'merged', message: successMessage, conflictedPaths: [] };
  }

  return {
    outcome: 'error',
    message: stderr.split('\n').find((line) => line.trim().length > 0) ?? 'İşlem başarısız oldu.',
    conflictedPaths: [],
  };
}

export async function merge(repoId: string, repoPath: string, branch: string): Promise<MergeResult> {
  const result = await run({
    repoId,
    repoPath,
    // `--no-edit`: birleştirme mesajı için editör açılmasın, varsayılan kullanılsın.
    args: ['merge', '--no-edit', branch],
    allowFailure: true,
  });
  return finish(
    repoId,
    repoPath,
    result.ok,
    result.stderr,
    result.stdout,
    `${branch} dalı birleştirildi.`,
  );
}

export async function rebase(
  repoId: string,
  repoPath: string,
  branch: string,
): Promise<MergeResult> {
  const result = await run({
    repoId,
    repoPath,
    args: ['rebase', branch],
    allowFailure: true,
  });
  return finish(
    repoId,
    repoPath,
    result.ok,
    result.stderr,
    result.stdout,
    `${branch} üzerine yeniden dizildi.`,
  );
}

const ABORT_COMMANDS: Partial<Record<RepoOperation, string[]>> = {
  merge: ['merge', '--abort'],
  rebase: ['rebase', '--abort'],
  'cherry-pick': ['cherry-pick', '--abort'],
  revert: ['revert', '--abort'],
};

export async function abortOperation(repoId: string, repoPath: string): Promise<void> {
  const status = await getStatus(repoId, repoPath);
  const args = ABORT_COMMANDS[status.operation];
  if (!args) {
    throw new Error('İptal edilecek bir işlem yok.');
  }
  await run({ repoId, repoPath, args });
}

export async function continueOperation(repoId: string, repoPath: string): Promise<MergeResult> {
  const status = await getStatus(repoId, repoPath);
  if (status.operation === 'none') {
    return { outcome: 'error', message: 'Devam edilecek bir işlem yok.', conflictedPaths: [] };
  }
  if (status.conflicted.length > 0) {
    return {
      outcome: 'conflict',
      message: 'Hâlâ çözülmemiş çakışmalar var.',
      conflictedPaths: status.conflicted.map((file) => file.path),
    };
  }

  /*
   * Hem `merge --continue` hem `rebase --continue` commit üretirken editör
   * açmaya çalışıyor; editörü ortam değişkeni veya `core.editor` ile devre dışı
   * bırakmak ise istemcinin güvenlik kontrollerine takılıyor.
   *
   * Bunun yerine commit'i kendimiz `--no-edit` ile atıyoruz: git çakışma
   * sırasında commit mesajını zaten hazırlayıp bırakıyor (merge için MERGE_MSG,
   * rebase için rebase-merge/message), dolayısıyla mesaj kaybolmuyor. Rebase'de
   * commit atıldıktan sonra `--continue` yapacak bir şey kalmadığı için sessizce
   * sıradaki commit'e geçiyor.
   */
  if (status.staged.length > 0) {
    const committed = await run({
      repoId,
      repoPath,
      args: ['commit', '--no-edit'],
      allowFailure: true,
    });
    if (!committed.ok) {
      return finish(repoId, repoPath, false, committed.stderr, '', '');
    }
  }

  if (status.operation !== 'rebase') {
    return finish(repoId, repoPath, true, '', '', 'Birleştirme tamamlandı.');
  }

  const result = await run({
    repoId,
    repoPath,
    args: ['rebase', '--continue'],
    allowFailure: true,
  });
  return finish(repoId, repoPath, result.ok, result.stderr, result.stdout, 'Rebase tamamlandı.');
}
