import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from './client';
import { buildPatch } from './patch';
import { getFileDiff } from './status';
import type { HunkSelection, LineStageMode } from '@shared/types';

/**
 * Satır bazlı hazırlama.
 *
 * Arayüz yalnızca hangi hunk'tan hangi satırların seçildiğini gönderiyor; yamayı
 * burada, o anki diff'ten yeniden üretiyoruz. Yamanın metnini IPC'den geçirmek
 * de mümkündü ama o zaman kullanıcı seçim yaptıktan sonra dosya değişirse eski
 * bir yama uygulanmaya çalışılırdı. Bu yolda git, dosya değişmişse yamayı
 * reddediyor ve kullanıcı bunu hata olarak görüyor — sessizce yanlış satırı
 * hazırlamaktan iyi.
 */

async function applyPatch(
  repoId: string,
  repoPath: string,
  patch: string,
  toIndex: boolean,
): Promise<void> {
  // `git apply` yamayı stdin'den de okuyabilir; geçici dosya kullanmak
  // ayrıştırma ve kaçış sürprizlerine kapalı olduğu için tercih edildi.
  const patchFile = path.join(os.tmpdir(), `urhoba-${randomUUID()}.patch`);
  await fs.promises.writeFile(patchFile, patch, 'utf8');
  try {
    const args = ['apply', '--whitespace=nowarn'];
    if (toIndex) args.push('--cached');
    args.push(patchFile);
    await run({ repoId, repoPath, args });
  } finally {
    await fs.promises.rm(patchFile, { force: true });
  }
}

export async function stageLines(
  repoId: string,
  repoPath: string,
  filePath: string,
  mode: LineStageMode,
  selections: HunkSelection[],
): Promise<void> {
  // Yama, işlemin yönüne göre farklı diff'ten üretiliyor: hazırlıktan çıkarma
  // HEAD ile index arasındaki farka, diğer ikisi index ile çalışma dizinine bakar.
  const diff = await getFileDiff(repoId, repoPath, filePath, mode === 'unstage');
  if (diff.isBinary) {
    throw new Error('İkili dosyalarda satır bazlı işlem yapılamaz.');
  }
  if (diff.isTooLarge) {
    throw new Error('Bu dosyanın farkı satır bazlı işlem için fazla büyük.');
  }

  const patch = buildPatch(diff, selections, mode);
  if (!patch) {
    throw new Error('Seçili satırlardan uygulanabilir bir değişiklik çıkmadı.');
  }

  await applyPatch(repoId, repoPath, patch, mode !== 'discard');
}
