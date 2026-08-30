import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
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
  sideBySideDiff: false,
  lastOpenedRepoId: null,
};

interface StoreShape {
  settings: AppSettings;
  repos: Repo[];
  repoSettings: Record<string, RepoSettings>;
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
    settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
    repos: Array.isArray(parsed.repos) ? parsed.repos : [],
    repoSettings: parsed.repoSettings ?? {},
  };
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
