import { describe, expect, it } from 'vitest';
import { startDelays } from '../autopull';

/**
 * Otomatik pull'un ilk çalışma gecikmeleri.
 *
 * Zamanlayıcılar hep birlikte kuruluyor ve çoğu depo aynı aralığı kullanıyor;
 * dağıtılmazsa elli depo aynı saniyede fetch'e çıkıyor. Hesap yanlış olursa
 * sonuç sessiz: uygulama sorunsuz çalışır, dağıtım hiç olmaz ve kimse fark
 * etmez. Bu yüzden hesabın kendisi sınanıyor.
 */

const ON_DAKIKA = 10 * 60_000;

describe('startDelays', () => {
  it('depoları aralık boyunca dağıtıyor', () => {
    const gecikmeler = startDelays(Array(5).fill(10));
    expect(gecikmeler).toEqual([0, ON_DAKIKA * 0.2, ON_DAKIKA * 0.4, ON_DAKIKA * 0.6, ON_DAKIKA * 0.8]);
  });

  it('hiçbir gecikme aralığı aşmıyor', () => {
    // Aşsaydı depo bir turu tamamen atlardı.
    const gecikmeler = startDelays(Array(50).fill(10));
    for (const gecikme of gecikmeler) {
      expect(gecikme).toBeGreaterThanOrEqual(0);
      expect(gecikme).toBeLessThan(ON_DAKIKA);
    }
  });

  it('elli depoda hepsi farklı ana düşüyor', () => {
    /*
     * Asıl mesele bu: aynı ana düşen iki depo, dağıtımın olmadığı duruma
     * geri dönmek demek.
     */
    const gecikmeler = startDelays(Array(50).fill(10));
    expect(new Set(gecikmeler).size).toBe(50);
  });

  it('tek depoda gecikme koymuyor', () => {
    // Tek depoyu geciktirmenin bir faydası yok; ilk pull'u boşuna bekletir.
    expect(startDelays([10])).toEqual([0]);
    expect(startDelays([])).toEqual([]);
  });

  it('her depo kendi aralığına göre dağıtılıyor', () => {
    // Aralıklar farklı olabiliyor; ortak bir aralık varsayılırsa kısa aralıklı
    // depo kendi turundan uzun süre sonra başlar.
    const [ilk, ikinci] = startDelays([10, 20]);
    expect(ilk).toBe(0);
    expect(ikinci).toBe(Math.floor(0.5 * 20 * 60_000));
  });

  it('sıfır ve negatif aralığı bir dakikaya çekiyor', () => {
    // `schedule` de aynı alt sınırı uyguluyor; ikisi ayrışırsa gecikme
    // aralıktan büyük çıkar ve depo ilk turunu atlar.
    const gecikmeler = startDelays([0, -5, 0, 0]);
    for (const gecikme of gecikmeler) {
      expect(gecikme).toBeLessThan(60_000);
    }
  });

  it('ilk depo her zaman gecikmesiz başlıyor', () => {
    // Açılıştan sonra en az bir depo hemen kontrol edilsin.
    expect(startDelays(Array(20).fill(10))[0]).toBe(0);
  });
});
