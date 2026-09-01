import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { cn } from '../lib/cn';
import { KEYBOARD_STEP, LAYOUT_DEFAULTS, clampPaneWidth, type PaneKey } from '../lib/layout';

/**
 * İki bölme arasındaki sürüklenebilir ayırıcı.
 *
 * Genişlik sürükleme boyunca yerel durumda tutuluyor, ayarlara yalnızca fare
 * bırakılınca yazılıyor: her piksel hareketinde diske yazmak ve bütün ayar
 * sorgularını geçersiz kılmak sürüklemeyi tutuklaştırırdı.
 *
 * Çift tıklama o bölmeyi varsayılana döndürüyor. Ayarlardaki genel sıfırlama
 * düğmesi dururken buna da yer verilmesinin sebebi, kullanıcının bozduğu anda
 * elinin altında bir çıkış yolu olması — ayarları açmak zorunda kalmıyor.
 */
export function Splitter({
  pane,
  width,
  available,
  onPreview,
  onCommit,
  label,
}: {
  pane: PaneKey;
  /** O anki uygulanan genişlik. */
  width: number;
  /** Bölmenin paylaştığı toplam genişlik; kırpma buna göre yapılıyor. */
  available: number;
  /** Sürükleme sürerken çağrılıyor; kaydetmiyor. */
  onPreview: (width: number) => void;
  /** Sürükleme bitince çağrılıyor; kalıcı yazma burada. */
  onCommit: (width: number) => void;
  label: string;
}) {
  const t = useT();
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, width: 0 });

  const apply = useCallback(
    (next: number) => clampPaneWidth(pane, next, available),
    [pane, available],
  );

  /*
   * Sürükleme sırasında metin seçimi kapatılıyor. Kapatılmazsa fare bölmelerin
   * üzerinden geçerken dosya adları seçili hâle geliyor ve imleç sürekli
   * değişiyor.
   */
  useEffect(() => {
    if (!dragging) return;
    const previous = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    return () => {
      document.body.style.userSelect = previous;
      document.body.style.cursor = '';
    };
  }, [dragging]);

  /*
   * Sürükleme olayları pencereye bağlanıyor, ayırıcının kendisine değil.
   *
   * İlk hâlinde `setPointerCapture` ile öğeye bağlıydı ve ölçünce görüldü ki
   * fare ayırıcının sekiz piksellik alanından çıkar çıkmaz olaylar başka
   * öğelere gidiyor: doksan piksellik bir sürükleme yirmi üç piksel ilerliyor
   * ve `pointerup` hiç ulaşmadığı için genişlik kaydedilmiyordu. Pencereye
   * bağlamak fare uygulamanın dışına çıksa bile sürüklemeyi sürdürüyor.
   */
  useEffect(() => {
    if (!dragging) return;

    const genislik = (event: PointerEvent) =>
      apply(start.current.width + (event.clientX - start.current.x));

    const onMove = (event: PointerEvent) => onPreview(genislik(event));
    const onUp = (event: PointerEvent) => {
      setDragging(false);
      onCommit(genislik(event));
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    // Sistem sürüklemeyi iptal ederse (pencere odağı kaybı gibi) yarım kalmasın.
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, apply, onPreview, onCommit]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Yalnızca birincil düğme; sağ tık menüsü sürükleme başlatmasın.
    if (event.button !== 0) return;
    event.preventDefault();
    start.current = { x: event.clientX, width };
    setDragging(true);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowLeft: -KEYBOARD_STEP,
      ArrowRight: KEYBOARD_STEP,
    };
    if (event.key in moves) {
      event.preventDefault();
      onCommit(apply(width + moves[event.key]));
      return;
    }
    // Uçlara gitmek klavyeyle de mümkün olsun; kırpma zaten sınırı uyguluyor.
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      onCommit(apply(event.key === 'Home' ? 0 : Number.MAX_SAFE_INTEGER));
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onCommit(apply(LAYOUT_DEFAULTS[pane]))}
      title={t('Sürükleyerek genişliği değiştir, çift tıklayarak sıfırla')}
      /*
       * Görsel olarak ince, tutma alanı geniş: bir piksellik çizgiyi fareyle
       * yakalamak zor. Negatif kenar boşluğu, geniş alanın yerleşimi
       * kaydırmasını engelliyor.
       */
      className={cn(
        'relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize',
        'after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent',
        'hover:after:bg-accent focus-visible:after:bg-accent',
        dragging && 'after:bg-accent',
      )}
    />
  );
}
