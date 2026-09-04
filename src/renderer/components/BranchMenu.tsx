import { useMemo, useState } from 'react';
import { ContextMenu, DropdownMenu } from 'radix-ui';
import { Check, GitBranch, GitMerge, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useT } from '../i18n';
import { cn } from '../lib/cn';
import { errorMessage, invoke } from '../lib/ipc';
import { useBranches, useInvalidateRepo, useMutation, useQuery } from '../lib/queries';
import { relativeTime } from '../lib/format';
import { useUi } from '../stores/ui';
import { Badge, SectionLabel } from './primitives';
import { ConfirmDialog } from './dialogs/ConfirmDialog';
import { RenameBranchDialog } from './dialogs/RenameBranchDialog';
import type { Branch, Worktree } from '@shared/types';

/**
 * Dal seçici.
 *
 * Uzak dallar da listede: bir uzak dala tıklamak `git checkout` ile aynı adda
 * yerel izleme dalı oluşturur — insanların beklediği davranış bu.
 */
export function BranchMenu({ repoId, currentBranch }: { repoId: string; currentBranch: string | null }) {
  const t = useT();
  const { data: branches } = useBranches(repoId);
  const [open, setOpen] = useState(false);
  /*
   * Çalışma ağaçları yalnızca menü açıkken çekiliyor. Menü kapalıyken de
   * çalışması, her depo açılışına bir `git worktree list` ekliyordu; bilgi
   * ise ancak menü açıldığında görünüyor.
   */
  const { data: worktrees } = useQuery<Worktree[]>({
    queryKey: ['worktrees', repoId],
    queryFn: () => invoke('git:worktrees', { repoId }),
    enabled: open,
  });

  /*
   * Dal → o dalı tutan çalışma ağacının yolu. Ana ağaç (bu depo) listeye
   * girmiyor: kendi dalımıza "başka yerde açık" demek anlamsız olurdu.
   */
  const worktreeByBranch = useMemo(() => {
    const map = new Map<string, string>();
    for (const tree of worktrees ?? []) {
      if (tree.isMain || !tree.branch) continue;
      map.set(tree.branch, tree.path);
    }
    return map;
  }, [worktrees]);
  const invalidate = useInvalidateRepo();
  const toast = useUi((s) => s.toast);

  const [filter, setFilter] = useState('');
  // Kirli dizin yüzünden engellenen geçiş: kullanıcıya saklayıp geçmeyi öneriyoruz.
  const [blocked, setBlocked] = useState<{ branch: string; paths: string[] } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);
  const [renameTarget, setRenameTarget] = useState<Branch | null>(null);

  const checkout = useMutation({
    mutationFn: (name: string) => invoke('git:checkout', { repoId, name }),
    onSuccess: (result, name) => {
      invalidate(repoId);
      if (result.outcome === 'switched') {
        toast({ kind: 'success', title: result.message });
        setOpen(false);
        return;
      }
      if (result.outcome === 'blocked-dirty') {
        setOpen(false);
        setBlocked({ branch: name, paths: result.blockingPaths });
        return;
      }
      toast({ kind: 'error', title: t('Dal değiştirilemedi'), description: result.message });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Dal değiştirilemedi'), description: errorMessage(error) }),
  });

  /** Engellenen geçişte: önce sakla, sonra tekrar dene. */
  const stashAndCheckout = useMutation({
    mutationFn: async (name: string) => {
      await invoke('git:stash-create', {
        repoId,
        message: t('{name} dalına geçmeden önce', { name }),
        includeUntracked: true,
      });
      return invoke('git:checkout', { repoId, name });
    },
    onSuccess: (result) => {
      invalidate(repoId);
      toast({
        kind: result.outcome === 'switched' ? 'success' : 'error',
        title: result.outcome === 'switched' ? t('Saklandı ve geçildi') : t('Geçiş yapılamadı'),
        description: result.message,
      });
      setBlocked(null);
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Saklanamadı'), description: errorMessage(error) }),
  });

  const mergeBranch = useMutation({
    mutationFn: (name: string) => invoke('git:merge', { repoId, branch: name }),
    onSuccess: (result) => {
      invalidate(repoId);
      toast({
        kind:
          result.outcome === 'conflict'
            ? 'warning'
            : result.outcome === 'error'
              ? 'error'
              : 'success',
        title: t('Birleştirme'),
        description: result.message,
      });
      setOpen(false);
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Birleştirilemedi'), description: errorMessage(error) }),
  });

  const rebaseOnto = useMutation({
    mutationFn: (name: string) => invoke('git:rebase', { repoId, branch: name }),
    onSuccess: (result) => {
      invalidate(repoId);
      toast({
        kind:
          result.outcome === 'conflict'
            ? 'warning'
            : result.outcome === 'error'
              ? 'error'
              : 'success',
        title: t('Rebase'),
        description: result.message,
      });
      setOpen(false);
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Rebase yapılamadı'), description: errorMessage(error) }),
  });

  const deleteBranch = useMutation({
    mutationFn: ({ name, force }: { name: string; force: boolean }) =>
      invoke('git:branch-delete', { repoId, name, force }),
    onSuccess: (_result, variables) => {
      invalidate(repoId);
      toast({ kind: 'info', title: t('{name} dalı silindi', { name: variables.name }) });
      setDeleteTarget(null);
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('Dal silinemedi'),
        description: `${errorMessage(error)} ${t('Birleştirilmemiş commit’ler varsa silmeyi zorlaman gerekir.')}`,
      }),
  });

  const createBranch = useMutation({
    mutationFn: (name: string) =>
      invoke('git:branch-create', { repoId, name, checkout: true }),
    onSuccess: (_result, name) => {
      invalidate(repoId);
      toast({ kind: 'success', title: t('{name} dalı oluşturuldu', { name }) });
      setOpen(false);
      setFilter('');
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Dal oluşturulamadı'), description: errorMessage(error) }),
  });

  const needle = filter.trim().toLocaleLowerCase('tr');

  const { local, remote } = useMemo(() => {
    const match = (list: Branch[]) =>
      needle.length === 0
        ? list
        : list.filter((branch) => branch.fullName.toLocaleLowerCase('tr').includes(needle));
    return { local: match(branches?.local ?? []), remote: match(branches?.remote ?? []) };
  }, [branches, needle]);

  // Aranan ad hiçbir dalla birebir eşleşmiyorsa "bu adla dal oluştur" seçeneği çıkar.
  const exactMatch = [...(branches?.local ?? []), ...(branches?.remote ?? [])].some(
    (branch) => branch.fullName === filter.trim() || branch.name === filter.trim(),
  );
  const canCreate = filter.trim().length > 0 && !exactMatch;

  const renderBranch = (branch: Branch) => {
    /*
     * Bir dal aynı anda yalnızca bir çalışma ağacında açık olabiliyor. Başka
     * ağaçta açıksa geçiş denemesi git'in "already used by worktree" hatasıyla
     * bitiyor; nerede açık olduğunu baştan söylemek o hatayı hiç doğurmuyor.
     */
    const usedBy = worktreeByBranch.get(branch.fullName);

    return (
    <ContextMenu.Root key={branch.fullName}>
      <ContextMenu.Trigger asChild>
        <DropdownMenu.Item
          disabled={!!usedBy}
          onSelect={() => {
            if (usedBy) return;
            checkout.mutate(branch.isRemote ? branch.name : branch.fullName);
          }}
          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[disabled]:cursor-default data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2"
        >
          <Check
            className={cn('size-3.5 shrink-0', branch.isCurrent ? 'text-accent-ink' : 'opacity-0')}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] text-ink">{branch.fullName}</span>
            <span className="block truncate text-[11px] text-ink-3">
              {usedBy
                ? t('{path} klasöründe açık', { path: usedBy })
                : `${branch.lastCommitSubject || t('commit yok')} · ${relativeTime(branch.lastCommitAt)}`}
            </span>
          </span>
          {branch.ahead > 0 && <Badge tone="accent">↑{branch.ahead}</Badge>}
          {branch.behind > 0 && <Badge tone="warn">↓{branch.behind}</Badge>}
        </DropdownMenu.Item>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content className="z-[60] min-w-64 rounded-md border border-line bg-surface p-1 shadow-lg">
          <ContextMenu.Item
            disabled={branch.isCurrent}
            onSelect={() => mergeBranch.mutate(branch.fullName)}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-surface-2"
          >
            <GitMerge className="size-3.5" />
            <span className="truncate">
              <strong className="font-mono">{branch.fullName}</strong> {t('dalını buraya birleştir')}
            </span>
          </ContextMenu.Item>
          <ContextMenu.Item
            disabled={branch.isCurrent}
            onSelect={() => rebaseOnto.mutate(branch.fullName)}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-surface-2"
          >
            <GitBranch className="size-3.5" />
            <span className="truncate">
              Bu dalı <strong className="font-mono">{branch.fullName}</strong> üzerine diz
            </span>
          </ContextMenu.Item>
          {!branch.isRemote && (
            <>
              <ContextMenu.Separator className="my-1 h-px bg-line-soft" />
              <ContextMenu.Item
                onSelect={() => setRenameTarget(branch)}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-surface-2"
              >
                <Pencil className="size-3.5" />
                {t('Yeniden adlandır…')}
              </ContextMenu.Item>
            </>
          )}
          {!branch.isRemote && !branch.isCurrent && (
            <>
              <ContextMenu.Item
                onSelect={() => setDeleteTarget(branch)}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] text-crit outline-none data-[highlighted]:bg-crit-tint"
              >
                <Trash2 className="size-3.5" />
                {t('Dalı sil')}
              </ContextMenu.Item>
            </>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
    );
  };

  return (
    <>
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex h-8 max-w-56 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-[13px] font-medium text-ink hover:bg-surface-2"
        >
          <GitBranch className="size-3.5 shrink-0 text-ink-3" />
          <span className="truncate">{currentBranch ?? t('ayrık HEAD')}</span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="z-50 flex max-h-96 w-96 flex-col rounded-lg border border-line bg-surface p-1 shadow-xl"
        >
          <div className="relative p-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-ink-3" />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t('Dal ara veya yeni dal adı yaz')}
              aria-label={t('Dal ara')}
              // Radix aksi hâlde yazılan her harfi menü gezinme kısayolu sanıyor.
              onKeyDown={(event) => event.stopPropagation()}
              className="selectable h-7 w-full rounded border border-line bg-ground pr-2 pl-7 text-[12px] text-ink placeholder:text-ink-3 focus-visible:border-accent"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {canCreate && (
              <DropdownMenu.Item
                onSelect={() => createBranch.mutate(filter.trim())}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] text-accent-ink outline-none data-[highlighted]:bg-accent-tint"
              >
                <Plus className="size-3.5" />
                <span className="truncate">
                  <strong className="font-mono">{filter.trim()}</strong> {t('dalını oluştur ve geç')}
                </span>
              </DropdownMenu.Item>
            )}

            {local.length > 0 && (
              <>
                <SectionLabel className="block px-2 pt-2 pb-1">{t('Yerel')}</SectionLabel>
                {local.map(renderBranch)}
              </>
            )}

            {remote.length > 0 && (
              <>
                <SectionLabel className="block px-2 pt-2 pb-1">{t('Uzak')}</SectionLabel>
                {remote.map(renderBranch)}
              </>
            )}

            {local.length === 0 && remote.length === 0 && !canCreate && (
              <p className="px-2 py-6 text-center text-[12px] text-ink-3">{t('Eşleşen dal yok.')}</p>
            )}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>

      <ConfirmDialog
        open={blocked !== null}
        onOpenChange={(next) => !next && setBlocked(null)}
        title={t('Kaydedilmemiş değişiklikler engelliyor')}
        confirmLabel={t('Sakla ve geç')}
        onConfirm={() => blocked && stashAndCheckout.mutate(blocked.branch)}
      >
        <div className="flex flex-col gap-2 text-[13px] text-ink-2">
          <p>
            <span className="font-mono text-ink">{blocked?.branch}</span> dalına geçmek şu
            dosyalardaki değişikliklerin üzerine yazardı:
          </p>
          <ul className="max-h-32 overflow-y-auto rounded-md bg-surface-2 p-2 font-mono text-[11px]">
            {blocked?.paths.map((path) => (
              <li key={path} className="truncate text-ink">
                {path}
              </li>
            ))}
          </ul>
          <p>
            Değişiklikleri stash’e alıp geçebilirim; sonra istediğin zaman geri
            uygularsın.
          </p>
        </div>
      </ConfirmDialog>

      <RenameBranchDialog
        key={renameTarget?.fullName ?? 'none'}
        repoId={repoId}
        branch={renameTarget}
        open={renameTarget !== null}
        onOpenChange={(next) => !next && setRenameTarget(null)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => !next && setDeleteTarget(null)}
        title={t('Dalı sil')}
        confirmLabel={t('Sil')}
        destructive
        onConfirm={() =>
          deleteTarget && deleteBranch.mutate({ name: deleteTarget.fullName, force: false })
        }
      >
        <p className="text-[13px] text-ink-2">
          <span className="font-mono text-ink">{deleteTarget?.fullName}</span> dalı silinecek.
          Birleştirilmemiş commit’leri varsa git silmeyi reddeder; o durumda kaybı göze alıp
          zorlaman gerekir.
        </p>
      </ConfirmDialog>
    </>
  );
}
