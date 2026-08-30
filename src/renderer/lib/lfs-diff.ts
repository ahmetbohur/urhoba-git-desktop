import type { DiffHunk } from '@shared/types';

/**
 * LFS işaretçisi farkının okunur özeti.
 *
 * LFS ile takip edilen bir dosyanın git'teki içeriği üç satırlık metin olduğu
 * için git onu ikili saymıyor ve diff olarak sha256 satırları çiziliyor.
 * Kullanıcının göreceği şey "dosya 5 MB'tan 7 MB'a çıktı" olmalı; hash'in
 * kendisi ona bir şey söylemiyor.
 *
 * Özet diff'in kendisinden çıkarılıyor, ayrı bir git çağrısıyla değil:
 * gereken bilgi zaten ekrandaki satırların içinde.
 */

export interface LfsChange {
  before: { oid: string; size: number } | null;
  after: { oid: string; size: number } | null;
}

const VERSION_LINE = 'version https://git-lfs.github.com/spec/v1';

function read(lines: string[]): { oid: string; size: number } | null {
  const oid = lines.map((line) => /^oid\s+\S+:(\S+)$/.exec(line)?.[1]).find(Boolean);
  const size = lines.map((line) => /^size\s+(\d+)$/.exec(line)?.[1]).find(Boolean);
  return oid && size ? { oid, size: Number(size) } : null;
}

export function lfsChangeFromDiff(hunks: DiffHunk[]): LfsChange | null {
  const lines = hunks.flatMap((hunk) => hunk.lines);
  // Sürüm satırı bağlam olarak da gelebiliyor (yalnızca oid ve boyut
  // değiştiğinde), o yüzden her türden satırda aranıyor.
  if (!lines.some((line) => line.content.trim() === VERSION_LINE)) return null;

  const before = read(
    lines.filter((line) => line.kind === 'del').map((line) => line.content.trim()),
  );
  const after = read(
    lines.filter((line) => line.kind === 'add').map((line) => line.content.trim()),
  );

  // İkisi de boşsa işaretçi değişmemiş demek; özet göstermenin anlamı yok.
  return before || after ? { before, after } : null;
}
