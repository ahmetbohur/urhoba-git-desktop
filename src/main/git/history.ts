import { run } from './client';
import { parseUnifiedDiff } from './diff';
import {
  LOG_FORMAT,
  REFLOG_FORMAT,
  parseBlame,
  parseLog,
  parseNameStatus,
  parseNumstat,
  parseReflog,
} from './parse';
import type {
  BlameResult,
  Commit,
  CommitDetail,
  FileDiff,
  LogFilter,
  ReflogEntry,
} from '@shared/types';

/**
 * Geçmiş okuma. Çıktı biçimleri ve ayrıştırma `parse.ts` içinde; burada yalnızca
 * hangi git komutunun hangi bayraklarla çalıştığı var.
 */

/**
 * Geçmiş filtresini git bayraklarına çevirir.
 *
 * Yol filtresi `--` ayırıcısından sonra gelmek zorunda, yoksa git onu bir ref
 * adı sanabiliyor; bu yüzden ayrı döndürülüyor.
 */
function filterArgs(filter: LogFilter | undefined): { flags: string[]; pathspec: string[] } {
  if (!filter) return { flags: [], pathspec: [] };
  const flags: string[] = [];
  if (filter.author?.trim()) flags.push(`--author=${filter.author.trim()}`);
  if (filter.message?.trim()) {
    // `--regexp-ignore-case` ile arama büyük/küçük harf duyarsız; `--fixed-strings`
    // ise kullanıcının yazdığı noktalama işaretlerinin regex sanılmasını engelliyor.
    flags.push('--fixed-strings', '--regexp-ignore-case', `--grep=${filter.message.trim()}`);
  }
  if (filter.since?.trim()) flags.push(`--since=${filter.since.trim()}`);
  if (filter.until?.trim()) flags.push(`--until=${filter.until.trim()}`);
  const pathspec = filter.path?.trim() ? ['--', filter.path.trim()] : [];
  return { flags, pathspec };
}

export async function getLog(
  repoId: string,
  repoPath: string,
  skip: number,
  limit: number,
  ref?: string,
  filter?: LogFilter,
): Promise<Commit[]> {
  const { flags, pathspec } = filterArgs(filter);
  const args = [
    'log',
    `--format=${LOG_FORMAT}`,
    '--decorate=full',
    `--skip=${skip}`,
    `--max-count=${limit}`,
    ...flags,
  ];
  if (ref) args.push(ref);
  args.push(...pathspec);
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

/** Satır sayısı bunun üstündeki dosyalarda blame arayüzü kullanışsız hâle geliyor. */
const BLAME_LINE_LIMIT = 20_000;

/**
 * Bir dosyanın satır satır kimin tarafından yazıldığını çıkarır.
 *
 * `-w` boşluk değişimlerini yok sayıyor: yalnızca girinti düzelten bir commit
 * yüzünden bütün dosyanın yazarı değişmiş gibi görünmesin. `-M` ve `-C` ise
 * satırın dosya içinde taşındığı ya da başka dosyadan kopyalandığı durumlarda
 * asıl yazarı buluyor.
 */
/**
 * Son HEAD hareketleri.
 *
 * Sayı sınırlı: reflog aylarca birikiyor ve kullanıcı buraya son yaptığı şeyi
 * geri almak için bakıyor, arşiv taramak için değil.
 */
export async function getReflog(
  repoId: string,
  repoPath: string,
  limit = 100,
): Promise<ReflogEntry[]> {
  const { stdout } = await run({
    repoId,
    repoPath,
    args: ['reflog', `--format=${REFLOG_FORMAT}`, `--max-count=${limit}`],
    skipQueue: true,
    allowFailure: true,
  });
  return parseReflog(stdout);
}

export async function getBlame(
  repoId: string,
  repoPath: string,
  filePath: string,
  ref?: string,
): Promise<BlameResult> {
  const args = ['blame', '--porcelain', '-w', '-M', '-C'];
  if (ref) args.push(ref);
  args.push('--', filePath);

  const result = await run({ repoId, repoPath, args, skipQueue: true, allowFailure: true });
  if (!result.ok) {
    const reason = result.stderr.toLowerCase().includes('binary')
      ? 'İkili dosyalarda satır geçmişi gösterilemiyor.'
      : 'Bu dosyanın geçmişi okunamadı. Henüz commit edilmemiş olabilir.';
    return { path: filePath, lines: [], unavailableReason: reason };
  }

  const lines = parseBlame(result.stdout);
  if (lines.length > BLAME_LINE_LIMIT) {
    return {
      path: filePath,
      lines: lines.slice(0, BLAME_LINE_LIMIT),
      unavailableReason: `Dosya çok uzun; ilk ${BLAME_LINE_LIMIT} satır gösteriliyor.`,
    };
  }
  return { path: filePath, lines, unavailableReason: null };
}
