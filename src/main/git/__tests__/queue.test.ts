import { describe, expect, it } from 'vitest';
import { drain, enqueue } from '../queue';

/**
 * Depo başına komut sırası.
 *
 * Bu modülün tek işi aynı depoda iki yazma komutunun çakışmasını önlemek.
 * Bozulduğunda hiçbir hata çıkmıyor: kullanıcı ara sıra `index.lock` hatası
 * alıyor, sebebi hiçbir yerde görünmüyor ve tekrarı da rastgele. Bu yüzden
 * sıranın kendisi sınanıyor.
 */

function bekleyen<T>() {
  let bitir!: (value: T) => void;
  const sozu = new Promise<T>((resolve) => {
    bitir = resolve;
  });
  return { sozu, bitir };
}

describe('enqueue', () => {
  it('aynı anahtarda işleri sırayla çalıştırıyor', async () => {
    const sira: string[] = [];
    const ilk = bekleyen<void>();

    const a = enqueue('depo', async () => {
      sira.push('a-başladı');
      await ilk.sozu;
      sira.push('a-bitti');
    });
    const b = enqueue('depo', async () => {
      sira.push('b-başladı');
    });

    // b, a bitmeden başlamamalı.
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(sira).toEqual(['a-başladı']);

    ilk.bitir();
    await Promise.all([a, b]);
    expect(sira).toEqual(['a-başladı', 'a-bitti', 'b-başladı']);
  });

  it('farklı anahtarları birbirine bekletmiyor', async () => {
    /*
     * Sıranın amacı aynı deponun komutlarını dizmek; farklı depoları da
     * dizseydi elli depolu bir taramada her şey tek sıraya girerdi.
     */
    const tutulan = bekleyen<void>();
    let digerCalisti = false;

    const bekleyenIs = enqueue('depo-a', () => tutulan.sozu);
    await enqueue('depo-b', async () => {
      digerCalisti = true;
    });

    expect(digerCalisti).toBe(true);
    tutulan.bitir();
    await bekleyenIs;
  });

  it('hata veren iş zinciri koparmıyor', async () => {
    /*
     * En sinsi kırılma bu olurdu: başarısız bir komuttan sonra o deponun
     * bütün komutları sessizce çalışmaz hâle gelirdi.
     */
    await expect(
      enqueue('depo', async () => {
        throw new Error('patla');
      }),
    ).rejects.toThrow('patla');

    await expect(enqueue('depo', async () => 'sonraki')).resolves.toBe('sonraki');
  });

  it('hatayı yutmuyor, çağırana iletiyor', async () => {
    // Zincir kopmasın diye içeride catch var; o catch hatayı çağırandan
    // gizlemiş olsaydı başarısız bir pull sessizce başarılı görünürdü.
    const sonuc = enqueue('depo', async () => {
      throw new Error('görünmeli');
    });
    await expect(sonuc).rejects.toThrow('görünmeli');
  });

  it('işin dönüş değerini geçiriyor', async () => {
    await expect(enqueue('depo', async () => 42)).resolves.toBe(42);
  });

  it('drain bekleyen işleri bitene kadar bekliyor', async () => {
    let bitti = false;
    const tutulan = bekleyen<void>();
    const is = enqueue('depo-drain', async () => {
      await tutulan.sozu;
      bitti = true;
    });

    setTimeout(() => tutulan.bitir(), 5);
    await drain();
    expect(bitti).toBe(true);
    await is;
  });

  it('sıraya giren işler eklenme sırasını koruyor', async () => {
    const sira: number[] = [];
    const isler = [1, 2, 3, 4, 5].map((n) =>
      enqueue('depo-sira', async () => {
        // Farklı süreler: sıra korunmuyorsa sonuç karışır.
        await new Promise((resolve) => setTimeout(resolve, 6 - n));
        sira.push(n);
      }),
    );
    await Promise.all(isler);
    expect(sira).toEqual([1, 2, 3, 4, 5]);
  });
});
