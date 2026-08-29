import { Tooltip as RadixTooltip } from 'radix-ui';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white hover:brightness-110 active:brightness-95 disabled:bg-surface-3 disabled:text-ink-3',
  secondary:
    'bg-surface border border-line text-ink hover:bg-surface-2 disabled:text-ink-3 disabled:hover:bg-surface',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink disabled:text-ink-3 disabled:hover:bg-transparent',
  danger: 'bg-crit text-white hover:brightness-110 disabled:bg-surface-3 disabled:text-ink-3',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-[12px] gap-1.5 rounded-md',
  md: 'h-8 px-3 text-[13px] gap-2 rounded-md',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium whitespace-nowrap transition-[background-color,filter] disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-ink-3', className)} />;
}

export function Tooltip({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          sideOffset={6}
          className="z-50 max-w-72 rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink shadow-lg"
        >
          {label}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'crit';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-surface-2 text-ink-2 border-line-soft',
    accent: 'bg-accent-tint text-accent-ink border-transparent',
    ok: 'bg-ok-tint text-ok border-transparent',
    warn: 'bg-warn-tint text-warn border-transparent',
    crit: 'bg-crit-tint text-crit border-transparent',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
      {icon && <div className="mb-1 text-ink-3">{icon}</div>}
      <p className="text-[14px] font-semibold text-ink">{title}</p>
      {description && <p className="max-w-md text-[13px] text-ink-2">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'text-[10px] font-semibold tracking-[0.14em] text-ink-3 uppercase',
        className,
      )}
    >
      {children}
    </span>
  );
}
