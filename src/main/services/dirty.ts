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
/**
 * Tek deponun sayacı.
 *
 * Bir depo değiştiğinde elli dörtünü birden taramak gereksiz iş: değişen
 * yalnızca biri. Tam tarama ilk açılış ve düzenli tazeleme için duruyor,
 * dosya izleyicisinden gelen değişiklikler buradan geçiyor.
 */
export async function collectDirtyCount(repoId: string): Promise<RepoDirtyCount> {
  const repo = store.findRepo(repoId);
  if (!repo) return { repoId, changes: null };
  return countFor(repo.id, repo.path);
}

/** Bir deponun kaydedilmemiş değişiklik sayısı; okunamıyorsa null. */
async function countFor(repoId: string, repoPath: string): Promise<RepoDirtyCount> {
  const result = await run({
    repoId,
    repoPath,
    args: ['status', '--porcelain', '-uno'],
    skipQueue: true,
    allowFailure: true,
  });
  if (!result.ok) return { repoId, changes: null };
  return {
    repoId,
    changes: result.stdout.split('\n').filter((line) => line.trim().length > 0).length,
  };
}

export async function collectDirtyCounts(): Promise<RepoDirtyCount[]> {
  const repos = store.getRepos();
  return Promise.all(repos.map((repo) => countFor(repo.id, repo.path)));
}
