import { describe, expect, it } from 'vitest';
import { lfsChangeFromDiff } from '../lfs-diff';
import type { DiffHunk, DiffLine } from '@shared/types';

const line = (kind: DiffLine['kind'], content: string): DiffLine => ({
  kind,
  content,
  oldLine: null,
  newLine: null,
});

const hunk = (lines: DiffLine[]): DiffHunk => ({
  header: '@@ -1,3 +1,3 @@',
  oldStart: 1,
  oldCount: 3,
  newStart: 1,
  newCount: 3,
  lines,
});

/**
 * LFS işaretçisi git için metin olduğu için diff'te sha256 satırları çiziliyor.
 * Kullanıcının görmesi gereken şey boyutun değişmesi; hash ona bir şey
 * söylemiyor.
 */
describe('lfsChangeFromDiff', () => {
  it('eski ve yeni boyutu çıkarır', () => {
    const change = lfsChangeFromDiff([
      hunk([
        line('context', 'version https://git-lfs.github.com/spec/v1'),
        line('del', 'oid sha256:aaa'),
        line('del', 'size 5242880'),
        line('add', 'oid sha256:bbb'),
        line('add', 'size 7340032'),
      ]),
    ]);

    expect(change?.before).toEqual({ oid: 'aaa', size: 5242880 });
    expect(change?.after).toEqual({ oid: 'bbb', size: 7340032 });
  });

  it('yeni eklenen LFS dosyasında eski taraf boş kalır', () => {
    const change = lfsChangeFromDiff([
      hunk([
        line('add', 'version https://git-lfs.github.com/spec/v1'),
        line('add', 'oid sha256:bbb'),
        line('add', 'size 100'),
      ]),
    ]);

    expect(change?.before).toBeNull();
    expect(change?.after?.size).toBe(100);
  });

  it('LFS olmayan diff’te null döner', () => {
    const change = lfsChangeFromDiff([
      hunk([line('del', 'const a = 1;'), line('add', 'const a = 2;')]),
    ]);

    expect(change).toBeNull();
  });

  it('sürüm satırı olup oid değişmediğinde null döner', () => {
    // İşaretçi dokunulmamışsa gösterilecek bir değişiklik yok.
    const change = lfsChangeFromDiff([
      hunk([line('context', 'version https://git-lfs.github.com/spec/v1')]),
    ]);

    expect(change).toBeNull();
  });
});
