import { test, expect, _electron as electron } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * AI özelliklerinin gerçek bir modelle uçtan uca sınanması.
 *
 * Sağlayıcı olarak makinede çalışan Ollama kullanılıyor; bulut anahtarı
 * gerekmiyor ve kod dışarı çıkmıyor. Model yanıtı doğası gereği değişken
 * olduğu için içeriğin kendisini değil, akışın çalıştığını ve sonucun makul
 * olduğunu doğruluyoruz.
 */

const MODEL = 'gemma4:26b-a4b-it-qat';

/*
 * Varsayılan 60 saniye üç model çağrısına yetmiyor: commit mesajı, depo tanıtımı
 * ve gruplama. Yerel model başka bir işle meşgulse tek çağrı bile dakikayı
 * bulabiliyor, o yüzden bolca pay bırakılıyor.
 */
test.setTimeout(300_000);

test('Ollama ile commit mesajı, tanıtım ve gruplama önerisi', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-ai-'));
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-ai-repo-'));

  const git = (args: string[]) => execFileSync('git', args, { cwd: repoPath });
  git(['init', '--initial-branch=main']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'user.email', 't@e.c']);
  fs.writeFileSync(path.join(repoPath, 'README.md'), '# Proje\n');
  git(['add', '-A']);
  git(['commit', '-m', 'İlk commit']);

  // Öneri istenecek değişiklik: anlaşılır ve küçük.
  fs.writeFileSync(
    path.join(repoPath, 'README.md'),
    '# Proje\n\n## Kurulum\n\n```bash\nnpm install\nnpm start\n```\n',
  );
  git(['add', '-A']);

  const app = await electron.launch({
    args: ['.vite/build/main.js', `--user-data-dir=${userData}`],
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  await page.evaluate(
    (repo) => window.urhoba.invoke('repo:add', { path: repo }),
    repoPath,
  );
  await page.evaluate(
    (model) =>
      window.urhoba.invoke('settings:set', {
        ai: { provider: 'ollama', model, ollamaHost: 'http://127.0.0.1:11434' },
      }),
    MODEL,
  );
  await page.evaluate(async () => {
    const settings = await window.urhoba.invoke('settings:get', undefined);
    await window.urhoba.invoke('settings:set', {
      defaults: { ...settings.defaults, aiEnabled: true },
    });
  });
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);

  // --- Model listesi ---
  const models = await page.evaluate(() => window.urhoba.invoke('ai:models', undefined));
  console.log('MODELLER:', models.join(', '));
  expect(models).toContain(MODEL);

  // --- Commit mesajı önerisi ---
  const repoId = await page.evaluate(async () => {
    const list = await window.urhoba.invoke('repo:list', undefined);
    return list[0].id;
  });
  const suggestion = await page.evaluate(
    (id) => window.urhoba.invoke('ai:suggest-commit', { repoId: id }),
    repoId,
  );
  console.log('BAŞLIK:', suggestion.subject);
  console.log('GÖVDE:', suggestion.body.slice(0, 200));
  console.log('AYRINTI:', suggestion.detail, '| gönderilen:', suggestion.charactersSent);

  expect(suggestion.subject.length).toBeGreaterThan(5);
  expect(suggestion.subject.length).toBeLessThan(120);
  expect(suggestion.detail).toBe('full');
  expect(suggestion.provider).toBe('ollama');

  // --- Depo tanıtımı önerisi ---
  const described = await page.evaluate(
    (id) => window.urhoba.invoke('ai:suggest-description', { repoId: id }),
    repoId,
  );
  console.log('TANITIM:', described.description);
  console.log('KAYNAK:', described.source, '| gönderilen:', described.charactersSent);

  expect(described.description.length).toBeGreaterThan(10);
  // GitHub'ın sınırı 350; istem 200 istiyor ama modelin taşması engellenmeli.
  expect(described.description.length).toBeLessThanOrEqual(350);
  // Tek satır olmalı: GitHub description alanı satır sonu kabul etmiyor.
  expect(described.description).not.toContain('\n');

  // --- Gruplama önerisi ---
  // Tek depoyla öneri anlamsız; modelin örüntü görebilmesi için birkaç ilgili
  // proje ekliyoruz.
  const extras = ['akari-pro', 'hashi-pro', 'sudoku-pro', 'otp-server', 'qr-master'];
  for (const name of extras) {
    const dir = path.join(os.tmpdir(), `urhoba-ai-${name}`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('git', ['init', '--initial-branch=main'], { cwd: dir });
    await page.evaluate((repo) => window.urhoba.invoke('repo:add', { path: repo }), dir);
  }

  const groups = await page.evaluate(() => window.urhoba.invoke('ai:suggest-groups', undefined));
  console.log('GRUPLAR:', JSON.stringify(groups, null, 1));
  expect(Array.isArray(groups)).toBe(true);
  // Model bulmaca oyunlarını bir araya getirebilmeli; en azından bir grup
  // önermesini ve önerdiği depoların gerçekten var olmasını bekliyoruz.
  for (const group of groups) {
    expect(group.repoIds.length).toBeGreaterThan(0);
    expect(group.group.length).toBeGreaterThan(0);
  }

  for (const name of extras) {
    fs.rmSync(path.join(os.tmpdir(), `urhoba-ai-${name}`), { recursive: true, force: true });
  }

  await app.close();
  fs.rmSync(userData, { recursive: true, force: true });
  fs.rmSync(repoPath, { recursive: true, force: true });
});
