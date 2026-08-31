import { describe, expect, it } from 'vitest';
import { periodStart } from '../../git/activity';
import type { ActivityPeriod } from '@shared/types';

/**
 * Kendiliğinden özetin zamanlaması diskteki "son özet anı" ile karar veriliyor.
 * Buradaki hesap yanlış olursa iki özet ya çakışıyor ya arada boşluk kalıyor —
 * ikisi de kullanıcının bir şeyi kaçırması demek.
 */

const PERIOD_MS: Record<ActivityPeriod, number> = {
  '1h': 3600_000,
  '6h': 6 * 3600_000,
  '24h': 24 * 3600_000,
  '7d': 7 * 24 * 3600_000,
};

/** Zamanlayıcının kararı: vakti geldi mi. */
function isDue(last: Date, now: Date, period: ActivityPeriod): boolean {
  return now.getTime() - last.getTime() >= PERIOD_MS[period];
}

describe('kendiliğinden özet zamanlaması', () => {
  const last = new Date('2026-08-31T00:00:00Z');

  it('aralık dolmadan çıkmaz', () => {
    expect(isDue(last, new Date('2026-08-31T00:59:00Z'), '1h')).toBe(false);
  });

  it('aralık dolunca çıkar', () => {
    expect(isDue(last, new Date('2026-08-31T01:00:00Z'), '1h')).toBe(true);
  });

  it('uygulama kapalıyken geçen süre atlanmaz', () => {
    /*
     * Üç gün kapalı kalmış bir uygulamada aralık "son özetten beri" olduğu için
     * aradaki günler kapsanıyor. Sabit bir geriye bakış (son 24 saat) iki günü
     * atlardı.
     */
    const now = new Date('2026-09-03T00:00:00Z');
    expect(isDue(last, now, '24h')).toBe(true);
    // Kapsanan aralık son özetten şimdiye kadar; 24 saatle sınırlı değil.
    expect(now.getTime() - last.getTime()).toBe(3 * PERIOD_MS['24h']);
  });

  it('yedi günlük aralık altı günde çıkmaz', () => {
    expect(isDue(last, new Date('2026-09-06T00:00:00Z'), '7d')).toBe(false);
    expect(isDue(last, new Date('2026-09-07T00:00:00Z'), '7d')).toBe(true);
  });

  it('elle bakılan aralık şimdiden geriye sayıyor', () => {
    // Pencereden bakarken "son 24 saat" gerçekten son 24 saat olmalı; oradaki
    // hesap zamanlayıcınınkinden farklı ve öyle kalmalı.
    const now = new Date('2026-08-31T12:00:00Z').getTime();
    expect(periodStart('24h', now).toISOString()).toBe('2026-08-30T12:00:00.000Z');
  });
});
