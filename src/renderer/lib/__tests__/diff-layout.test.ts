import { describe, expect, it } from 'vitest';
import { pairLinesForSideBySide } from '../diff-layout';
import type { DiffLine } from '@shared/types';

function line(kind: DiffLine['kind'], content: string): DiffLine {
  return { kind, content, oldLine: null, newLine: null };
}

describe('pairLinesForSideBySide', () => {
  it('bağlam satırını iki sütunda da gösterir', () => {
    const pairs = pairLinesForSideBySide([line('context', 'aynı')]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].left?.line.content).toBe('aynı');
    expect(pairs[0].right?.line.content).toBe('aynı');
  });

  it('eşit sayıda silme ve eklemeyi karşılıklı dizer', () => {
    const pairs = pairLinesForSideBySide([
      line('del', 'eski-1'),
      line('del', 'eski-2'),
      line('add', 'yeni-1'),
      line('add', 'yeni-2'),
    ]);

    expect(pairs.map((pair) => [pair.left?.line.content, pair.right?.line.content])).toEqual([
      ['eski-1', 'yeni-1'],
      ['eski-2', 'yeni-2'],
    ]);
  });

  it('sadece ekleme varsa sol taraf boş kalır', () => {
    const pairs = pairLinesForSideBySide([line('add', 'yeni')]);
    expect(pairs[0].left).toBeNull();
    expect(pairs[0].right?.line.content).toBe('yeni');
  });

  it('blok uzunlukları farklıysa fazlalığı tek başına yazar', () => {
    const pairs = pairLinesForSideBySide([
      line('del', 'eski'),
      line('add', 'yeni-1'),
      line('add', 'yeni-2'),
    ]);

    expect(pairs).toHaveLength(2);
    expect(pairs[0].left?.line.content).toBe('eski');
    expect(pairs[1].left).toBeNull();
    expect(pairs[1].right?.line.content).toBe('yeni-2');
  });

  it('orijinal satır dizinlerini korur — seçim bu dizinlere dayanıyor', () => {
    const pairs = pairLinesForSideBySide([
      line('context', 'a'),
      line('del', 'b'),
      line('add', 'c'),
    ]);

    expect(pairs[1].left?.index).toBe(1);
    expect(pairs[1].right?.index).toBe(2);
  });

  it('araya giren bağlam satırı blokları ayırır', () => {
    const pairs = pairLinesForSideBySide([
      line('del', 'eski-1'),
      line('context', 'ara'),
      line('add', 'yeni-1'),
    ]);

    expect(pairs).toHaveLength(3);
    expect(pairs[0].right).toBeNull();
    expect(pairs[2].left).toBeNull();
  });
});
