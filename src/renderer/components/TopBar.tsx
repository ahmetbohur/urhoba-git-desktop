import { useState } from 'react';
import { DropdownMenu } from 'radix-ui';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  CircleUser,
  KeyRound,
  RefreshCw,
  Settings,
  UploadCloud,
  Tag,
  Terminal,
  TriangleAlert,
} from 'lucide-react';
import { useT } from '../i18n';
import { cn } from '../lib/cn';
import { errorMessage, invoke } from '../lib/ipc';
import {
  useInvalidateRepo,
  useMutation,
  useRemotes,
  useRepoSettings,
  useStatus,
} from '../lib/queries';
import { useUi } from '../stores/ui';
import { Badge, Button, Tooltip } from './primitives';
import { BranchMenu } from './BranchMenu';
import { AutoPullPopover } from './AutoPullPopover';
import { StashMenu } from './StashMenu';
import { SettingsDialog } from './dialogs/SettingsDialog';
import { SshDialog } from './dialogs/SshDialog';
import { GithubDialog } from './dialogs/GithubDialog';
import { PublishDialog } from './dialogs/PublishDialog';
import { TagDialog } from './dialogs/TagDialog';
import { ConfirmDialog } from './dialogs/ConfirmDialog';
import type { Repo } from '@shared/types';

const OPERATION_LABELS: Record<string, string> = {
  merge: 'Birleştirme sürüyor',
  rebase: 'Rebase sürüyor',
  'cherry-pick': 'Cherry-pick sürüyor',
  revert: 'Revert sürüyor',
  bisect: 'Bisect sürüyor',
};

export function TopBar({ repo }: { repo: Repo }) {
  const t = useT();
  const { data: status } = useStatus(repo.id);
  const { data: repoSettings } = useRepoSettings(repo.id);
  const { data: remotes } = useRemotes(repo.id);
  const invalidate = useInvalidateRepo();
  const toast = useUi((s) => s.toast);
  const toggleCommandLog = useUi((s) => s.toggleCommandLog);
  const commandLogOpen = useUi((s) => s.commandLogOpen);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sshOpen, setSshOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [forcePushOpen, setForcePushOpen] = useState(false);
  const publishOpen = useUi((s) => s.publishOpen);
  const setPublishOpen = useUi((s) => s.setPublishOpen);

  /*
   * Uzak sunucusu olmayan bir depoda fetch/pull/push yapacak bir yer yok;
   * onların yerine yayınlama düğmesi çıkıyor. İkisini birden göstermek
   * kullanıcıya hiçbir zaman çalışmayacak üç düğme sunmak olurdu.
   */
  // Liste henüz yüklenmediyse uzak sunucu varmış gibi davranıyoruz: yükleme
  // anında "GitHub'da yayınla" düğmesinin bir anlığına parlayıp kaybolması,
  // uzak sunucusu olan bir depoda yanıltıcı bir titreşim üretiyordu.
  const hasRemote = remotes === undefined || remotes.length > 0;

  const fetchMutation = useMutation({
    mutationFn: () => invoke('git:fetch', { repoId: repo.id }),
    onSuccess: (result) => {
      invalidate(repo.id);
      toast({
        kind: 'info',
        title: t('Fetch tamamlandı'),
        description:
          result.behind > 0
            ? t('Uzak dalda {count} yeni commit var.', { count: result.behind })
            : t('Yeni commit yok.'),
      });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Fetch başarısız'), description: errorMessage(error) }),
  });

  const pullMutation = useMutation({
    mutationFn: () => invoke('git:pull', { repoId: repo.id, fastForwardOnly: false }),
    onSuccess: (result) => {
      invalidate(repo.id);
      const failed = result.outcome === 'error' || result.outcome === 'conflict';
      toast({
        kind: failed ? 'error' : result.outcome.startsWith('skipped') ? 'warning' : 'success',
        title: failed ? t('Pull başarısız') : t('Pull'),
        description: result.message,
      });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Pull başarısız'), description: errorMessage(error) }),
  });

  const pushMutation = useMutation({
    mutationFn: (forceWithLease: boolean) =>
      invoke('git:push', { repoId: repo.id, forceWithLease }),
    onSuccess: (result) => {
      invalidate(repo.id);
      toast({
        kind: result.ok ? 'success' : 'error',
        title: result.ok ? t('Push tamamlandı') : t('Push başarısız'),
        description: result.ok
          ? result.message
          : `${result.message} ${t('Uzak dalda senin görmediğin commit’ler varsa önce fetch et.')}`,
      });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Push başarısız'), description: errorMessage(error) }),
  });

  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  const operationLabel = status && status.operation !== 'none' ? t(OPERATION_LABELS[status.operation]) : null;

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
      {/*
        Daralan yer buradan alınıyor ama tamamen yok olmamalı: taban genişlik
        olmadan depo adı dar pencerede sıfıra iniyor ve kullanıcı hangi depoda
        olduğunu göremiyor.
      */}
      <div className="flex min-w-28 flex-col overflow-hidden">
        <span className="truncate text-[13px] font-semibold text-ink">{repo.name}</span>
        <span className="truncate text-[11px] text-ink-3">{repo.path}</span>
      </div>

      <div className="mx-2 h-6 w-px bg-line" />

      <BranchMenu repoId={repo.id} currentBranch={status?.branch ?? null} />

      {(ahead > 0 || behind > 0) && (
        <div className="flex shrink-0 items-center gap-1">
          {behind > 0 && <Badge tone="warn">↓ {behind}</Badge>}
          {ahead > 0 && <Badge tone="accent">↑ {ahead}</Badge>}
        </div>
      )}

      {operationLabel && (
        <Badge tone="crit">
          <TriangleAlert className="size-3" />
          {operationLabel}
        </Badge>
      )}

      <div className="flex-1" />

      <StashMenu
        repoId={repo.id}
        hasChanges={(status?.staged.length ?? 0) + (status?.unstaged.length ?? 0) > 0}
      />

      {hasRemote && <AutoPullPopover repoId={repo.id} />}

      {!hasRemote && (
        <Button
          size="sm"
          variant="primary"
          title={t('GitHub’da yayınla')}
          onClick={() => setPublishOpen(true)}
        >
          <UploadCloud className="size-3.5" />
          {t('GitHub’da yayınla')}
        </Button>
      )}

      <div className={cn('flex shrink-0 items-center gap-1', !hasRemote && 'hidden')}>
        <Button
          size="sm"
          variant="ghost"
          title={t('Fetch')}
          aria-label={t('Fetch')}
          loading={fetchMutation.isPending}
          onClick={() => fetchMutation.mutate()}
        >
          <RefreshCw className="size-3.5" />
          <span className="hidden lg:inline">{t('Fetch')}</span>
        </Button>
        <Button
          size="sm"
          variant={behind > 0 ? 'primary' : 'ghost'}
          title={t('Pull')}
          aria-label={t('Pull')}
          loading={pullMutation.isPending}
          onClick={() => pullMutation.mutate()}
        >
          <ArrowDownToLine className="size-3.5" />
          <span className="hidden lg:inline">{t('Pull')}</span>
          {behind > 0 && <span className="tabular-nums">{behind}</span>}
        </Button>
        <div className="flex shrink-0 items-center">
          <Button
            size="sm"
            variant={ahead > 0 ? 'primary' : 'ghost'}
            title={t('Push')}
            aria-label={t('Push')}
            loading={pushMutation.isPending}
            onClick={() => pushMutation.mutate(false)}
            className="rounded-r-none"
          >
            <ArrowUpFromLine className="size-3.5" />
            <span className="hidden lg:inline">{t('Push')}</span>
            {ahead > 0 && <span className="tabular-nums">{ahead}</span>}
          </Button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button
                size="sm"
                variant={ahead > 0 ? 'primary' : 'ghost'}
                aria-label={t('Push seçenekleri')}
                className="rounded-l-none border-l border-white/20 px-1"
              >
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={4}
                className="z-50 min-w-72 rounded-md border border-line bg-surface p-1 shadow-lg"
              >
                <DropdownMenu.Item
                  onSelect={() => setForcePushOpen(true)}
                  className="cursor-pointer rounded px-2 py-1.5 outline-none data-[highlighted]:bg-surface-2"
                >
                  <span className="block text-[13px] text-ink">{t('Zorlamalı push')}</span>
                  <span className="block text-[11px] text-ink-3">
                    {t('Geçmişi yeniden yazdıysan gerekir')}
                  </span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      <div className="mx-1 h-6 w-px bg-line" />

      <Tooltip label={t('GitHub bağlantısı')}>
        <button
          type="button"
          aria-label={t('GitHub bağlantısı')}
          onClick={() => setGithubOpen(true)}
          className="rounded-md p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          <CircleUser className="size-4" />
        </button>
      </Tooltip>

      <Tooltip label={t('Etiketler')}>
        <button
          type="button"
          aria-label={t('Etiketler')}
          onClick={() => setTagsOpen(true)}
          className="rounded-md p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          <Tag className="size-4" />
        </button>
      </Tooltip>

      <Tooltip label={t('SSH kurulumu')}>
        <button
          type="button"
          aria-label={t('SSH kurulumu')}
          onClick={() => setSshOpen(true)}
          className="rounded-md p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          <KeyRound className="size-4" />
        </button>
      </Tooltip>

      <Tooltip label={t('Git komut günlüğü')}>
        <button
          type="button"
          aria-label={t('Git komut günlüğü')}
          onClick={toggleCommandLog}
          className={cn(
            'rounded-md p-1.5 hover:bg-surface-2 hover:text-ink',
            commandLogOpen ? 'bg-accent-tint text-accent-ink' : 'text-ink-2',
          )}
        >
          <Terminal className="size-4" />
        </button>
      </Tooltip>

      <Tooltip label={t('Ayarlar')}>
        <button
          type="button"
          aria-label={t('Ayarlar')}
          onClick={() => setSettingsOpen(true)}
          className="rounded-md p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          <Settings className="size-4" />
        </button>
      </Tooltip>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        repoId={repo.id}
        repoSettings={repoSettings ?? null}
      />
      <SshDialog open={sshOpen} onOpenChange={setSshOpen} />
      <TagDialog repoId={repo.id} commit={null} open={tagsOpen} onOpenChange={setTagsOpen} />
      <GithubDialog open={githubOpen} onOpenChange={setGithubOpen} />
      {/* Koşullu monte: pencere her açılışta taze durumla başlasın. */}
      {publishOpen && (
        <PublishDialog open onOpenChange={setPublishOpen} repo={repo} />
      )}

      <ConfirmDialog
        open={forcePushOpen}
        onOpenChange={setForcePushOpen}
        title={t('Zorlamalı push')}
        confirmLabel={t('Zorlamalı gönder')}
        destructive
        onConfirm={() => pushMutation.mutate(true)}
      >
        <div className="flex flex-col gap-2 text-[13px] text-ink-2">
          <p>
            {t('Uzak daldaki commit’lerin üzerine yazılacak. Bu yalnızca geçmişi yeniden yazdıysan (amend, rebase, reset) gerekir.')}
          </p>
          <p>
            Gönderim <span className="font-mono text-ink">--force-with-lease</span> ile yapılıyor:
            uzak dalda senin görmediğin bir commit varsa git işlemi reddeder. Yani başkasının
            çalışmasını sessizce silme riski yok.
          </p>
        </div>
      </ConfirmDialog>
    </header>
  );
}
