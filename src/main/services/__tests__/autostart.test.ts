import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getStatus, setEnabled } from '../autostart';

/**
 * Otomatik başlatma platforma göre iki farklı yolla çalışıyor ve Linux tarafı
 * tamamen bizim yazdığımız kod. Yanlış davranışı sinsi: kullanıcı anahtarı
 * açıyor, hiçbir hata görmüyor ama uygulama açılışta gelmiyor.
 */

const stubApp = app as unknown as { isPackaged: boolean };
let home: string;

function desktopFile(): string {
  return path.join(home, 'autostart', 'urhoba-git-desktop.desktop');
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-autostart-'));
  process.env.XDG_CONFIG_HOME = home;
  stubApp.isPackaged = true;
});

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
  stubApp.isPackaged = false;
});

describe('otomatik başlatma', () => {
  it('geliştirme ortamında sebebiyle birlikte kapalı', () => {
    stubApp.isPackaged = false;
    const status = getStatus();

    expect(status.supported).toBe(false);
    expect(status.enabled).toBe(false);
    expect(status.reason).toMatch(/kurulu uygulamada/);
  });

  it('başlangıçta kapalı', () => {
    expect(getStatus()).toMatchObject({ supported: true, enabled: false });
  });

  it('açınca autostart girdisi oluşturur', () => {
    const status = setEnabled(true);

    expect(status.enabled).toBe(true);
    expect(fs.existsSync(desktopFile())).toBe(true);
  });

  it('girdide çalıştırılabilir yolu tırnak içinde yazar', () => {
    setEnabled(true);
    const contents = fs.readFileSync(desktopFile(), 'utf8');

    // Boşluk içeren kurulum yollarında tırnak olmazsa girdi sessizce çalışmaz.
    expect(contents).toContain('Exec="/opt/urhoba/urhoba-git-desktop"');
    expect(contents).toContain('Type=Application');
    expect(contents).toContain('X-GNOME-Autostart-enabled=true');
  });

  it('kapatınca girdiyi siler', () => {
    setEnabled(true);
    const status = setEnabled(false);

    expect(status.enabled).toBe(false);
    expect(fs.existsSync(desktopFile())).toBe(false);
  });

  it('durumu ayar dosyasından değil diskten okur', () => {
    setEnabled(true);
    // Kullanıcı girdiyi sistem ayarlarından silmiş olabilir; bizim raporumuz
    // buna uymak zorunda.
    fs.rmSync(desktopFile());

    expect(getStatus().enabled).toBe(false);
  });

  it('zaten kapalıyken kapatmak hata vermez', () => {
    expect(() => setEnabled(false)).not.toThrow();
    expect(getStatus().enabled).toBe(false);
  });
});
