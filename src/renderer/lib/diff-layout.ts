import type { DiffLine } from '@shared/types';

/**
 * Yan yana diff için satır eşleme.
 *
 * Ardışık silme ve ekleme bloklarını karşılıklı diziyoruz: git'in unified
 * çıktısı önce bütün silmeleri, sonra bütün eklemeleri veriyor, oysa insan
 * "eski hâli solda, yeni hâli sağda" görmek istiyor. Bloklar farklı uzunluktaysa
 * kısa olanın karşısı boş kalıyor.
 *
 * JSX'ten ayrı bir dosyada duruyor ki eşleme mantığı arayüz kurmadan test
 * edilebilsin.
 */

export interface SidePair {
  left: { line: DiffLine; index: number } | null;
  right: { line: DiffLine; index: number } | null;
}

export function pairLinesForSideBySide(lines: DiffLine[]): SidePair[] {
  const pairs: SidePair[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.kind === 'context' || line.kind === 'meta') {
      pairs.push({ left: { line, index }, right: { line, index } });
      index += 1;
      continue;
    }

    const deletions: Array<{ line: DiffLine; index: number }> = [];
    const additions: Array<{ line: DiffLine; index: number }> = [];
    while (index < lines.length && lines[index].kind === 'del') {
      deletions.push({ line: lines[index], index });
      index += 1;
    }
    while (index < lines.length && lines[index].kind === 'add') {
      additions.push({ line: lines[index], index });
      index += 1;
    }

    const rows = Math.max(deletions.length, additions.length);
    for (let row = 0; row < rows; row += 1) {
      pairs.push({ left: deletions[row] ?? null, right: additions[row] ?? null });
    }
  }

  return pairs;
}
