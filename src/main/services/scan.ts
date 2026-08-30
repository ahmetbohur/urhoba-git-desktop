import fs from 'node:fs';
import path from 'node:path';
import * as store from './store';
import type { ScannedRepo } from '@shared/types';

/**
 * Bir klasör ağacında git depolarını arar.
 *
 * Tasarım kararları:
 *
 * - Bir klasörde `.git` bulununca içine inilmiyor. Depoların içinde başka
 *   depolar (submodule, vendor kopyaları) olabiliyor ve bunlar kullanıcının
 *   "projelerim" listesinde görmek istediği şeyler değil.
 * - Dal adı `.git/HEAD` dosyasından okunuyor, git komutu çalıştırılmadan.
 *   Otuz depo için otuz alt süreç başlatmak taramayı gözle görülür yavaşlatırdı.
 * - Ağır klasörler (node_modules, sanal ortamlar, derleme çıktıları) atlanıyor;
 *   bunların içinde depo bulunması beklenmiyor ama taramayı dakikalarca
 *   uzatabiliyorlar.
 */

const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'vendor',
  'dist',
  'build',
  'out',
  'target',
  '.venv',
  'venv',
  '__pycache__',
  '.next',
  '.nuxt',
  '.cache',
  'Library',
  'Applications',
]);

const MAX_ENTRIES = 20_000;

/** `.git/HEAD` dosyasından geçerli dal adını okur. */
function readCurrentBranch(repoPath: string): string | null {
  try {
    const head = fs.readFileSync(path.join(repoPath, '.git', 'HEAD'), 'utf8').trim();
    const match = /^ref:\s*refs\/heads\/(.+)$/.exec(head);
    // Ayrık HEAD durumunda dosyada dal adı değil doğrudan bir sha bulunur.
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function isGitRepository(candidate: string): boolean {
  try {
    // Worktree ve submodule'lerde `.git` bir dosya olabiliyor; ikisini de kabul ediyoruz.
    return fs.existsSync(path.join(candidate, '.git'));
  } catch {
    return false;
  }
}

export function scanForRepositories(root: string, maxDepth = 4): ScannedRepo[] {
  const resolvedRoot = path.resolve(root);
  if (!fs.existsSync(resolvedRoot)) {
    throw new Error('Klasör bulunamadı.');
  }

  const known = new Set(store.getRepos().map((repo) => path.resolve(repo.path)));
  const found: ScannedRepo[] = [];
  // Genişlik öncelikli tarama: yüzeye yakın depolar önce bulunuyor, derinlik
  // sınırına takılan ağaçlarda kullanıcı en azından üst seviyedekileri görüyor.
  const queue: Array<{ dir: string; depth: number }> = [{ dir: resolvedRoot, depth: 0 }];
  let visited = 0;

  while (queue.length > 0) {
    const { dir, depth } = queue.shift() as { dir: string; depth: number };
    if (visited >= MAX_ENTRIES) break;
    visited += 1;

    if (isGitRepository(dir)) {
      found.push({
        path: dir,
        name: path.basename(dir),
        relativePath: path.relative(resolvedRoot, dir) || path.basename(dir),
        currentBranch: readCurrentBranch(dir),
        alreadyAdded: known.has(dir),
      });
      // Depo bulundu; alt ağaca inmiyoruz.
      continue;
    }

    if (depth >= maxDepth) continue;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      // İzin verilmeyen klasörler taramayı durdurmamalı.
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      // Gizli klasörler genelde araç yapılandırması; proje deposu değiller.
      if (entry.name.startsWith('.')) continue;
      queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
    }
  }

  return found.sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'tr'));
}
