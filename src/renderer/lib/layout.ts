/**
 * Ayarlanabilir bölme genişlikleri.
 *
 * Hesap saf tutuluyor: yanlış kırpma sessiz kalıyor — hata çıkmıyor, sadece
 * bir bölme ekrandan kayboluyor ya da geri getirilemiyor. Sürükleme kodundan
 * ayrı durduğu için fare olmadan test edilebiliyor.
 */

export type PaneKey = 'sidebar' | 'changesFiles' | 'historyCommits';

export const LAYOUT_DEFAULTS: Record<PaneKey, number> = {
  sidebar: 256,
  changesFiles: 320,
  historyCommits: 384,
};

/**
 * Bölme başına alt ve üst sınır.
 *
 * Alt sınır içeriğin okunabilir kaldığı en dar genişlik; altına inince depo
 * adları ve dosya yolları tümüyle kırpılıyor ve bölme işlevsizleşiyor.
 */
const LIMITS: Record<PaneKey, { min: number; max: number }> = {
  sidebar: { min: 180, max: 480 },
  changesFiles: { min: 220, max: 640 },
  historyCommits: { min: 260, max: 720 },
};

/**
 * Bölmenin yanında kalması gereken en az alan.
 *
 * Üst sınır tek başına yetmiyor: dar bir pencerede 480 piksellik kenar çubuğu
 * bile geri kalanı yok edebiliyor. Kullanıcının kendini köşeye sıkıştırmasını
 * asıl engelleyen kısıt bu.
 */
const MIN_REMAINING = 380;

/**
 * Bir bölmenin uygulanabilir genişliği.
 *
 * `available` o bölmenin paylaştığı toplam genişlik: kenar çubuğu için pencere,
 * iç bölmeler için pencereden kenar çubuğu düşülmüş hâli.
 *
 * Kırpma hem sürüklerken hem de okurken çalışıyor. Yalnızca sürüklerken
 * kırpmak yetmezdi: kullanıcı geniş pencerede bölmeyi büyütüp pencereyi
 * küçültünce kayıtlı değer geri kalan alanı yutardı.
 */
export function clampPaneWidth(pane: PaneKey, value: number, available: number): number {
  const { min, max } = LIMITS[pane];

  /*
   * Pencere gerçekten dar olduğunda (min + MIN_REMAINING sığmıyorsa) alt sınırı
   * korumak, geri kalanı sıfıra indirmekten iyi: bölmeyi okunabilir bırakıp
   * taşmayı tarayıcının kendi düzenine bırakıyoruz.
   */
  const roomLimited = Math.max(min, available - MIN_REMAINING);
  const upper = Math.min(max, roomLimited);

  if (!Number.isFinite(value)) return LAYOUT_DEFAULTS[pane];
  return Math.round(Math.min(Math.max(value, min), Math.max(min, upper)));
}

/** Kayıtlı değer yoksa ya da bozuksa varsayılana düşer. */
export function paneWidth(
  pane: PaneKey,
  stored: number | undefined,
  available: number,
): number {
  return clampPaneWidth(pane, stored ?? LAYOUT_DEFAULTS[pane], available);
}

/** Ayırıcının klavyeyle taşındığı adım. */
export const KEYBOARD_STEP = 16;
