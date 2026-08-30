import { describe, expect, it } from 'vitest';
import { parseWorktrees } from '../worktree';

/**
 * Bir dal aynı anda yalnızca bir çalışma ağacında açık olabiliyor. Liste
 * yanlış okunursa arayüz ya var olmayan bir engel gösteriyor ya da kullanıcıyı
 * git'in anlaşılmaz "already used by worktree" hatasına bırakıyor.
 */
describe('parseWorktrees', () => {
  const raw = [
    'worktree /home/kullanici/proje',
    'HEAD 02532a9471602742179e1d2ee716688b68412fe1',
    'branch refs/heads/main',
    '',
    'worktree /home/kullanici/proje-ozellik',
    'HEAD 9a1f0b6d2c3e4f5061728394a5b6c7d8e9f0a1b2',
    'branch refs/heads/ozellik',
    '',
  ].join('\n');

  it('bütün ağaçları ayırır', () => {
    const trees = parseWorktrees(raw);

    expect(trees).toHaveLength(2);
    expect(trees[0].path).toBe('/home/kullanici/proje');
    expect(trees[1].path).toBe('/home/kullanici/proje-ozellik');
  });

  it('dal adından ref önekini atar', () => {
    expect(parseWorktrees(raw).map((tree) => tree.branch)).toEqual(['main', 'ozellik']);
  });

  it('ilk ağacı ana ağaç sayar', () => {
    // Git listeyi her zaman ana ağaçla başlatıyor.
    const trees = parseWorktrees(raw);
    expect(trees[0].isMain).toBe(true);
    expect(trees[1].isMain).toBe(false);
  });

  it('ayrık HEAD’de dalı null bırakır', () => {
    const trees = parseWorktrees(
      ['worktree /home/kullanici/proje', 'HEAD 02532a9', 'detached', ''].join('\n'),
    );

    expect(trees[0].branch).toBeNull();
  });

  it('kilitli ağacı işaretler', () => {
    const trees = parseWorktrees(
      [
        'worktree /home/kullanici/proje',
        'HEAD 02532a9',
        'branch refs/heads/main',
        '',
        'worktree /mnt/usb/proje',
        'HEAD 02532a9',
        'branch refs/heads/yedek',
        'locked taşınabilir disk',
        '',
      ].join('\n'),
    );

    expect(trees[1].locked).toBe(true);
  });

  it('boş çıktıda boş liste döner', () => {
    expect(parseWorktrees('')).toEqual([]);
  });
});
