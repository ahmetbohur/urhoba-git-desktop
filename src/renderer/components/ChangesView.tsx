import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ContextMenu } from 'radix-ui';
import { EyeOff, ExternalLink, GitCommitHorizontal, History, Sparkles, TriangleAlert } from 'lucide-react';
import { useT } from '../i18n';
import { cn } from '../lib/cn';
import { directoryName, fileName, formatCount } from '../lib/format';
import { errorMessage, invoke } from '../lib/ipc';
import {
  keys,
  useAiStatus,
  useInvalidateRepo,
  useMutation,
  useQueryClient,
  useSettings,
  useStatus,
  useWorkingDiff,
} from '../lib/queries';
import { useUi } from '../stores/ui';
import { Badge, Button, EmptyState, SectionLabel } from './primitives';
import { ConflictView } from './ConflictView';
import { DiffView } from './DiffView';
import { BlameDialog } from './dialogs/BlameDialog';
import { ConfirmDialog } from './dialogs/ConfirmDialog';
import type { FileChange, FileChangeKind, HunkSelection, LineStageMode } from '@shared/types';

/** Durum harfi ve rengi — GitHub Desktop'takiyle aynı kısaltmalar. */
const KIND_MARKS: Record<FileChangeKind, { mark: string; className: string; label: string }> = {
  added: { mark: 'A', className: 'text-ok', label: 'eklendi' },
  modified: { mark: 'M', className: 'text-warn', label: 'değişti' },
  deleted: { mark: 'D', className: 'text-crit', label: 'silindi' },
  renamed: { mark: 'R', className: 'text-accent-ink', label: 'yeniden adlandırıldı' },
  copied: { mark: 'C', className: 'text-accent-ink', label: 'kopyalandı' },
  untracked: { mark: '?', className: 'text-ink-3', label: 'takip edilmiyor' },
  conflicted: { mark: '!', className: 'text-crit', label: 'çakışma' },
  typechange: { mark: 'T', className: 'text-warn', label: 'tür değişti' },
};

type Row =
  | { type: 'header'; id: string; label: string; count: number }
  | { type: 'file'; id: string; file: FileChange; staged: boolean; conflicted: boolean };

const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 28;

function FileRow({
  row,
  selected,
  onSelect,
  onToggle,
  onDiscard,
  onIgnore,
  onOpenExternal,
  onBlame,
}: {
  row: Extract<Row, { type: 'file' }>;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDiscard: () => void;
  onIgnore: () => void;
  onOpenExternal: () => void;
  onBlame: () => void;
}) {
  const t = useT();
  const { file, staged, conflicted } = row;
  const mark = KIND_MARKS[file.kind];
  const directory = directoryName(file.path);

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          className={cn(
            'flex h-8 items-center gap-2 px-2',
            selected ? 'bg-accent-tint' : 'hover:bg-surface-2',
          )}
        >
          <input
            type="checkbox"
            checked={staged}
            disabled={conflicted}
            onChange={onToggle}
            aria-label={
              staged
                ? t('{path} dosyasını hazırlıktan çıkar', { path: file.path })
                : t('{path} dosyasını hazırla', { path: file.path })
            }
            className="size-3.5 shrink-0 accent-[var(--accent)]"
          />
          <button
            type="button"
            onClick={onSelect}
            className="flex min-w-0 flex-1 items-baseline gap-1 text-left"
          >
            {directory && (
              <span className="shrink-0 truncate text-[12px] text-ink-3">{directory}/</span>
            )}
            <span className="truncate text-[12px] text-ink">{fileName(file.path)}</span>
          </button>
          <span
            title={t(mark.label)}
            className={cn('shrink-0 font-mono text-[11px] font-semibold', mark.className)}
          >
            {mark.mark}
          </span>
        </div>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 min-w-52 rounded-md border border-line bg-surface p-1 shadow-lg">
          <ContextMenu.Item
            onSelect={onToggle}
            className="cursor-pointer rounded px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-surface-2"
          >
            {staged ? t('Hazırlıktan çıkar') : t('Commit için hazırla')}
          </ContextMenu.Item>
          <ContextMenu.Item
            onSelect={onBlame}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-surface-2"
          >
            <History className="size-3.5" />
            {t('Satır geçmişi (blame)')}
          </ContextMenu.Item>
          <ContextMenu.Item
            onSelect={onOpenExternal}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-surface-2"
          >
            <ExternalLink className="size-3.5" />
            {t('Sistemde aç')}
          </ContextMenu.Item>
          {file.kind === 'untracked' && (
            <ContextMenu.Item
              onSelect={onIgnore}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-surface-2"
            >
              <EyeOff className="size-3.5" />
              {t('.gitignore’a ekle')}
            </ContextMenu.Item>
          )}
          <ContextMenu.Separator className="my-1 h-px bg-line-soft" />
          <ContextMenu.Item
            onSelect={onDiscard}
            className="cursor-pointer rounded px-2 py-1.5 text-[13px] text-crit outline-none data-[highlighted]:bg-crit-tint"
          >
            {t('Değişiklikleri geri al')}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function CommitBox({ repoId, stagedCount }: { repoId: string; stagedCount: number }) {
  const t = useT();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [amend, setAmend] = useState(false);
  const invalidate = useInvalidateRepo();
  const toast = useUi((s) => s.toast);
  const { data: aiStatus } = useAiStatus(repoId);

  /*
   * Öneri doğrudan alanlara yazılıyor, commit'e dönüşmüyor: kullanıcı okuyup
   * düzeltmeden hiçbir şey kaydedilmiyor. Model ne gönderildiğini de bildiriyor
   * ve bunu bildirimde gösteriyoruz.
   */
  const suggest = useMutation({
    mutationFn: () => invoke('ai:suggest-commit', { repoId }),
    onSuccess: (suggestion) => {
      setSubject(suggestion.subject);
      setBody(suggestion.body);
      toast({
        kind: 'success',
        title: t('Öneri hazır'),
        description:
          suggestion.note ??
          t('{count} karakterlik diff gönderildi.', { count: suggestion.charactersSent }),
      });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Öneri alınamadı'), description: errorMessage(error) }),
  });

  const commit = useMutation({
    mutationFn: () => invoke('git:commit', { repoId, subject: subject.trim(), body, amend }),
    onSuccess: (result) => {
      invalidate(repoId);
      setSubject('');
      setBody('');
      setAmend(false);
      toast({ kind: 'success', title: t('Commit oluşturuldu'), description: result.sha.slice(0, 8) });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Commit başarısız'), description: errorMessage(error) }),
  });

  const loadLastMessage = useMutation({
    mutationFn: () => invoke('git:last-commit-message', { repoId }),
    onSuccess: (message) => {
      setSubject(message.subject);
      setBody(message.body);
    },
  });

  const canCommit = subject.trim().length > 0 && (stagedCount > 0 || amend) && !commit.isPending;

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-line bg-surface p-3">
      <input
        value={subject}
        onChange={(event) => setSubject(event.target.value)}
        onKeyDown={(event) => {
          // Ctrl/Cmd+Enter ile commit — elleri klavyeden kaldırmadan.
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && canCommit) {
            commit.mutate();
          }
        }}
        placeholder={amend ? t('Son commit mesajını düzenle') : t('Özet (zorunlu)')}
        aria-label={t('Commit özeti')}
        className="selectable h-8 w-full rounded-md border border-line bg-ground px-2 text-[13px] text-ink placeholder:text-ink-3 focus-visible:border-accent"
      />
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={t('Açıklama (isteğe bağlı)')}
        aria-label={t('Commit açıklaması')}
        rows={3}
        className="selectable w-full resize-none rounded-md border border-line bg-ground px-2 py-1.5 text-[12px] text-ink placeholder:text-ink-3 focus-visible:border-accent"
      />
      {/*
        Üç öğe tek satıra sığmıyordu ve etiketler kırılıyordu. Yardımcı eylemler
        üstte, asıl eylem altta tam genişlikte: commit düğmesi hem daha belirgin
        hem dar panelde güvenli.
      */}
      <div className="flex items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-1.5 text-[12px] whitespace-nowrap text-ink-2">
          <input
            type="checkbox"
            checked={amend}
            onChange={(event) => {
              setAmend(event.target.checked);
              if (event.target.checked && subject.length === 0) loadLastMessage.mutate();
            }}
            className="size-3.5 accent-[var(--accent)]"
          />
          {t('Son commit’i düzelt')}
        </label>
        {aiStatus?.enabled && (
          <Button
            size="sm"
            variant="ghost"
            title={t('AI ile commit mesajı öner')}
            loading={suggest.isPending}
            disabled={stagedCount === 0}
            onClick={() => suggest.mutate()}
          >
            <Sparkles className="size-3.5" />
            {t('Öner')}
          </Button>
        )}
      </div>

      <Button
        variant="primary"
        loading={commit.isPending}
        disabled={!canCommit}
        onClick={() => commit.mutate()}
      >
        <GitCommitHorizontal className="size-3.5" />
        {amend
          ? t('Commit’i düzelt')
          : stagedCount > 0
            ? t('{count} dosyayı commit’le', { count: formatCount(stagedCount) })
            : t('Commit’le')}
      </Button>
    </div>
  );
}

export function ChangesView({ repoId }: { repoId: string }) {
  const t = useT();
  const { data: status } = useStatus(repoId);
  const { data: settings } = useSettings();
  const selection = useUi((s) => s.selection);
  const select = useUi((s) => s.select);
  const toast = useUi((s) => s.toast);
  const invalidate = useInvalidateRepo();
  const client = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [discardTarget, setDiscardTarget] = useState<string | null>(null);
  const [blameTarget, setBlameTarget] = useState<string | null>(null);

  const sideBySide = settings?.sideBySideDiff ?? false;
  const toggleSideBySide = useMutation({
    mutationFn: (next: boolean) => invoke('settings:set', { sideBySideDiff: next }),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.settings }),
  });

  const applyLines = useMutation({
    mutationFn: ({
      path,
      mode,
      selections,
    }: {
      path: string;
      mode: LineStageMode;
      selections: HunkSelection[];
    }) => invoke('git:stage-lines', { repoId, path, mode, selections }),
    onSuccess: (_result, variables) => {
      invalidate(repoId);
      const titles: Record<LineStageMode, string> = {
        stage: 'Seçili satırlar hazırlandı',
        unstage: 'Seçili satırlar hazırlıktan çıkarıldı',
        discard: 'Seçili satırlar geri alındı',
      };
      toast({ kind: 'success', title: t(titles[variables.mode]) });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Satırlar uygulanamadı'), description: errorMessage(error) }),
  });

  const ignorePath = useMutation({
    mutationFn: (path: string) => invoke('git:ignore-path', { repoId, path }),
    onSuccess: (_result, path) => {
      invalidate(repoId);
      toast({ kind: 'success', title: t('{path} .gitignore’a eklendi', { path }) });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Eklenemedi'), description: errorMessage(error) }),
  });

  const openExternal = useMutation({
    mutationFn: (path: string) => invoke('git:open-external', { repoId, path }),
    onError: (error) =>
      toast({ kind: 'error', title: t('Dosya açılamadı'), description: errorMessage(error) }),
  });

  const stageMutation = useMutation({
    mutationFn: (paths: string[]) => invoke('git:stage', { repoId, paths }),
    onSuccess: () => invalidate(repoId),
    onError: (error) =>
      toast({ kind: 'error', title: t('Hazırlanamadı'), description: errorMessage(error) }),
  });

  const unstageMutation = useMutation({
    mutationFn: (paths: string[]) => invoke('git:unstage', { repoId, paths }),
    onSuccess: () => invalidate(repoId),
    onError: (error) =>
      toast({ kind: 'error', title: t('Çıkarılamadı'), description: errorMessage(error) }),
  });

  const discardMutation = useMutation({
    mutationFn: (paths: string[]) => invoke('git:discard', { repoId, paths }),
    onSuccess: (_result, paths) => {
      invalidate(repoId);
      select({ kind: 'none' });
      toast({ kind: 'info', title: t('{count} dosyanın değişiklikleri geri alındı', { count: paths.length }) });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Geri alınamadı'), description: errorMessage(error) }),
  });

  // Bölüm başlıkları ve dosyalar tek düz listede: sanallaştırıcı tek bir
  // ölçüm fonksiyonuyla çalışsın diye.
  const rows = useMemo<Row[]>(() => {
    if (!status) return [];
    const result: Row[] = [];
    if (status.conflicted.length > 0) {
      result.push({
        type: 'header',
        id: 'h-conflict',
        label: 'Çakışan dosyalar',
        count: status.conflicted.length,
      });
      for (const file of status.conflicted) {
        result.push({ type: 'file', id: `c-${file.path}`, file, staged: false, conflicted: true });
      }
    }
    if (status.staged.length > 0) {
      result.push({
        type: 'header',
        id: 'h-staged',
        label: 'Commit için hazır',
        count: status.staged.length,
      });
      for (const file of status.staged) {
        result.push({ type: 'file', id: `s-${file.path}`, file, staged: true, conflicted: false });
      }
    }
    if (status.unstaged.length > 0) {
      result.push({
        type: 'header',
        id: 'h-unstaged',
        label: 'Hazırlanmamış değişiklikler',
        count: status.unstaged.length,
      });
      for (const file of status.unstaged) {
        result.push({ type: 'file', id: `u-${file.path}`, file, staged: false, conflicted: false });
      }
    }
    return result;
  }, [status]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (rows[index].type === 'header' ? HEADER_HEIGHT : ROW_HEIGHT),
    overscan: 12,
  });

  const selectedPath = selection.kind === 'working' ? selection.path : null;
  const selectedStaged = selection.kind === 'working' ? selection.staged : false;
  const { data: diff, isLoading: diffLoading } = useWorkingDiff(repoId, selectedPath, selectedStaged);

  const totalChanges =
    (status?.staged.length ?? 0) + (status?.unstaged.length ?? 0) + (status?.conflicted.length ?? 0);

  const stagedPaths = status?.staged.map((file) => file.path) ?? [];
  const unstagedPaths = status?.unstaged.map((file) => file.path) ?? [];

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-80 shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex items-center justify-between gap-2 border-b border-line-soft px-3 py-2">
          <SectionLabel>
            {totalChanges > 0
              ? t('{count} değişiklik', { count: formatCount(totalChanges) })
              : t('Değişiklik yok')}
          </SectionLabel>
          {totalChanges > 0 && (
            <div className="flex gap-1">
              {unstagedPaths.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => stageMutation.mutate(unstagedPaths)}>
                  {t('Tümünü hazırla')}
                </Button>
              )}
              {stagedPaths.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => unstageMutation.mutate(stagedPaths)}
                >
                  {t('Tümünü çıkar')}
                </Button>
              )}
            </div>
          )}
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <EmptyState
              title={t('Çalışma dizini temiz')}
              description={t('Dosyaları düzenlediğinde değişiklikler burada belirir.')}
            />
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map((item) => {
                const row = rows[item.index];
                return (
                  <div
                    key={row.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: item.size,
                      transform: `translateY(${item.start}px)`,
                    }}
                  >
                    {row.type === 'header' ? (
                      <div className="flex h-7 items-center gap-1.5 bg-ground px-3">
                        <SectionLabel>{t(row.label)}</SectionLabel>
                        <Badge tone={row.id === 'h-conflict' ? 'crit' : 'neutral'}>
                          {row.id === 'h-conflict' && <TriangleAlert className="size-3" />}
                          {row.count}
                        </Badge>
                      </div>
                    ) : (
                      <FileRow
                        row={row}
                        selected={
                          row.conflicted
                            ? selection.kind === 'conflict' && selection.path === row.file.path
                            : selectedPath === row.file.path && selectedStaged === row.staged
                        }
                        onSelect={() =>
                          select(
                            row.conflicted
                              ? { kind: 'conflict', path: row.file.path }
                              : { kind: 'working', path: row.file.path, staged: row.staged },
                          )
                        }
                        onToggle={() =>
                          row.staged
                            ? unstageMutation.mutate([row.file.path])
                            : stageMutation.mutate([row.file.path])
                        }
                        onDiscard={() => setDiscardTarget(row.file.path)}
                        onIgnore={() => ignorePath.mutate(row.file.path)}
                        onOpenExternal={() => openExternal.mutate(row.file.path)}
                        onBlame={() => setBlameTarget(row.file.path)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <CommitBox repoId={repoId} stagedCount={status?.staged.length ?? 0} />
      </div>

      <div className="min-w-0 flex-1">
        {selection.kind === 'conflict' ? (
          <ConflictView key={selection.path} repoId={repoId} path={selection.path} />
        ) : (
          <DiffView
            key={`${selectedPath ?? ''}|${selectedStaged}`}
            diff={selectedPath ? diff : undefined}
            isLoading={!!selectedPath && diffLoading}
            title={selectedPath ?? ''}
            subtitle={
              selectedPath
                ? selectedStaged
                  ? t('Hazırlanmış hâli')
                  : t('Çalışma dizini')
                : undefined
            }
            sideBySide={sideBySide}
            onToggleSideBySide={() => toggleSideBySide.mutate(!sideBySide)}
            staged={selectedStaged}
            /*
             * Hazırlanmış diff HEAD ile hazırlık alanını karşılaştırıyor,
             * hazırlanmamış olan ise hazırlık alanı ile diski. Önizleme de aynı
             * iki sürümü göstermeli, yoksa ekranda diff'in anlattığından başka
             * bir değişiklik görünür.
             */
            preview={{
              repoId,
              beforeRef: selectedStaged ? 'HEAD' : ':0',
              afterRef: selectedStaged ? ':0' : null,
            }}
            onApplyLines={
              selectedPath
                ? (mode, selections) =>
                    applyLines.mutate({ path: selectedPath, mode, selections })
                : undefined
            }
          />
        )}
      </div>

      <BlameDialog
        repoId={repoId}
        path={blameTarget}
        open={blameTarget !== null}
        onOpenChange={(next) => !next && setBlameTarget(null)}
      />

      <ConfirmDialog
        open={discardTarget !== null}
        onOpenChange={(open) => !open && setDiscardTarget(null)}
        title={t('Değişiklikleri geri al')}
        confirmLabel={t('Geri al')}
        destructive
        onConfirm={() => discardTarget && discardMutation.mutate([discardTarget])}
      >
        <p className="text-[13px] text-ink-2">
          <span className="font-mono text-ink">{discardTarget}</span>{' '}
          {t('dosyasındaki kaydedilmemiş değişiklikler kalıcı olarak silinecek. Bu işlem geri alınamaz.')}
        </p>
      </ConfirmDialog>
    </div>
  );
}
