import { useState } from 'react';
import { CheckCircle2, ExternalLink, LogOut, ShieldAlert } from 'lucide-react';
import { useT } from '../../i18n';
import { errorMessage, invoke } from '../../lib/ipc';
import { keys, useGithubStatus, useMutation, useQueryClient } from '../../lib/queries';
import { useUi } from '../../stores/ui';
import { Badge, Button, SectionLabel, Spinner } from '../primitives';
import { DialogShell, Field, TextInput } from './DialogShell';

/**
 * GitHub hesabı bağlama.
 *
 * Kişisel erişim jetonu (PAT) ile giriş yapılıyor. OAuth cihaz akışı daha
 * konforlu olurdu ama uygulamaya ait bir OAuth App kaydı gerektiriyor; bunu
 * kullanıcı adına oluşturamayız. Jeton yalnızca ana süreçte tutuluyor,
 * arayüze hiçbir zaman geri gönderilmiyor ve diske işletim sisteminin
 * anahtarlığıyla şifrelenerek yazılıyor.
 */

const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=repo&description=Urhoba%20Git%20Desktop';

export function GithubDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const { data: status, isLoading } = useGithubStatus({ enabled: open });
  const [token, setToken] = useState('');
  const client = useQueryClient();
  const toast = useUi((s) => s.toast);

  const signIn = useMutation({
    mutationFn: () => invoke('github:sign-in', { token: token.trim() }),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: keys.github });
      setToken('');
      toast({
        kind: result.persisted ? 'success' : 'warning',
        title: t('{login} olarak bağlanıldı', { login: result.user?.login ?? '' }),
        description: result.message,
      });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Giriş başarısız'), description: errorMessage(error) }),
  });

  const signOut = useMutation({
    mutationFn: () => invoke('github:sign-out', undefined),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.github });
      toast({ kind: 'info', title: t('GitHub bağlantısı kaldırıldı') });
    },
  });

  const canCreatePulls =
    // Klasik jetonlarda yetki listesi başlıkta gelir; ince ayarlı jetonlarda boş
    // olur, o durumda varsayımda bulunmuyoruz.
    (status?.scopes.length ?? 0) === 0 || (status?.scopes.includes('repo') ?? false);

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t('GitHub bağlantısı')}
      description={t('Pull request’leri görmek ve açmak için bir kişisel erişim jetonu gerekiyor.')}
      width="lg"
    >
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : status?.authenticated && status.user ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-lg border border-line bg-ground p-3">
            <img
              src={status.user.avatarUrl}
              alt=""
              className="size-10 shrink-0 rounded-full border border-line"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-ink">
                {status.user.name ?? status.user.login}
              </p>
              <p className="truncate text-[12px] text-ink-2">@{status.user.login}</p>
            </div>
            <CheckCircle2 className="size-5 shrink-0 text-ok" />
          </div>

          <div className="flex flex-col gap-2">
            <SectionLabel>{t('Jeton durumu')}</SectionLabel>
            <div className="flex flex-wrap items-center gap-2">
              {status.persisted ? (
                <Badge tone="ok">{t('anahtarlıkta şifreli')}</Badge>
              ) : (
                <Badge tone="warn">{t('yalnızca bu oturumda')}</Badge>
              )}
              {status.scopes.length > 0 ? (
                status.scopes.map((scope) => (
                  <Badge key={scope} tone="neutral">
                    {scope}
                  </Badge>
                ))
              ) : (
                <Badge tone="neutral">{t('ince ayarlı jeton')}</Badge>
              )}
            </div>
            {!status.persisted && (
              <p className="text-[11px] text-ink-2">
                {t('İşletim sisteminde anahtarlık bulunamadı. Jetonu korumasız diske yazmak yerine yalnızca bellekte tutuyoruz; uygulama kapanınca yeniden girmen gerekecek.')}
              </p>
            )}
            {!canCreatePulls && (
              <p className="flex items-start gap-1.5 text-[11px] text-warn">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                {t('Jetonda repo yetkisi görünmüyor; özel depoları okumak ve PR açmak için gerekebilir.')}
              </p>
            )}
          </div>

          <div className="flex justify-end border-t border-line-soft pt-3">
            <Button variant="secondary" loading={signOut.isPending} onClick={() => signOut.mutate()}>
              <LogOut className="size-3.5" />
              {t('Bağlantıyı kaldır')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <ol className="flex flex-col gap-2 text-[13px] text-ink-2">
            <li className="flex gap-2">
              <span className="font-mono text-[11px] text-ink-3">1</span>
              <span>
                {t('GitHub’da repo yetkili bir kişisel erişim jetonu oluştur.')}
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-[11px] text-ink-3">2</span>
              <span>{t('Jetonu aşağıya yapıştır.')}</span>
            </li>
          </ol>

          <a
            href={TOKEN_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1.5 text-[12px] font-medium text-accent-ink hover:underline"
          >
            <ExternalLink className="size-3.5" />
            {t('Jeton oluşturma sayfasını aç')}
          </a>

          <Field
            label={t('Kişisel erişim jetonu')}
            hint={t('Jeton yalnızca ana süreçte tutulur ve arayüze hiç aktarılmaz.')}
          >
            <TextInput
              value={token}
              onChange={setToken}
              placeholder="ghp_… veya github_pat_…"
              mono
              autoFocus
            />
          </Field>

          {status?.message && <p className="text-[12px] text-crit">{status.message}</p>}

          <div className="flex justify-end">
            <Button
              variant="primary"
              loading={signIn.isPending}
              disabled={token.trim().length === 0}
              onClick={() => signIn.mutate()}
            >
              {t('Bağlan')}
            </Button>
          </div>
        </div>
      )}
    </DialogShell>
  );
}
