import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Genel ayar ile depo ayarının ilişkisi.
 *
 * Kritik davranış: geçersiz kılınmayan bir alan genel ayarı *izlemeye devam
 * ediyor. Yani genel ayar sonradan değiştiğinde o depo da değişiyor. Kayıt
 * sırasında çözülmüş değeri saklasaydık depo genel ayardan sessizce kopardı ve
 * kullanıcı "genel ayarı değiştirdim ama bu depo eskisi gibi" derdi.
 */

const stubApp = app as unknown as { getPath: (name?: string) => string };
let dataDir: string;
let store: typeof import('../store');

beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-settings-'));
  stubApp.getPath = () => dataDir;
  // Modül kendi içinde önbellek tuttuğu için her testte taze yükleniyor.
  store = await import(`../store?t=${dataDir}`);
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('genel ve depo ayarları', () => {
  it('depo ayarı yokken genel varsayılanı verir', () => {
    store.updateSettings({
      defaults: {
        autoFetch: false,
        allowCloudAi: true,
        aiEnabled: true,
        autoPull: { enabled: true, intervalMinutes: 5, onlyWhenClean: false, fastForwardOnly: false },
      },
    });

    const settings = store.getRepoSettings('depo-1');

    expect(settings.autoFetch).toBe(false);
    expect(settings.allowCloudAi).toBe(true);
    expect(settings.autoPull.intervalMinutes).toBe(5);
    expect(settings.aiEnabled).toBe(true);
    expect(settings.overrides).toEqual({
      autoPull: false,
      autoFetch: false,
      allowCloudAi: false,
      aiEnabled: false,
    });
  });

  it('yalnızca geçersiz kılınan alanı depoya özel yapar', () => {
    store.updateRepoSettings('depo-1', { autoFetch: false });

    const settings = store.getRepoSettings('depo-1');
    expect(settings.autoFetch).toBe(false);
    expect(settings.overrides.autoFetch).toBe(true);
    // Dokunulmayan alanlar genel ayarı izlemeye devam ediyor.
    expect(settings.overrides.allowCloudAi).toBe(false);
  });

  it('geçersiz kılınmayan alan genel ayar değişince değişir', () => {
    store.updateRepoSettings('depo-1', { autoFetch: false });

    store.updateSettings({
      defaults: { ...store.getSettings().defaults, allowCloudAi: true },
    });

    const settings = store.getRepoSettings('depo-1');
    expect(settings.allowCloudAi).toBe(true);
    // Depoya özel olan alan genel değişiklikten etkilenmemeli.
    expect(settings.autoFetch).toBe(false);
  });

  it('geçersiz kılınan alan genel ayar değişince değişmez', () => {
    store.updateRepoSettings('depo-1', { autoFetch: false });
    store.updateSettings({
      defaults: { ...store.getSettings().defaults, autoFetch: true },
    });

    expect(store.getRepoSettings('depo-1').autoFetch).toBe(false);
  });

  it('null ile genel ayara dönülür', () => {
    store.updateRepoSettings('depo-1', { autoFetch: false });
    expect(store.getRepoSettings('depo-1').overrides.autoFetch).toBe(true);

    store.updateRepoSettings('depo-1', { autoFetch: null });

    const settings = store.getRepoSettings('depo-1');
    expect(settings.overrides.autoFetch).toBe(false);
    expect(settings.autoFetch).toBe(store.getSettings().defaults.autoFetch);
  });

  it('bütün alanlar genele döndüğünde depo kaydı kalmaz', () => {
    store.updateRepoSettings('depo-1', { autoFetch: false, allowCloudAi: true });
    store.updateRepoSettings('depo-1', { autoFetch: null, allowCloudAi: null });

    const settings = store.getRepoSettings('depo-1');
    expect(settings.overrides).toEqual({
      autoPull: false,
      autoFetch: false,
      allowCloudAi: false,
      aiEnabled: false,
    });
  });

  it('depolar birbirinin ayarını etkilemez', () => {
    store.updateRepoSettings('depo-1', { allowCloudAi: true });

    expect(store.getRepoSettings('depo-2').allowCloudAi).toBe(
      store.getSettings().defaults.allowCloudAi,
    );
  });

  it('AI bir depoda kapatılınca diğer depolar genel ayarı izlemeye devam eder', () => {
    store.updateSettings({
      defaults: {
        autoFetch: true,
        allowCloudAi: false,
        aiEnabled: true,
        autoPull: {
          enabled: false,
          intervalMinutes: 10,
          onlyWhenClean: true,
          fastForwardOnly: true,
        },
      },
    });
    store.updateRepoSettings('gizli-depo', { aiEnabled: false });

    expect(store.getRepoSettings('gizli-depo').aiEnabled).toBe(false);
    expect(store.getRepoSettings('gizli-depo').overrides.aiEnabled).toBe(true);
    expect(store.getRepoSettings('baska-depo').aiEnabled).toBe(true);
  });

  it('depoya özel AI ayarı genelden geri alınabiliyor', () => {
    store.updateRepoSettings('depo-1', { aiEnabled: true });
    expect(store.getRepoSettings('depo-1').overrides.aiEnabled).toBe(true);

    store.updateRepoSettings('depo-1', { aiEnabled: null });

    const settings = store.getRepoSettings('depo-1');
    expect(settings.overrides.aiEnabled).toBe(false);
    expect(settings.aiEnabled).toBe(false);
  });
});
