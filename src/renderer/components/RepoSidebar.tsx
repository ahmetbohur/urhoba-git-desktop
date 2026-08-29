import { useMemo, useState } from 'react';
import { DropdownMenu } from 'radix-ui';
import { FolderGit2, MoreVertical, Plus, RefreshCcwDot, Search, Trash2 } from 'lucide-react';
import { cn } from '../lib/cn';
import { errorMessage, invoke } from '../lib/ipc';
import { keys, useMutation, useQueryClient, useRepos } from '../lib/queries';
import { relativeTime } from '../lib/format';
import { useUi } from '../stores/ui';
import { Button, EmptyState, SectionLabel, Spinner } from './primitives';
import { CloneDialog } from './dialogs/CloneDialog';
import type { Repo } from '@shared/types';

function RepoRow({
  repo,
  active,
  autoPullOn,
  onSelect,
  onRemove,
}: {
  repo: Repo;
  active: boolean;
  autoPullOn: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-md px-2 py-1.5 text-left',
        active ? 'bg-accent-tint' : 'hover:bg-surface-2',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <FolderGit2
          className={cn('size-4 shrink-0', active ? 'text-accent-ink' : 'text-ink-3')}
        />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'flex items-center gap-1.5 truncate text-[13px] font-medium',
              active ? 'text-accent-ink' : 'text-ink',
            )}
          >
            {repo.name}
            {autoPullOn && (
              <RefreshCcwDot
                className="size-3 shrink-0 text-ok"
                aria-label="Otomatik pull açık"
              />
            )}
          </span>
          <span className="block truncate text-[11px] text-ink-3">
            {relativeTime(repo.lastOpenedAt)}
          </span>
        </span>
      </button>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={`${repo.name} için işlemler`}
            className="rounded p-1 text-ink-3 opacity-0 group-hover:opacity-100 hover:bg-surface-3 hover:text-ink focus-visible:opacity-100"
          >
            <MoreVertical className="size-3.5" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="z-50 min-w-48 rounded-md border border-line bg-surface p-1 shadow-lg"
          >
            <DropdownMenu.Item
              onSelect={() => void invoke('repo:reveal', { repoId: repo.id })}
              className="cursor-pointer rounded px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-surface-2"
            >
              Klasörü aç
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-line-soft" />
            <DropdownMenu.Item
              onSelect={onRemove}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] text-crit outline-none data-[highlighted]:bg-crit-tint"
            >
              <Trash2 className="size-3.5" />
              Listeden çıkar
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

export function RepoSidebar({ autoPullRepoIds }: { autoPullRepoIds: Set<string> }) {
  const { data: repos, isLoading } = useRepos();
  const activeRepoId = useUi((s) => s.activeRepoId);
  const setActiveRepo = useUi((s) => s.setActiveRepo);
  const toast = useUi((s) => s.toast);
  const client = useQueryClient();
  const [filter, setFilter] = useState('');
  const [cloneOpen, setCloneOpen] = useState(false);

  const addRepo = useMutation({
    mutationFn: () => invoke('repo:add-dialog', undefined),
    onSuccess: (repo) => {
      if (!repo) return;
      void client.invalidateQueries({ queryKey: keys.repos });
      setActiveRepo(repo.id);
    },
    onError: (error) =>
      toast({ kind: 'error', title: 'Depo eklenemedi', description: errorMessage(error) }),
  });

  const removeRepo = useMutation({
    mutationFn: (id: string) => invoke('repo:remove', { id }),
    onSuccess: (_result, id) => {
      void client.invalidateQueries({ queryKey: keys.repos });
      if (activeRepoId === id) setActiveRepo(null);
    },
  });

  const filtered = useMemo(() => {
    const list = repos ?? [];
    const needle = filter.trim().toLocaleLowerCase('tr');
    if (needle.length === 0) return list;
    return list.filter(
      (repo) =>
        repo.name.toLocaleLowerCase('tr').includes(needle) ||
        repo.path.toLocaleLowerCase('tr').includes(needle),
    );
  }, [repos, filter]);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <SectionLabel>Depolar</SectionLabel>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setCloneOpen(true)}>
            Klonla
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={addRepo.isPending}
            onClick={() => addRepo.mutate()}
          >
            <Plus className="size-3.5" />
            Ekle
          </Button>
        </div>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-ink-3" />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Depolarda ara"
            aria-label="Depolarda ara"
            className="selectable h-7 w-full rounded-md border border-line bg-ground pr-2 pl-7 text-[12px] text-ink placeholder:text-ink-3 focus-visible:border-accent"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-2 py-8">
            <EmptyState
              title={repos?.length ? 'Eşleşen depo yok' : 'Henüz depo yok'}
              description={
                repos?.length
                  ? 'Farklı bir arama dene.'
                  : 'Diskteki bir klasörü ekle ya da uzak bir depoyu klonla.'
              }
            />
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {filtered.map((repo) => (
              <RepoRow
                key={repo.id}
                repo={repo}
                active={repo.id === activeRepoId}
                autoPullOn={autoPullRepoIds.has(repo.id)}
                onSelect={() => setActiveRepo(repo.id)}
                onRemove={() => removeRepo.mutate(repo.id)}
              />
            ))}
          </div>
        )}
      </div>

      <CloneDialog open={cloneOpen} onOpenChange={setCloneOpen} />
    </aside>
  );
}
