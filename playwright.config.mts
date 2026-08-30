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
  use: {
    trace: 'retain-on-failure',
  },
});
