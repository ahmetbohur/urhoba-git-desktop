import { loadToken } from './auth';

/**
 * GitHub REST istemcisi.
 *
 * Bütün istekler ana süreçten çıkıyor: token arayüze hiç ulaşmadığı gibi,
 * renderer'ın içerik güvenlik politikası da dış ağa kapalı kalabiliyor.
 */

const API_BASE = 'https://api.github.com';
const TIMEOUT_MS = 20_000;

export class GithubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GithubApiError';
  }
}

/** HTTP durum kodunu kullanıcının okuyabileceği bir cümleye çevirir. */
export function describeStatus(status: number, apiMessage: string | undefined): string {
  switch (status) {
    case 401:
      return 'GitHub token’ı geçersiz ya da süresi dolmuş. Yeniden giriş yapman gerekiyor.';
    case 403:
      return apiMessage?.includes('rate limit')
        ? 'GitHub istek sınırına takıldın. Bir süre sonra tekrar dene.'
        : 'Bu işlem için yetkin yok. Token’ın `repo` iznine sahip olduğundan emin ol.';
    case 404:
      return 'GitHub’da bulunamadı. Depo özel ise token’ın erişimi olmayabilir.';
    case 422:
      return apiMessage ?? 'GitHub isteği reddetti; alanları kontrol et.';
    default:
      return apiMessage ?? `GitHub isteği başarısız oldu (HTTP ${status}).`;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Token gerektirmeyen çağrılar yok; yine de açıkça belirtiyoruz. */
  token?: string;
}

export async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const token = options.token ?? loadToken();
  if (!token) {
    throw new GithubApiError('GitHub hesabına giriş yapılmamış.', 401);
  }

  // Ağ takılırsa arayüz sonsuza kadar beklemesin.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Urhoba-Git-Desktop',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new GithubApiError('GitHub yanıt vermedi; bağlantını kontrol et.', 0);
    }
    throw new GithubApiError('GitHub’a bağlanılamadı; internet bağlantını kontrol et.', 0);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let apiMessage: string | undefined;
    try {
      const payload = (await response.json()) as { message?: string };
      apiMessage = payload.message;
    } catch {
      // Gövde JSON değilse durum kodu tek başına yeterli.
    }
    throw new GithubApiError(describeStatus(response.status, apiMessage), response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Token doğrulaması: kimlik ve yetkileri tek istekte döner. */
export async function fetchViewer(
  token: string,
): Promise<{ user: RawUser; scopes: string[] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Urhoba-Git-Desktop',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      let apiMessage: string | undefined;
      try {
        apiMessage = ((await response.json()) as { message?: string }).message;
      } catch {
        /* gövde okunamadı */
      }
      throw new GithubApiError(describeStatus(response.status, apiMessage), response.status);
    }
    // Klasik token'larda yetkiler bu başlıkta gelir; ince ayarlı (fine-grained)
    // token'larda başlık boş olur, o yüzden eksikliği hata saymıyoruz.
    const scopes = (response.headers.get('x-oauth-scopes') ?? '')
      .split(',')
      .map((scope) => scope.trim())
      .filter((scope) => scope.length > 0);
    return { user: (await response.json()) as RawUser, scopes };
  } catch (error) {
    if (error instanceof GithubApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new GithubApiError('GitHub yanıt vermedi; bağlantını kontrol et.', 0);
    }
    throw new GithubApiError('GitHub’a bağlanılamadı; internet bağlantını kontrol et.', 0);
  } finally {
    clearTimeout(timer);
  }
}

export interface RawUser {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
}
