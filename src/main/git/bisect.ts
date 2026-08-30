import { run } from './client';
import type { BisectState } from '@shared/types';

/**
 * İkili arama (bisect).
 *
 * Bir hatanın hangi commit'te girdiğini bulmak için git geçmişi ikiye bölerek
 * ilerliyor: kullanıcı her adımda "burada hata var mı" sorusuna cevap veriyor.
 * Uygulama şimdiye kadar yalnızca sürmekte olan bir bisect'i algılıyordu ama
 * yürütemiyordu; komut satırına düşmek gerekiyordu.
 */

/**
 * Suçlu commit bulunduğunda git şu satırı yazıyor:
 *
 *     <sha> is the first bad commit
 *
 * Bunu yakalamak, arama bittiğinde kullanıcıya doğrudan commit'i gösterebilmek
 * için gerekiyor — aksi hâlde çıktıyı kendisi okumak zorunda kalıyor.
 */
export function parseFirstBad(output: string): string | null {
  const match = /^([0-9a-f]{7,40}) is the first bad commit/m.exec(output);
  return match ? match[1] : null;
}

/**
 * Kaç adım kaldığını git her adımda bildiriyor:
 *
 *     Bisecting: 6 revisions left to test after this (roughly 3 steps)
 */
export function parseRemaining(output: string): number | null {
  const match = /Bisecting:\s+(\d+)\s+revisions? left/m.exec(output);
  return match ? Number(match[1]) : null;
}

function toState(output: string, active: boolean): BisectState {
  const firstBadSha = parseFirstBad(output);
  return {
    // Suçlu bulunduğunda arama bitmiş sayılıyor ama depo hâlâ bisect kipinde:
    // kullanıcı sonucu görüp "bitir" demeden git'in durumu bozulmamalı.
    active,
    remaining: parseRemaining(output),
    firstBadSha,
    message: output.trim().split('\n').filter(Boolean).slice(-2).join(' '),
  };
}

/**
 * Aramayı başlatır: HEAD hatalı, verilen commit sağlam.
 *
 * İkisini birden vermek şart — git yalnızca biriyle aramaya başlamıyor, ilk
 * adımda kullanıcıdan diğerini istiyor ve arayüzde bu ara durum gereksiz bir
 * soru olarak görünüyordu.
 */
export async function start(
  repoId: string,
  repoPath: string,
  goodSha: string,
): Promise<BisectState> {
  const result = await run({
    repoId,
    repoPath,
    args: ['bisect', 'start', 'HEAD', goodSha],
    allowFailure: true,
  });
  if (!result.ok) throw new Error(result.stderr.trim() || 'Bisect başlatılamadı.');
  return toState(`${result.stdout}\n${result.stderr}`, true);
}

export async function mark(
  repoId: string,
  repoPath: string,
  verdict: 'good' | 'bad' | 'skip',
): Promise<BisectState> {
  const result = await run({
    repoId,
    repoPath,
    args: ['bisect', verdict],
    allowFailure: true,
  });
  if (!result.ok) throw new Error(result.stderr.trim() || 'İşaretlenemedi.');
  return toState(`${result.stdout}\n${result.stderr}`, true);
}

/** Aramayı bitirip başlangıçtaki dala döner. */
export async function reset(repoId: string, repoPath: string): Promise<void> {
  await run({ repoId, repoPath, args: ['bisect', 'reset'] });
}
