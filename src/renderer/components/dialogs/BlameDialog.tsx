import { useMemo } from 'react';
import { FileWarning } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useT } from '../../i18n';
import { invoke } from '../../lib/ipc';
import { useQuery } from '../../lib/queries';
import { absoluteTime } from '../../lib/format';
import { useUi } from '../../stores/ui';
import { EmptyState, Spinner } from '../primitives';
import { DialogShell } from './DialogShell';
import type { BlameLine, BlameResult } from '@shared/types';

/**
 * Satır geçmişi.
 *
 * Aynı commit'ten gelen ardışık satırlarda yazar ve tarih tekrarlanmıyor:
 * blame çıktısının çoğu satırı bir öncekiyle aynı commit'e ait ve her satırda
 * aynı bilgiyi yazmak asıl aranan şeyi — nerede değiştiğini — gözden kaçırıyor.
 * Blok başlangıçları ayrıca ince bir çizgiyle ayrılıyor.
 */

interface BlameRow {
  line: BlameLine;
  /** Bir önceki satır farklı bir commit'ten geliyorsa blok başlangıcı. */
  startsBlock: boolean;
}

function toRows(lines: BlameLine[]): BlameRow[] {
  return lines.map((line, index) => ({
    line,
    startsBlock: index === 0 || lines[index - 1].sha !== line.sha,
  }));
}

export function BlameDialog({
  repoId,
  path,
  open,
  onOpenChange,
}: {
  repoId: string;
  path: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const select = useUi((s) => s.select);
  const setTab = useUi((s) => s.setTab);

  const { data, isLoading } = useQuery<BlameResult>({
    queryKey: ['blame', repoId, path],
    queryFn: () => invoke('git:blame', { repoId, path: path as string }),
    enabled: open && !!path,
  });

  const rows = useMemo(() => toRows(data?.lines ?? []), [data]);

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t('Satır geçmişi')}
      description={path ?? undefined}
      width="lg"
      fill
    >
      {isLoading || !data ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      ) : data.lines.length === 0 ? (
        <EmptyState
          icon={<FileWarning className="size-5" />}
          title={t('Satır geçmişi yok')}
          description={data.unavailableReason ?? undefined}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {data.unavailableReason && (
            <p className="shrink-0 rounded-md bg-warn-tint px-2.5 py-1.5 text-[11px] text-ink">
              {data.unavailableReason}
            </p>
          )}
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-line">
            {rows.map(({ line, startsBlock }) => (
              <div
                key={`${line.lineNumber}-${line.sha}`}
                className={cn(
                  'flex font-mono text-[12px] leading-[1.55]',
                  startsBlock && 'border-t border-line-soft first:border-t-0',
                )}
              >
                <button
                  type="button"
                  title={`${line.summary} — ${line.authorName}, ${absoluteTime(line.authoredAt)}`}
                  onClick={() => {
                    // Satırın geldiği commit'i geçmişte açmak, "bu neden böyle"
                    // sorusunun bir sonraki adımı.
                    setTab('history');
                    select({ kind: 'commit', sha: line.sha, path: null });
                    onOpenChange(false);
                  }}
                  className={cn(
                    'w-52 shrink-0 border-r border-line-soft px-2 text-left',
                    startsBlock ? 'text-ink-2 hover:bg-surface-2' : 'text-transparent',
                  )}
                >
                  {startsBlock && (
                    <span className="flex items-baseline gap-1.5">
                      <span className="shrink-0 text-[11px] text-accent-ink">{line.shortSha}</span>
                      <span className="min-w-0 flex-1 truncate text-[11px]">
                        {line.authorName}
                      </span>
                    </span>
                  )}
                </button>
                <span className="w-12 shrink-0 border-r border-line-soft px-2 text-right tabular-nums text-ink-3 select-none">
                  {line.lineNumber}
                </span>
                <span className="selectable min-w-0 flex-1 px-2 whitespace-pre-wrap text-ink">
                  {line.content || ' '}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </DialogShell>
  );
}
