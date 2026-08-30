import { run } from '../git/client';
import * as store from './store';
import type { RepoDirtyCount } from '@shared/types';

/**
 * Bütün depoların kaydedilmemiş değişiklik sayısı.
 *
 * Grup başlıkları "burada işin var" rozetini bu sayıdan alıyor. Depo başına tek
 * bir hafif komut çalışıyor: `--porcelain` çıktısının satır sayısı. Takip
 * edilmeyen dosyalar sayılmıyor (`-uno`) çünkü build çıktısı ve geçici dosyalar
 * rozeti sürekli yanıltıcı biçimde yakardı.
 *
 * Komutlar depo sırasına girmiyor: hepsi salt okunur ve farklı depolarda
 * çalışıyorlar, birbirlerini beklemeleri için sebep yok. Erişilemeyen depo
 * (silinmiş klasör, bozuk kayıt) null döner ve rozet gösterilmez.
 */
export async function collectDirtyCounts(): Promise<RepoDirtyCount[]> {
  const repos = store.getRepos();
  return Promise.all(
    repos.map(async (repo): Promise<RepoDirtyCount> => {
      const result = await run({
        repoId: repo.id,
        repoPath: repo.path,
        args: ['status', '--porcelain', '-uno'],
        skipQueue: true,
        allowFailure: true,
      });
      if (!result.ok) return { repoId: repo.id, changes: null };
      const changes = result.stdout.split('\n').filter((line) => line.trim().length > 0).length;
      return { repoId: repo.id, changes };
    }),
  );
}
