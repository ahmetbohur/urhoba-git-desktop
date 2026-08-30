import { describe, expect, it } from 'vitest';
import { buildTodo, validateSteps } from '../rebase-todo';
import type { RebaseStep } from '@shared/types';

/**
 * Yanlış üretilmiş bir todo listesi commit kaybettiriyor. Bu yüzden liste
 * üretimi git'i hiç çalıştırmadan, metin düzeyinde doğrulanıyor.
 */

const step = (
  sha: string,
  action: RebaseStep['action'],
  subject = 'Bir değişiklik',
  message?: string,
): RebaseStep => ({ sha, subject, action, message });

/** Testlerde mesaj dosyası yolu öngörülebilir olsun. */
const messagePathFor = (sha: string) => `/tmp/mesaj-${sha}`;

describe('buildTodo', () => {
  it('sırayı koruyarak komutları yazar', () => {
    const todo = buildTodo([
      step('aaa1111', 'pick', 'İlk'),
      step('bbb2222', 'squash', 'İkinci'),
      step('ccc3333', 'fixup', 'Üçüncü'),
    ], messagePathFor);

    expect(todo).toBe('pick aaa1111 İlk\nsquash bbb2222 İkinci\nfixup ccc3333 Üçüncü\n');
  });

  it('atılan commit’i listeye hiç yazmaz', () => {
    // `drop` komutunu yazmak yerine satırı çıkarmak aynı sonucu veriyor ve
    // eski git sürümlerinde de çalışıyor.
    const todo = buildTodo([step('aaa1111', 'pick', 'Kalan'), step('bbb2222', 'drop', 'Giden')], messagePathFor);

    expect(todo).toBe('pick aaa1111 Kalan\n');
    expect(todo).not.toContain('bbb2222');
  });

  it('hepsi atıldığında boş metin döner', () => {
    expect(buildTodo([step('aaa1111', 'drop')], messagePathFor)).toBe('');
  });

  it('çok satırlı konuyu tek satırda tutar', () => {
    // Konu zaten tek satır olmalı; yine de todo biçimi satır başına bir komut
    // beklediği için burada bozulmadığını doğruluyoruz.
    const todo = buildTodo([step('aaa1111', 'pick', 'Başlık')], messagePathFor);
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

describe('buildTodo — mesaj değiştirme', () => {
  it('commit’in ardına mesajı uygulayan exec satırı koyar', () => {
    const todo = buildTodo(
      [step('aaa1111', 'reword', 'Eski başlık', 'Yeni başlık')],
      messagePathFor,
    );

    /*
     * Git'in kendi `reword` komutu yerine `pick` + `exec`: editör açılmıyor ve
     * hangi mesajın hangi commit'e gittiği satırın yerinden belli oluyor.
     */
    expect(todo).toBe(
      'pick aaa1111 Eski başlık\nexec git commit --amend --file="/tmp/mesaj-aaa1111"\n',
    );
    expect(todo).not.toContain('reword');
  });

  it('birden fazla mesaj değişikliğini karıştırmaz', () => {
    const todo = buildTodo(
      [
        step('aaa1111', 'reword', 'Bir', 'Yeni bir'),
        step('bbb2222', 'pick', 'İki'),
        step('ccc3333', 'reword', 'Üç', 'Yeni üç'),
      ],
      messagePathFor,
    );

    const lines = todo.trimEnd().split('\n');
    expect(lines[1]).toContain('mesaj-aaa1111');
    expect(lines[2]).toBe('pick bbb2222 İki');
    expect(lines[4]).toContain('mesaj-ccc3333');
  });
});

describe('validateSteps — mesaj değiştirme', () => {
  it('boş mesajı reddeder', () => {
    expect(validateSteps([step('aaa1111', 'reword', 'Başlık', '   ')])).toContain('mesajı boş');
  });

  it('dolu mesajı kabul eder', () => {
    expect(validateSteps([step('aaa1111', 'reword', 'Başlık', 'Yeni')])).toBeNull();
  });
});
