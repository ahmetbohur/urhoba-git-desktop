import { simpleGit, type SimpleGit, type SimpleGitOptions } from 'simple-git';
import { randomUUID } from 'node:crypto';
import { enqueue } from './queue';
import { emitAppEvent } from '../services/events';
import type { IpcErrorShape } from '@shared/ipc-contract';

/**
 * Git komutlarının tek giriş noktası.
 *
 * Kritik ayar `GIT_TERMINAL_PROMPT=0` ve `BatchMode=yes`: Electron'un alt süreci
 * bir terminale bağlı değil, dolayısıyla git kullanıcı adı veya SSH parolası
 * sorduğunda cevap alamaz ve komut sonsuza kadar asılı kalır. Bu iki ayar
 * "soramıyorsan hemen hata ver" demek — arka plandaki otomatik pull'un uygulamayı
 * kilitlememesi buna bağlı.
 */

/**
 * SSH komutu.
 *
 * `BatchMode=yes`: parola sorulamadığı için sorulmak yerine hemen hata versin.
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

const BASE_ENV: Record<string, string> = {
  GIT_TERMINAL_PROMPT: '0',
  SSH_ASKPASS_REQUIRE: 'never',
  // Çıktıyı ayrıştırdığımız için dilin ve renk kodlarının sabit olması şart.
  LC_ALL: 'C',
  GIT_CONFIG_PARAMETERS: "'color.ui=false'",
};

/**
 * Alt sürece verilecek ortam.
 *
 * Editör ve askpass değişkenleri bilerek siliniyor. Bir GUI'de hiçbir git komutu
 * editör açmamalı ve kimlik istemi yapmamalı; üstelik simple-git ortamda
 * `GIT_EDITOR` veya `GIT_ASKPASS` görürse komutu güvenlik gerekçesiyle tamamen
 * reddediyor. Kullanıcının kabuğunda bu değişkenler tanımlıysa — yaygın bir
 * durum — uygulamanın tamamı çalışmaz hâle gelirdi. İstemleri kapatma işini
 * `GIT_TERMINAL_PROMPT=0` ve SSH tarafında `BatchMode=yes` üstleniyor.
 */
export function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...BASE_ENV, GIT_SSH_COMMAND: sshCommand() };
  for (const name of [
    'GIT_EDITOR',
    'GIT_SEQUENCE_EDITOR',
    'EDITOR',
    'VISUAL',
    'GIT_ASKPASS',
    'SSH_ASKPASS',
  ]) {
    delete env[name];
  }
  return env;
}

function baseOptions(repoPath: string): Partial<SimpleGitOptions> {
  return {
    baseDir: repoPath,
    binary: 'git',
    maxConcurrentProcesses: 1,
    trimmed: false,
    config: ['color.ui=false'],
    // simple-git ortamdan gelen GIT_SSH_COMMAND'i varsayılan olarak reddediyor,
    // çünkü kullanıcı girdisinden gelirse komut çalıştırmaya yarar. Buradaki
    // değeri kullanıcı değil biz üretiyoruz (bkz. `sshCommand`), dolayısıyla
    // izin vermek güvenli — ve bu bayrak olmadan arka plan işleri parola
    // isteminde sonsuza kadar asılı kalır.
    unsafe: { allowUnsafeSshCommand: true },
  };
}

export function gitFor(repoPath: string): SimpleGit {
  const git = simpleGit(baseOptions(repoPath));
  git.env(childEnv());
  return git;
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
  /** Sıfır olmayan çıkış kodunun beklendiği durumlar (örn. `diff --quiet`). */
  allowFailure?: boolean;
}

export interface RunResult {
  stdout: string;
  ok: boolean;
  stderr: string;
}

/**
 * Bir git komutunu çalıştırır, süresini ölçer ve komut günlüğü paneline yayınlar.
 * Yazma komutları depo sırasına girer; salt okunur olanlar `skipQueue` ile
 * doğrudan çalışabilir.
 */
export async function run(options: RunOptions): Promise<RunResult> {
  const { repoId, repoPath, args, skipQueue = false, allowFailure = false } = options;
  const execute = async (): Promise<RunResult> => {
    const startedAt = Date.now();
    const printable = `git ${args.join(' ')}`;
    try {
      const stdout = await gitFor(repoPath).raw(args);
      emitAppEvent({
        type: 'git:command',
        entry: {
          id: randomUUID(),
          repoId,
          command: printable,
          durationMs: Date.now() - startedAt,
          ok: true,
          at: new Date().toISOString(),
        },
      });
      return { stdout, ok: true, stderr: '' };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
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
      if (allowFailure) return { stdout: '', ok: false, stderr: detail };
      throw new GitCommandError(humanizeGitError(detail), detail);
    }
  };

  if (skipQueue) return execute();
  return enqueue(repoPath, execute);
}
