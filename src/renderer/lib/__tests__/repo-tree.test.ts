import { describe, expect, it } from 'vitest';
import { buildSidebarRows, type SidebarRow } from '../repo-tree';
import type { Repo } from '@shared/types';

function repo(name: string, extra: Partial<Repo> = {}): Repo {
  return {
    id: name,
    name,
    path: `/p/${name}`,
    addedAt: '2026-01-01T00:00:00Z',
    lastOpenedAt: '2026-01-01T00:00:00Z',
    ...extra,
  };
}

function build(repos: Repo[], overrides: Partial<Parameters<typeof buildSidebarRows>[0]> = {}) {
  return buildSidebarRows({ repos, query: '', activeTags: [], collapsed: [], dirty: [], ...overrides });
}

const labels = (rows: SidebarRow[]) =>
  rows.map((row) =>
    row.kind === 'repo' ? row.repo.name : row.kind === 'group' ? `[${row.name}]` : `<${row.label}>`,
  );

describe('buildSidebarRows', () => {
  it('depoları gruplarına ayırır', () => {
    const rows = build([
      repo('fateai', { groupName: 'fateai-base' }),
      repo('fate-ai-backend', { groupName: 'fateai-base' }),
      repo('akari-pro', { groupName: 'Individual' }),
    ]);

    expect(labels(rows)).toEqual([
      '[fateai-base]',
      'fate-ai-backend',
      'fateai',
      '[Individual]',
      'akari-pro',
    ]);
  });

  it('kalabalık grubu öne alır', () => {
    const rows = build([
      repo('a', { groupName: 'küçük' }),
      repo('b', { groupName: 'büyük' }),
      repo('c', { groupName: 'büyük' }),
    ]);
    expect(labels(rows)[0]).toBe('[büyük]');
  });

  it('gruplanmamışları en alta koyar', () => {
    const rows = build([repo('yalnız'), repo('a', { groupName: 'grup' })]);
    expect(labels(rows)).toEqual(['[grup]', 'a', '<Gruplanmamış>', 'yalnız']);
  });

  it('sabitlenenleri en üste ayrı bölüme alır', () => {
    const rows = build([
      repo('a', { groupName: 'grup' }),
      repo('favori', { groupName: 'grup', pinned: true }),
    ]);
    expect(labels(rows)).toEqual(['<Sabitlenenler>', 'favori', '[grup]', 'a']);
  });

  it('katlanmış grubun üyelerini gizler', () => {
    const rows = build(
      [repo('a', { groupName: 'grup' }), repo('b', { groupName: 'grup' })],
      { collapsed: ['grup'] },
    );
    expect(labels(rows)).toEqual(['[grup]']);
    expect((rows[0] as Extract<SidebarRow, { kind: 'group' }>).count).toBe(2);
  });

  it('arama yapılırken katlanmış grupları açar', () => {
    // Aradığını bulup sonra grubu açmak zorunda kalmak aramayı işe yaramaz kılar.
    const rows = build(
      [repo('aranan', { groupName: 'grup' }), repo('diger', { groupName: 'grup' })],
      { collapsed: ['grup'], query: 'aranan' },
    );
    expect(labels(rows)).toEqual(['[grup]', 'aranan']);
  });

  it('arama grup adında ve etiketlerde de eşleşir', () => {
    const repos = [
      repo('bir', { groupName: 'oyunlar' }),
      repo('iki', { tags: ['arşiv'] }),
      repo('uc'),
    ];
    expect(labels(build(repos, { query: 'oyun' }))).toEqual(['[oyunlar]', 'bir']);
    expect(labels(build(repos, { query: 'arşiv' }))).toEqual(['<Gruplanmamış>', 'iki']);
  });

  it('etiket süzgeci seçilen etiketlerden herhangi birine bakar', () => {
    const repos = [
      repo('a', { tags: ['aktif'] }),
      repo('b', { tags: ['arşiv'] }),
      repo('c', { tags: ['aktif', 'arşiv'] }),
      repo('d'),
    ];
    const rows = build(repos, { activeTags: ['aktif'] });
    expect(labels(rows).filter((l) => !l.startsWith('<'))).toEqual(['a', 'c']);

    const both = build(repos, { activeTags: ['aktif', 'arşiv'] });
    expect(both.filter((r) => r.kind === 'repo')).toHaveLength(3);
  });

  it('grup başlığında üyelerin değişiklik sayısını toplar', () => {
    const rows = build(
      [repo('a', { groupName: 'g' }), repo('b', { groupName: 'g' })],
      { dirty: [{ repoId: 'a', changes: 3 }, { repoId: 'b', changes: 2 }] },
    );
    const group = rows[0] as Extract<SidebarRow, { kind: 'group' }>;
    expect(group.changes).toBe(5);
  });

  it('okunamayan depo rozeti bozmaz', () => {
    const rows = build([repo('a', { groupName: 'g' })], {
      dirty: [{ repoId: 'a', changes: null }],
    });
    expect((rows[0] as Extract<SidebarRow, { kind: 'group' }>).changes).toBe(0);
    expect((rows[1] as Extract<SidebarRow, { kind: 'repo' }>).changes).toBeNull();
  });
});
