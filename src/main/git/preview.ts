import { spawn } from 'dugite';
import fs from 'node:fs';
import path from 'node:path';
import { childEnv } from './client';
import { withLimit } from './limit';
import { parseLfsPointer } from './lfs';
import type { FilePreview, PreviewKind } from '@shared/types';

/**
 * İkili dosyaların önizlemesi.
 *
 * Diff bir görüntüde, videoda ya da ses dosyasında hiçbir şey anlatmıyor: git
 * "Binary files differ" diyor ve kullanıcı neyin değiştiğini göremiyor. Bu
 * dosyalar için içeriğin kendisi gösteriliyor.
 *
 * Tarayıcı motorunun kendiliğinden çözebildiği biçimlerle sınırlı. Dönüştürme
 * yapmıyoruz: bir kod çözücü paketlemek uygulamayı büyütür ve desteklenmeyen
 * biçimde bozuk bir görüntü göstermektense hiç göstermemek daha dürüst.
 */

/** Uzantı → MIME. Chromium'un yerleşik olarak çözebildiği biçimler. */
const MIME_TYPES: Record<string, { mime: string; kind: PreviewKind }> = {
  // Görüntüler
  png: { mime: 'image/png', kind: 'image' },
  jpg: { mime: 'image/jpeg', kind: 'image' },
  jpeg: { mime: 'image/jpeg', kind: 'image' },
  gif: { mime: 'image/gif', kind: 'image' },
  webp: { mime: 'image/webp', kind: 'image' },
  avif: { mime: 'image/avif', kind: 'image' },
  bmp: { mime: 'image/bmp', kind: 'image' },
  ico: { mime: 'image/x-icon', kind: 'image' },
  svg: { mime: 'image/svg+xml', kind: 'image' },
  // Video
  mp4: { mime: 'video/mp4', kind: 'video' },
  m4v: { mime: 'video/mp4', kind: 'video' },
  webm: { mime: 'video/webm', kind: 'video' },
  ogv: { mime: 'video/ogg', kind: 'video' },
  mov: { mime: 'video/quicktime', kind: 'video' },
  // Ses
  mp3: { mime: 'audio/mpeg', kind: 'audio' },
  wav: { mime: 'audio/wav', kind: 'audio' },
  m4a: { mime: 'audio/mp4', kind: 'audio' },
  flac: { mime: 'audio/flac', kind: 'audio' },
  oga: { mime: 'audio/ogg', kind: 'audio' },
  opus: { mime: 'audio/ogg', kind: 'audio' },
  // Yazı tipleri
  woff: { mime: 'font/woff', kind: 'font' },
  woff2: { mime: 'font/woff2', kind: 'font' },
  ttf: { mime: 'font/ttf', kind: 'font' },
  otf: { mime: 'font/otf', kind: 'font' },
};

/**
 * `.ogg` hem ses hem video taşıyabiliyor; yaygın kullanım ses olduğu için
 * öyle sayılıyor. Yanlış tahminde tarayıcı sesi çalar, görüntüyü göstermez —
 * tersi durumda ise sessiz siyah bir kare çıkardı.
 */
MIME_TYPES.ogg = { mime: 'audio/ogg', kind: 'audio' };

/**
 * Önizleme için üst sınır. Bellekte tutulup arayüze aktarılıyor; büyük bir
 * video dosyasını bu yoldan geçirmek uygulamayı dondurur.
 */
const SIZE_LIMIT = 40 * 1024 * 1024;

/** Yol uzantısından önizleme türünü söyler; tanımadığında null döner. */
export function previewTypeFor(filePath: string): { mime: string; kind: PreviewKind } | null {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return MIME_TYPES[extension] ?? null;
}

/**
 * Git nesnesini ikili olarak okur.
 *
 * `run()` çıktıyı metne çeviriyor ve ikili içerik bozuluyor; bu yüzden süreç
 * doğrudan başlatılıp stdout buffer olarak toplanıyor.
 */
function readBlob(repoPath: string, ref: string, filePath: string): Promise<Buffer | null> {
  /*
   * Bu yol `run()` üzerinden geçmiyor (ikili çıktı metne çevrilmesin diye
   * süreci doğrudan başlatıyoruz), dolayısıyla eşzamanlı süreç sınırını da
   * kendisi uygulamak zorunda. Önizleme az sayıda süreç açıyor ama sınırın
   * "git'i çalıştıran her yer" kuralı delik kalırsa anlamını yitiriyor.
   */
  return withLimit(
    () =>
      new Promise<Buffer | null>((resolve) => {
        const child = spawn(['show', `${ref}:${filePath}`], repoPath, { env: childEnv() });
        const chunks: Buffer[] = [];
        let size = 0;

        child.stdout.on('data', (chunk: Buffer) => {
          size += chunk.length;
          // Sınırı aşan dosyada okumayı sürdürmenin anlamı yok; süreci kesiyoruz.
          if (size > SIZE_LIMIT) {
            child.kill();
            resolve(null);
            return;
          }
          chunks.push(chunk);
        });

        // Dosya o ref'te yoksa git hata veriyor; bu bir arıza değil, "yoktu" demek.
        child.on('close', (code) => resolve(code === 0 ? Buffer.concat(chunks) : null));
        child.on('error', () => resolve(null));
      }),
  );
}

function readWorkingTree(repoPath: string, filePath: string): Buffer | null {
  const absolute = path.resolve(repoPath, filePath);
  const root = path.resolve(repoPath);
  // Depo dışına çıkan bir yol arayüzden gelmemeli; yine de sınırı burada da
  // koruyoruz — bu fonksiyon dosya sistemine doğrudan dokunuyor.
  if (absolute !== root && !absolute.startsWith(root + path.sep)) return null;

  try {
    const stats = fs.statSync(absolute);
    if (!stats.isFile() || stats.size > SIZE_LIMIT) return null;
    return fs.readFileSync(absolute);
  } catch {
    return null;
  }
}

/**
 * Bir dosyanın belirli bir sürümünü önizlenebilir biçimde döndürür.
 *
 * `ref` null ise çalışma dizinindeki hâli okunur; aksi hâlde git nesnesi.
 * Dosya o sürümde yoksa null dönüyor — arayüz "eklendi" ya da "silindi"
 * durumunu bu boşluktan anlıyor.
 */
export async function getFilePreview(
  repoPath: string,
  filePath: string,
  ref: string | null,
): Promise<FilePreview | null> {
  const type = previewTypeFor(filePath);
  if (!type) return null;

  const content =
    ref === null ? readWorkingTree(repoPath, filePath) : await readBlob(repoPath, ref, filePath);
  if (!content) return null;

  /*
   * LFS ile takip edilen dosyada git'teki içerik üç satırlık bir işaretçi.
   * Onu görüntü diye çizmeye kalkmak bozuk bir kare gösteriyor; ne olduğunu
   * söylemek daha dürüst.
   */
  const lfs = parseLfsPointer(content);

  return {
    kind: type.kind,
    mime: type.mime,
    base64: content.toString('base64'),
    bytes: content.length,
    ...(lfs ? { lfs } : {}),
  };
}
