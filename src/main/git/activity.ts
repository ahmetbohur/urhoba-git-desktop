import { run } from './client';
import { LOG_FORMAT, parseLog } from './parse';
import type { ActivityCommit, ActivityPeriod, RepoActivity } from '@shared/types';

/**
 * Etkinlik özeti: bir aralıkta ne yazdın, ne indi.
 *
 * İki şey ayrı tutuluyor ve bu ayrım özelliğin özü. Başkasının üç gün önce
 * yazdığı bir commit'i bugün çektiysen, o bugünün özetine girmeli — yazma
 * tarihine bakan bir hesap bunu kaçırır. Bu yüzden "gelenler" uzak takip
 * dalının reflog'undan çıkarılıyor: reflog "şu an, şu aralık indi" diyor.
 */

const PERIOD_HOURS: Record<ActivityPeriod, number> = {
  '1h': 1,
  '6h': 6,
  '24h': 24,
  '7d': 24 * 7,
};

export function periodStart(period: ActivityPeriod, now: number): Date {
  return new Date(now - PERIOD_HOURS[period] * 3600_000);
}

/**
 * Reflog satırı: `<sha> <ref>@{<tarih>}: <eylem>`
 *
 * Satırdaki sha o işlemden **sonraki** değer; bir girdinin getirdiği aralık
 * "bir öncekinin sha'sı → bu sha" oluyor. Liste yeniden eskiye sıralı.
 */
export function parseReflogRange(
  raw: string,
  since: Date,
): { base: string; tip: string } | null {
  const entries = raw
    .split('\n')
    .map((line) => /^(\S+)\s+\S+@\{([^}]+)\}:/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ sha: match[1], at: new Date(match[2]) }))
    .filter((entry) => !Number.isNaN(entry.at.getTime()));

  if (entries.length === 0) return null;

  const inWindow = entries.filter((entry) => entry.at >= since);
  if (inWindow.length === 0) return null;

  const tip = inWindow[0].sha;
  /*
   * Taban, pencerenin dışında kalan ilk girdi: o an neredeyse aradaki her şey
   * bu aralıkta inmiş demek. Bütün reflog pencerenin içindeyse (dal bu aralıkta
   * oluşmuş) en eski girdinin kendisi taban oluyor; o girdinin getirdikleri
   * dışarıda kalıyor ama alternatifi bütün geçmişi "yeni inmiş" saymak.
   */
  const base = entries[inWindow.length]?.sha ?? entries[entries.length - 1].sha;
  return base === tip ? null : { base, tip };
}

function toActivityCommit(commit: {
  sha: string;
  shortSha: string;
  subject: string;
  authorName: string;
  authoredAt: string;
}): ActivityCommit {
  return {
    sha: commit.sha,
    shortSha: commit.shortSha,
    subject: commit.subject,
    authorName: commit.authorName,
    authoredAt: commit.authoredAt,
  };
}

/** Deponun kendi yapılandırmasındaki kullanıcı e-postası. */
async function repoEmail(repoId: string, repoPath: string): Promise<string> {
  const { stdout, ok } = await run({
    repoId,
    repoPath,
    args: ['config', '--get', 'user.email'],
    skipQueue: true,
    allowFailure: true,
  });
  return ok ? stdout.trim() : '';
}

async function logRange(
  repoId: string,
  repoPath: string,
  args: string[],
): Promise<ActivityCommit[]> {
  const { stdout, ok } = await run({
    repoId,
    repoPath,
    args: ['log', `--format=${LOG_FORMAT}`, ...args],
    skipQueue: true,
    allowFailure: true,
  });
  if (!ok) return [];
  return parseLog(stdout).map(toActivityCommit);
}

/**
 * Bir deponun aralıktaki etkinliği.
 *
 * "Gelenler" listesinden kendi commit'lerimiz çıkarılıyor: kendi push'umuz da
 * uzak takip dalını ilerletiyor ve o commit'ler zaten "yazdıkların" tarafında.
 */
export async function repoActivity(
  repoId: string,
  repoName: string,
  repoPath: string,
  since: Date,
): Promise<RepoActivity> {
  const sinceArg = `--since=${since.toISOString()}`;
  const email = await repoEmail(repoId, repoPath);

  const authored = email
    ? await logRange(repoId, repoPath, [sinceArg, `--author=${email}`, '--all'])
    : [];

  const { stdout: refsOut } = await run({
    repoId,
    repoPath,
    args: ['for-each-ref', '--format=%(refname)', 'refs/remotes/'],
    skipQueue: true,
    allowFailure: true,
  });
  const remoteRefs = refsOut.split('\n').filter((line) => line.trim().length > 0);

  const arrived: ActivityCommit[] = [];
  const seen = new Set(authored.map((commit) => commit.sha));

  for (const ref of remoteRefs) {
    const { stdout, ok } = await run({
      repoId,
      repoPath,
      args: ['reflog', 'show', ref, '--date=iso'],
      skipQueue: true,
      allowFailure: true,
    });
    if (!ok) continue;

    const range = parseReflogRange(stdout, since);
    if (!range) continue;

    for (const commit of await logRange(repoId, repoPath, [`${range.base}..${range.tip}`])) {
      if (seen.has(commit.sha)) continue;
      seen.add(commit.sha);
      arrived.push(commit);
    }
  }

  return {
    repoId,
    repoName,
    authored,
    arrived,
    hasRemote: remoteRefs.length > 0,
  };
}
