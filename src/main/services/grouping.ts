import path from 'node:path';

/**
 * Bir deponun hangi gruba ait olduğunu yolundan çıkarır.
 *
 * Kural tek satır: deponun bulunduğu klasörün adı. `-base` kümeleri de üst
 * klasörler de bu kurala uyuyor —
 *
 *   …/Individual/fateai-base/fateai   →  fateai-base
 *   …/Individual/akari-pro            →  Individual
 *
 * Tarama sonucuna değil mutlak yola bakması bilinçli: elle eklenen ve klonlanan
 * depolar da aynı kuralla gruplanıyor, mevcut kayıtlara geriye dönük
 * uygulanabiliyor ve kullanıcı diskteki düzeni değiştirdiğinde sonuç
 * öngörülebilir kalıyor.
 */
export function inferGroup(repoPath: string): string | null {
  const parent = path.dirname(path.resolve(repoPath));
  const name = path.basename(parent);
  // Kök dizinde duran bir depo için grup üretmenin anlamı yok.
  if (!name || name === path.sep || parent === path.dirname(parent)) return null;
  return name;
}

/**
 * Grupları görüntüleme sırasına dizer.
 *
 * Birden çok depo içeren gruplar önce geliyor: tek başına duran projeler için
 * grup başlığı açmak listeyi uzatmaktan başka işe yaramıyor, onlar kendi üst
 * klasörlerinin altında toplanıyor zaten.
 */
export function sortGroupNames(counts: Map<string, number>): string[] {
  return [...counts.keys()].sort((a, b) => {
    const sizeDifference = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
    if (sizeDifference !== 0) return sizeDifference;
    return a.localeCompare(b, 'tr');
  });
}
