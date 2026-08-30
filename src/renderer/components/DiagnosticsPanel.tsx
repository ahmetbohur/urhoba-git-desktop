import { Copy, FileText } from 'lucide-react';
import { useT } from '../i18n';
import { invoke } from '../lib/ipc';
import { useMutation, useQuery } from '../lib/queries';
import { useUi } from '../stores/ui';
import { Badge, Button, SectionLabel, Spinner } from './primitives';
import type { Diagnostics } from '@shared/types';

/**
 * Tanılama bilgisi.
 *
 * Bir sorun bildirirken ilk sorulan şeyler burada, kopyalanabilir hâlde:
 * hangi sürüm, hangi git, ayarlar nerede. Kullanıcının bunları elle toplaması
 * gerekmiyor.
 */
const ROWS: Array<{ key: keyof Diagnostics; label: string }> = [
  { key: 'appVersion', label: 'Uygulama' },
  { key: 'platform', label: 'Platform' },
  { key: 'gitVersion', label: 'Git' },
  { key: 'electronVersion', label: 'Electron' },
  { key: 'chromeVersion', label: 'Chromium' },
  { key: 'nodeVersion', label: 'Node' },
  { key: 'userDataPath', label: 'Ayar klasörü' },
  { key: 'logPath', label: 'Günlük dosyası' },
];

export function DiagnosticsPanel() {
  const t = useT();
  const toast = useUi((s) => s.toast);
  const { data, isLoading } = useQuery<Diagnostics>({
    queryKey: ['diagnostics'],
    queryFn: () => invoke('app:diagnostics', undefined),
  });

  const openLogs = useMutation({
    mutationFn: () => invoke('app:open-logs', undefined),
  });

  const copyAll = () => {
    if (!data) return;
    const text = ROWS.map((row) => `${row.label}: ${String(data[row.key])}`).join('\n');
    void navigator.clipboard.writeText(text);
    toast({ kind: 'success', title: t('Tanılama bilgisi kopyalandı') });
  };

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <SectionLabel>{t('Tanılama')}</SectionLabel>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => openLogs.mutate()}>
            <FileText className="size-3.5" />
            {t('Günlükleri aç')}
          </Button>
          <Button size="sm" variant="ghost" onClick={copyAll}>
            <Copy className="size-3.5" />
            {t('Kopyala')}
          </Button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        {data.usesEmbeddedGit ? (
          <Badge tone="ok">{t('gömülü git')}</Badge>
        ) : (
          <Badge tone="warn">{t('sistem git’i')}</Badge>
        )}
        <span className="text-[11px] text-ink-2">
          {data.usesEmbeddedGit
            ? t('Uygulama kendi git sürümünü taşıyor; sistemde git kurulu olması gerekmiyor.')
            : t('Gömülü git bulunamadı; sistemde kurulu git kullanılıyor.')}
        </span>
      </div>

      <dl className="mt-2 divide-y divide-line-soft rounded-lg border border-line bg-ground">
        {ROWS.map((row) => (
          <div key={row.key} className="flex gap-3 px-2.5 py-1.5">
            <dt className="w-32 shrink-0 text-[12px] text-ink-2">{t(row.label)}</dt>
            <dd className="selectable min-w-0 flex-1 truncate font-mono text-[11px] text-ink">
              {String(data[row.key])}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
