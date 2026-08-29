import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from '../diff';
import {
  parseLog,
  parseNameStatus,
  parseNumstat,
  parsePorcelainV2,
  parseRefLines,
} from '../parse';

const US = '\x1f';
const RS = '\x1e';

describe('parseUnifiedDiff', () => {
  it('satır numaralarını eski ve yeni dosyaya göre ayrı sayar', () => {
    const raw = [
      'diff --git a/src/app.ts b/src/app.ts',
      'index 1111111..2222222 100644',
      '--- a/src/app.ts',
      '+++ b/src/app.ts',
      '@@ -1,4 +1,5 @@',
      ' const a = 1;',
      '-const b = 2;',
      '+const b = 3;',
      '+const c = 4;',
      ' export { a };',
    ].join('\n');

    const diff = parseUnifiedDiff(raw, 'src/app.ts');

    expect(diff.additions).toBe(2);
    expect(diff.deletions).toBe(1);
    expect(diff.hunks).toHaveLength(1);
    expect(diff.hunks[0].lines.map((line) => [line.kind, line.oldLine, line.newLine])).toEqual([
      ['context', 1, 1],
      ['del', 2, null],
      ['add', null, 2],
      ['add', null, 3],
      ['context', 3, 4],
    ]);
  });

  it('yeniden adlandırmada eski yolu ayırır', () => {
    const raw = [
      'diff --git a/eski.ts b/yeni.ts',
      'similarity index 95%',
      'rename from eski.ts',
      'rename to yeni.ts',
      '@@ -1 +1 @@',
      '-a',
      '+b',
    ].join('\n');

    const diff = parseUnifiedDiff(raw, 'yeni.ts');
    expect(diff.path).toBe('yeni.ts');
    expect(diff.oldPath).toBe('eski.ts');
  });

  it('ikili dosyayı işaretler ve hunk üretmez', () => {
    const raw = [
      'diff --git a/logo.png b/logo.png',
      'Binary files a/logo.png and b/logo.png differ',
    ].join('\n');

    const diff = parseUnifiedDiff(raw, 'logo.png');
    expect(diff.isBinary).toBe(true);
    expect(diff.hunks).toHaveLength(0);
  });

  it('tek satırlık hunk başlığında sayıyı 1 varsayar', () => {
    const diff = parseUnifiedDiff(['@@ -5 +5 @@', '-a', '+b'].join('\n'), 'x.txt');
    expect(diff.hunks[0].oldCount).toBe(1);
    expect(diff.hunks[0].newCount).toBe(1);
    expect(diff.hunks[0].lines[0].oldLine).toBe(5);
  });
});

describe('parsePorcelainV2', () => {
  it('dal, upstream ve ahead/behind bilgisini okur', () => {
    const raw = [
      '# branch.oid abc123',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +2 -3',
      '',
    ].join('\0');

    const status = parsePorcelainV2(raw);
    expect(status.branch).toBe('main');
    expect(status.upstream).toBe('origin/main');
    expect(status.ahead).toBe(2);
    expect(status.behind).toBe(3);
    expect(status.isEmptyRepo).toBe(false);
  });

  it('aynı dosyayı hem hazırlanmış hem hazırlanmamış listeye koyabilir', () => {
    // XY = "MM": index'te de çalışma dizininde de değişiklik var.
    const raw = ['1 MM N... 100644 100644 100644 aaa bbb src/app.ts', ''].join('\0');
    const status = parsePorcelainV2(raw);

    expect(status.staged.map((f) => f.path)).toEqual(['src/app.ts']);
    expect(status.unstaged.map((f) => f.path)).toEqual(['src/app.ts']);
  });

  it('yeniden adlandırmada eski yolu bir sonraki alandan alır', () => {
    const raw = ['2 R. N... 100644 100644 100644 aaa bbb R100 yeni.ts', 'eski.ts', ''].join('\0');
    const status = parsePorcelainV2(raw);

    expect(status.staged).toHaveLength(1);
    expect(status.staged[0].path).toBe('yeni.ts');
    expect(status.staged[0].oldPath).toBe('eski.ts');
    expect(status.staged[0].kind).toBe('renamed');
  });

  it('takip edilmeyen ve çakışan dosyaları ayırır', () => {
    const raw = [
      '? yeni-dosya.txt',
      'u UU N... 100644 100644 100644 100644 aaa bbb ccc catisan.ts',
      '',
    ].join('\0');
    const status = parsePorcelainV2(raw);

    expect(status.unstaged[0]).toMatchObject({ path: 'yeni-dosya.txt', kind: 'untracked' });
    expect(status.conflicted[0]).toMatchObject({ path: 'catisan.ts', kind: 'conflicted' });
  });

  it('ilk commit atılmamış depoyu boş olarak işaretler', () => {
    const status = parsePorcelainV2(['# branch.oid (initial)', '# branch.head main', ''].join('\0'));
    expect(status.isEmptyRepo).toBe(true);
  });
});

describe('parseLog', () => {
  it('çok satırlı gövdeyi ve ref’leri ayrıştırır', () => {
    const record = [
      'a'.repeat(40),
      'aaaaaaa',
      'b'.repeat(40),
      'Ada Lovelace',
      'ada@example.com',
      '2026-08-30T10:00:00+03:00',
      'HEAD -> refs/heads/main, refs/remotes/origin/main, refs/tags/v1.0',
      'Girişi düzelt',
      'İlk satır\nİkinci satır',
    ].join(US);

    const [commit] = parseLog(record + RS);

    expect(commit.subject).toBe('Girişi düzelt');
    expect(commit.body).toBe('İlk satır\nİkinci satır');
    expect(commit.authorName).toBe('Ada Lovelace');
    expect(commit.parents).toEqual(['b'.repeat(40)]);
    expect(commit.refs).toEqual([
      { name: 'HEAD', kind: 'head' },
      { name: 'main', kind: 'local' },
      { name: 'origin/main', kind: 'remote' },
      { name: 'v1.0', kind: 'tag' },
    ]);
  });

  it('ebeveyni olmayan ilk commit’i boş parents ile döner', () => {
    const record = ['a'.repeat(40), 'aaaaaaa', '', 'Ada', 'a@b.c', '2026-01-01T00:00:00Z', '', 'İlk commit', ''].join(US);
    const [commit] = parseLog(record + RS);
    expect(commit.parents).toEqual([]);
  });
});

describe('parseNameStatus ve parseNumstat', () => {
  it('yeniden adlandırmada iki yolu birlikte okur', () => {
    const files = parseNameStatus(['R100', 'eski.ts', 'yeni.ts', 'M', 'baska.ts', ''].join('\0'));
    expect(files).toEqual([
      { path: 'yeni.ts', oldPath: 'eski.ts', kind: 'renamed', isBinary: false },
      { path: 'baska.ts', kind: 'modified', isBinary: false },
    ]);
  });

  it('ikili dosyayı tire işaretinden tanır', () => {
    const stats = parseNumstat(['-\t-\tlogo.png', '3\t1\tsrc/app.ts', ''].join('\0'));
    expect(stats.get('logo.png')).toEqual({ additions: 0, deletions: 0, isBinary: true });
    expect(stats.get('src/app.ts')).toEqual({ additions: 3, deletions: 1, isBinary: false });
  });
});

describe('parseRefLines', () => {
  it('yerel ve uzak dalları ayırır, origin/HEAD’i atar', () => {
    const raw = [
      ['refs/heads/main', 'aaa', 'refs/remotes/origin/main', '[ahead 1, behind 2]', 'Konu', '2026-08-30T10:00:00+03:00', '*'].join(US),
      ['refs/remotes/origin/main', 'aaa', '', '', 'Konu', '2026-08-30T10:00:00+03:00', ''].join(US),
      ['refs/remotes/origin/HEAD', 'aaa', '', '', '', '', ''].join(US),
    ].join('\n');

    const list = parseRefLines(raw);

    expect(list.current).toBe('main');
    expect(list.local).toHaveLength(1);
    expect(list.local[0]).toMatchObject({ ahead: 1, behind: 2, upstream: 'origin/main' });
    expect(list.remote.map((b) => b.fullName)).toEqual(['origin/main']);
  });
});
