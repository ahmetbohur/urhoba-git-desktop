import { describe, expect, it } from 'vitest';
import { parseReflogRange, periodStart } from '../activity';

/**
 * "Gelenler" listesi bu ayrıştırmaya dayanıyor. Yanlış bir aralık ya hiçbir
 * şey göstermiyor ya da deponun bütün geçmişini "yeni indi" diye sunuyor —
 * ikisi de özeti işe yaramaz kılıyor.
 */

const line = (sha: string, at: string, action = 'pull: fast-forward') =>
  `${sha} refs/remotes/origin/main@{${at}}: ${action}`;

describe('parseReflogRange', () => {
  const since = new Date('2026-08-31T00:00:00+03:00');

  it('pencere içindeki hareketler için taban ve tepe verir', () => {
    const raw = [
      line('ccc3333', '2026-08-31 04:00:00 +0300'),
      line('bbb2222', '2026-08-31 02:00:00 +0300'),
      // Pencerenin dışında: taban bu.
      line('aaa1111', '2026-08-30 20:00:00 +0300'),
    ].join('\n');

    expect(parseReflogRange(raw, since)).toEqual({ base: 'aaa1111', tip: 'ccc3333' });
  });

  it('pencerede hiç hareket yoksa null döner', () => {
    const raw = [line('aaa1111', '2026-08-29 10:00:00 +0300')].join('\n');
    expect(parseReflogRange(raw, since)).toBeNull();
  });

  it('bütün reflog pencerenin içindeyse en eski girdiyi taban alır', () => {
    // Dal bu aralıkta oluşmuş; alternatifi bütün geçmişi yeni saymak olurdu.
    const raw = [
      line('bbb2222', '2026-08-31 04:00:00 +0300'),
      line('aaa1111', '2026-08-31 02:00:00 +0300'),
    ].join('\n');

    expect(parseReflogRange(raw, since)).toEqual({ base: 'aaa1111', tip: 'bbb2222' });
  });

  it('taban ile tepe aynıysa null döner', () => {
    // Hareket olmuş ama sonuç aynı yer: gösterilecek commit yok.
    const raw = [
      line('aaa1111', '2026-08-31 04:00:00 +0300'),
      line('aaa1111', '2026-08-30 20:00:00 +0300'),
    ].join('\n');

    expect(parseReflogRange(raw, since)).toBeNull();
  });

  it('bozuk satırları atlar', () => {
    const raw = [
      'bu bir reflog satırı değil',
      line('bbb2222', '2026-08-31 04:00:00 +0300'),
      '',
      line('aaa1111', '2026-08-30 20:00:00 +0300'),
    ].join('\n');

    expect(parseReflogRange(raw, since)).toEqual({ base: 'aaa1111', tip: 'bbb2222' });
  });

  it('tek girdilik reflog’da aralık kurmaz', () => {
    // Dal yeni oluşmuş ve öncesi yok; neyin indiğini söyleyemeyiz.
    const raw = line('bbb2222', '2026-08-31 04:00:00 +0300');
    expect(parseReflogRange(raw, since)).toBeNull();
  });

  it('boş çıktıda null döner', () => {
    expect(parseReflogRange('', since)).toBeNull();
  });
});

describe('periodStart', () => {
  const now = new Date('2026-08-31T12:00:00Z').getTime();

  it('aralıkları doğru geriye götürür', () => {
    expect(periodStart('1h', now).toISOString()).toBe('2026-08-31T11:00:00.000Z');
    expect(periodStart('6h', now).toISOString()).toBe('2026-08-31T06:00:00.000Z');
    expect(periodStart('24h', now).toISOString()).toBe('2026-08-30T12:00:00.000Z');
    expect(periodStart('7d', now).toISOString()).toBe('2026-08-24T12:00:00.000Z');
  });
});
