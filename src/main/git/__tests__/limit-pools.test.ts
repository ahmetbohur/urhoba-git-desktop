import { describe, expect, it } from 'vitest';
import { limitState, withLimit } from '../limit';

/**
 * Ağ ve yerel işlerin ayrı havuzları.
 *
 * Tek havuzken ölçüldü: `git fetch` 1655 ms slot tutuyor ve arkasındaki yerel
 * okumalar kuyrukta bekliyordu — tek başına 21 ms süren elli dört depoluk
 * sayaç taraması 446 ms'ye çıkıyordu. Havuzların gerçekten ayrı olduğu burada
 * sabitleniyor; birleşirlerse yavaşlama sessizce geri döner.
 */
describe('eşzamanlılık havuzları', () => {
  it('ağ havuzu dolduğunda yerel işler beklemiyor', async () => {
    let agiBirak: (() => void) | null = null;
    const agBitti = new Promise<void>((resolve) => {
      agiBirak = resolve;
    });

    // Ağ havuzunu sınırına kadar doldur.
    const agIsleri = Array.from({ length: limitState('network').limit }, () =>
      withLimit(() => agBitti, 'network'),
    );
    await Promise.resolve();

    // Ağ havuzu doluyken yerel bir iş hemen koşabilmeli.
    let yerelKostu = false;
    await withLimit(async () => {
      yerelKostu = true;
    }, 'local');
    expect(yerelKostu).toBe(true);

    agiBirak!();
    await Promise.all(agIsleri);
  });

  it('havuz sayaçları birbirinden bağımsız', () => {
    expect(limitState('local').limit).toBeGreaterThan(0);
    expect(limitState('network').limit).toBeGreaterThan(0);
    // Toplam sınır bağlı kalmalı: havuzları ayırmak süreç patlamasını geri
    // getirmemeli.
    expect(limitState('local').limit + limitState('network').limit).toBeLessThanOrEqual(12);
  });
});
