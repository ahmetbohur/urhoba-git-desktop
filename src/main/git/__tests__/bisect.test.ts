import { describe, expect, it } from 'vitest';
import { parseFirstBad, parseRemaining } from '../bisect';

/**
 * Git bisect'in ilerlemesini ve sonucunu yalnızca düz metin çıktısıyla
 * bildiriyor. Yanlış okunursa kullanıcı ya kaç adım kaldığını göremiyor ya da
 * arama bittiğinde suçlu commit'i hiç öğrenemiyor.
 */

describe('parseFirstBad', () => {
  it('suçlu commit’i çıkarır', () => {
    const output =
      'b1946ac92492d2347c6235b4d2611184 is the first bad commit\n' +
      'commit b1946ac92492d2347c6235b4d2611184\n' +
      'Author: Ada\n';

    expect(parseFirstBad(output)).toBe('b1946ac92492d2347c6235b4d2611184');
  });

  it('kısa sha ile de çalışır', () => {
    expect(parseFirstBad('b1946ac is the first bad commit')).toBe('b1946ac');
  });

  it('arama sürerken null döner', () => {
    expect(
      parseFirstBad('Bisecting: 6 revisions left to test after this (roughly 3 steps)'),
    ).toBeNull();
  });
});

describe('parseRemaining', () => {
  it('kalan revizyon sayısını okur', () => {
    expect(parseRemaining('Bisecting: 6 revisions left to test after this (roughly 3 steps)')).toBe(
      6,
    );
  });

  it('tek revizyon kaldığında tekil biçimi de okur', () => {
    // Git bir kaldığında "revision" yazıyor, "revisions" değil.
    expect(parseRemaining('Bisecting: 1 revision left to test after this (roughly 1 step)')).toBe(1);
  });

  it('sıfır kaldığında sıfır döner', () => {
    expect(parseRemaining('Bisecting: 0 revisions left to test after this (roughly 0 steps)')).toBe(
      0,
    );
  });

  it('ilgisiz çıktıda null döner', () => {
    expect(parseRemaining('abc is the first bad commit')).toBeNull();
  });
});
