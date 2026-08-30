import { Code2, ExternalLink } from 'lucide-react';
import { useT } from '../../i18n';
import { invoke } from '../../lib/ipc';
import { useQuery } from '../../lib/queries';
import { Badge, Button, SectionLabel, Spinner } from '../primitives';
import { DialogShell } from './DialogShell';
import type { Diagnostics } from '@shared/types';
import logoUrl from '../../../../assets/icon.png';

/**
 * Hakkında penceresi.
 *
 * İşletim sisteminin kendi paneli yerine uygulama içinde duruyor: dili ve temayı
 * izliyor, sürüm bilgisinin yanında hangi git'in kullanıldığını da gösteriyor —
 * bir sorun bildirilirken ilk sorulan şey bu.
 */
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
            <img
              src={logoUrl}
              alt=""
              className="size-12 shrink-0"
            />
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

          <div className="flex flex-col gap-1.5 border-t border-line-soft pt-3">
            <p className="text-[12px] text-ink-2">
              {t('Sorun bildirirken tanılama bilgisini paylaşman işi kolaylaştırır.')}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => window.open('https://github.com/urhoba/urhoba-git-desktop', '_blank')}
              >
                <Code2 className="size-3.5" />
                {t('Kaynak kodu')}
                <ExternalLink className="size-3" />
              </Button>
            </div>
          </div>

          <p className="text-[11px] text-ink-3">{t('MIT lisansı ile dağıtılır.')}</p>
        </div>
      )}
    </DialogShell>
  );
}
