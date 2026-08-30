import { describe, expect, it } from 'vitest';
import { parseGroupSuggestions } from '../service';
import type { Repo } from '@shared/types';

/**
 * Model çıktısı serbest metin: JSON'u kod bloğuna sarabiliyor, öncesine
 * açıklama yazabiliyor, olmayan depo adları uydurabiliyor. Ayrıştırıcı bunların
 * hepsine dayanmak zorunda — bir hayalet giriş kullanıcının listesini bozar.
 */
function repo(name: string): Repo {
  return {
    id: `id-${name}`,
    name,
    path: `/p/${name}`,
    addedAt: '2026-01-01T00:00:00Z',
    lastOpenedAt: '2026-01-01T00:00:00Z',
  };
}

const repos = [repo('akari-pro'), repo('hashi-pro'), repo('otp-server')];

describe('parseGroupSuggestions', () => {
  it('düz JSON çıktısını ayrıştırır', () => {
    const raw = '[{"group":"bulmaca","repos":["akari-pro","hashi-pro"]}]';
    expect(parseGroupSuggestions(raw, repos)).toEqual([
      { group: 'bulmaca', repoIds: ['id-akari-pro', 'id-hashi-pro'], repoNames: ['akari-pro', 'hashi-pro'] },
    ]);
  });

  it('kod bloğuna sarılmış ve açıklamalı çıktıyı kurtarır', () => {
    const raw = [
      'Elbette, işte gruplar:',
      '```json',
      '[{"group":"bulmaca","repos":["akari-pro"]}]',
      '```',
    ].join('\n');
    expect(parseGroupSuggestions(raw, repos)).toHaveLength(1);
  });

  it('var olmayan depo adlarını eler', () => {
    const raw = '[{"group":"hayalet","repos":["akari-pro","olmayan-proje"]}]';
    const [suggestion] = parseGroupSuggestions(raw, repos);
    expect(suggestion.repoIds).toEqual(['id-akari-pro']);
    expect(suggestion.repoNames).toEqual(['akari-pro']);
  });

  it('hiçbir depo eşleşmeyen öneriyi atar', () => {
    const raw = '[{"group":"boş","repos":["yok-1","yok-2"]}]';
    expect(parseGroupSuggestions(raw, repos)).toEqual([]);
  });

  it('adsız grubu atar', () => {
    expect(parseGroupSuggestions('[{"group":"  ","repos":["akari-pro"]}]', repos)).toEqual([]);
  });

  it('bozuk JSON’da boş liste döner, hata fırlatmaz', () => {
    expect(parseGroupSuggestions('bu JSON değil', repos)).toEqual([]);
    expect(parseGroupSuggestions('[{"group":', repos)).toEqual([]);
    expect(parseGroupSuggestions('', repos)).toEqual([]);
  });

  it('dizi olmayan JSON’u kabul etmez', () => {
    expect(parseGroupSuggestions('{"group":"x"}', repos)).toEqual([]);
  });
});
