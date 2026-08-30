import { describe, expect, it } from 'vitest';
import { missingScope, sanitizeRepoName } from '../publish';

/**
 * Yayınlamanın saf parçaları. Ağ ya da git süreci gerektirmeyen bu iki karar
 * yanlış olduğunda kullanıcı ya anlamsız bir GitHub hatası görüyor ya da
 * yayınlayabileceği bir depoda düğmenin kapalı olmasıyla karşılaşıyor.
 */

describe('sanitizeRepoName', () => {
  it('geçerli bir adı olduğu gibi bırakır', () => {
    expect(sanitizeRepoName('urhoba-git-desktop')).toBe('urhoba-git-desktop');
    expect(sanitizeRepoName('proje.v2_final')).toBe('proje.v2_final');
  });

  it('Türkçe harfleri ASCII karşılığına çevirir', () => {
    // Doğrudan tireye çevirmek "şablon" adını "-ablon" yapıyordu.
    expect(sanitizeRepoName('proje şablonu')).toBe('proje-sablonu');
    expect(sanitizeRepoName('çiğdem-ölçüm')).toBe('cigdem-olcum');
    expect(sanitizeRepoName('İstanbul Kayıt')).toBe('istanbul-Kayit');
  });

  it('kabul edilmeyen karakterleri tireye çevirip tekrarları teke indirir', () => {
    expect(sanitizeRepoName('bir  iki   üç')).toBe('bir-iki-uc');
    expect(sanitizeRepoName('a/b\\c:d')).toBe('a-b-c-d');
  });

  it('başta ve sonda nokta ya da tire bırakmaz', () => {
    // GitHub bu adları reddediyor.
    expect(sanitizeRepoName('  -proje-  ')).toBe('proje');
    expect(sanitizeRepoName('...gizli...')).toBe('gizli');
  });

  it('100 karakteri aşan adı kısaltır', () => {
    expect(sanitizeRepoName('a'.repeat(150))).toHaveLength(100);
  });

  it('hiç geçerli karakter yoksa boş dize döner', () => {
    // Arayüz bu durumda kullanıcıdan ad istiyor; uydurulmuş bir ad üretmiyoruz.
    expect(sanitizeRepoName('...')).toBe('');
  });
});

describe('missingScope', () => {
  it('repo yetkisi her iki görünürlüğe de yeter', () => {
    expect(missingScope(['repo'], true)).toBeNull();
    expect(missingScope(['repo'], false)).toBeNull();
  });

  it('public_repo yalnızca herkese açık depoya yeter', () => {
    expect(missingScope(['public_repo'], false)).toBeNull();
    expect(missingScope(['public_repo'], true)).toBe('repo');
  });

  it('yetkisiz token için eksik olanı söyler', () => {
    expect(missingScope(['gist', 'read:user'], false)).toBe('public_repo');
    expect(missingScope(['gist', 'read:user'], true)).toBe('repo');
  });

  it('yetki listesi boşsa engellemez', () => {
    /*
     * İnce ayarlı token'larda GitHub yetki başlığını hiç göndermiyor. Boş
     * listeyi "yetki yok" saymak geçerli bir token'ı reddetmek olurdu; karar
     * GitHub'a bırakılıyor.
     */
    expect(missingScope([], true)).toBeNull();
  });
});
