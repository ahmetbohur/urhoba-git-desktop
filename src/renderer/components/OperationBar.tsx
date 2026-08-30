import { useState } from 'react';
import { Search, TriangleAlert } from 'lucide-react';
import { useT } from '../i18n';
import { errorMessage, invoke } from '../lib/ipc';
import { useInvalidateRepo, useMutation, useStatus } from '../lib/queries';
import { useUi } from '../stores/ui';
import { Button } from './primitives';
import type { BisectState, RepoOperation } from '@shared/types';

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

  /*
   * Bisect durumu git'in son çıktısından geliyor, ayrı bir dosyadan değil.
   * İlk açılışta (uygulama bisect ortasında bulduğunda) elimizde çıktı
   * olmuyor; o zaman yalnızca "hata var mı" sorusu gösteriliyor.
   */
  const [bisectState, setBisectState] = useState<BisectState | null>(null);

  const markBisect = useMutation({
    mutationFn: (verdict: 'good' | 'bad' | 'skip') =>
      invoke('git:bisect-mark', { repoId, verdict }),
    onSuccess: (state) => {
      setBisectState(state);
      invalidate(repoId);
      if (state.firstBadSha) {
        toast({
          kind: 'success',
          title: t('Hatayı getiren commit bulundu'),
          description: state.firstBadSha.slice(0, 8),
        });
      }
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('İşaretlenemedi'), description: errorMessage(error) }),
  });

  const endBisect = useMutation({
    mutationFn: () => invoke('git:bisect-reset', { repoId }),
    onSuccess: () => {
      setBisectState(null);
      invalidate(repoId);
      toast({ kind: 'info', title: t('İkili arama bitti'), description: t('Depo önceki hâline döndü.') });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Bitirilemedi'), description: errorMessage(error) }),
  });

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

  /*
   * Bisect diğer yarım işlemlerden farklı: çakışma çözülüp "devam et"
   * denmiyor, her adımda kullanıcıdan bir yargı isteniyor. Bu yüzden şerit
   * o durumda başka düğmeler gösteriyor.
   */
  if (status?.operation === 'bisect') {
    return (
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-warn-tint px-3 py-2">
        <Search className="size-4 shrink-0 text-warn" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-ink">{t('İkili arama sürüyor')}</p>
          <p className="text-[11px] text-ink-2">
            {bisectState?.firstBadSha
              ? t('Hatayı getiren commit: {sha}', {
                  sha: bisectState.firstBadSha.slice(0, 8),
                })
              : bisectState?.remaining != null
                ? t('{count} commit kaldı. Şu an açık olan sürümde hata var mı?', {
                    count: bisectState.remaining,
                  })
                : t('Şu an açık olan sürümde hata var mı?')}
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          loading={markBisect.isPending}
          onClick={() => markBisect.mutate('good')}
        >
          {t('Sağlam')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          loading={markBisect.isPending}
          onClick={() => markBisect.mutate('bad')}
        >
          {t('Hatalı')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          loading={markBisect.isPending}
          onClick={() => markBisect.mutate('skip')}
        >
          {t('Atla')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          loading={endBisect.isPending}
          onClick={() => endBisect.mutate()}
        >
          {t('Bitir')}
        </Button>
      </div>
    );
  }

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
