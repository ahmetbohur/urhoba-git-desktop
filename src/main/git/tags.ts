import { run } from './client';
import type { Tag } from '@shared/types';

const US = '\x1f';

/**
 * Etiket yönetimi.
 *
 * Hafif (lightweight) ve açıklamalı (annotated) etiketleri ayırıyoruz: hafif
 * etiket sadece bir commit'e takılan isim, açıklamalı olan kendi mesajı ve
 * tarihi olan bir nesne. Arayüzde ikisi farklı görünmeli, çünkü sürüm etiketi
 * genelde açıklamalı olur ve mesajı sürüm notudur.
 */
export async function listTags(repoId: string, repoPath: string): Promise<Tag[]> {
  const result = await run({
    repoId,
    repoPath,
    args: [
      'for-each-ref',
      // `*objectname` açıklamalı etiketin işaret ettiği commit'i verir; hafif
      // etikette boş gelir ve `objectname` zaten commit'in kendisidir.
      `--format=%(refname:short)${US}%(objectname)${US}%(*objectname)${US}%(objecttype)${US}%(contents:subject)${US}%(creatordate:iso-strict)`,
      'refs/tags',
    ],
    skipQueue: true,
    allowFailure: true,
  });
  if (!result.ok) return [];

  return result.stdout
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [name, objectName, peeledName, objectType, subject, date] = line.split(US);
      const isAnnotated = objectType === 'tag';
      return {
        name,
        sha: isAnnotated && peeledName ? peeledName : objectName,
        message: subject ?? '',
        isAnnotated,
        taggedAt: date ?? '',
      } satisfies Tag;
    })
    .sort((a, b) => b.taggedAt.localeCompare(a.taggedAt));
}

export async function createTag(
  repoId: string,
  repoPath: string,
  name: string,
  sha: string | undefined,
  message: string | undefined,
): Promise<void> {
  const args = ['tag'];
  // Mesaj verildiyse açıklamalı etiket; `-m` olmadan git etiketi hafif oluşturur.
  if (message && message.trim().length > 0) args.push('--annotate', '--message', message.trim());
  args.push(name);
  if (sha) args.push(sha);
  await run({ repoId, repoPath, args });
}

export async function deleteTag(
  repoId: string,
  repoPath: string,
  name: string,
  remote: boolean,
): Promise<void> {
  await run({ repoId, repoPath, args: ['tag', '--delete', name] });
  if (remote) {
    // Uzak etiketi silmek ayrı bir işlem; yerelden silmek uzakta bir şey değiştirmez.
    await run({ repoId, repoPath, args: ['push', 'origin', '--delete', name] });
  }
}

export async function pushTag(repoId: string, repoPath: string, name: string): Promise<void> {
  await run({ repoId, repoPath, args: ['push', 'origin', name] });
}
