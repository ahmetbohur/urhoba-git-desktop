import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, 'src/shared'),
      '@main': path.resolve(import.meta.dirname, 'src/main'),
      '@renderer': path.resolve(import.meta.dirname, 'src/renderer'),
      // Git modülleri olay yayınlamak için electron'u import ediyor; testte
      // yerine boş bir modül koyuyoruz ki gerçek depolara karşı çalışabilelim.
      electron: path.resolve(import.meta.dirname, 'src/test/electron-stub.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
    // Entegrasyon testleri gerçek git süreçleri çalıştırıyor; varsayılan 5 sn
    // yavaş diskte yetmiyor.
    testTimeout: 30_000,
  },
});
