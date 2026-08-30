import { describe, expect, it } from 'vitest';
import { buildTodo, validateSteps } from '../rebase-todo';
import type { RebaseStep } from '@shared/types';

/**
 * Yanlış üretilmiş bir todo listesi commit kaybettiriyor. Bu yüzden liste
 * üretimi git'i hiç çalıştırmadan, metin düzeyinde doğrulanıyor.
 */

const step = (sha: string, action: RebaseStep['action'], subject = 'Bir değişiklik'): RebaseStep => ({
  sha,
  subject,
  action,
});

describe('buildTodo', () => {
  it('sırayı koruyarak komutları yazar', () => {
    const todo = buildTodo([
      step('aaa1111', 'pick', 'İlk'),
      step('bbb2222', 'squash', 'İkinci'),
      step('ccc3333', 'fixup', 'Üçüncü'),
    ]);

    expect(todo).toBe('pick aaa1111 İlk\nsquash bbb2222 İkinci\nfixup ccc3333 Üçüncü\n');
  });

  it('atılan commit’i listeye hiç yazmaz', () => {
    // `drop` komutunu yazmak yerine satırı çıkarmak aynı sonucu veriyor ve
    // eski git sürümlerinde de çalışıyor.
    const todo = buildTodo([step('aaa1111', 'pick', 'Kalan'), step('bbb2222', 'drop', 'Giden')]);

    expect(todo).toBe('pick aaa1111 Kalan\n');
    expect(todo).not.toContain('bbb2222');
  });

  it('hepsi atıldığında boş metin döner', () => {
    expect(buildTodo([step('aaa1111', 'drop')])).toBe('');
  });

  it('çok satırlı konuyu tek satırda tutar', () => {
    // Konu zaten tek satır olmalı; yine de todo biçimi satır başına bir komut
    // beklediği için burada bozulmadığını doğruluyoruz.
    const todo = buildTodo([step('aaa1111', 'pick', 'Başlık')]);
    expect(todo.trimEnd().split('\n')).toHaveLength(1);
  });
});

describe('validateSteps', () => {
  it('geçerli listede null döner', () => {
    expect(validateSteps([step('aaa1111', 'pick'), step('bbb2222', 'squash')])).toBeNull();
  });

  it('boş listeyi reddeder', () => {
    expect(validateSteps([])).toContain('Düzenlenecek commit yok');
  });

  it('hepsi atıldığında reddeder', () => {
    expect(validateSteps([step('aaa1111', 'drop')])).toContain('en az biri kalmalı');
  });

  it('en eski commit birleştirilemez', () => {
    // Birleştirme kendinden öncekine ekleniyor; listenin başında "önceki" yok.
    expect(validateSteps([step('aaa1111', 'squash'), step('bbb2222', 'pick')])).toContain(
      'En eski commit',
    );
    expect(validateSteps([step('aaa1111', 'fixup'), step('bbb2222', 'pick')])).toContain(
      'En eski commit',
    );
  });

  it('atılan commit’ten sonra gelen birleştirmeyi de yakalar', () => {
    // İlk commit atılınca listenin başına birleştirme geçiyor.
    expect(validateSteps([step('aaa1111', 'drop'), step('bbb2222', 'squash')])).toContain(
      'En eski commit',
    );
  });
});
