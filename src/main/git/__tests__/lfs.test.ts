import { describe, expect, it } from 'vitest';
import { parseLfsPointer } from '../lfs';

/**
 * LFS işaretçisi bir görüntü dosyası gibi görünüyor ama içi üç satır metin.
 * Tanınmazsa uygulama onu çizmeye kalkıp bozuk bir kare gösteriyor; sıradan bir
 * dosyayı yanlışlıkla işaretçi sanmak ise gerçek içeriği gizliyor. İki yön de
 * test ediliyor.
 */

const pointer = [
  'version https://git-lfs.github.com/spec/v1',
  'oid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393',
  'size 12345',
  '',
].join('\n');

describe('parseLfsPointer', () => {
  it('işaretçiyi ayrıştırır', () => {
    expect(parseLfsPointer(pointer)).toEqual({
      oid: '4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393',
      size: 12345,
    });
  });

  it('Buffer ile de çalışır', () => {
    expect(parseLfsPointer(Buffer.from(pointer, 'utf8'))?.size).toBe(12345);
  });

  it('sıradan metni işaretçi sanmaz', () => {
    expect(parseLfsPointer('merhaba dünya')).toBeNull();
  });

  it('ikili içeriği işaretçi sanmaz', () => {
    // PNG başlığı: sürüm satırıyla başlamadığı için elenmeli.
    expect(parseLfsPointer(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBeNull();
  });

  it('eksik alanlı işaretçiyi reddeder', () => {
    // Sürüm satırı doğru ama oid yok; yarım bir işaretçiye güvenmek yanlış
    // boyut göstermek demek.
    expect(parseLfsPointer('version https://git-lfs.github.com/spec/v1\nsize 5\n')).toBeNull();
  });

  it('çok büyük içeriğe hiç bakmaz', () => {
    // İşaretçi dosyaları küçük; megabaytlık bir dosyayı taramanın anlamı yok.
    const büyük = `${pointer}${'a'.repeat(2000)}`;
    expect(parseLfsPointer(büyük)).toBeNull();
  });

  it('boş içerikte null döner', () => {
    expect(parseLfsPointer('')).toBeNull();
  });
});
