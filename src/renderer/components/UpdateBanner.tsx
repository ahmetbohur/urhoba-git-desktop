import { ArrowUpCircle, X } from 'lucide-react';
import { useT } from '../i18n';
import { invoke } from '../lib/ipc';
import { useMutation, useQueryClient, useUpdateStatus } from '../lib/queries';

/**
 * Yeni sürüm şeridi.
 *
 * Bildirim değil, şerit: güncelleme acil bir şey değil ve kullanıcının o an
 * yaptığı işi bölmemeli. Yeni sürüm yokken hiç çizilmiyor — boş bir "güncelsin"
 * satırı her açılışta yer kaplar ve kimse okumaz.
 *
 * Düğme indirmiyor, yayın sayfasını açıyor. Uygulama kendi paketini kuramaz:
 * Linux'ta bu `dpkg`'nin işi, imzasız macOS/Windows paketlerinde ise Electron'un
 * güncelleyicisi zaten çalışmıyor. Yapamayacağı bir şeyi vaat etmemesi gerek.
 */
export function UpdateBanner() {
  const t = useT();
  const client = useQueryClient();
  const { data } = useUpdateStatus();

  const skip = useMutation({
    mutationFn: (version: string) => invoke('app:update-skip', { version }),
    onSuccess: (status) => client.setQueryData(['update-status'], status),
  });

  if (!data?.updateAvailable || !data.latestVersion) return null;

  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-line bg-accent-tint px-3 py-2">
      <ArrowUpCircle className="size-4 shrink-0 text-accent-ink" />
      <button
        type="button"
        onClick={() => data.releaseUrl && window.open(data.releaseUrl, '_blank')}
        className="min-w-0 flex-1 text-left"
      >
        <span className="block text-[12px] font-medium text-ink">
          {t('Sürüm {version} çıktı', { version: data.latestVersion })}
        </span>
        <span className="block text-[11px] text-ink-2">{t('İndirme sayfasını aç')}</span>
      </button>
      <button
        type="button"
        aria-label={t('Bu sürümü geç')}
        title={t('Bu sürümü geç')}
        onClick={() => skip.mutate(data.latestVersion as string)}
        className="shrink-0 rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
