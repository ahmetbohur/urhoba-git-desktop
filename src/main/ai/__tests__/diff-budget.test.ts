import { describe, expect, it } from 'vitest';
import { fitDiff } from '../diff-budget';
import type { FileChange } from '@shared/types';

const files: FileChange[] = [
  { path: 'src/app.ts', kind: 'modified', isBinary: false },
  { path: 'src/yeni.ts', kind: 'added', isBinary: false },
];

function diffFor(fileCount: number, linesPerFile: number): string {
  return Array.from({ length: fileCount }, (_, index) => {
    const body = Array.from({ length: linesPerFile }, (_, line) => `+satir-${line}`).join('\n');
    return `diff --git a/f${index}.ts b/f${index}.ts\n@@ -1 +1 @@\n${body}`;
  }).join('\n');
}

describe('fitDiff', () => {
  it('sığan diff’i olduğu gibi bırakır', () => {
    const diff = diffFor(1, 5);
    const result = fitDiff(diff, files, 10_000);

    expect(result.detail).toBe('full');
    expect(result.text).toBe(diff);
    expect(result.note).toBeNull();
  });

  it('büyük diff’te dosya başına satır sınırı uygular', () => {
    const result = fitDiff(diffFor(2, 400), files, 6_000);

    expect(result.detail).toBe('truncated-files');
    expect(result.text).toContain('satır daha');
    expect(result.note).toMatch(/dosya başına/);
  });

  it('daha da büyükse bağlam satırlarını atar', () => {
    // Bağlam satırlarıyla şişmiş bir diff: kırpma yetmiyor, bağlam atılıyor.
    const bulky = Array.from({ length: 40 }, (_, index) => {
      const context = Array.from({ length: 60 }, (_, line) => ` bağlam-${line}`).join('\n');
      return `diff --git a/f${index}.ts b/f${index}.ts\n@@ -1 +1 @@\n${context}\n+değişti`;
    }).join('\n');

    const result = fitDiff(bulky, files, 15_000);

    expect(result.detail).toBe('changed-lines');
    expect(result.text).not.toContain('bağlam-1');
    expect(result.text).toContain('+değişti');
  });

  it('hiçbir şey sığmazsa dosya listesine düşer', () => {
    const result = fitDiff(diffFor(200, 200), files, 500);

    expect(result.detail).toBe('file-list');
    expect(result.text).toContain('src/app.ts');
    expect(result.text).toContain('added: src/yeni.ts');
    expect(result.note).toMatch(/dosyaların listesi/);
  });

  it('yeniden adlandırmayı dosya listesinde iki yolla gösterir', () => {
    const renamed: FileChange[] = [
      { path: 'yeni.ts', oldPath: 'eski.ts', kind: 'renamed', isBinary: false },
    ];
    const result = fitDiff(diffFor(200, 200), renamed, 100);

    expect(result.text).toContain('eski.ts → yeni.ts');
  });

  it('karakter sayısını bildirir', () => {
    const result = fitDiff('kısa diff', files, 1000);
    expect(result.characters).toBe('kısa diff'.length);
  });
});
