import { getStatus } from '../git/status';
import { addRemote, getRemotes, push } from '../git/remote';
import * as provider from './provider';
import type { GithubOwner, PublishResult } from '@shared/types';

/**
 * Yerel bir depoyu GitHub'da yayınlama.
 *
 * Sıra şu: depo oluştur → `origin` ekle → dalı upstream kurarak gönder. İlk adım
 * uzak sunucuda kalıcı bir iz bırakıyor, sonraki ikisi yerel ve ağa bağlı.
 * Bu yüzden ön koşullar oluşturmadan önce kontrol ediliyor: kullanıcıyı boş bir
 * GitHub deposuyla baş başa bırakmamak için.
 */

/** GitHub adlarında Türkçe harflerin ASCII karşılığı. */
const TRANSLITERATION: Record<string, string> = {
  ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i',
  ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u',
};

/**
 * Klasör adını GitHub'ın kabul edeceği bir depo adına çevirir.
 *
 * GitHub yalnızca `A-Za-z0-9._-` kabul ediyor. Türkçe harfleri doğrudan tireye
 * çevirmek `şablon` gibi bir adı `-ablon` yapıyordu; okunabilir kalsın diye
 * önce ASCII karşılıklarına dönüştürülüyorlar.
 */
export function sanitizeRepoName(input: string): string {
  const transliterated = [...input.trim()]
    .map((character) => TRANSLITERATION[character] ?? character)
    .join('');

  const replaced = transliterated
    .replace(/[^A-Za-z0-9._-]/g, '-')
    // Arka arkaya gelen ayraçlar tek tireye iniyor: "a  b" → "a-b".
    .replace(/-{2,}/g, '-')
    // Nokta ve tire ile başlayan/biten adları GitHub reddediyor.
    .replace(/^[.-]+/, '')
    .replace(/[.-]+$/, '');

  return replaced.slice(0, 100);
}

interface PublishInput {
  repoId: string;
  repoPath: string;
  name: string;
  description?: string;
  isPrivate: boolean;
  owner: string;
}

/**
 * Yayınlamadan önce sağlanması gereken koşullar.
 *
 * Hepsi oluşturma çağrısından önce bakılıyor. GitHub'ın 403/422 yanıtını alıp
 * sonra açıklamak yerine, engeli baştan söylemek kullanıcıyı yarım kalmış bir
 * durumdan kurtarıyor.
 */
export async function assertPublishable(repoId: string, repoPath: string): Promise<void> {
  const remotes = await getRemotes(repoId, repoPath);
  if (remotes.length > 0) {
    throw new Error(
      'Bu deponun zaten bir uzak sunucusu var. Yayınlamak yerine push edebilirsin.',
    );
  }

  const status = await getStatus(repoId, repoPath);
  if (!status.branch) {
    throw new Error('Ayrık HEAD durumunda yayınlanamaz. Önce bir dala geç.');
  }
  if (status.isEmptyRepo) {
    throw new Error('Depoda hiç commit yok. Önce ilk commit’ini at, sonra yayınla.');
  }
}

/**
 * Token'ın istenen görünürlükte depo açmaya yetip yetmediğini söyler.
 *
 * İnce ayarlı (fine-grained) token'larda yetki başlığı boş geliyor; o durumda
 * kontrol atlanıyor ve karar GitHub'a bırakılıyor. Boş listeyi "yetki yok" diye
 * okumak geçerli bir token'ı reddetmek olurdu.
 */
export function missingScope(scopes: string[], isPrivate: boolean): string | null {
  if (scopes.length === 0) return null;
  if (scopes.includes('repo')) return null;
  if (!isPrivate && scopes.includes('public_repo')) return null;
  return isPrivate ? 'repo' : 'public_repo';
}

export async function publish(input: PublishInput): Promise<PublishResult> {
  await assertPublishable(input.repoId, input.repoPath);

  const auth = await provider.getStatus();
  if (!auth.authenticated || !auth.user) {
    throw new Error('Önce GitHub hesabına giriş yapmalısın.');
  }

  const missing = missingScope(auth.scopes, input.isPrivate);
  if (missing) {
    throw new Error(
      `Bu token ${input.isPrivate ? 'özel' : 'herkese açık'} depo açamaz; \`${missing}\` iznine sahip bir token gerekiyor.`,
    );
  }

  const repo = await provider.createRepo({
    name: input.name,
    description: input.description,
    isPrivate: input.isPrivate,
    owner: input.owner,
    viewerLogin: auth.user.login,
  });

  /*
   * Buradan sonrası başarısız olursa depo GitHub'da kalıyor. Silmiyoruz: silme
   * hem ayrı bir yetki istiyor hem de kullanıcının az önce oluşturduğu şeyi yok
   * etmek demek. Bunun yerine durum olduğu gibi bildiriliyor; kullanıcı push
   * düğmesiyle kaldığı yerden devam edebiliyor.
   */
  await addRemote(input.repoId, input.repoPath, 'origin', repo.sshUrl);

  const pushed = await push(input.repoId, input.repoPath, true);
  if (!pushed.ok) {
    return {
      repo,
      pushed: false,
      message: `Depo oluşturuldu ve origin kuruldu, ama gönderim başarısız: ${pushed.message}`,
    };
  }

  return {
    repo,
    pushed: true,
    message: `${repo.fullName} yayınlandı.`,
  };
}

/** Arayüzün sahip listesini doldurması için. */
export function listOwners(): Promise<GithubOwner[]> {
  return provider.listOwners();
}
