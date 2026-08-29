import { defineConfig } from 'vite';
import path from 'node:path';

// Ana süreç derlemesi.
//
// Bağımlılıkları external bırakmıyoruz: chokidar 5 ESM-only ve ana süreç CommonJS
// olarak yükleniyor, dolayısıyla `require('chokidar')` çalışmazdı. Vite'ın bundle
// etmesi ESM'i CJS'e çeviriyor ve paketleme sırasında node_modules'e bağımlılık
// kalmıyor. Her iki paket de saf JS; native eklenti yok.
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
