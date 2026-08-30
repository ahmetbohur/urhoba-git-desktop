import { signIn } from './provider';
import { log } from '../services/logger';
import type { DeviceCodeInfo, GithubAuthStatus } from '@shared/types';

/**
 * GitHub cihaz akışı (OAuth 2.0 Device Authorization Grant).
 *
 * Masaüstü uygulaması istemci sırrı saklayamaz: paketi açan herkes onu
 * çıkarabilir. Klasik "authorization code" akışı kodu token'a çevirirken sırrı
 * istiyor ve GitHub'ın OAuth App'leri PKCE desteklemiyor — yani sırrı atlamanın
 * yolu yok. Cihaz akışı tam bu durum için var ve yalnızca herkese açık olması
 * normal olan bir Client ID istiyor.
 *
 * İşleyiş: GitHub'dan bir kullanıcı kodu alınır, kullanıcı bu kodu tarayıcıda
 * girer, uygulama bu sırada token için yoklama yapar.
 */

/** Herkese açık olması tasarım gereği. Çatallayanlar kendi uygulamalarını tanımlayabilsin diye ezilebilir. */
const CLIENT_ID = process.env.URHOBA_GITHUB_CLIENT_ID?.trim() || 'Ov23lieH5KlSHwaKjy3p';

/**
 * `repo` özel depolar, PR açma ve yayınlama için.
 * `read:org` yayınlama penceresindeki organizasyon listesi için — bu yetki
 * olmadan yalnızca üyeliği herkese açık olan organizasyonlar görünüyor.
 */
const SCOPES = 'repo read:org';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const REQUEST_TIMEOUT_MS = 20_000;

interface PendingFlow {
  deviceCode: string;
  intervalMs: number;
  expiresAt: number;
  cancelled: boolean;
}

/**
 * Aynı anda tek bir akış olabilir. Kullanıcı pencereyi kapatıp yeniden açarsa
 * eskisi iptal edilir; iki yoklama döngüsünün aynı anda dönmesi GitHub'ın
 * `slow_down` yanıtını tetikliyor.
 */
let pending: PendingFlow | null = null;

async function postForm(url: string, body: Record<string, string>): Promise<Record<string, string>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Urhoba-Git-Desktop',
      },
      body: new URLSearchParams(body).toString(),
      signal: controller.signal,
    });
    return (await response.json()) as Record<string, string>;
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function cancel(): void {
  if (pending) pending.cancelled = true;
  pending = null;
}

export async function start(): Promise<DeviceCodeInfo> {
  cancel();

  const data = await postForm(DEVICE_CODE_URL, { client_id: CLIENT_ID, scope: SCOPES });

  if (data.error || !data.device_code || !data.user_code) {
    /*
     * En sık karşılaşılan hata bu ve GitHub'ın kendi mesajı ("Device Flow must
     * be explicitly enabled") nereden açılacağını söylemiyor. Kullanıcı
     * uygulamanın bozuk olduğunu sanıyor, oysa tek bir kutu işaretsiz.
     */
    if (data.error === 'device_flow_disabled') {
      throw new Error(
        'OAuth uygulamasında cihaz akışı kapalı. github.com/settings/developers → uygulaman → "Enable Device Flow" kutusunu işaretle.',
      );
    }
    throw new Error(data.error_description ?? 'GitHub cihaz kodu vermedi.');
  }

  const intervalSeconds = Number(data.interval) || 5;
  const expiresInSeconds = Number(data.expires_in) || 900;

  pending = {
    deviceCode: data.device_code,
    intervalMs: intervalSeconds * 1000,
    expiresAt: Date.now() + expiresInSeconds * 1000,
    cancelled: false,
  };

  log('info', 'GitHub cihaz akışı başladı', { expiresInSeconds });

  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri ?? 'https://github.com/login/device',
    expiresInSeconds,
  };
}

/**
 * Kullanıcı tarayıcıda onaylayana kadar bekler.
 *
 * Ağ hatasında vazgeçmiyoruz, yoklamaya devam ediyoruz: akış dakikalarca
 * sürebiliyor ve geçici bir kopma yüzünden kullanıcıyı baştan başlatmak
 * gereksiz. Yalnızca GitHub'ın açıkça bitirdiği durumlarda duruyoruz.
 */
export async function waitForToken(): Promise<GithubAuthStatus> {
  const flow = pending;
  if (!flow) throw new Error('Başlatılmış bir giriş akışı yok.');

  while (!flow.cancelled) {
    await sleep(flow.intervalMs);
    if (flow.cancelled) break;

    if (Date.now() > flow.expiresAt) {
      pending = null;
      throw new Error('Kodun süresi doldu. Yeniden başlatman gerekiyor.');
    }

    let data: Record<string, string>;
    try {
      data = await postForm(TOKEN_URL, {
        client_id: CLIENT_ID,
        device_code: flow.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      });
    } catch {
      continue;
    }

    if (data.access_token) {
      pending = null;
      // Doğrulama ve saklama tek yerde kalsın diye jeton girişiyle aynı yol.
      return signIn(data.access_token);
    }

    switch (data.error) {
      case 'authorization_pending':
        continue;
      case 'slow_down':
        // GitHub çok sık sorulduğunu söylüyor; aralığı beş saniye açıyoruz.
        flow.intervalMs += 5_000;
        continue;
      case 'expired_token':
        pending = null;
        throw new Error('Kodun süresi doldu. Yeniden başlatman gerekiyor.');
      case 'access_denied':
        pending = null;
        throw new Error('GitHub’da izin verilmedi.');
      default:
        pending = null;
        throw new Error(data.error_description ?? 'GitHub girişi tamamlanamadı.');
    }
  }

  throw new Error('Giriş iptal edildi.');
}
