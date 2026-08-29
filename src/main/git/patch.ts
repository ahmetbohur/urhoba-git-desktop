import type { DiffHunk, FileDiff, HunkSelection, LineStageMode } from '@shared/types';

/**
 * Satır bazlı hazırlama için yama üretimi.
 *
 * `git add -p` ile aynı işi yapıyor: mevcut diff'ten yalnızca seçilen satırları
 * içeren yeni bir unified diff kurup `git apply` ile uyguluyoruz.
 *
 * Üç mod tek bir mekanizmaya indirgeniyor:
 *
 * - **stage**: hazırlanmamış diff (index → çalışma dizini), olduğu gibi, index'e
 *   uygulanır.
 * - **unstage**: hazırlanmış diff (HEAD → index) ters çevrilip index'e uygulanır.
 * - **discard**: hazırlanmamış diff ters çevrilip çalışma dizinine uygulanır.
 *
 * Ters çevirme sayesinde seçim kuralı üç modda da aynı kalıyor: seçilmeyen
 * silme satırı bağlama dönüşür (dosyada kalmaya devam eder), seçilmeyen ekleme
 * satırı yamadan tamamen çıkarılır (hiç eklenmez).
 */

/** Diff'i ters yöne çevirir: eklemeler silmeye, eski taraf yeni tarafa döner. */
export function invertDiff(diff: FileDiff): FileDiff {
  return {
    ...diff,
    additions: diff.deletions,
    deletions: diff.additions,
    hunks: diff.hunks.map((hunk) => ({
      header: hunk.header,
      oldStart: hunk.newStart,
      oldCount: hunk.newCount,
      newStart: hunk.oldStart,
      newCount: hunk.oldCount,
      lines: hunk.lines.map((line) => {
        if (line.kind === 'add') {
          return { ...line, kind: 'del' as const, oldLine: line.newLine, newLine: null };
        }
        if (line.kind === 'del') {
          return { ...line, kind: 'add' as const, oldLine: null, newLine: line.oldLine };
        }
        return { ...line, oldLine: line.newLine, newLine: line.oldLine };
      }),
    })),
  };
}

interface BuiltHunk {
  lines: string[];
  oldCount: number;
  newCount: number;
  oldStart: number;
  /** Bu hunk'ta yamaya giren net satır değişimi — sonraki hunk'ın konumunu kaydırır. */
  delta: number;
}

function buildHunk(hunk: DiffHunk, selected: Set<number>): BuiltHunk | null {
  const lines: string[] = [];
  let oldCount = 0;
  let newCount = 0;
  let touched = false;

  hunk.lines.forEach((line, index) => {
    if (line.kind === 'meta') {
      // "\ No newline at end of file" — bir önceki satıra ait, yamada korunur.
      if (lines.length > 0) lines.push(`\\ ${line.content}`);
      return;
    }

    const isSelected = selected.has(index);

    if (line.kind === 'context') {
      lines.push(` ${line.content}`);
      oldCount += 1;
      newCount += 1;
      return;
    }

    if (line.kind === 'del') {
      if (isSelected) {
        lines.push(`-${line.content}`);
        oldCount += 1;
        touched = true;
      } else {
        // Silinmesini istemediğimiz satır dosyada duruyor: bağlam olarak yaz.
        lines.push(` ${line.content}`);
        oldCount += 1;
        newCount += 1;
      }
      return;
    }

    // kind === 'add'
    if (isSelected) {
      lines.push(`+${line.content}`);
      newCount += 1;
      touched = true;
    }
    // Seçilmeyen ekleme yamaya hiç girmez.
  });

  if (!touched) return null;

  return { lines, oldCount, newCount, oldStart: hunk.oldStart, delta: newCount - oldCount };
}

/**
 * Seçili satırlardan uygulanabilir bir unified diff üretir.
 * Hiçbir satır seçilmemişse (ya da seçim yalnızca bağlam satırlarına düşüyorsa)
 * null döner — çağıran tarafın git'i boş yamayla çalıştırmasına gerek yok.
 */
export function buildPatch(
  diff: FileDiff,
  selections: HunkSelection[],
  mode: LineStageMode,
): string | null {
  const source = mode === 'stage' ? diff : invertDiff(diff);

  // Ters çevirmede satır dizinleri değişmiyor: `invertDiff` sırayı koruyor.
  const selectionByHunk = new Map<number, Set<number>>();
  for (const selection of selections) {
    selectionByHunk.set(selection.hunkIndex, new Set(selection.lineIndices));
  }

  const body: string[] = [];
  // Yamanın "yeni" tarafındaki konum, önceki hunk'larda dahil edilen net değişim
  // kadar kayar. Bu düzeltme olmadan git kaymayı tahmin etmek zorunda kalır.
  let offset = 0;

  source.hunks.forEach((hunk, index) => {
    const selected = selectionByHunk.get(index);
    if (!selected || selected.size === 0) return;

    const built = buildHunk(hunk, selected);
    if (!built) return;

    const newStart = built.oldStart + offset;
    body.push(
      `@@ -${built.oldStart},${built.oldCount} +${newStart},${built.newCount} @@`,
      ...built.lines,
    );
    offset += built.delta;
  });

  if (body.length === 0) return null;

  const path = source.oldPath ?? source.path;
  return (
    [
      `diff --git a/${path} b/${source.path}`,
      `--- a/${path}`,
      `+++ b/${source.path}`,
      ...body,
    ].join('\n') + '\n'
  );
}
