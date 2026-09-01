import { describe, expect, it } from 'vitest';
import { limitState, withLimit } from '../limit';

/**
 * Eşzamanlı süreç sınırı.
 *
 * Sınırın kırılması sessiz: hiçbir hata çıkmıyor, yalnızca elli git süreci
 * birden başlıyor ve sonucu ancak dar kaynaklı bir makinede (macOS) çökme
 * olarak görünüyor. Bu yüzden sınırın kendisi test ediliyor, kullanan kod
 * değil.
 */

/** İşi bekletip elle serbest bırakabilmek için. */
function bekleyen() {
  let bitir!: () => void;
  const sozu = new Promise<void>((resolve) => {
    bitir = resolve;
  });
  return { sozu, bitir };
}

describe('withLimit', () => {
  it('sınırın üstünde iş çalıştırmıyor', async () => {
    const limit = limitState().limit;
    let anlik = 0;
    let enYuksek = 0;

    const isler = Array.from({ length: limit * 4 }, () =>
      withLimit(async () => {
        anlik += 1;
        enYuksek = Math.max(enYuksek, anlik);
        // Bir sonraki olay döngüsüne bırak ki eşzamanlılık gerçekten oluşsun.
        await new Promise((resolve) => setTimeout(resolve, 1));
        anlik -= 1;
      }),
    );

    await Promise.all(isler);
    expect(enYuksek).toBe(limit);
    expect(enYuksek).toBeLessThanOrEqual(limit);
  });

  it('hepsini çalıştırıyor, hiçbirini düşürmüyor', async () => {
    const sayi = 40;
    const sonuclar = await Promise.all(
      Array.from({ length: sayi }, (_, index) => withLimit(async () => index)),
    );
    expect(sonuclar).toHaveLength(sayi);
    expect(new Set(sonuclar).size).toBe(sayi);
  });

  it('hata veren iş slotu geri veriyor', async () => {
    /*
     * `finally` olmadan hata veren bir komut slotu kalıcı olarak tutardı ve
     * yeterince hatadan sonra bütün git komutları donardı — en sinsi hâli.
     */
    const limit = limitState().limit;
    for (let index = 0; index < limit * 2; index += 1) {
      await expect(
        withLimit(async () => {
          throw new Error('patla');
        }),
      ).rejects.toThrow('patla');
    }
    expect(limitState().active).toBe(0);

    // Sınır dolmadıysa yeni iş beklemeden çalışmalı.
    await expect(withLimit(async () => 'çalıştı')).resolves.toBe('çalıştı');
  });

  it('sınır dolunca bekletiyor, boşalınca devam ediyor', async () => {
    const limit = limitState().limit;
    const tutulanlar = Array.from({ length: limit }, () => bekleyen());
    const calisan = tutulanlar.map((t) => withLimit(() => t.sozu));

    // Sınır doldu; yeni iş henüz başlamamalı.
    let basladi = false;
    const sonraki = withLimit(async () => {
      basladi = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(basladi).toBe(false);
    expect(limitState().waiting).toBeGreaterThan(0);

    tutulanlar[0].bitir();
    await sonraki;
    expect(basladi).toBe(true);

    tutulanlar.slice(1).forEach((t) => t.bitir());
    await Promise.all(calisan);
    expect(limitState().active).toBe(0);
  });
});
