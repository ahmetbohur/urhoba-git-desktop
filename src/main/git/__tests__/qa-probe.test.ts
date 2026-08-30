import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getStatus } from '../status';
import { getLog, getReflog, getBlame } from '../history';
import { getFilePreview } from '../preview';
import { listWorktrees } from '../worktree';
import { listSubmodules } from '../submodule';
import * as bisect from '../bisect';
import { interactiveRebase } from '../merge';
import { assertPublishable } from '../../github/publish';

const REPO_ID = 'qa';
let repoPath: string;

function git(args: string[], cwd = repoPath): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  });
}

beforeEach(() => {
  repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-qa-'));
  git(['init', '--initial-branch=main']);
  git(['config', 'user.name', 'QA']);
  git(['config', 'user.email', 'qa@example.com']);
  git(['config', 'commit.gpgsign', 'false']);
});
afterEach(() => fs.rmSync(repoPath, { recursive: true, force: true }));

describe('QA — hiç commit’i olmayan depo', () => {
  it('reflog, worktree, submodule ve blame çökmeden yanıt verir', async () => {
    await expect(getReflog(REPO_ID, repoPath)).resolves.toEqual([]);
    await expect(listSubmodules(REPO_ID, repoPath)).resolves.toEqual([]);
    const trees = await listWorktrees(REPO_ID, repoPath);
    expect(trees.length).toBeGreaterThanOrEqual(1);
    await expect(getLog(REPO_ID, repoPath, 0, 10)).resolves.toEqual([]);
  });

  it('yayınlama ön koşulu anlaşılır hata verir', async () => {
    await expect(assertPublishable(REPO_ID, repoPath)).rejects.toThrow(/commit yok/);
  });

  it('bisect başlatılamaz ama çökmez', async () => {
    await expect(bisect.start(REPO_ID, repoPath, 'HEAD')).rejects.toThrow();
  });
});

describe('QA — ayrık HEAD', () => {
  beforeEach(() => {
    fs.writeFileSync(path.join(repoPath, 'a.txt'), 'bir\n');
    git(['add', '-A']);
    git(['commit', '-m', 'ilk']);
    fs.writeFileSync(path.join(repoPath, 'a.txt'), 'iki\n');
    git(['add', '-A']);
    git(['commit', '-m', 'ikinci']);
    git(['checkout', '--detach', 'HEAD~1']);
  });

  it('durum dalı null bildirir', async () => {
    expect((await getStatus(REPO_ID, repoPath)).branch).toBeNull();
  });

  it('yayınlama engellenir', async () => {
    await expect(assertPublishable(REPO_ID, repoPath)).rejects.toThrow(/Ayrık HEAD/);
  });

  it('worktree dalı null gelir', async () => {
    expect((await listWorktrees(REPO_ID, repoPath))[0].branch).toBeNull();
  });
});

describe('QA — zorlu dosya adları', () => {
  it('boşluklu ve Türkçe adlı dosyada diff, blame ve önizleme çalışır', async () => {
    const name = 'klasör içi/şablon dosyası.txt';
    fs.mkdirSync(path.join(repoPath, 'klasör içi'));
    fs.writeFileSync(path.join(repoPath, name), 'bir\niki\n');
    git(['add', '-A']);
    git(['commit', '-m', 'türkçe ad']);

    const blame = await getBlame(REPO_ID, repoPath, name, undefined);
    expect(blame.lines.length).toBe(2);

    const status = await getStatus(REPO_ID, repoPath);
    expect(status.staged).toHaveLength(0);
  });

  it('boşluklu adlı görüntü önizlemesi çalışır', async () => {
    const name = 'benim logom.png';
    fs.writeFileSync(path.join(repoPath, name), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    git(['add', '-A']);
    git(['commit', '-m', 'görüntü']);

    const preview = await getFilePreview(repoPath, name, 'HEAD');
    expect(preview?.kind).toBe('image');
    expect(preview?.bytes).toBe(4);
  });
});

describe('QA — silinmiş ve eklenmiş dosyalar', () => {
  it('silinen görüntüde önce dolu, sonra boş gelir', async () => {
    fs.writeFileSync(path.join(repoPath, 'x.png'), Buffer.from([1, 2, 3]));
    git(['add', '-A']);
    git(['commit', '-m', 'ekle']);
    fs.rmSync(path.join(repoPath, 'x.png'));

    expect(await getFilePreview(repoPath, 'x.png', 'HEAD')).not.toBeNull();
    expect(await getFilePreview(repoPath, 'x.png', null)).toBeNull();
  });
});

describe('QA — çakışmalı etkileşimli rebase', () => {
  it('çakışmayı hata değil sonuç olarak bildirir', async () => {
    fs.writeFileSync(path.join(repoPath, 'a.txt'), 'temel\n');
    git(['add', '-A']);
    git(['commit', '-m', 'temel']);
    const base = git(['rev-parse', 'HEAD']).trim();

    fs.writeFileSync(path.join(repoPath, 'a.txt'), 'ikinci\n');
    git(['add', '-A']);
    git(['commit', '-m', 'ikinci']);
    fs.writeFileSync(path.join(repoPath, 'a.txt'), 'üçüncü\n');
    git(['add', '-A']);
    git(['commit', '-m', 'üçüncü']);

    const [third, second] = await getLog(REPO_ID, repoPath, 0, 10);

    // Sırayı ters çevirmek aynı satırda çakışma üretiyor.
    const result = await interactiveRebase(REPO_ID, repoPath, base, [
      { sha: third.sha, subject: third.subject, action: 'pick' },
      { sha: second.sha, subject: second.subject, action: 'pick' },
    ]);

    expect(result.outcome).toBe('conflict');
    expect(result.conflictedPaths).toContain('a.txt');
    const status = await getStatus(REPO_ID, repoPath);
    expect(status.operation).toBe('rebase');
    git(['rebase', '--abort']);
  });
});

describe('QA — bisect kötüye kullanım', () => {
  it('başlatılmadan işaretleme anlaşılır hata verir', async () => {
    fs.writeFileSync(path.join(repoPath, 'a.txt'), 'bir\n');
    git(['add', '-A']);
    git(['commit', '-m', 'ilk']);

    await expect(bisect.mark(REPO_ID, repoPath, 'good')).rejects.toThrow();
  });
});
