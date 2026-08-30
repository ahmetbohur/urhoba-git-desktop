import { describe, expect, it } from 'vitest';
import { parseLog, parseReflog } from '../parse';
import { parseLfsPointer } from '../lfs';
import { parseWorktrees } from '../worktree';
import { parseSubmoduleStatus } from '../submodule';

/** Ayrıştırıcıların girdi varsayımlarını zorlayan QA denemeleri. */

const US = '\x1f';
const RS = '\x1e';

describe('QA — ayırıcı karakter taşıyan commit mesajı', () => {
  it('mesajda birim ayırıcı varsa alanlar kaymaz', () => {
    const record =
      ['a'.repeat(40), 'aaaaaaa', '', 'Ada', 'a@b.c', '2026-01-01T00:00:00Z', '', 'N', '',
       `Başlık${US}kaçak`, ''].join(US) + RS;

    const [commit] = parseLog(record);
    expect(commit.sha).toBe('a'.repeat(40));
    expect(commit.authorName).toBe('Ada');
  });
});

describe('QA — CRLF satır sonlu LFS işaretçisi', () => {
  it('Windows’ta çıkarılmış işaretçiyi tanır', () => {
    const pointer =
      'version https://git-lfs.github.com/spec/v1\r\n' +
      'oid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393\r\n' +
      'size 12345\r\n';
    expect(parseLfsPointer(pointer)).not.toBeNull();
  });
});

describe('QA — boşluklu yollar', () => {
  it('worktree yolunda boşluk bozulmaz', () => {
    const trees = parseWorktrees(
      ['worktree /home/ali/benim projem', 'HEAD abc123', 'branch refs/heads/main', ''].join('\n'),
    );
    expect(trees[0].path).toBe('/home/ali/benim projem');
  });

  it('alt modül yolunda boşluk bozulmaz', () => {
    const [entry] = parseSubmoduleStatus(' abc123 vendor/benim kütüphanem (v1.0)');
    expect(entry.path).toBe('vendor/benim kütüphanem');
  });

  it('parantezle biten alt modül yolu kırpılmaz', () => {
    const [entry] = parseSubmoduleStatus('-abc123 vendor/lib(eski)');
    expect(entry.path).toBe('vendor/lib(eski)');
  });
});

describe('QA — eğik çizgili dal adı', () => {
  it('reflog kaydında dal adı bozulmaz', () => {
    const [entry] = parseReflog(
      ['abc'.repeat(13) + 'd', 'abc1234', 'HEAD@{0}', 'checkout: moving from main to ozellik/yeni', '2026-01-01T00:00:00Z'].join(US) + RS,
    );
    expect(entry.action).toBe('checkout');
    expect(entry.message).toBe('moving from main to ozellik/yeni');
  });
});
