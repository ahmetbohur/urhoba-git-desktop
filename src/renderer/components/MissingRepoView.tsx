import { FolderSearch, FolderX, Trash2 } from 'lucide-react';
import { useT } from '../i18n';
import { errorMessage, invoke } from '../lib/ipc';
import { keys, useMutation, useQueryClient } from '../lib/queries';
import { useUi } from '../stores/ui';
import { Button, EmptyState } from './primitives';
import type { RepoEntry } from '@shared/types';

/**
 * Klasörü diskte bulunmayan depo.
 *
 * Bu ekran olmadan uygulama yanlış bilgi veriyordu: klasör silinmiş olsa bile
 * depo normal açılıyor ve "çalışma dizini temiz" yazıyordu. Sebebi, arayüzün
 * hata durumu ile "değişiklik yok" durumunu ayırt etmemesiydi — ana süreç
 * baştan beri net bir hata döndürüyordu.
 *
 * Üç çıkış yolu sunuluyor çünkü klasörün yokluğunun üç farklı sebebi var:
 * taşınmış (yerini göster), silinmiş ama uzakta duruyor (yeniden klonla),
 * artık gerekmiyor (listeden kaldır).
 */
export function MissingRepoView({ repo }: { repo: RepoEntry }) {
  const t = useT();
  const client = useQueryClient();
  const toast = useUi((s) => s.toast);
  const setActiveRepo = useUi((s) => s.setActiveRepo);
  const setCloneOpen = useUi((s) => s.setCloneOpen);
  const setClonePreset = useUi((s) => s.setClonePreset);

  const relocate = useMutation({
    mutationFn: () => invoke('repo:relocate', { repoId: repo.id }),
    onSuccess: (updated) => {
      // Kullanıcı iptal ettiyse null dönüyor; bu bir hata değil, sessiz geç.
      if (!updated) return;
      void client.invalidateQueries({ queryKey: keys.repos });
      void client.invalidateQueries({ queryKey: ['repo', repo.id] });
      void client.invalidateQueries({ queryKey: ['dirty-counts'] });
      toast({ kind: 'success', title: t('Depo bulundu'), description: updated.path });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Klasör kullanılamadı'), description: errorMessage(error) }),
  });

  const remove = useMutation({
    mutationFn: () => invoke('repo:remove', { id: repo.id }),
    onSuccess: () => {
      setActiveRepo(null);
      void client.invalidateQueries({ queryKey: keys.repos });
    },
  });

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="flex max-w-lg flex-col items-center gap-4">
        <EmptyState
          icon={<FolderX className="size-6 text-warn" />}
          title={t('“{name}” klasörü bulunamadı', { name: repo.name })}
          description={t(
            'En son burada duruyordu. Klasör taşınmış, silinmiş ya da bağlı olmayan bir diskte olabilir.',
          )}
        />

        {/* Yol kısaltılmadan gösteriliyor: kullanıcının nereye bakacağını
            bilmesi için tam yol gerekiyor. */}
        <p className="selectable rounded-md border border-line bg-ground px-3 py-2 text-center font-mono text-[11px] break-all text-ink-2">
          {repo.path}
        </p>

        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" loading={relocate.isPending} onClick={() => relocate.mutate()}>
            <FolderSearch className="size-3.5" />
            {t('Klasörü göster…')}
          </Button>

          {/*
            Yeniden klonlama yalnızca adres biliniyorsa sunuluyor. Adres
            deponun kendi ayarında duruyor ve klasörle birlikte siliniyor;
            uygulama onu daha önce görmüşse kaydetmiş oluyor.
          */}
          {repo.remoteUrl && (
            <Button
              variant="secondary"
              onClick={() => {
                setClonePreset({ url: repo.remoteUrl as string, replacesRepoId: repo.id });
                setCloneOpen(true);
              }}
            >
              {t('Yeniden klonla…')}
            </Button>
          )}

          <Button variant="ghost" loading={remove.isPending} onClick={() => remove.mutate()}>
            <Trash2 className="size-3.5" />
            {t('Listeden kaldır')}
          </Button>
        </div>

        {!repo.remoteUrl && (
          <p className="text-center text-[11px] text-ink-3">
            {t('Bu deponun uzak adresi kayıtlı değil, bu yüzden yeniden klonlanamıyor.')}
          </p>
        )}
      </div>
    </div>
  );
}
