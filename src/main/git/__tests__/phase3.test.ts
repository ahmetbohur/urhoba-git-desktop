import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBranch, checkout } from '../branches';
import { getLog } from '../history';
import { addRemote, getRemotes, push, removeRemote, setRemoteUrl } from '../remote';
import { reset, revert } from '../rewrite';
import { commit, getStatus, stage } from '../status';
import { createTag, deleteTag, listTags } from '../tags';

const REPO_ID = 'test-repo';
let repoPath: string;

function git(args: string[], cwd = repoPath): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function write(relative: string, contents: string): void {
  const target = path.join(repoPath, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, 'utf8');
}

function read(relative: string): string {
  return fs.readFileSync(path.join(repoPath, relative), 'utf8');
}

/** Belirli bir yazar ve tarihle commit üretmek için doğrudan git kullanıyoruz. */
function commitAs(message: string, author: string, date: string): void {
  execFileSync('git', ['add', '-A'], { cwd: repoPath });
  execFileSync('git', ['commit', '-m', message, '--author', author], {
    cwd: repoPath,
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
}

beforeEach(() => {
  repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-p3-'));
  git(['init', '--initial-branch=main']);
  git(['config', 'user.name', 'Test Kullanıcı']);
  git(['config', 'user.email', 'test@example.com']);
});

afterEach(() => {
  fs.rmSync(repoPath, { recursive: true, force: true });
});

async function seed(): Promise<string> {
  write('app.txt', 'ilk\n');
  await stage(REPO_ID, repoPath, ['app.txt']);
  const result = await commit(REPO_ID, repoPath, 'İlk commit', undefined, false);
  return result.sha;
}

describe('geçmiş filtreleme', () => {
  beforeEach(() => {
    write('a.txt', 'a\n');
    commitAs('Giriş ekranı eklendi', 'Ayşe <ayse@example.com>', '2026-01-15T10:00:00+03:00');
    write('b.txt', 'b\n');
    commitAs('Hata düzeltmesi', 'Mehmet <mehmet@example.com>', '2026-03-20T10:00:00+03:00');
    write('a.txt', 'a2\n');
    commitAs('Giriş ekranı iyileştirildi', 'Ayşe <ayse@example.com>', '2026-06-10T10:00:00+03:00');
  });

  it('filtresiz bütün commit’leri döner', async () => {
    const commits = await getLog(REPO_ID, repoPath, 0, 50);
    expect(commits).toHaveLength(3);
  });

  it('yazara göre süzer', async () => {
    const commits = await getLog(REPO_ID, repoPath, 0, 50, undefined, { author: 'Ayşe' });
    expect(commits.map((c) => c.subject)).toEqual([
      'Giriş ekranı iyileştirildi',
      'Giriş ekranı eklendi',
    ]);
  });

  it('mesaja göre büyük/küçük harf duyarsız süzer', async () => {
    const commits = await getLog(REPO_ID, repoPath, 0, 50, undefined, { message: 'HATA' });
    expect(commits.map((c) => c.subject)).toEqual(['Hata düzeltmesi']);
  });

  it('mesaj filtresini düz metin olarak arar, regex olarak değil', async () => {
    // Nokta regex'te "herhangi bir karakter" demek; düz metin araması eşleşmemeli.
    const commits = await getLog(REPO_ID, repoPath, 0, 50, undefined, { message: 'Hat.' });
    expect(commits).toHaveLength(0);
  });

  it('dosya yoluna göre süzer', async () => {
    const commits = await getLog(REPO_ID, repoPath, 0, 50, undefined, { path: 'b.txt' });
    expect(commits.map((c) => c.subject)).toEqual(['Hata düzeltmesi']);
  });

  it('tarih aralığına göre süzer', async () => {
    const commits = await getLog(REPO_ID, repoPath, 0, 50, undefined, {
      since: '2026-02-01',
      until: '2026-04-01',
    });
    expect(commits.map((c) => c.subject)).toEqual(['Hata düzeltmesi']);
  });

  it('filtreleri birlikte uygular', async () => {
    const commits = await getLog(REPO_ID, repoPath, 0, 50, undefined, {
      author: 'Ayşe',
      path: 'a.txt',
      since: '2026-05-01',
    });
    expect(commits.map((c) => c.subject)).toEqual(['Giriş ekranı iyileştirildi']);
  });

  it('sayfalama filtreyle birlikte çalışır', async () => {
    const page = await getLog(REPO_ID, repoPath, 1, 1, undefined, { author: 'Ayşe' });
    expect(page.map((c) => c.subject)).toEqual(['Giriş ekranı eklendi']);
  });
});

describe('revert', () => {
  it('değişikliği geri alan yeni bir commit üretir, geçmişi silmez', async () => {
    await seed();
    write('app.txt', 'ikinci\n');
    await stage(REPO_ID, repoPath, ['app.txt']);
    const second = await commit(REPO_ID, repoPath, 'İkinci', undefined, false);

    const result = await revert(REPO_ID, repoPath, second.sha);

    expect(result.outcome).toBe('reverted');
    expect(read('app.txt')).toBe('ilk\n');
    // Geçmiş kısalmadı: üç commit var (ilk, ikinci, revert).
    const commits = await getLog(REPO_ID, repoPath, 0, 10);
    expect(commits).toHaveLength(3);
    expect(commits[0].subject).toContain('Revert');
  });

  it('çakışan revert’i hata değil çözülecek durum olarak raporlar', async () => {
    await seed();
    write('app.txt', 'ikinci\n');
    await stage(REPO_ID, repoPath, ['app.txt']);
    const second = await commit(REPO_ID, repoPath, 'İkinci', undefined, false);

    // Aynı satırı bir kez daha değiştir: ikinci commit'i geri almak çakışır.
    write('app.txt', 'üçüncü\n');
    await stage(REPO_ID, repoPath, ['app.txt']);
    await commit(REPO_ID, repoPath, 'Üçüncü', undefined, false);

    const result = await revert(REPO_ID, repoPath, second.sha);

    expect(result.outcome).toBe('conflict');
    expect(result.conflictedPaths).toEqual(['app.txt']);
    expect((await getStatus(REPO_ID, repoPath)).operation).toBe('revert');
  });
});

describe('reset', () => {
  it('soft modda değişiklikleri hazırlıkta bırakır', async () => {
    const first = await seed();
    write('app.txt', 'ikinci\n');
    await stage(REPO_ID, repoPath, ['app.txt']);
    await commit(REPO_ID, repoPath, 'İkinci', undefined, false);

    await reset(REPO_ID, repoPath, first, 'soft');

    const status = await getStatus(REPO_ID, repoPath);
    expect(status.staged.map((f) => f.path)).toEqual(['app.txt']);
    expect(read('app.txt')).toBe('ikinci\n');
    expect(await getLog(REPO_ID, repoPath, 0, 10)).toHaveLength(1);
  });

  it('mixed modda değişiklikleri hazırlık dışına alır', async () => {
    const first = await seed();
    write('app.txt', 'ikinci\n');
    await stage(REPO_ID, repoPath, ['app.txt']);
    await commit(REPO_ID, repoPath, 'İkinci', undefined, false);

    await reset(REPO_ID, repoPath, first, 'mixed');

    const status = await getStatus(REPO_ID, repoPath);
    expect(status.staged).toHaveLength(0);
    expect(status.unstaged.map((f) => f.path)).toEqual(['app.txt']);
    expect(read('app.txt')).toBe('ikinci\n');
  });

  it('hard modda çalışma dizinini de geri alır', async () => {
    const first = await seed();
    write('app.txt', 'ikinci\n');
    await stage(REPO_ID, repoPath, ['app.txt']);
    await commit(REPO_ID, repoPath, 'İkinci', undefined, false);

    await reset(REPO_ID, repoPath, first, 'hard');

    const status = await getStatus(REPO_ID, repoPath);
    expect(status.staged).toHaveLength(0);
    expect(status.unstaged).toHaveLength(0);
    expect(read('app.txt')).toBe('ilk\n');
  });
});

describe('etiketler', () => {
  it('hafif ve açıklamalı etiketi ayırt eder', async () => {
    const sha = await seed();
    await createTag(REPO_ID, repoPath, 'v1.0-hafif', sha, undefined);
    await createTag(REPO_ID, repoPath, 'v1.0', sha, 'İlk kararlı sürüm');

    const tags = await listTags(REPO_ID, repoPath);
    const light = tags.find((tag) => tag.name === 'v1.0-hafif');
    const annotated = tags.find((tag) => tag.name === 'v1.0');

    expect(light).toMatchObject({ isAnnotated: false, sha });
    expect(annotated).toMatchObject({ isAnnotated: true, message: 'İlk kararlı sürüm', sha });
  });

  it('belirli bir commit’e etiket takar', async () => {
    const first = await seed();
    write('app.txt', 'ikinci\n');
    await stage(REPO_ID, repoPath, ['app.txt']);
    await commit(REPO_ID, repoPath, 'İkinci', undefined, false);

    await createTag(REPO_ID, repoPath, 'v0.9', first, 'Eski sürüm');

    const tags = await listTags(REPO_ID, repoPath);
    expect(tags[0].sha).toBe(first);
  });

  it('etiketi siler', async () => {
    const sha = await seed();
    await createTag(REPO_ID, repoPath, 'gecici', sha, undefined);
    expect(await listTags(REPO_ID, repoPath)).toHaveLength(1);

    await deleteTag(REPO_ID, repoPath, 'gecici', false);
    expect(await listTags(REPO_ID, repoPath)).toHaveLength(0);
  });

  it('etiket geçmişte ref olarak görünür', async () => {
    const sha = await seed();
    await createTag(REPO_ID, repoPath, 'v1.0', sha, 'Sürüm');

    const commits = await getLog(REPO_ID, repoPath, 0, 10);
    expect(commits[0].refs).toContainEqual({ name: 'v1.0', kind: 'tag' });
  });
});

describe('uzak sunucu yönetimi', () => {
  it('remote ekler, adresini değiştirir ve siler', async () => {
    await seed();

    await addRemote(REPO_ID, repoPath, 'upstream', 'https://example.com/a.git');
    let remotes = await getRemotes(REPO_ID, repoPath);
    expect(remotes.map((r) => r.name)).toEqual(['upstream']);
    expect(remotes[0].fetchUrl).toBe('https://example.com/a.git');

    await setRemoteUrl(REPO_ID, repoPath, 'upstream', 'https://example.com/b.git');
    remotes = await getRemotes(REPO_ID, repoPath);
    expect(remotes[0].fetchUrl).toBe('https://example.com/b.git');

    await removeRemote(REPO_ID, repoPath, 'upstream');
    expect(await getRemotes(REPO_ID, repoPath)).toHaveLength(0);
  });

  it('zorlamalı gönderim uzakta bilinmeyen commit varsa reddedilir', async () => {
    const remotePath = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-remote-'));
    git(['init', '--bare', '--initial-branch=main'], remotePath);

    await seed();
    await addRemote(REPO_ID, repoPath, 'origin', remotePath);
    await push(REPO_ID, repoPath, true);

    // Başka bir klon uzak dalı ilerletiyor; bizim depomuzun haberi yok.
    const otherPath = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-other-'));
    execFileSync('git', ['clone', remotePath, otherPath]);
    execFileSync('git', ['config', 'user.name', 'Diğer'], { cwd: otherPath });
    execFileSync('git', ['config', 'user.email', 'd@e.c'], { cwd: otherPath });
    fs.writeFileSync(path.join(otherPath, 'yeni.txt'), 'uzaktan\n');
    execFileSync('git', ['add', '-A'], { cwd: otherPath });
    execFileSync('git', ['commit', '-m', 'Uzaktan'], { cwd: otherPath });
    execFileSync('git', ['push'], { cwd: otherPath });

    // Yerelde geçmişi yeniden yazıp zorlamayı deniyoruz.
    write('app.txt', 'yeniden yazıldı\n');
    await stage(REPO_ID, repoPath, ['app.txt']);
    await commit(REPO_ID, repoPath, 'Yerel', undefined, true);

    const result = await push(REPO_ID, repoPath, false, true);

    // --force-with-lease uzaktaki bilinmeyen commit'i koruyor.
    expect(result.ok).toBe(false);

    fs.rmSync(otherPath, { recursive: true, force: true });
    fs.rmSync(remotePath, { recursive: true, force: true });
  });

  it('zorlamalı gönderim uzak dal beklendiği yerdeyse geçer', async () => {
    const remotePath = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-remote-'));
    git(['init', '--bare', '--initial-branch=main'], remotePath);

    await seed();
    await addRemote(REPO_ID, repoPath, 'origin', remotePath);
    await push(REPO_ID, repoPath, true);

    // Yalnızca yerelde geçmişi değiştiriyoruz; uzak dal hâlâ bizim bildiğimiz yerde.
    write('app.txt', 'düzeltildi\n');
    await stage(REPO_ID, repoPath, ['app.txt']);
    await commit(REPO_ID, repoPath, 'Düzeltilmiş ilk commit', undefined, true);

    const result = await push(REPO_ID, repoPath, false, true);

    expect(result.ok).toBe(true);
    expect((await getStatus(REPO_ID, repoPath)).ahead).toBe(0);

    fs.rmSync(remotePath, { recursive: true, force: true });
  });
});

describe('grafik için geçmiş şekli', () => {
  it('merge commit’inin iki ebeveynini de döner', async () => {
    await seed();
    await createBranch(REPO_ID, repoPath, 'yan', undefined, true);
    write('yan.txt', 'yan\n');
    await stage(REPO_ID, repoPath, ['yan.txt']);
    await commit(REPO_ID, repoPath, 'Yan dal', undefined, false);

    await checkout(REPO_ID, repoPath, 'main');
    write('ana.txt', 'ana\n');
    await stage(REPO_ID, repoPath, ['ana.txt']);
    await commit(REPO_ID, repoPath, 'Ana dal', undefined, false);

    git(['merge', '--no-edit', 'yan']);

    const commits = await getLog(REPO_ID, repoPath, 0, 10);
    expect(commits[0].parents).toHaveLength(2);
  });
});
