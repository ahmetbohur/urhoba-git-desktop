import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GitBranch, Tag } from 'lucide-react';
import { cn } from '../lib/cn';
import { absoluteTime, directoryName, fileName, formatCount, relativeTime } from '../lib/format';
import { useCommitDetail, useCommitFileDiff, useLog, useSettings } from '../lib/queries';
import { useUi } from '../stores/ui';
import { Badge, EmptyState, SectionLabel, Spinner } from './primitives';
import { DiffView } from './DiffView';
import type { Commit, CommitRef, FileChangeKind } from '@shared/types';

const KIND_MARKS: Record<FileChangeKind, { mark: string; className: string }> = {
  added: { mark: 'A', className: 'text-ok' },
  modified: { mark: 'M', className: 'text-warn' },
  deleted: { mark: 'D', className: 'text-crit' },
  renamed: { mark: 'R', className: 'text-accent-ink' },
  copied: { mark: 'C', className: 'text-accent-ink' },
  untracked: { mark: '?', className: 'text-ink-3' },
  conflicted: { mark: '!', className: 'text-crit' },
  typechange: { mark: 'T', className: 'text-warn' },
};

const COMMIT_ROW_HEIGHT = 58;

function RefBadge({ commitRef }: { commitRef: CommitRef }) {
  if (commitRef.kind === 'head') return null;
  return (
    <Badge tone={commitRef.kind === 'tag' ? 'warn' : 'accent'}>
      {commitRef.kind === 'tag' ? <Tag className="size-2.5" /> : <GitBranch className="size-2.5" />}
      {commitRef.name}
    </Badge>
  );
}

function CommitRow({
  commit,
  selected,
  onSelect,
}: {
  commit: Commit;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex h-full w-full flex-col justify-center gap-0.5 border-b border-line-soft px-3 text-left',
        selected ? 'bg-accent-tint' : 'hover:bg-surface-2',
      )}
    >
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[13px]',
            selected ? 'font-medium text-accent-ink' : 'text-ink',
          )}
        >
          {commit.subject}
        </span>
        {/* Merge commit'leri geçmişte hızlıca ayırt edilebilsin. */}
        {commit.parents.length > 1 && <Badge tone="neutral">merge</Badge>}
      </span>
      <span className="flex items-center gap-1.5 overflow-hidden">
        <span className="shrink-0 font-mono text-[11px] text-ink-3">{commit.shortSha}</span>
        <span className="truncate text-[11px] text-ink-2">{commit.authorName}</span>
        <span className="shrink-0 text-[11px] text-ink-3">{relativeTime(commit.authoredAt)}</span>
        {commit.refs.slice(0, 2).map((commitRef) => (
          <RefBadge key={`${commitRef.kind}-${commitRef.name}`} commitRef={commitRef} />
        ))}
      </span>
    </button>
  );
}

export function HistoryView({ repoId }: { repoId: string }) {
  const { data: commits, isLoading } = useLog(repoId);
  const { data: settings } = useSettings();
  const selection = useUi((s) => s.selection);
  const select = useUi((s) => s.select);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedSha = selection.kind === 'commit' ? selection.sha : null;
  const selectedPath = selection.kind === 'commit' ? selection.path : null;

  const { data: detail, isLoading: detailLoading } = useCommitDetail(repoId, selectedSha);
  const { data: diff, isLoading: diffLoading } = useCommitFileDiff(repoId, selectedSha, selectedPath);

  const virtualizer = useVirtualizer({
    count: commits?.length ?? 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => COMMIT_ROW_HEIGHT,
    overscan: 10,
  });

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!commits || commits.length === 0) {
    return (
      <EmptyState
        title="Geçmiş boş"
        description="Bu depoda henüz commit yok. İlk commit’ini oluşturduğunda burada görünecek."
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div ref={scrollRef} className="w-80 shrink-0 overflow-y-auto border-r border-line bg-surface">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((item) => {
            const commit = commits[item.index];
            return (
              <div
                key={commit.sha}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: item.size,
                  transform: `translateY(${item.start}px)`,
                }}
              >
                <CommitRow
                  commit={commit}
                  selected={selectedSha === commit.sha}
                  onSelect={() => select({ kind: 'commit', sha: commit.sha, path: null })}
                />
              </div>
            );
          })}
        </div>
      </div>

      {selectedSha ? (
        <>
          <div className="flex w-72 shrink-0 flex-col border-r border-line bg-surface">
            {detailLoading || !detail ? (
              <div className="flex flex-1 items-center justify-center">
                <Spinner />
              </div>
            ) : (
              <>
                <div className="border-b border-line-soft p-3">
                  <p className="selectable text-[13px] font-semibold text-ink">{detail.subject}</p>
                  {detail.body && (
                    <p className="selectable mt-1 text-[12px] whitespace-pre-wrap text-ink-2">
                      {detail.body}
                    </p>
                  )}
                  <p className="mt-2 text-[11px] text-ink-2">
                    {detail.authorName} · {absoluteTime(detail.authoredAt)}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <span className="selectable font-mono text-[11px] text-ink-3">
                      {detail.shortSha}
                    </span>
                    {detail.additions > 0 && <Badge tone="ok">+{formatCount(detail.additions)}</Badge>}
                    {detail.deletions > 0 && (
                      <Badge tone="crit">−{formatCount(detail.deletions)}</Badge>
                    )}
                  </div>
                </div>

                <div className="px-3 py-2">
                  <SectionLabel>{detail.files.length} dosya</SectionLabel>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto pb-2">
                  {detail.files.map((file) => {
                    const mark = KIND_MARKS[file.kind];
                    const directory = directoryName(file.path);
                    return (
                      <button
                        key={file.path}
                        type="button"
                        onClick={() =>
                          select({ kind: 'commit', sha: detail.sha, path: file.path })
                        }
                        className={cn(
                          'flex h-8 w-full items-center gap-2 px-3 text-left',
                          selectedPath === file.path ? 'bg-accent-tint' : 'hover:bg-surface-2',
                        )}
                      >
                        <span
                          className={cn('shrink-0 font-mono text-[11px] font-semibold', mark.className)}
                        >
                          {mark.mark}
                        </span>
                        <span className="flex min-w-0 flex-1 items-baseline gap-1">
                          {directory && (
                            <span className="shrink-0 truncate text-[12px] text-ink-3">
                              {directory}/
                            </span>
                          )}
                          <span className="truncate text-[12px] text-ink">
                            {fileName(file.path)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <DiffView
              key={`${selectedSha}|${selectedPath ?? ''}`}
              diff={selectedPath ? diff : undefined}
              isLoading={!!selectedPath && diffLoading}
              title={selectedPath ?? ''}
              subtitle={selectedPath ? `${detail?.shortSha ?? ''} içindeki hâli` : undefined}
              // Geçmişteki bir commit üzerinde satır hazırlamak anlamsız;
              // seçim bilerek kapalı.
              sideBySide={settings?.sideBySideDiff ?? false}
            />
          </div>
        </>
      ) : (
        <div className="min-w-0 flex-1">
          <EmptyState
            title="Commit seç"
            description="Soldaki listeden bir commit’e tıklayarak içindeki değişiklikleri gör."
          />
        </div>
      )}
    </div>
  );
}
