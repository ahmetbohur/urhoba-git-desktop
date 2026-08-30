import { TriangleAlert } from 'lucide-react';
import { useT } from '../i18n';
import { errorMessage, invoke } from '../lib/ipc';
import { useInvalidateRepo, useMutation, useStatus } from '../lib/queries';
import { useUi } from '../stores/ui';
import { Button } from './primitives';
import type { RepoOperation } from '@shared/types';

const LABELS: Partial<Record<RepoOperation, string>> = {
  merge: 'Birleştirme',
  rebase: 'Rebase',
  'cherry-pick': 'Cherry-pick',
  revert: 'Revert',
  bisect: 'Bisect',
};

/**
 * Yarım kalmış işlem şeridi.
 *
 * Git'te en çok korkutan an bu: bir merge ya da rebase ortasında kalmak ve nasıl
 * çıkacağını bilmemek. Şerit hem durumu hem iki çıkışı (devam et / iptal et)
 * sürekli görünür tutuyor.
 */
export function OperationBar({ repoId }: { repoId: string }) {
  const t = useT();
  const { data: status } = useStatus(repoId);
  const invalidate = useInvalidateRepo();
  const toast = useUi((s) => s.toast);
  const select = useUi((s) => s.select);

  const abort = useMutation({
    mutationFn: () => invoke('git:operation-abort', { repoId }),
    onSuccess: () => {
      invalidate(repoId);
      select({ kind: 'none' });
      toast({
        kind: 'info',
        title: t('İşlem iptal edildi'),
        description: t('Depo önceki hâline döndü.'),
      });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('İptal edilemedi'), description: errorMessage(error) }),
  });

  const continueOperation = useMutation({
    mutationFn: () => invoke('git:operation-continue', { repoId }),
    onSuccess: (result) => {
      invalidate(repoId);
      toast({
        kind: result.outcome === 'conflict' ? 'warning' : result.outcome === 'error' ? 'error' : 'success',
        title: t('İşlem'),
        description: result.message,
      });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Devam edilemedi'), description: errorMessage(error) }),
  });

  if (!status || status.operation === 'none') return null;

  const remaining = status.conflicted.length;
  const label = t(LABELS[status.operation] ?? 'İşlem');

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line bg-warn-tint px-3 py-2">
      <TriangleAlert className="size-4 shrink-0 text-warn" />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-ink">
          {t('{label} yarıda kaldı', { label })}
        </p>
        <p className="text-[11px] text-ink-2">
          {remaining > 0
            ? t(
                '{count} dosyada çakışma çözülmeyi bekliyor. Her birini çözüp hazırladıktan sonra devam et.',
                { count: remaining },
              )
            : t('Bütün çakışmalar çözüldü. İşlemi tamamlayabilirsin.')}
        </p>
      </div>
      <Button size="sm" variant="ghost" loading={abort.isPending} onClick={() => abort.mutate()}>
        {t('İptal et')}
      </Button>
      <Button
        size="sm"
        variant="primary"
        disabled={remaining > 0}
        loading={continueOperation.isPending}
        onClick={() => continueOperation.mutate()}
      >
        {t('Devam et')}
      </Button>
    </div>
  );
}
