import { test, _electron as electron } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * QA taraması.
 *
 * Yeni eklenen yüzeyler yalnızca açık temada ve olağan depolarda görüldü. Bu
 * senaryo aynı yerleri koyu temada ve uç durumlarda (commit'i olmayan depo,
 * ayrık HEAD, yarım kalmış rebase) geziyor. Doğrulama yapmıyor; çıktısı
 * gözle incelenmek üzere PNG olarak yazılıyor.
 */

const SHOT_DIR = '/tmp/urhoba-qa';

test.setTimeout(240_000);

test('QA taraması', async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-qa-'));
  const app = await electron.launch({
    args: ['.vite/build/main.js', `--user-data-dir=${userData}`],
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.setViewportSize({ width: 1280, height: 820 });

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-qa-repos-'));
  const make = (name: string) => {
    const target = path.join(root, name);
    fs.mkdirSync(target);
    const run = (args: string[]) => execFileSync('git', args, { cwd: target });
    run(['init', '--initial-branch=main']);
    run(['config', 'user.email', 'qa@urhoba.test']);
    run(['config', 'user.name', 'QA']);
    return { target, run };
  };

  // 1) Hiç commit'i olmayan depo
  const bos = make('bos-depo');

  // 2) Ayrık HEAD
  const ayrik = make('ayrik-head');
  for (const step of ['bir', 'iki']) {
    fs.writeFileSync(path.join(ayrik.target, 'a.txt'), `${step}\n`);
    ayrik.run(['add', '-A']);
    ayrik.run(['commit', '-m', step]);
  }
  ayrik.run(['checkout', '--detach', 'HEAD~1']);

  // 3) Çakışmalı rebase ortasında bırakılmış depo
  const cakisma = make('cakisma');
  fs.writeFileSync(path.join(cakisma.target, 'a.txt'), 'temel\n');
  cakisma.run(['add', '-A']);
  cakisma.run(['commit', '-m', 'temel']);
  cakisma.run(['branch', 'yan']);
  fs.writeFileSync(path.join(cakisma.target, 'a.txt'), 'ana\n');
  cakisma.run(['add', '-A']);
  cakisma.run(['commit', '-m', 'ana değişikliği']);
  cakisma.run(['checkout', 'yan']);
  fs.writeFileSync(path.join(cakisma.target, 'a.txt'), 'yan\n');
  cakisma.run(['add', '-A']);
  cakisma.run(['commit', '-m', 'yan değişikliği']);
  try {
    cakisma.run(['rebase', 'main']);
  } catch {
    /* çakışma bekleniyor */
  }

  for (const repo of [bos.target, ayrik.target, cakisma.target]) {
    await page.evaluate(
      (target) => window.urhoba.invoke('repo:add', { path: target }),
      repo,
    );
  }

  // Koyu tema: yeni yüzeylerin hiçbiri koyu temada görülmedi.
  await page.evaluate(() => window.urhoba.invoke('settings:set', { theme: 'dark' }));
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);

  const goto = async (name: string) => {
    await page.getByPlaceholder('Depolarda ara').fill(name);
    await page.waitForTimeout(400);
    await page.getByText(name).first().click();
    await page.waitForTimeout(1200);
  };

  await goto('bos-depo');
  await page.screenshot({ path: `${SHOT_DIR}/01-bos-depo.png` });
  await page.getByRole('tab', { name: 'Geçmiş' }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOT_DIR}/02-bos-gecmis.png` });

  await goto('ayrik-head');
  await page.screenshot({ path: `${SHOT_DIR}/03-ayrik-head.png` });

  await goto('cakisma');
  await page.screenshot({ path: `${SHOT_DIR}/04-cakisma.png` });

  // Koyu temada yeni pencereler
  await goto('ayrik-head');
  await page.getByRole('tab', { name: 'Geçmiş' }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'HEAD geçmişi', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('dialog').locator('button').nth(2).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOT_DIR}/05-koyu-reflog.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  await page.locator('button.border-b').first().click({ button: 'right' });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOT_DIR}/06-koyu-commit-menu.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Etkinlik özeti koyu temada
  await page.getByRole('button', { name: 'Etkinlik özeti' }).first().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOT_DIR}/08-koyu-etkinlik.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  await page.getByLabel('Ayarlar').click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOT_DIR}/09-koyu-genel-ayarlar.png` });
  await page.getByRole('tab', { name: 'Bu depo' }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOT_DIR}/07-koyu-depo-ayarlari.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  fs.rmSync(root, { recursive: true, force: true });
  await app.close();
  fs.rmSync(userData, { recursive: true, force: true });
});
