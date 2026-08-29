import { describe, expect, it } from 'vitest';
import { describeStatus } from '../api';

/**
 * GitHub'ın ham hata mesajları çoğu zaman İngilizce ve bağlamsız. Kullanıcının
 * ne yapması gerektiğini söyleyen bir cümleye çevirmek arayüzün işi; bu eşleme
 * ağa çıkmadan test edilebiliyor.
 */
describe('describeStatus', () => {
  it('401’de yeniden giriş yapılması gerektiğini söyler', () => {
    expect(describeStatus(401, 'Bad credentials')).toContain('Yeniden giriş');
  });

  it('istek sınırını yetki sorunundan ayırır', () => {
    expect(describeStatus(403, 'API rate limit exceeded')).toContain('istek sınırına');
    expect(describeStatus(403, 'Resource not accessible')).toContain('yetkin yok');
  });

  it('404’te özel depo ihtimalini hatırlatır', () => {
    expect(describeStatus(404, 'Not Found')).toContain('özel');
  });

  it('422’de GitHub’ın kendi açıklamasını korur', () => {
    // Doğrulama hatalarında GitHub'ın mesajı ("A pull request already exists")
    // bizim üreteceğimiz her cümleden daha bilgilendirici.
    expect(describeStatus(422, 'A pull request already exists')).toBe(
      'A pull request already exists',
    );
  });

  it('bilinmeyen durum kodunda kodu gösterir', () => {
    expect(describeStatus(500, undefined)).toContain('500');
  });
});
