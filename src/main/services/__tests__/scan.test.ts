import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanForRepositories } from '../scan';

/**
 * Tarama, kullanıcının bütün proje klasörünü gezdiği için yanlış davranışı
 * pahalı: fazla derine inerse dakikalarca sürer, depoların içine girerse
 * submodule'leri ayrı proje sanır. Bu testler her iki sınırı da ölçüyor.
 */

let root: string;

function makeRepo(relative: string, branch = 'main'): string {
  const target = path.join(root, relative);
  fs.mkdirSync(target, { recursive: true });
  execFileSync('git', ['init', `--initial-branch=${branch}`], { cwd: target });
  return target;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-scan-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('scanForRepositories', () => {
  it('doğrudan alt klasörlerdeki depoları bulur', () => {
    makeRepo('proje-a');
    makeRepo('proje-b');
    fs.mkdirSync(path.join(root, 'depo-olmayan'), { recursive: true });

    const found = scanForRepositories(root);

    expect(found.map((repo) => repo.name).sort()).toEqual(['proje-a', 'proje-b']);
  });

  it('derinlerdeki depoları da bulur', () => {
    makeRepo(path.join('musteri', 'ekip', 'proje-c'));
    const found = scanForRepositories(root, 4);
    expect(found.map((repo) => repo.name)).toEqual(['proje-c']);
    expect(found[0].relativePath).toBe(path.join('musteri', 'ekip', 'proje-c'));
  });

  it('derinlik sınırının ötesine inmez', () => {
    makeRepo(path.join('bir', 'iki', 'uc', 'dort', 'derin-proje'));
    expect(scanForRepositories(root, 2)).toHaveLength(0);
    expect(scanForRepositories(root, 5)).toHaveLength(1);
  });

  it('bir deponun içindeki depoları ayrı proje saymaz', () => {
    const outer = makeRepo('ana-proje');
    fs.mkdirSync(path.join(outer, 'vendor', 'ic-depo'), { recursive: true });
    execFileSync('git', ['init'], { cwd: path.join(outer, 'vendor', 'ic-depo') });

    const found = scanForRepositories(root);

    expect(found.map((repo) => repo.name)).toEqual(['ana-proje']);
  });

  it('ağır ve gizli klasörleri atlar', () => {
    makeRepo(path.join('node_modules', 'paket'));
    makeRepo(path.join('.cache', 'gizli-proje'));
    makeRepo('gorunur-proje');

    const found = scanForRepositories(root);

    expect(found.map((repo) => repo.name)).toEqual(['gorunur-proje']);
  });

  it('geçerli dalı git çalıştırmadan okur', () => {
    makeRepo('dal-testi', 'gelistirme');
    const [found] = scanForRepositories(root);
    expect(found.currentBranch).toBe('gelistirme');
  });

  it('ayrık HEAD durumunda dal adı vermez', () => {
    const repo = makeRepo('ayrik');
    fs.writeFileSync(path.join(repo, '.git', 'HEAD'), 'a'.repeat(40) + '\n');
    const [found] = scanForRepositories(root);
    expect(found.currentBranch).toBeNull();
  });

  it('taranan klasörün kendisi depoysa onu döner', () => {
    const repo = makeRepo('tek-proje');
    const found = scanForRepositories(repo);
    expect(found).toHaveLength(1);
    expect(found[0].relativePath).toBe('tek-proje');
  });

  it('olmayan klasörde anlaşılır hata verir', () => {
    expect(() => scanForRepositories(path.join(root, 'yok'))).toThrow(/Klasör bulunamadı/);
  });

  it('okunamayan klasörler taramayı durdurmaz', () => {
    makeRepo('erisilebilir');
    const blocked = path.join(root, 'kapali');
    fs.mkdirSync(blocked);
    fs.chmodSync(blocked, 0o000);

    try {
      const found = scanForRepositories(root);
      expect(found.map((repo) => repo.name)).toEqual(['erisilebilir']);
    } finally {
      fs.chmodSync(blocked, 0o755);
    }
  });
});
