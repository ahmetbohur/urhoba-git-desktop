import { clipboard } from 'electron';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { SshEnvironment, SshKey, SshTestResult } from '@shared/types';

const exec = promisify(execFile);

/**
 * SSH kurulum yardımcısı.
 *
 * GitHub erişimi için tek gereken çalışan bir SSH anahtarı; uygulama anahtarı
 * kendi saklamıyor, sistemin ssh-agent'ını ve ~/.ssh dizinini kullanıyor. Bunun
 * iki faydası var: kullanıcının başka araçlarla (terminal, VS Code) paylaştığı
 * kurulum aynen çalışıyor ve biz hiçbir yerde özel anahtar tutmuyoruz.
 */

const SSH_DIR = path.join(os.homedir(), '.ssh');

interface ExecOutcome {
  stdout: string;
  stderr: string;
  code: number;
}

async function tryExec(command: string, args: string[], timeoutMs = 10_000): Promise<ExecOutcome> {
  try {
    const { stdout, stderr } = await exec(command, args, { timeout: timeoutMs });
    return { stdout, stderr, code: 0 };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number; message?: string };
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? err.message ?? '',
      // Komut hiç bulunamadıysa code string ('ENOENT') gelir; sayı değilse -1 sayıyoruz.
      code: typeof err.code === 'number' ? err.code : -1,
    };
  }
}

async function isAvailable(command: string): Promise<boolean> {
  const result = await tryExec(command, ['-V'], 3000);
  // ssh-keygen sürüm bayrağını tanımasa da "bulunamadı" dışındaki her çıkış kodu
  // programın var olduğunu gösterir.
  return result.code !== -1 || result.stderr.length > 0;
}

/** `ssh-add -l` çıktısındaki parmak izlerini toplar. */
async function agentFingerprints(): Promise<{ running: boolean; fingerprints: Set<string> }> {
  const result = await tryExec('ssh-add', ['-l'], 5000);
  // 0: yüklü anahtar var, 1: agent çalışıyor ama boş, 2: agent yok.
  if (result.code === 2 || result.code === -1) {
    return { running: false, fingerprints: new Set() };
  }
  const fingerprints = new Set<string>();
  for (const line of result.stdout.split('\n')) {
    const match = /(SHA256:[A-Za-z0-9+/=]+)/.exec(line);
    if (match) fingerprints.add(match[1]);
  }
  return { running: true, fingerprints };
}

async function readKey(publicKeyPath: string, agentKeys: Set<string>): Promise<SshKey | null> {
  let publicKey: string;
  try {
    publicKey = (await fs.promises.readFile(publicKeyPath, 'utf8')).trim();
  } catch {
    return null;
  }
  const [type = 'ssh', , comment = ''] = publicKey.split(/\s+/);

  const info = await tryExec('ssh-keygen', ['-lf', publicKeyPath], 5000);
  const fingerprintMatch = /(SHA256:[A-Za-z0-9+/=]+)/.exec(info.stdout);
  const fingerprint = fingerprintMatch ? fingerprintMatch[1] : '';

  return {
    path: publicKeyPath.replace(/\.pub$/, ''),
    publicKeyPath,
    type,
    comment,
    publicKey,
    fingerprint,
    loadedInAgent: fingerprint.length > 0 && agentKeys.has(fingerprint),
  };
}

export async function getEnvironment(): Promise<SshEnvironment> {
  const [agent, sshKeygenAvailable] = await Promise.all([
    agentFingerprints(),
    isAvailable('ssh-keygen'),
  ]);

  let entries: string[] = [];
  try {
    entries = await fs.promises.readdir(SSH_DIR);
  } catch {
    // ~/.ssh henüz yoksa anahtar listesi boş; kullanıcı arayüzden üretebilir.
    return { agentRunning: agent.running, keys: [], sshKeygenAvailable };
  }

  const keys = await Promise.all(
    entries
      .filter((name) => name.endsWith('.pub'))
      .map((name) => readKey(path.join(SSH_DIR, name), agent.fingerprints)),
  );

  return {
    agentRunning: agent.running,
    keys: keys.filter((key): key is SshKey => key !== null),
    sshKeygenAvailable,
  };
}

export async function generateKey(comment: string, fileName: string): Promise<SshKey> {
  // Dosya adında yol ayırıcısına izin vermiyoruz: üretilen anahtar ~/.ssh dışına çıkmasın.
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, '_');
  if (safeName.length === 0) throw new Error('Geçersiz dosya adı.');

  await fs.promises.mkdir(SSH_DIR, { recursive: true, mode: 0o700 });
  const keyPath = path.join(SSH_DIR, safeName);
  if (fs.existsSync(keyPath) || fs.existsSync(`${keyPath}.pub`)) {
    throw new Error(`"${safeName}" adında bir anahtar zaten var.`);
  }

  // -N "" : parolasız anahtar. Parolalı anahtar ssh-agent'a elle eklenmek zorunda
  // olduğu için arka plandaki otomatik pull'u kilitler; bunu kullanıcıya arayüzde
  // açıkça söylüyoruz.
  const result = await tryExec(
    'ssh-keygen',
    ['-t', 'ed25519', '-C', comment, '-f', keyPath, '-N', ''],
    30_000,
  );
  if (result.code !== 0) {
    throw new Error(`Anahtar üretilemedi: ${result.stderr.split('\n')[0] || 'bilinmeyen hata'}`);
  }

  // Yeni anahtarı agent'a eklemeyi deniyoruz; agent yoksa sessizce geçiyoruz.
  await tryExec('ssh-add', [keyPath], 10_000);

  const agent = await agentFingerprints();
  const key = await readKey(`${keyPath}.pub`, agent.fingerprints);
  if (!key) throw new Error('Anahtar üretildi ama okunamadı.');
  return key;
}

export async function testGithub(): Promise<SshTestResult> {
  const result = await tryExec(
    'ssh',
    ['-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', 'git@github.com'],
    15_000,
  );
  // GitHub başarılı kimlik doğrulamada bile 1 ile çıkar (kabuk vermediği için).
  const output = `${result.stdout}\n${result.stderr}`;
  const match = /Hi ([^!]+)! You've successfully authenticated/.exec(output);
  if (match) {
    return {
      ok: true,
      username: match[1],
      message: `GitHub bağlantısı çalışıyor. Kullanıcı: ${match[1]}`,
    };
  }
  if (output.includes('Permission denied')) {
    return {
      ok: false,
      username: null,
      message: 'GitHub anahtarı reddetti. Public key’i GitHub hesabına eklediğinden emin ol.',
    };
  }
  if (result.code === -1) {
    return { ok: false, username: null, message: 'Sistemde ssh komutu bulunamadı.' };
  }
  return {
    ok: false,
    username: null,
    message: output.trim().split('\n')[0] || 'GitHub’a bağlanılamadı.',
  };
}

export async function copyPublicKey(publicKeyPath: string): Promise<void> {
  const contents = await fs.promises.readFile(publicKeyPath, 'utf8');
  clipboard.writeText(contents.trim());
}
