import { useCallback, useEffect, useState } from 'react';
import { invoke } from './ipc';
import { keys, useQueryClient, useSettings } from './queries';
import { paneWidth, type PaneKey } from './layout';

/**
 * Bir bölmenin genişliğini ayarlardan okur ve yazar.
 *
 * Sürükleme sırasında yerel bir değer kullanılıyor, ayarlara yalnızca bırakma
 * anında yazılıyor. Her hareket yazsaydı diske yüzlerce kez dokunulur ve ayar
 * sorgusu sürekli geçersiz kılınırdı.
 *
 * Kullanılabilir alan pencereden değil, bölmenin kendi kapsayıcısından
 * ölçülüyor: iç bölmeler pencerenin tamamını değil, kenar çubuğundan geri
 * kalanı paylaşıyor. Pencereyi ölçseydik dar pencerede kırpma gevşek kalırdı.
 */
export function usePane(pane: PaneKey) {
  const { data: settings } = useSettings();
  const client = useQueryClient();
  /*
   * Kapsayıcı ref yerine durumda tutuluyor. Ref döndüren bir kancanın dönüş
   * değerine çizim sırasında erişmek React kurallarını ihlal ediyor; geri
   * çağırma ref'i hem bu sorunu kaldırıyor hem de öğe değiştiğinde gözlemi
   * kendiliğinden yeniliyor.
   */
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [available, setAvailable] = useState(() => window.innerWidth);
  const [preview, setPreview] = useState<number | null>(null);

  useEffect(() => {
    const element = container;
    if (!element) return;
    // Kapsayıcı hem pencere boyutuyla hem de komşu bölmelerle değişiyor;
    // ikisini birden yakalayan tek yol onu doğrudan gözlemlemek.
    const observer = new ResizeObserver(([entry]) => {
      setAvailable(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [container]);

  const stored = settings?.layout?.[pane];
  const width = preview ?? paneWidth(pane, stored, available);

  const commit = useCallback(
    (next: number) => {
      setPreview(null);
      void invoke('settings:set', { layout: { ...(settings?.layout ?? {}), [pane]: next } }).then(
        (updated) => client.setQueryData(keys.settings, updated),
      );
    },
    [client, pane, settings?.layout],
  );

  /*
   * `attach` bir ref değil, geri çağırma. Adı `Ref` ile bitseydi React
   * kuralları onu ref sanıp çizim sırasında erişimi hata sayıyordu.
   */
  return { attach: setContainer, width, available, preview: setPreview, commit };
}
