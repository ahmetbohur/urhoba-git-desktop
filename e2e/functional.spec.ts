import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * İşlevsel doğrulama.
 *
 * Buradaki testler uygulamanın kendisini çalıştırıyor: her işlem gerçek IPC
 * üzerinden ana sürece gidiyor ve gerçek git süreçleri koşuyor. Sonuç sonra
 * uygulamaya değil, doğrudan git'e sorularak doğrulanıyor — uygulama "oldu"
 * dediği için değil, depo gerçekten değiştiği için geçiyor.
 *
 * Uzak sunucu gerektiren akışlar yerel bir çıplak depoyla deneniyor: ağa
 * çıkmadan push, pull ve upstream kurulumu aynı kod yolundan geçiyor.
 */

let app: ElectronApplication;
let page: Page;
let userData: string;
let workspace: string;

/** Uygulamanın kendi IPC'si üzerinden çağrı. */
async function call<T>(channel: string, input: unknown): Promise<T> {
  return page.evaluate(
    ([name, payload]) =>
      window.urhoba.invoke(name as never, payload as never) as unknown as Promise<unknown>,
    [channel, input] as const,
  ) as Promise<T>;
}

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  }).trim();
}

/** Çalışan bir depo kurar ve uygulamaya ekler; depo kimliğini döndürür. */
async function addRepo(name: string): Promise<{ id: string; dir: string }> {
  const dir = path.join(workspace, name);
  fs.mkdirSync(dir, { recursive: true });
  git(['init', '--initial-branch=main'], dir);
  git(['config', 'user.name', 'İşlev Testi'], dir);
  git(['config', 'user.email', 'islev@urhoba.test'], dir);
  git(['config', 'commit.gpgsign', 'false'], dir);
  fs.writeFileSync(path.join(dir, 'okuma.txt'), 'ilk\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'ilk commit'], dir);

  const repo = await call<{ id: string }>('repo:add', { path: dir });
  return { id: repo.id, dir };
}

test.beforeAll(async () => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-islev-'));
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-islev-repos-'));
  app = await electron.launch({ args: ['.vite/build/main.js', `--user-data-dir=${userData}`] });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app.close();
  fs.rmSync(userData, { recursive: true, force: true });
  fs.rmSync(workspace, { recursive: true, force: true });
});

test('dosya hazırlama ve commit gerçekten commit üretiyor', async () => {
  const { id, dir } = await addRepo('commit-akisi');
  fs.writeFileSync(path.join(dir, 'yeni.txt'), 'içerik\n');

  await call('git:stage', { repoId: id, paths: ['yeni.txt'] });
  await call('git:commit', { repoId: id, subject: 'yeni dosya', body: 'gövde satırı' });

  expect(git(['log', '-1', '--format=%s'], dir)).toBe('yeni dosya');
  expect(git(['log', '-1', '--format=%b'], dir)).toBe('gövde satırı');
  expect(git(['status', '--porcelain'], dir)).toBe('');
});

test('push upstream kuruyor ve pull karşı taraftaki commit’i getiriyor', async () => {
  const { id, dir } = await addRepo('uzak-akisi');
  const bare = path.join(workspace, 'uzak.git');
  git(['init', '--bare', '--initial-branch=main', bare], workspace);
  await call('git:remote-add', { repoId: id, name: 'origin', url: bare });

  const pushed = await call<{ ok: boolean; upstreamSet: boolean }>('git:push', { repoId: id });
  expect(pushed.ok).toBe(true);
  // Upstream gerçekten kurulmuş olmalı; yalnızca "başarılı" demesi yetmez.
  expect(git(['rev-parse', '--abbrev-ref', 'main@{upstream}'], dir)).toBe('origin/main');
  expect(git(['rev-parse', 'HEAD'], dir)).toBe(git(['rev-parse', 'main'], bare));

  // Başka bir klon üzerinden karşı tarafa commit atıp geri çekiyoruz.
  const other = path.join(workspace, 'diger-klon');
  git(['clone', bare, other], workspace);
  git(['config', 'user.name', 'Diğer'], other);
  git(['config', 'user.email', 'diger@urhoba.test'], other);
  fs.writeFileSync(path.join(other, 'uzaktan.txt'), 'uzaktan\n');
  git(['add', '-A'], other);
  git(['commit', '-m', 'uzaktan gelen'], other);
  git(['push', 'origin', 'main'], other);

  const pulled = await call<{ outcome: string; commitsPulled: number }>('git:pull', {
    repoId: id,
    fastForwardOnly: true,
  });
  expect(pulled.outcome).toBe('fast-forwarded');
  expect(fs.existsSync(path.join(dir, 'uzaktan.txt'))).toBe(true);
});

test('dal oluşturma, birleştirme ve silme gerçekten uygulanıyor', async () => {
  const { id, dir } = await addRepo('dal-akisi');

  await call('git:branch-create', { repoId: id, name: 'ozellik', checkout: true });
  expect(git(['rev-parse', '--abbrev-ref', 'HEAD'], dir)).toBe('ozellik');

  fs.writeFileSync(path.join(dir, 'ozellik.txt'), 'özellik\n');
  await call('git:stage', { repoId: id, paths: ['ozellik.txt'] });
  await call('git:commit', { repoId: id, subject: 'özellik eklendi' });

  await call('git:checkout', { repoId: id, name: 'main' });
  const merged = await call<{ outcome: string }>('git:merge', { repoId: id, branch: 'ozellik' });
  expect(merged.outcome).toBe('merged');
  expect(fs.existsSync(path.join(dir, 'ozellik.txt'))).toBe(true);

  await call('git:branch-delete', { repoId: id, name: 'ozellik', force: false });
  expect(git(['branch', '--format=%(refname:short)'], dir)).toBe('main');
});

test('stash saklıyor ve geri uyguluyor', async () => {
  const { id, dir } = await addRepo('stash-akisi');
  fs.writeFileSync(path.join(dir, 'okuma.txt'), 'değişti\n');

  await call('git:stash-create', { repoId: id, includeUntracked: true });
  expect(fs.readFileSync(path.join(dir, 'okuma.txt'), 'utf8')).toBe('ilk\n');

  const list = await call<Array<{ index: number }>>('git:stash-list', { repoId: id });
  expect(list).toHaveLength(1);

  await call('git:stash-apply', { repoId: id, index: 0, pop: true });
  expect(fs.readFileSync(path.join(dir, 'okuma.txt'), 'utf8')).toBe('değişti\n');
});

test('etkileşimli rebase commit’leri gerçekten birleştiriyor', async () => {
  const { id, dir } = await addRepo('rebase-akisi');
  const base = git(['rev-parse', 'HEAD'], dir);

  for (const step of ['ikinci', 'üçüncü']) {
    fs.writeFileSync(path.join(dir, `${step}.txt`), `${step}\n`);
    git(['add', '-A'], dir);
    git(['commit', '-m', step], dir);
  }
  const [third, second] = git(['log', '--format=%H', '-2'], dir).split('\n');

  const result = await call<{ outcome: string }>('git:rebase-interactive', {
    repoId: id,
    baseSha: base,
    steps: [
      { sha: second, subject: 'ikinci', action: 'reword', message: 'yeniden adlandırıldı' },
      { sha: third, subject: 'üçüncü', action: 'fixup' },
    ],
  });

  expect(result.outcome).toBe('merged');
  expect(git(['log', '--format=%s'], dir).split('\n')).toEqual([
    'yeniden adlandırıldı',
    'ilk commit',
  ]);
  // Kaynatılan commit'in dosyası korunmalı.
  expect(fs.existsSync(path.join(dir, 'üçüncü.txt'))).toBe(true);
});

test('ikili arama hatayı getiren commit’i buluyor', async () => {
  const { id, dir } = await addRepo('bisect-akisi');
  const good = git(['rev-parse', 'HEAD'], dir);

  for (let index = 2; index <= 6; index += 1) {
    fs.writeFileSync(path.join(dir, 'okuma.txt'), `${index >= 4 ? 'hatalı' : 'sağlam'} ${index}\n`);
    git(['add', '-A'], dir);
    git(['commit', '-m', `commit ${index}`], dir);
  }
  const expected = git(['rev-parse', 'HEAD~2'], dir);

  let state = await call<{ firstBadSha: string | null }>('git:bisect-start', {
    repoId: id,
    goodSha: good,
  });
  for (let step = 0; step < 10 && !state.firstBadSha; step += 1) {
    const broken = fs.readFileSync(path.join(dir, 'okuma.txt'), 'utf8').includes('hatalı');
    state = await call('git:bisect-mark', { repoId: id, verdict: broken ? 'bad' : 'good' });
  }

  expect(expected.startsWith(state.firstBadSha as string)).toBe(true);
  await call('git:bisect-reset', { repoId: id });
  expect(git(['rev-parse', '--abbrev-ref', 'HEAD'], dir)).toBe('main');
});

test('reflog kaybolan commit’e geri döndürüyor', async () => {
  const { id, dir } = await addRepo('reflog-akisi');
  fs.writeFileSync(path.join(dir, 'kaybolan.txt'), 'veri\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'kaybolacak'], dir);
  const lost = git(['rev-parse', 'HEAD'], dir);

  git(['reset', '--hard', 'HEAD~1'], dir);
  expect(fs.existsSync(path.join(dir, 'kaybolan.txt'))).toBe(false);

  const entries = await call<Array<{ sha: string }>>('git:reflog', { repoId: id });
  expect(entries.some((entry) => entry.sha === lost)).toBe(true);

  await call('git:reset', { repoId: id, sha: lost, mode: 'hard' });
  expect(fs.existsSync(path.join(dir, 'kaybolan.txt'))).toBe(true);
});

test('etiket oluşturuluyor ve uzak sunucuya gidiyor', async () => {
  const { id, dir } = await addRepo('etiket-akisi');
  const bare = path.join(workspace, 'etiket-uzak.git');
  git(['init', '--bare', '--initial-branch=main', bare], workspace);
  await call('git:remote-add', { repoId: id, name: 'origin', url: bare });
  await call('git:push', { repoId: id });

  await call('git:tag-create', { repoId: id, name: 'v1.0.0', message: 'ilk sürüm' });
  expect(git(['tag', '--list'], dir)).toBe('v1.0.0');

  await call('git:tag-push', { repoId: id, name: 'v1.0.0' });
  expect(git(['tag', '--list'], bare)).toBe('v1.0.0');
});

test('satır bazlı hazırlama yalnızca seçilen satırı commit’liyor', async () => {
  const { id, dir } = await addRepo('satir-akisi');
  fs.writeFileSync(path.join(dir, 'okuma.txt'), 'bir\niki\nüç\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'üç satır'], dir);

  fs.writeFileSync(path.join(dir, 'okuma.txt'), 'BİR\niki\nÜÇ\n');

  const diff = await call<{ hunks: Array<{ lines: Array<{ kind: string; content: string }> }> }>(
    'git:diff',
    { repoId: id, path: 'okuma.txt', staged: false },
  );
  const lines = diff.hunks[0].lines;
  // Yalnızca ilk satırın değişikliğini hazırlıyoruz.
  const selected = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.content === 'BİR' || line.content === 'bir')
    .map(({ index }) => index);

  await call('git:stage-lines', {
    repoId: id,
    path: 'okuma.txt',
    mode: 'stage',
    selections: [{ hunkIndex: 0, lineIndices: selected }],
  });

  const staged = git(['diff', '--cached'], dir);
  expect(staged).toContain('+BİR');
  expect(staged).not.toContain('+ÜÇ');
});

test('sürüm kontrolü GitHub’a gidip gerçek yayını buluyor', async () => {
  /*
   * Ağa gerçekten çıkıyor. Sürüm kontrolünün kırıldığı yer istekten çok
   * ayrıştırma oluyor: etiket `v1.2.0`, çalışan sürüm `1.2.0` ve baştaki harf
   * unutulduğunda uygulama sonsuza kadar "yeni sürüm var" der.
   */
  const status = await call<{
    currentVersion: string;
    latestVersion: string | null;
    updateAvailable: boolean;
    releaseUrl: string | null;
    error: string | null;
  }>('app:update-check', undefined);

  /*
   * Ağ yoksa test atlanıyor, geçmiyor: sessizce geçen bir ağ testi hiçbir şey
   * doğrulamadığı hâlde yeşil görünür.
   */
  test.skip(status.error !== null, `GitHub'a ulaşılamadı: ${status.error}`);

  expect(status.latestVersion).toMatch(/^\d+\.\d+\.\d+$/);
  expect(status.releaseUrl).toContain('urhoba-git-desktop/releases');

  /*
   * Yayındaki sürümü çalıştırırken rozet çıkmamalı, eskisini çalıştırırken
   * çıkmalı. Karşılaştırma burada elle yazılıyor — testin uygulamanın kendi
   * mantığını çağırıp kendini doğrulaması bir şey kanıtlamaz.
   */
  const parse = (value: string) => value.split('.').map(Number);
  const compare = (a: number[], b: number[]) => {
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      const diff = (a[index] ?? 0) - (b[index] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  };
  const newer = compare(parse(status.latestVersion as string), parse(status.currentVersion)) > 0;
  expect(status.updateAvailable).toBe(newer);
});

test('atlanan sürüm bir daha bildirilmiyor', async () => {
  // Gerçek yayından bağımsız: kullanıcının "geç" demesi kalıcı olmalı ve
  // ağa yeniden gitmeden okunabilmeli.
  const before = await call<{ currentVersion: string }>('app:update-status', undefined);
  const [major] = before.currentVersion.split('.').map(Number);

  await call('app:update-skip', { version: `${major + 5}.0.0` });
  const after = await call<{ updateAvailable: boolean }>('app:update-status', undefined);
  expect(after.updateAvailable).toBe(false);
});

test('yeni sürüm bulununca şerit çıkıyor ve “geç” onu kaldırıyor', async () => {
  /*
   * Uygulamanın kendi sürümü yayındakiyle aynı olduğu sürece şerit hiç
   * çıkmıyor; dolayısıyla normal koşuda çizim yolu hiç denenmemiş oluyor.
   * Burada ana süreçteki `fetch` teste özel olarak değiştiriliyor — üretim
   * kodunda test için bir kapı açmak yerine testin kendi ortamı taklit ediliyor.
   *
   * Sahte etiket çalışan sürümden hesaplanıyor, sabit yazılmıyor: bu testte
   * uygulama paketlenmemiş olarak açıldığı için `app.getVersion()` Electron'un
   * sürümünü (44.x) döndürüyor, paketlenmiş uygulamada ise 1.x. Sabit bir
   * etiket ikisinden birinde yanlış tarafta kalırdı.
   */
  const before = await call<{ currentVersion: string }>('app:update-status', undefined);
  const nextMajor = Number(before.currentVersion.split('.')[0]) + 1;
  const tag = `v${nextMajor}.0.0`;

  await app.evaluate((_electron, fakeTag) => {
    (globalThis as { fetch: unknown }).fetch = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            tag_name: fakeTag,
            html_url: 'https://example.invalid/releases/tag/' + fakeTag,
            body: 'Sahte yayın',
            published_at: '2030-01-01T00:00:00Z',
            draft: false,
            prerelease: false,
          }),
      });
  }, tag);

  // Önceki test bir sürümü atlamıştı; o kayıt bunu bastırmasın.
  await call('app:update-skip', { version: '0.0.0' });

  const version = `${nextMajor}.0.0`;
  const status = await call<{ updateAvailable: boolean; latestVersion: string | null }>(
    'app:update-check',
    undefined,
  );
  expect(status).toMatchObject({ updateAvailable: true, latestVersion: version });

  /*
   * Hakkında penceresi menüden açılıyor ve kontrol oradan tetikleniyor:
   * kullanıcının gerçekten izlediği yol bu. IPC'yi doğrudan çağırmak arayüzün
   * sonucu çizip çizmediğini hiç denemezdi.
   */
  await app.evaluate(({ Menu }) => {
    const items = (Menu.getApplicationMenu()?.items ?? []).flatMap(
      (item) => item.submenu?.items ?? [],
    );
    items.find((item) => item.label.includes('Hakkında'))?.click();
  });

  await page.getByRole('button', { name: 'Şimdi kontrol et' }).click();
  await expect(page.getByText(`Sürüm ${version} çıktı`).first()).toBeVisible();

  // Pencere kapanınca şerit kenar çubuğunda kalmalı.
  await page.keyboard.press('Escape');
  const banner = page.getByText(`Sürüm ${version} çıktı`);
  await expect(banner).toBeVisible();

  // "Geç" dedikten sonra bir daha çıkmamalı.
  await page.getByRole('button', { name: 'Bu sürümü geç' }).click();
  await expect(banner).toHaveCount(0);
});

test('tepsi ayarı açılınca kapatma uygulamayı sonlandırmıyor', async () => {
  /*
   * Ayarın asıl vaadi kapatma düğmesinin anlamını değiştirmesi. Bunu yalnızca
   * ayarın diske yazıldığını doğrulayarak sınamak bir şey kanıtlamaz; pencere
   * gerçekten gizlenmeli ve uygulama ayakta kalmalı.
   */
  /*
   * Varsayılan platforma bağlı: Linux'ta kapalı, diğerlerinde açık. Linux'ta
   * tepsi simgesinin görüneceği güvenilir değil ve görünmezse kapatma düğmesi
   * uygulamayı erişilemez kılıyor.
   *
   * Bu satır kasıtlı: varsayılanı sessizce çeviren bir değişiklik, ya özelliği
   * işlevsiz bırakır ya da kullanıcıyı penceresiz bırakır — ikisi de başka
   * hiçbir testi kırmadan geçer.
   */
  const varsayilan = await call<{ tray: boolean }>('settings:get', undefined);
  expect(varsayilan.tray).toBe(process.platform !== 'linux');

  await call('settings:set', { tray: true });

  const window = page.locator('body');
  await expect(window).toBeVisible();

  // Kapatmayı pencerenin kendi olayından tetikliyoruz: kullanıcının kapatma
  // düğmesine basmasıyla aynı yol.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.close();
  });

  const state = await app.evaluate(({ BrowserWindow, app: instance }) => {
    const first = BrowserWindow.getAllWindows()[0];
    return {
      pencereVar: !!first && !first.isDestroyed(),
      görünür: first?.isVisible() ?? false,
      uygulamaAyakta: !instance.isReady || true,
    };
  });

  // Pencere yok edilmemiş, yalnızca gizlenmiş.
  expect(state.pencereVar).toBe(true);
  expect(state.görünür).toBe(false);

  // Geri getirilebilmeli, yoksa kullanıcı uygulamayı kaybeder.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.show());
  expect(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible()),
  ).toBe(true);

  // Ayarı geri kapat: sonraki testler normal kapatma davranışı bekliyor.
  await call('settings:set', { tray: false });
});

test('tepsi kapalıyken kapatma engellenmiyor', async () => {
  /*
   * Varsayılan davranış korunmalı: ayar açılmadıkça kapatma düğmesi anlamını
   * değiştirmemeli.
   *
   * Kapanma olayı gerçekten tetikleniyor ve `defaultPrevented` okunuyor —
   * tepsi dinleyicisi `createWindow` içinde önce bağlandığı için bizden önce
   * çalışıyor. Okuduktan sonra testin kendisi engelliyor, yoksa pencere yok
   * olur ve sonraki testler çalışacak bir arayüz bulamaz.
   */
  await call('settings:set', { tray: false });
  const kapaliyken = await app.evaluate(
    ({ BrowserWindow }) =>
      new Promise<boolean>((resolve) => {
        const window = BrowserWindow.getAllWindows()[0];
        window.once('close', (event) => {
          const engellendi = event.defaultPrevented;
          event.preventDefault();
          resolve(engellendi);
        });
        window.close();
      }),
  );
  expect(kapaliyken).toBe(false);

  // Aynı ölçüm ayar açıkken tersini vermeli; yoksa test ayarı değil, hep
  // aynı sonucu döndüren bir şeyi ölçüyor olurdu.
  await call('settings:set', { tray: true });
  const aciktken = await app.evaluate(
    ({ BrowserWindow }) =>
      new Promise<boolean>((resolve) => {
        const window = BrowserWindow.getAllWindows()[0];
        window.once('close', (event) => {
          const engellendi = event.defaultPrevented;
          event.preventDefault();
          resolve(engellendi);
        });
        window.close();
      }),
  );
  expect(aciktken).toBe(true);

  await call('settings:set', { tray: false });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.show());
});
