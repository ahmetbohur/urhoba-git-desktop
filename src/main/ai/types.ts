/**
 * Dil modeli sağlayıcısı sözleşmesi.
 *
 * Üç sağlayıcının API'leri farklı ama ihtiyacımız aynı: bir istem gönder, bir
 * metin al. GitHub tarafındaki `ForgeProvider` düzeninin aynısı — sağlayıcıya
 * özgü her ayrıntı tek dosyada kalıyor, çağıran taraf hangisinin seçili
 * olduğunu bilmiyor.
 */

export interface CompletionRequest {
  /** Modelin rolünü ve kurallarını anlatan sabit bölüm. */
  system: string;
  /** Asıl istek — diff, depo listesi vb. */
  user: string;
  /** Üretimi sınırlamak için; uzun cevaplar hem yavaş hem pahalı. */
  maxTokens: number;
}

export interface AiClient {
  /** Model listesi; sağlayıcı vermiyorsa boş dizi. */
  listModels(): Promise<string[]>;
  complete(request: CompletionRequest, model: string): Promise<string>;
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

const TIMEOUT_MS = 90_000;

/**
 * Ortak HTTP çağrısı.
 *
 * Zaman aşımı cömert: yerel modeller ilk istekte modeli belleğe yüklüyor ve bu
 * dakikayı bulabiliyor. Sonsuz beklemek yerine sınır koyuyoruz ama sınırı
 * gerçekçi tutuyoruz.
 */
export async function postJson<T>(
  url: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiError('Model zamanında yanıt vermedi.', true);
    }
    throw new AiError('Sağlayıcıya bağlanılamadı. Adres ve bağlantıyı kontrol et.');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let detail = '';
    try {
      detail = JSON.stringify(await response.json()).slice(0, 300);
    } catch {
      /* gövde okunamadı */
    }
    if (response.status === 401 || response.status === 403) {
      throw new AiError('API anahtarı reddedildi. Ayarlardan kontrol et.');
    }
    if (response.status === 429) {
      throw new AiError('İstek sınırına takıldın. Biraz bekleyip tekrar dene.', true);
    }
    throw new AiError(`Sağlayıcı isteği reddetti (HTTP ${response.status}). ${detail}`);
  }

  return (await response.json()) as T;
}
