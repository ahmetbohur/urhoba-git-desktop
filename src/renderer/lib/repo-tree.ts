import type { Repo, RepoDirtyCount } from '@shared/types';

/**
 * Depo listesini kenar çubuğunun çizeceği satırlara çevirir.
 *
 * Saf fonksiyon: gruplama, süzme ve sıralama kuralları burada, çizim
 * bileşende. Kurallar birikince (sabitlenenler, arama, etiket süzgeci,
 * katlanmış gruplar) bunları bileşen içinde tutmak hem okunmaz hem test
 * edilemez hâle geliyordu.
 */

export type SidebarRow =
  | { kind: 'section'; id: string; label: string }
  | { kind: 'group'; id: string; name: string; count: number; collapsed: boolean; changes: number }
  | { kind: 'repo'; id: string; repo: Repo; changes: number | null; indented: boolean };

export interface BuildOptions {
  repos: Repo[];
  query: string;
  activeTags: string[];
  collapsed: string[];
  dirty: RepoDirtyCount[];
}

const UNGROUPED = '__ungrouped__';

function matches(repo: Repo, needle: string): boolean {
  if (needle.length === 0) return true;
  const haystack = [repo.name, repo.path, repo.groupName ?? '', ...(repo.tags ?? [])]
    .join(' ')
    .toLocaleLowerCase('tr');
  return haystack.includes(needle);
}

export function buildSidebarRows(options: BuildOptions): SidebarRow[] {
  const needle = options.query.trim().toLocaleLowerCase('tr');
  const collapsed = new Set(options.collapsed);
  const changesById = new Map(options.dirty.map((entry) => [entry.repoId, entry.changes]));

  const visible = options.repos.filter((repo) => {
    if (!matches(repo, needle)) return false;
    if (options.activeTags.length === 0) return true;
    // Etiket süzgeci "ve" değil "veya": birden çok etiket seçmek listeyi
    // daraltmak yerine genişletiyor, insanların beklediği bu.
    return options.activeTags.some((tag) => (repo.tags ?? []).includes(tag));
  });

  const rows: SidebarRow[] = [];
  const changesOf = (repo: Repo) => changesById.get(repo.id) ?? null;

  const pinned = visible.filter((repo) => repo.pinned);
  if (pinned.length > 0) {
    rows.push({ kind: 'section', id: 'pinned', label: 'Sabitlenenler' });
    for (const repo of sortRepos(pinned)) {
      rows.push({ kind: 'repo', id: repo.id, repo, changes: changesOf(repo), indented: false });
    }
  }

  const rest = visible.filter((repo) => !repo.pinned);
  const byGroup = new Map<string, Repo[]>();
  for (const repo of rest) {
    const key = repo.groupName ?? UNGROUPED;
    const list = byGroup.get(key) ?? [];
    list.push(repo);
    byGroup.set(key, list);
  }

  const groupNames = [...byGroup.keys()].sort((a, b) => {
    // Gruplanmamışlar her zaman en altta.
    if (a === UNGROUPED) return 1;
    if (b === UNGROUPED) return -1;
    const sizeDifference = (byGroup.get(b)?.length ?? 0) - (byGroup.get(a)?.length ?? 0);
    if (sizeDifference !== 0) return sizeDifference;
    return a.localeCompare(b, 'tr');
  });

  for (const name of groupNames) {
    const members = sortRepos(byGroup.get(name) ?? []);
    if (name === UNGROUPED) {
      rows.push({ kind: 'section', id: 'ungrouped', label: 'Gruplanmamış' });
      for (const repo of members) {
        rows.push({ kind: 'repo', id: repo.id, repo, changes: changesOf(repo), indented: false });
      }
      continue;
    }

    // Arama yapılırken gruplar açık gösteriliyor: aradığın şeyi bulup sonra
    // grubu açmak zorunda kalmak, aramayı işe yaramaz hâle getirir.
    const isCollapsed = needle.length === 0 && collapsed.has(name);
    const changes = members.reduce((total, repo) => total + (changesOf(repo) ?? 0), 0);
    rows.push({
      kind: 'group',
      id: `group-${name}`,
      name,
      count: members.length,
      collapsed: isCollapsed,
      changes,
    });
    if (isCollapsed) continue;
    for (const repo of members) {
      rows.push({ kind: 'repo', id: repo.id, repo, changes: changesOf(repo), indented: true });
    }
  }

  return rows;
}

function sortRepos(repos: Repo[]): Repo[] {
  return [...repos].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}
