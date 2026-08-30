import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * Uçtan uca duman testi.
 *
 * Birim ve entegrasyon testleri git katmanını kanıtlıyor ama "uygulama gerçekten
 * açılıyor mu, arayüz ana süreçle konuşabiliyor mu" sorusuna cevap vermiyor.
 * Bu dosya tam da onu ölçüyor: gerçek bir Electron süreci başlatıp, gerçek bir
 * depoyu ekleyip ekranda beklenen şeyleri arıyor.
 *
 * Testler derlenmiş ana süreç dosyasını başlatıyor, paketlenmiş uygulamayı
 * değil. Sebebi bir güvenlik tercihi: paket, `RunAsNode` fuse'u kapalı olarak
 * imzalanıyor ve Playwright'in Electron sürücüsü tam da o yolu kullanıyor.
 * Yani paketlenmiş uygulamayı dışarıdan sürmek mümkün değil — bu, üretimde
 * istediğimiz davranış. Paketin kendisi ayrıca elle doğrulanıyor.
 *
 * Depo ekleme normalde işletim sistemi klasör seçme penceresi açıyor; testte o
 * pencereyi bekleyemeyeceğimiz için depoyu doğrudan `repo:add` kanalından
 * ekliyoruz — arayüzün geri kalanı yine gerçek yoldan çalışıyor.
 */

const MAIN_BUNDLE = '.vite/build/main.js';

let app: ElectronApplication;
let page: Page;
let repoPath: string;
let userDataPath: string;

test.beforeAll(async () => {
  // Her koşuda temiz bir ayar klasörü: önceki oturumun depo listesi sızmasın.
  userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-e2e-data-'));

  repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-e2e-repo-'));
  const git = (args: string[]) => execFileSync('git', args, { cwd: repoPath });
  git(['init', '--initial-branch=main']);
  git(['config', 'user.name', 'E2E']);
  git(['config', 'user.email', 'e2e@example.com']);
  fs.writeFileSync(path.join(repoPath, 'okuma.txt'), 'ilk satır\n');
  git(['add', '-A']);
  git(['commit', '-m', 'İlk commit']);
  // Ekranda "değişiklik" görünmesi için kaydedilmemiş bir düzenleme bırakıyoruz.
  fs.writeFileSync(path.join(repoPath, 'okuma.txt'), 'ilk satır\ndeğişti\n');

  if (!fs.existsSync(MAIN_BUNDLE)) {
    throw new Error(`${MAIN_BUNDLE} yok. Önce \`npm run package\` çalıştır.`);
  }

  app = await electron.launch({
    args: [MAIN_BUNDLE, `--user-data-dir=${userDataPath}`],
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app?.close();
  fs.rmSync(repoPath, { recursive: true, force: true });
  fs.rmSync(userDataPath, { recursive: true, force: true });
});

test('uygulama açılıyor ve boş durumu gösteriyor', async () => {
  await expect(page.getByText('Urhoba Git Desktop')).toBeVisible();
  await expect(page.getByText(/Başlamak için soldan bir depo ekle/)).toBeVisible();
});

test('komut paleti klavyeyle açılıyor', async () => {
  await page.keyboard.press('Control+k');
  const search = page.getByPlaceholder('Komut, depo veya dal ara');
  await expect(search).toBeVisible();

  await search.fill('değişiklik');
  await expect(page.getByText('Değişiklikler sekmesine geç')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(search).not.toBeVisible();
});

test('depo eklenince değişiklikler ve geçmiş görünüyor', async () => {
  // Klasör seçme penceresini atlayıp depoyu doğrudan ekliyoruz.
  await page.evaluate(
    (repo) => window.urhoba.invoke('repo:add', { path: repo }),
    repoPath,
  );
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  // Üst çubukta depo adı ve dal görünmeli.
  await expect(page.getByText('main', { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  // Kaydedilmemiş değişiklik listede.
  await expect(page.getByText('okuma.txt').first()).toBeVisible();
  await expect(page.getByText(/1 değişiklik/)).toBeVisible();

  // Dosyaya tıklayınca diff açılmalı.
  await page.getByText('okuma.txt').first().click();
  await expect(page.getByText('değişti')).toBeVisible();

  // Geçmiş sekmesinde ilk commit görünmeli.
  await page.getByRole('tab', { name: 'Geçmiş' }).click();
  await expect(page.getByText('İlk commit')).toBeVisible({ timeout: 15_000 });
});

test('arayüz dili İngilizceye çevrilebiliyor', async () => {
  // Dil ayarı doğrudan ayar kanalından değiştiriliyor; amacımız çeviri
  // katmanının gerçekten devreye girdiğini görmek, ayar penceresini tıklamak değil.
  await page.evaluate(() => window.urhoba.invoke('settings:set', { language: 'en' }));
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  await expect(page.getByRole('tab', { name: 'Changes' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('tab', { name: 'History' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Pull requests' })).toBeVisible();

  // Değişken içeren metinler de çevrilmeli.
  await expect(page.getByText(/1 changes/)).toBeVisible();

  // Komut paleti de İngilizce.
  await page.keyboard.press('Control+k');
  await expect(page.getByPlaceholder('Search commands, repositories or branches')).toBeVisible();
  await expect(page.getByText('Go to History')).toBeVisible();
  await page.keyboard.press('Escape');

  // Türkçeye geri dön ki sonraki testler etkilenmesin.
  await page.evaluate(() => window.urhoba.invoke('settings:set', { language: 'tr' }));
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('tab', { name: 'Değişiklikler' })).toBeVisible({ timeout: 15_000 });
});

test('tema değişikliği anında renklere yansıyor', async () => {
  /*
   * Ayarın diske yazıldığını değil, ekrandaki rengin gerçekten değiştiğini
   * ölçüyoruz. İlk hâlinde tema yalnızca `nativeTheme.themeSource` ile
   * ayarlanıyordu ve Linux'ta hiçbir şey değişmiyordu; ayarı okuyan bir test
   * bunu yakalayamazdı.
   */
  const background = () =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  // Ayar kanalını doğrudan çağırmak yerine gerçek yolu izliyoruz: kullanıcının
  // tıkladığı düğme, ayarın kaydı ve arayüzün tazelenmesi zinciri birlikte
  // çalışmazsa tema yine değişmez.
  await page.getByLabel('Ayarlar').click();
  await expect(page.getByText('Görünüm ve dil')).toBeVisible({ timeout: 10_000 });

  // Kesin eşleşme şart: ayarlardaki üç durumlu anahtarlarda da "Açık" geçiyor.
  await page.getByRole('button', { name: 'Koyu', exact: true }).click();
  await expect.poll(background, { timeout: 8000 }).toBe('rgb(19, 18, 24)');

  await page.getByRole('button', { name: 'Açık', exact: true }).click();
  await expect.poll(background, { timeout: 8000 }).toBe('rgb(244, 243, 247)');

  // Sistem seçilince öznitelik kalkmalı; karar yeniden medya sorgusuna döner.
  await page.getByRole('button', { name: 'Sistem', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.hasAttribute('data-theme')), {
      timeout: 8000,
    })
    .toBe(false);

  await page.keyboard.press('Escape');
});

test('uygulama menüsü de dile uyuyor', async () => {
  // Menü ana süreçte kuruluyor ve arayüzün çeviri katmanını görmüyor; dil
  // değişince yeniden kurulduğunu doğruluyoruz.
  const menuLabels = () =>
    app.evaluate(({ Menu }) =>
      (Menu.getApplicationMenu()?.items ?? []).flatMap((item) =>
        (item.submenu?.items ?? []).map((sub) => sub.label),
      ),
    );

  await page.evaluate(() => window.urhoba.invoke('settings:set', { language: 'en' }));
  await expect.poll(menuLabels, { timeout: 5000 }).toContain('About Urhoba Git Desktop');

  await page.evaluate(() => window.urhoba.invoke('settings:set', { language: 'tr' }));
  await expect.poll(menuLabels, { timeout: 5000 }).toContain('Urhoba Git Desktop Hakkında');
});

test('git komut günlüğü çalışan komutları gösteriyor', async () => {
  await page.keyboard.press('Control+Shift+G');
  await expect(page.getByText('Git komutları')).toBeVisible();
  // Depo açıldığında en az bir status komutu çalışmış olmalı.
  await expect(page.getByText(/git status/).first()).toBeVisible({ timeout: 10_000 });
});
