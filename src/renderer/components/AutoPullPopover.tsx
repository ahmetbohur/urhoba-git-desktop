import { Popover, Switch } from 'radix-ui';
import { RefreshCcwDot } from 'lucide-react';
import { useT } from '../i18n';
import { cn } from '../lib/cn';
import { errorMessage, invoke } from '../lib/ipc';
import {
  keys,
  useInvalidateRepo,
  useMutation,
  useQueryClient,
  useRepoSettings,
} from '../lib/queries';
import { relativeTime } from '../lib/format';
import { useUi } from '../stores/ui';
import { Button, SectionLabel } from './primitives';
import type { AutoPullSettings, PullOutcome } from '@shared/types';

const INTERVALS = [1, 5, 10, 15, 30, 60] as const;

/** Sonucun kullanıcı için iyi mi kötü mü olduğunu renkle anlatıyoruz. */
const OUTCOME_TONE: Record<PullOutcome, string> = {
  'up-to-date': 'text-ink-3',
  'fast-forwarded': 'text-ok',
  merged: 'text-ok',
  conflict: 'text-crit',
  'skipped-dirty': 'text-warn',
  'skipped-no-upstream': 'text-warn',
  'skipped-diverged': 'text-warn',
  'skipped-operation-in-progress': 'text-warn',
  error: 'text-crit',
};

function ToggleRow({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3', disabled && 'opacity-50')}>
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-ink">{label}</p>
        <p className="text-[11px] text-ink-3">{hint}</p>
      </div>
      <Switch.Root
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className="relative h-5 w-9 shrink-0 rounded-full bg-surface-3 transition-colors data-[state=checked]:bg-accent"
      >
        <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
      </Switch.Root>
    </div>
  );
}

/**
 * Otomatik pull denetimi.
 *
 * Ayar depo bazlı: insanlar her depoda aynı davranışı istemiyor — ekip deposunda
 * sık, kişisel deposunda hiç. Varsayılanlar bilinçli olarak temkinli; ne
 * yaptığını değiştirmek isteyen buradan iki tıkla açıyor.
 */
export function AutoPullPopover({ repoId }: { repoId: string }) {
  const t = useT();
  const { data: settings } = useRepoSettings(repoId);
  const client = useQueryClient();
  const invalidate = useInvalidateRepo();
  const toast = useUi((s) => s.toast);
  const lastResult = useUi((s) => s.lastAutoPull[repoId]);

  const save = useMutation({
    // Buradan yapılan her değişiklik depoya özel bir ayar oluşturuyor: kullanıcı
    // bu depoda ayrı bir davranış istediğini söylemiş oluyor.
    mutationFn: (autoPull: AutoPullSettings) =>
      invoke('settings:repo-set', { repoId, autoPull }),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.repoSettings(repoId) }),
    onError: (error) =>
      toast({ kind: 'error', title: t('Ayar kaydedilemedi'), description: errorMessage(error) }),
  });

  const pullNow = useMutation({
    mutationFn: () => invoke('autopull:run-now', { repoId }),
    onSuccess: (result) => {
      invalidate(repoId);
      toast({
        kind:
          result.outcome === 'error' || result.outcome === 'conflict'
            ? 'error'
            : result.outcome.startsWith('skipped')
              ? 'warning'
              : 'success',
        title: t('Otomatik pull'),
        description: result.message,
      });
    },
  });

  if (!settings) return null;
  const { autoPull } = settings;
  const update = (patch: Partial<AutoPullSettings>) => save.mutate({ ...autoPull, ...patch });

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          title={
            autoPull.enabled
              ? t('Oto pull · {minutes} dk', { minutes: autoPull.intervalMinutes })
              : t('Oto pull kapalı')
          }
          aria-label={
            autoPull.enabled
              ? t('Oto pull · {minutes} dk', { minutes: autoPull.intervalMinutes })
              : t('Oto pull kapalı')
          }
          className={cn(
            'flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium whitespace-nowrap',
            autoPull.enabled
              ? 'bg-ok-tint text-ok'
              : 'border border-line bg-surface text-ink-2 hover:bg-surface-2',
          )}
        >
          <RefreshCcwDot className={cn('size-3.5', autoPull.enabled && 'animate-pulse')} />
          <span className="hidden lg:inline">
            {autoPull.enabled
              ? t('Oto pull · {minutes} dk', { minutes: autoPull.intervalMinutes })
              : t('Oto pull kapalı')}
          </span>
          <span className="lg:hidden">
            {autoPull.enabled ? t('{minutes} dk', { minutes: autoPull.intervalMinutes }) : ''}
          </span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-80 rounded-lg border border-line bg-surface p-3 shadow-xl"
        >
          <div className="flex flex-col gap-3">
            <div>
              <SectionLabel>{t('Otomatik pull')}</SectionLabel>
              <p className="mt-1 text-[11px] text-ink-2">
                {t('Uzak sunucudaki değişiklikleri arka planda çeker. Bu ayar yalnızca bu depo için geçerlidir.')}
              </p>
            </div>

            <ToggleRow
              label={t('Açık')}
              hint={t('Belirlenen aralıkta uzak dalı kontrol et.')}
              checked={autoPull.enabled}
              onCheckedChange={(enabled) => update({ enabled })}
            />

            <div className={cn(!autoPull.enabled && 'opacity-50')}>
              <p className="mb-1.5 text-[12px] font-medium text-ink">{t('Aralık')}</p>
              <div className="flex flex-wrap gap-1">
                {INTERVALS.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    disabled={!autoPull.enabled}
                    onClick={() => update({ intervalMinutes: minutes })}
                    className={cn(
                      'h-7 min-w-12 rounded-md border px-2 text-[12px] tabular-nums',
                      autoPull.intervalMinutes === minutes
                        ? 'border-transparent bg-accent text-white'
                        : 'border-line bg-surface text-ink-2 hover:bg-surface-2',
                    )}
                  >
                    {t('{minutes} dk', { minutes })}
                  </button>
                ))}
              </div>
            </div>

            <ToggleRow
              label={t('Sadece çalışma dizini temizken')}
              hint={t('Kaydedilmemiş değişiklik varsa dokunma.')}
              checked={autoPull.onlyWhenClean}
              disabled={!autoPull.enabled}
              onCheckedChange={(onlyWhenClean) => update({ onlyWhenClean })}
            />

            <ToggleRow
              label={t('Sadece fast-forward')}
              hint={t('Geçmişler ayrıldıysa birleştirme yapma, kararı sana bırak.')}
              checked={autoPull.fastForwardOnly}
              disabled={!autoPull.enabled}
              onCheckedChange={(fastForwardOnly) => update({ fastForwardOnly })}
            />

            <div className="border-t border-line-soft pt-2">
              {lastResult ? (
                <p className="text-[11px] text-ink-2">
                  <span className={OUTCOME_TONE[lastResult.outcome]}>{lastResult.message}</span>
                  <span className="text-ink-3"> · {relativeTime(lastResult.at)}</span>
                </p>
              ) : (
                <p className="text-[11px] text-ink-3">{t('Bu oturumda henüz otomatik pull çalışmadı.')}</p>
              )}
            </div>

            <Button
              size="sm"
              variant="secondary"
              loading={pullNow.isPending}
              onClick={() => pullNow.mutate()}
            >
              {t('Şimdi çek')}
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
