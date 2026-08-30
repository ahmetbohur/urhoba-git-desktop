import { useState } from 'react';
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
 * AI sağlayıcı yapılandırması.
 *
 * Sağlayıcı, model ve anahtar hesap düzeyinde: depo başına ayrı model tutmak
 * anahtar yönetimini de ikiye bölerdi ve kullanıcı aynı anahtarı her depoda
 * yeniden girerdi. AI'ın açık olması ile buluta izin verilmesi ise depoya göre
 * değişebiliyor; ikisi de yukarıdaki genel/depo bölümlerinde.
 *
 * Sağlayıcı seçiminde yerel ile bulut arasındaki fark gizlenmiyor, tam tersine
 * ilk görülen şey o: kod nereye gidiyor sorusunun cevabı kartın üstünde yazıyor.
 */

const PROVIDERS: Array<{ id: AiProviderId; label: string; hint: string; local: boolean }> = [
  { id: 'ollama', label: 'Ollama', hint: 'Yerel — kod makineden çıkmaz', local: true },
  { id: 'openai', label: 'OpenAI', hint: 'Bulut — kod dışarı gider', local: false },
  { id: 'anthropic', label: 'Claude', hint: 'Bulut — kod dışarı gider', local: false },
];

export function AiSettingsSection({
  repoSettings,
  globallyEnabled,
}: {
  repoSettings: RepoSettings | null;
  /** Genel varsayılan; sağlayıcı ayarları bununla açılıp kapanıyor. */
  globallyEnabled: boolean;
}) {
  const t = useT();
  const { data: settings } = useSettings();
  const { data: status } = useAiStatus();
  const client = useQueryClient();
  const toast = useUi((s) => s.toast);
  const [apiKey, setApiKey] = useState('');

  const ai = settings?.ai;
  /*
   * Model listesi yalnızca AI herhangi bir yerde açıkken çekiliyor: bu depoda
   * kapalıyken bile sağlayıcıyı ayarlayabilmek gerekiyor, yoksa kullanıcı
   * ayarı yapmak için önce açmak zorunda kalırdı.
   */
  const configuring = globallyEnabled || (repoSettings?.aiEnabled ?? false);
  const { data: models, isLoading: modelsLoading, error: modelsError } = useAiModels(
    configuring && (status?.hasKey ?? false),
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

  if (!ai) return null;

  return (
    <section>
      <SectionLabel>{t('AI sağlayıcısı')}</SectionLabel>
      <p className="mt-1 text-[11px] text-ink-2">
        {t('Sağlayıcı, model ve anahtar bütün depolar için ortak. AI’ın açık olması yukarıdaki bölümlerden ayarlanıyor.')}
      </p>

      {!configuring ? (
        <p className="mt-2 text-[11px] text-ink-3">
          {t('AI yardımı kapalı. Sağlayıcı ayarları açıldığında görünür.')}
        </p>
      ) : (
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
            <div className="rounded-lg border border-warn bg-warn-tint p-2.5">
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
                <Sparkles className="size-3.5 text-warn" />
                {repoSettings?.allowCloudAi
                  ? t('Bu depoda buluta kod gönderilmesine izin verildi')
                  : t('Bu depoda buluta kod gönderilmiyor')}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-2">
                {t('Genel varsayılanı ve bu deponun ayarını yukarıdaki bölümlerden değiştirebilirsin.')}
              </p>
            </div>
          )}

          {status && !status.keysPersisted && ai.provider !== 'ollama' && (
            <p className="text-[11px] text-warn">
              {t('İşletim sisteminde anahtarlık yok; anahtar diske yazılmadı.')}
            </p>
          )}

          {/* Sütun hizalamasında rozet satır boyunca uzamasın diye sarmalanıyor. */}
          {status?.isLocal && (
            <div>
              <Badge tone="ok">{t('kod makineden çıkmıyor')}</Badge>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
