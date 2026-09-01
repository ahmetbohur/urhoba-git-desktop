import { dialog, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { humanizeGitError, run } from '../git/client';
import { inferGroup } from './grouping';
import { parseCloneProgress } from '../git/clone-progress';
import { emitAppEvent } from './events';
import * as store from './store';
import type { Remote, Repo, RepoEntry } from '@shared/types';

/**
 * Depo kayıtları. Bir klasörün gerçekten git deposu olduğunu `rev-parse` ile
 * doğruluyoruz; kullanıcı alt klasör seçtiyse depo köküne çıkıyoruz — insanlar
 * çoğu zaman "src" klasörünü seçip depoyu eklemek ister.
 */

async function resolveRepoRoot(candidate: string): Promise<string> {
  const result = await run({
    repoId: null,
    repoPath: candidate,
    args: ['rev-parse', '--show-toplevel'],
    skipQueue: true,
    allowFailure: true,
  });
  if (!result.ok || result.stdout.trim().length === 0) {
    throw new Error('Bu klasör bir git deposu değil.');
  }
  return path.resolve(result.stdout.trim());
}

export async function addRepo(candidatePath: string): Promise<Repo> {
  if (!fs.existsSync(candidatePath)) {
    throw new Error('Klasör bulunamadı.');
  }
  const root = await resolveRepoRoot(candidatePath);

  const existing = store.findRepoByPath(root);
  if (existing) {
    store.touchRepo(existing.id);
    return existing;
  }

  const now = new Date().toISOString();
  return store.saveRepo({
    id: randomUUID(),
    name: path.basename(root),
    path: root,
    addedAt: now,
    lastOpenedAt: now,
    groupName: inferGroup(root) ?? undefined,
  });
}

/**
 * Depo listesi, her birinin diskte durup durmadığıyla.
 *
 * Varlık kontrolü her listelemede yeniden yapılıyor; kalıcı bir alan olsaydı
 * kullanıcı klasörü geri koyduğunda ya da taşıdığında bayat kalırdı. Elli
 * depoda `existsSync` mikrosaniyelerle ölçülüyor.
 */
export function listRepos(): RepoEntry[] {
  return store.getRepos().map((repo) => ({ ...repo, missing: !fs.existsSync(repo.path) }));
}

/**
 * Deponun `origin` adresini kayda yazar.
 *
 * Klasör silindiğinde `.git/config` de gidiyor; adresi önceden kopyalamazsak
 * "yeniden klonla" sunulamıyor. Uzak sunucu listesi zaten arayüz tarafından
 * çekiliyor, o çağrının yan ürünü olarak kaydediliyor — ayrıca git komutu
 * çalıştırmıyor.
 */
/**
 * Kaybolmuş bir deponun yerini yeniden gösterir.
 *
 * Kullanıcı klasörü taşımış olabiliyor; kaydı silip yeniden eklemek grup,
 * etiket ve depoya özel ayarları da götürürdü. Yalnızca yol güncelleniyor,
 * geri kalan kayıt olduğu gibi kalıyor.
 */
export async function relocateRepo(repoId: string): Promise<Repo | null> {
  const repo = store.findRepo(repoId);
  if (!repo) throw new Error('Depo listede bulunamadı.');

  const result = await dialog.showOpenDialog({
    title: `"${repo.name}" klasörünü göster`,
    buttonLabel: 'Bu klasörü kullan',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  // Seçilen klasörün gerçekten bir depo olduğu doğrulanıyor; yanlış klasör
  // seçmek kaydı sessizce bozardı.
  const root = await resolveRepoRoot(result.filePaths[0]);

  /*
   * Başka bir kayıt zaten o yolu gösteriyorsa iki kayıt aynı depoya bakar ve
   * hangisinin ayarlarının geçerli olduğu belirsizleşir.
   */
  const conflict = store.findRepoByPath(root);
  if (conflict && conflict.id !== repoId) {
    throw new Error(`Bu klasör zaten listede: "${conflict.name}".`);
  }

  return store.updateRepo(repoId, { path: root, name: path.basename(root) }) ?? null;
}

export function rememberRemoteUrl(repoId: string, remotes: Remote[]): void {
  const origin = remotes.find((entry) => entry.name === 'origin') ?? remotes[0];
  const url = origin?.fetchUrl?.trim();
  if (!url) return;
  const repo = store.findRepo(repoId);
  if (repo?.remoteUrl === url) return;
  store.updateRepo(repoId, { remoteUrl: url });
}

export async function addRepoViaDialog(): Promise<Repo | null> {
  const result = await dialog.showOpenDialog({
    title: 'Depo klasörünü seç',
    buttonLabel: 'Depoyu ekle',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return addRepo(result.filePaths[0]);
}

export async function pickDirectory(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: 'Klonlanacak konumu seç',
    buttonLabel: 'Buraya klonla',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}

/** URL'nin son parçasından klasör adı türetir: git@github.com:a/b.git -> b */
export function repoNameFromUrl(url: string): string {
  const trimmed = url.replace(/\.git$/, '').replace(/\/$/, '');
  const lastSegment = trimmed.split(/[/:]/).pop() ?? 'depo';
  return lastSegment.length > 0 ? lastSegment : 'depo';
}

export async function cloneRepo(
  url: string,
  parentDir: string,
  name: string | undefined,
  taskId: string,
): Promise<Repo> {
  const folderName = name && name.trim().length > 0 ? name.trim() : repoNameFromUrl(url);
  const target = path.join(parentDir, folderName);

  if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
    throw new Error(`"${folderName}" klasörü zaten var ve boş değil.`);
  }

  /*
   * `--progress` bayrağı olmadan git, çıktısı bir terminale gitmediğinde
   * ilerleme basmıyor. Bu satırlar stderr'e akıyor; ayrıştırıp arayüze tek bir
   * yüzde olarak iletiyoruz.
   */
  const result = await run({
    repoId: null,
    repoPath: parentDir,
    args: ['clone', '--progress', url, target],
    allowFailure: true,
    onStderr: (chunk) => {
      const update = parseCloneProgress(chunk);
      if (!update) return;
      emitAppEvent({
        type: 'clone:progress',
        progress: { taskId, phase: update.phase, percent: update.percent },
      });
    },
  });

  if (!result.ok) {
    // Yarım kalan klasörü bırakmıyoruz: kullanıcı tekrar denediğinde "klasör
    // zaten var" hatası almasın.
    await fs.promises.rm(target, { recursive: true, force: true });
    throw new Error(humanizeGitError(result.stderr));
  }

  return addRepo(target);
}

/**
 * Bir yolu `.gitignore`'a ekler.
 *
 * Dosya yoksa oluşturulur, varsa sonuna eklenir. Aynı satır zaten varsa hiçbir
 * şey yapmıyoruz — kullanıcı iki kez tıklarsa dosyada tekrar oluşmasın.
 */
export async function ignorePath(repoPath: string, relative: string): Promise<void> {
  const gitignore = path.join(repoPath, '.gitignore');
  const entry = relative.replace(/\\/g, '/');

  let current = '';
  try {
    current = await fs.promises.readFile(gitignore, 'utf8');
  } catch {
    // Dosya yok; boş içerikle devam.
  }

  const lines = current.split('\n').map((line) => line.trim());
  if (lines.includes(entry)) return;

  const prefix = current.length === 0 || current.endsWith('\n') ? '' : '\n';
  await fs.promises.appendFile(gitignore, `${prefix}${entry}\n`, 'utf8');
}

/** Dosyayı işletim sisteminin varsayılan uygulamasında açar. */
export async function openInSystem(repoPath: string, relative: string): Promise<void> {
  const absolute = path.resolve(repoPath, relative);
  const root = path.resolve(repoPath);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    throw new Error('Depo dışındaki bir dosya açılamaz.');
  }
  const error = await shell.openPath(absolute);
  if (error) throw new Error(error);
}

export function removeRepo(id: string): void {
  store.removeRepo(id);
}

export function revealRepo(id: string): void {
  const repo = store.findRepo(id);
  if (repo) shell.openPath(repo.path);
}

/** IPC işleyicilerinin ortak ihtiyacı: id'den depo yolunu çöz, yoksa anlamlı hata ver. */
export function requireRepo(id: string): Repo {
  const repo = store.findRepo(id);
  if (!repo) throw new Error('Depo listede bulunamadı; kaldırılmış olabilir.');
  if (!fs.existsSync(repo.path)) {
    throw new Error(`Depo klasörü bulunamadı: ${repo.path}`);
  }
  return repo;
}
