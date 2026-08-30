import { formatDistanceToNowStrict, format, parseISO } from 'date-fns';
import { enUS, tr } from 'date-fns/locale';
import type { LanguagePreference } from '@shared/types';

/**
 * Tarih biçimlendirme dile bağlı.
 *
 * Etkin dil modül düzeyinde tutuluyor: tarih yardımcıları arayüzün her yerinde,
 * çoğu zaman React bağlamına erişemeyen yerlerde çağrılıyor. Dil değiştiğinde
 * kök bileşen bunu bir kez güncelliyor.
 */
let activeLanguage: LanguagePreference = 'tr';

export function setFormatLanguage(language: LanguagePreference): void {
  activeLanguage = language;
}

function locale() {
  return activeLanguage === 'en' ? enUS : tr;
}

/** "3 dakika önce" — liste satırlarında tam tarihten daha okunur. */
export function relativeTime(iso: string): string {
  if (!iso) return '';
  try {
    return formatDistanceToNowStrict(parseISO(iso), { addSuffix: true, locale: locale() });
  } catch {
    return iso;
  }
}

export function absoluteTime(iso: string): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'd MMMM yyyy HH:mm', { locale: locale() });
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

/** Sayıyı etkin dilin binlik ayırıcısıyla yazar. */
export function formatCount(value: number): string {
  return new Intl.NumberFormat(activeLanguage === 'en' ? 'en-US' : 'tr-TR').format(value);
}

/**
 * Bayt sayısını okunur bir boyuta çevirir.
 *
 * Tek ondalık basamak yeterli: kullanıcı burada büyüklük mertebesine bakıyor,
 * tam sayıya değil.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
