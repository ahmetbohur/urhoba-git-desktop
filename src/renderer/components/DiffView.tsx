import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Columns2, FileWarning, Rows3 } from 'lucide-react';
import { useT } from '../i18n';
import { cn } from '../lib/cn';
import { pairLinesForSideBySide } from '../lib/diff-layout';
import { languageForPath, tokenizeLines, type HighlightToken } from '../lib/highlight';
import { formatCount } from '../lib/format';
import { Badge, Button, EmptyState, Spinner, Tooltip } from './primitives';
import { FilePreviewView } from './FilePreviewView';
import type { DiffHunk, DiffLine, FileDiff, HunkSelection, LineStageMode } from '@shared/types';

/**
 * Diff görüntüleyici.
 *
 * Renklendirme için hunk'ın tamamını tek blok hâlinde tokenize ediyoruz: eklenen
 * ve silinen satırlar iç içe geçtiği için satır satır tokenize etmek dilbilgisi
 * bağlamını (açık string, açık blok) her satırda sıfırlar ve renkler saçmalar.
 *
 * Satır seçimi yalnızca çalışma dizini diff'lerinde açık: bir commit'in içindeki
 * satırı "hazırlamak" anlamsız olurdu. Seçim `hunkIndex:lineIndex` anahtarıyla
 * tutuluyor, çünkü satır dizinleri hunk'a göreli.
 */

function useDarkMode(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (event: MediaQueryListEvent) => setDark(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);
  return dark;
}

const LINE_STYLES: Record<DiffLine['kind'], string> = {
  add: 'bg-diff-add',
  del: 'bg-diff-del',
  context: '',
  meta: 'text-ink-3 italic',
};

const GUTTER_STYLES: Record<DiffLine['kind'], string> = {
  add: 'bg-diff-add text-diff-add-ink',
  del: 'bg-diff-del text-diff-del-ink',
  context: 'text-ink-3',
  meta: 'text-ink-3',
};

function lineKey(hunkIndex: number, lineIndex: number): string {
  return `${hunkIndex}:${lineIndex}`;
}

function LineContent({ tokens, fallback }: { tokens: HighlightToken[] | null; fallback: string }) {
  if (!tokens) return <>{fallback || ' '}</>;
  return (
    <>
      {tokens.map((token, index) => (
        <span key={index} style={token.color ? { color: token.color } : undefined}>
          {token.content}
        </span>
      ))}
    </>
  );
}

interface RowProps {
  line: DiffLine;
  tokens: HighlightToken[] | null;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
  onExtend: () => void;
}

function UnifiedRow({ line, tokens, selectable, selected, onToggle, onExtend }: RowProps) {
  const isChange = line.kind === 'add' || line.kind === 'del';
  const interactive = selectable && isChange;

  return (
    <div
      className={cn(
        'flex font-mono text-[12px] leading-[1.5]',
        LINE_STYLES[line.kind],
        selected && 'ring-1 ring-accent ring-inset',
        interactive && 'cursor-pointer',
      )}
      onClick={
        interactive
          ? (event) => {
              if (event.shiftKey) onExtend();
              else onToggle();
            }
          : undefined
      }
    >
      <span
        className={cn(
          'w-12 shrink-0 border-r border-line-soft px-2 text-right tabular-nums select-none',
          GUTTER_STYLES[line.kind],
        )}
      >
        {line.oldLine ?? ''}
      </span>
      <span
        className={cn(
          'w-12 shrink-0 border-r border-line-soft px-2 text-right tabular-nums select-none',
          GUTTER_STYLES[line.kind],
        )}
      >
        {line.newLine ?? ''}
      </span>
      <span
        className={cn(
          'w-5 shrink-0 text-center select-none',
          line.kind === 'add' && 'text-diff-add-ink',
          line.kind === 'del' && 'text-diff-del-ink',
          line.kind !== 'add' && line.kind !== 'del' && 'text-ink-3',
        )}
      >
        {line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ''}
      </span>
      <span className="selectable min-w-0 flex-1 pr-3 break-all whitespace-pre-wrap">
        <LineContent tokens={tokens} fallback={line.content} />
      </span>
    </div>
  );
}

function SideCell({
  entry,
  tokensFor,
  selectable,
  isSelected,
  onToggle,
  onExtend,
}: {
  entry: { line: DiffLine; index: number } | null;
  tokensFor: (index: number) => HighlightToken[] | null;
  selectable: boolean;
  isSelected: (index: number) => boolean;
  onToggle: (index: number) => void;
  onExtend: (index: number) => void;
}) {
  if (!entry) {
    return <div className="flex min-w-0 flex-1 bg-surface-2/50" />;
  }
  const { line, index } = entry;
  const isChange = line.kind === 'add' || line.kind === 'del';
  const interactive = selectable && isChange;
  const selected = isSelected(index);

  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 font-mono text-[12px] leading-[1.5]',
        LINE_STYLES[line.kind],
        selected && 'ring-1 ring-accent ring-inset',
        interactive && 'cursor-pointer',
      )}
      onClick={
        interactive
          ? (event) => (event.shiftKey ? onExtend(index) : onToggle(index))
          : undefined
      }
    >
      <span
        className={cn(
          'w-11 shrink-0 border-r border-line-soft px-2 text-right tabular-nums select-none',
          GUTTER_STYLES[line.kind],
        )}
      >
        {line.kind === 'add' ? (line.newLine ?? '') : (line.oldLine ?? '')}
      </span>
      <span className="selectable min-w-0 flex-1 px-2 break-all whitespace-pre-wrap">
        <LineContent tokens={tokensFor(index)} fallback={line.content} />
      </span>
    </div>
  );
}

export interface DiffViewProps {
  diff: FileDiff | undefined;
  isLoading: boolean;
  title: string;
  subtitle?: string;
  sideBySide: boolean;
  onToggleSideBySide?: () => void;
  /** Satır seçimi yalnızca bu geri çağrı verildiğinde açılır. */
  onApplyLines?: (mode: LineStageMode, selections: HunkSelection[]) => void;
  /** Hazırlanmış diff'e bakılıyorsa eylem etiketleri tersine döner. */
  staged?: boolean;
  /**
   * Verildiğinde ikili dosyalarda diff yerine içerik önizlemesi gösterilir.
   * Hangi iki sürümün karşılaştırılacağını çağıran biliyor: çalışma dizininde
   * hazırlık alanı ile disk, geçmişte ise commit ile ondan önceki.
   */
  preview?: { repoId: string; beforeRef: string | null; afterRef: string | null };
}

export function DiffView({
  diff,
  isLoading,
  title,
  subtitle,
  sideBySide,
  onToggleSideBySide,
  onApplyLines,
  staged = false,
  preview,
}: DiffViewProps) {
  const t = useT();
  const dark = useDarkMode();
  const [highlight, setHighlight] = useState<{
    key: string;
    tokens: HighlightToken[][] | null;
  } | null>(null);
  // Seçim, dosya değiştiğinde sıfırlanmalı. Bunu effect içinde yapmak yerine
  // çağıranın `key` vermesine bırakıyoruz: bileşen yeniden kurulunca seçim de
  // doğal olarak boş başlıyor, ara render'da eski dosyanın seçimi görünmüyor.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Shift ile aralık seçimi için son tıklanan satır.
  const anchor = useRef<{ hunkIndex: number; lineIndex: number } | null>(null);

  const selectable = !!onApplyLines && !!diff && !diff.isBinary && !diff.isTooLarge;

  const { code, offsets, language } = useMemo(() => {
    if (!diff) return { code: '', offsets: [] as number[], language: null };
    const lines: string[] = [];
    const starts: number[] = [];
    for (const hunk of diff.hunks) {
      starts.push(lines.length);
      for (const line of hunk.lines) lines.push(line.content);
    }
    return { code: lines.join('\n'), offsets: starts, language: languageForPath(diff.path) };
  }, [diff]);

  const highlightKey = `${diff?.path ?? ''}|${language ?? ''}|${dark}|${code.length}`;

  useEffect(() => {
    if (!language || code.length === 0 || code.length > 400_000) return;
    let cancelled = false;
    void tokenizeLines(code, language, dark).then((tokens) => {
      if (!cancelled) setHighlight({ key: highlightKey, tokens });
    });
    return () => {
      cancelled = true;
    };
  }, [code, language, dark, highlightKey]);

  const highlighted = highlight?.key === highlightKey ? highlight.tokens : null;

  const toggleLine = useCallback((hunkIndex: number, lineIndex: number) => {
    anchor.current = { hunkIndex, lineIndex };
    setSelected((previous) => {
      const next = new Set(previous);
      const key = lineKey(hunkIndex, lineIndex);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const extendSelection = useCallback(
    (hunkIndex: number, lineIndex: number) => {
      const start = anchor.current;
      // Aralık seçimi yalnızca aynı hunk içinde anlamlı: hunk'lar arasında
      // "aradaki satırlar" diye bir şey yok.
      if (!start || start.hunkIndex !== hunkIndex) {
        toggleLine(hunkIndex, lineIndex);
        return;
      }
      const [from, to] = [start.lineIndex, lineIndex].sort((a, b) => a - b);
      setSelected((previous) => {
        const next = new Set(previous);
        const hunk = diff?.hunks[hunkIndex];
        for (let index = from; index <= to; index += 1) {
          const kind = hunk?.lines[index]?.kind;
          if (kind === 'add' || kind === 'del') next.add(lineKey(hunkIndex, index));
        }
        return next;
      });
    },
    [diff, toggleLine],
  );

  const selectHunk = useCallback(
    (hunkIndex: number) => {
      const hunk = diff?.hunks[hunkIndex];
      if (!hunk) return;
      setSelected((previous) => {
        const next = new Set(previous);
        hunk.lines.forEach((line, index) => {
          if (line.kind === 'add' || line.kind === 'del') next.add(lineKey(hunkIndex, index));
        });
        return next;
      });
    },
    [diff],
  );

  const selections = useMemo<HunkSelection[]>(() => {
    const byHunk = new Map<number, number[]>();
    for (const key of selected) {
      const [hunkIndex, lineIndex] = key.split(':').map(Number);
      const list = byHunk.get(hunkIndex) ?? [];
      list.push(lineIndex);
      byHunk.set(hunkIndex, list);
    }
    return [...byHunk.entries()]
      .map(([hunkIndex, lineIndices]) => ({
        hunkIndex,
        lineIndices: lineIndices.sort((a, b) => a - b),
      }))
      .sort((a, b) => a.hunkIndex - b.hunkIndex);
  }, [selected]);

  const apply = (mode: LineStageMode) => {
    if (!onApplyLines || selections.length === 0) return;
    onApplyLines(mode, selections);
    setSelected(new Set());
    anchor.current = null;
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!diff) {
    return (
      <EmptyState
        title={t('Dosya seçilmedi')}
        description={t('Değişiklikleri görmek için soldaki listeden bir dosyaya tıkla.')}
      />
    );
  }

  const tokensFor = (offset: number) => (index: number) =>
    highlighted ? (highlighted[offset + index] ?? null) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[12px] text-ink">{title}</p>
          {subtitle && <p className="truncate text-[11px] text-ink-3">{subtitle}</p>}
        </div>
        {diff.additions > 0 && <Badge tone="ok">+{formatCount(diff.additions)}</Badge>}
        {diff.deletions > 0 && <Badge tone="crit">−{formatCount(diff.deletions)}</Badge>}
        {onToggleSideBySide && (
          <Tooltip label={sideBySide ? t('Tek sütuna geç') : t('Yan yana göster')}>
            <button
              type="button"
              aria-label={sideBySide ? t('Tek sütuna geç') : t('Yan yana göster')}
              onClick={onToggleSideBySide}
              className="rounded-md p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              {sideBySide ? <Rows3 className="size-4" /> : <Columns2 className="size-4" />}
            </button>
          </Tooltip>
        )}
      </div>

      {selected.size > 0 && onApplyLines && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line bg-accent-tint px-3 py-1.5">
          <span className="text-[12px] font-medium text-accent-ink">
            {t('{count} satır seçili', { count: formatCount(selected.size) })}
          </span>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            {t('Seçimi temizle')}
          </Button>
          {staged ? (
            <Button size="sm" variant="primary" onClick={() => apply('unstage')}>
              {t('Hazırlıktan çıkar')}
            </Button>
          ) : (
            <>
              <Button size="sm" variant="secondary" onClick={() => apply('discard')}>
                {t('Geri al')}
              </Button>
              <Button size="sm" variant="primary" onClick={() => apply('stage')}>
                {t('Hazırla')}
              </Button>
            </>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto bg-surface">
        {diff.isBinary ? (
          preview ? (
            <FilePreviewView
              repoId={preview.repoId}
              path={diff.path}
              beforeRef={preview.beforeRef}
              afterRef={preview.afterRef}
            />
          ) : (
            <EmptyState
              icon={<FileWarning className="size-5" />}
              title={t('İkili dosya')}
              description={t('Bu dosyanın içeriği metin olarak karşılaştırılamıyor.')}
            />
          )
        ) : diff.isTooLarge ? (
          <EmptyState
            icon={<FileWarning className="size-5" />}
            title={t('Diff çok büyük')}
            description={t('Bu dosyanın farkı arayüzde gösterilemeyecek kadar büyük.')}
          />
        ) : diff.hunks.length === 0 ? (
          <EmptyState
            title={t('Fark yok')}
            description={t('Bu dosyada gösterilecek bir değişiklik yok.')}
          />
        ) : (
          diff.hunks.map((hunk, hunkIndex) => (
            <HunkBlock
              key={hunk.header + hunkIndex}
              hunk={hunk}
              hunkIndex={hunkIndex}
              sideBySide={sideBySide}
              tokensFor={tokensFor(offsets[hunkIndex])}
              selectable={selectable}
              isSelected={(lineIndex) => selected.has(lineKey(hunkIndex, lineIndex))}
              onToggle={(lineIndex) => toggleLine(hunkIndex, lineIndex)}
              onExtend={(lineIndex) => extendSelection(hunkIndex, lineIndex)}
              onSelectHunk={() => selectHunk(hunkIndex)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function HunkBlock({
  hunk,
  hunkIndex,
  sideBySide,
  tokensFor,
  selectable,
  isSelected,
  onToggle,
  onExtend,
  onSelectHunk,
}: {
  hunk: DiffHunk;
  hunkIndex: number;
  sideBySide: boolean;
  tokensFor: (index: number) => HighlightToken[] | null;
  selectable: boolean;
  isSelected: (lineIndex: number) => boolean;
  onToggle: (lineIndex: number) => void;
  onExtend: (lineIndex: number) => void;
  onSelectHunk: () => void;
}) {
  const t = useT();
  const pairs = useMemo(
    () => (sideBySide ? pairLinesForSideBySide(hunk.lines) : []),
    [sideBySide, hunk.lines],
  );

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-y border-line-soft bg-surface-2 px-3 py-1">
        <span className="font-mono text-[11px] text-ink-3">{hunk.header}</span>
        {selectable && (
          <button
            type="button"
            onClick={onSelectHunk}
            className="ml-auto rounded px-1.5 py-0.5 text-[11px] text-accent-ink hover:bg-accent-tint"
          >
            {t('Bu bloğu seç')}
          </button>
        )}
      </div>

      {sideBySide ? (
        pairs.map((pair, index) => (
          <div key={`${hunkIndex}-${index}`} className="flex">
            <SideCell
              entry={pair.left}
              tokensFor={tokensFor}
              selectable={selectable}
              isSelected={isSelected}
              onToggle={onToggle}
              onExtend={onExtend}
            />
            <div className="w-px shrink-0 bg-line" />
            <SideCell
              entry={pair.right}
              tokensFor={tokensFor}
              selectable={selectable}
              isSelected={isSelected}
              onToggle={onToggle}
              onExtend={onExtend}
            />
          </div>
        ))
      ) : (
        hunk.lines.map((line, lineIndex) => (
          <UnifiedRow
            key={lineIndex}
            line={line}
            tokens={tokensFor(lineIndex)}
            selectable={selectable}
            selected={isSelected(lineIndex)}
            onToggle={() => onToggle(lineIndex)}
            onExtend={() => onExtend(lineIndex)}
          />
        ))
      )}
    </div>
  );
}
