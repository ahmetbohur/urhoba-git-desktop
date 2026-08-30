import type { ForgeConfig } from '@electron-forge/shared-types';
import { execFileSync } from 'node:child_process';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

function commandExists(command: string): boolean {
  try {
    execFileSync('which', [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const hasRpmbuild = commandExists('rpmbuild');

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'Urhoba Git Desktop',
    /*
     * Gömülü git.
     *
     * Vite eklentisi paketleme sırasında node_modules'ü temizlediği için
     * dugite'in kendi ikili dosyaları pakete girmiyor. Git klasörünü ayrı bir
     * kaynak olarak `resources/git` altına kopyalıyor, yolu da ana süreçte
     * `LOCAL_GIT_DIRECTORY` ile dugite'e bildiriyoruz. Bu yol dugite'in
     * `__dirname` tahminine güvenmekten daha sağlam: bundle edilmiş kodda o
     * tahmin zaten yanlış çıkıyor.
     */
    /*
     * İkon ayrıca kaynak olarak kopyalanıyor: Linux'ta paketleyici ikonu ikili
     * dosyaya gömmüyor, pencereye çalışma anında verilmesi gerekiyor.
     */
    extraResource: ['node_modules/dugite/git', 'assets/icon.png'],
    /*
     * Uzantısız veriyoruz: her hedef kendi biçimini seçiyor — Windows .ico,
     * macOS .icns, Linux .png. Üçü de `assets/make-icon.py` ile üretiliyor.
     */
    icon: 'assets/icon',
    /*
     * Linux'ta ikili dosyanın adı boşluksuz olmalı. `.deb` üreticisi paket
     * adıyla aynı adda bir ikili arıyor ve "Urhoba Git Desktop" bulunamıyordu;
     * ayrıca boşluklu bir komut adı terminalden çalıştırmayı da zorlaştırıyor.
     * Windows ve macOS'ta değiştirilmiyor: orada kullanıcı ikilinin adını
     * görev yöneticisinde görüyor ve ürün adı daha anlaşılır.
     */
    executableName: process.platform === 'linux' ? 'urhoba-git-desktop' : undefined,
  },
  rebuildConfig: {},
  /*
   * RPM yalnızca `rpmbuild` kuruluysa listeye giriyor. Koşulsuz eklendiğinde
   * Forge bütün `make` işlemini daha başlamadan durduruyor ve rpm'e ihtiyacı
   * olmayan bir makinede .deb üretmek imkânsız hâle geliyor.
   */
  makers: [
    new MakerSquirrel({
      name: 'urhoba-git-desktop',
      setupIcon: 'assets/icon.ico',
    }),
    new MakerZIP({}, ['darwin']),
    ...(hasRpmbuild ? [new MakerRpm({
      options: {
        name: 'urhoba-git-desktop',
        productName: 'Urhoba Git Desktop',
        genericName: 'Git İstemcisi',
        description: 'Depolarını tek pencereden takip eden modern bir masaüstü Git istemcisi.',
        categories: ['Development'],
        icon: 'assets/icon.png',
        homepage: 'https://github.com/urhoba/urhoba-git-desktop',
      },
    })] : []),
    new MakerDeb({
      options: {
        name: 'urhoba-git-desktop',
        productName: 'Urhoba Git Desktop',
        genericName: 'Git İstemcisi',
        description: 'Depolarını tek pencereden takip eden modern bir masaüstü Git istemcisi.',
        categories: ['Development'],
        icon: 'assets/icon.png',
        homepage: 'https://github.com/urhoba/urhoba-git-desktop',
        // Gömülü git taşındığı için sistemde git kurulu olması gerekmiyor.
        depends: [],
      },
    }),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main/index.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
