import { Boxes } from 'lucide-react';
import { useT } from '../i18n';
import { errorMessage, invoke } from '../lib/ipc';
import { useInvalidateRepo, useMutation, useQuery, useQueryClient } from '../lib/queries';
import { useUi } from '../stores/ui';
import { Button } from './primitives';
import type { Submodule } from '@shared/types';

/**
 * Kurulmamış alt modül uyarısı.
 *
 * Alt modüllü bir depo klonlandığında klasörler boş geliyor ve kullanıcı
 * "dosyalar nerede" diye kalıyor — git bunu hiçbir yerde söylemiyor. Şerit
 * yalnızca kurulmamış alt modül varken görünüyor; her şey yerindeyse ekranda
 * yer kaplamıyor.
 */
export function SubmoduleBar({ repoId }: { repoId: string }) {
  const t = useT();
  const client = useQueryClient();
  const invalidate = useInvalidateRepo();
  const toast = useUi((s) => s.toast);

  const { data: submodules } = useQuery<Submodule[]>({
    queryKey: ['submodules', repoId],
    queryFn: () => invoke('git:submodules', { repoId }),
  });

  const update = useMutation({
    mutationFn: () => invoke('git:submodule-update', { repoId }),
    onSuccess: () => {
      invalidate(repoId);
      void client.invalidateQueries({ queryKey: ['submodules', repoId] });
      toast({ kind: 'success', title: t('Alt modüller kuruldu') });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Alt modüller kurulamadı'), description: errorMessage(error) }),
  });

  const missing = (submodules ?? []).filter((entry) => !entry.initialized);
  if (missing.length === 0) return null;

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line bg-warn-tint px-3 py-1.5">
      <Boxes className="size-3.5 shrink-0 text-warn" />
      <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
        {t('{count} alt modül kurulmamış: {paths}', {
          count: missing.length,
          paths: missing.map((entry) => entry.path).join(', '),
        })}
      </span>
      <Button size="sm" variant="secondary" loading={update.isPending} onClick={() => update.mutate()}>
        {t('Kur')}
      </Button>
    </div>
  );
}
