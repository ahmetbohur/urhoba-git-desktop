import { useState } from 'react';
import { ArrowDown, ArrowUp, TriangleAlert } from 'lucide-react';
import { useT } from '../../i18n';
import { cn } from '../../lib/cn';
import { errorMessage, invoke } from '../../lib/ipc';
import { keys, useInvalidateRepo, useMutation, useQueryClient, useStatus } from '../../lib/queries';
import { useUi } from '../../stores/ui';
import { Button } from '../primitives';
import { DialogShell } from './DialogShell';
import type { Commit, RebaseAction, RebaseStep } from '@shared/types';

/**
 * Etkileşimli rebase.
 *
 * Liste geçmişteki gibi yeniden eskiye sıralı duruyor; git ise todo dosyasını
 * eskiden yeniye okuyor. Çeviriyi gönderirken yapıyoruz — kullanıcıya
 * alışkın olduğu sırayı göstermek, git'in iç biçimini ona öğretmekten iyi.
 *
 * Mesaj değişikliği git'in `reword` komutuyla yapılmıyor: o komut mesaj
 * editörünü açıyor ve hangi commit için açtığını dışarıdan anlamak güvenilir
 * değil. Bunun yerine yeni mesaj burada yazılıyor ve commit uygulandıktan
 * hemen sonra çalışan bir adım mesajı yerine koyuyor.
 */

const ACTIONS: Array<{ action: RebaseAction; label: string; hint: string }> = [
  { action: 'pick', label: 'Koru', hint: 'Olduğu gibi kalsın.' },
  { action: 'reword', label: 'Mesaj', hint: 'Yalnızca commit mesajı değişsin.' },
  { action: 'squash', label: 'Birleştir', hint: 'Bir öncekine katılsın, mesajlar birleşsin.' },
  { action: 'fixup', label: 'Kaynat', hint: 'Bir öncekine katılsın, mesajı atılsın.' },
  { action: 'drop', label: 'At', hint: 'Bu commit tamamen çıkarılsın.' },
];

const ACTION_STYLES: Record<RebaseAction, string> = {
  pick: 'border-line bg-surface',
  reword: 'border-accent bg-accent-tint',
  squash: 'border-accent bg-accent-tint',
  fixup: 'border-accent bg-accent-tint',
  drop: 'border-crit bg-crit-tint line-through opacity-70',
};

export function RebaseDialog({
  open,
  onOpenChange,
  repoId,
  baseSha,
  commits,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoId: string;
  /** Bu commit'in üstündekiler düzenleniyor; kendisine dokunulmuyor. */
  baseSha: string;
  /** Yeniden eskiye sıralı — geçmiş listesindeki sırayla aynı. */
  commits: Commit[];
}) {
  const t = useT();
  const client = useQueryClient();
  const invalidate = useInvalidateRepo();
  const toast = useUi((s) => s.toast);
  const { data: status } = useStatus(repoId);

  const [steps, setSteps] = useState<RebaseStep[]>(() =>
    commits.map((commit) => ({
      sha: commit.sha,
      subject: commit.subject,
      action: 'pick' as RebaseAction,
      // Mesaj alanı seçildiğinde mevcut konu ile dolu gelsin; kullanıcı baştan
      // yazmak yerine düzeltiyor.
      message: commit.subject,
    })),
  );

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    setSteps(next);
  };

  const setAction = (index: number, action: RebaseAction) => {
    setSteps(steps.map((step, position) => (position === index ? { ...step, action } : step)));
  };

  const setMessage = (index: number, message: string) => {
    setSteps(steps.map((step, position) => (position === index ? { ...step, message } : step)));
  };

  const apply = useMutation({
    mutationFn: () =>
      invoke('git:rebase-interactive', {
        repoId,
        baseSha,
        // Arayüz yeniden eskiye, git eskiden yeniye okuyor.
        steps: [...steps].reverse(),
      }),
    onSuccess: (result) => {
      invalidate(repoId);
      void client.invalidateQueries({ queryKey: keys.log(repoId) });
      toast({
        kind: result.outcome === 'conflict' ? 'warning' : 'success',
        title: t('Yeniden düzenleme'),
        description: result.message,
      });
      onOpenChange(false);
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Düzenlenemedi'), description: errorMessage(error) }),
  });

  const dirty = (status?.staged.length ?? 0) + (status?.unstaged.length ?? 0) > 0;
  const kept = steps.filter((step) => step.action !== 'drop');
  /*
   * Engelleri git'e sormadan önce söylüyoruz. Rebase kirli bir çalışma
   * dizininde zaten başlamıyor; kullanıcıyı formu doldurup İngilizce bir
   * hataya çarpmaktan kurtarıyoruz.
   */
  const blocker = dirty
    ? t('Kaydedilmemiş değişiklikler var. Önce commit’le ya da sakla.')
    : status?.operation !== 'none'
      ? t('Yarım kalmış bir işlem var. Önce onu bitir.')
      : !status?.branch
        ? t('Ayrık HEAD durumunda yeniden düzenleme yapılamaz.')
        : kept.length === 0
          ? t('Bütün commit’ler atılıyor; en az biri kalmalı.')
          : kept[kept.length - 1].action !== 'pick'
            ? t('En eski commit bir öncekiyle birleştirilemez; onu “koru” yap.')
            : null;

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t('Commit’leri yeniden düzenle')}
      description={t('Sırayı değiştir, birleştir ya da at. Geçmiş yeniden yazılır.')}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('Vazgeç')}
          </Button>
          <Button
            variant="primary"
            loading={apply.isPending}
            disabled={!!blocker}
            onClick={() => apply.mutate()}
          >
            {t('Uygula')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="max-h-80 overflow-y-auto rounded-lg border border-line">
          {steps.map((step, index) => (
            <div
              key={step.sha}
              className={cn(
                'border-b border-line-soft last:border-b-0',
                step.action === 'drop' && 'bg-crit-tint',
              )}
            >
              <div className="flex items-center gap-2 px-2 py-1.5">
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  aria-label={t('Yukarı taşı')}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className="rounded p-0.5 text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-30"
                >
                  <ArrowUp className="size-3" />
                </button>
                <button
                  type="button"
                  aria-label={t('Aşağı taşı')}
                  disabled={index === steps.length - 1}
                  onClick={() => move(index, 1)}
                  className="rounded p-0.5 text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-30"
                >
                  <ArrowDown className="size-3" />
                </button>
              </div>

              <span className="shrink-0 font-mono text-[11px] text-ink-3">
                {step.sha.slice(0, 7)}
              </span>
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-[12px] text-ink',
                  step.action === 'drop' && 'line-through opacity-60',
                )}
              >
                {step.subject}
              </span>

                <div className="flex shrink-0 gap-0.5">
                  {ACTIONS.map((option) => (
                  <button
                    key={option.action}
                    type="button"
                    title={t(option.hint)}
                    aria-label={`${step.subject}: ${t(option.label)}`}
                    onClick={() => setAction(index, option.action)}
                    className={cn(
                      'rounded-md border px-1.5 py-0.5 text-[11px]',
                      step.action === option.action
                        ? ACTION_STYLES[option.action]
                        : 'border-transparent text-ink-3 hover:bg-surface-2',
                    )}
                  >
                    {t(option.label)}
                  </button>
                ))}
                </div>
              </div>

              {step.action === 'reword' && (
                <div className="px-2 pb-2 pl-11">
                  <input
                    value={step.message ?? ''}
                    onChange={(event) => setMessage(index, event.target.value)}
                    aria-label={t('Yeni commit mesajı')}
                    placeholder={t('Yeni commit mesajı')}
                    className="selectable h-7 w-full rounded-md border border-line bg-ground px-2 text-[12px] text-ink placeholder:text-ink-3 focus-visible:border-accent"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <p className="text-[11px] text-ink-3">
          {t('En alttaki en eski commit. “Birleştir” ve “kaynat” bir alttakine katar.')}
        </p>

        {blocker ? (
          <p className="flex items-start gap-1.5 rounded-md bg-crit-tint px-2.5 py-2 text-[11px] text-ink">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-crit" />
            {blocker}
          </p>
        ) : (
          <p className="flex items-start gap-1.5 rounded-md bg-warn-tint px-2.5 py-2 text-[11px] text-ink">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" />
            {t('Bu commit’ler yeniden yazılacak. Uzak sunucuya gönderilmişlerse zorlamalı gönderim gerekir.')}
          </p>
        )}
      </div>
    </DialogShell>
  );
}
