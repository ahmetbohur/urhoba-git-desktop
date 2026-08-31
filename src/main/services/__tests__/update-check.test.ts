import { describe, expect, it } from 'vitest';
import { compareVersions, decideUpdate } from '../update-check';

/**
 * Sürüm kontrolünün kararı.
 *
 * Yanlış karar iki yönde de sessiz: olmayan bir güncellemeyi göstermek ya da
 * olanı hiç göstermemek. İkisi de kullanıcıya hata olarak görünmüyor, o yüzden
 * kararın ağdan bağımsız test edilebilmesi gerekiyor.
 */

describe('compareVersions', () => {
  it('sayısal bölümleri sayı olarak karşılaştırıyor', () => {
    // Dize karşılaştırması burada yanılırdı: '10' < '9' çıkardı.
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareVersions('1.2.0', '1.2.0')).toBe(0);
    expect(compareVersions('1.2.0', '1.3.0')).toBeLessThan(0);
  });

  it('baştaki v harfini yok sayıyor', () => {
    // Etiketler 'v1.2.0', app.getVersion() ise '1.2.0' döndürüyor.
    expect(compareVersions('v1.3.0', '1.2.0')).toBeGreaterThan(0);
    expect(compareVersions('v1.2.0', '1.2.0')).toBe(0);
  });

  it('eksik bölümü sıfır sayıyor', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.2.1', '1.2')).toBeGreaterThan(0);
  });

  it('ön sürümü yayınlanmış sürümden eski sayıyor', () => {
    expect(compareVersions('1.3.0-beta.1', '1.3.0')).toBeLessThan(0);
    expect(compareVersions('1.3.0', '1.3.0-beta.1')).toBeGreaterThan(0);
  });

  it('çözülemeyen sürümde eşit diyor', () => {
    // Bilinmeyen bir biçime bakıp "güncelleme var" demek, olmayan bir sürüme
    // yönlendirmek demek; kararsızlıkta susmak doğrusu.
    expect(compareVersions('bilinmiyor', '1.2.0')).toBe(0);
    expect(compareVersions('1.2.0', '')).toBe(0);
  });
});

describe('decideUpdate', () => {
  const release = {
    tag_name: 'v1.3.0',
    html_url: 'https://github.com/ahmetbohur/urhoba-git-desktop/releases/tag/v1.3.0',
    body: '  Yenilikler  ',
    published_at: '2026-09-01T00:00:00Z',
  };

  it('yeni sürümü bildiriyor', () => {
    const result = decideUpdate({ currentVersion: '1.2.0', release, skippedVersion: null });
    expect(result.updateAvailable).toBe(true);
    expect(result.latestVersion).toBe('1.3.0');
    expect(result.releaseNotes).toBe('Yenilikler');
  });

  it('aynı sürümde susuyor', () => {
    const result = decideUpdate({ currentVersion: '1.3.0', release, skippedVersion: null });
    expect(result.updateAvailable).toBe(false);
    // Sürüm yine de biliniyor: "kontrol edildi, güncelsin" ile "hiç
    // kontrol edilmedi" arayüzde ayrı şeyler.
    expect(result.latestVersion).toBe('1.3.0');
  });

  it('yayından yeni bir sürüm çalıştırılıyorsa susuyor', () => {
    // Geliştirme sırasında sürüm yayındakinden ileride olabiliyor.
    const result = decideUpdate({ currentVersion: '1.4.0', release, skippedVersion: null });
    expect(result.updateAvailable).toBe(false);
  });

  it('atlanan sürümü bir daha sormuyor', () => {
    const result = decideUpdate({ currentVersion: '1.2.0', release, skippedVersion: '1.3.0' });
    expect(result.updateAvailable).toBe(false);
  });

  it('atlanandan sonraki sürümü yine soruyor', () => {
    // Bir sürümü atlamak güncellemeleri büsbütün kapatmak değil.
    const result = decideUpdate({
      currentVersion: '1.2.0',
      release: { ...release, tag_name: 'v1.4.0' },
      skippedVersion: '1.3.0',
    });
    expect(result.updateAvailable).toBe(true);
  });

  it('taslak ve ön sürümü yok sayıyor', () => {
    for (const flag of [{ draft: true }, { prerelease: true }]) {
      const result = decideUpdate({
        currentVersion: '1.2.0',
        release: { ...release, ...flag },
        skippedVersion: null,
      });
      expect(result.updateAvailable).toBe(false);
      expect(result.latestVersion).toBeNull();
    }
  });

  it('yanıt alınamadığında güncelleme uydurmuyor', () => {
    const result = decideUpdate({ currentVersion: '1.2.0', release: null, skippedVersion: null });
    expect(result.updateAvailable).toBe(false);
    expect(result.latestVersion).toBeNull();
  });

  it('boş yayın notunu null yapıyor', () => {
    // Arayüz "not var" ile "not boş" arasında ayrım yapmak zorunda kalmasın.
    const result = decideUpdate({
      currentVersion: '1.2.0',
      release: { ...release, body: '   ' },
      skippedVersion: null,
    });
    expect(result.releaseNotes).toBeNull();
  });
});
