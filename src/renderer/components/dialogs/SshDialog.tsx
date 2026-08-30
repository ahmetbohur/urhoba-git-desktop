import { useState } from 'react';
import { CheckCircle2, Copy, KeyRound, Plus, XCircle } from 'lucide-react';
import { useT } from '../../i18n';
import { cn } from '../../lib/cn';
import { errorMessage, invoke } from '../../lib/ipc';
import { keys, useMutation, useQueryClient, useSshEnvironment } from '../../lib/queries';
import { useUi } from '../../stores/ui';
import { Badge, Button, SectionLabel, Spinner } from '../primitives';
import { DialogShell, Field, TextInput } from './DialogShell';
import type { SshKey, SshTestResult } from '@shared/types';

/**
 * SSH kurulum yardımcısı.
 *
 * Uygulama anahtar saklamıyor; sistemin ~/.ssh dizinini ve ssh-agent'ını
 * kullanıyor. Buradaki iş üç şeyi görünür kılmak: hangi anahtarların var,
 * agent'a yüklü mü, GitHub bunları kabul ediyor mu.
 */
function KeyCard({ sshKey }: { sshKey: SshKey }) {
  const t = useT();
  const toast = useUi((s) => s.toast);
  const copy = useMutation({
    mutationFn: () => invoke('ssh:copy-public-key', { publicKeyPath: sshKey.publicKeyPath }),
    onSuccess: () =>
      toast({
        kind: 'success',
        title: t('Public key kopyalandı'),
        description: t('GitHub → Settings → SSH and GPG keys → New SSH key ekranına yapıştır.'),
      }),
  });

  return (
    <div className="rounded-lg border border-line bg-ground p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-[12px] text-ink">
            {sshKey.publicKeyPath.split('/').pop()}
          </p>
          <p className="truncate text-[11px] text-ink-3">
            {sshKey.type} {sshKey.comment && `· ${sshKey.comment}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {sshKey.loadedInAgent ? (
            <Badge tone="ok">{t('agent’ta yüklü')}</Badge>
          ) : (
            <Badge tone="warn">{t('agent’ta değil')}</Badge>
          )}
          <Button size="sm" variant="secondary" onClick={() => copy.mutate()}>
            <Copy className="size-3.5" />
            {t('Kopyala')}
          </Button>
        </div>
      </div>
      <p className="selectable mt-2 max-h-16 overflow-y-auto rounded bg-surface-2 p-2 font-mono text-[10px] break-all text-ink-2">
        {sshKey.publicKey}
      </p>
      {sshKey.fingerprint && (
        <p className="mt-1 font-mono text-[10px] text-ink-3">{sshKey.fingerprint}</p>
      )}
    </div>
  );
}

export function SshDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const { data: environment, isLoading } = useSshEnvironment({ enabled: open });
  const client = useQueryClient();
  const toast = useUi((s) => s.toast);

  const [showGenerate, setShowGenerate] = useState(false);
  const [comment, setComment] = useState('');
  const [fileName, setFileName] = useState('id_ed25519_urhoba');
  const [testResult, setTestResult] = useState<SshTestResult | null>(null);

  const generate = useMutation({
    mutationFn: () => invoke('ssh:generate-key', { comment: comment.trim(), fileName }),
    onSuccess: (key) => {
      void client.invalidateQueries({ queryKey: keys.ssh });
      setShowGenerate(false);
      toast({
        kind: 'success',
        title: t('Anahtar üretildi'),
        description: t('{path} — public key’i GitHub hesabına eklemeyi unutma.', {
          path: key.publicKeyPath,
        }),
      });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Anahtar üretilemedi'), description: errorMessage(error) }),
  });

  const test = useMutation({
    mutationFn: () => invoke('ssh:test-github', undefined),
    onSuccess: setTestResult,
  });

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t('SSH kurulumu')}
      description={t('GitHub’a SSH ile bağlanmak için sistemdeki anahtarlar kullanılır. Uygulama hiçbir özel anahtarı kendi saklamaz.')}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => setShowGenerate((value) => !value)}>
            <Plus className="size-3.5" />
            {t('Yeni anahtar')}
          </Button>
          <Button variant="primary" loading={test.isPending} onClick={() => test.mutate()}>
            {t('GitHub bağlantısını sına')}
          </Button>
        </>
      }
    >
      {isLoading || !environment ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {testResult && (
            <div
              className={cn(
                'flex items-start gap-2 rounded-lg p-3 text-[12px]',
                testResult.ok ? 'bg-ok-tint text-ink' : 'bg-crit-tint text-ink',
              )}
            >
              {testResult.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0 text-crit" />
              )}
              <span className="selectable">{testResult.message}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <SectionLabel>{t('ssh-agent')}</SectionLabel>
            {environment.agentRunning ? (
              <Badge tone="ok">{t('çalışıyor')}</Badge>
            ) : (
              <Badge tone="warn">{t('çalışmıyor')}</Badge>
            )}
            {!environment.agentRunning && (
              <span className="text-[11px] text-ink-2">
                {t('Parolalı anahtarlar agent olmadan arka planda kullanılamaz.')}
              </span>
            )}
          </div>

          {showGenerate && (
            <div className="flex flex-col gap-3 rounded-lg border border-accent bg-accent-tint p-3">
              <p className="text-[12px] text-ink">
                {t('Parolasız bir ed25519 anahtarı üretilir ve mümkünse ssh-agent’a eklenir. Parolasız anahtar, arka plandaki otomatik pull’un takılmadan çalışmasını sağlar; anahtar dosyasını koruma sorumluluğu sende.')}
              </p>
              <Field label={t('Etiket')} hint={t('Genelde e-posta adresin — anahtarı tanımana yarar.')}>
                <TextInput
                  value={comment}
                  onChange={setComment}
                  placeholder="ornek@eposta.com"
                  autoFocus
                />
              </Field>
              <Field label={t('Dosya adı')} hint={t('~/.ssh içinde bu adla oluşturulur.')}>
                <TextInput value={fileName} onChange={setFileName} mono />
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowGenerate(false)}>
                  {t('Vazgeç')}
                </Button>
                <Button
                  variant="primary"
                  loading={generate.isPending}
                  disabled={
                    comment.trim().length === 0 ||
                    fileName.trim().length === 0 ||
                    !environment.sshKeygenAvailable
                  }
                  onClick={() => generate.mutate()}
                >
                  {t('Üret')}
                </Button>
              </div>
              {!environment.sshKeygenAvailable && (
                <p className="text-[11px] text-crit">
                  {t('Sistemde ssh-keygen bulunamadı; anahtarı elle üretmen gerekiyor.')}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <SectionLabel>{t('Anahtarlar ({count})', { count: environment.keys.length })}</SectionLabel>
            {environment.keys.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line py-8 text-center">
                <KeyRound className="size-5 text-ink-3" />
                <p className="text-[13px] font-medium text-ink">{t('~/.ssh içinde anahtar yok')}</p>
                <p className="max-w-sm text-[12px] text-ink-2">
                  {t('“Yeni anahtar” ile bir tane üret, public key’i GitHub hesabına ekle, sonra bağlantıyı sına.')}
                </p>
              </div>
            ) : (
              environment.keys.map((key) => <KeyCard key={key.publicKeyPath} sshKey={key} />)
            )}
          </div>
        </div>
      )}
    </DialogShell>
  );
}
