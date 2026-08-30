import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from './client';
import { getStatus } from './status';
import { buildTodo, validateSteps } from './rebase-todo';
import type { MergeResult, RebaseStep, RepoOperation } from '@shared/types';

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

/**
 * Bir commit'i geçerli dala uygular.
 *
 * Çakışma burada da hata değil beklenen bir sonuç: aynı satırlara dokunan iki
 * dal arasında commit taşımak sık sık çakışır ve kullanıcı bunu çözebilir.
 * Yarım kalan cherry-pick'i "devam et / iptal et" şeridi zaten yönetiyor.
 */
export async function cherryPick(
  repoId: string,
  repoPath: string,
  sha: string,
): Promise<MergeResult> {
  const result = await run({
    repoId,
    repoPath,
    // `-x`: mesaja "(cherry picked from commit …)" satırı ekliyor. Bir commit'in
    // iki dalda ayrı sha ile durması ileride kafa karıştırıyor; izini bırakmak
    // sonradan "bu nereden geldi" sorusunu cevaplıyor.
    args: ['cherry-pick', '-x', sha],
    allowFailure: true,
  });
  return finish(
    repoId,
    repoPath,
    result.ok,
    result.stderr,
    result.stdout,
    `${sha.slice(0, 8)} bu dala uygulandı.`,
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

  /*
   * Commit atıldıktan sonra işlem çoğu zaman kendiliğinden kapanıyor: tek
   * commit'lik bir cherry-pick ya da revert'te `--continue` çalıştırmak
   * "devam eden işlem yok" hatası veriyor. Bu yüzden önce duruma bakıp
   * gerçekten sırada bir şey kalmışsa devam ediyoruz — rebase'de birden çok
   * commit sıraya girdiği için kalıyor.
   */
  const afterCommit = await getStatus(repoId, repoPath);
  if (afterCommit.operation === 'none') {
    return finish(repoId, repoPath, true, '', '', 'İşlem tamamlandı.');
  }

  const command = afterCommit.operation === 'rebase' ? 'rebase' : afterCommit.operation;
  const result = await run({
    repoId,
    repoPath,
    args: [command, '--continue'],
    allowFailure: true,
  });
  return finish(repoId, repoPath, result.ok, result.stderr, result.stdout, 'İşlem tamamlandı.');
}

/**
 * Etkileşimli rebase.
 *
 * Git todo listesini bir dosyaya yazıp `GIT_SEQUENCE_EDITOR` ile editörü
 * açıyor. Editör yerine listeyi olduğu gibi kopyalayan küçük bir betik
 * veriyoruz: kullanıcı arayüzde ne seçtiyse git de onu görüyor, arada bir
 * metin editörü açılmıyor.
 *
 * Betik dosya olarak yazılıyor çünkü `GIT_SEQUENCE_EDITOR` bir kabuk komutu
 * olarak çalıştırılıyor ve yollarda boşluk olabiliyor; tırnaklamayı betiğin
 * içinde bir kez doğru yapmak, ortam değişkeninde kaçış dizisiyle uğraşmaktan
 * daha güvenilir.
 *
 * Mesaj düzenleyen adımlar (`reword`) desteklenmiyor: git o adımda ayrıca
 * commit mesajı editörünü açıyor ve hangi commit için açtığını dışarıdan
 * anlamak güvenilir değil. Yanlış commit'e yanlış mesaj yazmaktansa bu adımı
 * hiç sunmuyoruz; son commit'in mesajı zaten "düzelt" ile değiştirilebiliyor.
 */
export async function interactiveRebase(
  repoId: string,
  repoPath: string,
  baseSha: string,
  steps: RebaseStep[],
): Promise<MergeResult> {
  const problem = validateSteps(steps);
  if (problem) throw new Error(problem);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-rebase-'));
  const todoPath = path.join(directory, 'todo');
  const isWindows = process.platform === 'win32';
  const scriptPath = path.join(directory, isWindows ? 'editor.bat' : 'editor.sh');

  fs.writeFileSync(todoPath, buildTodo(steps), 'utf8');
  if (isWindows) {
    fs.writeFileSync(scriptPath, `@echo off\r\ncopy /y "${todoPath}" %1 >nul\r\n`, 'utf8');
  } else {
    fs.writeFileSync(scriptPath, `#!/bin/sh\ncat "${todoPath}" > "$1"\n`, 'utf8');
    fs.chmodSync(scriptPath, 0o755);
  }

  try {
    const result = await run({
      repoId,
      repoPath,
      args: ['rebase', '--interactive', baseSha],
      allowFailure: true,
      env: { GIT_SEQUENCE_EDITOR: scriptPath },
    });

    // Çakışma çıktığında rebase yarıda duruyor; sonucu mevcut işlem akışı
    // (devam et / iptal et) devralıyor.
    return finish(
      repoId,
      repoPath,
      result.ok,
      result.stderr,
      result.stdout,
      'Commit’ler yeniden düzenlendi.',
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
