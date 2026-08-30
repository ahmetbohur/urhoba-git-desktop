import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getBranches, createBranch, checkout } from '../branches';
import { commit, discard, getFileDiff, getStatus, stage, unstage } from '../status';
import { getCommitDetail, getLog } from '../history';
import { pull, push } from '../remote';
import { interactiveRebase } from '../merge';

/**
 * Gerçek git süreçlerine karşı uçtan uca testler.
 *
 * Ayrıştırıcı birim testleri git'in çıktısını doğru okuduğumuzu gösteriyor ama
 * o çıktının gerçekten beklediğimiz biçimde geldiğini göstermiyor: git sürümleri
 * arasında bayrak davranışları değişiyor. Bu testler her seferinde geçici bir
 * depo kurup komutları gerçekten çalıştırıyor.
 */

const REPO_ID = 'test-repo';
let repoPath: string;

function git(args: string[], cwd = repoPath): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  });
}

function write(relative: string, contents: string): void {
  const target = path.join(repoPath, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, 'utf8');
}

beforeEach(() => {
  repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-test-'));
  git(['init', '--initial-branch=main']);
  git(['config', 'user.name', 'Test Kullanıcı']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'commit.gpgsign', 'false']);
});

afterEach(() => {
  fs.rmSync(repoPath, { recursive: true, force: true });
});

describe('çalışma dizini akışı', () => {
  it('boş depoyu ilk commit’ten önce doğru raporlar', async () => {
    const status = await getStatus(REPO_ID, repoPath);
    expect(status.branch).toBe('main');
    expect(status.isEmptyRepo).toBe(true);
    expect(status.upstream).toBeNull();
    expect(status.staged).toHaveLength(0);
  });

  it('takip edilmeyen dosyayı hazırlar, commit’ler ve geçmişte gösterir', async () => {
    write('src/app.ts', 'const a = 1;\n');

    const before = await getStatus(REPO_ID, repoPath);
    expect(before.unstaged).toEqual([
      { path: 'src/app.ts', kind: 'untracked', isBinary: false },
    ]);

    await stage(REPO_ID, repoPath, ['src/app.ts']);
    const staged = await getStatus(REPO_ID, repoPath);
    expect(staged.staged.map((f) => [f.path, f.kind])).toEqual([['src/app.ts', 'added']]);
    expect(staged.unstaged).toHaveLength(0);

    const result = await commit(REPO_ID, repoPath, 'Uygulamayı ekle', 'Gövde satırı', false);
    expect(result.sha).toMatch(/^[0-9a-f]{40}$/);

    const log = await getLog(REPO_ID, repoPath, 0, 10);
    expect(log).toHaveLength(1);
    expect(log[0].subject).toBe('Uygulamayı ekle');
    expect(log[0].body).toBe('Gövde satırı');
    expect(log[0].authorName).toBe('Test Kullanıcı');
    expect(log[0].parents).toEqual([]);
    expect(log[0].refs).toContainEqual({ name: 'main', kind: 'local', isHead: true });

    const detail = await getCommitDetail(REPO_ID, repoPath, result.sha);
    expect(detail.files.map((f) => f.path)).toEqual(['src/app.ts']);
    expect(detail.additions).toBe(1);
  });

  it('ilk commit’i olmayan depoda hazırlıktan çıkarabilir', async () => {
    // Bu yol `git restore --staged` yerine `git rm --cached` gerektiriyor:
    // HEAD henüz yokken restore çalışmıyor.
    write('yeni.txt', 'içerik\n');
    await stage(REPO_ID, repoPath, ['yeni.txt']);
    expect((await getStatus(REPO_ID, repoPath)).staged).toHaveLength(1);

    await unstage(REPO_ID, repoPath, ['yeni.txt']);
    const status = await getStatus(REPO_ID, repoPath);
    expect(status.staged).toHaveLength(0);
    expect(status.unstaged[0].kind).toBe('untracked');
  });

  it('değiştirilen dosyanın diff’ini satır numaralarıyla üretir', async () => {
    write('src/app.ts', 'bir\niki\nüç\n');
    await stage(REPO_ID, repoPath, ['src/app.ts']);
    await commit(REPO_ID, repoPath, 'İlk', undefined, false);

    write('src/app.ts', 'bir\nİKİ\nüç\n');
    const diff = await getFileDiff(REPO_ID, repoPath, 'src/app.ts', false);

    expect(diff.additions).toBe(1);
    expect(diff.deletions).toBe(1);
    const changed = diff.hunks[0].lines.filter((line) => line.kind !== 'context');
    expect(changed.map((line) => [line.kind, line.content])).toEqual([
      ['del', 'iki'],
      ['add', 'İKİ'],
    ]);
  });

  it('takip edilmeyen dosyanın diff’ini de gösterir', async () => {
    write('src/app.ts', 'bir\n');
    await stage(REPO_ID, repoPath, ['src/app.ts']);
    await commit(REPO_ID, repoPath, 'İlk', undefined, false);

    write('yeni.txt', 'satır bir\nsatır iki\n');
    const diff = await getFileDiff(REPO_ID, repoPath, 'yeni.txt', false);

    expect(diff.additions).toBe(2);
    expect(diff.hunks[0].lines.map((line) => line.kind)).toEqual(['add', 'add']);
  });

  it('yeniden adlandırmayı eski yoluyla birlikte raporlar', async () => {
    write('eski.ts', 'içerik\n'.repeat(20));
    await stage(REPO_ID, repoPath, ['eski.ts']);
    await commit(REPO_ID, repoPath, 'İlk', undefined, false);

    git(['mv', 'eski.ts', 'yeni.ts']);
    const status = await getStatus(REPO_ID, repoPath);

    expect(status.staged).toHaveLength(1);
    expect(status.staged[0]).toMatchObject({ path: 'yeni.ts', oldPath: 'eski.ts', kind: 'renamed' });
  });

  it('takip edilen ve edilmeyen dosyaları birlikte geri alır', async () => {
    write('takipli.txt', 'orijinal\n');
    await stage(REPO_ID, repoPath, ['takipli.txt']);
    await commit(REPO_ID, repoPath, 'İlk', undefined, false);

    write('takipli.txt', 'bozuldu\n');
    write('cop.txt', 'silinecek\n');

    await discard(REPO_ID, repoPath, ['takipli.txt', 'cop.txt']);

    expect(fs.readFileSync(path.join(repoPath, 'takipli.txt'), 'utf8')).toBe('orijinal\n');
    expect(fs.existsSync(path.join(repoPath, 'cop.txt'))).toBe(false);
    expect((await getStatus(REPO_ID, repoPath)).unstaged).toHaveLength(0);
  });

  it('yarım kalmış birleştirmeyi tespit eder', async () => {
    write('catisma.txt', 'temel\n');
    await stage(REPO_ID, repoPath, ['catisma.txt']);
    await commit(REPO_ID, repoPath, 'Temel', undefined, false);

    git(['checkout', '-b', 'yan']);
    write('catisma.txt', 'yan dal\n');
    await stage(REPO_ID, repoPath, ['catisma.txt']);
    await commit(REPO_ID, repoPath, 'Yan', undefined, false);

    git(['checkout', 'main']);
    write('catisma.txt', 'ana dal\n');
    await stage(REPO_ID, repoPath, ['catisma.txt']);
    await commit(REPO_ID, repoPath, 'Ana', undefined, false);

    try {
      git(['merge', 'yan']);
    } catch {
      // Çakışma bekleniyor.
    }

    const status = await getStatus(REPO_ID, repoPath);
    expect(status.operation).toBe('merge');
    expect(status.conflicted.map((f) => f.path)).toEqual(['catisma.txt']);
  });
});

describe('dallar', () => {
  it('dal oluşturur, geçer ve listeler', async () => {
    write('a.txt', 'a\n');
    await stage(REPO_ID, repoPath, ['a.txt']);
    await commit(REPO_ID, repoPath, 'İlk', undefined, false);

    await createBranch(REPO_ID, repoPath, 'özellik/yeni-ekran', undefined, true);
    expect((await getStatus(REPO_ID, repoPath)).branch).toBe('özellik/yeni-ekran');

    const branches = await getBranches(REPO_ID, repoPath);
    expect(branches.current).toBe('özellik/yeni-ekran');
    expect(branches.local.map((b) => b.fullName).sort()).toEqual(['main', 'özellik/yeni-ekran']);

    await checkout(REPO_ID, repoPath, 'main');
    expect((await getStatus(REPO_ID, repoPath)).branch).toBe('main');
  });
});

describe('uzak sunucu akışı', () => {
  let remotePath: string;

  beforeEach(() => {
    remotePath = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-remote-'));
    git(['init', '--bare', '--initial-branch=main'], remotePath);
    git(['remote', 'add', 'origin', remotePath]);

    write('a.txt', 'ilk\n');
    execFileSync('git', ['add', 'a.txt'], { cwd: repoPath });
    execFileSync('git', ['commit', '-m', 'İlk'], { cwd: repoPath });
  });

  afterEach(() => {
    fs.rmSync(remotePath, { recursive: true, force: true });
  });

  it('upstream yokken push ederken upstream kurar', async () => {
    const result = await push(REPO_ID, repoPath, false);
    expect(result.ok).toBe(true);
    expect(result.upstreamSet).toBe(true);

    const status = await getStatus(REPO_ID, repoPath);
    expect(status.upstream).toBe('origin/main');
    expect(status.ahead).toBe(0);
  });

  it('upstream yokken pull’u sessizce atlar', async () => {
    const result = await pull(REPO_ID, repoPath, { fastForwardOnly: true, requireClean: true });
    expect(result.outcome).toBe('skipped-no-upstream');
    expect(result.commitsPulled).toBe(0);
  });

  it('uzak sunucudaki yeni commit’i fast-forward ile çeker', async () => {
    await push(REPO_ID, repoPath, false);

    // Başka bir klonda commit üretip uzak sunucuya gönderiyoruz: bizim depomuz
    // artık geride kalmış oluyor.
    const otherPath = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-other-'));
    execFileSync('git', ['clone', remotePath, otherPath]);
    execFileSync('git', ['config', 'user.name', 'Diğer'], { cwd: otherPath });
    execFileSync('git', ['config', 'user.email', 'diger@example.com'], { cwd: otherPath });
    fs.writeFileSync(path.join(otherPath, 'b.txt'), 'uzaktan\n');
    execFileSync('git', ['add', 'b.txt'], { cwd: otherPath });
    execFileSync('git', ['commit', '-m', 'Uzaktan gelen'], { cwd: otherPath });
    execFileSync('git', ['push'], { cwd: otherPath });

    const result = await pull(REPO_ID, repoPath, { fastForwardOnly: true, requireClean: true });

    expect(result.outcome).toBe('fast-forwarded');
    expect(result.commitsPulled).toBe(1);
    expect(fs.existsSync(path.join(repoPath, 'b.txt'))).toBe(true);

    fs.rmSync(otherPath, { recursive: true, force: true });
  });

  it('çalışma dizini kirliyken otomatik pull’u atlar', async () => {
    await push(REPO_ID, repoPath, false);
    write('a.txt', 'yerel değişiklik\n');

    const result = await pull(REPO_ID, repoPath, { fastForwardOnly: true, requireClean: true });
    expect(result.outcome).toBe('skipped-dirty');
    expect(fs.readFileSync(path.join(repoPath, 'a.txt'), 'utf8')).toBe('yerel değişiklik\n');
  });

  it('geçmişler ayrıldığında fast-forward-only modunda birleştirme yapmaz', async () => {
    await push(REPO_ID, repoPath, false);

    const otherPath = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-other-'));
    execFileSync('git', ['clone', remotePath, otherPath]);
    execFileSync('git', ['config', 'user.name', 'Diğer'], { cwd: otherPath });
    execFileSync('git', ['config', 'user.email', 'diger@example.com'], { cwd: otherPath });
    fs.writeFileSync(path.join(otherPath, 'b.txt'), 'uzaktan\n');
    execFileSync('git', ['add', 'b.txt'], { cwd: otherPath });
    execFileSync('git', ['commit', '-m', 'Uzaktan'], { cwd: otherPath });
    execFileSync('git', ['push'], { cwd: otherPath });

    // Yerelde de ayrı bir commit: artık iki taraf da ilerlemiş durumda.
    write('c.txt', 'yerel\n');
    await stage(REPO_ID, repoPath, ['c.txt']);
    await commit(REPO_ID, repoPath, 'Yerel', undefined, false);

    const result = await pull(REPO_ID, repoPath, { fastForwardOnly: true, requireClean: true });

    expect(result.outcome).toBe('skipped-diverged');
    expect(fs.existsSync(path.join(repoPath, 'b.txt'))).toBe(false);

    fs.rmSync(otherPath, { recursive: true, force: true });
  });
});

describe('etkileşimli rebase', () => {
  it('commit’leri birleştirir ve atar', async () => {
    write('a.txt', 'bir\n');
    git(['add', '-A']);
    git(['commit', '-m', 'temel']);
    const base = git(['rev-parse', 'HEAD']).trim();

    write('b.txt', 'iki\n');
    git(['add', '-A']);
    git(['commit', '-m', 'ikinci']);
    write('c.txt', 'üç\n');
    git(['add', '-A']);
    git(['commit', '-m', 'üçüncü']);
    write('d.txt', 'dört\n');
    git(['add', '-A']);
    git(['commit', '-m', 'dördüncü']);

    const before = await getLog(REPO_ID, repoPath, 0, 20);
    const [fourth, third, second] = before;

    const result = await interactiveRebase(REPO_ID, repoPath, base, [
      { sha: second.sha, subject: second.subject, action: 'pick' },
      { sha: third.sha, subject: third.subject, action: 'fixup' },
      { sha: fourth.sha, subject: fourth.subject, action: 'drop' },
    ]);

    expect(result.outcome).toBe('merged');

    const after = await getLog(REPO_ID, repoPath, 0, 20);
    // Dört commit'ten geriye temel + birleşmiş ikinci kalıyor.
    expect(after).toHaveLength(2);
    expect(after[0].subject).toBe('ikinci');
    // Birleştirilen commit'in dosyası duruyor, atılanınki gitmiş olmalı.
    expect(fs.existsSync(path.join(repoPath, 'c.txt'))).toBe(true);
    expect(fs.existsSync(path.join(repoPath, 'd.txt'))).toBe(false);
  });

  it('en eski commit birleştirilmek istenirse hiçbir şey yapmaz', async () => {
    write('a.txt', 'bir\n');
    git(['add', '-A']);
    git(['commit', '-m', 'temel']);
    const base = git(['rev-parse', 'HEAD']).trim();
    write('b.txt', 'iki\n');
    git(['add', '-A']);
    git(['commit', '-m', 'ikinci']);

    const [second] = await getLog(REPO_ID, repoPath, 0, 5);

    await expect(
      interactiveRebase(REPO_ID, repoPath, base, [
        { sha: second.sha, subject: second.subject, action: 'squash' },
      ]),
    ).rejects.toThrow(/En eski commit/);

    // Depo dokunulmamış kalmalı: doğrulama git'i hiç çalıştırmadan durduruyor.
    const after = await getLog(REPO_ID, repoPath, 0, 5);
    expect(after).toHaveLength(2);
  });
});
