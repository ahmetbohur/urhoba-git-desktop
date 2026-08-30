import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Otomatik başlatma anahtarının uçtan uca doğrulaması.
 *
 * Anahtar yalnızca kurulu uygulamada etkin; testte ana süreçteki `isPackaged`
 * değerini kurulu gibi göstererek arayüzden diske kadar olan yolu (tıklama →
 * IPC → .desktop dosyası) gerçekten çalıştırıyoruz.
 *
 * Autostart dizinini geçici bir yere yönlendiriyoruz: test kullanıcının gerçek
 * oturum açılışına dokunmamalı.
 */
test('otomatik başlatma anahtarı .desktop girdisini yazıp siliyor', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-as-data-'));
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-as-config-'));
  const desktopFile = path.join(configHome, 'autostart', 'urhoba-git-desktop.desktop');

  const app = await electron.launch({
    args: ['.vite/build/main.js', `--user-data-dir=${userData}`],
    env: { ...process.env, XDG_CONFIG_HOME: configHome },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  await app.evaluate(({ app: electronApp }) => {
    Object.defineProperty(electronApp, 'isPackaged', { get: () => true });
  });

  // Ayarlar üst çubukta; önce bir depo gerekiyor.
  await page.evaluate(
    (repo) => window.urhoba.invoke('repo:add', { path: repo }),
    process.cwd(),
  );
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.getByLabel('Ayarlar').click();

  await expect(page.getByText('Sistem açılınca başlat')).toBeVisible({ timeout: 15_000 });
  const toggle = page
    .getByText('Sistem açılınca başlat')
    .locator('xpath=../..')
    .getByRole('switch');

  // Anahtarı aç
  await toggle.click();
  await expect.poll(() => fs.existsSync(desktopFile), { timeout: 8000 }).toBe(true);

  const contents = fs.readFileSync(desktopFile, 'utf8');
  console.log('DESKTOP DOSYASI:\n' + contents);
  expect(contents).toContain('Type=Application');
  expect(contents).toContain('Name=Urhoba Git Desktop');
  expect(contents).toMatch(/Exec="[^"]+"/);

  // Anahtarı kapat
  await toggle.click();
  await expect.poll(() => fs.existsSync(desktopFile), { timeout: 8000 }).toBe(false);

  await app.close();
  fs.rmSync(userData, { recursive: true, force: true });
  fs.rmSync(configHome, { recursive: true, force: true });
});
