import type { LfsPointer } from '@shared/types';

/**
 * Git LFS işaretçileri.
 *
 * LFS ile takip edilen bir dosyanın git'teki içeriği dosyanın kendisi değil,
 * üç satırlık bir işaretçi metni. Uygulama bunu bilmediğinde bir görüntüyü
 * açmaya çalışıp bozuk gösteriyor ya da diff'te anlamsız bir metin farkı
 * çiziyordu.
 *
 * Ayrıştırma saf: LFS ikili dosyası kurulu olmasa da işaretçiyi tanıyıp
 * kullanıcıya ne olduğunu söyleyebiliyoruz.
 */

/** İşaretçi dosyaları küçük; bundan büyüğüne hiç bakmıyoruz. */
const MAX_POINTER_BYTES = 1024;

const VERSION_PREFIX = 'version https://git-lfs.github.com/spec/v1';

export function parseLfsPointer(content: Buffer | string): LfsPointer | null {
  const buffer = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  if (buffer.length === 0 || buffer.length > MAX_POINTER_BYTES) return null;

  const text = buffer.toString('utf8');
  if (!text.startsWith(VERSION_PREFIX)) return null;

  /*
   * `oid` her zaman `<algoritma>:<değer>` biçiminde. Algoritmayı ayırmıyoruz;
   * bugün yalnızca sha256 kullanılıyor ve arayüzde gösterilen şey değer.
   */
  const oid = /^oid\s+\S+:(\S+)$/m.exec(text)?.[1];
  const size = /^size\s+(\d+)$/m.exec(text)?.[1];
  if (!oid || !size) return null;

  return { oid, size: Number(size) };
}
