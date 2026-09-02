import { Popover } from 'radix-ui';
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
import { AutoPullFields, ToggleRow } from './AutoPullFields';
import { Button, SectionLabel } from './primitives';
import type { AutoPullSettings, PullOutcome } from '@shared/types';

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
  // Klasörün yokluğu geçici bir aksaklık değil; kullanıcının müdahalesini
  // gerektiriyor, o yüzden diğer atlamalardan daha güçlü bir renkte.
  'skipped-missing-folder': 'text-crit',
  error: 'text-crit',
};

/**
 * Otomatik pull denetimi.
 *
 * Buradan yapılan her değişiklik depoya özel: insanlar her depoda aynı
 * davranışı istemiyor — ekip deposunda sık, kişisel deposunda hiç. Dokunulmadığı
 * sürece depo genel varsayılanı izliyor, o yüzden ellinin üstünde depoyu tek tek
 * ayarlamak gerekmiyor; genel ayar ayarlar penceresinden değiştiriliyor.
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

  // Depoya özel ayarı silmek: alan `null` verilince kayıttan düşüyor ve depo
  // yeniden genel varsayılanı izlemeye başlıyor.
  const revert = useMutation({
    mutationFn: () => invoke('settings:repo-set', { repoId, autoPull: null }),
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
                {settings.overrides.autoPull
                  ? t('Bu depo için ayrı ayarlandı; genel varsayılanı izlemiyor.')
                  : t('Genel varsayılanı izliyor. Burada bir değişiklik yaparsan yalnızca bu depoya özel olur.')}
              </p>
            </div>

            <ToggleRow
              label={t('Açık')}
              hint={t('Belirlenen aralıkta uzak dalı kontrol et.')}
              checked={autoPull.enabled}
              onCheckedChange={(enabled) => update({ enabled })}
            />

            <AutoPullFields
              value={autoPull}
              onChange={update}
              intervalLabel={t('Aralık')}
            />

            {settings.overrides.autoPull && (
              <button
                type="button"
                onClick={() => revert.mutate()}
                className="self-start text-[11px] text-accent-ink underline underline-offset-2"
              >
                {t('Genel ayara dön')}
              </button>
            )}

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
