import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { inferGroup } from './grouping';
import type {
  AppSettings,
  AutoPullSettings,
  Repo,
  RepoSettings,
  ScopedSettings,
} from '@shared/types';

/**
 * userData altında iki JSON dosyası: depo listesi ve ayarlar.
 * Yazma atomik (geçici dosya + rename) — uygulama yazma sırasında kapanırsa
 * yarım dosya kalmasın.
 */

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  language: 'tr',
  defaults: {
    autoPull: {
      enabled: false,
      intervalMinutes: 10,
      onlyWhenClean: true,
      fastForwardOnly: true,
    },
    autoFetch: true,
    // Bulut AI varsayılan olarak kapalı: kod dışarı çıkacaksa bu bilinçli bir
    // karar olmalı, sessiz bir varsayılan değil.
    allowCloudAi: false,
    // AI varsayılan olarak kapalı: kullanıcı açıkça açmadan hiçbir istek gitmiyor.
    aiEnabled: false,
  },
  ai: {
    // Varsayılan sağlayıcı yerel: AI açıldığında da kod makineden çıkmıyor.
    provider: 'ollama',
    model: '',
    ollamaHost: 'http://127.0.0.1:11434',
  },
  sideBySideDiff: false,
  // Günlük ritme en yakın varsayılan; saatlik özet çoğu depoda boş çıkıyor.
  activityPeriod: '24h',
  // Varsayılan kapalı: kimse istemediği bir bildirimle karşılaşmamalı.
  activityAuto: false,
  // Varsayılan açık: eski bir sürümde takılı kalmak kullanıcının bilerek
  // seçtiği bir şey olmalı, farkında olmadığı bir şey değil.
  updateCheck: true,
  lastOpenedRepoId: null,
};

interface StoreShape {
  settings: AppSettings;
  repos: Repo[];
  /**
   * Yalnızca genel ayardan ayrılan alanlar tutuluyor. Bir alan burada yoksa
   * depo genel ayarı izliyor demek — genel ayar değiştiğinde o depo da
   * kendiliğinden güncelleniyor.
   */
  repoSettings: Record<string, Partial<ScopedSettings>>;
  /** Katlanmış grup adları — açık/kapalı durumu oturumlar arası korunuyor. */
  collapsedGroups?: string[];
  /**
   * Son kendiliğinden özetin çıkarıldığı an, ISO. Diskte tutuluyor ki uygulama
   * kapalıyken geçen süre atlanmasın ve iki özet çakışmasın.
   */
  lastActivityDigestAt?: string;
  /** Son sürüm kontrolünün anı, ISO. Her açılışta GitHub'a gitmemek için diskte. */
  lastUpdateCheckAt?: string;
  /**
   * Kullanıcının "şimdilik geç" dediği sürüm. Bundan sonrası yine soruluyor —
   * bir sürümü atlamak güncellemeleri büsbütün kapatmak anlamına gelmemeli.
   */
  skippedUpdateVersion?: string;
}

let cache: StoreShape | null = null;

function storePath(): string {
  return path.join(app.getPath('userData'), 'urhoba-store.json');
}

function writeAtomic(file: string, contents: string): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, contents, 'utf8');
  fs.renameSync(tmp, file);
}

function load(): StoreShape {
  if (cache) return cache;
  const file = storePath();
  let parsed: Partial<StoreShape> = {};
  try {
    if (fs.existsSync(file)) {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<StoreShape>;
    }
  } catch {
    // Bozuk dosyada varsayılana düş; kullanıcının depo listesini kaybetmemek için
    // bozuk dosyayı yedekleyip devam ediyoruz.
    try {
      fs.renameSync(file, `${file}.corrupt-${Date.now()}`);
    } catch {
      /* yedekleme başarısız olsa da açılışı engellemeyelim */
    }
  }
  const legacyAiEnabled = (parsed.settings?.ai as { enabled?: boolean } | undefined)?.enabled;

  cache = {
    settings: {
      ...DEFAULT_SETTINGS,
      ...(parsed.settings ?? {}),
      // İç içe nesneler yayılma ile birleşmediği için ayrıca ele alınıyor;
      // eski kayıtlarda `ai` alanı hiç yok.
      ai: { ...DEFAULT_SETTINGS.ai, ...(parsed.settings?.ai ?? {}) },
      defaults: {
        ...DEFAULT_SETTINGS.defaults,
        // AI'ın açık olması eskiden `ai.enabled` idi; kullanıcı AI'ı açtıysa
        // güncellemeden sonra kapanmış bulmasın.
        ...(legacyAiEnabled === undefined ? {} : { aiEnabled: legacyAiEnabled }),
        ...(parsed.settings?.defaults ?? {}),
        autoPull: {
          ...DEFAULT_SETTINGS.defaults.autoPull,
          // Eski kayıtlarda bu alan `defaultAutoPull` adıyla duruyordu.
          ...((parsed.settings as { defaultAutoPull?: AutoPullSettings } | undefined)
            ?.defaultAutoPull ?? {}),
          ...(parsed.settings?.defaults?.autoPull ?? {}),
        },
      },
    },
    repos: Array.isArray(parsed.repos) ? parsed.repos : [],
    repoSettings: parsed.repoSettings ?? {},
    collapsedGroups: parsed.collapsedGroups ?? [],
    lastActivityDigestAt: parsed.lastActivityDigestAt,
    lastUpdateCheckAt: parsed.lastUpdateCheckAt,
    skippedUpdateVersion: parsed.skippedUpdateVersion,
  };

  /*
   * Gruplama eklenmeden önce kaydedilmiş depolarda grup bilgisi yok. Yol
   * elimizde olduğu için geriye dönük çıkarabiliyoruz; kullanıcı hiçbir şey
   * yapmadan listesi düzenlenmiş oluyor.
   */
  let migrated = false;
  for (const repo of cache.repos) {
    if (repo.groupName === undefined) {
      repo.groupName = inferGroup(repo.path) ?? undefined;
      migrated = true;
    }
  }
  if (migrated) persist();

  return cache;
}

function persist(): void {
  if (!cache) return;
  writeAtomic(storePath(), JSON.stringify(cache, null, 2));
}

export function getSettings(): AppSettings {
  return { ...load().settings };
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const store = load();
  store.settings = { ...store.settings, ...patch };
  persist();
  return { ...store.settings };
}

export function getRepos(): Repo[] {
  return [...load().repos].sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
}

export function findRepo(id: string): Repo | undefined {
  return load().repos.find((r) => r.id === id);
}

export function findRepoByPath(repoPath: string): Repo | undefined {
  const normalized = path.resolve(repoPath);
  return load().repos.find((r) => path.resolve(r.path) === normalized);
}

export function saveRepo(repo: Repo): Repo {
  const store = load();
  const index = store.repos.findIndex((r) => r.id === repo.id);
  if (index >= 0) store.repos[index] = repo;
  else store.repos.push(repo);
  persist();
  return repo;
}

/** Depo kaydının bir bölümünü günceller; bilinmeyen id sessizce yok sayılır. */
export function updateRepo(id: string, patch: Partial<Repo>): Repo | undefined {
  const store = load();
  const repo = store.repos.find((r) => r.id === id);
  if (!repo) return undefined;
  Object.assign(repo, patch);
  persist();
  return repo;
}

/** Son kendiliğinden özetin anı; hiç çıkmadıysa null. */
export function getLastActivityDigestAt(): Date | null {
  const value = load().lastActivityDigestAt;
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function setLastActivityDigestAt(at: Date): void {
  load().lastActivityDigestAt = at.toISOString();
  persist();
}

/** Son sürüm kontrolünün anı; hiç yapılmadıysa null. */
export function getLastUpdateCheckAt(): Date | null {
  const value = load().lastUpdateCheckAt;
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function setLastUpdateCheckAt(at: Date): void {
  load().lastUpdateCheckAt = at.toISOString();
  persist();
}

export function getSkippedUpdateVersion(): string | null {
  return load().skippedUpdateVersion ?? null;
}

export function setSkippedUpdateVersion(version: string): void {
  load().skippedUpdateVersion = version;
  persist();
}

export function getCollapsedGroups(): string[] {
  return [...(load().collapsedGroups ?? [])];
}

export function setGroupCollapsed(name: string, collapsed: boolean): void {
  const store = load();
  const current = new Set(store.collapsedGroups ?? []);
  if (collapsed) current.add(name);
  else current.delete(name);
  store.collapsedGroups = [...current];
  persist();
}

/** Bir grubun bütün depolarını yeni ada taşır. */
export function renameGroup(from: string, to: string): void {
  const store = load();
  for (const repo of store.repos) {
    if (repo.groupName === from) {
      repo.groupName = to;
      repo.groupPinnedByUser = true;
    }
  }
  const collapsed = new Set(store.collapsedGroups ?? []);
  if (collapsed.delete(from)) collapsed.add(to);
  store.collapsedGroups = [...collapsed];
  persist();
}

/** Tanımlı bütün etiketler — etiket seçicisinde öneri olarak kullanılıyor. */
export function getAllTags(): string[] {
  const tags = new Set<string>();
  for (const repo of load().repos) {
    for (const tag of repo.tags ?? []) tags.add(tag);
  }
  return [...tags].sort((a, b) => a.localeCompare(b, 'tr'));
}

export function removeRepo(id: string): void {
  const store = load();
  store.repos = store.repos.filter((r) => r.id !== id);
  delete store.repoSettings[id];
  if (store.settings.lastOpenedRepoId === id) store.settings.lastOpenedRepoId = null;
  persist();
}

export function touchRepo(id: string): void {
  const store = load();
  const repo = store.repos.find((r) => r.id === id);
  if (!repo) return;
  repo.lastOpenedAt = new Date().toISOString();
  store.settings.lastOpenedRepoId = id;
  persist();
}

/**
 * Bir depo için geçerli ayarları çözer: genel varsayılanların üstüne o deponun
 * kendi seçtiği alanlar biniyor. `overrides` hangi alanların depoya özel
 * olduğunu söylüyor — arayüz "genel" ile "bu depoya özel" ayrımını buradan
 * gösteriyor.
 */
export function getRepoSettings(id: string): RepoSettings {
  const store = load();
  const defaults = store.settings.defaults;
  const own = store.repoSettings[id] ?? {};

  return {
    autoPull: { ...(own.autoPull ?? defaults.autoPull) },
    autoFetch: own.autoFetch ?? defaults.autoFetch,
    allowCloudAi: own.allowCloudAi ?? defaults.allowCloudAi,
    aiEnabled: own.aiEnabled ?? defaults.aiEnabled,
    overrides: {
      autoPull: own.autoPull !== undefined,
      autoFetch: own.autoFetch !== undefined,
      allowCloudAi: own.allowCloudAi !== undefined,
      aiEnabled: own.aiEnabled !== undefined,
    },
  };
}

/**
 * Depo ayarını günceller. Bir alana `null` verilmesi "genel ayara dön" demek;
 * o alan kayıttan siliniyor ve depo yeniden genel ayarı izlemeye başlıyor.
 */
export function updateRepoSettings(
  id: string,
  patch: {
    autoPull?: AutoPullSettings | null;
    autoFetch?: boolean | null;
    allowCloudAi?: boolean | null;
    aiEnabled?: boolean | null;
  },
): RepoSettings {
  const store = load();
  const own = { ...(store.repoSettings[id] ?? {}) };

  for (const key of ['autoPull', 'autoFetch', 'allowCloudAi', 'aiEnabled'] as const) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value === null) delete own[key];
    else (own as Record<string, unknown>)[key] = value;
  }

  if (Object.keys(own).length === 0) delete store.repoSettings[id];
  else store.repoSettings[id] = own;
  persist();
  return getRepoSettings(id);
}

export function getAllRepoSettings(): Array<{ repo: Repo; settings: RepoSettings }> {
  return getRepos().map((repo) => ({ repo, settings: getRepoSettings(repo.id) }));
}
