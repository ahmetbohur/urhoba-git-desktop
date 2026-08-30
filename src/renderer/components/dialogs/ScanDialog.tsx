import { useState } from 'react';
import { FolderOpen, FolderSearch, GitBranch } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useT } from '../../i18n';
import { errorMessage, invoke } from '../../lib/ipc';
import { keys, useMutation, useQueryClient } from '../../lib/queries';
import { useUi } from '../../stores/ui';
import { Badge, Button, SectionLabel, Spinner } from '../primitives';
import { DialogShell } from './DialogShell';
import type { ScannedRepo } from '@shared/types';

/**
 * Klasör tarama.
 *
 * Depoları tek tek eklemek, elinde otuz proje olan biri için işkence. Bu diyalog
 * bir klasörü gezip içindeki bütün depoları buluyor ve toplu eklemeye izin
 * veriyor.
 *
 * Zaten listede olan depolar sonuçta görünüyor ama seçilemiyor: kullanıcı
 * "neden bu proje listede yok" diye aramasın, "zaten ekli" olduğunu görsün.
 */
export function ScanDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const [directory, setDirectory] = useState<string | null>(null);
  const [results, setResults] = useState<ScannedRepo[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const client = useQueryClient();
  const setActiveRepo = useUi((s) => s.setActiveRepo);
  const toast = useUi((s) => s.toast);

  const reset = () => {
    setDirectory(null);
    setResults(null);
    setSelected(new Set());
  };

  const scan = useMutation({
    mutationFn: async () => {
      const chosen = await invoke('repo:pick-directory', undefined);
      if (!chosen) return null;
      setDirectory(chosen);
      return invoke('repo:scan', { directory: chosen, maxDepth: 4 });
    },
    onSuccess: (found) => {
      if (!found) return;
      setResults(found);
      // Yeni bulunanlar baştan seçili gelsin: kullanıcı çoğu zaman hepsini ister.
      setSelected(new Set(found.filter((repo) => !repo.alreadyAdded).map((repo) => repo.path)));
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Klasör taranamadı'), description: errorMessage(error) }),
  });

  const addMany = useMutation({
    mutationFn: () => invoke('repo:add-many', { paths: [...selected] }),
    onSuccess: (added) => {
      void client.invalidateQueries({ queryKey: keys.repos });
      if (added.length > 0) setActiveRepo(added[0].id);
      toast({ kind: 'success', title: t('{count} depo eklendi', { count: added.length }) });
      onOpenChange(false);
      reset();
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Depolar eklenemedi'), description: errorMessage(error) }),
  });

  const selectable = results?.filter((repo) => !repo.alreadyAdded) ?? [];
  const allSelected = selectable.length > 0 && selected.size === selectable.length;

  const toggle = (repoPath: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(repoPath)) next.delete(repoPath);
      else next.add(repoPath);
      return next;
    });

  return (
    <DialogShell
      open={open}
      onOpenChange={(next) => {
        if (addMany.isPending) return;
        onOpenChange(next);
        if (!next) reset();
      }}
      title={t('Klasörü tara')}
      description={t('Seçtiğin klasördeki bütün git depolarını bulur ve tek seferde ekler.')}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={addMany.isPending}>
            {t('Vazgeç')}
          </Button>
          <Button
            variant="primary"
            loading={addMany.isPending}
            disabled={selected.size === 0}
            onClick={() => addMany.mutate()}
          >
            {selected.size > 0
              ? t('{count} depoyu ekle', { count: selected.size })
              : t('Depo seç')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 rounded-md border border-line bg-ground px-2 py-1.5">
            <p className="truncate font-mono text-[11px] text-ink">
              {directory ?? t('Henüz klasör seçilmedi')}
            </p>
          </div>
          <Button variant="secondary" loading={scan.isPending} onClick={() => scan.mutate()}>
            <FolderOpen className="size-3.5" />
            {directory ? t('Başka klasör') : t('Klasör seç')}
          </Button>
        </div>

        {scan.isPending && (
          <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-ink-2">
            <Spinner />
            {t('Klasör taranıyor…')}
          </div>
        )}

        {results && !scan.isPending && (
          <>
            <div className="flex items-center gap-2 border-t border-line-soft pt-2">
              <SectionLabel>{t('{count} depo bulundu', { count: results.length })}</SectionLabel>
              <div className="flex-1" />
              {selectable.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setSelected(
                      allSelected ? new Set() : new Set(selectable.map((repo) => repo.path)),
                    )
                  }
                >
                  {allSelected ? t('Seçimi kaldır') : t('Tümünü seç')}
                </Button>
              )}
            </div>

            {results.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line py-10 text-center">
                <FolderSearch className="size-5 text-ink-3" />
                <p className="text-[13px] font-medium text-ink">{t('Depo bulunamadı')}</p>
                <p className="max-w-sm text-[12px] text-ink-2">
                  {t('Bu klasörde dört seviye derinliğe kadar git deposu yok.')}
                </p>
              </div>
            ) : (
              <ul className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
                {results.map((repo) => (
                  <li key={repo.path}>
                    <label
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5',
                        repo.alreadyAdded
                          ? 'opacity-50'
                          : selected.has(repo.path)
                            ? 'bg-accent-tint'
                            : 'hover:bg-surface-2',
                        !repo.alreadyAdded && 'cursor-pointer',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(repo.path)}
                        disabled={repo.alreadyAdded}
                        onChange={() => toggle(repo.path)}
                        className="size-3.5 shrink-0 accent-[var(--accent)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink">{repo.name}</span>
                        <span className="block truncate font-mono text-[11px] text-ink-3">
                          {repo.relativePath}
                        </span>
                      </span>
                      {repo.currentBranch && (
                        <span className="flex shrink-0 items-center gap-1 text-[11px] text-ink-3">
                          <GitBranch className="size-3" />
                          {repo.currentBranch}
                        </span>
                      )}
                      {repo.alreadyAdded && <Badge tone="neutral">{t('zaten ekli')}</Badge>}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </DialogShell>
  );
}
