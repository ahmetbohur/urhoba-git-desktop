import type { Commit } from '@shared/types';

/**
 * Commit grafiği şerit (lane) hesabı.
 *
 * `git log --graph` çıktısını ayrıştırmak yerine kendi düzenimizi kuruyoruz:
 * o çıktı ASCII sanatı, biçimi sürümler arasında değişiyor ve tıklanabilir bir
 * arayüze çevirmek için zaten satır satır koordinat gerekiyor.
 *
 * Algoritma tek geçişte çalışıyor. Her an açık olan şeritleri "hangi commit'i
 * bekliyor" bilgisiyle tutuyoruz:
 *
 * 1. Sıradaki commit'i bekleyen bir şerit varsa commit oraya oturur; yoksa yeni
 *    bir şerit açılır (bu bir dal ucudur).
 * 2. Commit'in şeridi artık ilk ebeveyni bekler — böylece bir dal, geçmişte
 *    düz bir çizgi olarak devam eder.
 * 3. Diğer ebeveynler (merge) ya zaten beklendikleri şeride bağlanır ya da yeni
 *    şerit açar.
 * 4. Aynı commit'i bekleyen fazladan şeritler kapanır; çizgileri commit'in
 *    şeridine akar. Birden fazla çocuğu olan commit'lerde birleşme böyle görünür.
 */

export interface GraphEdge {
  /** Önceki satırdaki şerit (üst kenar). */
  from: number;
  /** Bu satırdaki şerit (alt kenar). */
  to: number;
  /** Çizgiye rengini veren şerit — dal boyunca renk sabit kalsın diye. */
  colorLane: number;
}

export interface GraphRow {
  sha: string;
  lane: number;
  /** Bu satırda çizilecek bağlantılar. */
  edges: GraphEdge[];
  /** Bu satırda açık olan toplam şerit sayısı — sütun genişliği için. */
  width: number;
}

/**
 * Şeritlere renk atarken şerit indeksini doğrudan kullanmıyoruz: kapanan bir
 * şerit yeniden açıldığında rengi de değişsin ki iki farklı dal aynı sütunda
 * aynı renge düşmesin.
 */
function nextColor(used: Map<number, number>, lane: number, counter: { value: number }): number {
  const existing = used.get(lane);
  if (existing !== undefined) return existing;
  const color = counter.value;
  counter.value += 1;
  used.set(lane, color);
  return color;
}

export function buildGraph(commits: Commit[]): GraphRow[] {
  // lanes[i] = o şeridin beklediği commit sha'sı, boşsa null.
  const lanes: Array<string | null> = [];
  const laneColors = new Map<number, number>();
  const colorCounter = { value: 0 };
  const rows: GraphRow[] = [];

  const findFreeLane = (): number => {
    const free = lanes.indexOf(null);
    if (free !== -1) return free;
    lanes.push(null);
    return lanes.length - 1;
  };

  for (const commit of commits) {
    const before = [...lanes];

    let lane = lanes.indexOf(commit.sha);
    if (lane === -1) {
      // Hiçbir şerit bunu beklemiyordu: yeni bir dal ucu.
      lane = findFreeLane();
      laneColors.delete(lane);
    }
    const color = nextColor(laneColors, lane, colorCounter);

    // Aynı commit'i bekleyen fazladan şeritler kapanıyor.
    const merging: number[] = [];
    for (let index = 0; index < lanes.length; index += 1) {
      if (index !== lane && lanes[index] === commit.sha) {
        merging.push(index);
        lanes[index] = null;
        laneColors.delete(index);
      }
    }

    // Commit'in şeridi ilk ebeveyni beklemeye devam eder.
    const [firstParent, ...otherParents] = commit.parents;
    lanes[lane] = firstParent ?? null;
    if (!firstParent) laneColors.delete(lane);

    // Merge ebeveynleri: beklendikleri şeride bağlan, yoksa yeni şerit aç.
    const mergeTargets: number[] = [];
    for (const parent of otherParents) {
      const existing = lanes.indexOf(parent);
      if (existing !== -1) {
        mergeTargets.push(existing);
        continue;
      }
      const target = findFreeLane();
      lanes[target] = parent;
      laneColors.delete(target);
      nextColor(laneColors, target, colorCounter);
      mergeTargets.push(target);
    }

    // Sondaki boş şeritleri kırp: grafik gereksiz yere genişlemesin.
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      laneColors.delete(lanes.length - 1);
      lanes.pop();
    }

    const edges: GraphEdge[] = [];

    // Önceki satırdan gelip devam eden şeritler.
    for (let index = 0; index < before.length; index += 1) {
      const expected = before[index];
      if (expected === null) continue;
      if (expected === commit.sha) {
        // Bu şerit commit'e varıyor: ya commit'in kendi şeridi ya da birleşen bir dal.
        edges.push({ from: index, to: lane, colorLane: index === lane ? color : index });
        continue;
      }
      const stillOpen = lanes.indexOf(expected);
      if (stillOpen !== -1) {
        edges.push({
          from: index,
          to: stillOpen,
          colorLane: laneColors.get(stillOpen) ?? stillOpen,
        });
      }
    }

    // Commit bu satırda başlıyorsa (kimse onu beklemiyordu) kendi şeridinden
    // aşağı inen çizgi yukarıdaki döngüde üretilmedi; burada ekliyoruz.
    // Sıra önemli: çizim, önce ana hattı sonra merge kollarını bekliyor.
    if (firstParent && before[lane] !== commit.sha) {
      edges.push({ from: lane, to: lane, colorLane: color });
    }
    // Commit'ten aşağı doğru açılan yeni şeritler (merge ebeveynleri).
    for (const target of mergeTargets) {
      edges.push({ from: lane, to: target, colorLane: laneColors.get(target) ?? target });
    }

    rows.push({
      sha: commit.sha,
      lane,
      edges,
      width: Math.max(lanes.length, before.length, lane + 1),
    });

    void merging;
  }

  return rows;
}

/** Şerit renkleri — koyu ve açık temada da okunan, birbirinden ayrılan tonlar. */
export const GRAPH_COLORS = [
  '#5B4BA8',
  '#2E7D4F',
  '#B9702C',
  '#2A6F97',
  '#9C3D68',
  '#5E7B1F',
  '#7A4BA8',
  '#B93A2C',
] as const;

export function graphColor(colorLane: number): string {
  return GRAPH_COLORS[colorLane % GRAPH_COLORS.length];
}
