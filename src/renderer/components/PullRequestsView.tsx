import { useState } from 'react';
import {
  ExternalLink,
  GitPullRequest,
  GitPullRequestDraft,
  MessageSquare,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { useT } from '../i18n';
import { cn } from '../lib/cn';
import { relativeTime } from '../lib/format';
import { errorMessage, invoke } from '../lib/ipc';
import {
  keys,
  useGithubStatus,
  useInvalidateRepo,
  useMutation,
  useQueryClient,
  usePullRequests,
  useRepoContext,
  useStatus,
} from '../lib/queries';
import { useUi } from '../stores/ui';
import { Badge, Button, EmptyState, SectionLabel, Spinner } from './primitives';
import { GithubDialog } from './dialogs/GithubDialog';
import { CreatePullDialog } from './dialogs/CreatePullDialog';
import type { PullRequest } from '@shared/types';

/**
 * Pull request listesi.
 *
 * Üç farklı "boş" durum var ve hepsi farklı bir çözüm gerektiriyor: hesap bağlı
 * değil, depo GitHub'da değil, açık PR yok. Hepsini aynı boş listeyle geçmek
 * kullanıcıyı neyin eksik olduğunu tahmin etmeye bırakırdı.
 */
function PullRow({
  pull,
  onCheckout,
  isCheckingOut,
}: {
  pull: PullRequest;
  onCheckout: () => void;
  isCheckingOut: boolean;
}) {
  const t = useT();
  const Icon = pull.isDraft ? GitPullRequestDraft : GitPullRequest;

  return (
    <div className="group flex items-start gap-3 border-b border-line-soft px-3 py-2.5 hover:bg-surface-2">
      <Icon
        className={cn('mt-0.5 size-4 shrink-0', pull.isDraft ? 'text-ink-3' : 'text-ok')}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink">{pull.title}</p>
        <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-2">
          <span className="font-mono text-ink-3">#{pull.number}</span>
          <span>@{pull.authorLogin}</span>
          <span className="text-ink-3">{relativeTime(pull.updatedAt)}</span>
          {pull.isDraft && <Badge tone="neutral">{t('taslak')}</Badge>}
          {pull.headRepoFullName && <Badge tone="warn">{t('fork')}</Badge>}
          {pull.commentCount > 0 && (
            <span className="flex items-center gap-0.5 text-ink-3">
              <MessageSquare className="size-3" />
              {pull.commentCount}
            </span>
          )}
        </p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-ink-3">
          {pull.headRepoFullName ? `${pull.headRepoFullName}:` : ''}
          {pull.headRef} → {pull.baseRef}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
        <Button size="sm" variant="ghost" onClick={() => window.open(pull.htmlUrl, '_blank')}>
          <ExternalLink className="size-3.5" />
        </Button>
        <Button size="sm" variant="secondary" loading={isCheckingOut} onClick={onCheckout}>
          {t('Bu dala geç')}
        </Button>
      </div>
    </div>
  );
}

export function PullRequestsView({ repoId }: { repoId: string }) {
  const t = useT();
  const { data: auth, isLoading: authLoading } = useGithubStatus();
  const { data: context, isLoading: contextLoading } = useRepoContext(repoId);
  const { data: status } = useStatus(repoId);
  const isGithubRepo = context?.isGithub ?? false;
  const canList = (auth?.authenticated ?? false) && isGithubRepo;

  const {
    data: pulls,
    isLoading: pullsLoading,
    isFetching,
    error,
  } = usePullRequests(repoId, canList);

  const client = useQueryClient();
  const invalidate = useInvalidateRepo();
  const toast = useUi((s) => s.toast);
  const [signInOpen, setSignInOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const checkoutPull = useMutation({
    mutationFn: (number: number) => invoke('github:pull-checkout', { repoId, number }),
    onSuccess: (result) => {
      invalidate(repoId);
      toast({
        kind: result.outcome === 'switched' ? 'success' : 'warning',
        title: t('PR dalı'),
        description: result.message,
      });
    },
    onError: (error_) =>
      toast({ kind: 'error', title: t('PR dalına geçilemedi'), description: errorMessage(error_) }),
  });

  if (authLoading || contextLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!auth?.authenticated) {
    return (
      <>
        <EmptyState
          icon={<GitPullRequest className="size-6" />}
          title={t('GitHub hesabı bağlı değil')}
          description={t('Pull request’leri görmek ve açmak için bir kişisel erişim jetonuyla bağlan.')}
          action={
            <Button variant="primary" onClick={() => setSignInOpen(true)}>
              {t('GitHub’a bağlan')}
            </Button>
          }
        />
        <GithubDialog open={signInOpen} onOpenChange={setSignInOpen} />
      </>
    );
  }

  if (!isGithubRepo) {
    return (
      <EmptyState
        icon={<GitPullRequest className="size-6" />}
        title={t('Bu depo GitHub’da değil')}
        description={
          context
            ? t(
                'Uzak sunucu {host} adresini gösteriyor. Pull request desteği şimdilik yalnızca github.com için var.',
                { host: context.host },
              )
            : t('Depoda tanımlı bir uzak sunucu yok. Ayarlardan bir remote ekleyebilirsin.')
        }
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <SectionLabel>
          {context?.owner}/{context?.name}
        </SectionLabel>
        {pulls && <Badge tone="accent">{t('{count} açık', { count: pulls.length })}</Badge>}
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          loading={isFetching}
          onClick={() => void client.invalidateQueries({ queryKey: keys.pulls(repoId) })}
        >
          <RefreshCw className="size-3.5" />
          {t('Tazele')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={!status?.branch}
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="size-3.5" />
          {t('PR oluştur')}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-surface">
        {pullsLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : error ? (
          <EmptyState
            title={t('Pull request’ler alınamadı')}
            description={errorMessage(error)}
            action={
              <Button
                variant="secondary"
                onClick={() => void client.invalidateQueries({ queryKey: keys.pulls(repoId) })}
              >
                {t('Tekrar dene')}
              </Button>
            }
          />
        ) : (pulls?.length ?? 0) === 0 ? (
          <EmptyState
            title={t('Açık pull request yok')}
            description={t('Bir özellik dalında çalışıyorsan yukarıdan yeni bir PR açabilirsin.')}
          />
        ) : (
          pulls?.map((pull) => (
            <PullRow
              key={pull.number}
              pull={pull}
              isCheckingOut={checkoutPull.isPending && checkoutPull.variables === pull.number}
              onCheckout={() => checkoutPull.mutate(pull.number)}
            />
          ))
        )}
      </div>

      <CreatePullDialog
        repoId={repoId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        currentBranch={status?.branch ?? null}
      />
    </div>
  );
}
