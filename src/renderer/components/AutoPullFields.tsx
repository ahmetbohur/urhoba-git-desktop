import { Switch } from 'radix-ui';
import { useT } from '../i18n';
import { cn } from '../lib/cn';
import type { AutoPullSettings } from '@shared/types';

/**
 * Otomatik pull'un ayrıntı alanları: aralık ve iki koşul.
 *
 * Aynı alanlar hem üst çubuktaki açılır pencerede (o depo için) hem ayarlardaki
 * genel varsayılanlar bölümünde görünüyor. Tek yerde tanımlı olmaları şart:
 * iki kopya zamanla ayrışıyor ve aynı ayarın iki yerde farklı davrandığı bir
 * arayüz çıkıyor.
 */

const INTERVALS = [1, 5, 10, 15, 30, 60] as const;

export function ToggleRow({
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

export function AutoPullFields({
  value,
  onChange,
  /** Etiketler iki bağlamda farklı okunuyor; ayrım için önek veriliyor. */
  intervalLabel,
}: {
  value: AutoPullSettings;
  onChange: (patch: Partial<AutoPullSettings>) => void;
  intervalLabel: string;
}) {
  const t = useT();

  return (
    <>
      <div className={cn(!value.enabled && 'opacity-50')}>
        <p className="mb-1.5 text-[12px] font-medium text-ink">{intervalLabel}</p>
        <div className="flex flex-wrap gap-1">
          {INTERVALS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              disabled={!value.enabled}
              aria-label={`${intervalLabel}: ${minutes}`}
              onClick={() => onChange({ intervalMinutes: minutes })}
              className={cn(
                'h-7 min-w-12 rounded-md border px-2 text-[12px] tabular-nums',
                value.intervalMinutes === minutes
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
        checked={value.onlyWhenClean}
        disabled={!value.enabled}
        onCheckedChange={(onlyWhenClean) => onChange({ onlyWhenClean })}
      />

      <ToggleRow
        label={t('Sadece fast-forward')}
        hint={t('Geçmişler ayrıldıysa birleştirme yapma, kararı sana bırak.')}
        checked={value.fastForwardOnly}
        disabled={!value.enabled}
        onCheckedChange={(fastForwardOnly) => onChange({ fastForwardOnly })}
      />
    </>
  );
}
