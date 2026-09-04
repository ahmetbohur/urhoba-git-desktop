/**
 * Eşzamanlı git süreci sınırı.
 *
 * Depo sırası (`queue.ts`) aynı deponun komutlarını diziyor ama depolar
 * arasında bir sınır yoktu: elli deponun sayacı tek seferde elli git süreci
 * başlatıyordu, otomatik pull da aynı anda elli fetch açıyordu. macOS'ta
 * süreç ve dosya tanıtıcısı sınırları dar olduğu için orada çökmeye kadar
 * gidebiliyor.
 *
 * Sınır tek bir yerde, git'i gerçekten çalıştıran noktada duruyor. Sayaç,
 * otomatik pull, etkinlik özeti — hepsi aynı kapıdan geçtiği için her yeni
 * çağıran kendiliğinden kapsanıyor; her birine ayrı sınır koymak unutulmaya
 * açık olurdu.
 */

/**
 * Ağ ve yerel işler ayrı havuzlarda.
 *
 * Tek havuzken ölçüldü: geçmiş sekmesine geçerken çalışan `git fetch` 1655 ms
 * sürüyor ve slotları tuttuğu için arkasındaki yerel okumalar kuyrukta
 * bekliyordu — tek başına 21 ms süren elli dört depoluk sayaç taraması
 * fetch'in arkasında 446 ms'ye çıkıyordu. Yerel komutlar milisaniyelerle,
 * ağ komutları saniyelerle ölçülüyor; ikisini aynı kuyruğa koymak hızlı olanı
 * yavaş olanın hızına indiriyor.
 *
 * Toplam sınır yine bağlı (altı artı dört): havuzları ayırmak, sınırın
 * varlık sebebi olan süreç patlamasını geri getirmiyor.
 */
const LIMITS = {
  local: 6,
  network: 4,
} as const;

export type Pool = keyof typeof LIMITS;

interface State {
  active: number;
  waiting: Array<() => void>;
}

const pools: Record<Pool, State> = {
  local: { active: 0, waiting: [] },
  network: { active: 0, waiting: [] },
};

async function acquire(pool: Pool): Promise<void> {
  const state = pools[pool];
  if (state.active < LIMITS[pool]) {
    state.active += 1;
    return;
  }
  await new Promise<void>((resolve) => state.waiting.push(resolve));
  state.active += 1;
}

function release(pool: Pool): void {
  const state = pools[pool];
  state.active -= 1;
  const next = state.waiting.shift();
  if (next) next();
}

/**
 * İşi sınır içinde çalıştırır.
 *
 * Slot işin kendisi için alınıyor, sıraya girerken değil: depo sırasında
 * bekleyen bir komut slot tutmuyor. Tersi olsaydı, slot tutan bir komut kendi
 * önündekini beklerken kilitlenme kurabilirdi.
 */
export async function withLimit<T>(task: () => Promise<T>, pool: Pool = 'local'): Promise<T> {
  await acquire(pool);
  try {
    return await task();
  } finally {
    release(pool);
  }
}

/** Test için: havuz başına o an çalışan ve bekleyen iş sayısı. */
export function limitState(pool: Pool = 'local'): {
  active: number;
  waiting: number;
  limit: number;
} {
  return { active: pools[pool].active, waiting: pools[pool].waiting.length, limit: LIMITS[pool] };
}
