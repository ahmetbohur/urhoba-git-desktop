import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Test ortamı yalıtımı.
 *
 * Git komutları kullanıcının `~/.gitconfig` ayarlarını okur; orada `rerere`,
 * özel bir merge sürücüsü veya farklı bir `conflictStyle` tanımlıysa testler
 * geliştiricinin makinesine göre farklı davranır — nitekim çakışma testleri
 * ilk çalıştırmada bu yüzden yanlış sonuç verdi.
 *
 * Yalıtımı `GIT_CONFIG_GLOBAL` ile değil `HOME`'u boş bir dizine yönlendirerek
 * yapıyoruz: simple-git, ortamda yapılandırma yolu değişkeni görürse komutu
 * güvenlik gerekçesiyle reddediyor ve bunun için üretim kodundaki korumayı
 * gevşetmek gerekirdi. Testin uğruna üretimi zayıflatmak yanlış takas.
 */
const isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-home-'));
process.env.HOME = isolatedHome;
process.env.USERPROFILE = isolatedHome;
process.env.XDG_CONFIG_HOME = path.join(isolatedHome, '.config');
// Sistem genelindeki /etc/gitconfig da devre dışı kalsın.
process.env.GIT_CONFIG_NOSYSTEM = '1';
