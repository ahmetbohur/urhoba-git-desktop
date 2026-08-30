import { defineConfig } from 'vite';
import path from 'node:path';

// Ana süreç derlemesi.
//
// chokidar bundle ediliyor: ESM-only olduğu için `require` ile yüklenemezdi,
// Vite onu CJS'e çeviriyor.
//
// dugite de bundle ediliyor. Gömülü git ikilisinin yerini kendi `__dirname`
// tahminiyle bulmaya çalışıyor ama bundle edilmiş kodda o tahmin yanlış çıkar;
// bu yüzden yolu ana süreçte `LOCAL_GIT_DIRECTORY` ile açıkça bildiriyoruz.
export default defineConfig({
  build: {
    rollupOptions: {
      // Ana süreç ve preload aynı `.vite/build` klasörüne yazıyor; ikisinin de
      // giriş dosyası `index.ts` olduğu için çıktı adlarını açıkça belirlemezsek
      // biri diğerini eziyor.
      output: { entryFileNames: 'main.js' },
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, 'src/shared'),
      '@main': path.resolve(import.meta.dirname, 'src/main'),
    },
  },
});
