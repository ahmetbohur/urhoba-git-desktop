import { AiError, postJson, type AiClient, type CompletionRequest } from './types';

/**
 * Claude — Anthropic Messages API.
 *
 * Sistem istemi mesaj listesinde değil ayrı bir alanda taşınıyor; bu API'nin
 * diğer ikisinden ayrıldığı yer.
 */

const BASE = 'https://api.anthropic.com/v1';
const API_VERSION = '2023-06-01';

interface ModelsResponse {
  data?: Array<{ id: string }>;
}

interface MessageResponse {
  content?: Array<{ type: string; text?: string }>;
}

export function createAnthropicClient(apiKey: string): AiClient {
  const headers = { 'x-api-key': apiKey, 'anthropic-version': API_VERSION };

  return {
    async listModels() {
      const response = await fetch(`${BASE}/models`, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new AiError('Model listesi alınamadı. API anahtarını kontrol et.');
      }
      const payload = (await response.json()) as ModelsResponse;
      return (payload.data ?? []).map((model) => model.id);
    },

    async complete(request: CompletionRequest, model: string) {
      const payload = await postJson<MessageResponse>(
        `${BASE}/messages`,
        {
          model,
          system: request.system,
          messages: [{ role: 'user', content: request.user }],
          max_tokens: request.maxTokens,
        },
        headers,
      );
      const text = (payload.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('')
        .trim();
      if (!text) throw new AiError('Model boş yanıt döndürdü.', true);
      return text;
    },
  };
}
