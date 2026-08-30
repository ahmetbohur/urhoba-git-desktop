import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { inferGroup, sortGroupNames } from '../grouping';

describe('inferGroup', () => {
  it('proje kümesindeki depoyu küme adıyla gruplar', () => {
    expect(inferGroup('/home/u/Projects/Individual/fateai-base/fateai')).toBe('fateai-base');
    expect(inferGroup('/home/u/Projects/Individual/fateai-base/fate-ai-backend')).toBe(
      'fateai-base',
    );
  });

  it('tek başına duran depoyu üst klasörüyle gruplar', () => {
    expect(inferGroup('/home/u/Projects/Individual/akari-pro')).toBe('Individual');
  });

  it('sondaki eğik çizgiyi yok sayar', () => {
    expect(inferGroup('/home/u/Projects/Individual/akari-pro/')).toBe('Individual');
  });

  it('kök dizindeki depo için grup üretmez', () => {
    expect(inferGroup('/proje')).toBeNull();
  });

  it('göreli yolu çözerek çalışır', () => {
    const expected = path.basename(path.dirname(path.resolve('bir/iki/uc')));
    expect(inferGroup('bir/iki/uc')).toBe(expected);
  });
});

describe('sortGroupNames', () => {
  it('kalabalık grupları öne alır', () => {
    const counts = new Map([
      ['Individual', 28],
      ['fateai-base', 2],
      ['swipegames-base', 2],
    ]);
    expect(sortGroupNames(counts)).toEqual(['Individual', 'fateai-base', 'swipegames-base']);
  });

  it('eşit büyüklükte Türkçe sıralama kullanır', () => {
    const counts = new Map([
      ['zebra', 1],
      ['çilek', 1],
      ['armut', 1],
    ]);
    expect(sortGroupNames(counts)).toEqual(['armut', 'çilek', 'zebra']);
  });
});
