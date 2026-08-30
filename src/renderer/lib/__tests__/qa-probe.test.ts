import { describe, expect, it } from 'vitest';
import { intralineDiff, intralineRanges } from '../intraline';
import { lfsChangeFromDiff } from '../lfs-diff';
import { buildSidebarRows } from '../repo-tree';
import { formatFileSize } from '../format';
import type { DiffHunk, DiffLine } from '@shared/types';

/** Arayüzdeki saf mantığı uç girdilerle zorlayan QA denemeleri. */

const line = (kind: DiffLine['kind'], content: string): DiffLine => ({
  kind,
  content,
  oldLine: null,
  newLine: null,
});

describe('QA — satır içi fark uç durumları', () => {
  it('CRLF farkı satırın tamamını boyamaz', () => {
    // Windows'tan gelen bir dosyada yalnızca satır sonu değiştiyse vurgu
    // görünmez olmalı; her satırı boyamak diff'i okunmaz yapıyor.
    const diff = intralineDiff('const a = 1;\r', 'const a = 1;');
    expect(diff === null || diff.removed.length <= 1).toBe(true);
  });

  it('yalnızca boşluk eklenen satırda dar vurgu üretir', () => {
    const diff = intralineDiff('if(a){', 'if (a) {');
    expect(diff).not.toBeNull();
  });

  it('sekme ile boşluk değişimini yakalar', () => {
    expect(intralineDiff('\tconst a = 1;', '    const a = 1;')).not.toBeNull();
  });

  it('tek karakterlik satırlarda çökmez', () => {
    expect(() => intralineDiff('a', 'b')).not.toThrow();
  });

  it('emoji ve birleşik karakterlerde çökmez', () => {
    expect(() => intralineDiff('başlık 🎉 bir', 'başlık 🎉 iki')).not.toThrow();
  });

  it('yüzlerce satırlık blokta makul sürede biter', () => {
    const lines: DiffLine[] = [];
    for (let index = 0; index < 200; index += 1) lines.push(line('del', `const a${index} = 1;`));
    for (let index = 0; index < 200; index += 1) lines.push(line('add', `const a${index} = 2;`));

    const started = performance.now();
    const ranges = intralineRanges(lines);
    // Eşleştirme her çifti bir kez karşılaştırıyor; kare karmaşıklığa
    // düşseydi bu blok saniyeler sürerdi.
    expect(performance.now() - started).toBeLessThan(2000);
    expect(ranges.size).toBeGreaterThan(0);
  });
});

describe('QA — LFS özeti uç durumları', () => {
  const hunk = (lines: DiffLine[]): DiffHunk => ({
    header: '@@',
    oldStart: 1,
    oldCount: 1,
    newStart: 1,
    newCount: 1,
    lines,
  });

  it('sıfır baytlık LFS dosyasını doğru gösterir', () => {
    const change = lfsChangeFromDiff([
      hunk([
        line('add', 'version https://git-lfs.github.com/spec/v1'),
        line('add', 'oid sha256:aaa'),
        line('add', 'size 0'),
      ]),
    ]);
    expect(change?.after?.size).toBe(0);
  });

  it('boş hunk listesinde null döner', () => {
    expect(lfsChangeFromDiff([])).toBeNull();
  });
});

describe('QA — boyut biçimlendirme sınırları', () => {
  it('sınır değerlerde birim atlar', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(1023)).toBe('1023 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1024 * 1024 - 1)).toContain('KB');
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
  });
});

describe('QA — kenar çubuğu düzeni', () => {
  const repo = (id: string, name: string, groupName?: string) => ({
    id,
    name,
    path: `/tmp/${name}`,
    groupName,
    pinned: false,
    tags: [],
    lastOpenedAt: '2026-01-01T00:00:00Z',
    addedAt: '2026-01-01T00:00:00Z',
  });

  it('depo yokken boş liste döner', () => {
    expect(
      buildSidebarRows({
        repos: [],
        query: '',
        activeTags: [],
        collapsed: [],
        dirty: [],
      }),
    ).toEqual([]);
  });

  it('hiçbir şeyle eşleşmeyen aramada boş liste döner', () => {
    const rows = buildSidebarRows({
      repos: [repo('1', 'alfa', 'grup')],
      query: 'bulunamaz',
      activeTags: [],
      collapsed: [],
      dirty: [],
    });
    expect(rows).toEqual([]);
  });
});
