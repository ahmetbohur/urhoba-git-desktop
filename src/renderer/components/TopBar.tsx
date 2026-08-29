import { useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  KeyRound,
  RefreshCw,
  Settings,
  Terminal,
  TriangleAlert,
} from 'lucide-react';
import { cn } from '../lib/cn';
import { errorMessage, invoke } from '../lib/ipc';
import {
  useInvalidateRepo,
  useMutation,
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
import type { Repo } from '@shared/types';

const OPERATION_LABELS: Record<string, string> = {
  merge: 'Birleştirme sürüyor',
  rebase: 'Rebase sürüyor',
  'cherry-pick': 'Cherry-pick sürüyor',
  revert: 'Revert sürüyor',
  bisect: 'Bisect sürüyor',
};

export function TopBar({ repo }: { repo: Repo }) {
  const { data: status } = useStatus(repo.id);
  const { data: repoSettings } = useRepoSettings(repo.id);
  const invalidate = useInvalidateRepo();
  const toast = useUi((s) => s.toast);
  const toggleCommandLog = useUi((s) => s.toggleCommandLog);
  const commandLogOpen = useUi((s) => s.commandLogOpen);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sshOpen, setSshOpen] = useState(false);

  const fetchMutation = useMutation({
    mutationFn: () => invoke('git:fetch', { repoId: repo.id }),
    onSuccess: (result) => {
      invalidate(repo.id);
      toast({
        kind: 'info',
        title: 'Fetch tamamlandı',
        description:
          result.behind > 0
            ? `Uzak dalda ${result.behind} yeni commit var.`
            : 'Yeni commit yok.',
      });
    },
    onError: (error) =>
      toast({ kind: 'error', title: 'Fetch başarısız', description: errorMessage(error) }),
  });

  const pullMutation = useMutation({
    mutationFn: () => invoke('git:pull', { repoId: repo.id, fastForwardOnly: false }),
    onSuccess: (result) => {
      invalidate(repo.id);
      const failed = result.outcome === 'error' || result.outcome === 'conflict';
      toast({
        kind: failed ? 'error' : result.outcome.startsWith('skipped') ? 'warning' : 'success',
        title: failed ? 'Pull başarısız' : 'Pull',
        description: result.message,
      });
    },
    onError: (error) =>
      toast({ kind: 'error', title: 'Pull başarısız', description: errorMessage(error) }),
  });

  const pushMutation = useMutation({
    mutationFn: () => invoke('git:push', { repoId: repo.id }),
    onSuccess: (result) => {
      invalidate(repo.id);
      toast({
        kind: result.ok ? 'success' : 'error',
        title: result.ok ? 'Push tamamlandı' : 'Push başarısız',
        description: result.message,
      });
    },
    onError: (error) =>
      toast({ kind: 'error', title: 'Push başarısız', description: errorMessage(error) }),
  });

  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  const operationLabel = status && status.operation !== 'none' ? OPERATION_LABELS[status.operation] : null;

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] font-semibold text-ink">{repo.name}</span>
        <span className="truncate text-[11px] text-ink-3">{repo.path}</span>
      </div>

      <div className="mx-2 h-6 w-px bg-line" />

      <BranchMenu repoId={repo.id} currentBranch={status?.branch ?? null} />

      {(ahead > 0 || behind > 0) && (
        <div className="flex items-center gap-1">
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

      <AutoPullPopover repoId={repo.id} />

      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          loading={fetchMutation.isPending}
          onClick={() => fetchMutation.mutate()}
        >
          <RefreshCw className="size-3.5" />
          Fetch
        </Button>
        <Button
          size="sm"
          variant={behind > 0 ? 'primary' : 'ghost'}
          loading={pullMutation.isPending}
          onClick={() => pullMutation.mutate()}
        >
          <ArrowDownToLine className="size-3.5" />
          Pull
          {behind > 0 && <span className="tabular-nums">{behind}</span>}
        </Button>
        <Button
          size="sm"
          variant={ahead > 0 ? 'primary' : 'ghost'}
          loading={pushMutation.isPending}
          onClick={() => pushMutation.mutate()}
        >
          <ArrowUpFromLine className="size-3.5" />
          Push
          {ahead > 0 && <span className="tabular-nums">{ahead}</span>}
        </Button>
      </div>

      <div className="mx-1 h-6 w-px bg-line" />

      <Tooltip label="SSH kurulumu">
        <button
          type="button"
          aria-label="SSH kurulumu"
          onClick={() => setSshOpen(true)}
          className="rounded-md p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          <KeyRound className="size-4" />
        </button>
      </Tooltip>

      <Tooltip label="Git komut günlüğü">
        <button
          type="button"
          aria-label="Git komut günlüğü"
          onClick={toggleCommandLog}
          className={cn(
            'rounded-md p-1.5 hover:bg-surface-2 hover:text-ink',
            commandLogOpen ? 'bg-accent-tint text-accent-ink' : 'text-ink-2',
          )}
        >
          <Terminal className="size-4" />
        </button>
      </Tooltip>

      <Tooltip label="Ayarlar">
        <button
          type="button"
          aria-label="Ayarlar"
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
    </header>
  );
}
