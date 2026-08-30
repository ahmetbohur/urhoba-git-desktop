import { run } from './client';
import { REF_FORMAT, parseRefLines } from './parse';
import type { BranchList, BranchRenameResult, CheckoutResult } from '@shared/types';

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
 * Dalı yeniden adlandırır.
 *
 * Yerel yeniden adlandırma tek komut ama uzak dal kendiliğinden takip etmiyor:
 * sunucuda hâlâ eski ad duruyor ve yerel dalın upstream'i kopuyor. Bunu sessizce
 * geçmek yerine iki seçenek sunuyoruz — ya yalnızca yerelde adlandır ve durumu
 * söyle, ya da uzaktaki eski dalı silip yenisini gönder.
 *
 * Uzağa yansıtma ayrı bir onayla isteniyor çünkü geri dönüşü zor: başkası eski
 * dalı takip ediyorsa onun upstream'i de kopar.
 */
export async function renameBranch(
  repoId: string,
  repoPath: string,
  from: string,
  to: string,
  updateRemote: boolean,
): Promise<BranchRenameResult> {
  const renamed = await run({
    repoId,
    repoPath,
    args: ['branch', '--move', from, to],
    allowFailure: true,
  });
  if (!renamed.ok) {
    return {
      outcome: 'error',
      message:
        renamed.stderr.split('\n').find((line) => line.trim().length > 0) ??
        'Dal yeniden adlandırılamadı.',
      remoteUpdated: false,
    };
  }

  if (!updateRemote) {
    // Upstream varsa kullanıcı uzak dalın hâlâ eski adla durduğunu bilmeli.
    const status = await getStatusForBranch(repoId, repoPath, to);
    return {
      outcome: 'renamed',
      message: status.hasUpstream
        ? `${to} olarak adlandırıldı. Uzak sunucuda dal hâlâ ${from} adıyla duruyor.`
        : `${to} olarak adlandırıldı.`,
      remoteUpdated: false,
    };
  }

  // Önce yeniyi gönder: gönderim başarısız olursa uzakta hiç dal kalmasın.
  const pushed = await run({
    repoId,
    repoPath,
    args: ['push', '--set-upstream', 'origin', to],
    allowFailure: true,
  });
  if (!pushed.ok) {
    return {
      outcome: 'renamed',
      message: `Yerelde ${to} olarak adlandırıldı ama uzak sunucuya gönderilemedi: ${
        pushed.stderr.split('\n')[0]
      }`,
      remoteUpdated: false,
    };
  }

  const deleted = await run({
    repoId,
    repoPath,
    args: ['push', 'origin', '--delete', from],
    allowFailure: true,
  });

  return {
    outcome: 'renamed',
    message: deleted.ok
      ? `${to} olarak adlandırıldı ve uzak sunucuda güncellendi.`
      : `${to} olarak adlandırıldı ve gönderildi, ama uzaktaki ${from} silinemedi. Varsayılan dal olabilir; sunucu ayarlarından değiştirmen gerekir.`,
    remoteUpdated: deleted.ok,
  };
}

/** Yeniden adlandırma sonrası dalın upstream'i var mı. */
async function getStatusForBranch(
  repoId: string,
  repoPath: string,
  branch: string,
): Promise<{ hasUpstream: boolean }> {
  const result = await run({
    repoId,
    repoPath,
    args: ['rev-parse', '--abbrev-ref', `${branch}@{upstream}`],
    skipQueue: true,
    allowFailure: true,
  });
  return { hasUpstream: result.ok };
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
