import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import { exec as execGit } from 'dugite';
import { randomUUID } from 'node:crypto';
import { enqueue } from './queue';
import { withLimit } from './limit';
import { emitAppEvent } from '../services/events';
import { log } from '../services/logger';
import type { IpcErrorShape } from '@shared/ipc-channels';

/**
 * Git komutlarının tek giriş noktası.
 *
 * Alt sürecin ortamı özenle kuruluyor:
 *
 * - `GIT_TERMINAL_PROMPT=0` ve SSH tarafında `BatchMode=yes`: Electron'un alt
 *   süreci bir terminale bağlı değil, dolayısıyla git kullanıcı adı veya SSH
 *   parolası sorduğunda cevap alamaz ve komut sonsuza kadar asılı kalır. Bu iki
 *   ayar "soramıyorsan hemen hata ver" demek — arka plandaki otomatik pull'un
 *   uygulamayı kilitlememesi buna bağlı.
 * - `GIT_EDITOR=true`: editör gereken yerlerde (rebase --continue gibi) "true"
 *   komutu çalışıp hemen başarıyla çıkar, git de varsayılan mesajla devam eder.
 * - `LC_ALL=C` ve renk kapalı: çıktıyı ayrıştırdığımız için dilin ve kaçış
 *   kodlarının sabit olması şart.
 * - Editör ve askpass değişkenleri kullanıcının kabuğundan sızmasın diye
 *   siliniyor: makineden makineye değişen davranış en zor bulunan hata türü.
 */

/**
 * SSH komutu.
 *
 * `StrictHostKeyChecking=accept-new`: bilinmeyen sunucunun anahtarını ilk
 * bağlantıda kabul et, sonradan değişirse reddet. `yes` olsaydı her yeni sunucu
 * elle müdahale isteyecekti, `no` ise anahtar değişimini de sessizce geçerdi.
 *
 * Kullanıcının kendi `GIT_SSH_COMMAND` ayarı varsa (özel anahtar, proxy komutu)
 * onu ezmiyor, üstüne kendi bayraklarımızı ekliyoruz.
 */
function sshCommand(): string {
  const existing = process.env.GIT_SSH_COMMAND?.trim();
  if (existing && existing.length > 0) return `${existing} -o BatchMode=yes`;
  return 'ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new';
}

export function childEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }

  for (const name of ['GIT_ASKPASS', 'SSH_ASKPASS', 'GIT_SEQUENCE_EDITOR', 'EDITOR', 'VISUAL']) {
    delete env[name];
  }

  return {
    ...env,
    GIT_TERMINAL_PROMPT: '0',
    SSH_ASKPASS_REQUIRE: 'never',
    GIT_EDITOR: 'true',
    GIT_SSH_COMMAND: sshCommand(),
    LC_ALL: 'C',
    GIT_CONFIG_PARAMETERS: "'color.ui=false'",
    ...extra,
  };
}

export class GitCommandError extends Error {
  constructor(
    message: string,
    readonly detail: string,
  ) {
    super(message);
    this.name = 'GitCommandError';
  }
}

export function toIpcError(error: unknown): IpcErrorShape {
  if (error instanceof GitCommandError) {
    return { __urhobaError: true, message: error.message, detail: error.detail };
  }
  if (error instanceof Error) {
    return { __urhobaError: true, message: error.message };
  }
  return { __urhobaError: true, message: String(error) };
}

/** Git'in ham stderr çıktısını kullanıcıya gösterilebilir bir cümleye çevirir. */
export function humanizeGitError(raw: string): string {
  const text = raw.toLowerCase();
  if (text.includes('permission denied (publickey)')) {
    return 'Sunucu SSH anahtarını kabul etmedi. Anahtarın ssh-agent’a yüklü ve GitHub hesabına ekli olduğundan emin ol.';
  }
  if (text.includes('could not read from remote repository')) {
    return 'Uzak depoya erişilemedi. Adres doğru mu ve erişim yetkin var mı?';
  }
  if (text.includes('terminal prompts disabled') || text.includes('authentication failed')) {
    return 'Kimlik doğrulama başarısız. HTTPS yerine SSH adresi kullanmayı veya anahtarını ssh-agent’a eklemeyi dene.';
  }
  if (text.includes('index.lock')) {
    return 'Depoda başka bir git işlemi sürüyor. Birkaç saniye sonra tekrar dene.';
  }
  if (text.includes('not a git repository')) {
    return 'Bu klasör bir git deposu değil.';
  }
  if (text.includes('would be overwritten by merge') || text.includes('local changes')) {
    return 'Yerel değişikliklerin üzerine yazılacağı için işlem durduruldu. Önce commit’le veya stash’le.';
  }
  if (text.includes('refusing to merge unrelated histories')) {
    return 'İki geçmiş birbiriyle ilişkisiz; git bunları kendiliğinden birleştirmeyi reddediyor.';
  }
  if (text.includes('non-fast-forward') || text.includes('fetch first')) {
    return 'Uzak dalda senin bilmediğin commit’ler var. Önce pull et.';
  }
  const firstLine = raw.split('\n').find((line) => line.trim().length > 0);
  return firstLine?.trim() ?? 'Git komutu başarısız oldu.';
}

interface RunOptions {
  /** Günlükte ve hata mesajlarında görünecek repo kimliği. */
  repoId: string | null;
  repoPath: string;
  args: string[];
  /** Sıraya alınmadan çalışsın mı — sadece salt okunur, hızlı komutlar için. */
  skipQueue?: boolean;
  /** Sıfır olmayan çıkış kodunun beklendiği durumlar (örn. çakışan merge). */
  allowFailure?: boolean;
  /** İlerleme çıktısı üreten komutlar için stderr akışı. */
  onStderr?: (chunk: string) => void;
  /**
   * Bu komuta özel ortam değişkenleri. Ortak ayarların üstüne biniyor —
   * etkileşimli rebase'in kendi sıra editörünü vermesi gibi durumlar için.
   */
  env?: Record<string, string>;
}

export interface RunResult {
  stdout: string;
  ok: boolean;
  stderr: string;
  exitCode: number;
}

/**
 * Bir git komutunu çalıştırır, süresini ölçer ve komut günlüğü paneline yayınlar.
 * Yazma komutları depo sırasına girer; salt okunur olanlar `skipQueue` ile
 * doğrudan çalışabilir.
 */
export async function run(options: RunOptions): Promise<RunResult> {
  const {
    repoId,
    repoPath,
    args,
    skipQueue = false,
    allowFailure = false,
    onStderr,
    env: extraEnv,
  } = options;

  const execute = async (): Promise<RunResult> => {
    const startedAt = Date.now();
    const printable = `git ${args.join(' ')}`;

    let result: { stdout: string; stderr: string; exitCode: number };
    try {
      // Eşzamanlı süreç sayısı burada sınırlanıyor; gerekçesi `limit.ts` içinde.
      result = await withLimit(() =>
        execGit(args, repoPath, {
          env: childEnv(extraEnv),
          processCallback: onStderr
            ? (child: ChildProcess) => {
                child.stderr?.on('data', (chunk: Buffer) => onStderr(chunk.toString('utf8')));
              }
            : undefined,
        }),
      );
    } catch (error) {
      // Buraya yalnızca git süreci hiç başlatılamazsa düşüyoruz; komutun
      // başarısız olması normal yoldan `exitCode` ile geliyor.
      const detail = error instanceof Error ? error.message : String(error);

      /*
       * Süreç başlatılamamasının en yaygın sebebi bozuk kurulum değil, depo
       * klasörünün yokluğu: git'in `cwd`'si bulunmayınca süreç hiç başlamıyor
       * ve ENOENT ile düşüyor.
       *
       * Ayrım burada yapılıyor çünkü tek bir mesaj ikisini birden karşılayınca
       * yanlış yeri gösteriyor. Bir kullanıcının günlüğünde binlerce "kurulum
       * bozulmuş olabilir" satırı birikmişti; kurulum sağlamdı, klasörü
       * silinmiş bir depoya otomatik pull çalışıyordu.
       *
       * Kontrol yalnızca hata yolunda yapılıyor: her komuttan önce diske
       * bakmak, sorunun nadirliğine göre gereksiz iş olurdu.
       */
      const klasorYok = !fs.existsSync(repoPath);
      emitAppEvent({
        type: 'git:command',
        entry: {
          id: randomUUID(),
          repoId,
          command: printable,
          durationMs: Date.now() - startedAt,
          ok: false,
          error: detail,
          at: new Date().toISOString(),
        },
      });
      log('error', klasorYok ? 'Depo klasörü bulunamadı' : 'Git süreci başlatılamadı', {
        detail,
        komut: printable,
        depoYolu: repoPath,
        gitYolu: process.env.LOCAL_GIT_DIRECTORY ?? '(dugite varsayılanı)',
      });
      throw new GitCommandError(
        klasorYok
          ? `Depo klasörü bulunamadı: ${repoPath}`
          : 'Git çalıştırılamadı. Uygulama kurulumu bozulmuş olabilir.',
        detail,
      );
    }

    const ok = result.exitCode === 0;
    emitAppEvent({
      type: 'git:command',
      entry: {
        id: randomUUID(),
        repoId,
        command: printable,
        durationMs: Date.now() - startedAt,
        ok,
        error: ok ? undefined : result.stderr,
        at: new Date().toISOString(),
      },
    });

    if (!ok && !allowFailure) {
      throw new GitCommandError(humanizeGitError(result.stderr), result.stderr);
    }
    return { stdout: result.stdout, stderr: result.stderr, ok, exitCode: result.exitCode };
  };

  if (skipQueue) return execute();
  return enqueue(repoPath, execute);
}

/**
 * Uygulamanın kullandığı git sürümü — tanılama panelinde gösteriliyor.
 * Gömülü git kullanıldığı için bu, kullanıcının sisteminde kurulu git'ten
 * bağımsızdır ve her makinede aynı sürümü verir.
 */
export async function getGitVersion(): Promise<string> {
  try {
    const result = await execGit(['--version'], process.cwd(), { env: childEnv() });
    return result.stdout.trim();
  } catch {
    return 'bilinmiyor';
  }
}
