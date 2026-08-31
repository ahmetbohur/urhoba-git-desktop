import { useState } from 'react';
import { ArrowDownToLine, GitCommitHorizontal, Inbox, Sparkles } from 'lucide-react';
import { useT } from '../../i18n';
import { cn } from '../../lib/cn';
import { relativeTime } from '../../lib/format';
import { errorMessage, invoke } from '../../lib/ipc';
import { useAiStatus, useMutation, useQuery, useSettings } from '../../lib/queries';
import { useUi } from '../../stores/ui';
import { Button, EmptyState, SectionLabel, Spinner } from '../primitives';
import { DialogShell } from './DialogShell';
import type {
  ActivityCommit,
  ActivityDigest,
  ActivityPeriod,
  ActivitySummary,
} from '@shared/types';

/**
 * Etkinlik özeti.
 *
 * "Yazdıkların" ile "gelenler" ayrı duruyor ve bu ayrım özelliğin özü:
 * başkasının üç gün önce yazdığı ama bugün çektiğin bir commit bugünün
 * özetine giriyor. Yazma tarihine bakan bir liste bunu kaçırırdı.
 *
 * Aralık ayarlardan geliyor ama burada da değiştirilebiliyor: varsayılan
 * günlük ritmi anlatıyor, o an "son haftaya" bakmak istemek ayarı değiştirmeyi
 * gerektirmemeli.
 */

const PERIODS: Array<{ value: ActivityPeriod; label: string }> = [
  { value: '1h', label: '1 saat' },
  { value: '6h', label: '6 saat' },
  { value: '24h', label: '24 saat' },
  { value: '7d', label: '7 gün' },
];

function CommitRow({ commit }: { commit: ActivityCommit }) {
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="shrink-0 font-mono text-[11px] text-ink-3">{commit.shortSha}</span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{commit.subject}</span>
      <span className="shrink-0 text-[11px] text-ink-3">{relativeTime(commit.authoredAt)}</span>
    </div>
  );
}

export function ActivityDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const { data: settings } = useSettings();
  const [period, setPeriod] = useState<ActivityPeriod | null>(null);
  const active = period ?? settings?.activityPeriod ?? '24h';

  const { data: aiStatus } = useAiStatus();
  const toast = useUi((s) => s.toast);
  const [digest, setDigest] = useState<ActivityDigest | null>(null);

  /*
   * AI özeti üstüne binen bir katman, özelliğin kendisi değil: ham liste zaten
   * faydalı ve AI kapalıyken pencere boş kalmamalı.
   */
  const summarize = useMutation({
    mutationFn: () => invoke('ai:summarize-activity', { period: active }),
    onSuccess: setDigest,
    onError: (error) =>
      toast({ kind: 'error', title: t('Özet alınamadı'), description: errorMessage(error) }),
  });

  const { data, isFetching } = useQuery<ActivitySummary>({
    queryKey: ['activity', active],
    queryFn: () => invoke('activity:summary', { period: active }),
    enabled: open,
    // Elli depoyu taramak pahalı; pencere kapanıp açılınca yeniden taramasın.
    staleTime: 60_000,
  });

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t('Etkinlik özeti')}
      description={t('Bütün depolarında bu aralıkta ne yazdın, ne indi.')}
      width="lg"
    >
      <div className="flex flex-col gap-3">
        <div className="flex gap-1">
          {PERIODS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setPeriod(option.value);
                // Aralık değişince eski özet artık başka bir şeyi anlatıyor.
                setDigest(null);
              }}
              className={cn(
                'h-7 flex-1 rounded-md border text-[12px]',
                active === option.value
                  ? 'border-accent bg-accent-tint text-accent-ink'
                  : 'border-line bg-surface text-ink-2 hover:bg-surface-2',
              )}
            >
              {t(option.label)}
            </button>
          ))}
        </div>

        {isFetching && !data ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : !data || data.repos.length === 0 ? (
          <EmptyState
            icon={<Inbox className="size-5" />}
            title={t('Hareket yok')}
            description={t('Bu aralıkta hiçbir depoda commit yazılmamış ve indirilmemiş.')}
          />
        ) : (
          <>
            <div className="flex gap-4 rounded-lg border border-line bg-ground px-3 py-2">
              <span className="flex items-center gap-1.5 text-[12px] text-ink">
                <GitCommitHorizontal className="size-3.5 text-accent-ink" />
                {t('{count} commit yazdın', { count: data.authoredCount })}
              </span>
              <span className="flex items-center gap-1.5 text-[12px] text-ink">
                <ArrowDownToLine className="size-3.5 text-ok" />
                {t('{count} commit indi', { count: data.arrivedCount })}
              </span>
              <span className="ml-auto text-[11px] text-ink-3">
                {t('{count} depo', { count: data.repos.length })}
              </span>
            </div>

            {aiStatus?.enabled && (
              <div className="flex flex-col gap-2">
                {digest ? (
                  <div className="rounded-lg border border-accent bg-accent-tint px-3 py-2">
                    <p className="text-[12px] leading-relaxed whitespace-pre-wrap text-ink">
                      {digest.text}
                    </p>
                    <p className="mt-1.5 text-[11px] text-ink-2">
                      {t('{count} commit gönderildi.', { count: digest.commitsSent })}
                      {digest.excludedRepos > 0 &&
                        ` ${t('{count} depo bulut AI’ya kapalı olduğu için dışarıda bırakıldı.', {
                          count: digest.excludedRepos,
                        })}`}
                    </p>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    loading={summarize.isPending}
                    onClick={() => summarize.mutate()}
                  >
                    <Sparkles className="size-3.5" />
                    {t('AI ile özetle')}
                  </Button>
                )}
              </div>
            )}

            <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
              {data.repos.map((repo) => (
                <div key={repo.repoId} className="rounded-lg border border-line px-3 py-2">
                  <p className="text-[13px] font-semibold text-ink">{repo.repoName}</p>

                  {repo.authored.length > 0 && (
                    <div className="mt-1.5">
                      <SectionLabel>{t('Yazdıkların')}</SectionLabel>
                      {repo.authored.map((commit) => (
                        <CommitRow key={commit.sha} commit={commit} />
                      ))}
                    </div>
                  )}

                  {/*
                    Uzak sunucusu olmayan depoda bu bölüm hiç yok — boş bir
                    başlık göstermek "bir şey eksik" izlenimi veriyor.
                  */}
                  {repo.hasRemote && repo.arrived.length > 0 && (
                    <div className="mt-1.5">
                      <SectionLabel>{t('Gelenler')}</SectionLabel>
                      {repo.arrived.map((commit) => (
                        <div key={commit.sha} className="flex items-baseline gap-2">
                          <span className="min-w-0 flex-1">
                            <CommitRow commit={commit} />
                          </span>
                          <span className="shrink-0 text-[11px] text-ink-3">
                            {commit.authorName}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </DialogShell>
  );
}
