import { Switch } from 'radix-ui';
import { cn } from '../../lib/cn';
import { useT } from '../../i18n';

/**
 * Genel ayarı izleyen ya da onu geçersiz kılan bir depo ayarı.
 *
 * Üç durum var ve üçü de görünür olmalı: "genel ayarı izle", "bu depoda açık",
 * "bu depoda kapalı". İki durumlu bir anahtarla bunu anlatmak mümkün değil —
 * kullanıcı anahtarın kapalı olmasının "genelden geldi" mi yoksa "bu depo için
 * kapatıldı" mı olduğunu ayırt edemez. Bu yüzden üç düğmeli bir seçim var ve
 * genel seçeneğin yanında genel ayarın o an ne olduğu yazıyor.
 */
export function ScopedToggle({
  label,
  hint,
  value,
  inheritedValue,
  isOverridden,
  onChange,
}: {
  label: string;
  hint: string;
  /** Geçerli (çözülmüş) değer. */
  value: boolean;
  /** Genel ayarın değeri — "genel" seçeneğinin altında gösteriliyor. */
  inheritedValue: boolean;
  isOverridden: boolean;
  /** `null` genel ayara dönmek demek. */
  onChange: (value: boolean | null) => void;
}) {
  const t = useT();

  const options: Array<{ key: 'inherit' | 'on' | 'off'; label: string; active: boolean }> = [
    {
      key: 'inherit',
      label: inheritedValue ? t('Genel (açık)') : t('Genel (kapalı)'),
      active: !isOverridden,
    },
    { key: 'on', label: t('Açık'), active: isOverridden && value },
    { key: 'off', label: t('Kapalı'), active: isOverridden && !value },
  ];

  return (
    <div className="flex flex-col gap-1.5 py-2">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink">{label}</p>
        <p className="text-[11px] text-ink-2">{hint}</p>
      </div>
      <div className="flex gap-1">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            /*
             * Etiketle birlikte okunuyor: üç düğmenin metni ("Açık", "Kapalı")
             * tek başına hangi ayara ait olduğunu söylemiyor, ekran okuyucu
             * kullanan biri bağlamı kaybediyordu.
             */
            aria-label={`${label}: ${option.label}`}
            onClick={() => onChange(option.key === 'inherit' ? null : option.key === 'on')}
            className={cn(
              'h-7 flex-1 rounded-md border px-2 text-[11px] font-medium',
              option.active
                ? 'border-accent bg-accent-tint text-accent-ink'
                : 'border-line bg-surface text-ink-2 hover:bg-surface-2',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Genel ayar bölümündeki sıradan iki durumlu anahtar. */
export function PlainToggle({
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
