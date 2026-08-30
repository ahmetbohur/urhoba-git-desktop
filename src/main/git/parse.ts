import type {
  BlameLine,
  Branch,
  BranchList,
  Commit,
  CommitRef,
  FileChange,
  FileChangeKind,
  WorkingTreeStatus,
} from '@shared/types';

/**
 * Git çıktısı ayrıştırıcıları.
 *
 * Hepsi saf fonksiyon: girdi metin, çıktı veri. Süreç çalıştırma ve dosya
 * sistemi erişimi bilerek dışarıda bırakıldı — git'in çıktı biçimleri bu
 * projenin en kırılgan yeri, dolayısıyla Electron'a hiç ihtiyaç duymadan
 * test edilebilir olmaları gerekiyor.
 */

function kindFromCode(code: string): FileChangeKind {
  switch (code) {
    case 'A':
      return 'added';
    case 'M':
      return 'modified';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'copied';
    case 'T':
      return 'typechange';
    default:
      return 'modified';
  }
}

export function parsePorcelainV2(raw: string): WorkingTreeStatus {
  const status: WorkingTreeStatus = {
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    conflicted: [],
    operation: 'none',
    isEmptyRepo: false,
  };

  const records = raw.split('\0');
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    if (record.length === 0) continue;

    if (record.startsWith('# branch.head ')) {
      const head = record.slice('# branch.head '.length);
      status.branch = head === '(detached)' ? null : head;
      continue;
    }
    if (record.startsWith('# branch.oid ')) {
      status.isEmptyRepo = record.slice('# branch.oid '.length) === '(initial)';
      continue;
    }
    if (record.startsWith('# branch.upstream ')) {
      status.upstream = record.slice('# branch.upstream '.length);
      continue;
    }
    if (record.startsWith('# branch.ab ')) {
      const match = /\+(\d+) -(\d+)/.exec(record);
      if (match) {
        status.ahead = Number(match[1]);
        status.behind = Number(match[2]);
      }
      continue;
    }
    if (record.startsWith('# ')) continue;

    const type = record[0];

    if (type === '?') {
      status.unstaged.push({ path: record.slice(2), kind: 'untracked', isBinary: false });
      continue;
    }
    if (type === '!') continue;

    if (type === 'u') {
      // Çakışan dosya: "u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>"
      const fields = record.split(' ');
      status.conflicted.push({
        path: fields.slice(10).join(' '),
        kind: 'conflicted',
        isBinary: false,
      });
      continue;
    }

    if (type === '1' || type === '2') {
      const fields = record.split(' ');
      const xy = fields[1];
      const stagedCode = xy[0];
      const worktreeCode = xy[1];

      let filePath: string;
      let oldPath: string | undefined;
      if (type === '2') {
        // Yeniden adlandırma: yeni yol bu kaydın sonunda, eski yol bir sonraki NUL alanında.
        filePath = fields.slice(9).join(' ');
        oldPath = records[i + 1];
        i += 1;
      } else {
        filePath = fields.slice(8).join(' ');
      }

      if (stagedCode !== '.') {
        status.staged.push({
          path: filePath,
          oldPath,
          kind: kindFromCode(stagedCode),
          isBinary: false,
        });
      }
      if (worktreeCode !== '.') {
        status.unstaged.push({
          path: filePath,
          oldPath,
          kind: kindFromCode(worktreeCode),
          isBinary: false,
        });
      }
    }
  }

  return status;
}


const US = '\x1f';
const RS = '\x1e';
export const LOG_FORMAT = ['%H', '%h', '%P', '%an', '%ae', '%aI', '%D', '%s', '%b'].join(US) + RS;

function parseRefs(decoration: string): CommitRef[] {
  if (decoration.trim().length === 0) return [];
  const refs: CommitRef[] = [];
  for (const rawPart of decoration.split(',')) {
    const part = rawPart.trim();
    if (part.length === 0) continue;
    if (part.startsWith('HEAD -> ')) {
      /*
       * Ayrı bir HEAD kaydı üretmiyoruz: "HEAD" ile "main" aynı yeri
       * gösterirken iki rozet basmak yer kaplıyor ve arayüzde uzak dal gibi
       * gerçekten bilgi taşıyan süslemeleri listeden dışarı itiyordu. Hangi
       * dalın çıkışta olduğu bilgisi dalın kendisinde taşınıyor.
       */
      refs.push({
        name: part.slice('HEAD -> refs/heads/'.length),
        kind: 'local',
        isHead: true,
      });
    } else if (part === 'HEAD') {
      refs.push({ name: 'HEAD', kind: 'head' });
    } else if (part.startsWith('refs/heads/')) {
      refs.push({ name: part.slice('refs/heads/'.length), kind: 'local' });
    } else if (part.startsWith('refs/remotes/')) {
      refs.push({ name: part.slice('refs/remotes/'.length), kind: 'remote' });
    } else if (part.startsWith('tag: refs/tags/')) {
      // Açıklamalı etiketler `tag:` önekiyle geliyor, hafif etiketler öneksiz.
      refs.push({ name: part.slice('tag: refs/tags/'.length), kind: 'tag' });
    } else if (part.startsWith('refs/tags/')) {
      refs.push({ name: part.slice('refs/tags/'.length), kind: 'tag' });
    }
  }
  return refs;
}

export function parseLog(raw: string): Commit[] {
  return raw
    .split(RS)
    .map((record) => record.replace(/^\n/, ''))
    .filter((record) => record.trim().length > 0)
    .map((record) => {
      const [sha, shortSha, parents, authorName, authorEmail, authoredAt, decoration, subject, body] =
        record.split(US);
      return {
        sha,
        shortSha,
        subject: subject ?? '',
        body: (body ?? '').trim(),
        authorName,
        authorEmail,
        authoredAt,
        parents: parents.trim().length > 0 ? parents.trim().split(' ') : [],
        refs: parseRefs(decoration ?? ''),
      } satisfies Commit;
    });
}

function kindFromStatusCode(code: string): FileChangeKind {
  switch (code[0]) {
    case 'A':
      return 'added';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'copied';
    case 'T':
      return 'typechange';
    default:
      return 'modified';
  }
}

/** `--name-status -z` çıktısı: durum, yol (yeniden adlandırmada iki yol) sırayla. */
export function parseNameStatus(raw: string): FileChange[] {
  const tokens = raw.split('\0').filter((t) => t.length > 0);
  const files: FileChange[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const code = tokens[i];
    if (code[0] === 'R' || code[0] === 'C') {
      files.push({
        path: tokens[i + 2],
        oldPath: tokens[i + 1],
        kind: kindFromStatusCode(code),
        isBinary: false,
      });
      i += 2;
    } else {
      files.push({ path: tokens[i + 1], kind: kindFromStatusCode(code), isBinary: false });
      i += 1;
    }
  }
  return files;
}

/** `--numstat -z`: ikili dosyalarda sayı yerine "-" gelir. */
export function parseNumstat(raw: string): Map<string, { additions: number; deletions: number; isBinary: boolean }> {
  const map = new Map<string, { additions: number; deletions: number; isBinary: boolean }>();
  const tokens = raw.split('\0').filter((t) => t.length > 0);
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const parts = token.split('\t');
    if (parts.length < 3) continue;
    const [addRaw, delRaw, pathInline] = parts;
    const stats = {
      additions: addRaw === '-' ? 0 : Number(addRaw),
      deletions: delRaw === '-' ? 0 : Number(delRaw),
      isBinary: addRaw === '-' && delRaw === '-',
    };
    if (pathInline.length > 0) {
      map.set(pathInline, stats);
    } else {
      // Yeniden adlandırmada yollar sonraki iki alanda gelir: eski, yeni.
      map.set(tokens[i + 2], stats);
      i += 2;
    }
  }
  return map;
}



export const REF_FORMAT = [
  '%(refname)',
  '%(objectname)',
  '%(upstream)',
  '%(upstream:track)',
  '%(contents:subject)',
  '%(committerdate:iso-strict)',
  '%(HEAD)',
].join(US);

/** `[ahead 2, behind 3]` ya da `[gone]` biçimindeki takip özetini sayıya çevirir. */
function parseTrack(track: string): { ahead: number; behind: number } {
  const ahead = /ahead (\d+)/.exec(track);
  const behind = /behind (\d+)/.exec(track);
  return { ahead: ahead ? Number(ahead[1]) : 0, behind: behind ? Number(behind[1]) : 0 };
}

export function parseRefLines(raw: string): BranchList {
  const list: BranchList = { current: null, local: [], remote: [] };

  for (const line of raw.split('\n')) {
    if (line.trim().length === 0) continue;
    const [refname, objectname, upstream, track, subject, date, headMark] = line.split(US);

    const isRemote = refname.startsWith('refs/remotes/');
    const fullName = isRemote
      ? refname.slice('refs/remotes/'.length)
      : refname.slice('refs/heads/'.length);

    // "origin/HEAD" gerçek bir dal değil, uzak sunucunun varsayılan dal işaretçisi.
    if (isRemote && fullName.endsWith('/HEAD')) continue;

    const { ahead, behind } = parseTrack(track ?? '');
    const branch: Branch = {
      name: isRemote ? fullName.split('/').slice(1).join('/') : fullName,
      fullName,
      isCurrent: headMark === '*',
      isRemote,
      upstream: upstream && upstream.length > 0 ? upstream.replace('refs/remotes/', '') : null,
      ahead,
      behind,
      lastCommitSha: objectname,
      lastCommitSubject: subject ?? '',
      lastCommitAt: date ?? '',
    };

    if (branch.isCurrent) list.current = branch.fullName;
    if (isRemote) list.remote.push(branch);
    else list.local.push(branch);
  }

  list.local.sort((a, b) => b.lastCommitAt.localeCompare(a.lastCommitAt));
  list.remote.sort((a, b) => a.fullName.localeCompare(b.fullName));
  return list;
}


/**
 * `git blame --porcelain` çıktısını satır satır çözer.
 *
 * Biçim yer kazanmak için tekrar etmiyor: bir commit'in başlık bilgisi (yazar,
 * tarih, özet) yalnızca o commit ilk görüldüğünde yazılıyor, sonraki satırlarda
 * yalnızca sha geçiyor. Bu yüzden gördüğümüz commit'leri biriktirip sonraki
 * satırlarda oradan okumak zorundayız — aksi hâlde ilk satır dışındaki her şey
 * yazarsız kalır.
 */
export function parseBlame(raw: string): BlameLine[] {
  const lines = raw.split('\n');
  const commits = new Map<string, { author: string; authorMail: string; time: string; summary: string }>();
  const result: BlameLine[] = [];

  let current: { sha: string; finalLine: number } | null = null;
  let pending = { author: '', authorMail: '', time: '', summary: '' };

  for (const line of lines) {
    // Başlık satırı: "<sha> <kaynak satır> <sonuç satır> [<grup boyu>]"
    const header = /^([0-9a-f]{40}) (\d+) (\d+)(?: (\d+))?$/.exec(line);
    if (header) {
      current = { sha: header[1], finalLine: Number(header[3]) };
      pending = commits.get(header[1]) ?? { author: '', authorMail: '', time: '', summary: '' };
      continue;
    }
    if (!current) continue;

    if (line.startsWith('author ')) pending.author = line.slice('author '.length);
    else if (line.startsWith('author-mail ')) {
      pending.authorMail = line.slice('author-mail '.length).replace(/^<|>$/g, '');
    } else if (line.startsWith('author-time ')) {
      pending.time = new Date(Number(line.slice('author-time '.length)) * 1000).toISOString();
    } else if (line.startsWith('summary ')) pending.summary = line.slice('summary '.length);
    else if (line.startsWith('\t')) {
      // İçerik satırı: bu commit'in bilgisi artık tam, önbelleğe alıp kaydediyoruz.
      commits.set(current.sha, { ...pending });
      result.push({
        sha: current.sha,
        shortSha: current.sha.slice(0, 8),
        lineNumber: current.finalLine,
        content: line.slice(1),
        authorName: pending.author,
        authorEmail: pending.authorMail,
        authoredAt: pending.time,
        summary: pending.summary,
      });
      current = null;
    }
  }

  return result;
}
