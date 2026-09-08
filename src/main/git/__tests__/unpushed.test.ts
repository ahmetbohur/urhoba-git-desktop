import { describe, expect, it } from 'vitest';
import { parseUnpushed } from '../parse';

/** `for-each-ref` çıktısındaki bir satır: upstream ve takip özeti. */
const dal = (upstream: string, track = '') => `${upstream}\x1f${track}`;

/**
 * Uzağa gönderilmemiş işin sayımı.
 *
 * Kenar çubuğundaki gösterge buna dayanıyor. Yanlış sayım iki yönde de kötü:
 * eksik sayarsa kullanıcı gönderilmemiş işi göremez, fazla sayarsa gösterge
 * sürekli yanar ve anlamını yitirir.
 */
describe('parseUnpushed', () => {
  it('gönderilmemiş commit’leri topluyor', () => {
    const raw = [
      dal('refs/remotes/origin/main', '[ahead 2]'),
      dal('refs/remotes/origin/yeni', '[ahead 3]'),
    ].join('\n');
    expect(parseUnpushed(raw).commits).toBe(5);
  });

  it('geride olmak gönderilmemiş sayılmıyor', () => {
    // Geride olmak çekilecek iş demek, gönderilecek değil.
    const raw = dal('refs/remotes/origin/main', '[behind 4]');
    expect(parseUnpushed(raw)).toEqual({ commits: 0, branches: 0 });
  });

  it('hem ileri hem geri olan dalda yalnızca ileri sayılıyor', () => {
    const raw = dal('refs/remotes/origin/main', '[ahead 1, behind 2]');
    expect(parseUnpushed(raw).commits).toBe(1);
  });

  it('güncel dal hiçbir şey eklemiyor', () => {
    expect(parseUnpushed(dal('refs/remotes/origin/main'))).toEqual({ commits: 0, branches: 0 });
  });

  it('uzağı takip etmeyen dal, depo uzak kullanıyorsa sayılıyor', () => {
    const raw = [dal('refs/remotes/origin/main'), dal('')].join('\n');
    expect(parseUnpushed(raw).branches).toBe(1);
  });

  it('tamamen yerel depo hiç işaretlenmiyor', () => {
    /*
     * Hiçbir dal uzağı takip etmiyorsa depo bilerek yerel tutuluyor olabilir.
     * İşaretlemek her yerel depoyu uyarıya boğar ve gösterge anlamını yitirir.
     */
    const raw = [dal(''), dal('')].join('\n');
    expect(parseUnpushed(raw)).toEqual({ commits: 0, branches: 0 });
  });

  it('upstream’i silinmiş dal gönderilmemiş sayılıyor', () => {
    // `[gone]`: uzaktaki karşılığı silinmiş; üzerindeki iş artık uzakta yok.
    const raw = [
      dal('refs/remotes/origin/main'),
      dal('refs/remotes/origin/silinmis', '[gone]'),
    ].join('\n');
    expect(parseUnpushed(raw).branches).toBe(1);
  });

  it('boş çıktıda sıfır dönüyor', () => {
    // Commit’i olmayan yeni depo.
    expect(parseUnpushed('')).toEqual({ commits: 0, branches: 0 });
  });
});
