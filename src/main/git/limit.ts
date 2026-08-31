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
 * Sekiz eşzamanlı süreç.
 *
 * Git komutlarının çoğu milisaniyelerle ölçülüyor, dolayısıyla sıra beklemek
 * arayüzde hissedilmiyor. Sayı daha da düşürülürse ağ üzerinden çalışan
 * komutlar (fetch, pull) birbirini bekletmeye başlıyor; yükseltilirse sınırın
 * varlık sebebi ortadan kalkıyor.
 */
const LIMIT = 8;

let active = 0;
const bekleyenler: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (active < LIMIT) {
    active += 1;
    return;
  }
  await new Promise<void>((resolve) => bekleyenler.push(resolve));
  active += 1;
}

function release(): void {
  active -= 1;
  const next = bekleyenler.shift();
  if (next) next();
}

/**
 * İşi sınır içinde çalıştırır.
 *
 * Slot işin kendisi için alınıyor, sıraya girerken değil: depo sırasında
 * bekleyen bir komut slot tutmuyor. Tersi olsaydı, slot tutan bir komut kendi
 * önündekini beklerken kilitlenme kurabilirdi.
 */
export async function withLimit<T>(task: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await task();
  } finally {
    release();
  }
}

/** Test için: o an çalışan ve bekleyen iş sayısı. */
export function limitDurumu(): { active: number; waiting: number; limit: number } {
  return { active, waiting: bekleyenler.length, limit: LIMIT };
}
