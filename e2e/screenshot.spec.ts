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
  await page.getByText('README.md').first().click({ button: 'right' });
  await page.waitForTimeout(500);
  await page.getByText('Satır geçmişi (blame)').click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOT_DIR}/12-blame.png` });
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
  // Depo IPC üzerinden eklendiği için kenar çubuğu kendiliğinden tazelenmiyor.
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1200);
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
