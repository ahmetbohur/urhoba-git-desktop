import type { FileChange } from '@shared/types';

/**
 * Diff'i modelin bağlam sınırına sığdırmak.
 *
 * Ham diff'i sondan kesmek kötü sonuç veriyor: model dosyanın ortasında
 * kesilmiş bir değişikliği yanlış yorumluyor ve olmayan bir şeyi özetliyor.
 * Bunun yerine katman katman daraltıyoruz ve hangi katmanın kullanıldığını
 * kullanıcıya söylüyoruz — "diff büyük olduğu için yalnızca dosya listesi
 * gönderildi" bilgisi, mesajın neden yüzeysel olduğunu açıklıyor.
 */

export type DiffDetail = 'full' | 'truncated-files' | 'changed-lines' | 'file-list';

export interface DiffBudgetResult {
  text: string;
  detail: DiffDetail;
  /** Kullanıcıya gösterilecek açıklama. */
  note: string | null;
  characters: number;
}

/** Dosya başına satır sınırı: her dosyadan bir fikir vermeye yetiyor. */
const PER_FILE_LINES = 100;

function fileListSummary(files: FileChange[]): string {
  return files
    .map((file) => {
      const kind = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path;
      return `${file.kind}: ${kind}`;
    })
    .join('\n');
}

/** Bir dosyanın diff bloğunu ilk N satıra kırpar. */
function truncateFileBlocks(diff: string, perFile: number): string {
  const blocks = diff.split(/^(?=diff --git )/m).filter((block) => block.trim().length > 0);
  return blocks
    .map((block) => {
      const lines = block.split('\n');
      if (lines.length <= perFile) return block;
      return [...lines.slice(0, perFile), `… (${lines.length - perFile} satır daha)`].join('\n');
    })
    .join('\n');
}

/** Bağlam satırlarını atıp yalnızca eklenen ve silinenleri bırakır. */
function changedLinesOnly(diff: string): string {
  return diff
    .split('\n')
    .filter(
      (line) =>
        line.startsWith('diff --git ') ||
        line.startsWith('@@') ||
        line.startsWith('+') ||
        line.startsWith('-'),
    )
    .filter((line) => !line.startsWith('+++') && !line.startsWith('---'))
    .join('\n');
}

export function fitDiff(
  diff: string,
  files: FileChange[],
  limit: number,
): DiffBudgetResult {
  const measure = (text: string, detail: DiffDetail, note: string | null): DiffBudgetResult => ({
    text,
    detail,
    note,
    characters: text.length,
  });

  if (diff.length <= limit) return measure(diff, 'full', null);

  const truncated = truncateFileBlocks(diff, PER_FILE_LINES);
  if (truncated.length <= limit) {
    return measure(
      truncated,
      'truncated-files',
      `Diff büyük olduğu için dosya başına ilk ${PER_FILE_LINES} satır gönderildi.`,
    );
  }

  const changed = changedLinesOnly(diff);
  if (changed.length <= limit) {
    return measure(
      changed,
      'changed-lines',
      'Diff büyük olduğu için yalnızca değişen satırlar gönderildi, çevresindeki bağlam gönderilmedi.',
    );
  }

  return measure(
    fileListSummary(files),
    'file-list',
    'Diff çok büyük olduğu için yalnızca değişen dosyaların listesi gönderildi.',
  );
}
