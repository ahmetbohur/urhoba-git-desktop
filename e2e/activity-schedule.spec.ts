import { test, expect, _electron as electron } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Kendiliğinden özet gerçekten tetikleniyor mu.
 *
 * Aralığı beklemek yerine diskteki "son özet anı" geçmişe çekiliyor; zamanlayıcı
 * açılışta hemen bir kontrol yaptığı için vakti gelmiş sayılıyor.
 */
test('kendiliğinden özet vakti gelince çalışıyor', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-zaman-'));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-zaman-repo-'));
  const repo = path.join(workspace, 'depo');

  fs.mkdirSync(repo);
  const git = (args: string[]) => execFileSync('git', args, { cwd: repo });
  git(['init', '--initial-branch=main']);
  git(['config', 'user.name', 'Zaman']);
  git(['config', 'user.email', 'zaman@urhoba.test']);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'bir\n');
  git(['add', '-A']);
  git(['commit', '-m', 'zamanlayıcı için commit']);

  // Ayarları ve son özet anını önceden yaz: uygulama açılır açılmaz vakti gelsin.
  fs.writeFileSync(
    path.join(userData, 'urhoba-store.json'),
    JSON.stringify({
      settings: { activityAuto: true, activityPeriod: '1h' },
      repos: [
        {
          id: 'zaman-1',
          name: 'depo',
          path: repo,
          addedAt: new Date().toISOString(),
          lastOpenedAt: new Date().toISOString(),
        },
      ],
      repoSettings: {},
      lastActivityDigestAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    }),
  );

  const app = await electron.launch({
    args: ['.vite/build/main.js', `--user-data-dir=${userData}`],
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(6000);

  // Zamanlayıcı çalıştıysa son özet anını güncellemiş olmalı.
  const store = JSON.parse(
    fs.readFileSync(path.join(userData, 'urhoba-store.json'), 'utf8'),
  ) as { lastActivityDigestAt?: string };
  const updated = new Date(store.lastActivityDigestAt ?? 0);

  expect(Date.now() - updated.getTime()).toBeLessThan(60_000);

  await app.close();
  fs.rmSync(userData, { recursive: true, force: true });
  fs.rmSync(workspace, { recursive: true, force: true });
});
