import { useState } from 'react';
import { History, RotateCcw, TriangleAlert } from 'lucide-react';
import { useT } from '../../i18n';
import { cn } from '../../lib/cn';
import { relativeTime } from '../../lib/format';
import { errorMessage, invoke } from '../../lib/ipc';
import { keys, useInvalidateRepo, useMutation, useQuery, useQueryClient, useStatus } from '../../lib/queries';
import { useUi } from '../../stores/ui';
import { Badge, Button, EmptyState, Spinner } from '../primitives';
import { DialogShell } from './DialogShell';
import type { ReflogEntry, ResetMode } from '@shared/types';

/**
 * HEAD'in geçmişteki hareketleri ve oraya dönme.
 *
 * Reflog, geçmişten silinmiş commit'lere ulaşmanın tek yolu: yanlış bir reset
 * ya da yarıda kesilmiş bir rebase'ten sonra kaybolmuş gibi görünen çalışma
 * burada duruyor. Bu yüzden ayrı bir pencere hak ediyor — commit geçmişinde
 * görünmeyen şeyleri gösteriyor.
 *
 * Dönüş `reset` ile yapılıyor ve kipi kullanıcı seçiyor. Varsayılan karışık
 * (`mixed`): commit'ler geri alınıyor ama dosyalar duruyor. Sert kip
 * kaydedilmemiş her şeyi siliyor, o yüzden ayrıca uyarılıyor ve çalışma dizini
 * kirliyken kullanıcıya ne kaybedeceği söyleniyor.
 */

/** Eylem adına göre ton: bir şey silen komutlar göze çarpsın. */
const ACTION_TONES: Record<string, 'accent' | 'warn' | 'crit' | 'neutral'> = {
  commit: 'accent',
  'commit (amend)': 'warn',
  'commit (initial)': 'accent',
  merge: 'accent',
  pull: 'accent',
  rebase: 'warn',
  checkout: 'neutral',
  reset: 'crit',
  'cherry-pick': 'accent',
  revert: 'warn',
};

const MODES: Array<{ mode: ResetMode; label: string; hint: string }> = [
  { mode: 'soft', label: 'Yumuşak', hint: 'Değişiklikler hazırlıkta kalır.' },
  { mode: 'mixed', label: 'Karışık', hint: 'Değişiklikler hazırlık dışında kalır.' },
  { mode: 'hard', label: 'Sert', hint: 'Kaydedilmemiş her şey silinir.' },
];

export function ReflogDialog({
  open,
  onOpenChange,
  repoId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoId: string;
}) {
  const t = useT();
  const client = useQueryClient();
  const invalidate = useInvalidateRepo();
  const toast = useUi((s) => s.toast);
  const { data: status } = useStatus(repoId);
  const [selected, setSelected] = useState<ReflogEntry | null>(null);
  const [mode, setMode] = useState<ResetMode>('mixed');

  const { data: entries, isLoading } = useQuery<ReflogEntry[]>({
    queryKey: ['reflog', repoId],
    queryFn: () => invoke('git:reflog', { repoId }),
    enabled: open,
  });

  const restore = useMutation({
    mutationFn: () => invoke('git:reset', { repoId, sha: selected?.sha ?? '', mode }),
    onSuccess: () => {
      invalidate(repoId);
      void client.invalidateQueries({ queryKey: keys.log(repoId) });
      void client.invalidateQueries({ queryKey: ['reflog', repoId] });
      toast({
        kind: 'success',
        title: t('HEAD {sha} commit’ine taşındı', { sha: selected?.shortSha ?? '' }),
      });
      onOpenChange(false);
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Geri alınamadı'), description: errorMessage(error) }),
  });

  const dirtyCount = (status?.staged.length ?? 0) + (status?.unstaged.length ?? 0);
  // Sert kip kaydedilmemiş çalışmayı siliyor; kaç dosyanın gideceğini söylemek
  // "geri dönüşü yok" cümlesinden daha somut bir uyarı.
  const losesWork = mode === 'hard' && dirtyCount > 0;

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t('HEAD geçmişi (reflog)')}
      description={t('Geçmişten silinmiş commit’lere de buradan dönebilirsin.')}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('Vazgeç')}
          </Button>
          <Button
            variant={mode === 'hard' ? 'danger' : 'primary'}
            loading={restore.isPending}
            disabled={!selected}
            onClick={() => restore.mutate()}
          >
            <RotateCcw className="size-3.5" />
            {t('Bu noktaya dön')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (entries?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<History className="size-5" />}
            title={t('Kayıt yok')}
            description={t('Bu depoda henüz HEAD hareketi kaydedilmemiş.')}
          />
        ) : (
          <div className="max-h-80 overflow-y-auto rounded-lg border border-line">
            {entries?.map((entry) => (
              <button
                key={entry.selector}
                type="button"
                onClick={() => setSelected(entry)}
                className={cn(
                  'flex w-full items-center gap-2 border-b border-line-soft px-2.5 py-2 text-left last:border-b-0',
                  selected?.selector === entry.selector ? 'bg-accent-tint' : 'hover:bg-surface-2',
                )}
              >
                <span className="shrink-0 font-mono text-[11px] text-ink-3">{entry.shortSha}</span>
                <Badge tone={ACTION_TONES[entry.action] ?? 'neutral'}>{entry.action}</Badge>
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
                  {entry.message || '—'}
                </span>
                <span className="shrink-0 text-[11px] text-ink-3">{relativeTime(entry.at)}</span>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="flex flex-col gap-2 border-t border-line-soft pt-3">
            <p className="text-[12px] text-ink-2">
              {t('{sha} commit’ine dönülecek. Dosyalara ne olacağını seç:', {
                sha: selected.shortSha,
              })}
            </p>
            <div className="flex gap-1">
              {MODES.map((option) => (
                <button
                  key={option.mode}
                  type="button"
                  onClick={() => setMode(option.mode)}
                  className={cn(
                    'flex-1 rounded-md border px-2 py-1.5 text-left',
                    mode === option.mode
                      ? 'border-accent bg-accent-tint'
                      : 'border-line bg-surface hover:bg-surface-2',
                  )}
                >
                  <span className="block text-[12px] font-medium text-ink">{t(option.label)}</span>
                  <span className="block text-[10px] text-ink-2">{t(option.hint)}</span>
                </button>
              ))}
            </div>
            {losesWork && (
              <p className="flex items-start gap-1.5 rounded-md bg-crit-tint px-2.5 py-2 text-[11px] text-ink">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-crit" />
                {t('{count} dosyadaki kaydedilmemiş değişiklik silinecek.', {
                  count: dirtyCount,
                })}
              </p>
            )}
          </div>
        )}
      </div>
    </DialogShell>
  );
}
