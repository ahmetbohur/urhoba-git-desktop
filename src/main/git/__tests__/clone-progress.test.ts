import { describe, expect, it } from 'vitest';
import { parseCloneProgress } from '../clone-progress';

describe('parseCloneProgress', () => {
  it('indirme aşamasını tanır ve ağırlıklandırır', () => {
    const update = parseCloneProgress('Receiving objects:  50% (50/100)');
    // İndirme toplamın %70'i, öncesinde %15 tamamlanmış sayılıyor.
    expect(update).toEqual({ phase: 'İndiriliyor', percent: 50 });
  });

  it('aşamalar arasında yüzde geriye gitmez', () => {
    const compressing = parseCloneProgress('Compressing objects: 100% (10/10)');
    const receiving = parseCloneProgress('Receiving objects:   1% (1/100)');
    expect(receiving!.percent).toBeGreaterThanOrEqual(compressing!.percent);
  });

  it('satır başıyla birleşmiş parçalarda en güncel durumu alır', () => {
    const chunk = 'Receiving objects:  10% (10/100)\rReceiving objects:  90% (90/100)\r';
    expect(parseCloneProgress(chunk)?.percent).toBe(78);
  });

  it('delta çözümü indirmeden sonra gelir', () => {
    const update = parseCloneProgress('Resolving deltas: 100% (50/50), done.');
    expect(update).toEqual({ phase: 'Değişiklikler çözülüyor', percent: 95 });
  });

  it('ilerleme içermeyen satırlarda null döner', () => {
    expect(parseCloneProgress("Cloning into 'depo'...")).toBeNull();
    expect(parseCloneProgress('remote: Enumerating objects: 100, done.')).toBeNull();
    expect(parseCloneProgress('')).toBeNull();
  });

  it('son aşamada yüzde 100’ü aşmaz', () => {
    expect(parseCloneProgress('Updating files: 100% (500/500)')?.percent).toBe(100);
  });
});
