import { Menu, app } from 'electron';
import { emitAppEvent } from './events';
import type { LanguagePreference } from '@shared/types';

/**
 * Uygulama menüsü.
 *
 * Menü ana süreçte kuruluyor, arayüzün çeviri katmanı ise renderer'da; ikisi
 * aynı sözlüğü paylaşamıyor. Menüde yalnızca on yedi etiket olduğu için buraya
 * küçük bir tablo koymak, çeviri altyapısını süreç sınırından geçirmeye
 * çalışmaktan çok daha az kırılgan.
 *
 * Dil değiştiğinde menü yeniden kuruluyor — Electron menüyü canlı
 * güncellemediği için tek yol bu.
 */

const LABELS: Record<string, Record<LanguagePreference, string>> = {
  app: { tr: 'Urhoba', en: 'Urhoba' },
  about: { tr: 'Urhoba Git Desktop Hakkında', en: 'About Urhoba Git Desktop' },
  quit: { tr: 'Çıkış', en: 'Quit' },
  edit: { tr: 'Düzen', en: 'Edit' },
  undo: { tr: 'Geri al', en: 'Undo' },
  redo: { tr: 'Yinele', en: 'Redo' },
  cut: { tr: 'Kes', en: 'Cut' },
  copy: { tr: 'Kopyala', en: 'Copy' },
  paste: { tr: 'Yapıştır', en: 'Paste' },
  selectAll: { tr: 'Tümünü seç', en: 'Select all' },
  view: { tr: 'Görünüm', en: 'View' },
  reload: { tr: 'Yeniden yükle', en: 'Reload' },
  devTools: { tr: 'Geliştirici araçları', en: 'Developer tools' },
  resetZoom: { tr: 'Yakınlaştırmayı sıfırla', en: 'Reset zoom' },
  zoomIn: { tr: 'Yakınlaştır', en: 'Zoom in' },
  zoomOut: { tr: 'Uzaklaştır', en: 'Zoom out' },
  fullscreen: { tr: 'Tam ekran', en: 'Full screen' },
};

export function buildMenu(language: LanguagePreference): void {
  const label = (key: keyof typeof LABELS) => LABELS[key][language] ?? LABELS[key].tr;

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: label('app'),
      submenu: [
        {
          // İşletim sisteminin kendi "hakkında" paneli yerine uygulama içindeki
          // diyaloğu açıyoruz: o panel boş kalıyor, dili ve temayı da izlemiyor.
          label: label('about'),
          click: () => emitAppEvent({ type: 'app:show-about' }),
        },
        { type: 'separator' },
        { role: 'quit', label: label('quit') },
      ],
    },
    {
      label: label('edit'),
      submenu: [
        { role: 'undo', label: label('undo') },
        { role: 'redo', label: label('redo') },
        { type: 'separator' },
        { role: 'cut', label: label('cut') },
        { role: 'copy', label: label('copy') },
        { role: 'paste', label: label('paste') },
        { role: 'selectAll', label: label('selectAll') },
      ],
    },
    {
      label: label('view'),
      submenu: [
        { role: 'reload', label: label('reload') },
        { role: 'toggleDevTools', label: label('devTools') },
        { type: 'separator' },
        { role: 'resetZoom', label: label('resetZoom') },
        { role: 'zoomIn', label: label('zoomIn') },
        { role: 'zoomOut', label: label('zoomOut') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: label('fullscreen') },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  void app;
}
