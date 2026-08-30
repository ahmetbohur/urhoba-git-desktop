import { useT } from '../i18n';
import { cn } from '../lib/cn';
import { relativeTime } from '../lib/format';
import { useUi } from '../stores/ui';
import { SectionLabel } from './primitives';

/**
 * Git komut günlüğü.
 *
 * Bir masaüstü git istemcisinin en sinir bozucu tarafı ne yaptığını gizlemesi:
 * bir düğmeye basıyorsun, bir şey oluyor, hangi komutun çalıştığını bilmiyorsun.
 * Bu panel her komutu, süresini ve hatasını olduğu gibi gösteriyor.
 */
export function CommandLogPanel() {
  const t = useT();
  const open = useUi((s) => s.commandLogOpen);
  const entries = useUi((s) => s.commandLog);
  if (!open) return null;

  return (
    <div className="flex h-56 shrink-0 flex-col border-t border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line-soft px-3 py-1.5">
        <SectionLabel>{t('Git komutları')}</SectionLabel>
        <span className="text-[11px] text-ink-3">{t('{count} kayıt', { count: entries.length })}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {entries.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-ink-3">
            {t('Henüz komut çalışmadı. Bir işlem yaptığında burada belirir.')}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-baseline gap-2 font-mono text-[11px]">
                <span
                  className={cn('shrink-0', entry.ok ? 'text-ok' : 'text-crit')}
                  aria-hidden="true"
                >
                  {entry.ok ? '✓' : '✕'}
                </span>
                <span className="selectable min-w-0 flex-1 break-all text-ink">
                  {entry.command}
                  {entry.error && (
                    <span className="ml-2 text-crit">
                      {entry.error.split('\n')[0]}
                    </span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums text-ink-3">{entry.durationMs} ms</span>
                <span className="shrink-0 text-ink-3">{relativeTime(entry.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
