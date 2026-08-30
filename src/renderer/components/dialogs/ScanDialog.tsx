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
      fill
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={addMany.isPending}>
            {t('Vazgeç')}
          </Button>
          {/* Tarama yapılmadan "ekle" düğmesi göstermek anlamsız: eklenecek bir
              şey yok ve devre dışı bir düğme kullanıcıya yanlış yerde arıyormuş
              hissi veriyor. */}
          {results && results.length > 0 && (
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
          )}
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 items-center gap-2">
          <div className="min-w-0 flex-1 rounded-md border border-line bg-ground px-2.5 py-1.5">
            {/* Seçilmemiş durumda yol biçimi kullanmıyoruz: tek aralıklı yazı
                gerçek bir yol varmış izlenimi veriyordu. */}
            <p
              className={cn(
                'truncate text-[11px]',
                directory ? 'font-mono text-ink' : 'text-ink-3 italic',
              )}
            >
              {directory ?? t('Henüz klasör seçilmedi')}
            </p>
          </div>
          <Button
            variant={directory ? 'secondary' : 'primary'}
            loading={scan.isPending}
            data-autofocus
            onClick={() => scan.mutate()}
          >
            <FolderOpen className="size-3.5" />
            {directory ? t('Başka klasör') : t('Klasör seç')}
          </Button>
        </div>

        {scan.isPending && (
          <div className="flex flex-1 items-center justify-center gap-2 py-8 text-[12px] text-ink-2">
            <Spinner />
            {t('Klasör taranıyor…')}
          </div>
        )}

        {results && !scan.isPending && (
          <>
            <div className="flex shrink-0 items-center gap-2 border-t border-line-soft pt-2">
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
              <div className="flex shrink-0 flex-col items-center gap-2 rounded-lg border border-dashed border-line py-10 text-center">
                <FolderSearch className="size-5 text-ink-3" />
                <p className="text-[13px] font-medium text-ink">{t('Depo bulunamadı')}</p>
                <p className="max-w-sm text-[12px] text-ink-2">
                  {t('Bu klasörde dört seviye derinliğe kadar git deposu yok.')}
                </p>
              </div>
            ) : (
              <ul className="min-h-0 flex-1 divide-y divide-line-soft overflow-y-auto rounded-lg border border-line">
                {results.map((repo) => (
                  <li key={repo.path}>
                    <label
                      className={cn(
                        // Seçim sol kenardaki şeritle de belli oluyor: uzun bir
                        // listede yalnızca arka plan tonu ayırt etmeye yetmiyor.
                        'flex items-center gap-2.5 border-l-2 px-2.5 py-2',
                        repo.alreadyAdded
                          ? 'border-transparent opacity-45'
                          : selected.has(repo.path)
                            ? 'cursor-pointer border-accent bg-accent-tint'
                            : 'cursor-pointer border-transparent hover:bg-surface-2',
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
                        <span className="block truncate text-[13px] font-medium text-ink">
                          {repo.name}
                        </span>
                        <span className="block truncate font-mono text-[11px] text-ink-3">
                          {repo.relativePath}
                        </span>
                      </span>
                      {repo.currentBranch && (
                        <span className="flex shrink-0 items-center gap-1 rounded border border-line-soft bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-2">
                          <GitBranch className="size-2.5" />
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
