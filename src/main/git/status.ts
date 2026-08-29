import fs from 'node:fs';
import path from 'node:path';
import { run } from './client';
import { parseUnifiedDiff } from './diff';
import { parsePorcelainV2 } from './parse';
import type { FileDiff, RepoOperation, WorkingTreeStatus } from '@shared/types';

/**
 * `--porcelain=v2 -z` çıktısını ayrıştırır.
 *
 * v1 yerine v2: dal, upstream ve ahead/behind bilgisini aynı komutta veriyor,
 * yeniden adlandırmaları ayrı bir kayıt tipiyle işaretliyor ve alan sırası
 * sürümler arası sabit. `-z` ise boşluklu veya tırnaklı dosya adlarının
 * kaçış karakterlerine dönüşmesini engelliyor.
 */

/** Yarım kalmış merge/rebase gibi işlemleri .git dizinindeki işaret dosyalarından okur. */
export function detectOperation(gitDir: string): RepoOperation {
  const exists = (name: string) => fs.existsSync(path.join(gitDir, name));
  if (exists('rebase-merge') || exists('rebase-apply')) return 'rebase';
  if (exists('MERGE_HEAD')) return 'merge';
  if (exists('CHERRY_PICK_HEAD')) return 'cherry-pick';
  if (exists('REVERT_HEAD')) return 'revert';
  if (exists('BISECT_LOG')) return 'bisect';
  return 'none';
}

export async function getStatus(repoId: string, repoPath: string): Promise<WorkingTreeStatus> {
  const { stdout } = await run({
    repoId,
    repoPath,
    args: ['status', '--porcelain=v2', '--branch', '--untracked-files=all', '-z'],
    skipQueue: true,
  });
  const status = parsePorcelainV2(stdout);
  status.operation = detectOperation(path.join(repoPath, '.git'));
  return status;
}

export async function stage(repoId: string, repoPath: string, paths: string[]): Promise<void> {
  // `--` ayırıcısı, tire ile başlayan dosya adlarının seçenek sanılmasını engeller.
  await run({ repoId, repoPath, args: ['add', '--', ...paths] });
}

export async function unstage(repoId: string, repoPath: string, paths: string[]): Promise<void> {
  // İlk commit'i olmayan depoda HEAD yok; `reset` yerine `rm --cached` gerekiyor.
  const hasHead = await run({
    repoId,
    repoPath,
    args: ['rev-parse', '--verify', 'HEAD'],
    skipQueue: true,
    allowFailure: true,
  });
  if (hasHead.ok) {
    await run({ repoId, repoPath, args: ['restore', '--staged', '--', ...paths] });
  } else {
    await run({ repoId, repoPath, args: ['rm', '--cached', '-r', '--', ...paths] });
  }
}

/**
 * Değişiklikleri geri alır. Takip edilmeyen dosyalar `restore` ile silinmediği
 * için onları ayrıca diskten kaldırmak gerekiyor — arayüz bu işlemi onay
 * kutusunun arkasında tutuyor, çünkü geri dönüşü yok.
 */
export async function discard(repoId: string, repoPath: string, paths: string[]): Promise<void> {
  const status = await getStatus(repoId, repoPath);
  const untracked = new Set(
    status.unstaged.filter((f) => f.kind === 'untracked').map((f) => f.path),
  );
  const tracked = paths.filter((p) => !untracked.has(p));
  const toDelete = paths.filter((p) => untracked.has(p));

  if (tracked.length > 0) {
    await run({ repoId, repoPath, args: ['restore', '--staged', '--worktree', '--', ...tracked] });
  }
  for (const relative of toDelete) {
    // Depo dışına çıkan bir yol gelirse silmeyi reddet.
    const absolute = path.resolve(repoPath, relative);
    if (!absolute.startsWith(path.resolve(repoPath) + path.sep)) continue;
    await fs.promises.rm(absolute, { recursive: true, force: true });
  }
}

export async function getFileDiff(
  repoId: string,
  repoPath: string,
  filePath: string,
  staged: boolean,
): Promise<FileDiff> {
  const args = ['diff', '--no-color', '--no-ext-diff', '-U3'];
  if (staged) args.push('--cached');
  args.push('--', filePath);

  const { stdout } = await run({ repoId, repoPath, args, skipQueue: true });
  if (stdout.trim().length > 0) return parseUnifiedDiff(stdout, filePath);

  // Takip edilmeyen dosyanın diff'i yoktur; git'e onu varmış gibi göstertiyoruz.
  const untracked = await run({
    repoId,
    repoPath,
    args: ['diff', '--no-color', '--no-index', '-U3', '--', '/dev/null', filePath],
    skipQueue: true,
    allowFailure: true,
  });
  if (untracked.stdout.trim().length > 0) return parseUnifiedDiff(untracked.stdout, filePath);
  return parseUnifiedDiff('', filePath);
}

export async function commit(
  repoId: string,
  repoPath: string,
  subject: string,
  body: string | undefined,
  amend: boolean,
): Promise<{ sha: string }> {
  const args = ['commit', '-m', subject];
  if (body && body.trim().length > 0) args.push('-m', body);
  if (amend) args.push('--amend');
  await run({ repoId, repoPath, args });
  const { stdout } = await run({
    repoId,
    repoPath,
    args: ['rev-parse', 'HEAD'],
    skipQueue: true,
  });
  return { sha: stdout.trim() };
}

export async function getLastCommitMessage(
  repoId: string,
  repoPath: string,
): Promise<{ subject: string; body: string }> {
  const result = await run({
    repoId,
    repoPath,
    args: ['log', '-1', '--format=%s%x1f%b'],
    skipQueue: true,
    allowFailure: true,
  });
  if (!result.ok) return { subject: '', body: '' };
  const [subject = '', body = ''] = result.stdout.split('\x1f');
  return { subject: subject.trim(), body: body.trim() };
}
