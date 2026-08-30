import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkout, createBranch, deleteBranch, getBranches, renameBranch } from '../branches';
import { applyChoices, parseConflictSections, readConflict, resolveConflict } from '../conflict';
import { abortOperation, cherryPick, continueOperation, merge, rebase } from '../merge';
import { getBlame } from '../history';
import { stageLines } from '../staging';
import { applyStash, createStash, dropStash, listStashes } from '../stash';
import { commit, getFileDiff, getStatus, stage } from '../status';

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

beforeEach(() => {
  repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-p2-'));
  git(['init', '--initial-branch=main']);
  git(['config', 'user.name', 'Test Kullanıcı']);
  git(['config', 'user.email', 'test@example.com']);
});

afterEach(() => {
  fs.rmSync(repoPath, { recursive: true, force: true });
});

/** Beş satırlık bir taban dosya ve ilk commit. */
async function seed(): Promise<void> {
  write('app.txt', ['bir', 'iki', 'üç', 'dört', 'beş'].join('\n') + '\n');
  await stage(REPO_ID, repoPath, ['app.txt']);
  await commit(REPO_ID, repoPath, 'Taban', undefined, false);
}

/**
 * Yirmi satırlık taban: iki değişikliğin ayrı hunk'lara düşmesi için aralarında
 * üç satırlık bağlamdan fazlası olmalı.
 */
async function seedLong(): Promise<void> {
  const lines = Array.from({ length: 20 }, (_, i) => `satir-${i + 1}`);
  write('uzun.txt', lines.join('\n') + '\n');
  await stage(REPO_ID, repoPath, ['uzun.txt']);
  await commit(REPO_ID, repoPath, 'Uzun taban', undefined, false);
}

function changeLongFile(): void {
  const lines = Array.from({ length: 20 }, (_, i) => `satir-${i + 1}`);
  lines[1] = 'BASTA-DEGISTI';
  lines[17] = 'SONDA-DEGISTI';
  write('uzun.txt', lines.join('\n') + '\n');
}

/** Bir hunk'taki bütün ekleme/silme satırlarının dizinleri. */
function changedLineIndices(hunkLines: Array<{ kind: string }>): number[] {
  return hunkLines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.kind === 'add' || line.kind === 'del')
    .map(({ index }) => index);
}

describe('satır bazlı hazırlama', () => {
  it('yalnızca seçilen hunk’ı hazırlar, diğerini çalışma dizininde bırakır', async () => {
    await seedLong();
    changeLongFile();

    const diff = await getFileDiff(REPO_ID, repoPath, 'uzun.txt', false);
    // Değişiklikler dosyanın iki ucunda: git bunları ayrı hunk'lara ayırmalı.
    expect(diff.hunks).toHaveLength(2);

    await stageLines(REPO_ID, repoPath, 'uzun.txt', 'stage', [
      { hunkIndex: 0, lineIndices: changedLineIndices(diff.hunks[0].lines) },
    ]);

    const stagedText = (await getFileDiff(REPO_ID, repoPath, 'uzun.txt', true)).hunks
      .flatMap((hunk) => hunk.lines)
      .map((line) => line.content);
    expect(stagedText).toContain('BASTA-DEGISTI');
    expect(stagedText).not.toContain('SONDA-DEGISTI');

    // İkinci değişiklik hâlâ hazırlanmayı bekliyor olmalı.
    const status = await getStatus(REPO_ID, repoPath);
    expect(status.staged.map((f) => f.path)).toEqual(['uzun.txt']);
    expect(status.unstaged.map((f) => f.path)).toEqual(['uzun.txt']);

    const remaining = (await getFileDiff(REPO_ID, repoPath, 'uzun.txt', false)).hunks
      .flatMap((hunk) => hunk.lines)
      .map((line) => line.content);
    expect(remaining).toContain('SONDA-DEGISTI');
    expect(remaining).not.toContain('BASTA-DEGISTI');
  });

  it('hazırlanmış bir satırı geri çıkarır', async () => {
    await seed();
    write('app.txt', ['BİR', 'iki', 'üç', 'dört', 'beş'].join('\n') + '\n');
    await stage(REPO_ID, repoPath, ['app.txt']);

    const stagedDiff = await getFileDiff(REPO_ID, repoPath, 'app.txt', true);
    const indices = stagedDiff.hunks[0].lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.kind !== 'context')
      .map(({ index }) => index);

    await stageLines(REPO_ID, repoPath, 'app.txt', 'unstage', [
      { hunkIndex: 0, lineIndices: indices },
    ]);

    const status = await getStatus(REPO_ID, repoPath);
    expect(status.staged).toHaveLength(0);
    expect(status.unstaged.map((f) => f.path)).toEqual(['app.txt']);
    // Dosyanın kendisine dokunulmamalı: değişiklik hâlâ diskte.
    expect(read('app.txt')).toContain('BİR');
  });

  it('seçilen hunk’ı çalışma dizininden geri alır, diğerine dokunmaz', async () => {
    await seedLong();
    changeLongFile();

    const diff = await getFileDiff(REPO_ID, repoPath, 'uzun.txt', false);
    await stageLines(REPO_ID, repoPath, 'uzun.txt', 'discard', [
      { hunkIndex: 1, lineIndices: changedLineIndices(diff.hunks[1].lines) },
    ]);

    const contents = read('uzun.txt');
    expect(contents).toContain('BASTA-DEGISTI');
    expect(contents).toContain('satir-18');
    expect(contents).not.toContain('SONDA-DEGISTI');
  });

  it('seçim uygulanabilir bir değişiklik üretmezse anlaşılır hata verir', async () => {
    await seed();
    write('app.txt', ['bir', 'İKİ', 'üç', 'dört', 'beş'].join('\n') + '\n');
    const diff = await getFileDiff(REPO_ID, repoPath, 'app.txt', false);
    const contextIndex = diff.hunks[0].lines.findIndex((line) => line.kind === 'context');

    await expect(
      stageLines(REPO_ID, repoPath, 'app.txt', 'stage', [
        { hunkIndex: 0, lineIndices: [contextIndex] },
      ]),
    ).rejects.toThrow(/uygulanabilir bir değişiklik çıkmadı/);
  });
});

describe('stash', () => {
  it('oluşturur, listeler, uygular ve siler', async () => {
    await seed();
    write('app.txt', ['bir', 'İKİ', 'üç', 'dört', 'beş'].join('\n') + '\n');

    await createStash(REPO_ID, repoPath, 'yarım kalan iş', false);
    expect(read('app.txt')).toContain('iki');

    const stashes = await listStashes(REPO_ID, repoPath);
    expect(stashes).toHaveLength(1);
    expect(stashes[0]).toMatchObject({ index: 0, message: 'yarım kalan iş', branch: 'main' });

    await applyStash(REPO_ID, repoPath, 0, false);
    expect(read('app.txt')).toContain('İKİ');

    await dropStash(REPO_ID, repoPath, 0);
    expect(await listStashes(REPO_ID, repoPath)).toHaveLength(0);
  });

  it('takip edilmeyen dosyaları isteğe bağlı olarak dahil eder', async () => {
    await seed();
    write('gecici.txt', 'saklanacak\n');

    await createStash(REPO_ID, repoPath, 'takipsizle', true);
    expect(fs.existsSync(path.join(repoPath, 'gecici.txt'))).toBe(false);

    await applyStash(REPO_ID, repoPath, 0, true);
    expect(fs.existsSync(path.join(repoPath, 'gecici.txt'))).toBe(true);
    expect(await listStashes(REPO_ID, repoPath)).toHaveLength(0);
  });

  it('saklanacak bir şey yoksa açık hata verir', async () => {
    await seed();
    await expect(createStash(REPO_ID, repoPath, undefined, false)).rejects.toThrow(
      /Saklanacak bir değişiklik yok/,
    );
  });
});

describe('dal değiştirme koruması', () => {
  it('üzerine yazılacak değişiklik varsa geçişi engeller ve dosyaları söyler', async () => {
    await seed();
    await createBranch(REPO_ID, repoPath, 'yan', undefined, true);
    write('app.txt', ['yan dalda değişti'].join('\n') + '\n');
    await stage(REPO_ID, repoPath, ['app.txt']);
    await commit(REPO_ID, repoPath, 'Yan değişiklik', undefined, false);

    await checkout(REPO_ID, repoPath, 'main');
    write('app.txt', ['ana dalda kaydedilmemiş'].join('\n') + '\n');

    const result = await checkout(REPO_ID, repoPath, 'yan');

    expect(result.outcome).toBe('blocked-dirty');
    expect(result.blockingPaths).toEqual(['app.txt']);
    expect((await getStatus(REPO_ID, repoPath)).branch).toBe('main');
  });

  it('temiz dizinde sorunsuz geçer', async () => {
    await seed();
    await createBranch(REPO_ID, repoPath, 'yan', undefined, false);

    const result = await checkout(REPO_ID, repoPath, 'yan');
    expect(result.outcome).toBe('switched');
    expect((await getStatus(REPO_ID, repoPath)).branch).toBe('yan');
  });

  it('dalı yeniden adlandırır', async () => {
    await seed();
    await createBranch(REPO_ID, repoPath, 'eski-ad', undefined, true);

    const result = await renameBranch(REPO_ID, repoPath, 'eski-ad', 'yeni-ad', false);

    expect(result.outcome).toBe('renamed');
    expect((await getStatus(REPO_ID, repoPath)).branch).toBe('yeni-ad');
    const branches = await getBranches(REPO_ID, repoPath);
    expect(branches.local.map((b) => b.fullName).sort()).toEqual(['main', 'yeni-ad']);
  });

  it('var olan bir ada yeniden adlandırmayı reddeder', async () => {
    await seed();
    await createBranch(REPO_ID, repoPath, 'yan', undefined, false);

    const result = await renameBranch(REPO_ID, repoPath, 'yan', 'main', false);

    expect(result.outcome).toBe('error');
    // Dal adları değişmemiş olmalı.
    const branches = await getBranches(REPO_ID, repoPath);
    expect(branches.local.map((b) => b.fullName).sort()).toEqual(['main', 'yan']);
  });

  it('upstream varken uzak dalın eski adla kaldığını söyler', async () => {
    const remotePath = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-rename-remote-'));
    git(['init', '--bare', '--initial-branch=main'], remotePath);

    await seed();
    git(['remote', 'add', 'origin', remotePath]);
    git(['push', '--set-upstream', 'origin', 'main']);

    const result = await renameBranch(REPO_ID, repoPath, 'main', 'ana', false);

    expect(result.outcome).toBe('renamed');
    expect(result.remoteUpdated).toBe(false);
    expect(result.message).toMatch(/hâlâ main adıyla/);

    fs.rmSync(remotePath, { recursive: true, force: true });
  });

  it('istenirse uzak dalı da taşır', async () => {
    const remotePath = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-rename-remote2-'));
    git(['init', '--bare', '--initial-branch=main'], remotePath);

    await seed();
    git(['remote', 'add', 'origin', remotePath]);
    git(['push', '--set-upstream', 'origin', 'main']);
    // Varsayılan dal değil, sıradan bir özellik dalı: uzak depo kendi HEAD'inin
    // işaret ettiği dalı silmeyi reddediyor.
    await createBranch(REPO_ID, repoPath, 'ozellik', undefined, true);
    git(['push', '--set-upstream', 'origin', 'ozellik']);

    const result = await renameBranch(REPO_ID, repoPath, 'ozellik', 'ozellik-v2', true);

    expect(result.outcome).toBe('renamed');
    expect(result.remoteUpdated).toBe(true);
    const remoteBranches = execFileSync('git', ['branch', '--list'], {
      cwd: remotePath,
      encoding: 'utf8',
    });
    expect(remoteBranches).toContain('ozellik-v2');
    expect(remoteBranches).not.toContain('ozellik\n');

    fs.rmSync(remotePath, { recursive: true, force: true });
  });

  it('uzaktaki varsayılan dal silinemediğinde durumu bildirir', async () => {
    const remotePath = fs.mkdtempSync(path.join(os.tmpdir(), 'urhoba-rename-remote3-'));
    git(['init', '--bare', '--initial-branch=main'], remotePath);

    await seed();
    git(['remote', 'add', 'origin', remotePath]);
    git(['push', '--set-upstream', 'origin', 'main']);

    // Uzak depo HEAD'inin işaret ettiği dalı silmeyi reddeder; yeni ad
    // gönderilmiş olsa da eski ad orada kalır ve kullanıcı bunu bilmeli.
    const result = await renameBranch(REPO_ID, repoPath, 'main', 'ana', true);

    expect(result.outcome).toBe('renamed');
    expect(result.remoteUpdated).toBe(false);
    expect(result.message).toMatch(/silinemedi/);

    fs.rmSync(remotePath, { recursive: true, force: true });
  });

  it('birleştirilmemiş dalı zorlamadan silmeyi reddeder', async () => {
    await seed();
    await createBranch(REPO_ID, repoPath, 'yan', undefined, true);
    write('yeni.txt', 'içerik\n');
    await stage(REPO_ID, repoPath, ['yeni.txt']);
    await commit(REPO_ID, repoPath, 'Yan commit', undefined, false);
    await checkout(REPO_ID, repoPath, 'main');

    await expect(deleteBranch(REPO_ID, repoPath, 'yan', false)).rejects.toThrow();

    await deleteBranch(REPO_ID, repoPath, 'yan', true);
    const branches = await getBranches(REPO_ID, repoPath);
    expect(branches.local.map((b) => b.fullName)).toEqual(['main']);
  });
});

describe('cherry-pick', () => {
  it('bir commit’i başka dala uygular ve izini bırakır', async () => {
    await seed();
    await createBranch(REPO_ID, repoPath, 'yan', undefined, true);
    write('yan.txt', 'yan daldan\n');
    await stage(REPO_ID, repoPath, ['yan.txt']);
    const yanCommit = await commit(REPO_ID, repoPath, 'Yan daldaki iş', undefined, false);

    await checkout(REPO_ID, repoPath, 'main');
    const result = await cherryPick(REPO_ID, repoPath, yanCommit.sha);

    expect(result.outcome).toBe('merged');
    expect(fs.existsSync(path.join(repoPath, 'yan.txt'))).toBe(true);

    // `-x` sayesinde commit'in nereden geldiği mesajda duruyor.
    const message = git(['log', '-1', '--format=%B']);
    expect(message).toContain('Yan daldaki iş');
    expect(message).toContain('cherry picked from commit');
  });

  it('çakışmayı çözülecek durum olarak raporlar ve iptal edilebilir', async () => {
    await seed();
    await createBranch(REPO_ID, repoPath, 'yan', undefined, true);
    write('app.txt', ['bir', 'YAN', 'üç', 'dört', 'beş'].join('\n') + '\n');
    await stage(REPO_ID, repoPath, ['app.txt']);
    const yanCommit = await commit(REPO_ID, repoPath, 'Yan değişiklik', undefined, false);

    await checkout(REPO_ID, repoPath, 'main');
    write('app.txt', ['bir', 'ANA', 'üç', 'dört', 'beş'].join('\n') + '\n');
    await stage(REPO_ID, repoPath, ['app.txt']);
    await commit(REPO_ID, repoPath, 'Ana değişiklik', undefined, false);

    const result = await cherryPick(REPO_ID, repoPath, yanCommit.sha);

    expect(result.outcome).toBe('conflict');
    expect(result.conflictedPaths).toEqual(['app.txt']);
    expect((await getStatus(REPO_ID, repoPath)).operation).toBe('cherry-pick');

    await abortOperation(REPO_ID, repoPath);
    expect((await getStatus(REPO_ID, repoPath)).operation).toBe('none');
    expect(read('app.txt')).toContain('ANA');
  });

  it('çakışma çözülünce işlem tamamlanabiliyor', async () => {
    await seed();
    await createBranch(REPO_ID, repoPath, 'yan', undefined, true);
    write('app.txt', ['bir', 'YAN', 'üç', 'dört', 'beş'].join('\n') + '\n');
    await stage(REPO_ID, repoPath, ['app.txt']);
    const yanCommit = await commit(REPO_ID, repoPath, 'Yan değişiklik', undefined, false);

    await checkout(REPO_ID, repoPath, 'main');
    write('app.txt', ['bir', 'ANA', 'üç', 'dört', 'beş'].join('\n') + '\n');
    await stage(REPO_ID, repoPath, ['app.txt']);
    await commit(REPO_ID, repoPath, 'Ana değişiklik', undefined, false);

    await cherryPick(REPO_ID, repoPath, yanCommit.sha);
    // Çakışmayı elle çöz ve hazırla.
    write('app.txt', ['bir', 'İKİSİ', 'üç', 'dört', 'beş'].join('\n') + '\n');
    await stage(REPO_ID, repoPath, ['app.txt']);

    const done = await continueOperation(REPO_ID, repoPath);

    expect(done.outcome).toBe('merged');
    expect((await getStatus(REPO_ID, repoPath)).operation).toBe('none');
  });
});

describe('blame', () => {
  it('her satırı yazan commit’i bulur', async () => {
    write('app.txt', ['ilk satır', 'ikinci satır'].join('\n') + '\n');
    await stage(REPO_ID, repoPath, ['app.txt']);
    await commit(REPO_ID, repoPath, 'İki satır ekle', undefined, false);

    write('app.txt', ['ilk satır', 'ikinci satır', 'üçüncü satır'].join('\n') + '\n');
    await stage(REPO_ID, repoPath, ['app.txt']);
    await commit(REPO_ID, repoPath, 'Üçüncü satırı ekle', undefined, false);

    const blame = await getBlame(REPO_ID, repoPath, 'app.txt');

    expect(blame.unavailableReason).toBeNull();
    expect(blame.lines).toHaveLength(3);
    expect(blame.lines.map((line) => line.content)).toEqual([
      'ilk satır',
      'ikinci satır',
      'üçüncü satır',
    ]);
    // İlk iki satır ilk commit'ten, üçüncü satır ikinciden gelmeli.
    expect(blame.lines[0].summary).toBe('İki satır ekle');
    expect(blame.lines[2].summary).toBe('Üçüncü satırı ekle');
    expect(blame.lines[0].authorName).toBe('Test Kullanıcı');
  });

  it('boşluk değişimini yazar değişikliği saymaz', async () => {
    write('app.txt', 'kod satırı\n');
    await stage(REPO_ID, repoPath, ['app.txt']);
    await commit(REPO_ID, repoPath, 'Kodu yaz', undefined, false);

    // Yalnızca girinti eklendi: -w sayesinde asıl yazar korunmalı.
    write('app.txt', '    kod satırı\n');
    await stage(REPO_ID, repoPath, ['app.txt']);
    await commit(REPO_ID, repoPath, 'Girintiyi düzelt', undefined, false);

    const blame = await getBlame(REPO_ID, repoPath, 'app.txt');
    expect(blame.lines[0].summary).toBe('Kodu yaz');
  });

  it('takip edilmeyen dosyada anlaşılır sebep döner', async () => {
    await seed();
    write('yeni.txt', 'henüz commit edilmedi\n');

    const blame = await getBlame(REPO_ID, repoPath, 'yeni.txt');
    expect(blame.lines).toEqual([]);
    expect(blame.unavailableReason).toMatch(/commit edilmemiş/);
  });
});

describe('birleştirme ve çakışma çözümü', () => {
  /** İki dalda aynı satırı farklı değiştirip çakışma üretir. */
  async function createConflict(): Promise<void> {
    await seed();
    await createBranch(REPO_ID, repoPath, 'yan', undefined, true);
    write('app.txt', ['bir', 'YAN DAL', 'üç', 'dört', 'beş'].join('\n') + '\n');
    await stage(REPO_ID, repoPath, ['app.txt']);
    await commit(REPO_ID, repoPath, 'Yan', undefined, false);

    await checkout(REPO_ID, repoPath, 'main');
    write('app.txt', ['bir', 'ANA DAL', 'üç', 'dört', 'beş'].join('\n') + '\n');
    await stage(REPO_ID, repoPath, ['app.txt']);
    await commit(REPO_ID, repoPath, 'Ana', undefined, false);
  }

  it('çakışmayı hata değil, çözülecek durum olarak raporlar', async () => {
    await createConflict();
    const result = await merge(REPO_ID, repoPath, 'yan');

    expect(result.outcome).toBe('conflict');
    expect(result.conflictedPaths).toEqual(['app.txt']);
    expect((await getStatus(REPO_ID, repoPath)).operation).toBe('merge');
  });

  it('çakışan dosyayı bölümlere ayırır', async () => {
    await createConflict();
    await merge(REPO_ID, repoPath, 'yan');

    const conflict = await readConflict(repoPath, 'app.txt');
    const sections = conflict.sections.filter((section) => section.kind === 'conflict');

    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ ours: ['ANA DAL'], theirs: ['YAN DAL'] });
  });

  it('“onlarki” seçimiyle çözer ve dosyayı hazırlar', async () => {
    await createConflict();
    await merge(REPO_ID, repoPath, 'yan');

    await resolveConflict(REPO_ID, repoPath, 'app.txt', ['theirs']);

    expect(read('app.txt')).toContain('YAN DAL');
    expect(read('app.txt')).not.toContain('<<<<<<<');
    const status = await getStatus(REPO_ID, repoPath);
    expect(status.conflicted).toHaveLength(0);

    const done = await continueOperation(REPO_ID, repoPath);
    expect(done.outcome).toBe('merged');
    expect((await getStatus(REPO_ID, repoPath)).operation).toBe('none');
  });

  it('birleştirmeyi iptal edip önceki hâle döner', async () => {
    await createConflict();
    await merge(REPO_ID, repoPath, 'yan');

    await abortOperation(REPO_ID, repoPath);

    const status = await getStatus(REPO_ID, repoPath);
    expect(status.operation).toBe('none');
    expect(status.conflicted).toHaveLength(0);
    expect(read('app.txt')).toContain('ANA DAL');
  });

  it('çözülmemiş çakışma varken devam etmeyi reddeder', async () => {
    await createConflict();
    await merge(REPO_ID, repoPath, 'yan');

    const result = await continueOperation(REPO_ID, repoPath);
    expect(result.outcome).toBe('conflict');
  });

  it('rebase çakışmasını da aynı akışla yönetir', async () => {
    await createConflict();
    const result = await rebase(REPO_ID, repoPath, 'yan');

    expect(result.outcome).toBe('conflict');
    expect((await getStatus(REPO_ID, repoPath)).operation).toBe('rebase');

    await abortOperation(REPO_ID, repoPath);
    expect((await getStatus(REPO_ID, repoPath)).operation).toBe('none');
  });

  it('çakışmasız birleştirmeyi doğrudan tamamlar', async () => {
    await seed();
    await createBranch(REPO_ID, repoPath, 'yan', undefined, true);
    write('yeni.txt', 'yan daldan\n');
    await stage(REPO_ID, repoPath, ['yeni.txt']);
    await commit(REPO_ID, repoPath, 'Yan dosya', undefined, false);
    await checkout(REPO_ID, repoPath, 'main');

    const result = await merge(REPO_ID, repoPath, 'yan');
    expect(result.outcome).toBe('merged');
    expect(fs.existsSync(path.join(repoPath, 'yeni.txt'))).toBe(true);
  });
});

describe('çakışma metni ayrıştırma', () => {
  it('diff3 biçimindeki ortak ata bölümünü göstermeye katmaz', () => {
    const contents = [
      'başlangıç',
      '<<<<<<< HEAD',
      'bizim satır',
      '||||||| taban',
      'eski satır',
      '=======',
      'onların satırı',
      '>>>>>>> yan',
      'son',
    ].join('\n');

    const sections = parseConflictSections(contents);

    expect(sections).toHaveLength(3);
    expect(sections[1]).toMatchObject({
      kind: 'conflict',
      ours: ['bizim satır'],
      theirs: ['onların satırı'],
      oursLabel: 'HEAD',
      theirsLabel: 'yan',
    });
  });

  it('“ikisi” seçiminde önce bizimkini sonra onlarınkini yazar', () => {
    const sections = parseConflictSections(
      ['<<<<<<< HEAD', 'a', '=======', 'b', '>>>>>>> yan'].join('\n'),
    );
    expect(applyChoices(sections, ['both'])).toBe('a\nb');
  });

  it('birden fazla çakışmayı sırayla eşleştirir', () => {
    const sections = parseConflictSections(
      [
        '<<<<<<< HEAD',
        'ilk-bizim',
        '=======',
        'ilk-onların',
        '>>>>>>> yan',
        'ortak',
        '<<<<<<< HEAD',
        'ikinci-bizim',
        '=======',
        'ikinci-onların',
        '>>>>>>> yan',
      ].join('\n'),
    );

    expect(applyChoices(sections, ['ours', 'theirs'])).toBe('ilk-bizim\nortak\nikinci-onların');
  });
});
