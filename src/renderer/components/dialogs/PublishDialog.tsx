import { useState } from 'react';
import { Building2, Globe, Lock, Sparkles, User } from 'lucide-react';
import { useT } from '../../i18n';
import { cn } from '../../lib/cn';
import { errorMessage, invoke } from '../../lib/ipc';
import {
  keys,
  useAiStatus,
  useGithubStatus,
  useMutation,
  useQuery,
  useQueryClient,
  useStatus,
} from '../../lib/queries';
import { useUi } from '../../stores/ui';
import { Button, SectionLabel, Spinner } from '../primitives';
import { DialogShell, Field, TextInput } from './DialogShell';
import type { GithubOwner, Repo } from '@shared/types';

/**
 * Yerel bir depoyu GitHub'da yayınlama.
 *
 * Görünürlük iki kart olarak duruyor, bir onay kutusu olarak değil: kodun
 * herkese açık olup olmayacağı geri alması zor bir karar ve ne seçildiği tek
 * bakışta görünmeli. Varsayılan özel — yanlış tarafa düşen varsayılanın bedeli
 * burada asimetrik.
 *
 * Adres olarak SSH kullanılıyor. Uygulama git'i `GIT_TERMINAL_PROMPT=0` ile
 * çalıştırdığı için HTTPS'te parola sorulamıyor ve push sessizce başarısız
 * oluyordu; SSH anahtarı zaten uygulamanın kendi penceresinden yönetiliyor.
 */

/** GitHub'ın kabul etmediği karakterleri temizler; ana süreçteki eşi ile aynı kural. */
function sanitize(input: string): string {
  const map: Record<string, string> = {
    ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i',
    ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u',
  };
  return [...input.trim()]
    .map((character) => map[character] ?? character)
    .join('')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[.-]+/, '')
    .replace(/[.-]+$/, '')
    .slice(0, 100);
}

export function PublishDialog({
  open,
  onOpenChange,
  repo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repo: Repo;
}) {
  const t = useT();
  const client = useQueryClient();
  const toast = useUi((s) => s.toast);
  const { data: auth } = useGithubStatus();
  const { data: status } = useStatus(repo.id);
  const { data: aiStatus } = useAiStatus(repo.id);

  /*
   * Başlangıç değerleri yalnızca ilk render'da hesaplanıyor. Pencere her
   * kapanışta sökülüyor (üst çubuk açıkken monte ediyor), dolayısıyla bir
   * sonraki açılış taze başlıyor ve "önceki deponun adı kaldı" durumu
   * oluşmuyor — bunu bir efektle sıfırlamak gereksiz bir render turu demekti.
   */
  const [name, setName] = useState(() => sanitize(repo.name));
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [owner, setOwner] = useState<string | null>(null);

  const { data: owners, isLoading: ownersLoading } = useQuery<GithubOwner[]>({
    queryKey: ['github-owners'],
    queryFn: () => invoke('github:owners', undefined),
    enabled: open && !!auth?.authenticated,
    retry: false,
  });

  const selectedOwner = owner ?? owners?.[0]?.login ?? null;

  const publish = useMutation({
    mutationFn: () =>
      invoke('github:publish', {
        repoId: repo.id,
        name,
        description: description.trim() || undefined,
        isPrivate,
        owner: selectedOwner as string,
      }),
    onSuccess: (result) => {
      // Remote artık var: uzak sunucu listesi, PR sekmesi ve ahead/behind
      // rozetleri hepsi bu iki sorgudan besleniyor.
      void client.invalidateQueries({ queryKey: keys.remotes(repo.id) });
      void client.invalidateQueries({ queryKey: keys.repoContext(repo.id) });
      void client.invalidateQueries({ queryKey: keys.status(repo.id) });
      toast({
        kind: result.pushed ? 'success' : 'warning',
        title: result.pushed ? t('Yayınlandı') : t('Kısmen tamamlandı'),
        description: result.message,
      });
      if (result.pushed) onOpenChange(false);
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Yayınlanamadı'), description: errorMessage(error) }),
  });

  /*
   * Öneri doğrudan alana yazılıyor, kaydedilmiyor: kullanıcı okuyup
   * düzeltmeden GitHub'a hiçbir şey gitmiyor. Modele neyin verildiği
   * (README mi, yalnızca dosya listesi mi) bildirimde söyleniyor.
   */
  const suggestDescription = useMutation({
    mutationFn: () => invoke('ai:suggest-description', { repoId: repo.id }),
    onSuccess: (suggestion) => {
      setDescription(suggestion.description);
      toast({
        kind: 'success',
        title: t('Öneri hazır'),
        description:
          suggestion.source === 'readme'
            ? t('README’den {count} karakter gönderildi.', {
                count: suggestion.charactersSent,
              })
            : t('README bulunamadı; yalnızca dosya listesi gönderildi.'),
      });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Öneri alınamadı'), description: errorMessage(error) }),
  });

  const branch = status?.branch ?? null;
  const blocker = !auth?.authenticated
    ? t('Önce GitHub hesabına giriş yapmalısın.')
    : status?.isEmptyRepo
      ? t('Depoda hiç commit yok. Önce ilk commit’ini at.')
      : !branch
        ? t('Ayrık HEAD durumunda yayınlanamaz. Önce bir dala geç.')
        : name.length === 0
          ? t('Bir depo adı yaz.')
          : null;

  const VISIBILITY = [
    {
      value: true,
      label: t('Özel'),
      hint: t('Yalnızca sen ve davet ettiklerin görebilir.'),
      icon: Lock,
    },
    {
      value: false,
      label: t('Herkese açık'),
      hint: t('GitHub’daki herkes görebilir.'),
      icon: Globe,
    },
  ];

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t('GitHub’da yayınla')}
      description={t('Depo GitHub’da oluşturulur, origin kurulur ve mevcut dal gönderilir.')}
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('Vazgeç')}
          </Button>
          <Button
            variant="primary"
            data-autofocus
            loading={publish.isPending}
            disabled={!!blocker || !selectedOwner}
            onClick={() => publish.mutate()}
          >
            {t('Yayınla')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {ownersLoading ? (
          <div className="flex justify-center py-2">
            <Spinner />
          </div>
        ) : (owners?.length ?? 0) > 1 ? (
          <div className="flex flex-col gap-1.5">
            <SectionLabel>{t('Hesap')}</SectionLabel>
            <div className="flex flex-wrap gap-1">
              {owners?.map((candidate) => (
                <button
                  key={candidate.login}
                  type="button"
                  onClick={() => setOwner(candidate.login)}
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px]',
                    selectedOwner === candidate.login
                      ? 'border-accent bg-accent-tint text-accent-ink'
                      : 'border-line bg-surface text-ink-2 hover:bg-surface-2',
                  )}
                >
                  {candidate.isOrganization ? (
                    <Building2 className="size-3.5" />
                  ) : (
                    <User className="size-3.5" />
                  )}
                  {candidate.login}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <Field
          label={t('Depo adı')}
          hint={t('GitHub yalnızca harf, rakam, nokta, alt çizgi ve tire kabul ediyor.')}
        >
          <TextInput value={name} onChange={(value) => setName(sanitize(value))} mono />
        </Field>

        <Field label={t('Açıklama')} hint={t('İsteğe bağlı.')}>
          <div className="flex gap-2">
            <TextInput value={description} onChange={setDescription} />
            {aiStatus?.enabled && (
              <Button
                variant="secondary"
                title={t('AI ile açıklama öner')}
                loading={suggestDescription.isPending}
                onClick={() => suggestDescription.mutate()}
              >
                <Sparkles className="size-3.5" />
                {t('Öner')}
              </Button>
            )}
          </div>
        </Field>

        <div className="flex flex-col gap-1.5">
          <SectionLabel>{t('Görünürlük')}</SectionLabel>
          <div className="grid gap-2 sm:grid-cols-2">
            {VISIBILITY.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setIsPrivate(option.value)}
                className={cn(
                  'flex flex-col gap-1 rounded-lg border p-2.5 text-left',
                  isPrivate === option.value
                    ? 'border-accent bg-accent-tint'
                    : 'border-line bg-surface hover:bg-surface-2',
                )}
              >
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                  <option.icon
                    className={cn('size-3.5', option.value ? 'text-ok' : 'text-warn')}
                  />
                  {option.label}
                </span>
                <span className="text-[11px] text-ink-2">{option.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {blocker ? (
          <p className="rounded-md bg-crit-tint px-2.5 py-2 text-[11px] text-ink">{blocker}</p>
        ) : (
          <p className="rounded-md bg-surface-2 px-2.5 py-2 text-[11px] text-ink-2">
            {t('{branch} dalı gönderilecek ve origin şu adrese kurulacak:', {
              branch: branch ?? '',
            })}{' '}
            <span className="font-mono text-ink">
              git@github.com:{selectedOwner ?? '…'}/{name || '…'}.git
            </span>
          </p>
        )}
      </div>
    </DialogShell>
  );
}
