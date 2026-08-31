import { BrowserWindow, Menu, Notification, Tray, app, nativeImage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { emitAppEvent } from './events';
import { log } from './logger';
import * as store from './store';
import type { LanguagePreference } from '@shared/types';

/**
 * Tepsi simgesi.
 *
 * Uygulamanın arka planda çalışan işleri var: otomatik pull, etkinlik özeti ve
 * sürüm kontrolü. Pencere kapatıldığında Linux ve Windows'ta uygulama tümden
 * kapanıyordu, dolayısıyla üçü de susuyordu — "sistem açılınca başlat" ayarı
 * varken bu tutarsızdı. Tepsi bu boşluğu kapatıyor: pencere kapanıyor,
 * uygulama yaşamaya devam ediyor.
 *
 * Varsayılan açık, çünkü o arka plan işleri ancak böyle anlam kazanıyor. Ama
 * kapatma düğmesinin sessizce anlam değiştirmesi kullanıcıyı yanıltır, bu
 * yüzden ilk gizlenmede bir kez bildirim çıkıyor: uygulamanın kapanmadığını,
 * nereden çıkılacağını ve ayarın nereden kapatılacağını söylüyor.
 *
 * Menü etiketleri burada küçük bir tabloda duruyor, aynı sebeple `menu.ts`
 * öyle yapıyor: çeviri katmanı renderer'da ve süreç sınırından geçmiyor.
 */

const LABELS = {
  show: { tr: 'Pencereyi göster', en: 'Show window' },
  hide: { tr: 'Pencereyi gizle', en: 'Hide window' },
  activity: { tr: 'Etkinlik özeti', en: 'Activity summary' },
  quit: { tr: 'Çıkış', en: 'Quit' },
} satisfies Record<string, Record<LanguagePreference, string>>;

let tray: Tray | null = null;

/**
 * Gerçekten çıkılıyor mu.
 *
 * Kapatma düğmesi pencereyi gizlerken, menüden "Çıkış" gerçekten kapatmalı.
 * `before-quit` bu bayrağı kaldırıyor ve pencere kapanma dinleyicisi ona
 * bakıyor; olmazsa uygulamadan çıkmanın hiçbir yolu kalmıyor.
 */
let quitting = false;

export function isQuitting(): boolean {
  return quitting;
}

export function markQuitting(): void {
  quitting = true;
}

function mainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows().find((window) => !window.isDestroyed()) ?? null;
}

function showWindow(): void {
  const window = mainWindow();
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

/**
 * Tepsi simgesinin görseli.
 *
 * Küçük boyut ayrıca aranıyor: uygulama ikonu 512 piksel ve tepside
 * ölçeklenince bulanıklaşıyor. macOS'ta şablon görsel kullanılıyor — menü
 * çubuğu simgeleri tek renk olmalı, renkli bir simge orada yamalı duruyor ve
 * koyu/açık menü çubuğuna uyum sağlamıyor.
 */
function trayImage(): Electron.NativeImage {
  const candidates = [
    path.join(process.resourcesPath, 'icon-24.png'),
    path.join(app.getAppPath(), 'assets', 'icon-24.png'),
    path.join(process.cwd(), 'assets', 'icon-24.png'),
    path.join(process.resourcesPath, 'icon.png'),
    path.join(app.getAppPath(), 'assets', 'icon.png'),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) return nativeImage.createEmpty();

  const image = nativeImage.createFromPath(found);
  if (process.platform === 'darwin') {
    const small = image.resize({ width: 18, height: 18 });
    small.setTemplateImage(true);
    return small;
  }
  // 512 piksellik uygulama ikonu bulunursa tepside bulanıklaşıyor; her
  // durumda ölçekliyoruz ki hangi dosyanın bulunduğu sonucu değiştirmesin.
  return image.getSize().width > 32 ? image.resize({ width: 22, height: 22 }) : image;
}

function buildContextMenu(language: LanguagePreference): Electron.Menu {
  const label = (key: keyof typeof LABELS) => LABELS[key][language] ?? LABELS[key].tr;
  const window = mainWindow();
  const visible = window?.isVisible() ?? false;

  return Menu.buildFromTemplate([
    {
      label: visible ? label('hide') : label('show'),
      click: () => {
        if (visible) window?.hide();
        else showWindow();
      },
    },
    {
      label: label('activity'),
      click: () => {
        showWindow();
        emitAppEvent({ type: 'activity:open' });
      },
    },
    { type: 'separator' },
    {
      label: label('quit'),
      click: () => {
        markQuitting();
        app.quit();
      },
    },
  ]);
}

/** Menü her açılışta yeniden kuruluyor: "göster/gizle" o anki duruma bağlı. */
function refreshMenu(): void {
  if (!tray) return;
  tray.setContextMenu(buildContextMenu(store.getSettings().language));
}

function create(): void {
  if (tray) return;
  try {
    tray = new Tray(trayImage());
    tray.setToolTip('Urhoba Git Desktop');
    refreshMenu();

    /*
     * Sol tıklama pencereyi getirip götürüyor. macOS'ta bu davranış menü
     * çubuğunda alışılmadık — orada tıklama menüyü açar — o yüzden yalnızca
     * diğer platformlarda bağlanıyor.
     */
    if (process.platform !== 'darwin') {
      tray.on('click', () => {
        const window = mainWindow();
        if (window?.isVisible()) window.hide();
        else showWindow();
      });
    }
  } catch (error) {
    /*
     * Tepsi her masaüstünde yok. Bazı Linux ortamlarında (eklentisiz sade
     * GNOME) simge hiç görünmüyor ya da oluşturma hata veriyor. Uygulamanın
     * açılışını engellememeli; ayar açık kalıyor ama simge çıkmıyor.
     */
    tray = null;
    log('warn', 'Tepsi simgesi oluşturulamadı', { error: String(error) });
  }
}

function destroy(): void {
  tray?.destroy();
  tray = null;
}

/** Ayara göre simgeyi oluşturur ya da kaldırır; ayar değiştiğinde de çağrılıyor. */
export function reconcileTray(): void {
  if (store.getSettings().tray) create();
  else destroy();
  refreshMenu();
}

/**
 * İlk gizlenmede bir kez "kapanmadım, buradayım" der.
 *
 * Bu bildirim varsayılanın açık olmasının bedeli: kullanıcı kapattığını sanıp
 * uygulamayı arka planda unutmasın ve istemiyorsa nereden kapatacağını bilsin.
 * Bir kez gösteriliyor; her kapatmada çıkan bir bildirim kısa sürede
 * bildirimlerin tümünü kapattırır.
 */
function announceOnce(): void {
  if (store.wasTrayNoticeShown()) return;
  store.markTrayNoticeShown();
  if (!Notification.isSupported()) return;

  const language = store.getSettings().language;
  const notification = new Notification({
    title: language === 'en' ? 'Still running' : 'Arka planda çalışıyor',
    body:
      language === 'en'
        ? 'Urhoba keeps running in the tray so background work continues. Quit from the tray menu, or turn this off in settings.'
        : 'Urhoba tepside çalışmaya devam ediyor; arka plandaki işler sürüyor. Çıkmak için tepsi menüsünü kullan ya da ayarlardan kapat.',
  });
  notification.on('click', showWindow);
  notification.show();
}

/**
 * Pencerenin kapatma düğmesini bağlar.
 *
 * Ayar kapalıyken hiçbir şey yapmıyor ve pencere normal şekilde kapanıyor.
 * macOS'ta kapatma zaten uygulamayı sonlandırmıyor, ama pencere yok edilince
 * `activate` ile yeniden kuruluyordu; gizlemek durumu koruduğu için orada da
 * gizleme tercih ediliyor.
 */
export function attachWindow(window: BrowserWindow): void {
  window.on('close', (event) => {
    if (quitting || !store.getSettings().tray) return;
    event.preventDefault();
    window.hide();
    refreshMenu();
    announceOnce();
  });

  // Görünürlük değişince menüdeki "göster/gizle" etiketi güncel kalsın.
  window.on('show', refreshMenu);
  window.on('hide', refreshMenu);
}
