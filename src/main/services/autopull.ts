import fs from 'node:fs';
import { pull } from '../git/remote';
import { emitAppEvent } from './events';
import * as store from './store';
import type { AutoPullResult, PullResult } from '@shared/types';

/**
 * Otomatik pull zamanlayıcısı.
 *
 * Her deponun kendi aralığı olduğu için tek bir genel zamanlayıcı yerine depo
 * başına timer tutuyoruz. Güvenlik varsayılanları bilinçli olarak muhafazakâr:
 * çalışma dizini kirliyse dokunma, geçmişler ayrılmışsa birleştirme — arka planda
 * sessizce merge commit'i üretmek, kullanıcının sonradan anlamlandıramayacağı bir
 * geçmiş bırakır.
 *
 * Bir depoda pull çalışırken aynı depo için ikinci bir tur başlamaz; git komut
 * sırası zaten seri çalıştırır ama sırayı gereksiz işle doldurmanın anlamı yok.
 */

interface Scheduled {
  /** Düzenli aralık; ilk çalışma gecikmesi bitene kadar null. */
  timer: NodeJS.Timeout | null;
  /** Dağıtım gecikmesi; düzenli aralığa geçilince null. */
  startTimer: NodeJS.Timeout | null;
  running: boolean;
}

const scheduled = new Map<string, Scheduled>();

async function runOnce(repoId: string): Promise<PullResult> {
  const repo = store.findRepo(repoId);
  if (!repo) {
    return { outcome: 'error', message: 'Depo bulunamadı.', commitsPulled: 0 };
  }

  /*
   * Klasörü olmayan depoda pull denenmiyor.
   *
   * Denendiğinde git'in `cwd`'si bulunmadığı için süreç hiç başlamıyor ve
   * zamanlayıcı her tetiklendiğinde aynı hata yeniden üretiliyordu: bir
   * kullanıcının günlüğünde günler boyunca binlerce satır birikmişti.
   * Kullanıcı klasörü geri koyarsa bir sonraki tetiklemede kendiliğinden
   * devam ediyor, o yüzden zamanlayıcı iptal edilmiyor.
   */
  if (!fs.existsSync(repo.path)) {
    return {
      outcome: 'skipped-missing-folder',
      message: `Depo klasörü bulunamadı: ${repo.path}`,
      commitsPulled: 0,
    };
  }

  const settings = store.getRepoSettings(repoId);

  const result = await pull(repoId, repo.path, {
    fastForwardOnly: settings.autoPull.fastForwardOnly,
    requireClean: settings.autoPull.onlyWhenClean,
  });

  const enriched: AutoPullResult = { ...result, repoId, at: new Date().toISOString() };
  emitAppEvent({ type: 'autopull:result', result: enriched });
  if (result.commitsPulled > 0) {
    emitAppEvent({ type: 'repo:changed', repoId });
  }
  return result;
}

/** Kullanıcı "şimdi çek" dediğinde zamanlayıcıdan bağımsız çalışır. */
export async function pullNow(repoId: string): Promise<PullResult> {
  const entry = scheduled.get(repoId);
  if (entry?.running) {
    return {
      outcome: 'skipped-operation-in-progress',
      message: 'Zaten çekiliyor.',
      commitsPulled: 0,
    };
  }
  if (entry) entry.running = true;
  try {
    return await runOnce(repoId);
  } finally {
    if (entry) entry.running = false;
  }
}

/**
 * Bir deponun zamanlayıcısını kurar.
 *
 * `startDelayMs` ilk çalışmayı geciktiriyor; hesabı `startDelays` yapıyor.
 * Buna ihtiyaç var çünkü zamanlayıcılar hep birlikte kuruluyor ve hepsi aynı
 * aralığı kullanıyor: dağıtılmazsa elli deponun hepsi aynı saniyede fetch'e
 * çıkıyor. Eşzamanlı süreç sınırı çökmeyi engelliyor ama elli fetch sırayla
 * akarken uygulama saniyelerce meşgul kalıyor.
 */
function schedule(repoId: string, intervalMinutes: number, startDelayMs: number): void {
  clearFor(repoId);
  const periodMs = Math.max(1, intervalMinutes) * 60_000;

  const entry: Scheduled = { running: false, timer: null, startTimer: null };

  const tick = () => {
    if (entry.running) return;
    entry.running = true;
    void runOnce(repoId).finally(() => {
      entry.running = false;
    });
  };

  /*
   * İlk çalışma gecikmeyle başlıyor, sonrası düzenli aralıkla. Gecikme
   * depoya göre değişiyor ama rastgele değil: aynı depo her açılışta aynı
   * yere düşüyor, dolayısıyla davranış tekrarlanabilir kalıyor.
   */
  entry.startTimer = setTimeout(() => {
    entry.startTimer = null;
    tick();
    entry.timer = setInterval(tick, periodMs);
  }, startDelayMs);

  scheduled.set(repoId, entry);
}

function clearFor(repoId: string): void {
  const entry = scheduled.get(repoId);
  if (entry) {
    if (entry.startTimer) clearTimeout(entry.startTimer);
    if (entry.timer) clearInterval(entry.timer);
    scheduled.delete(repoId);
  }
}

/**
 * Ayarlar her değiştiğinde çağrılır: kayıtlı bütün depoları gezip
 * zamanlayıcıları güncel ayara göre yeniden kurar.
 */
/**
 * Depoların ilk çalışma gecikmeleri, milisaniye.
 *
 * Zamanlayıcılar hep birlikte kuruluyor ve çoğu depo aynı aralığı kullanıyor;
 * dağıtılmazsa hepsi aynı saniyede fetch'e çıkıyor. Her depo kendi aralığı
 * içinde eşit aralıklı bir noktaya yerleşiyor.
 *
 * Saf fonksiyon: yanlış hesap sessiz kalıyor — gecikmeler sıfır çıksa da
 * uygulama sorunsuz çalışır, yalnızca dağıtım hiç olmaz ve kimse fark etmez.
 */
export function startDelays(intervalMinutes: number[]): number[] {
  const total = intervalMinutes.length;
  if (total <= 1) return intervalMinutes.map(() => 0);
  return intervalMinutes.map((minutes, index) => {
    const periodMs = Math.max(1, minutes) * 60_000;
    return Math.floor((index / total) * periodMs);
  });
}

export function reconcileSchedules(): void {
  const active = new Set<string>();
  const enabled = store.getAllRepoSettings().filter((entry) => entry.settings.autoPull.enabled);
  const delays = startDelays(enabled.map((entry) => entry.settings.autoPull.intervalMinutes));

  enabled.forEach(({ repo, settings }, index) => {
    active.add(repo.id);
    schedule(repo.id, settings.autoPull.intervalMinutes, delays[index]);
  });
  for (const repoId of [...scheduled.keys()]) {
    if (!active.has(repoId)) clearFor(repoId);
  }
}

export function stopAll(): void {
  for (const repoId of [...scheduled.keys()]) clearFor(repoId);
}
