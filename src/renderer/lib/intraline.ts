import type { DiffLine } from '@shared/types';

/**
 * Satır içi (kelime düzeyinde) fark.
 *
 * Satır bazlı diff uzun bir satırda tek kelime değiştiğinde satırın tamamını
 * değişmiş gösteriyor ve gözün asıl farkı bulması gerekiyor. Burada değişen
 * bölümlerin karakter aralıkları çıkarılıyor, arayüz de yalnızca onları
 * vurguluyor.
 */

/** Değişen bölümün karakter aralığı: `[başlangıç, bitiş)`. */
export type Range = [number, number];

export interface IntralineDiff {
  removed: Range[];
  added: Range[];
}

/**
 * Kelime, boşluk ve tek tek noktalama işaretleri.
 *
 * Karakter karakter karşılaştırmak "function" ile "func" arasında dağınık
 * parçalar üretiyor; kelime bütünlüğü korununca vurgu okunabilir kalıyor.
 */
function tokenize(text: string): string[] {
  return text.match(/[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu) ?? [];
}

/**
 * Uzun satırlarda kare karmaşıklıklı karşılaştırmayı hiç başlatmıyoruz.
 * Küçültülmüş bir kod dosyasında tek satır on binlerce token olabiliyor ve
 * arayüz donuyor.
 */
const MAX_TOKENS = 400;

/**
 * Vurgunun anlamlı sayıldığı üst sınır. Satırın neredeyse tamamı değiştiyse
 * her yeri boyamak bilgi taşımıyor, yalnızca gürültü üretiyor.
 */
const MAX_CHANGED_RATIO = 0.7;

/** İki dizinin ortak en uzun alt dizisi; klasik dinamik programlama. */
function longestCommonSubsequence(a: string[], b: string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

/** Bitişik aralıkları birleştirir: "a|b" yerine tek bir "ab" vurgusu. */
function merge(ranges: Range[]): Range[] {
  const merged: Range[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && last[1] === range[0]) last[1] = range[1];
    else merged.push([...range] as Range);
  }
  return merged;
}

function totalLength(ranges: Range[]): number {
  return ranges.reduce((sum, [start, end]) => sum + (end - start), 0);
}

/**
 * İki satır arasındaki değişen bölümleri bulur.
 *
 * Vurgulanacak bir şey yoksa ya da satırlar birbirine hiç benzemiyorsa null
 * dönüyor; çağıran o zaman satırın tamamını olduğu gibi gösteriyor.
 */
export function intralineDiff(removedText: string, addedText: string): IntralineDiff | null {
  if (removedText === addedText) return null;
  if (removedText.length === 0 || addedText.length === 0) return null;

  const a = tokenize(removedText);
  const b = tokenize(addedText);
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) return null;

  const table = longestCommonSubsequence(a, b);
  const removed: Range[] = [];
  const added: Range[] = [];

  let i = 0;
  let j = 0;
  let removedOffset = 0;
  let addedOffset = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      removedOffset += a[i].length;
      addedOffset += b[j].length;
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      removed.push([removedOffset, removedOffset + a[i].length]);
      removedOffset += a[i].length;
      i += 1;
    } else {
      added.push([addedOffset, addedOffset + b[j].length]);
      addedOffset += b[j].length;
      j += 1;
    }
  }
  while (i < a.length) {
    removed.push([removedOffset, removedOffset + a[i].length]);
    removedOffset += a[i].length;
    i += 1;
  }
  while (j < b.length) {
    added.push([addedOffset, addedOffset + b[j].length]);
    addedOffset += b[j].length;
    j += 1;
  }

  const mergedRemoved = merge(removed);
  const mergedAdded = merge(added);
  if (mergedRemoved.length === 0 && mergedAdded.length === 0) return null;

  const changedRatio =
    (totalLength(mergedRemoved) + totalLength(mergedAdded)) /
    (removedText.length + addedText.length);
  if (changedRatio > MAX_CHANGED_RATIO) return null;

  return { removed: mergedRemoved, added: mergedAdded };
}

/**
 * Bir hunk'ın satırlarını eşleştirip her çift için satır içi farkı hesaplar.
 *
 * Eşleştirme yan yana görünümdekiyle aynı kuralı izliyor: arka arkaya gelen
 * silinenler ve eklenenler sırayla eşleniyor. İki görünümde farklı çiftler
 * kurmak aynı diff'i iki türlü göstermek olurdu.
 *
 * Anahtar satırın hunk içindeki sırası; değer o satırda vurgulanacak aralıklar.
 */
export function intralineRanges(lines: DiffLine[]): Map<number, Range[]> {
  const result = new Map<number, Range[]>();
  let index = 0;

  while (index < lines.length) {
    if (lines[index].kind !== 'del') {
      index += 1;
      continue;
    }

    const deletions: number[] = [];
    const additions: number[] = [];
    while (index < lines.length && lines[index].kind === 'del') {
      deletions.push(index);
      index += 1;
    }
    while (index < lines.length && lines[index].kind === 'add') {
      additions.push(index);
      index += 1;
    }

    const pairs = Math.min(deletions.length, additions.length);
    for (let pair = 0; pair < pairs; pair += 1) {
      const removedIndex = deletions[pair];
      const addedIndex = additions[pair];
      const diff = intralineDiff(lines[removedIndex].content, lines[addedIndex].content);
      if (!diff) continue;
      if (diff.removed.length > 0) result.set(removedIndex, diff.removed);
      if (diff.added.length > 0) result.set(addedIndex, diff.added);
    }
  }

  return result;
}
