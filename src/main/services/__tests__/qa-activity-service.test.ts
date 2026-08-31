import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from 'electron';

/**
 * Servis katmanı: bir deponun bozuk olması bütün özeti düşürmemeli.
 *
 * Elli depolu bir listede bir tanesi silinmişse kullanıcı diğer kırk dokuzun
 * özetini görmeye devam etmeli.
 */

const stubApp = app as unknown as { getPath: (name?: string) => string };
let dataDir: string;
let workspace: string;
let activity: typeof import('../activity');
let store: typeof import('../store');

function makeRepo(name: string): string {
  const target = path.join(workspace, name);
  fs.mkdirSync(target, { recursive: true });
  const git = (args: string[]) =>
    execFileSync('git', args, {
      cwd: target,
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    });
  git(['init', '--initial-branch=main']);
  git(['config', 'user.name', 'QA']);
  git(['config', 'user.email', 'qa@example.com']);
  git(['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(target, 'a.txt'), 'bir\n');
  git(['add', '-A']);
  git(['commit', '-m', `${name} commiti`]);
  return target;
}

beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-qa-servis-'));
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-qa-servis-repo-'));
  stubApp.getPath = () => dataDir;
  store = await import(`../store?t=${dataDir}`);
  activity = await import(`../activity?t=${dataDir}`);
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(workspace, { recursive: true, force: true });
});

describe('QA — etkinlik servisi', () => {
  it('bozuk bir depo diğerlerinin özetini düşürmüyor', async () => {
    const saglam = makeRepo('saglam');
    const silinen = makeRepo('silinen');
    store.saveRepo({
      id: 'saglam-1',
      name: 'saglam',
      path: saglam,
      addedAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
    });
    store.saveRepo({
      id: 'silinen-1',
      name: 'silinen',
      path: silinen,
      addedAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
    });
    fs.rmSync(silinen, { recursive: true, force: true });

    const summary = await activity.collectActivity('24h');

    expect(summary.repos.map((entry) => entry.repoName)).toEqual(['saglam']);
    expect(summary.authoredCount).toBe(1);
  });

  it('depo yokken boş özet döner', async () => {
    const summary = await activity.collectActivity('24h');
    expect(summary.repos).toEqual([]);
    expect(summary.authoredCount).toBe(0);
  });
});
