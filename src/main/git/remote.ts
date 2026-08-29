import { run } from './client';
import { getStatus } from './status';
import type { FetchResult, PullResult, PushResult, Remote } from '@shared/types';

export async function getRemotes(repoId: string, repoPath: string): Promise<Remote[]> {
  const result = await run({
    repoId,
    repoPath,
    args: ['remote', '-v'],
    skipQueue: true,
    allowFailure: true,
  });
  if (!result.ok) return [];

  const map = new Map<string, Remote>();
  for (const line of result.stdout.split('\n')) {
    // "origin\tgit@github.com:kullanici/depo.git (fetch)"
    const match = /^(\S+)\t(\S+)\s+\((fetch|push)\)$/.exec(line.trim());
    if (!match) continue;
    const [, name, url, kind] = match;
    const existing = map.get(name) ?? { name, fetchUrl: '', pushUrl: '' };
    if (kind === 'fetch') existing.fetchUrl = url;
    else existing.pushUrl = url;
    map.set(name, existing);
  }
  return [...map.values()];
}

export async function fetch(repoId: string, repoPath: string): Promise<FetchResult> {
  const before = await getStatus(repoId, repoPath);
  await run({ repoId, repoPath, args: ['fetch', '--prune', '--all'] });
  const after = await getStatus(repoId, repoPath);

  return {
    ahead: after.ahead,
    behind: after.behind,
    updatedRefs: after.behind > before.behind && after.upstream ? [after.upstream] : [],
  };
}

interface PullOptions {
  /** Sadece fast-forward; geçmişler ayrılmışsa birleştirme yapma. */
  fastForwardOnly: boolean;
  /** Çalışma dizini kirliyse hiç deneme (otomatik pull için varsayılan). */
  requireClean: boolean;
}

/**
 * Pull akışı.
 *
 * Otomatik pull ile elle pull aynı fonksiyonu kullanıyor; fark yalnızca
 * `fastForwardOnly` ve `requireClean` bayraklarında. Sonucu istisna yerine
 * `outcome` alanıyla döndürüyoruz, çünkü "atlandı" durumları hata değil:
 * arka planda saatte altı kez çalışan bir işin her seferinde hata kutusu
 * açması kullanıcıyı bezdirir.
 */
export async function pull(
  repoId: string,
  repoPath: string,
  options: PullOptions,
): Promise<PullResult> {
  const status = await getStatus(repoId, repoPath);

  if (status.operation !== 'none') {
    return {
      outcome: 'skipped-operation-in-progress',
      message: `Depoda yarım kalmış bir ${status.operation} işlemi var; pull atlandı.`,
      commitsPulled: 0,
    };
  }
  if (!status.upstream) {
    return {
      outcome: 'skipped-no-upstream',
      message: 'Bu dalın bir upstream’i yok; önce push ederek bağla.',
      commitsPulled: 0,
    };
  }

  const isDirty =
    status.staged.length > 0 || status.unstaged.length > 0 || status.conflicted.length > 0;
  if (options.requireClean && isDirty) {
    return {
      outcome: 'skipped-dirty',
      message: 'Çalışma dizininde kaydedilmemiş değişiklikler var; otomatik pull atlandı.',
      commitsPulled: 0,
    };
  }

  await run({ repoId, repoPath, args: ['fetch', '--prune'], allowFailure: true });
  const afterFetch = await getStatus(repoId, repoPath);

  if (afterFetch.behind === 0) {
    return { outcome: 'up-to-date', message: 'Zaten güncel.', commitsPulled: 0 };
  }

  const diverged = afterFetch.ahead > 0 && afterFetch.behind > 0;
  if (diverged && options.fastForwardOnly) {
    return {
      outcome: 'skipped-diverged',
      message: `Yerel dal ${afterFetch.ahead} commit ileride, uzak dal ${afterFetch.behind} commit ileride. Fast-forward mümkün değil; birleştirmeyi sen yapmalısın.`,
      commitsPulled: 0,
    };
  }

  // `--no-edit`: birleştirme commit'i gerektiğinde git editör açmaya çalışmasın,
  // varsayılan mesajla devam etsin.
  const args = ['pull', '--no-rebase', '--no-edit'];
  if (options.fastForwardOnly || !diverged) args.push('--ff-only');
  const result = await run({ repoId, repoPath, args, allowFailure: true });

  if (!result.ok) {
    const stderr = result.stderr.toLowerCase();
    if (stderr.includes('conflict')) {
      return {
        outcome: 'conflict',
        message: 'Birleştirme çakışması oluştu. Çakışan dosyaları çözmen gerekiyor.',
        commitsPulled: 0,
      };
    }
    return { outcome: 'error', message: result.stderr.split('\n')[0], commitsPulled: 0 };
  }

  const final = await getStatus(repoId, repoPath);
  return {
    outcome: diverged ? 'merged' : 'fast-forwarded',
    message: diverged
      ? `${afterFetch.behind} commit birleştirildi.`
      : `${afterFetch.behind} commit alındı.`,
    commitsPulled: afterFetch.behind - final.behind,
  };
}

export async function addRemote(
  repoId: string,
  repoPath: string,
  name: string,
  url: string,
): Promise<void> {
  await run({ repoId, repoPath, args: ['remote', 'add', name, url] });
}

export async function removeRemote(repoId: string, repoPath: string, name: string): Promise<void> {
  await run({ repoId, repoPath, args: ['remote', 'remove', name] });
}

export async function setRemoteUrl(
  repoId: string,
  repoPath: string,
  name: string,
  url: string,
): Promise<void> {
  await run({ repoId, repoPath, args: ['remote', 'set-url', name, url] });
}

export async function push(
  repoId: string,
  repoPath: string,
  setUpstream: boolean,
  forceWithLease = false,
): Promise<PushResult> {
  const status = await getStatus(repoId, repoPath);
  if (!status.branch) {
    return { ok: false, message: 'Ayrık HEAD durumunda push yapılamaz.', upstreamSet: false };
  }

  const needsUpstream = !status.upstream || setUpstream;
  const args = needsUpstream
    ? ['push', '--set-upstream', 'origin', status.branch]
    : ['push'];
  /*
   * Zorlamalı gönderimde her zaman `--force-with-lease`: git, uzak dalın bizim
   * en son gördüğümüz hâlde olduğunu doğruladıktan sonra yazıyor. Düz `--force`
   * araya giren bir meslektaşın commit'lerini sessizce siler; o bayrak bu
   * uygulamada hiç kullanılmıyor.
   */
  if (forceWithLease) args.push('--force-with-lease');

  const result = await run({ repoId, repoPath, args, allowFailure: true });
  if (!result.ok) {
    return { ok: false, message: result.stderr.split('\n')[0], upstreamSet: false };
  }
  return {
    ok: true,
    message: needsUpstream
      ? `${status.branch} dalı origin'e gönderildi ve upstream olarak bağlandı.`
      : forceWithLease
        ? 'Uzak dal zorlamalı olarak güncellendi.'
        : 'Değişiklikler gönderildi.',
    upstreamSet: needsUpstream,
  };
}
