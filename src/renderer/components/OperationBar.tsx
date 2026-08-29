import { TriangleAlert } from 'lucide-react';
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
  const { data: status } = useStatus(repoId);
  const invalidate = useInvalidateRepo();
  const toast = useUi((s) => s.toast);
  const select = useUi((s) => s.select);

  const abort = useMutation({
    mutationFn: () => invoke('git:operation-abort', { repoId }),
    onSuccess: () => {
      invalidate(repoId);
      select({ kind: 'none' });
      toast({ kind: 'info', title: 'İşlem iptal edildi', description: 'Depo önceki hâline döndü.' });
    },
    onError: (error) =>
      toast({ kind: 'error', title: 'İptal edilemedi', description: errorMessage(error) }),
  });

  const continueOperation = useMutation({
    mutationFn: () => invoke('git:operation-continue', { repoId }),
    onSuccess: (result) => {
      invalidate(repoId);
      toast({
        kind: result.outcome === 'conflict' ? 'warning' : result.outcome === 'error' ? 'error' : 'success',
        title: 'İşlem',
        description: result.message,
      });
    },
    onError: (error) =>
      toast({ kind: 'error', title: 'Devam edilemedi', description: errorMessage(error) }),
  });

  if (!status || status.operation === 'none') return null;

  const remaining = status.conflicted.length;
  const label = LABELS[status.operation] ?? 'İşlem';

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line bg-warn-tint px-3 py-2">
      <TriangleAlert className="size-4 shrink-0 text-warn" />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-ink">{label} yarıda kaldı</p>
        <p className="text-[11px] text-ink-2">
          {remaining > 0
            ? `${remaining} dosyada çakışma çözülmeyi bekliyor. Her birini çözüp hazırladıktan sonra devam et.`
            : 'Bütün çakışmalar çözüldü. İşlemi tamamlayabilirsin.'}
        </p>
      </div>
      <Button size="sm" variant="ghost" loading={abort.isPending} onClick={() => abort.mutate()}>
        İptal et
      </Button>
      <Button
        size="sm"
        variant="primary"
        disabled={remaining > 0}
        loading={continueOperation.isPending}
        onClick={() => continueOperation.mutate()}
      >
        Devam et
      </Button>
    </div>
  );
}
