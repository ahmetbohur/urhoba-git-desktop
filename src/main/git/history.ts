import { run } from './client';
import { parseUnifiedDiff } from './diff';
import { LOG_FORMAT, parseLog, parseNameStatus, parseNumstat } from './parse';
import type { Commit, CommitDetail, FileDiff } from '@shared/types';

/**
 * Geçmiş okuma. Çıktı biçimleri ve ayrıştırma `parse.ts` içinde; burada yalnızca
 * hangi git komutunun hangi bayraklarla çalıştığı var.
 */

export async function getLog(
  repoId: string,
  repoPath: string,
  skip: number,
  limit: number,
  ref?: string,
): Promise<Commit[]> {
  const args = [
    'log',
    `--format=${LOG_FORMAT}`,
    '--decorate=full',
    `--skip=${skip}`,
    `--max-count=${limit}`,
  ];
  if (ref) args.push(ref);
  const result = await run({ repoId, repoPath, args, skipQueue: true, allowFailure: true });
  // Henüz commit'i olmayan depoda `git log` hata verir; boş geçmiş doğru cevap.
  if (!result.ok) return [];
  return parseLog(result.stdout);
}

export async function getCommitDetail(
  repoId: string,
  repoPath: string,
  sha: string,
): Promise<CommitDetail> {
  const meta = await run({
    repoId,
    repoPath,
    args: ['show', '-s', `--format=${LOG_FORMAT}`, '--decorate=full', sha],
    skipQueue: true,
  });
  const [commit] = parseLog(meta.stdout);
  if (!commit) throw new Error(`Commit bulunamadı: ${sha}`);

  // Merge commit'lerinde varsayılan `show` diff üretmez; ilk ebeveyne göre bakıyoruz.
  const diffArgs = ['show', '--format=', '-z', '--find-renames', '-m', '--first-parent', sha];
  const [nameStatus, numstat] = await Promise.all([
    run({ repoId, repoPath, args: [...diffArgs, '--name-status'], skipQueue: true, allowFailure: true }),
    run({ repoId, repoPath, args: [...diffArgs, '--numstat'], skipQueue: true, allowFailure: true }),
  ]);

  const files = parseNameStatus(nameStatus.stdout);
  const stats = parseNumstat(numstat.stdout);
  let additions = 0;
  let deletions = 0;
  for (const file of files) {
    const stat = stats.get(file.path);
    if (!stat) continue;
    file.isBinary = stat.isBinary;
    additions += stat.additions;
    deletions += stat.deletions;
  }

  return { ...commit, files, additions, deletions };
}

export async function getCommitFileDiff(
  repoId: string,
  repoPath: string,
  sha: string,
  filePath: string,
): Promise<FileDiff> {
  const { stdout } = await run({
    repoId,
    repoPath,
    args: [
      'show',
      '--format=',
      '--no-color',
      '--no-ext-diff',
      '-U3',
      '--find-renames',
      '-m',
      '--first-parent',
      sha,
      '--',
      filePath,
    ],
    skipQueue: true,
  });
  return parseUnifiedDiff(stdout, filePath);
}
