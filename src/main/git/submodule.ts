import { run } from './client';
import type { Submodule } from '@shared/types';

/**
 * Alt modüller.
 *
 * Alt modülü olan bir depoda klonlamadan sonra klasörler boş geliyor ve
 * kullanıcı "dosyalar nerede" diye kalıyor. Burada hangi alt modüllerin
 * kurulu olmadığı görünür kılınıyor ve tek düğmeyle kuruluyor.
 */

/**
 * `git submodule status` satır biçimi:
 *
 *     -<sha> <yol>            kurulmamış
 *      <sha> <yol> (etiket)   kurulu ve güncel
 *     +<sha> <yol> (etiket)   kurulu ama farklı bir commit'te
 *     U<sha> <yol>            çakışma
 *
 * Baştaki işaret satırın ilk karakteri; yokluğu (boşluk) "her şey yolunda"
 * demek. Ayrıştırma saf olsun diye komuttan ayrı duruyor.
 */
export function parseSubmoduleStatus(raw: string): Submodule[] {
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const marker = line[0];
      const rest = line.slice(1);
      const [sha, ...pathParts] = rest.split(' ');
      // Ad sonundaki "(v1.2)" gibi açıklama yola dahil değil.
      const path = pathParts.join(' ').replace(/\s*\([^)]*\)\s*$/, '').trim();
      return {
        path,
        sha: sha ?? '',
        initialized: marker !== '-',
        outOfDate: marker === '+',
        conflicted: marker === 'U',
      };
    })
    .filter((entry) => entry.path.length > 0);
}

export async function listSubmodules(repoId: string, repoPath: string): Promise<Submodule[]> {
  const { stdout } = await run({
    repoId,
    repoPath,
    args: ['submodule', 'status'],
    skipQueue: true,
    // Alt modülü olmayan depoda komut boş dönüyor; hata değil.
    allowFailure: true,
  });
  return parseSubmoduleStatus(stdout);
}

/**
 * Kurulmamış alt modülleri getirir ve günceller.
 *
 * `--init` olmadan komut kurulmamış olanları atlıyor ve kullanıcı hiçbir şey
 * olmamış gibi görüyor.
 */
export async function updateSubmodules(repoId: string, repoPath: string): Promise<void> {
  await run({
    repoId,
    repoPath,
    args: ['submodule', 'update', '--init', '--recursive'],
  });
}
