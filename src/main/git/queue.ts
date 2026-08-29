/**
 * Depo başına komut sırası.
 *
 * Git aynı depoda eşzamanlı iki yazma komutunu kaldırmaz: arka plandaki otomatik
 * fetch, kullanıcının commit'iyle çakışıp `index.lock` hatası üretir. Her deponun
 * komutlarını tek bir promise zincirine dizerek bunu baştan engelliyoruz.
 */

const chains = new Map<string, Promise<unknown>>();

export function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();
  // Önceki iş hata verse de zincir kopmasın diye catch ile yutuyoruz;
  // hata zaten kendi çağıranına iletilmiş oluyor.
  const next = previous.catch(() => undefined).then(task);
  chains.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}

/** Test ve kapanış için: bekleyen tüm işler bitene kadar bekle. */
export async function drain(): Promise<void> {
  await Promise.all([...chains.values()].map((p) => p.catch(() => undefined)));
}
