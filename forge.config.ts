import type { ForgeConfig } from '@electron-forge/shared-types';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
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

/**
 * macOS imzalama yalnızca gerekli bilgiler ortamda varken açılıyor.
 *
 * Koşulsuz açmak, sertifikası olmayan bir makinede `npm run make` komutunu
 * kırardı; imzasız derleme alabilmek geliştirme sırasında gerekiyor. Sırlar
 * ortam değişkeninden okunuyor, depoda hiçbir şey durmuyor.
 *
 *   APPLE_IDENTITY   "Developer ID Application: Ad Soyad (TEAMID)"
 *   APPLE_ID         Apple hesabının e-postası
 *   APPLE_PASSWORD   uygulamaya özel parola (hesap parolası değil)
 *   APPLE_TEAM_ID    ekip kimliği
 */
const appleIdentity = process.env.APPLE_IDENTITY?.trim();
const appleId = process.env.APPLE_ID?.trim();
const applePassword = process.env.APPLE_PASSWORD?.trim();
const appleTeamId = process.env.APPLE_TEAM_ID?.trim();
const canNotarize = !!(appleId && applePassword && appleTeamId);

/**
 * Paketlemenin hedeflediği platform.
 *
 * `process.platform` çalıştığımız makineyi söylüyor, üretilen paketin
 * platformunu değil. Linux'tan macOS paketi üretilirken ikisi ayrışıyor ve
 * host'a bakan bir koşul yanlış tarafa düşüyordu.
 */
function targetPlatform(): string {
  const flag = process.argv.find((argument) => argument.startsWith('--platform'));
  if (!flag) return process.platform;
  const value = flag.includes('=') ? flag.split('=')[1] : process.argv[process.argv.indexOf(flag) + 1];
  return value || process.platform;
}

/**
 * Gömülü git'ten çıkarılan, uygulamanın hiç kullanmadığı parçalar.
 *
 * dugite git'i olduğu gibi taşıyor ve paketin yarısından fazlası buradan
 * geliyordu. Üçünün de çıkarılabilmesinin sebebi tasarımda:
 *
 * - `git-credential-manager` (83 MB) HTTPS kimlik doğrulaması için. Uygulama
 *   yalnızca SSH kullanıyor ve git'i `GIT_TERMINAL_PROMPT=0` ile çalıştırıyor;
 *   dugite'in kendi gitconfig'i de bu yardımcıyı yapılandırmıyor.
 * - `libSkiaSharp` ve `libHarfBuzzSharp` kimlik yöneticisinin arayüz
 *   kütüphaneleri; onsuz anlamları yok.
 * - `share/locale` git'in çevirileri. Git her zaman `LC_ALL=C` ile
 *   çalıştırılıyor çünkü çıktısını biz ayrıştırıyoruz — bu dosyalar hiç
 *   okunmuyor.
 * - `share/gitweb` git'in web arayüzü; masaüstü uygulamasında karşılığı yok.
 *
 * `git-lfs` bilerek bırakıldı: kullanıcının kendi gitconfig'inde lfs filtresi
 * tanımlıysa klonlama onunla çalışıyor. 13 MB için çalışan bir durumu hataya
 * çevirmeye değmez.
 */
const TRIMMED_GIT_PATHS = [
  'libexec/git-core/git-credential-manager',
  'libexec/git-core/libSkiaSharp.so',
  'libexec/git-core/libHarfBuzzSharp.so',
  'share/locale',
  'share/gitweb',
];

/**
 * Gömülü git'in nereye kopyalandığı platforma göre değişiyor.
 *
 * Linux ve Windows'ta `resources/`, macOS'ta ise `<ad>.app/Contents/Resources/`.
 * Yalnızca ilkine bakan bir budama macOS'ta sessizce hiçbir şey yapmıyordu:
 * hata vermiyor, sadece paket 100 MB büyük çıkıyordu.
 */
function gitRoots(buildPath: string): string[] {
  const candidates = [path.join(buildPath, 'resources', 'git')];
  for (const entry of fs.readdirSync(buildPath, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.endsWith('.app')) {
      candidates.push(path.join(buildPath, entry.name, 'Contents', 'Resources', 'git'));
    }
  }
  return candidates.filter((candidate) => fs.existsSync(candidate));
}

function trimEmbeddedGit(buildPath: string): void {
  for (const gitRoot of gitRoots(buildPath)) {
    for (const relative of TRIMMED_GIT_PATHS) {
      fs.rmSync(path.join(gitRoot, relative), { recursive: true, force: true });
    }
  }
}

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
    executableName: targetPlatform() === 'linux' ? 'urhoba-git-desktop' : undefined,

    /*
     * Gömülü git budaması imzalamadan ÖNCE yapılmak zorunda.
     *
     * Paketleyicinin sırası: extraResource kopyala → bu kanca → imzala →
     * noter onayı → taşı. Forge'un `postPackage` kancası bu zincirin tamamından
     * sonra çalışıyor; budama orada yapılınca imzalanmış paketten dosya
     * siliniyor ve `_CodeSignature/CodeResources` mührü tutmuyor. Sonuç sinsi:
     * derleme "başarılı" diyor, uygulama derleyen makinede açılıyor, başka bir
     * Mac'te Gatekeeper reddediyor.
     */
    afterCopyExtraResources: [
      (buildPath, _electronVersion, _platform, _arch, callback) => {
        try {
          trimEmbeddedGit(buildPath);
          callback();
        } catch (error) {
          callback(error as Error);
        }
      },
    ],

    /*
     * İmzalama sertleştirilmiş çalışma zamanıyla yapılıyor; notarization bunu
     * zorunlu tutuyor. Gömülü git ikilileri de imzalanmalı: Apple paketin
     * içindeki her çalıştırılabilir dosyanın imzalı olmasını istiyor ve
     * imzasız bir ikiliyi çalıştırmaya kalkmak sertleştirilmiş çalışma
     * zamanında engelleniyor.
     */
    ...(appleIdentity
      ? {
          osxSign: {
            identity: appleIdentity,
            /*
             * Aynı hak listesi paketteki her ikiliye veriliyor. `@electron/osx-sign`
             * `entitlementsInherit` diye bir seçenek tanımıyor — eskiden burada
             * duruyordu ve sessizce yok sayılıyordu. Devralma zaten yalnızca kum
             * havuzundaki uygulamalar için anlamlı; bu uygulama kum havuzunda
             * değil (Developer ID ile dağıtılıyor) ve Forge'un belgelediği yol da
             * tek dosya vermek.
             */
            optionsForFile: () => ({
              hardenedRuntime: true,
              entitlements: 'assets/entitlements.mac.plist',
            }),
          } as NonNullable<ForgeConfig['packagerConfig']>['osxSign'],
        }
      : {}),

    ...(canNotarize
      ? {
          osxNotarize: {
            appleId: appleId as string,
            appleIdPassword: applePassword as string,
            teamId: appleTeamId as string,
          },
        }
      : {}),
  },
  /*
   * Yerel modül yeniden derlemesi kapalı.
   *
   * Uygulama çalışma anında hiçbir yerel modül yüklemiyor: dugite git'i ayrı
   * bir süreç olarak çalıştırıyor, geri kalan `.node` dosyaları derleme
   * araçlarına ait ve bundle'a girmiyor — üretilen `main.js` içinde `fsevents`
   * hiç geçmiyor.
   *
   * Boş bırakıldığında bu adım macOS'ta `fsevents`i buluyor (o paket yalnızca
   * darwin'e kuruluyor ve `binding.gyp` taşıyor) ve onu Electron başlıklarına
   * karşı yeniden derlemeye kalkıyor. Başlıkları indirmek gerekiyor; indirme
   * takılırsa paketleme sessizce donuyor — hata yok, ilerleme yok. Linux'ta
   * hiç yaşanmıyor çünkü orada fsevents kurulmuyor.
   *
   * Hiçbir şeyi yeniden derlememek burada doğru davranış, yalnızca bir kaçamak
   * değil: derlenen şey pakete girmiyordu.
   */
  rebuildConfig: { onlyModules: [] },
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
        /*
         * Üreticinin tipi `icon` alanını yalnızca dize sayıyor ama çalışan kod
         * boyut→dosya nesnesini de kabul ediyor ve hicolor teması altına her
         * boyutu ayrı yazıyor. Tek dosya verildiğinde ikon sadece pixmaps'e
         * kopyalanıyor ve masaüstü onu ölçekleyerek bulanıklaştırıyor.
         */
        icon: {
          '16x16': 'assets/icon-16.png',
          '24x24': 'assets/icon-24.png',
          '32x32': 'assets/icon-32.png',
          '48x48': 'assets/icon-48.png',
          '64x64': 'assets/icon-64.png',
          '128x128': 'assets/icon-128.png',
          '256x256': 'assets/icon-256.png',
          '512x512': 'assets/icon.png',
        } as unknown as string,
        homepage: 'https://github.com/ahmetbohur/urhoba-git-desktop',
      },
    })] : []),
    new MakerDeb({
      options: {
        name: 'urhoba-git-desktop',
        productName: 'Urhoba Git Desktop',
        genericName: 'Git İstemcisi',
        description: 'Depolarını tek pencereden takip eden modern bir masaüstü Git istemcisi.',
        categories: ['Development'],
        /*
         * Üreticinin tipi `icon` alanını yalnızca dize sayıyor ama çalışan kod
         * boyut→dosya nesnesini de kabul ediyor ve hicolor teması altına her
         * boyutu ayrı yazıyor. Tek dosya verildiğinde ikon sadece pixmaps'e
         * kopyalanıyor ve masaüstü onu ölçekleyerek bulanıklaştırıyor.
         */
        icon: {
          '16x16': 'assets/icon-16.png',
          '24x24': 'assets/icon-24.png',
          '32x32': 'assets/icon-32.png',
          '48x48': 'assets/icon-48.png',
          '64x64': 'assets/icon-64.png',
          '128x128': 'assets/icon-128.png',
          '256x256': 'assets/icon-256.png',
          '512x512': 'assets/icon.png',
        } as unknown as string,
        homepage: 'https://github.com/ahmetbohur/urhoba-git-desktop',
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
