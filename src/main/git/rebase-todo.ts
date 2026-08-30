import type { RebaseAction, RebaseStep } from '@shared/types';

/**
 * Etkileşimli rebase'in "todo" listesi.
 *
 * Git bu listeyi bir metin dosyasına yazıp editörü açıyor. Biz editör yerine
 * hazır listeyi koyuyoruz, dolayısıyla kullanıcı arayüzde ne seçtiyse git de
 * onu görüyor. Liste üretimi ve doğrulaması burada saf fonksiyon olarak duruyor:
 * yanlış bir liste commit kaybettiriyor, o yüzden git'i hiç çalıştırmadan
 * test edilebilmesi gerekiyor.
 */

/** Todo dosyasında satır başına düşen komut adı. */
const COMMANDS: Record<RebaseAction, string> = {
  pick: 'pick',
  squash: 'squash',
  fixup: 'fixup',
  drop: 'drop',
};

/**
 * Listeyi metne çevirir. Sıra eskiden yeniye — git todo dosyasını böyle
 * okuyor, arayüzdeki sıralama ise tersine (yeni üstte) olduğu için çeviriyi
 * çağıran yapıyor.
 */
export function buildTodo(steps: RebaseStep[]): string {
  const lines = steps
    .filter((step) => step.action !== 'drop')
    .map((step) => `${COMMANDS[step.action]} ${step.sha} ${step.subject}`);

  // Bütün commit'ler atıldıysa git "nothing to do" diyip işlemi iptal ediyor;
  // bu durumu çağıran zaten engelliyor ama dosya da tutarlı kalsın.
  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}

/**
 * Kullanıcının seçimi uygulanabilir mi.
 *
 * Hata mesajı döndürüyor, atmıyor: arayüz bunu "uygula" düğmesinin altında
 * gösterip düğmeyi kapatıyor. Kullanıcıyı git'in İngilizce hatasıyla
 * karşılaştırmak yerine ne yapamayacağını önceden söylüyoruz.
 */
export function validateSteps(steps: RebaseStep[]): string | null {
  if (steps.length === 0) return 'Düzenlenecek commit yok.';

  const kept = steps.filter((step) => step.action !== 'drop');
  if (kept.length === 0) return 'Bütün commit’ler atılıyor; en az biri kalmalı.';

  /*
   * Birleştirme kendinden önceki commit'e ekleniyor. Listenin başındaki bir
   * commit için "önceki" yok — git bu durumda hata verip işlemi yarıda
   * bırakıyor, biz baştan söylüyoruz.
   */
  const first = kept[0];
  if (first.action === 'squash' || first.action === 'fixup') {
    return 'En eski commit bir öncekiyle birleştirilemez; onu “koru” yap.';
  }

  return null;
}
