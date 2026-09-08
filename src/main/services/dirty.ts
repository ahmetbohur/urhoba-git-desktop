import { run } from '../git/client';
import { UNPUSHED_FORMAT, parseUnpushed } from '../git/parse';
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
  if (!repo) return { repoId, changes: null, unpushedCommits: null, unpushedBranches: 0 };
  return countFor(repo.id, repo.path);
}

/**
 * Bir deponun kaydedilmemiş ve gönderilmemiş işi; okunamıyorsa null.
 *
 * İki komut birlikte çalışıyor: biri çalışma dizinini, diğeri dalların uzakla
 * farkını okuyor. İkisi de salt okunur ve ölçüldüğünde elli yedi depoda
 * toplamı elli milisaniyenin altında kalıyor.
 */
async function countFor(repoId: string, repoPath: string): Promise<RepoDirtyCount> {
  try {
    return await countUnsafe(repoId, repoPath);
  } catch {
    /*
     * Tek deponun okunamaması bütün taramayı düşürmemeli.
     *
     * `allowFailure` sıfır olmayan çıkış kodunu karşılıyor ama süreç hiç
     * başlamazsa (klasör silinmişse) hata fırlıyor ve `Promise.all` bütün
     * listeyi reddediyordu: bir tane kayıp klasör, elli deponun rozetini
     * birden sessizce yok ediyordu. Okunamayan depo `null` dönüyor, kalanlar
     * sayılmaya devam ediyor.
     */
    return { repoId, changes: null, unpushedCommits: null, unpushedBranches: 0 };
  }
}

async function countUnsafe(repoId: string, repoPath: string): Promise<RepoDirtyCount> {
  const [durum, dallar] = await Promise.all([
    run({
      repoId,
      repoPath,
      args: ['status', '--porcelain', '-uno'],
      skipQueue: true,
      allowFailure: true,
    }),
    run({
      repoId,
      repoPath,
      args: ['for-each-ref', `--format=${UNPUSHED_FORMAT}`, 'refs/heads'],
      skipQueue: true,
      allowFailure: true,
    }),
  ]);

  const gonderilmemis = dallar.ok ? parseUnpushed(dallar.stdout) : null;

  if (!durum.ok) {
    return {
      repoId,
      changes: null,
      unpushedCommits: gonderilmemis?.commits ?? null,
      unpushedBranches: gonderilmemis?.branches ?? 0,
    };
  }

  return {
    repoId,
    changes: durum.stdout.split('\n').filter((line) => line.trim().length > 0).length,
    unpushedCommits: gonderilmemis?.commits ?? null,
    unpushedBranches: gonderilmemis?.branches ?? 0,
  };
}

export async function collectDirtyCounts(): Promise<RepoDirtyCount[]> {
  const repos = store.getRepos();
  return Promise.all(repos.map((repo) => countFor(repo.id, repo.path)));
}
