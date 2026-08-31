import { useState } from 'react';
import { Switch } from 'radix-ui';
import { Folder, Globe, Languages, Monitor, Moon, Power, Sun } from 'lucide-react';
import { useT } from '../../i18n';
import { cn } from '../../lib/cn';
import { errorMessage, invoke } from '../../lib/ipc';
import { keys, useMutation, useQuery, useQueryClient, useSettings } from '../../lib/queries';
import { useUi } from '../../stores/ui';
import { AiSettingsSection } from './AiSettingsSection';
import { PlainToggle, ScopedToggle } from './ScopedSetting';
import { AutoPullFields } from '../AutoPullFields';
import { DiagnosticsPanel } from '../DiagnosticsPanel';
import { RemoteSettings } from '../RemoteSettings';
import { SectionLabel } from '../primitives';
import { DialogShell } from './DialogShell';
import type {
  ActivityPeriod,
  AppSettings,
  AutoPullSettings,
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

type Scope = 'global' | 'repo';

/**
 * Etkinlik özetinin aralığı. Depo bazlı değil: özet bütün depolara birden
 * bakıyor, "bu depo için 6 saat" diye bir şeyin karşılığı yok.
 */
const ACTIVITY_PERIODS: Array<{ value: ActivityPeriod; label: string }> = [
  { value: '1h', label: '1 saat' },
  { value: '6h', label: '6 saat' },
  { value: '24h', label: '24 saat' },
  { value: '7d', label: '7 gün' },
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

/**
 * Ayarlar.
 *
 * İki kapsam iki sekmede duruyor. Alt alta dizildiklerinde aynı adı taşıyan
 * ayarlar ("Otomatik pull" hem genelde hem depoda) tek bir uzun listede iki kez
 * geçiyordu ve hangisinin neyi etkilediği ancak bölüm başlığı okunarak
 * anlaşılıyordu. Sekme bu ayrımı kullanıcının aklında değil ekranda tutuyor.
 */
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
  const [scope, setScope] = useState<Scope>('global');

  // Pencere kapanırken genel sekmeye dönülüyor, böylece her açılış aynı yerden
  // başlıyor: hangi sekmede kalındığını hatırlamak, bir dahaki sefere aradığını
  // başka yerde bulmak demek oluyordu. Sıfırlama kapanışta yapılıyor; açılışta
  // bir efektle yapmak gereksiz bir ikinci render turu doğuruyor.
  const handleOpenChange = (next: boolean) => {
    if (!next) setScope('global');
    onOpenChange(next);
  };

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
    // `null` verilen alan depo kaydından siliniyor ve genel ayara dönüyor.
    mutationFn: (patch: {
      autoFetch?: boolean | null;
      allowCloudAi?: boolean | null;
      aiEnabled?: boolean | null;
      autoPull?: AutoPullSettings | null;
    }) => invoke('settings:repo-set', { repoId, ...patch }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.repoSettings(repoId) });
      // AI'ın bu depoda açık olup olmaması depo ayarına bağlı; durum sorgusu
      // tazelenmezse commit ekranındaki öneri düğmesi eski hâlinde kalır.
      void client.invalidateQueries({ queryKey: ['ai-status'] });
    },
  });

  const saveDefaults = (patch: Partial<AppSettings['defaults']>) => {
    if (!settings) return;
    saveApp.mutate({ defaults: { ...settings.defaults, ...patch } });
  };

  const TABS: Array<{ id: Scope; label: string; icon: typeof Globe }> = [
    { id: 'global', label: 'Genel', icon: Globe },
    { id: 'repo', label: 'Bu depo', icon: Folder },
  ];

  return (
    <DialogShell open={open} onOpenChange={handleOpenChange} title={t('Ayarlar')} width="lg">
      {!settings ? null : (
        <div className="flex flex-col gap-4">
          <nav
            aria-label={t('Ayar kapsamı')}
            role="tablist"
            className="flex gap-1 rounded-lg bg-surface-2 p-1"
          >
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={scope === id}
                onClick={() => setScope(id)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px] font-medium',
                  scope === id
                    ? 'bg-surface text-ink shadow-sm'
                    : 'text-ink-2 hover:text-ink',
                )}
              >
                <Icon className="size-3.5" />
                {t(label)}
              </button>
            ))}
          </nav>

          {scope === 'global' ? (
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
                        {autostart?.reason ?? t('Oturum açtığında Urhoba kendiliğinden açılır.')}
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
                <SectionLabel>{t('Uzak sunucu davranışı')}</SectionLabel>
                <p className="mt-1 text-[11px] text-ink-2">
                  {t('Bütün depolar için geçerli. Bir depo istediği ayarı kendisi için değiştirebilir.')}
                </p>
                <div className="mt-1 divide-y divide-line-soft">
                  <PlainToggle
                    label={t('Arka planda fetch')}
                    hint={t('Uzak dalın kaç commit ilerde olduğunu tazeler; yerel dosyalara dokunmaz.')}
                    checked={settings.defaults.autoFetch}
                    onCheckedChange={(autoFetch) => saveDefaults({ autoFetch })}
                  />
                  <PlainToggle
                    label={t('Otomatik pull')}
                    hint={t('Uzak sunucudaki değişiklikleri arka planda çeker.')}
                    checked={settings.defaults.autoPull.enabled}
                    onCheckedChange={(enabled) =>
                      saveDefaults({ autoPull: { ...settings.defaults.autoPull, enabled } })
                    }
                  />
                </div>
                <div className="mt-2 flex flex-col gap-3">
                  <AutoPullFields
                    value={settings.defaults.autoPull}
                    onChange={(patch) =>
                      saveDefaults({ autoPull: { ...settings.defaults.autoPull, ...patch } })
                    }
                    intervalLabel={t('Aralık')}
                  />
                </div>
              </section>

              <section>
                <SectionLabel>{t('Etkinlik özeti')}</SectionLabel>
                <p className="mt-1 text-[11px] text-ink-2">
                  {t('Özetin varsayılan aralığı. Pencerede geçici olarak değiştirilebilir.')}
                </p>
                <div className="mt-2 flex gap-1">
                  {ACTIVITY_PERIODS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => saveApp.mutate({ activityPeriod: option.value })}
                      className={cn(
                        'h-8 flex-1 rounded-md border text-[12px]',
                        settings.activityPeriod === option.value
                          ? 'border-accent bg-accent-tint text-accent-ink'
                          : 'border-line bg-surface text-ink-2 hover:bg-surface-2',
                      )}
                    >
                      {t(option.label)}
                    </button>
                  ))}
                </div>
                <div className="mt-1 divide-y divide-line-soft">
                  <PlainToggle
                    label={t('Kendiliğinden çıkar ve bildir')}
                    hint={t('Aralık dolduğunda özet arka planda hazırlanır ve bildirim gösterilir. Hareket yoksa bildirim çıkmaz.')}
                    checked={settings.activityAuto}
                    onCheckedChange={(activityAuto) => saveApp.mutate({ activityAuto })}
                  />
                </div>
              </section>

              <section>
                <SectionLabel>{t('AI yardımı')}</SectionLabel>
                <div className="mt-1 divide-y divide-line-soft">
                  <PlainToggle
                    label={t('AI yardımı')}
                    hint={t('Commit mesajı ve gruplama önerileri. Varsayılan olarak kapalı.')}
                    checked={settings.defaults.aiEnabled}
                    onCheckedChange={(aiEnabled) => saveDefaults({ aiEnabled })}
                  />
                  <PlainToggle
                    label={t('Bulut AI’ya kod gönderilebilsin')}
                    hint={t('Kapalıyken commit mesajı önerisi yalnızca yerel modelle çalışır.')}
                    checked={settings.defaults.allowCloudAi}
                    onCheckedChange={(allowCloudAi) => saveDefaults({ allowCloudAi })}
                  />
                </div>
              </section>

              <AiSettingsSection
                repoSettings={repoSettings}
                globallyEnabled={settings.defaults.aiEnabled}
              />

              <DiagnosticsPanel />
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <section>
                <SectionLabel>{t('Bu depoya özel')}</SectionLabel>
                <p className="mt-1 text-[11px] text-ink-2">
                  {t('“Genel” seçili kaldığı sürece ayar genel varsayılanı izler; genel ayarı değiştirdiğinde bu depo da güncellenir.')}
                </p>
                {repoSettings && (
                  <>
                    <div className="mt-1 divide-y divide-line-soft">
                      <ScopedToggle
                        label={t('Arka planda fetch')}
                        hint={t('Uzak dalın kaç commit ilerde olduğunu tazeler; yerel dosyalara dokunmaz.')}
                        value={repoSettings.autoFetch}
                        inheritedValue={settings.defaults.autoFetch}
                        isOverridden={repoSettings.overrides.autoFetch}
                        onChange={(autoFetch) => saveRepo.mutate({ autoFetch })}
                      />
                      <ScopedToggle
                        label={t('Otomatik pull')}
                        hint={t('Uzak sunucudaki değişiklikleri arka planda çeker.')}
                        value={repoSettings.autoPull.enabled}
                        inheritedValue={settings.defaults.autoPull.enabled}
                        isOverridden={repoSettings.overrides.autoPull}
                        onChange={(enabled) =>
                          saveRepo.mutate({
                            autoPull:
                              enabled === null
                                ? null
                                : { ...settings.defaults.autoPull, enabled },
                          })
                        }
                      />
                    </div>

                    {/*
                     * Ayrıntılar yalnızca depo genel ayardan ayrıldığında
                     * görünüyor: genel ayarı izleyen bir depoda aralığı
                     * düzenlemek, farkında olmadan geçersiz kılma yaratırdı.
                     */}
                    {repoSettings.overrides.autoPull && (
                      <div className="mt-2 flex flex-col gap-3 rounded-lg border border-line-soft p-3">
                        <AutoPullFields
                          value={repoSettings.autoPull}
                          onChange={(patch) =>
                            saveRepo.mutate({
                              autoPull: { ...repoSettings.autoPull, ...patch },
                            })
                          }
                          intervalLabel={t('Aralık')}
                        />
                      </div>
                    )}

                    <div className="mt-1 divide-y divide-line-soft">
                      <ScopedToggle
                        label={t('AI yardımı')}
                        hint={t('Bu depoda commit mesajı önerisi kullanılabilsin mi.')}
                        value={repoSettings.aiEnabled}
                        inheritedValue={settings.defaults.aiEnabled}
                        isOverridden={repoSettings.overrides.aiEnabled}
                        onChange={(aiEnabled) => saveRepo.mutate({ aiEnabled })}
                      />
                      <ScopedToggle
                        label={t('Bulut AI’ya kod gönderilebilsin')}
                        hint={t('Commit mesajı önerisi için bu deponun diff’i buluta gönderilir.')}
                        value={repoSettings.allowCloudAi}
                        inheritedValue={settings.defaults.allowCloudAi}
                        isOverridden={repoSettings.overrides.allowCloudAi}
                        onChange={(allowCloudAi) => saveRepo.mutate({ allowCloudAi })}
                      />
                    </div>
                  </>
                )}
              </section>

              <RemoteSettings repoId={repoId} />
            </div>
          )}
        </div>
      )}
    </DialogShell>
  );
}
