import { useState } from 'react';
import { Switch } from 'radix-ui';
import { Cloud, HardDrive, Sparkles } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useT } from '../../i18n';
import { errorMessage, invoke } from '../../lib/ipc';
import {
  keys,
  useAiModels,
  useAiStatus,
  useMutation,
  useQueryClient,
  useSettings,
} from '../../lib/queries';
import { useUi } from '../../stores/ui';
import { Badge, Button, SectionLabel, Spinner } from '../primitives';
import { Field, TextInput } from './DialogShell';
import type { AiProviderId, RepoSettings } from '@shared/types';

/**
 * AI ayarları.
 *
 * Sağlayıcı seçiminde yerel ile bulut arasındaki fark gizlenmiyor, tam tersine
 * ilk görülen şey o: kod nereye gidiyor sorusunun cevabı kartın üstünde yazıyor.
 * Bulut seçildiğinde ayrıca depo bazlı bir izin gerekiyor ve o izin burada
 * değil, kullanıldığı depoda veriliyor.
 */

const PROVIDERS: Array<{ id: AiProviderId; label: string; hint: string; local: boolean }> = [
  { id: 'ollama', label: 'Ollama', hint: 'Yerel — kod makineden çıkmaz', local: true },
  { id: 'openai', label: 'OpenAI', hint: 'Bulut — kod dışarı gider', local: false },
  { id: 'anthropic', label: 'Claude', hint: 'Bulut — kod dışarı gider', local: false },
];

export function AiSettingsSection({
  repoId,
  repoSettings,
}: {
  repoId: string;
  repoSettings: RepoSettings | null;
}) {
  const t = useT();
  const { data: settings } = useSettings();
  const { data: status } = useAiStatus();
  const client = useQueryClient();
  const toast = useUi((s) => s.toast);
  const [apiKey, setApiKey] = useState('');

  const ai = settings?.ai;
  const { data: models, isLoading: modelsLoading, error: modelsError } = useAiModels(
    !!ai?.enabled && (status?.hasKey ?? false),
  );

  const refresh = () => {
    void client.invalidateQueries({ queryKey: keys.settings });
    void client.invalidateQueries({ queryKey: ['ai-status'] });
    void client.invalidateQueries({ queryKey: ['ai-models'] });
  };

  const saveAi = useMutation({
    mutationFn: (patch: Partial<NonNullable<typeof ai>>) =>
      invoke('settings:set', { ai: { ...(ai as NonNullable<typeof ai>), ...patch } }),
    onSuccess: refresh,
    onError: (error) =>
      toast({ kind: 'error', title: t('Ayar kaydedilemedi'), description: errorMessage(error) }),
  });

  const saveKey = useMutation({
    mutationFn: () =>
      invoke('ai:set-key', { provider: ai?.provider ?? 'openai', key: apiKey.trim() }),
    onSuccess: (persisted) => {
      setApiKey('');
      refresh();
      toast({
        kind: persisted ? 'success' : 'warning',
        title: t('Anahtar kaydedildi'),
        description: persisted
          ? undefined
          : t('Anahtarlık bulunamadı; anahtar yalnızca bu oturumda geçerli.'),
      });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Anahtar kaydedilemedi'), description: errorMessage(error) }),
  });

  const saveRepo = useMutation({
    mutationFn: (allowCloudAi: boolean) => invoke('settings:repo-set', { repoId, allowCloudAi }),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.repoSettings(repoId) }),
  });

  if (!ai) return null;

  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <SectionLabel>{t('AI yardımı')}</SectionLabel>
          <p className="mt-1 text-[11px] text-ink-2">
            {t('Commit mesajı ve gruplama önerileri. Varsayılan olarak kapalı.')}
          </p>
        </div>
        <Switch.Root
          checked={ai.enabled}
          onCheckedChange={(enabled) => saveAi.mutate({ enabled })}
          className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-surface-3 transition-colors data-[state=checked]:bg-accent"
        >
          <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
        </Switch.Root>
      </div>

      {ai.enabled && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="grid gap-2 sm:grid-cols-3">
            {PROVIDERS.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={() => saveAi.mutate({ provider: provider.id, model: '' })}
                className={cn(
                  'flex flex-col gap-1 rounded-lg border p-2.5 text-left',
                  ai.provider === provider.id
                    ? 'border-accent bg-accent-tint'
                    : 'border-line bg-surface hover:bg-surface-2',
                )}
              >
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                  {provider.local ? (
                    <HardDrive className="size-3.5 text-ok" />
                  ) : (
                    <Cloud className="size-3.5 text-warn" />
                  )}
                  {provider.label}
                </span>
                <span className="text-[11px] text-ink-2">{t(provider.hint)}</span>
              </button>
            ))}
          </div>

          {ai.provider === 'ollama' ? (
            <Field
              label={t('Ollama adresi')}
              hint={t('Ollama kurulu değilse ollama.com adresinden indirebilirsin.')}
            >
              <TextInput
                value={ai.ollamaHost}
                onChange={(value) => saveAi.mutate({ ollamaHost: value })}
                mono
              />
            </Field>
          ) : (
            <Field
              label={t('API anahtarı')}
              hint={t('Anahtar ana süreçte, işletim sistemi anahtarlığında şifreli tutulur.')}
            >
              <div className="flex gap-2">
                <TextInput
                  value={apiKey}
                  onChange={setApiKey}
                  placeholder={status?.hasKey ? t('Kayıtlı — değiştirmek için yaz') : 'sk-…'}
                  mono
                />
                <Button
                  variant="secondary"
                  loading={saveKey.isPending}
                  disabled={apiKey.trim().length === 0}
                  onClick={() => saveKey.mutate()}
                >
                  {t('Kaydet')}
                </Button>
              </div>
            </Field>
          )}

          <div className="flex flex-col gap-1.5">
            <SectionLabel>{t('Model')}</SectionLabel>
            {modelsLoading ? (
              <div className="flex justify-center py-3">
                <Spinner />
              </div>
            ) : modelsError ? (
              <p className="rounded-md bg-crit-tint px-2.5 py-2 text-[11px] text-ink">
                {errorMessage(modelsError)}
              </p>
            ) : (models?.length ?? 0) === 0 ? (
              <p className="text-[11px] text-ink-3">
                {t('Model bulunamadı. Sağlayıcı ayarlarını kontrol et.')}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {models?.slice(0, 24).map((model) => (
                  <button
                    key={model}
                    type="button"
                    onClick={() => saveAi.mutate({ model })}
                    className={cn(
                      'rounded-md border px-2 py-1 font-mono text-[11px]',
                      ai.model === model
                        ? 'border-transparent bg-accent text-white'
                        : 'border-line bg-surface text-ink-2 hover:bg-surface-2',
                    )}
                  >
                    {model}
                  </button>
                ))}
              </div>
            )}
          </div>

          {ai.provider !== 'ollama' && (
            <div className="flex items-start justify-between gap-4 rounded-lg border border-warn bg-warn-tint p-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
                  <Sparkles className="size-3.5 text-warn" />
                  {t('Bu deponun kodu buluta gönderilebilsin')}
                </p>
                <p className="text-[11px] text-ink-2">
                  {t('Commit mesajı önerisi için diff gönderilir. Her depo için ayrı ayrı açılır.')}
                </p>
              </div>
              <Switch.Root
                checked={repoSettings?.allowCloudAi ?? false}
                onCheckedChange={(allowed) => saveRepo.mutate(allowed)}
                className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-surface-3 transition-colors data-[state=checked]:bg-accent"
              >
                <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
              </Switch.Root>
            </div>
          )}

          {status && !status.keysPersisted && ai.provider !== 'ollama' && (
            <p className="text-[11px] text-warn">
              {t('İşletim sisteminde anahtarlık yok; anahtar diske yazılmadı.')}
            </p>
          )}

          {status?.isLocal && <Badge tone="ok">{t('kod makineden çıkmıyor')}</Badge>}
        </div>
      )}
    </section>
  );
}
