import { describe, expect, it } from 'vitest';
import { intralineDiff, intralineRanges, type Range } from '../intraline';
import type { DiffLine } from '@shared/types';

/**
 * Satır içi fark. Yanlış hesaplanan bir aralık kullanıcıya değişmeyen bir yeri
 * değişmiş gösteriyor — satır bazlı diff'ten daha kötü bir durum, çünkü artık
 * vurguya güveniliyor.
 */

/** Aralıkları okunur kılmak için: metnin vurgulanan bölümlerini döndürür. */
function slices(text: string, ranges: Range[]): string[] {
  return ranges.map(([start, end]) => text.slice(start, end));
}

describe('intralineDiff', () => {
  it('yalnızca değişen kelimeyi işaretler', () => {
    const removed = 'const timeout = 30;';
    const added = 'const timeout = 60;';

    const diff = intralineDiff(removed, added);

    expect(diff).not.toBeNull();
    expect(slices(removed, diff!.removed)).toEqual(['30']);
    expect(slices(added, diff!.added)).toEqual(['60']);
  });

  it('eklenen kelimeyi silinen tarafta işaretlemez', () => {
    const removed = 'if (value) {';
    const added = 'if (value && ready) {';

    const diff = intralineDiff(removed, added);

    expect(diff!.removed).toEqual([]);
    expect(slices(added, diff!.added).join('')).toBe(' && ready');
  });

  it('bitişik değişiklikleri tek aralıkta birleştirir', () => {
    // "ab" yerine iki ayrı "a" ve "b" vurgusu çıkması okunaklı değil.
    const diff = intralineDiff('user.name', 'user.title');

    expect(diff!.added).toHaveLength(1);
    expect(slices('user.title', diff!.added)).toEqual(['title']);
  });

  it('Türkçe harfleri kelime içinde tutar', () => {
    const removed = 'const başlık = "eski";';
    const added = 'const başlık = "yeni";';

    const diff = intralineDiff(removed, added);

    // "başlık" değişmediği için hiç vurgulanmamalı.
    expect(slices(removed, diff!.removed)).toEqual(['eski']);
    expect(slices(added, diff!.added)).toEqual(['yeni']);
  });

  it('birbirine hiç benzemeyen satırlarda vurgu üretmez', () => {
    // Satırın tamamı değiştiyse her yeri boyamak bilgi taşımıyor.
    expect(intralineDiff('const a = 1;', 'return renderTemplate(config, target);')).toBeNull();
  });

  it('aynı satırda null döner', () => {
    expect(intralineDiff('aynı', 'aynı')).toBeNull();
  });

  it('boş satırda null döner', () => {
    expect(intralineDiff('', 'yeni')).toBeNull();
    expect(intralineDiff('eski', '')).toBeNull();
  });

  it('çok uzun satırda hesaplamayı hiç başlatmaz', () => {
    // Küçültülmüş bir dosyada tek satır on binlerce token olabiliyor.
    const long = 'a b '.repeat(500);
    expect(intralineDiff(long, `${long}c`)).toBeNull();
  });
});

describe('intralineRanges', () => {
  const line = (kind: DiffLine['kind'], content: string): DiffLine => ({
    kind,
    content,
    oldLine: null,
    newLine: null,
  });

  it('arka arkaya gelen silinen ve eklenen satırları sırayla eşler', () => {
    const lines = [
      line('context', 'başlangıç'),
      line('del', 'let a = 1;'),
      line('del', 'let b = 2;'),
      line('add', 'let a = 9;'),
      line('add', 'let b = 8;'),
    ];

    const ranges = intralineRanges(lines);

    expect(slices('let a = 1;', ranges.get(1)!)).toEqual(['1']);
    expect(slices('let b = 2;', ranges.get(2)!)).toEqual(['2']);
    expect(slices('let a = 9;', ranges.get(3)!)).toEqual(['9']);
    expect(slices('let b = 8;', ranges.get(4)!)).toEqual(['8']);
  });

  it('eşi olmayan satırı vurgulamaz', () => {
    // İki silinene karşılık tek ekleme varsa ikinci silinenin karşılığı yok.
    const lines = [line('del', 'let a = 1;'), line('del', 'let b = 2;'), line('add', 'let a = 9;')];

    const ranges = intralineRanges(lines);

    expect(ranges.has(0)).toBe(true);
    expect(ranges.has(1)).toBe(false);
  });

  it('yalnızca eklemeden oluşan bloğu boş bırakır', () => {
    const lines = [line('add', 'yeni satır'), line('add', 'bir tane daha')];

    expect(intralineRanges(lines).size).toBe(0);
  });
});
