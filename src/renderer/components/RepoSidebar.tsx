import { useMemo, useState } from 'react';
import { ContextMenu, DropdownMenu } from 'radix-ui';
import {
  Activity,
  ChevronDown,
  ChevronRight,
  CloudDownload,
  FolderGit2,
  FolderOpen,
  FolderSearch,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RefreshCcwDot,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '../lib/cn';
import { useT } from '../i18n';
import { errorMessage, invoke } from '../lib/ipc';
import {
  keys,
  useAllTags,
  useDirtyCounts,
  useMutation,
  useQuery,
  useQueryClient,
  useRepos,
} from '../lib/queries';
import { buildSidebarRows, type SidebarRow } from '../lib/repo-tree';
import { relativeTime } from '../lib/format';
import { useUi } from '../stores/ui';
import { Badge, Button, EmptyState, SectionLabel, Spinner } from './primitives';
import { CloneDialog } from './dialogs/CloneDialog';
import { ScanDialog } from './dialogs/ScanDialog';
import { RepoTagsDialog } from './dialogs/RepoTagsDialog';
import { ActivityDialog } from './dialogs/ActivityDialog';
import { AiGroupDialog } from './dialogs/AiGroupDialog';
import type { Repo } from '@shared/types';

/**
 * Depo listesi.
 *
 * Satırların hangi sırada ve hangi başlık altında geleceğini `repo-tree`
 * hesaplıyor; burada yalnızca çizim ve etkileşim var. Elli deponun üstünde
 * gruplama, arama, etiket süzgeci ve sabitleme kuralları birikince ikisini bir
 * arada tutmak hem okunmaz hem test edilemez oluyordu.
 */

function RepoRow({
  repo,
  changes,
  indented,
  active,
  autoPullOn,
  groups,
  onSelect,
  onRemove,
  onTogglePin,
  onMoveToGroup,
  onEditTags,
}: {
  repo: Repo;
  changes: number | null;
  indented: boolean;
  active: boolean;
  autoPullOn: boolean;
  groups: string[];
  onSelect: () => void;
  onRemove: () => void;
  onTogglePin: () => void;
  onMoveToGroup: (group: string | null) => void;
  onEditTags: () => void;
}) {
  const t = useT();

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          className={cn(
            'group flex items-center gap-2 rounded-md py-1.5 pr-2',
            indented ? 'pl-5' : 'pl-2',
            active ? 'bg-accent-tint' : 'hover:bg-surface-2',
          )}
        >
          <button
            type="button"
            onClick={onSelect}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            {repo.pinned ? (
              <Pin className={cn('size-3.5 shrink-0', active ? 'text-accent-ink' : 'text-ink-3')} />
            ) : (
              <FolderGit2
                className={cn('size-3.5 shrink-0', active ? 'text-accent-ink' : 'text-ink-3')}
              />
            )}
            <span className="min-w-0 flex-1">
              {/*
                `truncate` kısaltılacak metnin kendi üzerinde olmalı, flex
                kapsayıcısında değil: kapsayıcıda dururken uzun ad taşıyor ve
                yanındaki otomatik pull simgesi dışarı itilip kırpılıyordu.
              */}
              <span
                className={cn(
                  'flex min-w-0 items-center gap-1.5 text-[13px] font-medium',
                  active ? 'text-accent-ink' : 'text-ink',
                )}
              >
                <span className="truncate">{repo.name}</span>
                {autoPullOn && (
                  <RefreshCcwDot className="size-3 shrink-0 text-ok" aria-label={t('Otomatik pull açık')} />
                )}
              </span>
              <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-ink-3">
                {(repo.tags ?? []).slice(0, 2).map((tag) => (
                  <span key={tag} className="truncate rounded bg-surface-3 px-1 text-[10px]">
                    {tag}
                  </span>
                ))}
                <span className="truncate">{relativeTime(repo.lastOpenedAt)}</span>
              </span>
            </span>
          </button>

          {/* Değişiklik rozeti yalnızca gerçekten değişiklik varken yer kaplasın. */}
          {changes !== null && changes > 0 && (
            <span className="shrink-0 rounded bg-warn-tint px-1.5 text-[10px] font-medium tabular-nums text-warn">
              {changes}
            </span>
          )}

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                aria-label={t('{name} için işlemler', { name: repo.name })}
                className="rounded p-1 text-ink-3 opacity-0 group-hover:opacity-100 hover:bg-surface-3 hover:text-ink focus-visible:opacity-100"
              >
                <MoreVertical className="size-3.5" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <RepoActions
                repo={repo}
                groups={groups}
                onRemove={onRemove}
                onTogglePin={onTogglePin}
                onMoveToGroup={onMoveToGroup}
                onEditTags={onEditTags}
                Menu={DropdownMenu}
              />
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <RepoActions
          repo={repo}
          groups={groups}
          onRemove={onRemove}
          onTogglePin={onTogglePin}
          onMoveToGroup={onMoveToGroup}
          onEditTags={onEditTags}
          Menu={ContextMenu}
        />
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/**
 * Aynı eylem listesi hem sağ tık hem "…" menüsünde görünüyor. Radix'in iki menü
 * bileşeni aynı alt bileşen adlarını taşıdığı için tek bir tanım ikisine de
 * hizmet edebiliyor.
 */
function RepoActions({
  repo,
  groups,
  onRemove,
  onTogglePin,
  onMoveToGroup,
  onEditTags,
  Menu,
}: {
  repo: Repo;
  groups: string[];
  onRemove: () => void;
  onTogglePin: () => void;
  onMoveToGroup: (group: string | null) => void;
  onEditTags: () => void;
  Menu: typeof DropdownMenu | typeof ContextMenu;
}) {
  const t = useT();
  const itemClass =
    'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-surface-2';

  return (
    <Menu.Content
      align="end"
      sideOffset={4}
      collisionPadding={10}
      className="z-50 min-w-56 rounded-lg border border-line bg-surface p-1 shadow-xl"
    >
      <Menu.Item onSelect={onTogglePin} className={itemClass}>
        {repo.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        {repo.pinned ? t('Sabitlemeyi kaldır') : t('Üste sabitle')}
      </Menu.Item>
      <Menu.Item onSelect={onEditTags} className={itemClass}>
        <Tag className="size-3.5" />
        {t('Etiketler…')}
      </Menu.Item>

      <Menu.Sub>
        <Menu.SubTrigger className={itemClass}>
          <FolderGit2 className="size-3.5" />
          {t('Gruba taşı')}
          <ChevronRight className="ml-auto size-3.5" />
        </Menu.SubTrigger>
        <Menu.Portal>
          <Menu.SubContent
            sideOffset={4}
            className="z-50 max-h-72 min-w-48 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-xl"
          >
            {groups.map((group) => (
              <Menu.Item
                key={group}
                onSelect={() => onMoveToGroup(group)}
                className={cn(itemClass, repo.groupName === group && 'text-accent-ink')}
              >
                {group}
              </Menu.Item>
            ))}
            <Menu.Separator className="my-1 h-px bg-line-soft" />
            <Menu.Item onSelect={() => onMoveToGroup(null)} className={itemClass}>
              {t('Gruptan çıkar')}
            </Menu.Item>
          </Menu.SubContent>
        </Menu.Portal>
      </Menu.Sub>

      <Menu.Separator className="my-1 h-px bg-line-soft" />
      <Menu.Item
        onSelect={() => void invoke('repo:reveal', { repoId: repo.id })}
        className={itemClass}
      >
        <FolderOpen className="size-3.5" />
        {t('Klasörü aç')}
      </Menu.Item>
      <Menu.Item
        onSelect={onRemove}
        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] text-crit outline-none data-[highlighted]:bg-crit-tint"
      >
        <Trash2 className="size-3.5" />
        {t('Listeden çıkar')}
      </Menu.Item>
    </Menu.Content>
  );
}

export function RepoSidebar({ autoPullRepoIds }: { autoPullRepoIds: Set<string> }) {
  const t = useT();
  const { data: repos, isLoading } = useRepos();
  const { data: allTags } = useAllTags();
  const activeRepoId = useUi((s) => s.activeRepoId);
  const setActiveRepo = useUi((s) => s.setActiveRepo);
  const toast = useUi((s) => s.toast);
  const activityOpen = useUi((s) => s.activityOpen);
  const setActivityOpen = useUi((s) => s.setActivityOpen);
  const client = useQueryClient();

  const [filter, setFilter] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [aiGroupOpen, setAiGroupOpen] = useState(false);
  const [tagsTarget, setTagsTarget] = useState<Repo | null>(null);
  const [renaming, setRenaming] = useState<{ from: string; value: string } | null>(null);

  const { data: dirty } = useDirtyCounts((repos?.length ?? 0) > 0);
  // Katlama durumu ana süreçte tutuluyor ki oturumlar arası korunsun.
  const { data: collapsed } = useQuery<string[]>({
    queryKey: ['collapsed-groups'],
    queryFn: () => invoke('repo:collapsed-groups', undefined),
  });

  const refreshRepos = () => {
    void client.invalidateQueries({ queryKey: keys.repos });
    void client.invalidateQueries({ queryKey: ['tags'] });
  };

  const addRepo = useMutation({
    mutationFn: () => invoke('repo:add-dialog', undefined),
    onSuccess: (repo) => {
      if (!repo) return;
      refreshRepos();
      setActiveRepo(repo.id);
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Depo eklenemedi'), description: errorMessage(error) }),
  });

  const removeRepo = useMutation({
    mutationFn: (id: string) => invoke('repo:remove', { id }),
    onSuccess: (_result, id) => {
      refreshRepos();
      if (activeRepoId === id) setActiveRepo(null);
    },
  });

  const updateRepo = useMutation({
    mutationFn: (input: { id: string; groupName?: string | null; pinned?: boolean }) =>
      invoke('repo:update', input),
    onSuccess: refreshRepos,
  });

  const toggleCollapse = useMutation({
    mutationFn: (input: { name: string; collapsed: boolean }) =>
      invoke('repo:group-collapse', input),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['collapsed-groups'] }),
  });

  const renameGroup = useMutation({
    mutationFn: (input: { from: string; to: string }) => invoke('repo:group-rename', input),
    onSuccess: () => {
      refreshRepos();
      setRenaming(null);
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Grup adı değiştirilemedi'), description: errorMessage(error) }),
  });

  const groupNames = useMemo(
    () =>
      [...new Set((repos ?? []).map((repo) => repo.groupName).filter(Boolean))].sort((a, b) =>
        (a as string).localeCompare(b as string, 'tr'),
      ) as string[],
    [repos],
  );

  const rows = useMemo(
    () =>
      buildSidebarRows({
        repos: repos ?? [],
        query: filter,
        activeTags,
        collapsed: collapsed ?? [],
        dirty: dirty ?? [],
      }),
    [repos, filter, activeTags, collapsed, dirty],
  );

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <SectionLabel>{t('Depolar')}</SectionLabel>
        {/*
          Etkinlik özeti bütün depolara birden bakıyor; bu yüzden bir deponun
          içinde değil, listenin başında duruyor.
        */}
        <button
          type="button"
          aria-label={t('Etkinlik özeti')}
          title={t('Etkinlik özeti')}
          onClick={() => setActivityOpen(true)}
          className="ml-auto rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          <Activity className="size-3.5" />
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button size="sm" variant="secondary" loading={addRepo.isPending}>
              <Plus className="size-3.5" />
              {t('Ekle')}
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={4}
              collisionPadding={10}
              className="z-50 w-60 rounded-lg border border-line bg-surface p-1 shadow-xl"
            >
              <DropdownMenu.Item
                onSelect={() => addRepo.mutate()}
                className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-surface-2"
              >
                <FolderOpen className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
                <span>
                  <span className="block text-[13px] text-ink">{t('Klasör ekle…')}</span>
                  <span className="block text-[11px] text-ink-3">{t('Tek bir depo seç')}</span>
                </span>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => setScanOpen(true)}
                className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-surface-2"
              >
                <FolderSearch className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
                <span>
                  <span className="block text-[13px] text-ink">{t('Klasörü tara…')}</span>
                  <span className="block text-[11px] text-ink-3">
                    {t('İçindeki bütün depoları bul')}
                  </span>
                </span>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => setAiGroupOpen(true)}
                className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-surface-2"
              >
                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
                <span>
                  <span className="block text-[13px] text-ink">{t('AI ile grupla…')}</span>
                  <span className="block text-[11px] text-ink-3">{t('Yalnızca depo adları gönderilir')}</span>
                </span>
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-line-soft" />
              <DropdownMenu.Item
                onSelect={() => setCloneOpen(true)}
                className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-surface-2"
              >
                <CloudDownload className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
                <span>
                  <span className="block text-[13px] text-ink">{t('Depo klonla…')}</span>
                  <span className="block text-[11px] text-ink-3">{t('Uzak sunucudan indir')}</span>
                </span>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <div className="flex flex-col gap-1.5 px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-ink-3" />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t('Depolarda ara')}
            aria-label={t('Depolarda ara')}
            className="selectable h-7 w-full rounded-md border border-line bg-ground pr-2 pl-7 text-[12px] text-ink placeholder:text-ink-3 focus-visible:border-accent"
          />
        </div>

        {(allTags?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1">
            {allTags?.map((tag) => {
              const on = activeTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setActiveTags((previous) =>
                      on ? previous.filter((entry) => entry !== tag) : [...previous, tag],
                    )
                  }
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] font-medium',
                    on
                      ? 'bg-accent text-white'
                      : 'border border-line bg-surface text-ink-2 hover:bg-surface-2',
                  )}
                >
                  {tag}
                </button>
              );
            })}
            {activeTags.length > 0 && (
              <button
                type="button"
                aria-label={t('Etiket süzgecini temizle')}
                onClick={() => setActiveTags([])}
                className="rounded p-0.5 text-ink-3 hover:text-ink"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-2 py-8">
            <EmptyState
              title={repos?.length ? t('Eşleşen depo yok') : t('Henüz depo yok')}
              description={
                repos?.length
                  ? t('Farklı bir arama dene.')
                  : t('Bir klasör ekle, proje klasörünü tara ya da uzak bir depoyu klonla.')
              }
            />
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {rows.map((row) => (
              <SidebarRowView
                key={row.id}
                row={row}
                activeRepoId={activeRepoId}
                autoPullRepoIds={autoPullRepoIds}
                groupNames={groupNames}
                renaming={renaming}
                onRename={setRenaming}
                onRenameSubmit={(from, to) => renameGroup.mutate({ from, to })}
                onToggleCollapse={(name, next) => toggleCollapse.mutate({ name, collapsed: next })}
                onSelect={setActiveRepo}
                onRemove={(id) => removeRepo.mutate(id)}
                onTogglePin={(repo) => updateRepo.mutate({ id: repo.id, pinned: !repo.pinned })}
                onMoveToGroup={(repo, group) => updateRepo.mutate({ id: repo.id, groupName: group })}
                onEditTags={setTagsTarget}
              />
            ))}
          </div>
        )}
      </div>

      <CloneDialog open={cloneOpen} onOpenChange={setCloneOpen} />
      <ScanDialog open={scanOpen} onOpenChange={setScanOpen} />
      <AiGroupDialog open={aiGroupOpen} onOpenChange={setAiGroupOpen} />
      <ActivityDialog open={activityOpen} onOpenChange={setActivityOpen} />
      <RepoTagsDialog
        key={tagsTarget?.id ?? 'none'}
        repo={tagsTarget}
        open={tagsTarget !== null}
        onOpenChange={(next) => !next && setTagsTarget(null)}
      />
    </aside>
  );
}

function SidebarRowView({
  row,
  activeRepoId,
  autoPullRepoIds,
  groupNames,
  renaming,
  onRename,
  onRenameSubmit,
  onToggleCollapse,
  onSelect,
  onRemove,
  onTogglePin,
  onMoveToGroup,
  onEditTags,
}: {
  row: SidebarRow;
  activeRepoId: string | null;
  autoPullRepoIds: Set<string>;
  groupNames: string[];
  renaming: { from: string; value: string } | null;
  onRename: (state: { from: string; value: string } | null) => void;
  onRenameSubmit: (from: string, to: string) => void;
  onToggleCollapse: (name: string, collapsed: boolean) => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onTogglePin: (repo: Repo) => void;
  onMoveToGroup: (repo: Repo, group: string | null) => void;
  onEditTags: (repo: Repo) => void;
}) {
  const t = useT();

  if (row.kind === 'section') {
    return <SectionLabel className="mt-2 block px-2 py-1">{t(row.label)}</SectionLabel>;
  }

  if (row.kind === 'group') {
    if (renaming?.from === row.name) {
      return (
        <input
          autoFocus
          value={renaming.value}
          onChange={(event) => onRename({ from: row.name, value: event.target.value })}
          onBlur={() => onRename(null)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && renaming.value.trim().length > 0) {
              onRenameSubmit(row.name, renaming.value.trim());
            } else if (event.key === 'Escape') {
              onRename(null);
            }
          }}
          className="selectable mx-2 h-7 rounded border border-accent bg-ground px-2 text-[12px] text-ink"
        />
      );
    }

    return (
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <button
            type="button"
            onClick={() => onToggleCollapse(row.name, !row.collapsed)}
            className="mt-1.5 flex items-center gap-1 rounded-md px-1.5 py-1 text-left hover:bg-surface-2"
          >
            {row.collapsed ? (
              <ChevronRight className="size-3.5 shrink-0 text-ink-3" />
            ) : (
              <ChevronDown className="size-3.5 shrink-0 text-ink-3" />
            )}
            {/*
              Grup adı kullanıcının klasör adı, bir başlık etiketi değil: büyük
              harfe çevirmek onu bozuyor ("Individual" → "İNDİVİDUAL"), çünkü
              Türkçe büyük harf kuralı i harfini noktalı çeviriyor.
            */}
            <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink-2">
              {row.name}
            </span>
            {row.changes > 0 && <Badge tone="warn">{row.changes}</Badge>}
            <span className="shrink-0 text-[11px] tabular-nums text-ink-3">{row.count}</span>
          </button>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="z-50 min-w-48 rounded-lg border border-line bg-surface p-1 shadow-xl">
            <ContextMenu.Item
              onSelect={() => onRename({ from: row.name, value: row.name })}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-surface-2"
            >
              <Pencil className="size-3.5" />
              {t('Grubu yeniden adlandır')}
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    );
  }

  return (
    <RepoRow
      repo={row.repo}
      changes={row.changes}
      indented={row.indented}
      active={row.repo.id === activeRepoId}
      autoPullOn={autoPullRepoIds.has(row.repo.id)}
      groups={groupNames}
      onSelect={() => onSelect(row.repo.id)}
      onRemove={() => onRemove(row.repo.id)}
      onTogglePin={() => onTogglePin(row.repo)}
      onMoveToGroup={(group) => onMoveToGroup(row.repo, group)}
      onEditTags={() => onEditTags(row.repo)}
    />
  );
}
