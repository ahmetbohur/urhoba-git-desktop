import { useState } from 'react';
import { Popover } from 'radix-ui';
import { Filter, X } from 'lucide-react';
import { useT } from '../i18n';
import { cn } from '../lib/cn';
import { Badge, Button, SectionLabel } from './primitives';
import type { LogFilter } from '@shared/types';

/**
 * Geçmiş filtresi.
 *
 * Filtre yalnızca "Uygula" ile gönderiliyor: her tuşta yeniden `git log`
 * çalıştırmak büyük depolarda arayüzü kilitler. Etkin filtreler çubukta rozet
 * olarak duruyor, böylece kullanıcı listenin neden kısa olduğunu görüyor.
 */

const FIELDS: Array<{ key: keyof LogFilter; label: string; placeholder: string; type?: string }> = [
  { key: 'message', label: 'Mesaj', placeholder: 'Commit mesajında ara' },
  { key: 'author', label: 'Yazar', placeholder: 'Ad veya e-posta' },
  { key: 'path', label: 'Dosya yolu', placeholder: 'src/app.ts' },
  { key: 'since', label: 'Başlangıç', placeholder: '', type: 'date' },
  { key: 'until', label: 'Bitiş', placeholder: '', type: 'date' },
];

const LABELS: Record<keyof LogFilter, string> = {
  message: 'mesaj',
  author: 'yazar',
  path: 'yol',
  since: 'başlangıç',
  until: 'bitiş',
};

export function HistoryFilterBar({
  filter,
  onChange,
  resultCount,
}: {
  filter: LogFilter;
  onChange: (filter: LogFilter) => void;
  resultCount: number;
}) {
  const t = useT();
  const [draft, setDraft] = useState<LogFilter>(filter);
  const [open, setOpen] = useState(false);

  const activeEntries = (Object.entries(filter) as Array<[keyof LogFilter, string | undefined]>)
    .filter(([, value]) => value && value.trim().length > 0);

  const apply = () => {
    // Boş alanları hiç göndermiyoruz: git'e boş `--author=` vermek her şeyi eler.
    const cleaned: LogFilter = {};
    for (const [key, value] of Object.entries(draft) as Array<[keyof LogFilter, string]>) {
      if (value && value.trim().length > 0) cleaned[key] = value.trim();
    }
    onChange(cleaned);
    setOpen(false);
  };

  const clearAll = () => {
    setDraft({});
    onChange({});
    setOpen(false);
  };

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-1.5">
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setDraft(filter);
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium',
              activeEntries.length > 0
                ? 'bg-accent-tint text-accent-ink'
                : 'border border-line bg-surface text-ink-2 hover:bg-surface-2',
            )}
          >
            <Filter className="size-3.5" />
            {t('Filtre')}
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            className="z-50 flex w-80 flex-col gap-3 rounded-lg border border-line bg-surface p-3 shadow-xl"
          >
            <SectionLabel>{t('Geçmişi süz')}</SectionLabel>
            {FIELDS.map((field) => (
              <label key={field.key} className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-ink">{t(field.label)}</span>
                <input
                  type={field.type ?? 'text'}
                  value={draft[field.key] ?? ''}
                  placeholder={t(field.placeholder)}
                  onChange={(event) =>
                    setDraft((previous) => ({ ...previous, [field.key]: event.target.value }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') apply();
                  }}
                  className="selectable h-8 w-full rounded-md border border-line bg-ground px-2 text-[12px] text-ink placeholder:text-ink-3 focus-visible:border-accent"
                />
              </label>
            ))}
            <div className="flex justify-end gap-2 border-t border-line-soft pt-2">
              <Button size="sm" variant="ghost" onClick={clearAll}>
                {t('Temizle')}
              </Button>
              <Button size="sm" variant="primary" onClick={apply}>
                {t('Uygula')}
              </Button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {activeEntries.map(([key, value]) => (
        <Badge key={key} tone="accent">
          {t(LABELS[key])}: {value}
          <button
            type="button"
            aria-label={t('{label} filtresini kaldır', { label: t(LABELS[key]) })}
            onClick={() => {
              const next = { ...filter };
              delete next[key];
              onChange(next);
            }}
            className="ml-0.5 rounded hover:bg-accent/20"
          >
            <X className="size-2.5" />
          </button>
        </Badge>
      ))}

      <div className="flex-1" />
      <span className="text-[11px] tabular-nums text-ink-3">
        {resultCount > 0 ? t('{count} commit yüklendi', { count: resultCount }) : t('Sonuç yok')}
      </span>
    </div>
  );
}
