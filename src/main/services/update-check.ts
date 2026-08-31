import { app } from 'electron';
import { emitAppEvent } from './events';
import { log } from './logger';
import * as store from './store';
import type { UpdateStatus } from '@shared/types';

/**
 * Yeni sürüm kontrolü.
 *
 * `updater.ts` ile karıştırılmamalı: o dosya Electron'un `autoUpdater`'ını
 * kuruyor ve indirip kuruyor, ama yalnızca imzalı macOS/Windows paketlerinde
 * çalışıyor — Linux'ta paket baştan çıkıyor. Buradaki kontrol hiçbir şey
 * indirmiyor, yalnızca "yenisi var" deyip yayın sayfasını gösteriyor. Üç
 * platformda da çalışan tek yol bu.
 *
 * Depo herkese açık olduğu için istek token istemiyor; `github/api.ts`
 * kullanılmıyor, o katman her çağrıda token arıyor. Kullanıcının GitHub'a
 * giriş yapmamış olması sürüm kontrolünü engellememeli.
 */

const RELEASES_ENDPOINT =
  'https://api.github.com/repos/ahmetbohur/urhoba-git-desktop/releases/latest';

const TIMEOUT_MS = 10_000;

/** Günde bir. Sürüm kontrolü acil bir şey değil; sık sormak kimseye bir şey kazandırmıyor. */
const CHECK_INTERVAL_MS = 24 * 3600_000;

/** Zamanın gelip gelmediğine sık bakılıyor; karar diskteki son kontrol anına göre veriliyor. */
const TICK_MS = 15 * 60_000;

interface RawRelease {
  tag_name?: string;
  html_url?: string;
  body?: string | null;
  published_at?: string | null;
  draft?: boolean;
  prerelease?: boolean;
}

/**
 * Sürüm dizesini sayılara ayırır. Baştaki `v` ve `-beta.1` gibi ekler
 * ayıklanıyor; etiketler `v1.2.0` biçiminde, `app.getVersion()` ise `1.2.0`.
 */
function parseVersion(value: string): { core: number[]; pre: string | null } | null {
  const trimmed = value.trim().replace(/^v/i, '');
  const [corePart, ...preParts] = trimmed.split('-');
  const core = corePart.split('.').map((part) => Number.parseInt(part, 10));
  if (core.length === 0 || core.some((part) => !Number.isFinite(part))) return null;
  return { core, pre: preParts.length > 0 ? preParts.join('-') : null };
}

/**
 * İki sürümü karşılaştırır: a > b ise pozitif, a < b ise negatif.
 * Çözülemeyen bir sürüm 0 döndürüyor — bilinmeyen bir biçime bakıp
 * "güncelleme var" demek, olmayan bir sürümü göstermekten kötü.
 */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;

  const length = Math.max(left.core.length, right.core.length);
  for (let index = 0; index < length; index += 1) {
    // Eksik bölüm sıfır sayılıyor: 1.2 ile 1.2.0 aynı sürüm.
    const diff = (left.core[index] ?? 0) - (right.core[index] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }

  // Çekirdek eşitse ön sürüm daha eski: 1.3.0-beta < 1.3.0.
  if (left.pre === right.pre) return 0;
  if (left.pre === null) return 1;
  if (right.pre === null) return -1;
  return left.pre < right.pre ? -1 : 1;
}

/**
 * Yayın kaydından duruma karar verir.
 *
 * Ağdan ayrı bir saf fonksiyon: "hangi durumda rozet çıkar" sorusunun cevabı
 * yanlış olduğunda kullanıcı ya olmayan bir güncellemeyi görüyor ya da olanı
 * kaçırıyor, ikisi de sessiz. Bu yüzden git ya da ağ olmadan test edilebiliyor.
 */
export function decideUpdate(input: {
  currentVersion: string;
  release: RawRelease | null;
  /** Kullanıcının "şimdilik geç" dediği sürüm. */
  skippedVersion: string | null;
}): Pick<
  UpdateStatus,
  'latestVersion' | 'updateAvailable' | 'releaseUrl' | 'releaseNotes' | 'publishedAt'
> {
  const { currentVersion, release, skippedVersion } = input;
  const tag = release?.tag_name?.trim();

  /*
   * Taslak ve ön sürümler atlanıyor. `releases/latest` uç noktası zaten
   * bunları döndürmüyor ama farklı bir kaynağa bakıldığında sessizce
   * kullanıcıyı yarım bir yayına yönlendirmesin.
   */
  if (!tag || release?.draft || release?.prerelease) {
    return {
      latestVersion: null,
      updateAvailable: false,
      releaseUrl: null,
      releaseNotes: null,
      publishedAt: null,
    };
  }

  const latestVersion = tag.replace(/^v/i, '');
  const newer = compareVersions(latestVersion, currentVersion) > 0;
  // Atlanan sürüm bir daha sorulmuyor; ondan sonrası yine soruluyor.
  const skipped = skippedVersion !== null && compareVersions(latestVersion, skippedVersion) <= 0;

  return {
    latestVersion,
    updateAvailable: newer && !skipped,
    releaseUrl: release?.html_url ?? null,
    releaseNotes: release?.body?.trim() || null,
    publishedAt: release?.published_at ?? null,
  };
}

async function fetchLatestRelease(): Promise<RawRelease> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(RELEASES_ENDPOINT, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Urhoba-Git-Desktop',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`GitHub yanıtı: HTTP ${response.status}`);
    }
    return (await response.json()) as RawRelease;
  } finally {
    clearTimeout(timer);
  }
}

/** Son kontrolün sonucu. Ağa yeniden gitmeden arayüze verilebilsin diye tutuluyor. */
let cached: UpdateStatus | null = null;

function currentVersion(): string {
  return app.getVersion();
}

function emptyStatus(error: string | null): UpdateStatus {
  return {
    currentVersion: currentVersion(),
    latestVersion: null,
    updateAvailable: false,
    releaseUrl: null,
    releaseNotes: null,
    publishedAt: null,
    checkedAt: null,
    error,
  };
}

/**
 * Ağa gitmeden bilinen durumu döndürür.
 *
 * "Yeni sürüm var mı" kararı her okumada yeniden veriliyor, kontrol anında bir
 * kez değil: kullanıcı bu arada "şimdilik geç" demiş olabilir ve o karar ağa
 * yeniden gitmeyi gerektirmemeli.
 */
export function getUpdateStatus(): UpdateStatus {
  if (!cached) return emptyStatus(null);
  const skipped = store.getSkippedUpdateVersion();
  const latest = cached.latestVersion;
  const available =
    latest !== null &&
    compareVersions(latest, currentVersion()) > 0 &&
    (skipped === null || compareVersions(latest, skipped) > 0);
  return { ...cached, currentVersion: currentVersion(), updateAvailable: available };
}

/**
 * Kontrolü çalıştırır.
 *
 * Hata atmıyor: ağ yoksa ya da GitHub istek sınırına takıldıysa bu bir arıza
 * değil, "şu an bilinmiyor" demek. Durumun içinde taşınıyor ki arayüz
 * kullanıcı açıkça istediğinde gösterebilsin, arka plan kontrolünde sussun.
 */
export async function checkForUpdate(): Promise<UpdateStatus> {
  const now = new Date();
  try {
    const release = await fetchLatestRelease();
    cached = {
      currentVersion: currentVersion(),
      checkedAt: now.toISOString(),
      error: null,
      ...decideUpdate({
        currentVersion: currentVersion(),
        release,
        skippedVersion: store.getSkippedUpdateVersion(),
      }),
    };
    if (cached.updateAvailable) {
      log('info', 'Yeni sürüm bulundu', {
        current: cached.currentVersion,
        latest: cached.latestVersion,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Önceki başarılı sonucu silmiyoruz; geçici bir ağ kesintisi bilinen
    // güncellemeyi ekrandan kaldırmamalı.
    cached = {
      ...(cached ?? emptyStatus(null)),
      checkedAt: cached?.checkedAt ?? null,
      error: message,
    };
  }
  store.setLastUpdateCheckAt(now);
  return getUpdateStatus();
}

/** Bu sürüm bir daha sorulmasın. */
export function skipUpdate(version: string): UpdateStatus {
  store.setSkippedUpdateVersion(version);
  return getUpdateStatus();
}

let timer: NodeJS.Timeout | null = null;

async function runIfDue(): Promise<void> {
  if (!store.getSettings().updateCheck) return;
  const last = store.getLastUpdateCheckAt();
  if (last && Date.now() - last.getTime() < CHECK_INTERVAL_MS) return;

  const status = await checkForUpdate();
  /*
   * Arayüz bu olayı beklemek zorunda değil — durumu kendisi de sorabiliyor —
   * ama uygulama günlerce açık kaldığında rozetin çıkması için bir sebep
   * gerekiyor. Yalnızca gerçekten yeni sürüm varken yayınlanıyor; sessiz
   * geçen kontrol arayüzü hiç ilgilendirmiyor.
   */
  if (status.updateAvailable) emitAppEvent({ type: 'update:available', status });
}

export function startUpdateSchedule(): void {
  stopUpdateSchedule();
  timer = setInterval(() => {
    void runIfDue().catch((error) => {
      log('warn', 'Sürüm kontrolü yapılamadı', { error: String(error) });
    });
  }, TICK_MS);
  // İlk kontrol açılışta: uygulama kapalıyken yeni sürüm çıkmış olabilir.
  void runIfDue().catch(() => undefined);
}

export function stopUpdateSchedule(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
