import { test, _electron as electron } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Görsel inceleme için ekran görüntüsü üretir.
 *
 * Klasör seçme penceresi işletim sistemine ait olduğu için testten sürülemiyor;
 * ana süreçteki `dialog.showOpenDialog` çağrısını sabit bir yol dönecek şekilde
 * değiştiriyoruz. Akışın geri kalanı gerçek: tarama gerçekten çalışıyor.
 */
const SHOT_DIR = '/tmp/urhoba-shots';

// Bu dosya normal test koşusunun dışında; `npm run screenshots` ile çalışıyor.
/*
 * Senaryo uzun: her adım arayüzün yerleşmesi için bekliyor ve ekran görüntüsü
 * alıyor. Varsayılan bir dakika yetmiyor.
 */
test.setTimeout(240_000);

test('arayüz görüntüleri', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-shot-'));
  const app = await electron.launch({
    args: ['.vite/build/main.js', `--user-data-dir=${userData}`],
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.setViewportSize({ width: 1280, height: 820 });

  await app.evaluate(async ({ dialog }, target) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
  }, '/home/urhoba/Documents/Projects');

  // Ekle menüsü
  await page.getByRole('button', { name: 'Ekle' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT_DIR}/01-ekle-menusu.png` });

  // Tarama diyaloğu, sonuç gelmeden
  await page.getByText('Klasörü tara…').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT_DIR}/02-tarama-bos.png` });

  // Klasör seç → tarama çalışsın
  await page.getByRole('button', { name: 'Klasör seç' }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOT_DIR}/03-tarama-sonuc.png` });

  // Üst çubuk: bir depo ekleyip dar pencerede düğmelerin sığdığını görüyoruz.
  await page.getByRole('button', { name: 'Vazgeç' }).click();
  await page.evaluate(
    (repo) => window.urhoba.invoke('repo:add', { path: repo }),
    '/home/urhoba/Documents/Projects/Individual/urhoba-git-desktop',
  );
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOT_DIR}/04-ust-cubuk.png` });

  // Uygulamanın izin verdiği en dar pencere: sıkışma önce burada görünür.
  await page.setViewportSize({ width: 960, height: 700 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOT_DIR}/05-ust-cubuk-dar.png` });

  // Ayarlar: yeni başlangıç bölümü
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.getByLabel('Ayarlar').click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOT_DIR}/06-ayarlar.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Hakkında penceresi menüden açılıyor; olayı doğrudan tetikliyoruz.
  await app.evaluate(async ({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('app:event', { type: 'app:show-about' });
    }
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOT_DIR}/07-hakkinda.png` });
  // Hakkında penceresi açık kalırsa örtüsü sonraki tıklamayı engelliyor.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // Gruplu kenar çubuğu: tarama sonuçlarını uygulayıp listeye bakıyoruz.
  await page.evaluate(async () => {
    const found = await window.urhoba.invoke('repo:scan', {
      directory: '/home/urhoba/Documents/Projects',
      maxDepth: 4,
    });
    await window.urhoba.invoke('repo:add-many', {
      paths: found.slice(0, 24).map((repo) => repo.path),
    });
  });
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOT_DIR}/10-gruplu-liste.png` });

  // Satır geçmişi: geçmişten bir commit açıp dosyasına çift tıklıyoruz.
  // Bu yol çalışma dizininin o anki durumundan bağımsız.
  await page.getByRole('tab', { name: 'Geçmiş' }).click();
  await page.waitForTimeout(2000);
  // Commit satırları alt kenarlıklı butonlar; ilkini seçiyoruz.
  await page.locator('button.border-b').first().click();
  await page.waitForTimeout(2000);
  /*
   * Belirli bir dosya adı aramıyoruz: son commit'in hangi dosyalara dokunduğu
   * her çalıştırmada değişiyor ve "README.md" beklemek senaryoyu depo geçmişine
   * bağlıyordu. Commit dosya satırları tek `button.h-8.w-full` eşleşmesi.
   */
  await page.locator('button.h-8.w-full').first().click({ button: 'right' });
  await page.waitForTimeout(500);
  await page.getByText('Satır geçmişi (blame)').click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOT_DIR}/12-blame.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  /*
   * İmza rozeti: SSH anahtarıyla imzalanmış bir commit kurup detay panelinde
   * doğrulandığının göründüğünü kontrol ediyoruz.
   */
  const signedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-imza-'));
  const signedGit = (args: string[]) => execFileSync('git', args, { cwd: signedRoot });
  const publicKey = path.join(os.homedir(), '.ssh/id_ed25519.pub');
  if (fs.existsSync(publicKey)) {
    signedGit(['init', '--initial-branch=main']);
    signedGit(['config', 'user.email', 'ornek@urhoba.test']);
    signedGit(['config', 'user.name', 'Urhoba']);
    signedGit(['config', 'gpg.format', 'ssh']);
    signedGit(['config', 'user.signingkey', publicKey]);
    const allowed = path.join(signedRoot, 'allowed-signers');
    fs.writeFileSync(allowed, `ornek@urhoba.test ${fs.readFileSync(publicKey, 'utf8').trim()}\n`);
    signedGit(['config', 'gpg.ssh.allowedSignersFile', allowed]);
    fs.writeFileSync(path.join(signedRoot, 'a.txt'), 'imzalı\n');
    signedGit(['add', 'a.txt']);
    signedGit(['-c', 'commit.gpgsign=true', 'commit', '-m', 'imzalı commit']);

    await page.evaluate(
      (target) => window.urhoba.invoke('repo:add', { path: target }),
      signedRoot,
    );
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1200);
    await page.getByPlaceholder('Depolarda ara').fill('urhoba-imza');
    await page.waitForTimeout(500);
    await page.getByText(path.basename(signedRoot)).first().click();
    await page.waitForTimeout(1200);
    await page.getByRole('tab', { name: 'Geçmiş' }).click();
    await page.waitForTimeout(1500);
    await page.locator('button.border-b').first().click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${SHOT_DIR}/23-imza.png` });

    // Sonraki adımlar asıl depoda sürüyor; seçimi geri alıyoruz.
    await page.getByPlaceholder('Depolarda ara').fill('urhoba-git-desktop');
    await page.waitForTimeout(500);
    await page.getByText('urhoba-git-desktop').first().click();
    await page.waitForTimeout(1500);
    await page.getByPlaceholder('Depolarda ara').fill('');
    await page.waitForTimeout(500);
    // Depo seçimi sekmeyi de değiştiriyor; sonraki adımlar geçmişte sürüyor.
    await page.getByRole('tab', { name: 'Geçmiş' }).click();
    await page.waitForTimeout(1500);
  }
  fs.rmSync(signedRoot, { recursive: true, force: true });

  // Süslemeler: yerel ve uzak dal aynı commit'te birlikte görünmeli.
  await page.screenshot({ path: `${SHOT_DIR}/18-gecmis-suslemeler.png` });

  // Kesin eşleşme: commit listesinde aynı metni içeren başlıklar olabiliyor.
  await page.getByRole('button', { name: 'HEAD geçmişi', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.locator('button:has-text("commit")').nth(1).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOT_DIR}/19-reflog.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // Etkileşimli rebase: bir commit'e sağ tıklayıp düzenleme penceresini aç.
  await page.locator('button.border-b').nth(4).click({ button: 'right' });
  await page.waitForTimeout(600);
  await page.getByText('Bu commit’ten sonrasını düzenle…').click();
  await page.waitForTimeout(1200);
  // Mesaj değiştirme seçilince satırın altında giriş alanı açılmalı.
  await page.getByRole('button', { name: /: Mesaj$/ }).first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOT_DIR}/21-rebase.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.getByRole('tab', { name: 'Değişiklikler' }).click();
  await page.waitForTimeout(600);

  // AI ayarları bölümü
  await page.evaluate(async () => {
    const settings = await window.urhoba.invoke('settings:get', undefined);
    await window.urhoba.invoke('settings:set', {
      ai: {
        provider: 'ollama',
        model: 'gemma4:26b-a4b-it-qat',
        ollamaHost: 'http://127.0.0.1:11434',
      },
      defaults: { ...settings.defaults, aiEnabled: true },
    });
  });
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1200);
  await page.getByLabel('Ayarlar').click();
  await page.waitForTimeout(1200);
  await page.getByText('AI sağlayıcısı').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT_DIR}/11-ai-ayarlari.png` });
  await page.getByRole('tab', { name: 'Bu depo' }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOT_DIR}/13-depo-ayarlari.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  /*
   * Yayınlama penceresi uzak sunucusu olmayan bir depo istiyor. Kullanıcının
   * gerçek depolarının hepsinde origin var, o yüzden senaryo kendi deposunu
   * kuruyor — elle hazırlanmış bir klasöre bel bağlamak senaryoyu kırıyordu.
   */
  const sampleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-yayin-'));
  const samplePath = path.join(sampleRoot, 'urhoba-yayin-ornegi');
  fs.mkdirSync(samplePath);
  const sampleGit = (args: string[]) => execFileSync('git', args, { cwd: samplePath });
  sampleGit(['init', '--initial-branch=main']);
  sampleGit(['config', 'user.email', 'ornek@urhoba.test']);
  sampleGit(['config', 'user.name', 'Urhoba']);
  fs.writeFileSync(path.join(samplePath, 'README.md'), '# Urhoba Yayın Örneği\n');
  sampleGit(['add', '-A']);
  sampleGit(['commit', '-m', 'ilk commit']);

  await page.evaluate(
    (target) => window.urhoba.invoke('repo:add', { path: target }),
    samplePath,
  );

  /*
   * Uzun adlı bir depoda otomatik pull simgesinin kırpılmadığını görmek için:
   * ad kısalırken simgenin yerini koruması gerekiyor.
   */
  const longPath = path.join(sampleRoot, 'Urhoba-Cok-Uzun-Depo-Adi-Ornegi');
  fs.mkdirSync(longPath);
  const longGit = (args: string[]) => execFileSync('git', args, { cwd: longPath });
  longGit(['init', '--initial-branch=main']);
  longGit(['config', 'user.email', 'ornek@urhoba.test']);
  longGit(['config', 'user.name', 'Urhoba']);
  fs.writeFileSync(path.join(longPath, 'README.md'), '# uzun\n');
  longGit(['add', '-A']);
  longGit(['commit', '-m', 'ilk commit']);
  await page.evaluate(async (target) => {
    const added = await window.urhoba.invoke('repo:add', { path: target });
    await window.urhoba.invoke('settings:repo-set', {
      repoId: added.id,
      autoPull: { enabled: true, intervalMinutes: 10, onlyWhenClean: true, fastForwardOnly: true },
    });
  }, longPath);
  // Depo IPC üzerinden eklendiği için kenar çubuğu kendiliğinden tazelenmiyor.
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1200);
  /*
   * İkili dosya önizlemesi: örnek depodaki bir PNG değiştirilip diff yerine
   * görselin kendisinin gösterildiği doğrulanıyor.
   */
  fs.copyFileSync('assets/icon-256.png', path.join(samplePath, 'logo.png'));
  sampleGit(['add', '-A']);
  sampleGit(['commit', '-m', 'logo eklendi']);
  fs.copyFileSync('assets/icon-64.png', path.join(samplePath, 'logo.png'));

  // Kelime düzeyinde fark: satırın tamamı değil, değişen kelimeler vurgulanmalı.
  fs.writeFileSync(
    path.join(samplePath, 'ayar.ts'),
    'export const timeout = 30;\nexport const retries = 3;\nexport const host = "localhost";\n',
  );
  // Yalnızca bu dosya: `-A` az önce değiştirilen logo.png'yi de commit'liyor ve
  // görsel önizleme adımında karşılaştırılacak bir değişiklik kalmıyordu.
  sampleGit(['add', 'ayar.ts']);
  sampleGit(['commit', '-m', 'ayarlar']);
  fs.writeFileSync(
    path.join(samplePath, 'ayar.ts'),
    'export const timeout = 60;\nexport const retries = 3;\nexport const host = "127.0.0.1";\n',
  );

  await page.getByPlaceholder('Depolarda ara').fill('yayin-ornegi');
  await page.waitForTimeout(500);
  await page.getByText('urhoba-yayin-ornegi').first().click();
  await page.waitForTimeout(1500);
  await page.getByText('logo.png').first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOT_DIR}/17-gorsel-onizleme.png` });

  await page.getByText('ayar.ts').first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOT_DIR}/20-kelime-farki.png` });

  /*
   * Alt modül: hem kurulmamış uyarı şeridi hem değişiklik listesindeki rozet.
   * Kütüphane deposu ayrı kuruluyor ve ana depoya alt modül olarak ekleniyor.
   */
  const libPath = path.join(sampleRoot, 'kutuphane');
  fs.mkdirSync(libPath);
  const libGit = (args: string[]) => execFileSync('git', args, { cwd: libPath });
  libGit(['init', '--initial-branch=main']);
  libGit(['config', 'user.email', 'ornek@urhoba.test']);
  libGit(['config', 'user.name', 'Urhoba']);
  fs.writeFileSync(path.join(libPath, 'lib.txt'), 'kütüphane\n');
  libGit(['add', '-A']);
  libGit(['commit', '-m', 'kütüphane']);

  const hostPath = path.join(sampleRoot, 'alt-modullu-depo');
  fs.mkdirSync(hostPath);
  const hostGit = (args: string[]) => execFileSync('git', args, { cwd: hostPath });
  hostGit(['init', '--initial-branch=main']);
  hostGit(['config', 'user.email', 'ornek@urhoba.test']);
  hostGit(['config', 'user.name', 'Urhoba']);
  fs.writeFileSync(path.join(hostPath, 'ana.txt'), 'ana\n');
  hostGit(['add', '-A']);
  hostGit(['commit', '-m', 'ana']);
  hostGit(['-c', 'protocol.file.allow=always', 'submodule', 'add', libPath, 'vendor/kutuphane']);
  hostGit(['commit', '-m', 'alt modül eklendi']);
  // İçeride kaydedilmemiş bir değişiklik bırak: rozet bunu göstermeli.
  fs.appendFileSync(path.join(hostPath, 'vendor/kutuphane/lib.txt'), 'değişiklik\n');

  await page.evaluate(
    (target) => window.urhoba.invoke('repo:add', { path: target }),
    hostPath,
  );
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1200);
  await page.getByPlaceholder('Depolarda ara').fill('alt-modullu');
  await page.waitForTimeout(500);
  await page.getByText('alt-modullu-depo').first().click();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${SHOT_DIR}/22-alt-modul.png` });

  await page.getByPlaceholder('Depolarda ara').fill('Urhoba-');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOT_DIR}/16-uzun-ad.png` });
  await page.getByPlaceholder('Depolarda ara').fill('yayin-ornegi');
  await page.waitForTimeout(500);
  await page.getByText('urhoba-yayin-ornegi').first().click();
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'GitHub’da yayınla' }).first().click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOT_DIR}/14-yayinla.png` });

  // Giriş yapılmamışken yayınlama penceresinden giriş penceresine geçiş.
  await page.getByRole('button', { name: 'GitHub’a giriş yap' }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOT_DIR}/15-yayinla-giris.png` });

  // İki pencere üst üste açık: önce giriş, sonra yayınlama kapanıyor.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  fs.rmSync(sampleRoot, { recursive: true, force: true });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // Koyu tema
  await page.getByLabel('Ayarlar').click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Koyu' }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOT_DIR}/08-koyu-ayarlar.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT_DIR}/09-koyu-ana-ekran.png` });

  await app.close();
  fs.rmSync(userData, { recursive: true, force: true });
});
