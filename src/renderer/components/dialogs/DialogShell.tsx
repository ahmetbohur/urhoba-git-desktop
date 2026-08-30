import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useT } from '../../i18n';
import { cn } from '../../lib/cn';

/**
 * Uygulamadaki bütün diyalogların ortak kabuğu: aynı yerleşim, aynı kapatma
 * davranışı, aynı odak yönetimi. Radix odak tuzağını ve Esc ile kapanmayı
 * kendisi hallediyor.
 */
export function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 'md',
  fill = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'md' | 'lg';
  /**
   * İçerik kendi kaydırmasını yönetiyorsa true. Kabuk o zaman kaydırmayı
   * kapatıp yüksekliği içeriğe bırakıyor: iç içe iki kaydırma alanı hem farenin
   * hangisini kaydıracağını belirsizleştiriyor hem de alttaki satırı kesiyor.
   */
  fill?: boolean;
}) {
  const t = useT();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          /*
           * Varsayılanda odak DOM'daki ilk öğeye, yani kapatma düğmesine
           * gidiyor. `data-autofocus` taşıyan bir öğe varsa onu tercih ediyoruz:
           * klavyeyle gelen kullanıcı doğrudan birincil eylemde başlıyor.
           *
           * React'in `autoFocus` özelliği burada işe yaramıyor; onu DOM
           * özniteliği olarak yazmayıp odağı kendisi veriyor, dolayısıyla
           * seçiciyle bulunamıyor.
           */
          onOpenAutoFocus={(event) => {
            const content = event.currentTarget as HTMLElement | null;
            const preferred = content?.querySelector<HTMLElement>('[data-autofocus]');
            if (!preferred) return;
            event.preventDefault();
            preferred.focus();
          }}
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-line bg-surface shadow-2xl',
            width === 'lg' ? 'max-w-2xl' : 'max-w-md',
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line-soft px-4 py-3">
            <div>
              <Dialog.Title className="text-[14px] font-semibold text-ink">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-0.5 text-[12px] text-ink-2">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label={t('Kapat')}
              className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <div
            className={cn(
              'flex min-h-0 flex-1 flex-col px-4 py-4',
              fill ? 'overflow-hidden' : 'overflow-y-auto',
            )}
          >
            {children}
          </div>

          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-line-soft px-4 py-3">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-ink-3">{hint}</span>}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  mono,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  mono?: boolean;
  disabled?: boolean;
}) {
  return (
    <input
      value={value}
      disabled={disabled}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        'selectable h-8 w-full rounded-md border border-line bg-ground px-2 text-[13px] text-ink placeholder:text-ink-3 focus-visible:border-accent disabled:text-ink-3',
        mono && 'font-mono text-[12px]',
      )}
    />
  );
}
