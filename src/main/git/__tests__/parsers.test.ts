import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from '../diff';
import {
  parseBlame,
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
      'HEAD -> refs/heads/main, refs/remotes/origin/main, tag: refs/tags/v1.0, refs/tags/v0.9',
      'Girişi düzelt',
      'İlk satır\nİkinci satır',
    ].join(US);

    const [commit] = parseLog(record + RS);

    expect(commit.subject).toBe('Girişi düzelt');
    expect(commit.body).toBe('İlk satır\nİkinci satır');
    expect(commit.authorName).toBe('Ada Lovelace');
    expect(commit.parents).toEqual(['b'.repeat(40)]);
    // Açıklamalı etiket `tag:` önekiyle, hafif etiket öneksiz geliyor; ikisi de
    // aynı türde ref olarak çözülmeli.
    expect(commit.refs).toEqual([
      { name: 'HEAD', kind: 'head' },
      { name: 'main', kind: 'local' },
      { name: 'origin/main', kind: 'remote' },
      { name: 'v1.0', kind: 'tag' },
      { name: 'v0.9', kind: 'tag' },
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


describe('parseBlame', () => {
  /** Porcelain biçimi commit başlığını yalnızca ilk görüşte yazar. */
  const raw = [
    'a'.repeat(40) + ' 1 1 2',
    'author Ada Lovelace',
    'author-mail <ada@example.com>',
    'author-time 1767225600',
    'author-tz +0300',
    'summary Girişi ekle',
    'filename src/app.ts',
    '\tconst a = 1;',
    'a'.repeat(40) + ' 2 2',
    '\tconst b = 2;',
    'b'.repeat(40) + ' 3 3 1',
    'author Mehmet Yılmaz',
    'author-mail <mehmet@example.com>',
    'author-time 1767312000',
    'author-tz +0300',
    'summary Hata düzelt',
    'filename src/app.ts',
    '\tconst c = 3;',
  ].join('\n');

  it('her satırı kendi commit’iyle eşler', () => {
    const lines = parseBlame(raw);
    expect(lines).toHaveLength(3);
    expect(lines.map((line) => line.content)).toEqual([
      'const a = 1;',
      'const b = 2;',
      'const c = 3;',
    ]);
  });

  it('tekrar edilmeyen commit bilgisini önbellekten tamamlar', () => {
    // İkinci satırın başlığında yalnızca sha var; yazar bilgisi ilk satırdan gelmeli.
    const [, second] = parseBlame(raw);
    expect(second.authorName).toBe('Ada Lovelace');
    expect(second.summary).toBe('Girişi ekle');
  });

  it('farklı commit’in bilgisini karıştırmaz', () => {
    const [, , third] = parseBlame(raw);
    expect(third.authorName).toBe('Mehmet Yılmaz');
    expect(third.summary).toBe('Hata düzelt');
    expect(third.shortSha).toBe('bbbbbbbb');
  });

  it('e-postayı köşeli parantezlerden arındırır', () => {
    expect(parseBlame(raw)[0].authorEmail).toBe('ada@example.com');
  });

  it('zaman damgasını ISO tarihe çevirir', () => {
    expect(parseBlame(raw)[0].authoredAt).toMatch(/^2026-01-01T/);
  });

  it('satır numaralarını sonuç dosyasına göre verir', () => {
    expect(parseBlame(raw).map((line) => line.lineNumber)).toEqual([1, 2, 3]);
  });

  it('boş çıktıda boş liste döner', () => {
    expect(parseBlame('')).toEqual([]);
  });

  it('boş satır içeren dosyayı kaybetmez', () => {
    const withEmpty = [
      'c'.repeat(40) + ' 1 1 1',
      'author X',
      'author-mail <x@y.z>',
      'author-time 1767225600',
      'summary boş satır',
      'filename a.txt',
      '\t',
    ].join('\n');
    const lines = parseBlame(withEmpty);
    expect(lines).toHaveLength(1);
    expect(lines[0].content).toBe('');
  });
});
