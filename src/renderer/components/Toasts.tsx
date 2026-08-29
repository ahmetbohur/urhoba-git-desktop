import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '../lib/cn';
import { useUi, type Toast } from '../stores/ui';

const TONES = {
  info: { icon: Info, className: 'border-line bg-surface text-ink' },
  success: { icon: CheckCircle2, className: 'border-transparent bg-ok-tint text-ink' },
  warning: { icon: AlertTriangle, className: 'border-transparent bg-warn-tint text-ink' },
  error: { icon: XCircle, className: 'border-transparent bg-crit-tint text-ink' },
} as const;

const ICON_COLORS = {
  info: 'text-ink-3',
  success: 'text-ok',
  warning: 'text-warn',
  error: 'text-crit',
} as const;

/** Hata bildirimleri elle kapatılana kadar durur; diğerleri kendiliğinden kaybolur. */
function ToastCard({ toast }: { toast: Toast }) {
  const dismiss = useUi((s) => s.dismissToast);
  const { icon: Icon, className } = TONES[toast.kind];

  useEffect(() => {
    if (toast.kind === 'error') return;
    const timer = setTimeout(() => dismiss(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [toast.id, toast.kind, dismiss]);

  return (
    <div
      className={cn(
        'pointer-events-auto flex w-80 items-start gap-2.5 rounded-lg border p-3 shadow-lg',
        className,
      )}
      role="status"
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', ICON_COLORS[toast.kind])} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">{toast.title}</p>
        {toast.description && (
          <p className="selectable mt-0.5 text-[12px] break-words text-ink-2">
            {toast.description}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        aria-label="Bildirimi kapat"
        className="rounded p-0.5 text-ink-3 hover:bg-surface-2 hover:text-ink"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
