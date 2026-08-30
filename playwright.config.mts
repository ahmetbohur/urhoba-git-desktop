import { defineConfig } from '@playwright/test';

/**
 * Uçtan uca testler gerçek bir Electron süreci başlatıyor, bu yüzden ayrı bir
 * yapılandırma: Vitest'in kapsamı dışında tutuluyorlar ve `npm run test:e2e`
 * ile çalıştırılıyorlar. Tek işçi kullanıyoruz — testler aynı derlenmiş
 * uygulamayı paylaşıyor ve paralel pencereler birbirinin odağını çalıyor.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  /*
   * Ekran görüntüsü üreten senaryo doğrulama yapmıyor; bir inceleme aracı.
   * Normal koşuda dosya tamamen dışarıda bırakılıyor, `npm run screenshots`
   * ile açılıyor. (Etiket + grepInvert denendi ama config'deki grepInvert
   * komut satırındaki --grep ile çakışıyor ve hiçbir test bulunamıyor.)
   */
  testIgnore: process.env.URHOBA_SCREENSHOTS ? [] : ['**/screenshot.spec.ts'],
  use: {
    trace: 'retain-on-failure',
  },
});
