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

// `@screenshot` etiketi bunu normal koşudan ayırıyor: bir araç, bir doğrulama
// değil. Çalıştırmak için: npx playwright test --grep @screenshot
test('tarama diyaloğunun görüntüleri @screenshot', async () => {
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

  await app.close();
  fs.rmSync(userData, { recursive: true, force: true });
});
