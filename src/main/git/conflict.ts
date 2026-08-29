import fs from 'node:fs';
import path from 'node:path';
import { run } from './client';
import type { ConflictChoice, ConflictFile, ConflictSection } from '@shared/types';

/**
 * Çakışma işaretlerinin okunması ve çözülmesi.
 *
 * Git çakışan dosyayı diske işaretlerle yazıyor; biz bu metni bölümlere ayırıp
 * arayüzde her çakışma için "bizimki / onlarki / ikisi" seçimi sunuyoruz.
 * Kapsamı bilerek dar tuttuk: karmaşık durumlarda (ikili dosya, iç içe geçmiş
 * işaretler) kullanıcıyı harici editöre yönlendiriyoruz. Yarım yamalak bir
 * birleştirme aracı, hiç olmamasından daha tehlikeli.
 */

const START = '<<<<<<< ';
const BASE = '||||||| ';
const SEPARATOR = '=======';
const END = '>>>>>>> ';

export function parseConflictSections(contents: string): ConflictSection[] {
  const lines = contents.split('\n');
  const sections: ConflictSection[] = [];
  let stable: string[] = [];

  const flushStable = () => {
    if (stable.length > 0) {
      sections.push({ kind: 'stable', lines: stable });
      stable = [];
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.startsWith(START)) {
      stable.push(line);
      continue;
    }

    flushStable();
    const oursLabel = line.slice(START.length).trim() || 'bizimki';
    const ours: string[] = [];
    const theirs: string[] = [];
    let theirsLabel = 'onlarki';
    let phase: 'ours' | 'base' | 'theirs' = 'ours';
    i += 1;

    for (; i < lines.length; i += 1) {
      const inner = lines[i];
      if (inner.startsWith(BASE)) {
        // diff3 biçiminde ortak ata bölümü: gösterime katmıyoruz.
        phase = 'base';
        continue;
      }
      if (inner === SEPARATOR) {
        phase = 'theirs';
        continue;
      }
      if (inner.startsWith(END)) {
        theirsLabel = inner.slice(END.length).trim() || 'onlarki';
        break;
      }
      if (phase === 'ours') ours.push(inner);
      else if (phase === 'theirs') theirs.push(inner);
    }

    sections.push({ kind: 'conflict', ours, theirs, oursLabel, theirsLabel });
  }

  flushStable();
  return sections;
}

/** İçerikte NUL baytı varsa metin olarak birleştirmeye çalışmıyoruz. */
function looksBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, 8000).includes(0);
}

function resolveInRepo(repoPath: string, relative: string): string {
  const absolute = path.resolve(repoPath, relative);
  const root = path.resolve(repoPath);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    throw new Error('Depo dışındaki bir yola erişilemez.');
  }
  return absolute;
}

export async function readConflict(
  repoPath: string,
  filePath: string,
): Promise<ConflictFile> {
  const absolute = resolveInRepo(repoPath, filePath);
  const buffer = await fs.promises.readFile(absolute);
  if (looksBinary(buffer)) {
    return { path: filePath, sections: [], isBinary: true };
  }
  return {
    path: filePath,
    sections: parseConflictSections(buffer.toString('utf8')),
    isBinary: false,
  };
}

export function applyChoices(sections: ConflictSection[], choices: ConflictChoice[]): string {
  const output: string[] = [];
  let conflictIndex = 0;

  for (const section of sections) {
    if (section.kind === 'stable') {
      output.push(...section.lines);
      continue;
    }
    const choice = choices[conflictIndex] ?? 'ours';
    conflictIndex += 1;
    if (choice === 'ours') output.push(...section.ours);
    else if (choice === 'theirs') output.push(...section.theirs);
    else output.push(...section.ours, ...section.theirs);
  }

  return output.join('\n');
}

/**
 * Seçimleri dosyaya yazar ve dosyayı hazırlar.
 * Git'te bir çakışmanın "çözüldü" sayılması dosyanın index'e eklenmesiyle olur.
 */
export async function resolveConflict(
  repoId: string,
  repoPath: string,
  filePath: string,
  choices: ConflictChoice[],
): Promise<void> {
  const conflict = await readConflict(repoPath, filePath);
  if (conflict.isBinary) {
    throw new Error('İkili dosyalar bu ekrandan çözülemez.');
  }
  const expected = conflict.sections.filter((section) => section.kind === 'conflict').length;
  if (choices.length !== expected) {
    // Dosya arayüz açıldıktan sonra değişmiş demektir; yanlış bölüme yazmaktansa
    // kullanıcıdan tazelemesini istiyoruz.
    throw new Error('Dosya değişmiş görünüyor. Çakışmaları yeniden yükle.');
  }

  const absolute = resolveInRepo(repoPath, filePath);
  await fs.promises.writeFile(absolute, applyChoices(conflict.sections, choices), 'utf8');
  await run({ repoId, repoPath, args: ['add', '--', filePath] });
}
