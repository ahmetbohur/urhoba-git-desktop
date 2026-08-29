import { formatDistanceToNowStrict, format, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';

/** "3 dakika önce" — liste satırlarında tam tarihten daha okunur. */
export function relativeTime(iso: string): string {
  if (!iso) return '';
  try {
    return formatDistanceToNowStrict(parseISO(iso), { addSuffix: true, locale: tr });
  } catch {
    return iso;
  }
}

export function absoluteTime(iso: string): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'd MMMM yyyy HH:mm', { locale: tr });
  } catch {
    return iso;
  }
}

/** Uzun yolları ortadan kısaltır: "src/.../dosya.ts" */
export function shortenPath(filePath: string, maxSegments = 3): string {
  const segments = filePath.split('/');
  if (segments.length <= maxSegments) return filePath;
  return `${segments[0]}/…/${segments.slice(-(maxSegments - 1)).join('/')}`;
}

export function fileName(filePath: string): string {
  return filePath.split('/').pop() ?? filePath;
}

export function directoryName(filePath: string): string {
  const segments = filePath.split('/');
  segments.pop();
  return segments.join('/');
}

/** Sayıyı Türkçe binlik ayırıcıyla yazar. */
export function formatCount(value: number): string {
  return new Intl.NumberFormat('tr-TR').format(value);
}
