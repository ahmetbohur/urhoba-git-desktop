import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ContextMenu } from 'radix-ui';
import {
  Cloud,
  Copy,
  GitBranch,
  GitGraph,
  History as HistoryIcon,
  ListOrdered,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Undo2,
} from 'lucide-react';
import { useT } from '../i18n';
import { cn } from '../lib/cn';
import { buildGraph } from '../lib/commit-graph';
import { absoluteTime, directoryName, fileName, formatCount, relativeTime } from '../lib/format';
import { errorMessage, invoke } from '../lib/ipc';
import {
  keys,
  useCommitDetail,
  useCommitFileDiff,
  useInvalidateRepo,
  useLog,
  useMutation,
  useQueryClient,
  useSettings,
} from '../lib/queries';
import { useUi } from '../stores/ui';
import { Badge, Button, EmptyState, SectionLabel, Spinner } from './primitives';
import { Splitter } from './Splitter';
import { usePane } from '../lib/use-pane';
import { CommitGraph } from './CommitGraph';
import { DiffView } from './DiffView';
import { HistoryFilterBar } from './HistoryFilterBar';
import { RebaseDialog } from './dialogs/RebaseDialog';
import { ReflogDialog } from './dialogs/ReflogDialog';
import { BlameDialog } from './dialogs/BlameDialog';
import { ConfirmDialog } from './dialogs/ConfirmDialog';
import { TagDialog } from './dialogs/TagDialog';
import type {
  Commit,
  CommitRef,
  FileChangeKind,
  LogFilter,
  ResetMode,
  SignatureStatus,
} from '@shared/types';

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

const RESET_MODES: Array<{ mode: ResetMode; label: string; description: string }> = [
  {
    mode: 'soft',
    label: 'Yumuşak',
    description: 'Commit’ler geri alınır, değişiklikler hazırlıkta kalır.',
  },
  {
    mode: 'mixed',
    label: 'Karışık',
    description: 'Commit’ler geri alınır, değişiklikler hazırlık dışında kalır.',
  },
  {
    mode: 'hard',
    label: 'Sert',
    description: 'Commit’ler ve çalışma dizinindeki değişiklikler silinir. Geri dönüşü yok.',
  },
];

/**
 * Bir commit'in üzerindeki süsleme.
 *
 * Uzak dallar ayrı bir tonda: yerel `main` ile `origin/main` aynı commit'te
 * durduğunda ikisi aynı görünseydi hangisinin nerede olduğu okunmazdı. Çıkışta
 * olan dal içi dolu bir nokta taşıyor.
 */
function RefBadge({ commitRef }: { commitRef: CommitRef }) {
  if (commitRef.kind === 'tag') {
    return (
      <Badge tone="warn">
        <Tag className="size-2.5" />
        {commitRef.name}
      </Badge>
    );
  }
  // Ayrık HEAD: hiçbir dala bağlı değil, ama nerede olduğu görünmeli.
  if (commitRef.kind === 'head') {
    return <Badge tone="crit">HEAD</Badge>;
  }
  return (
    <Badge tone={commitRef.kind === 'remote' ? 'neutral' : 'accent'}>
      {commitRef.kind === 'remote' ? (
        <Cloud className="size-2.5" />
      ) : (
        <GitBranch className="size-2.5" />
      )}
      {commitRef.name}
      {commitRef.isHead && <span className="text-[9px]">●</span>}
    </Badge>
  );
}

/**
 * Commit imzası.
 *
 * "İmzalı" tek bir evet/hayır değil: imza var ama anahtarına güvenilmiyor
 * olabilir, ya da doğrulama yapılandırması eksik olduğu için hiç
 * denenememiş olabilir. Hepsini yeşil bir rozete indirmek yanlış güven
 * veriyor, o yüzden durumların rengi ve metni ayrı.
 *
 * İmzasız commit'te hiçbir şey gösterilmiyor: imzasızlık çoğu depoda
 * olağan ve her satıra "imzasız" yazmak gürültüden başka bir şey değil.
 */
function SignatureBadge({ signature, signer }: { signature: SignatureStatus; signer: string }) {
  const t = useT();
  if (signature === 'none') return null;

  /*
   * Etiketler doğrudan `t()` ile yazılıyor, bir eşlemeden okunmuyor: çeviri
   * kapsamı testi yalnızca sabit metinli çağrıları tarayabiliyor ve değişkenle
   * çağrılan metinler İngilizce arayüzde sessizce Türkçe kalıyor.
   */
  const label =
    signature === 'good'
      ? t('imza doğrulandı')
      : signature === 'untrusted'
        ? t('imza güvenilmiyor')
        : signature === 'bad'
          ? t('imza geçersiz')
          : t('imza doğrulanamadı');

  const tone = signature === 'bad' ? 'crit' : signature === 'good' ? 'ok' : 'warn';

  return (
    <Badge tone={tone}>
      {signature === 'bad' ? (
        <ShieldAlert className="size-2.5" />
      ) : (
        <ShieldCheck className="size-2.5" />
      )}
      {signer ? `${label} · ${signer}` : label}
    </Badge>
  );
}

function CommitRow({
  commit,
  graphRow,
  selected,
  onSelect,
  onRevert,
  onReset,
  onTag,
  onCopySha,
  onCherryPick,
  onRebaseFrom,
  onBisectFrom,
}: {
  commit: Commit;
  graphRow: ReturnType<typeof buildGraph>[number] | undefined;
  selected: boolean;
  onSelect: () => void;
  onRevert: () => void;
  onReset: () => void;
  onTag: () => void;
  onCopySha: () => void;
  onCherryPick: () => void;
  onRebaseFrom: () => void;
  onBisectFrom: () => void;
}) {
  const t = useT();
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <button
          type="button"
          onClick={onSelect}
          className={cn(
            'flex h-full w-full items-stretch gap-2 border-b border-line-soft pr-3 text-left',
            selected ? 'bg-accent-tint' : 'hover:bg-surface-2',
          )}
        >
          {graphRow && (
            <CommitGraph
              row={graphRow}
              height={COMMIT_ROW_HEIGHT}
              isMerge={commit.parents.length > 1}
            />
          )}
          <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-[13px]',
                  selected ? 'font-medium text-accent-ink' : 'text-ink',
                )}
              >
                {commit.subject}
              </span>
              {commit.parents.length > 1 && <Badge tone="neutral">{t('merge')}</Badge>}
            </span>
            <span className="flex items-center gap-1.5 overflow-hidden">
              <span className="shrink-0 font-mono text-[11px] text-ink-3">{commit.shortSha}</span>
              <span className="truncate text-[11px] text-ink-2">{commit.authorName}</span>
              <span className="shrink-0 text-[11px] text-ink-3">
                {relativeTime(commit.authoredAt)}
              </span>
              {/*
                Üçten fazlası satıra sığmıyor; kalanların sayısı yazılıyor.
                Sessizce kesmek "başka ref yok" gibi okunuyordu.
              */}
              {commit.refs.slice(0, 3).map((commitRef) => (
                <RefBadge key={`${commitRef.kind}-${commitRef.name}`} commitRef={commitRef} />
              ))}
              {commit.refs.length > 3 && (
                <span className="shrink-0 text-[11px] text-ink-3">+{commit.refs.length - 3}</span>
              )}
            </span>
          </span>
        </button>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 min-w-56 rounded-md border border-line bg-surface p-1 shadow-lg">
          <ContextMenu.Item
            onSelect={onCopySha}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-surface-2"
          >
            <Copy className="size-3.5" />
            {t('SHA’yı kopyala')}
          </ContextMenu.Item>
          <ContextMenu.Item
            onSelect={onTag}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-surface-2"
          >
            <Tag className="size-3.5" />
            {t('Bu commit’i etiketle…')}
          </ContextMenu.Item>
          <ContextMenu.Item
            onSelect={onCherryPick}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-surface-2"
          >
            <GitGraph className="size-3.5" />
            {t('Bu commit’i buraya uygula (cherry-pick)')}
          </ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-line-soft" />
          <ContextMenu.Item
            onSelect={onRevert}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-surface-2"
          >
            <Undo2 className="size-3.5" />
            {t('Bu commit’i geri al (revert)')}
          </ContextMenu.Item>
          <ContextMenu.Item
            onSelect={onBisectFrom}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-surface-2"
          >
            <Search className="size-3.5" />
            {t('Buradan ikili arama başlat')}
          </ContextMenu.Item>
          <ContextMenu.Item
            onSelect={onRebaseFrom}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-surface-2"
          >
            <ListOrdered className="size-3.5" />
            {t('Bu commit’ten sonrasını düzenle…')}
          </ContextMenu.Item>
          <ContextMenu.Item
            onSelect={onReset}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] text-crit outline-none data-[highlighted]:bg-crit-tint"
          >
            {t('Bu commit’e sıfırla (reset)…')}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export function HistoryView({ repoId }: { repoId: string }) {
  const t = useT();
  const {
    attach,
    width: paneWidth,
    available: paneAvailable,
    preview: panePreview,
    commit: paneCommit,
  } = usePane('historyCommits');
  const [filter, setFilter] = useState<LogFilter>({});
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useLog(
    repoId,
    Object.keys(filter).length > 0 ? filter : undefined,
  );
  const { data: settings } = useSettings();
  const selection = useUi((s) => s.selection);
  const select = useUi((s) => s.select);
  const toast = useUi((s) => s.toast);
  const invalidate = useInvalidateRepo();
  const client = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [resetTarget, setResetTarget] = useState<Commit | null>(null);
  const [resetMode, setResetMode] = useState<ResetMode>('mixed');
  const [reflogOpen, setReflogOpen] = useState(false);
  const [rebaseBase, setRebaseBase] = useState<Commit | null>(null);
  const [revertTarget, setRevertTarget] = useState<Commit | null>(null);
  const [tagTarget, setTagTarget] = useState<Commit | null>(null);
  const [cherryTarget, setCherryTarget] = useState<Commit | null>(null);
  const [blameTarget, setBlameTarget] = useState<string | null>(null);

  const commits = useMemo(() => data?.pages.flat() ?? [], [data]);
  // Grafik düzeni yüklenen bütün commit'lere bakarak hesaplanıyor: yeni sayfa
  // geldiğinde şeritler baştan kuruluyor ki dallar kesintisiz görünsün.
  const graph = useMemo(() => buildGraph(commits), [commits]);

  const selectedSha = selection.kind === 'commit' ? selection.sha : null;
  const selectedPath = selection.kind === 'commit' ? selection.path : null;

  const { data: detail, isLoading: detailLoading } = useCommitDetail(repoId, selectedSha);
  const { data: diff, isLoading: diffLoading } = useCommitFileDiff(
    repoId,
    selectedSha,
    selectedPath,
  );

  const virtualizer = useVirtualizer({
    count: commits.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => COMMIT_ROW_HEIGHT,
    overscan: 10,
  });

  // Liste sonuna yaklaşınca bir sonraki sayfayı çek.
  const virtualItems = virtualizer.getVirtualItems();
  const lastVisibleIndex = virtualItems[virtualItems.length - 1]?.index ?? 0;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && lastVisibleIndex >= commits.length - 20) {
      void fetchNextPage();
    }
  }, [lastVisibleIndex, commits.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const revert = useMutation({
    mutationFn: (sha: string) => invoke('git:revert', { repoId, sha }),
    onSuccess: (result) => {
      invalidate(repoId);
      toast({
        kind:
          result.outcome === 'reverted'
            ? 'success'
            : result.outcome === 'conflict'
              ? 'warning'
              : 'error',
        title: t('Revert'),
        description: result.message,
      });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Geri alınamadı'), description: errorMessage(error) }),
  });

  const cherryPick = useMutation({
    mutationFn: (sha: string) => invoke('git:cherry-pick', { repoId, sha }),
    onSuccess: (result) => {
      invalidate(repoId);
      toast({
        kind:
          result.outcome === 'merged'
            ? 'success'
            : result.outcome === 'conflict'
              ? 'warning'
              : 'error',
        title: t('Cherry-pick'),
        description: result.message,
      });
      setCherryTarget(null);
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('Cherry-pick yapılamadı'),
        description: errorMessage(error),
      }),
  });

  /*
   * Bisect burada başlıyor: sağ tıklanan commit "sağlam", HEAD "hatalı"
   * sayılıyor. İkisini birden vermek şart — git tek uçla aramaya başlamıyor ve
   * kullanıcıya ikinci ucu ayrıca sormak gereksiz bir adım olurdu.
   */
  const startBisect = useMutation({
    mutationFn: (goodSha: string) => invoke('git:bisect-start', { repoId, goodSha }),
    onSuccess: (state) => {
      invalidate(repoId);
      toast({
        kind: 'info',
        title: t('İkili arama başladı'),
        description: state.message,
      });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Başlatılamadı'), description: errorMessage(error) }),
  });

  const reset = useMutation({
    mutationFn: ({ sha, mode }: { sha: string; mode: ResetMode }) =>
      invoke('git:reset', { repoId, sha, mode }),
    onSuccess: (_result, variables) => {
      invalidate(repoId);
      void client.invalidateQueries({ queryKey: keys.log(repoId) });
      select({ kind: 'none' });
      toast({
        kind: 'info',
        title: t('HEAD {sha} commit’ine taşındı', { sha: variables.sha.slice(0, 8) }),
      });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Sıfırlanamadı'), description: errorMessage(error) }),
  });

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const hasFilter = Object.keys(filter).length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <HistoryFilterBar
        filter={filter}
        onChange={setFilter}
        resultCount={commits.length}
        actions={
          <Button size="sm" variant="ghost" onClick={() => setReflogOpen(true)}>
            <RotateCcw className="size-3.5" />
            {t('HEAD geçmişi')}
          </Button>
        }
      />
      <ReflogDialog open={reflogOpen} onOpenChange={setReflogOpen} repoId={repoId} />
      {/*
        Koşullu monte: pencere her açılışta seçilen commit'in üstündeki listeyle
        taze başlasın, önceki seçimin adımları kalmasın.
      */}
      {rebaseBase && (
        <RebaseDialog
          open
          onOpenChange={(next) => !next && setRebaseBase(null)}
          repoId={repoId}
          baseSha={rebaseBase.sha}
          commits={commits.slice(
            0,
            commits.findIndex((item) => item.sha === rebaseBase.sha),
          )}
        />
      )}

      <div ref={attach} className="flex min-h-0 flex-1">
        <div
          style={{ width: paneWidth }}
          className="flex shrink-0 flex-col border-r border-line bg-surface"
        >
          {commits.length === 0 ? (
            <EmptyState
              title={hasFilter ? t('Filtreye uyan commit yok') : t('Geçmiş boş')}
              description={
                hasFilter
                  ? t('Filtreyi gevşetmeyi dene.')
                  : t('Bu depoda henüz commit yok. İlk commit’ini oluşturduğunda burada görünecek.')
              }
            />
          ) : (
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualItems.map((item) => {
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
                        graphRow={graph[item.index]}
                        selected={selectedSha === commit.sha}
                        onSelect={() => select({ kind: 'commit', sha: commit.sha, path: null })}
                        onRevert={() => setRevertTarget(commit)}
                        onReset={() => {
                          setResetMode('mixed');
                          setResetTarget(commit);
                        }}
                        onTag={() => setTagTarget(commit)}
                        onCherryPick={() => setCherryTarget(commit)}
                        onRebaseFrom={() => setRebaseBase(commit)}
                        onBisectFrom={() => startBisect.mutate(commit.sha)}
                        onCopySha={() => {
                          void navigator.clipboard.writeText(commit.sha);
                          toast({ kind: 'success', title: t('SHA kopyalandı') });
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              {isFetchingNextPage && (
                <div className="flex justify-center py-3">
                  <Spinner />
                </div>
              )}
            </div>
          )}
        </div>

        <Splitter
          pane="historyCommits"
          width={paneWidth}
          available={paneAvailable}
          onPreview={panePreview}
          onCommit={paneCommit}
          label={t('Commit listesi genişliği')}
        />

        {selectedSha ? (
          <>
            <div className="flex w-72 shrink-0 flex-col border-r border-line bg-surface">
              {detailLoading || !detail ? (
                <div className="flex flex-1 items-center justify-center">
                  <Spinner />
                </div>
              ) : (
                <>
                  {/*
                    Commit gövdesi uzun olduğunda dosya listesini ekranın dışına
                    itiyordu: uzun mesajlı bir commit'te hangi dosyaların
                    değiştiğini hiç göremiyordun. Mesaj artık kendi içinde
                    kaydırılıyor ve listeye her zaman yer kalıyor.
                  */}
                  <div className="shrink-0 border-b border-line-soft p-3">
                    <p className="selectable text-[13px] font-semibold text-ink">
                      {detail.subject}
                    </p>
                    {detail.body && (
                      <p className="selectable mt-1 max-h-40 overflow-y-auto text-[12px] whitespace-pre-wrap text-ink-2">
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
                      <SignatureBadge signature={detail.signature} signer={detail.signer} />
                      {detail.additions > 0 && (
                        <Badge tone="ok">+{formatCount(detail.additions)}</Badge>
                      )}
                      {detail.deletions > 0 && (
                        <Badge tone="crit">−{formatCount(detail.deletions)}</Badge>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 px-3 py-2">
                    <SectionLabel>
                      {t('{count} dosya', { count: detail.files.length })}
                    </SectionLabel>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto pb-2">
                    {detail.files.map((file) => {
                      const mark = KIND_MARKS[file.kind];
                      const directory = directoryName(file.path);
                      return (
                        <ContextMenu.Root key={file.path}>
                          <ContextMenu.Trigger asChild>
                            <button
                              type="button"
                              onClick={() =>
                                select({ kind: 'commit', sha: detail.sha, path: file.path })
                              }
                              className={cn(
                                'flex h-8 w-full items-center gap-2 px-3 text-left',
                                selectedPath === file.path
                                  ? 'bg-accent-tint'
                                  : 'hover:bg-surface-2',
                              )}
                            >
                              <span
                                className={cn(
                                  'shrink-0 font-mono text-[11px] font-semibold',
                                  mark.className,
                                )}
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
                          </ContextMenu.Trigger>
                          <ContextMenu.Portal>
                            <ContextMenu.Content className="z-50 min-w-52 rounded-lg border border-line bg-surface p-1 shadow-xl">
                              <ContextMenu.Item
                                onSelect={() => setBlameTarget(file.path)}
                                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-surface-2"
                              >
                                <HistoryIcon className="size-3.5" />
                                {t('Satır geçmişi (blame)')}
                              </ContextMenu.Item>
                            </ContextMenu.Content>
                          </ContextMenu.Portal>
                        </ContextMenu.Root>
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
                subtitle={
                  selectedPath
                    ? t('{sha} içindeki hâli', { sha: detail?.shortSha ?? '' })
                    : undefined
                }
                sideBySide={settings?.sideBySideDiff ?? false}
                /*
                 * Commit'in kendisi ile bir öncesi. İlk commit'te `sha^` yok;
                 * o durumda git nesneyi bulamıyor ve "önce" tarafı boş kalıyor,
                 * yani dosya o commit'te eklenmiş görünüyor.
                 */
                preview={{
                  repoId,
                  beforeRef: selectedSha ? `${selectedSha}^` : null,
                  afterRef: selectedSha,
                }}
              />
            </div>
          </>
        ) : (
          <div className="min-w-0 flex-1">
            <EmptyState
              title={t('Commit seç')}
              description={t(
                'Soldaki listeden bir commit’e tıklayarak içindeki değişiklikleri gör. Sağ tıkla revert, reset ve etiket seçeneklerine ulaşabilirsin.',
              )}
            />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={revertTarget !== null}
        onOpenChange={(next) => !next && setRevertTarget(null)}
        title={t('Commit’i geri al')}
        confirmLabel={t('Geri al')}
        onConfirm={() => revertTarget && revert.mutate(revertTarget.sha)}
      >
        <p className="text-[13px] text-ink-2">
          <span className="font-mono text-ink">{revertTarget?.shortSha}</span>{' '}
          {t(
            'commit’inin değişikliklerini geri alan yeni bir commit oluşturulacak. Geçmiş silinmez, bu yüzden paylaşılmış dallarda güvenlidir.',
          )}
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={resetTarget !== null}
        onOpenChange={(next) => !next && setResetTarget(null)}
        title={t('Bu commit’e sıfırla')}
        confirmLabel={t('Sıfırla')}
        destructive={resetMode === 'hard'}
        onConfirm={() => resetTarget && reset.mutate({ sha: resetTarget.sha, mode: resetMode })}
      >
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-ink-2">
            HEAD <span className="font-mono text-ink">{resetTarget?.shortSha}</span>{' '}
            {t(
              'commit’ine taşınacak. Bu dal başkalarıyla paylaşıldıysa dikkatli ol: karşı tarafta ayrılmış bir geçmiş bırakır.',
            )}
          </p>
          <div className="flex flex-col gap-1.5">
            {RESET_MODES.map((option) => (
              <button
                key={option.mode}
                type="button"
                onClick={() => setResetMode(option.mode)}
                className={cn(
                  'rounded-lg border p-2.5 text-left',
                  resetMode === option.mode
                    ? 'border-accent bg-accent-tint'
                    : 'border-line bg-surface hover:bg-surface-2',
                )}
              >
                <p
                  className={cn(
                    'text-[13px] font-medium',
                    resetMode === option.mode ? 'text-accent-ink' : 'text-ink',
                  )}
                >
                  {t(option.label)}
                </p>
                <p className="text-[11px] text-ink-2">{t(option.description)}</p>
              </button>
            ))}
          </div>
        </div>
      </ConfirmDialog>

      <BlameDialog
        repoId={repoId}
        path={blameTarget}
        open={blameTarget !== null}
        onOpenChange={(next) => !next && setBlameTarget(null)}
      />

      <ConfirmDialog
        open={cherryTarget !== null}
        onOpenChange={(next) => !next && setCherryTarget(null)}
        title={t('Commit’i buraya uygula')}
        confirmLabel={t('Uygula')}
        onConfirm={() => cherryTarget && cherryPick.mutate(cherryTarget.sha)}
      >
        <p className="text-[13px] text-ink-2">
          <span className="font-mono text-ink">{cherryTarget?.shortSha}</span>{' '}
          {t(
            'commit’indeki değişiklikler bu dala yeni bir commit olarak uygulanacak. Aynı satırlara dokunulmuşsa çakışma çıkabilir; çakışmayı çözüp işleme devam edebilirsin.',
          )}
        </p>
      </ConfirmDialog>

      <TagDialog
        repoId={repoId}
        commit={tagTarget}
        open={tagTarget !== null}
        onOpenChange={(next) => !next && setTagTarget(null)}
      />
    </div>
  );
}
