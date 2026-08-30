import { test, _electron as electron } from '@playwright/test';
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

  await app.close();
  fs.rmSync(userData, { recursive: true, force: true });
});
