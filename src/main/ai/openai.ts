import { AiError, postJson, type AiClient, type CompletionRequest } from './types';

/** OpenAI sohbet tamamlama API'si. */

const BASE = 'https://api.openai.com/v1';

interface ModelsResponse {
  data?: Array<{ id: string }>;
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export function createOpenAiClient(apiKey: string): AiClient {
  const headers = { Authorization: `Bearer ${apiKey}` };

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
      // Listede yüzlerce model var; metin üretenler işimize yarıyor.
      return (payload.data ?? [])
        .map((model) => model.id)
        .filter((id) => id.startsWith('gpt-') || id.startsWith('o'))
        .sort();
    },

    async complete(request: CompletionRequest, model: string) {
      const payload = await postJson<ChatResponse>(
        `${BASE}/chat/completions`,
        {
          model,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
          max_completion_tokens: request.maxTokens,
        },
        headers,
      );
      const text = payload.choices?.[0]?.message?.content?.trim();
      if (!text) throw new AiError('Model boş yanıt döndürdü.', true);
      return text;
    },
  };
}
