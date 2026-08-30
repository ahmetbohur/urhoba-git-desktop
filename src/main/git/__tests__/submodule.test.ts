import { describe, expect, it } from 'vitest';
import { parseSubmoduleStatus } from '../submodule';

/**
 * `git submodule status` satırlarının baştaki tek karakteri her şeyi söylüyor
 * ve gözden kaçması kolay: eksi kurulmamış, artı farklı commit'te, boşluk
 * güncel. Yanlış okunursa kullanıcıya "her şey yolunda" denip klasörler boş
 * bırakılıyor.
 */
describe('parseSubmoduleStatus', () => {
  it('kurulmamış alt modülü tanır', () => {
    const [entry] = parseSubmoduleStatus('-b159515ffa67b699d31d583320cd7389ee0b8a1b vendor/lib');

    expect(entry.path).toBe('vendor/lib');
    expect(entry.initialized).toBe(false);
    expect(entry.outOfDate).toBe(false);
  });

  it('güncel alt modülü tanır', () => {
    const [entry] = parseSubmoduleStatus(
      ' b159515ffa67b699d31d583320cd7389ee0b8a1b vendor/lib (v1.2.0)',
    );

    expect(entry.initialized).toBe(true);
    expect(entry.outOfDate).toBe(false);
    // Etiket açıklaması yola karışmamalı.
    expect(entry.path).toBe('vendor/lib');
  });

  it('farklı commit’teki alt modülü işaretler', () => {
    const [entry] = parseSubmoduleStatus(
      '+b159515ffa67b699d31d583320cd7389ee0b8a1b vendor/lib (heads/main)',
    );

    expect(entry.initialized).toBe(true);
    expect(entry.outOfDate).toBe(true);
  });

  it('çakışmalı alt modülü işaretler', () => {
    const [entry] = parseSubmoduleStatus('Ub159515f vendor/lib');
    expect(entry.conflicted).toBe(true);
  });

  it('birden fazla satırı ayırır', () => {
    const entries = parseSubmoduleStatus(
      '-aaa111 vendor/bir\n bbb222 vendor/iki (v2)\n+ccc333 vendor/uc\n',
    );

    expect(entries.map((entry) => entry.path)).toEqual(['vendor/bir', 'vendor/iki', 'vendor/uc']);
  });

  it('alt modülü olmayan depoda boş liste döner', () => {
    expect(parseSubmoduleStatus('')).toEqual([]);
  });
});
