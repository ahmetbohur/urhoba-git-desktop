/**
 * `git clone --progress` çıktısının ayrıştırılması.
 *
 * Git ilerlemeyi stderr'e, satır sonu yerine satır başı (\r) ile basıyor;
 * dolayısıyla akış tek satırın sürekli üzerine yazılması gibi geliyor. Bizim
 * işimiz bu gürültüden anlamlı bir aşama adı ve yüzde çıkarmak.
 *
 * Aşamaların ağırlıkları eşit değil: nesneleri almak (receiving) toplam sürenin
 * çoğunu kaplarken delta çözümü kısa sürüyor. Kullanıcıya tek bir ilerleyen
 * yüzde göstermek için aşamaları ağırlıklandırıyoruz — aksi hâlde çubuk üç kez
 * sıfırdan başlıyor ve iş geriye gidiyormuş gibi görünüyor.
 */

interface Phase {
  pattern: RegExp;
  label: string;
  /** Toplam ilerlemedeki payı. */
  weight: number;
  /** Bu aşamadan önce tamamlanmış sayılan pay. */
  offset: number;
}

const PHASES: Phase[] = [
  { pattern: /Counting objects:\s+(\d+)%/, label: 'Nesneler sayılıyor', weight: 5, offset: 0 },
  {
    pattern: /Compressing objects:\s+(\d+)%/,
    label: 'Nesneler sıkıştırılıyor',
    weight: 10,
    offset: 5,
  },
  { pattern: /Receiving objects:\s+(\d+)%/, label: 'İndiriliyor', weight: 70, offset: 15 },
  {
    pattern: /Resolving deltas:\s+(\d+)%/,
    label: 'Değişiklikler çözülüyor',
    weight: 10,
    offset: 85,
  },
  {
    pattern: /Updating files:\s+(\d+)%/,
    label: 'Dosyalar yazılıyor',
    weight: 5,
    offset: 95,
  },
];

export interface CloneProgressUpdate {
  phase: string;
  /** 0-100 arası, aşamalar boyunca tek yönlü artan. */
  percent: number;
}

export function parseCloneProgress(chunk: string): CloneProgressUpdate | null {
  // Son satır en güncel durumu taşır; \r ile ayrılmış parçaları da bölüyoruz.
  const segments = chunk.split(/[\r\n]+/).filter((segment) => segment.trim().length > 0);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    for (const phase of PHASES) {
      const match = phase.pattern.exec(segment);
      if (!match) continue;
      const local = Number(match[1]);
      return {
        phase: phase.label,
        percent: Math.min(100, Math.round(phase.offset + (local / 100) * phase.weight)),
      };
    }
  }
  return null;
}
