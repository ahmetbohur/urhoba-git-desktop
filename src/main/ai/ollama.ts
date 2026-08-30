import { AiError, postJson, type AiClient, type CompletionRequest } from './types';

/**
 * Ollama — yerel model.
 *
 * Varsayılan sağlayıcı olması bir gizlilik kararı: kod makineden çıkmıyor,
 * ücret yok, internet gerekmiyor. Özel depolarda ve müşteri işlerinde tek
 * güvenli seçenek bu.
 */

const DEFAULT_HOST = 'http://127.0.0.1:11434';

interface TagsResponse {
  models?: Array<{ name: string }>;
}

interface GenerateResponse {
  response?: string;
}

export function createOllamaClient(host = DEFAULT_HOST): AiClient {
  const base = host.replace(/\/+$/, '');

  return {
    async listModels() {
      try {
        const response = await fetch(`${base}/api/tags`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return [];
        const payload = (await response.json()) as TagsResponse;
        return (payload.models ?? []).map((model) => model.name);
      } catch {
        // Ollama kurulu değil ya da çalışmıyor; arayüz bunu boş listeden anlıyor.
        throw new AiError(
          'Ollama’ya ulaşılamadı. Kurulu ve çalışıyor olduğundan emin ol (varsayılan adres 127.0.0.1:11434).',
        );
      }
    },

    async complete(request: CompletionRequest, model: string) {
      const payload = await postJson<GenerateResponse>(
        `${base}/api/generate`,
        {
          model,
          system: request.system,
          prompt: request.user,
          stream: false,
          options: { num_predict: request.maxTokens, temperature: 0.2 },
        },
        {},
      );
      const text = payload.response?.trim();
      if (!text) throw new AiError('Model boş yanıt döndürdü.', true);
      return text;
    },
  };
}
