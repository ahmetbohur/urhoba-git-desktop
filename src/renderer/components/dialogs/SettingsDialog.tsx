import { Switch } from 'radix-ui';
import { Languages, Monitor, Moon, Power, Sun } from 'lucide-react';
import { useT } from '../../i18n';
import { cn } from '../../lib/cn';
import { errorMessage, invoke } from '../../lib/ipc';
import { keys, useMutation, useQuery, useQueryClient, useSettings } from '../../lib/queries';
import { useUi } from '../../stores/ui';
import { AiSettingsSection } from './AiSettingsSection';
import { DiagnosticsPanel } from '../DiagnosticsPanel';
import { RemoteSettings } from '../RemoteSettings';
import { SectionLabel } from '../primitives';
import { DialogShell } from './DialogShell';
import type {
  AppSettings,
  AutostartStatus,
  LanguagePreference,
  RepoSettings,
  ThemePreference,
} from '@shared/types';

const THEMES: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'system', label: 'Sistem', icon: Monitor },
  { value: 'light', label: 'Açık', icon: Sun },
  { value: 'dark', label: 'Koyu', icon: Moon },
];

/**
 * Dil adları çevrilmiyor: bir dilin adı kendi dilinde yazılır. Kullanıcı
 * arayüzü anlamadığı bir dilde açtıysa geri dönebilmesi buna bağlı.
 */
const LANGUAGES: Array<{ value: LanguagePreference; label: string }> = [
  { value: 'tr', label: 'Türkçe' },
  { value: 'en', label: 'English' },
];

function Row({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink">{label}</p>
        <p className="text-[11px] text-ink-2">{hint}</p>
      </div>
      <Switch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-surface-3 transition-colors data-[state=checked]:bg-accent"
      >
        <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
      </Switch.Root>
    </div>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  repoId,
  repoSettings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoId: string;
  repoSettings: RepoSettings | null;
}) {
  const t = useT();
  const { data: settings } = useSettings();
  const client = useQueryClient();
  const toast = useUi((s) => s.toast);

  const saveApp = useMutation({
    mutationFn: (patch: Partial<AppSettings>) => invoke('settings:set', patch),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.settings }),
    onError: (error) =>
      toast({ kind: 'error', title: t('Ayar kaydedilemedi'), description: errorMessage(error) }),
  });

  /*
   * Otomatik başlatma durumu ayar dosyamızda değil, işletim sisteminde tutuluyor:
   * kullanıcı bunu sistem ayarlarından da kapatabilir ve o zaman bizim kaydımız
   * gerçeği yansıtmaz. Bu yüzden her açılışta okuyoruz.
   */
  const { data: autostart } = useQuery<AutostartStatus>({
    queryKey: ['autostart'],
    queryFn: () => invoke('app:autostart-get', undefined),
    enabled: open,
  });

  const setAutostart = useMutation({
    mutationFn: (enabled: boolean) => invoke('app:autostart-set', { enabled }),
    onSuccess: (status) => {
      client.setQueryData(['autostart'], status);
      if (status.reason) {
        toast({ kind: 'warning', title: t('Otomatik başlatma'), description: status.reason });
      }
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Ayar kaydedilemedi'), description: errorMessage(error) }),
  });

  const saveRepo = useMutation({
    mutationFn: (patch: Partial<RepoSettings>) => invoke('settings:repo-set', { repoId, ...patch }),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.repoSettings(repoId) }),
  });

  return (
    <DialogShell open={open} onOpenChange={onOpenChange} title={t('Ayarlar')} width="lg">
      {!settings ? null : (
        <div className="flex flex-col gap-5">
          <section>
            <SectionLabel>{t('Görünüm ve dil')}</SectionLabel>
            <div className="mt-2 flex gap-2">
              {THEMES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => saveApp.mutate({ theme: value })}
                  className={cn(
                    'flex h-16 flex-1 flex-col items-center justify-center gap-1 rounded-lg border text-[12px]',
                    settings.theme === value
                      ? 'border-accent bg-accent-tint text-accent-ink'
                      : 'border-line bg-surface text-ink-2 hover:bg-surface-2',
                  )}
                >
                  <Icon className="size-4" />
                  {t(label)}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-ink">
                <Languages className="size-3.5 text-ink-2" />
                {t('Arayüz dili')}
              </p>
              <div className="flex gap-2">
                {LANGUAGES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => saveApp.mutate({ language: option.value })}
                    className={cn(
                      'h-8 flex-1 rounded-lg border text-[12px]',
                      settings.language === option.value
                        ? 'border-accent bg-accent-tint text-accent-ink'
                        : 'border-line bg-surface text-ink-2 hover:bg-surface-2',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-1 divide-y divide-line-soft">
              <Row
                label={t('Diff’i yan yana göster')}
                hint={t('Kapalıyken eski ve yeni satırlar tek sütunda alt alta gösterilir.')}
                checked={settings.sideBySideDiff}
                onCheckedChange={(sideBySideDiff) => saveApp.mutate({ sideBySideDiff })}
              />
            </div>
          </section>

          <section>
            <SectionLabel>{t('Başlangıç')}</SectionLabel>
            <div className="mt-1 divide-y divide-line-soft">
              <div className="flex items-start justify-between gap-4 py-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                    <Power className="size-3.5 text-ink-2" />
                    {t('Sistem açılınca başlat')}
                  </p>
                  <p className="text-[11px] text-ink-2">
                    {autostart?.reason ??
                      t('Oturum açtığında Urhoba kendiliğinden açılır.')}
                  </p>
                </div>
                <Switch.Root
                  checked={autostart?.enabled ?? false}
                  disabled={!autostart?.supported}
                  onCheckedChange={(checked) => setAutostart.mutate(checked)}
                  className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-surface-3 transition-colors disabled:opacity-40 data-[state=checked]:bg-accent"
                >
                  <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
                </Switch.Root>
              </div>
            </div>
          </section>

          <section>
            <SectionLabel>{t('Bu depo')}</SectionLabel>
            <div className="mt-1 divide-y divide-line-soft">
              <Row
                label={t('Arka planda fetch')}
                hint={t('Uzak dalın kaç commit ilerde olduğunu tazeler; yerel dosyalara dokunmaz.')}
                checked={repoSettings?.autoFetch ?? true}
                onCheckedChange={(autoFetch) => saveRepo.mutate({ autoFetch })}
              />
            </div>
            <p className="mt-2 text-[11px] text-ink-3">
              {t('Bu deponun otomatik pull ayarları üst çubuktaki “Oto pull” düğmesinde.')}
            </p>
          </section>

          <AiSettingsSection repoId={repoId} repoSettings={repoSettings} />

          <RemoteSettings repoId={repoId} />

          <DiagnosticsPanel />

          <section>
            <SectionLabel>{t('Yeni depolar için varsayılan otomatik pull')}</SectionLabel>
            <div className="mt-1 divide-y divide-line-soft">
              <Row
                label={t('Açık gelsin')}
                hint={t('Yeni eklenen depolarda otomatik pull baştan etkin olsun.')}
                checked={settings.defaultAutoPull.enabled}
                onCheckedChange={(enabled) =>
                  saveApp.mutate({ defaultAutoPull: { ...settings.defaultAutoPull, enabled } })
                }
              />
              <Row
                label={t('Sadece çalışma dizini temizken')}
                hint={t('Kaydedilmemiş değişiklik varken otomatik pull denenmesin.')}
                checked={settings.defaultAutoPull.onlyWhenClean}
                onCheckedChange={(onlyWhenClean) =>
                  saveApp.mutate({ defaultAutoPull: { ...settings.defaultAutoPull, onlyWhenClean } })
                }
              />
              <Row
                label={t('Sadece fast-forward')}
                hint={t('Arka planda merge commit’i üretilmesin.')}
                checked={settings.defaultAutoPull.fastForwardOnly}
                onCheckedChange={(fastForwardOnly) =>
                  saveApp.mutate({
                    defaultAutoPull: { ...settings.defaultAutoPull, fastForwardOnly },
                  })
                }
              />
            </div>
          </section>
        </div>
      )}
    </DialogShell>
  );
}
