import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Eski kayıtların yeni biçime taşınması.
 *
 * Bu kodun kırılması en sessiz hâliyle ortaya çıkıyor: kullanıcı güncelliyor,
 * uygulama hatasız açılıyor, ama ayarları varsayılana dönmüş ya da depo
 * listesi düzensiz oluyor. Kimse hata görmediği için kimse bildirmiyor.
 *
 * Testler dosyayı elle yazıp modülü taze yüklüyor — göç yalnızca ilk okumada
 * çalışıyor.
 */

const stubApp = app as unknown as { getPath: (name?: string) => string };
let dataDir: string;

function yaz(icerik: unknown): void {
  fs.writeFileSync(path.join(dataDir, 'urhoba-store.json'), JSON.stringify(icerik), 'utf8');
}

async function yukle(): Promise<typeof import('../store')> {
  return import(`../store?t=${dataDir}`);
}

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-gocs-'));
  stubApp.getPath = () => dataDir;
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('ayar göçleri', () => {
  it('eski ai.enabled alanını yeni yerine taşıyor', async () => {
    /*
     * AI'ın açık olması eskiden `ai.enabled` idi. Taşınmazsa kullanıcı
     * güncellemeden sonra AI'ı kapanmış buluyor ve neden kapandığını
     * anlamıyor.
     */
    yaz({ settings: { ai: { provider: 'ollama', model: '', enabled: true } }, repos: [] });
    const store = await yukle();
    expect(store.getSettings().defaults.aiEnabled).toBe(true);
  });

  it('eski ai.enabled false ise onu da taşıyor', async () => {
    // Yalnızca true'yu taşımak, kapatmış kullanıcıya AI'ı geri açardı.
    yaz({ settings: { ai: { enabled: false } }, repos: [] });
    const store = await yukle();
    expect(store.getSettings().defaults.aiEnabled).toBe(false);
  });

  it('yeni alan varsa eski alanı dinlemiyor', async () => {
    // Kullanıcı yeni sürümde ayarı değiştirdiyse eski alan bayat kalmış olur.
    yaz({
      settings: { ai: { enabled: true }, defaults: { aiEnabled: false } },
      repos: [],
    });
    const store = await yukle();
    expect(store.getSettings().defaults.aiEnabled).toBe(false);
  });

  it('eski defaultAutoPull alanını yeni yerine taşıyor', async () => {
    yaz({
      settings: {
        defaultAutoPull: { enabled: true, intervalMinutes: 42, onlyWhenClean: false, fastForwardOnly: false },
      },
      repos: [],
    });
    const store = await yukle();
    const autoPull = store.getSettings().defaults.autoPull;
    expect(autoPull.enabled).toBe(true);
    expect(autoPull.intervalMinutes).toBe(42);
    expect(autoPull.onlyWhenClean).toBe(false);
  });

  it('eksik alanları varsayılanla tamamlıyor', async () => {
    // Yeni bir ayar eklendiğinde eski dosyada o alan yok; tanımsız kalırsa
    // arayüz boş bir anahtar gösterir ya da çöker.
    yaz({ settings: { theme: 'dark' }, repos: [] });
    const store = await yukle();
    const ayarlar = store.getSettings();
    expect(ayarlar.theme).toBe('dark');
    expect(ayarlar.language).toBe('tr');
    expect(ayarlar.defaults.autoPull.intervalMinutes).toBeGreaterThan(0);
    expect(typeof ayarlar.updateCheck).toBe('boolean');
  });

  it('grup bilgisi olmayan depolara yolundan grup çıkarıyor', async () => {
    yaz({
      settings: {},
      repos: [
        {
          id: 'a',
          name: 'portal-base',
          path: '/home/biri/Projeler/musteri/portal-base',
          lastOpenedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const store = await yukle();
    expect(store.getRepos()[0].groupName).toBe('musteri');
  });

  it('bozuk dosyada varsayılana düşüyor ve dosyayı yedekliyor', async () => {
    /*
     * Bozuk dosyayı olduğu gibi silmek kullanıcının depo listesini geri
     * dönülemez biçimde yok ederdi; yedek bırakmak elle kurtarma şansı
     * bırakıyor.
     */
    fs.writeFileSync(path.join(dataDir, 'urhoba-store.json'), '{ bozuk json', 'utf8');
    const store = await yukle();
    expect(store.getRepos()).toEqual([]);
    expect(store.getSettings().language).toBe('tr');

    const yedekler = fs.readdirSync(dataDir).filter((ad) => ad.includes('.corrupt-'));
    expect(yedekler).toHaveLength(1);
  });

  it('dosya hiç yokken varsayılanlarla başlıyor', async () => {
    const store = await yukle();
    expect(store.getRepos()).toEqual([]);
    expect(store.getSettings().defaults.aiEnabled).toBe(false);
  });

  it('taşınan ayarları diske yazıyor', async () => {
    /*
     * Göç yalnızca bellekte kalsaydı her açılışta yeniden çalışırdı ve eski
     * alan sonsuza kadar dosyada dururdu; kullanıcı yeni sürümde ayarı
     * değiştirse bile eski alan onu ezmeye devam ederdi.
     */
    yaz({
      settings: {},
      repos: [
        {
          id: 'a',
          name: 'x',
          path: '/home/biri/Projeler/grup/x',
          lastOpenedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const store = await yukle();
    expect(store.getRepos()[0].groupName).toBe('grup');

    const diskte = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'urhoba-store.json'), 'utf8'),
    ) as { repos: Array<{ groupName?: string }> };
    expect(diskte.repos[0].groupName).toBe('grup');
  });
});
