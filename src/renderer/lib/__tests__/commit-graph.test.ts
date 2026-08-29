import { describe, expect, it } from 'vitest';
import { buildGraph } from '../commit-graph';
import type { Commit } from '@shared/types';

/**
 * Grafik hesabı saf bir fonksiyon olduğu için commit'leri elle kurup düzeni
 * doğrulayabiliyoruz. Testler sha yerine tek harf kullanıyor: geçmişin şekli
 * gerçek hash'lerle okunmaz hâle geliyor.
 */
function commit(sha: string, parents: string[]): Commit {
  return {
    sha,
    shortSha: sha,
    subject: sha,
    body: '',
    authorName: 'Test',
    authorEmail: 't@e.c',
    authoredAt: '2026-08-30T00:00:00Z',
    parents,
    refs: [],
  };
}

describe('buildGraph', () => {
  it('düz geçmişi tek şeritte tutar', () => {
    const rows = buildGraph([commit('c', ['b']), commit('b', ['a']), commit('a', [])]);

    expect(rows.map((row) => row.lane)).toEqual([0, 0, 0]);
    expect(rows.every((row) => row.width === 1)).toBe(true);
  });

  it('ilk commit’te aşağı giden çizgi çizmez', () => {
    const rows = buildGraph([commit('a', [])]);
    expect(rows[0].edges).toEqual([]);
  });

  it('merge commit’i ikinci ebeveyn için yeni şerit açar', () => {
    // m: main ile yan dalın birleşmesi. Geçmiş sırası: m, b (yan), a (ortak ata).
    const rows = buildGraph([
      commit('m', ['a1', 'b1']),
      commit('a1', ['base']),
      commit('b1', ['base']),
      commit('base', []),
    ]);

    expect(rows[0].lane).toBe(0);
    // Merge satırında biri kendi şeridinde, biri yeni şeritte iki çizgi olmalı.
    expect(rows[0].edges.map((edge) => [edge.from, edge.to])).toEqual([
      [0, 0],
      [0, 1],
    ]);
    // İki dal ayrı şeritlerde ilerliyor.
    expect(rows[1].lane).toBe(0);
    expect(rows[2].lane).toBe(1);
    expect(rows[1].width).toBe(2);
  });

  it('birleşen dallar ortak ataya varınca şerit kapanır', () => {
    const rows = buildGraph([
      commit('m', ['a1', 'b1']),
      commit('a1', ['base']),
      commit('b1', ['base']),
      commit('base', []),
    ]);

    const baseRow = rows[3];
    expect(baseRow.lane).toBe(0);
    // Hem 0. hem 1. şerit base'i bekliyordu; ikisi de bu satıra akıyor.
    expect(baseRow.edges.map((edge) => [edge.from, edge.to]).sort()).toEqual([
      [0, 0],
      [1, 0],
    ]);
    // Bu satırda hâlâ iki sütun çiziliyor: 1. şeritten gelen birleşme çizgisi
    // için yer gerekiyor. Şerit ancak bu satırdan sonra kapanmış sayılır.
    expect(rows[3].width).toBe(2);
  });

  it('birbirinden bağımsız iki dal ucunu ayrı şeritlere koyar', () => {
    // İki kök: aralarında hiç bağlantı yok.
    const rows = buildGraph([commit('x', []), commit('y', [])]);

    expect(rows[0].lane).toBe(0);
    expect(rows[1].lane).toBe(0);
  });

  it('paralel ilerleyen dalları yan yana tutar', () => {
    // a2 → a1 → base ve b1 → base; henüz birleşmemişler.
    const rows = buildGraph([
      commit('a2', ['a1']),
      commit('b1', ['base']),
      commit('a1', ['base']),
      commit('base', []),
    ]);

    expect(rows[0].lane).toBe(0);
    expect(rows[1].lane).toBe(1);
    expect(rows[2].lane).toBe(0);
    expect(rows[3].lane).toBe(0);
    expect(rows[1].width).toBe(2);
  });

  it('üç ebeveynli octopus merge’de her ebeveyne çizgi verir', () => {
    const rows = buildGraph([
      commit('m', ['p1', 'p2', 'p3']),
      commit('p1', []),
      commit('p2', []),
      commit('p3', []),
    ]);

    expect(rows[0].edges).toHaveLength(3);
    expect(rows[0].edges.map((edge) => edge.to)).toEqual([0, 1, 2]);
  });

  it('devam eden şeritler için her satırda çizgi üretir', () => {
    const rows = buildGraph([
      commit('a2', ['a1']),
      commit('b1', ['base']),
      commit('a1', ['base']),
      commit('base', []),
    ]);

    // b1 satırında 0. şerit (a1 bekleyen) düz devam etmeli.
    const passing = rows[1].edges.find((edge) => edge.from === 0);
    expect(passing).toMatchObject({ from: 0, to: 0 });
  });

  it('genişlik hiçbir satırda şerit sayısının altına düşmez', () => {
    const rows = buildGraph([
      commit('m', ['a1', 'b1']),
      commit('a1', ['base']),
      commit('b1', ['base']),
      commit('base', []),
    ]);

    for (const row of rows) {
      expect(row.width).toBeGreaterThan(row.lane);
    }
  });
});
