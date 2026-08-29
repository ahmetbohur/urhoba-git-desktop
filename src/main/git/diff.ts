import type { DiffHunk, FileDiff } from '@shared/types';

/**
 * Unified diff ayrıştırıcısı.
 *
 * Kendi ayrıştırıcımızı yazmamızın sebebi ileride satır bazlı stage: her satırın
 * eski/yeni dosyadaki numarasını ve hangi hunk'a ait olduğunu bilmemiz gerekiyor.
 * Hazır diff bileşenleri bu veriyi geri vermiyor.
 */

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

/** Bu eşiğin üstündeki diff'ler arayüzü kilitler; hunk üretmeden işaretleriz. */
const MAX_DIFF_BYTES = 3 * 1024 * 1024;

export function parseUnifiedDiff(raw: string, fallbackPath: string): FileDiff {
  const result: FileDiff = {
    path: fallbackPath,
    isBinary: false,
    isTooLarge: false,
    hunks: [],
    additions: 0,
    deletions: 0,
  };

  if (raw.length === 0) return result;
  if (Buffer.byteLength(raw, 'utf8') > MAX_DIFF_BYTES) {
    result.isTooLarge = true;
    return result;
  }

  const lines = raw.split('\n');
  let current: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      // "diff --git a/eski b/yeni" — yol boşluk içerebildiği için a/ ve b/ öneklerine göre kesiyoruz.
      const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      if (match) {
        if (match[1] !== match[2]) result.oldPath = match[1];
        result.path = match[2];
      }
      continue;
    }
    if (line.startsWith('Binary files ') || line.startsWith('GIT binary patch')) {
      result.isBinary = true;
      result.hunks = [];
      return result;
    }
    if (line.startsWith('rename from ')) {
      result.oldPath = line.slice('rename from '.length);
      continue;
    }
    if (
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ') ||
      line.startsWith('new file mode') ||
      line.startsWith('deleted file mode') ||
      line.startsWith('old mode') ||
      line.startsWith('new mode') ||
      line.startsWith('similarity index') ||
      line.startsWith('rename to ')
    ) {
      continue;
    }

    const hunkMatch = HUNK_HEADER.exec(line);
    if (hunkMatch) {
      current = {
        header: line,
        oldStart: Number(hunkMatch[1]),
        oldCount: hunkMatch[2] === undefined ? 1 : Number(hunkMatch[2]),
        newStart: Number(hunkMatch[3]),
        newCount: hunkMatch[4] === undefined ? 1 : Number(hunkMatch[4]),
        lines: [],
      };
      oldLine = current.oldStart;
      newLine = current.newStart;
      result.hunks.push(current);
      continue;
    }

    if (!current) continue;

    if (line.startsWith('\\')) {
      // "\ No newline at end of file" — önceki satırın parçası, ayrı satır sayılmaz.
      current.lines.push({ kind: 'meta', content: line.slice(2), oldLine: null, newLine: null });
      continue;
    }

    const marker = line[0];
    const content = line.slice(1);
    if (marker === '+') {
      current.lines.push({ kind: 'add', content, oldLine: null, newLine });
      newLine += 1;
      result.additions += 1;
    } else if (marker === '-') {
      current.lines.push({ kind: 'del', content, oldLine, newLine: null });
      oldLine += 1;
      result.deletions += 1;
    } else if (marker === ' ') {
      current.lines.push({ kind: 'context', content, oldLine, newLine });
      oldLine += 1;
      newLine += 1;
    }
    // Diğer her şey (boş son satır dahil) yok sayılır.
  }

  return result;
}
