import { Switch } from 'radix-ui';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '../../lib/cn';
import { errorMessage, invoke } from '../../lib/ipc';
import { keys, useMutation, useQueryClient, useSettings } from '../../lib/queries';
import { useUi } from '../../stores/ui';
import { DiagnosticsPanel } from '../DiagnosticsPanel';
import { RemoteSettings } from '../RemoteSettings';
import { SectionLabel } from '../primitives';
import { DialogShell } from './DialogShell';
import type { AppSettings, RepoSettings, ThemePreference } from '@shared/types';

const THEMES: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'system', label: 'Sistem', icon: Monitor },
  { value: 'light', label: 'Açık', icon: Sun },
  { value: 'dark', label: 'Koyu', icon: Moon },
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
  const { data: settings } = useSettings();
  const client = useQueryClient();
  const toast = useUi((s) => s.toast);

  const saveApp = useMutation({
    mutationFn: (patch: Partial<AppSettings>) => invoke('settings:set', patch),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.settings }),
    onError: (error) =>
      toast({ kind: 'error', title: 'Ayar kaydedilemedi', description: errorMessage(error) }),
  });

  const saveRepo = useMutation({
    mutationFn: (patch: Partial<RepoSettings>) => invoke('settings:repo-set', { repoId, ...patch }),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.repoSettings(repoId) }),
  });

  return (
    <DialogShell open={open} onOpenChange={onOpenChange} title="Ayarlar" width="lg">
      {!settings ? null : (
        <div className="flex flex-col gap-5">
          <section>
            <SectionLabel>Görünüm</SectionLabel>
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
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-1 divide-y divide-line-soft">
              <Row
                label="Diff'i yan yana göster"
                hint="Kapalıyken eski ve yeni satırlar tek sütunda alt alta gösterilir."
                checked={settings.sideBySideDiff}
                onCheckedChange={(sideBySideDiff) => saveApp.mutate({ sideBySideDiff })}
              />
            </div>
          </section>

          <section>
            <SectionLabel>Bu depo</SectionLabel>
            <div className="mt-1 divide-y divide-line-soft">
              <Row
                label="Arka planda fetch"
                hint="Uzak dalın kaç commit ilerde olduğunu tazeler; yerel dosyalara dokunmaz."
                checked={repoSettings?.autoFetch ?? true}
                onCheckedChange={(autoFetch) => saveRepo.mutate({ autoFetch })}
              />
            </div>
            <p className="mt-2 text-[11px] text-ink-3">
              Bu deponun otomatik pull ayarları üst çubuktaki “Oto pull” düğmesinde.
            </p>
          </section>

          <RemoteSettings repoId={repoId} />

          <DiagnosticsPanel />

          <section>
            <SectionLabel>Yeni depolar için varsayılan otomatik pull</SectionLabel>
            <div className="mt-1 divide-y divide-line-soft">
              <Row
                label="Açık gelsin"
                hint="Yeni eklenen depolarda otomatik pull baştan etkin olsun."
                checked={settings.defaultAutoPull.enabled}
                onCheckedChange={(enabled) =>
                  saveApp.mutate({ defaultAutoPull: { ...settings.defaultAutoPull, enabled } })
                }
              />
              <Row
                label="Sadece çalışma dizini temizken"
                hint="Kaydedilmemiş değişiklik varken otomatik pull denenmesin."
                checked={settings.defaultAutoPull.onlyWhenClean}
                onCheckedChange={(onlyWhenClean) =>
                  saveApp.mutate({ defaultAutoPull: { ...settings.defaultAutoPull, onlyWhenClean } })
                }
              />
              <Row
                label="Sadece fast-forward"
                hint="Arka planda merge commit'i üretilmesin."
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
