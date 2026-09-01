import { describe, expect, it } from 'vitest';
import { LAYOUT_DEFAULTS, clampPaneWidth, paneWidth } from '../layout';

/**
 * Bölme genişliklerinin kırpılması.
 *
 * Yanlış kırpmanın sonucu sessiz: hata çıkmıyor, sadece bir bölme kayboluyor
 * ya da geri getirilemiyor. Kullanıcının kendini köşeye sıkıştıramaması bu
 * hesaba bağlı.
 */

const GENIS = 1600;

describe('clampPaneWidth', () => {
  it('sınırlar içindeki değeri olduğu gibi bırakıyor', () => {
    expect(clampPaneWidth('sidebar', 300, GENIS)).toBe(300);
  });

  it('alt sınırın altına inmiyor', () => {
    // Sıfıra inen bir bölme geri getirilemez hâle gelirdi.
    expect(clampPaneWidth('sidebar', 0, GENIS)).toBeGreaterThanOrEqual(180);
    expect(clampPaneWidth('sidebar', -500, GENIS)).toBeGreaterThanOrEqual(180);
  });

  it('üst sınırın üstüne çıkmıyor', () => {
    expect(clampPaneWidth('sidebar', 5000, GENIS)).toBeLessThanOrEqual(480);
  });

  it('dar pencerede yanına yer bırakıyor', () => {
    /*
     * Asıl koruma bu: üst sınır tek başına yetmiyor, çünkü dar bir pencerede
     * izin verilen en geniş bölme bile geri kalanı yutabiliyor.
     */
    const dar = 600;
    const genislik = clampPaneWidth('sidebar', 480, dar);
    expect(dar - genislik).toBeGreaterThanOrEqual(380);
  });

  it('çok dar pencerede bölmeyi okunabilir bırakıyor', () => {
    // Geri kalan alan hiç sığmıyorsa bölmeyi sıfırlamak yerine alt sınırda
    // tutuyoruz; sıfır genişlikte bir bölme kullanılamaz olurdu.
    expect(clampPaneWidth('sidebar', 300, 300)).toBe(180);
  });

  it('sayı olmayan değerde varsayılana dönüyor', () => {
    // Ayar dosyası elle düzenlenmiş ya da bozulmuş olabilir.
    expect(clampPaneWidth('sidebar', Number.NaN, GENIS)).toBe(LAYOUT_DEFAULTS.sidebar);
  });

  it('her bölmenin kendi sınırları var', () => {
    // Ortak bir sınır, geniş içerikli bölmeleri gereksiz daraltırdı.
    expect(clampPaneWidth('historyCommits', 200, GENIS)).toBe(260);
    expect(clampPaneWidth('changesFiles', 200, GENIS)).toBe(220);
  });

  it('tam sayı döndürüyor', () => {
    // Kesirli piksel alt piksel bulanıklığı yapıyor.
    expect(Number.isInteger(clampPaneWidth('sidebar', 300.6, GENIS))).toBe(true);
  });
});

describe('paneWidth', () => {
  it('kayıt yoksa varsayılanı veriyor', () => {
    expect(paneWidth('sidebar', undefined, GENIS)).toBe(LAYOUT_DEFAULTS.sidebar);
  });

  it('kayıtlı değeri de kırpıyor', () => {
    // Kayıt geniş pencerede yapılmış olabilir; okurken de sınırlanması şart.
    expect(paneWidth('sidebar', 480, 600)).toBeLessThan(480);
  });
});
