import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { inferGroup } from './grouping';
import type { AppSettings, Repo, RepoSettings } from '@shared/types';

/**
 * userData altında iki JSON dosyası: depo listesi ve ayarlar.
 * Yazma atomik (geçici dosya + rename) — uygulama yazma sırasında kapanırsa
 * yarım dosya kalmasın.
 */

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  language: 'tr',
  defaultAutoPull: {
    enabled: false,
    intervalMinutes: 10,
    onlyWhenClean: true,
    fastForwardOnly: true,
  },
  autoFetchIntervalMinutes: 10,
  ai: {
    // AI varsayılan olarak kapalı ve yerel: kullanıcı açıkça açmadan hiçbir
    // istek gitmiyor, açtığında da kod makineden çıkmıyor.
    enabled: false,
    provider: 'ollama',
    model: '',
    ollamaHost: 'http://127.0.0.1:11434',
  },
  sideBySideDiff: false,
  lastOpenedRepoId: null,
};

interface StoreShape {
  settings: AppSettings;
  repos: Repo[];
  repoSettings: Record<string, RepoSettings>;
  /** Katlanmış grup adları — açık/kapalı durumu oturumlar arası korunuyor. */
  collapsedGroups?: string[];
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
  cache = {
    settings: {
      ...DEFAULT_SETTINGS,
      ...(parsed.settings ?? {}),
      // İç içe nesneler yayılma ile birleşmediği için ayrıca ele alınıyor;
      // eski kayıtlarda `ai` alanı hiç yok.
      ai: { ...DEFAULT_SETTINGS.ai, ...(parsed.settings?.ai ?? {}) },
    },
    repos: Array.isArray(parsed.repos) ? parsed.repos : [],
    repoSettings: parsed.repoSettings ?? {},
    collapsedGroups: parsed.collapsedGroups ?? [],
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

/** Depo bazlı ayar yoksa uygulama varsayılanından türetilir. */
export function getRepoSettings(id: string): RepoSettings {
  const store = load();
  const existing = store.repoSettings[id];
  if (existing) return { ...existing, autoPull: { ...existing.autoPull } };
  return {
    autoPull: { ...store.settings.defaultAutoPull },
    autoFetch: true,
    // Bulut sağlayıcıya kod göndermek her depo için ayrı ayrı açılır.
    allowCloudAi: false,
  };
}

export function updateRepoSettings(id: string, patch: Partial<RepoSettings>): RepoSettings {
  const store = load();
  const next: RepoSettings = { ...getRepoSettings(id), ...patch };
  store.repoSettings[id] = next;
  persist();
  return next;
}

export function getAllRepoSettings(): Array<{ repo: Repo; settings: RepoSettings }> {
  return getRepos().map((repo) => ({ repo, settings: getRepoSettings(repo.id) }));
}
