import { describe, expect, it } from 'vitest';
import { exec } from 'dugite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Depo klasörü yokken git süreci hiç başlamıyor.
 *
 * Bu davranış bir kullanıcının günlüğünde binlerce "Git çalıştırılamadı.
 * Uygulama kurulumu bozulmuş olabilir." satırı olarak göründü. Kurulum
 * sağlamdı: klasörü silinmiş bir depoya otomatik pull çalışıyor, git'in
 * `cwd`'si bulunamıyor ve süreç ENOENT ile düşüyordu.
 *
 * Test git'in gerçek davranışını sabitliyor. Bu varsayım değişirse — örneğin
 * dugite hatayı başka türlü raporlarsa — ayrım mantığımız sessizce yanlış
 * mesaj vermeye başlardı.
 */
describe('eksik çalışma dizini', () => {
  it('var olan klasörde git çalışıyor', async () => {
    const dizin = fs.mkdtempSync(path.join(os.tmpdir(), 'cwd-var-'));
    const sonuc = await exec(['--version'], dizin);
    expect(sonuc.exitCode).toBe(0);
    fs.rmSync(dizin, { recursive: true, force: true });
  });

  it('olmayan klasörde süreç hiç başlamıyor', async () => {
    const yok = path.join(os.tmpdir(), 'kesinlikle-olmayan-klasor-9f3a2b');
    // Hatanın türü önemli: komutun başarısız olması değil, hiç başlamaması.
    await expect(exec(['--version'], yok)).rejects.toThrow(/ENOENT/);
  });
});
