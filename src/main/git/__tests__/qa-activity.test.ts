import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { repoActivity } from '../activity';

/** Etkinlik özetini zorlayan QA denemeleri. */

const REPO_ID = 'qa-etkinlik';
let repoPath: string;

function git(args: string[], cwd = repoPath): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  });
}

beforeEach(() => {
  repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-qa-etkinlik-'));
  git(['init', '--initial-branch=main']);
  git(['config', 'user.name', 'QA']);
  git(['config', 'user.email', 'qa@example.com']);
  git(['config', 'commit.gpgsign', 'false']);
});
afterEach(() => fs.rmSync(repoPath, { recursive: true, force: true }));

const saatOnce = (saat: number) => new Date(Date.now() - saat * 3600_000);

describe('QA — etkinlik özeti uç durumları', () => {
  it('hiç commit’i olmayan depoda çökmez', async () => {
    const activity = await repoActivity(REPO_ID, 'boş', repoPath, saatOnce(24));
    expect(activity.authored).toEqual([]);
    expect(activity.arrived).toEqual([]);
    expect(activity.hasRemote).toBe(false);
  });

  it('silinmiş depoda hata atıyor — sessizce boş dönmüyor', async () => {
    /*
     * Burada hata atması doğru: "hiçbir şey olmadı" ile "depo yok" farklı
     * şeyler ve ikincisini birinciymiş gibi raporlamak yanlış olurdu. Hatayı
     * yakalayıp o depoyu boş gösteren yer servis katmanı.
     */
    fs.rmSync(repoPath, { recursive: true, force: true });
    await expect(repoActivity(REPO_ID, 'yok', repoPath, saatOnce(24))).rejects.toThrow();
  });

  it('kullanıcının e-postası ayarlı değilse yazdıkları boş kalır', async () => {
    fs.writeFileSync(path.join(repoPath, 'a.txt'), 'bir\n');
    git(['add', '-A']);
    git(['commit', '-m', 'commit']);
    git(['config', '--unset', 'user.email']);

    const activity = await repoActivity(REPO_ID, 'e-postasız', repoPath, saatOnce(24));
    expect(activity.authored).toEqual([]);
  });

  it('birden fazla dala yazılan commit’leri de sayar', async () => {
    // `--all` olmadan yalnızca mevcut dal sayılıyor ve başka dalda çalışılan
    // bir gün özette hiç görünmüyordu.
    fs.writeFileSync(path.join(repoPath, 'a.txt'), 'bir\n');
    git(['add', '-A']);
    git(['commit', '-m', 'ana dalda']);
    git(['checkout', '-q', '-b', 'yan']);
    fs.writeFileSync(path.join(repoPath, 'b.txt'), 'iki\n');
    git(['add', '-A']);
    git(['commit', '-m', 'yan dalda']);
    git(['checkout', '-q', 'main']);

    const activity = await repoActivity(REPO_ID, 'çok dallı', repoPath, saatOnce(24));
    expect(activity.authored.map((commit) => commit.subject)).toEqual(
      expect.arrayContaining(['ana dalda', 'yan dalda']),
    );
  });

  it('aynı commit iki kez listelenmez', async () => {
    fs.writeFileSync(path.join(repoPath, 'a.txt'), 'bir\n');
    git(['add', '-A']);
    git(['commit', '-m', 'tek commit']);
    git(['branch', 'kopya']);

    const activity = await repoActivity(REPO_ID, 'kopyalı', repoPath, saatOnce(24));
    const shalar = activity.authored.map((commit) => commit.sha);
    expect(new Set(shalar).size).toBe(shalar.length);
  });

  it('gelecekteki bir başlangıçta hiçbir şey dönmez', async () => {
    fs.writeFileSync(path.join(repoPath, 'a.txt'), 'bir\n');
    git(['add', '-A']);
    git(['commit', '-m', 'commit']);

    const activity = await repoActivity(REPO_ID, 'gelecek', repoPath, new Date(Date.now() + 3600_000));
    expect(activity.authored).toEqual([]);
  });
});
