import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from '../diff';
import { buildPatch, invertDiff } from '../patch';
import type { HunkSelection } from '@shared/types';

/**
 * Yama üretimi projenin en ince yeri: yanlış üretilmiş bir yama ya sessizce
 * reddedilir ya da kullanıcının seçmediği satırları hazırlar. Bu testler
 * üretilen metni satır satır doğruluyor; entegrasyon testleri de aynı yamaları
 * gerçek git'e uygulatıyor.
 */

const TWO_HUNK_DIFF = [
  'diff --git a/src/app.ts b/src/app.ts',
  'index 1111111..2222222 100644',
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -1,4 +1,5 @@',
  ' bir',
  '-iki',
  '+İKİ',
  '+ikibuçuk',
  ' üç',
  ' dört',
  '@@ -20,3 +21,3 @@',
  ' yirmi',
  '-yirmibir',
  '+YİRMİBİR',
  ' yirmiiki',
].join('\n');

function selection(hunkIndex: number, lineIndices: number[]): HunkSelection[] {
  return [{ hunkIndex, lineIndices }];
}

describe('invertDiff', () => {
  it('ekleme ve silmeleri yer değiştirir, satır numaralarını da çevirir', () => {
    const diff = parseUnifiedDiff(TWO_HUNK_DIFF, 'src/app.ts');
    const inverted = invertDiff(diff);

    expect(inverted.additions).toBe(diff.deletions);
    expect(inverted.deletions).toBe(diff.additions);
    expect(inverted.hunks[0].oldStart).toBe(diff.hunks[0].newStart);
    expect(inverted.hunks[0].lines.map((line) => line.kind)).toEqual([
      'context',
      'add',
      'del',
      'del',
      'context',
      'context',
    ]);
  });

  it('iki kez çevirince başa döner', () => {
    const diff = parseUnifiedDiff(TWO_HUNK_DIFF, 'src/app.ts');
    const twice = invertDiff(invertDiff(diff));
    expect(twice.hunks).toEqual(diff.hunks);
  });
});

describe('buildPatch — stage', () => {
  it('seçilmeyen ekleme satırını yamaya hiç koymaz', () => {
    const diff = parseUnifiedDiff(TWO_HUNK_DIFF, 'src/app.ts');
    // Hunk 0: [0]=context, [1]=del "iki", [2]=add "İKİ", [3]=add "ikibuçuk"
    // Yalnızca silme ve ilk eklemeyi seç.
    const patch = buildPatch(diff, selection(0, [1, 2]), 'stage');

    expect(patch).toBe(
      [
        'diff --git a/src/app.ts b/src/app.ts',
        '--- a/src/app.ts',
        '+++ b/src/app.ts',
        '@@ -1,4 +1,4 @@',
        ' bir',
        '-iki',
        '+İKİ',
        ' üç',
        ' dört',
        '',
      ].join('\n'),
    );
  });

  it('seçilmeyen silme satırını bağlama çevirir', () => {
    const diff = parseUnifiedDiff(TWO_HUNK_DIFF, 'src/app.ts');
    // Yalnızca eklemeleri seç; "iki" satırı silinmemeli, bağlam olarak kalmalı.
    const patch = buildPatch(diff, selection(0, [2, 3]), 'stage');

    expect(patch).toContain(' iki');
    expect(patch).not.toContain('-iki');
    expect(patch).toContain('+İKİ');
    expect(patch).toContain('+ikibuçuk');
    // 4 eski satır (bir, iki, üç, dört) → 6 yeni satır: iki ekleme geldi.
    expect(patch).toContain('@@ -1,4 +1,6 @@');
  });

  it('ikinci hunk’ın konumunu birinci hunk’taki net değişime göre kaydırır', () => {
    const diff = parseUnifiedDiff(TWO_HUNK_DIFF, 'src/app.ts');
    const patch = buildPatch(
      diff,
      [
        { hunkIndex: 0, lineIndices: [1, 2, 3] },
        { hunkIndex: 1, lineIndices: [1, 2] },
      ],
      'stage',
    );

    // Birinci hunk net +1 satır ekliyor (1 silme, 2 ekleme), ikinci hunk 20'den
    // 21'e kayıyor.
    expect(patch).toContain('@@ -1,4 +1,5 @@');
    expect(patch).toContain('@@ -20,3 +21,3 @@');
  });

  it('seçim yalnızca bağlam satırlarına düşerse null döner', () => {
    const diff = parseUnifiedDiff(TWO_HUNK_DIFF, 'src/app.ts');
    expect(buildPatch(diff, selection(0, [0, 4]), 'stage')).toBeNull();
  });

  it('seçilmeyen hunk’ı yamaya almaz', () => {
    const diff = parseUnifiedDiff(TWO_HUNK_DIFF, 'src/app.ts');
    const patch = buildPatch(diff, selection(1, [1, 2]), 'stage');

    expect(patch).not.toContain('İKİ');
    expect(patch).toContain('+YİRMİBİR');
    // Önceki hunk seçilmediği için kayma yok.
    expect(patch).toContain('@@ -20,3 +20,3 @@');
  });
});

describe('buildPatch — unstage ve discard', () => {
  it('ters yönde yama üretir', () => {
    const diff = parseUnifiedDiff(TWO_HUNK_DIFF, 'src/app.ts');
    const patch = buildPatch(diff, selection(0, [1, 2]), 'unstage');

    // Ters yönde: "İKİ" geri alınacak (silme), "iki" geri gelecek (ekleme).
    expect(patch).toContain('-İKİ');
    expect(patch).toContain('+iki');
  });

  it('discard da ters yama üretir; iki mod aynı metni verir', () => {
    const diff = parseUnifiedDiff(TWO_HUNK_DIFF, 'src/app.ts');
    const unstage = buildPatch(diff, selection(0, [1, 2, 3]), 'unstage');
    const discard = buildPatch(diff, selection(0, [1, 2, 3]), 'discard');

    expect(discard).toBe(unstage);
  });

  it('ters modda seçilmeyen ekleme bağlama dönüşür', () => {
    const diff = parseUnifiedDiff(TWO_HUNK_DIFF, 'src/app.ts');
    // Ters diffte satır sırası korunuyor: [1]=add(iki geri gelsin) [2]=del(İKİ gitsin)
    // Yalnızca "ikibuçuk" satırını (index 3) geri al.
    const patch = buildPatch(diff, selection(0, [3]), 'unstage');

    expect(patch).toContain('-ikibuçuk');
    // "İKİ" index'te kalmalı: bağlam satırı olarak yazılmalı.
    expect(patch).toContain(' İKİ');
    expect(patch).not.toContain('-İKİ');
    // "iki" geri getirilmiyor: yamada hiç yok.
    expect(patch).not.toContain('+iki\n');
  });
});

describe('buildPatch — yeniden adlandırma', () => {
  it('eski yolu kaynak, yeni yolu hedef olarak yazar', () => {
    const raw = [
      'diff --git a/eski.ts b/yeni.ts',
      'rename from eski.ts',
      'rename to yeni.ts',
      '@@ -1,2 +1,2 @@',
      ' bir',
      '-iki',
      '+İKİ',
    ].join('\n');
    const patch = buildPatch(parseUnifiedDiff(raw, 'yeni.ts'), selection(0, [1, 2]), 'stage');

    expect(patch).toContain('--- a/eski.ts');
    expect(patch).toContain('+++ b/yeni.ts');
  });
});
