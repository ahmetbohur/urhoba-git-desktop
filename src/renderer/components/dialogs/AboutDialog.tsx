import { ArrowUpCircle, Check, Code2, ExternalLink, Globe, RefreshCw } from 'lucide-react';
import { useT } from '../../i18n';
import { errorMessage, invoke } from '../../lib/ipc';
import { useMutation, useQuery, useQueryClient, useUpdateStatus } from '../../lib/queries';
import { Badge, Button, SectionLabel, Spinner } from '../primitives';
import { DialogShell } from './DialogShell';
import type { Diagnostics, UpdateStatus } from '@shared/types';
import logoUrl from '../../../../assets/icon.png';

/**
 * Hakkında penceresi.
 *
 * İşletim sisteminin kendi paneli yerine uygulama içinde duruyor: dili ve temayı
 * izliyor, sürüm bilgisinin yanında hangi git'in kullanıldığını da gösteriyor —
 * bir sorun bildirilirken ilk sorulan şey bu.
 */
const REPOSITORY_URL = 'https://github.com/ahmetbohur/urhoba-git-desktop';

/** Geliştiricinin siteleri. İkisi de aynı yeri gösteriyor; ikisi de yazılı. */
const DEVELOPER_SITES = ['urhoba.com', 'urhoba.net'] as const;

/**
 * Sürüm satırı.
 *
 * Hakkında penceresi "hangi sürümdeyim" sorusunun sorulduğu yer; "en yenisi mi"
 * sorusunun cevabı da burada olmalı. Kontrol düğmesi zamanlayıcıyı beklemiyor:
 * kullanıcı açıkça sorduğunda günde bir kuralı geçerli değil.
 */
function UpdateRow() {
  const t = useT();
  const client = useQueryClient();
  const { data: status } = useUpdateStatus();

  const check = useMutation({
    mutationFn: () => invoke('app:update-check', undefined),
    onSuccess: (next: UpdateStatus) => client.setQueryData(['update-status'], next),
  });

  const result = check.data ?? status;

  return (
    <div className="flex flex-col gap-1.5 border-t border-line-soft pt-3">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>{t('Güncelleme')}</SectionLabel>
        <Button size="sm" variant="ghost" loading={check.isPending} onClick={() => check.mutate()}>
          <RefreshCw className="size-3.5" />
          {t('Şimdi kontrol et')}
        </Button>
      </div>

      {check.isError ? (
        <p className="text-[12px] text-crit">{errorMessage(check.error)}</p>
      ) : result?.updateAvailable && result.latestVersion ? (
        <div className="flex items-center gap-2">
          <ArrowUpCircle className="size-4 shrink-0 text-accent-ink" />
          <span className="min-w-0 flex-1 text-[12px] text-ink">
            {t('Sürüm {version} çıktı', { version: result.latestVersion })}
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => result.releaseUrl && window.open(result.releaseUrl, '_blank')}
          >
            {t('İndir')}
            <ExternalLink className="size-3" />
          </Button>
        </div>
      ) : result?.error ? (
        /*
         * Ağ hatası bir arıza değil, "şu an bilinmiyor" demek. Kullanıcı
         * kendisi sorduğu için sessiz geçmiyor; arka plan kontrolünde geçiyor.
         */
        <p className="text-[12px] text-ink-2">
          {t('Kontrol edilemedi: {reason}', { reason: result.error })}
        </p>
      ) : result?.latestVersion ? (
        <p className="flex items-center gap-1.5 text-[12px] text-ink-2">
          <Check className="size-3.5 text-ok" />
          {t('En son sürümü kullanıyorsun.')}
        </p>
      ) : (
        <p className="text-[12px] text-ink-3">{t('Henüz kontrol edilmedi.')}</p>
      )}
    </div>
  );
}

export function AboutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const { data, isLoading } = useQuery<Diagnostics>({
    queryKey: ['diagnostics'],
    queryFn: () => invoke('app:diagnostics', undefined),
    enabled: open,
  });

  return (
    <DialogShell open={open} onOpenChange={onOpenChange} title={t('Hakkında')}>
      {isLoading || !data ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            {/*
              Uygulamanın gerçek ikonu. Paketleyicinin kullandığı dosyanın
              aynısı içe aktarılıyor, kopyası değil: iki yerde duran bir logo
              biri güncellenip diğeri unutulduğunda sessizce ayrışıyor.
            */}
            <img src={logoUrl} alt="" className="size-12 shrink-0" />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-ink">Urhoba Git Desktop</p>
              <p className="text-[12px] text-ink-2">
                {t('Sürüm {version}', { version: data.appVersion })}
              </p>
            </div>
          </div>

          <p className="text-[13px] text-ink-2">
            {t('Depolarını tek pencereden takip eden modern bir masaüstü Git istemcisi.')}
          </p>

          <div className="flex flex-col gap-1.5">
            <SectionLabel>{t('Çalışma ortamı')}</SectionLabel>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={data.usesEmbeddedGit ? 'ok' : 'warn'}>
                {data.usesEmbeddedGit ? t('gömülü git') : t('sistem git’i')}
              </Badge>
              <Badge tone="neutral">{data.gitVersion}</Badge>
              <Badge tone="neutral">Electron {data.electronVersion}</Badge>
              <Badge tone="neutral">{data.platform}</Badge>
            </div>
          </div>

          <UpdateRow />

          <div className="flex flex-col gap-1.5 border-t border-line-soft pt-3">
            <p className="text-[12px] text-ink-2">
              {t('Sorun bildirirken tanılama bilgisini paylaşman işi kolaylaştırır.')}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => window.open(REPOSITORY_URL, '_blank')}>
                <Code2 className="size-3.5" />
                {t('Kaynak kodu')}
                <ExternalLink className="size-3" />
              </Button>
              {DEVELOPER_SITES.map((site) => (
                <Button
                  key={site}
                  variant="secondary"
                  onClick={() => window.open(`https://${site}`, '_blank')}
                >
                  <Globe className="size-3.5" />
                  {site}
                  <ExternalLink className="size-3" />
                </Button>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-ink-3">
            {t('MIT lisansı ile dağıtılır.')} {t('Geliştirici: Urhoba')}
          </p>
        </div>
      )}
    </DialogShell>
  );
}
