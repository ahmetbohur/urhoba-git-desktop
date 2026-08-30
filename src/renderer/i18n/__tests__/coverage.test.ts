import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '../en';

/**
 * Çeviri kapsamı denetimi.
 *
 * Yeni bir metin eklendiğinde sözlüğe girdi yazmayı unutmak kolay ve sonucu
 * sessiz: arayüz İngilizce seçiliyken o cümle Türkçe kalır, kimse fark etmez.
 * Bu test kaynak koddaki bütün `t('...')` çağrılarını tarayıp karşılığı olmayan
 * anahtarları isim isim rapor ediyor.
 */

const RENDERER_DIR = path.resolve(__dirname, '../..');

function collectSourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'i18n') continue;
      files.push(...collectSourceFiles(full));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(full);
    }
  }
  return files;
}

/** `t('...')` çağrılarındaki sabit anahtarlar. Değişkenli çağrılar atlanır. */
function collectKeys(): Set<string> {
  const keys = new Set<string>();
  for (const file of collectSourceFiles(RENDERER_DIR)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) {
      keys.add(match[1].replace(/\\'/g, "'"));
    }
  }
  return keys;
}

describe('İngilizce sözlük', () => {
  it('koddaki bütün çeviri anahtarlarını karşılıyor', () => {
    const missing = [...collectKeys()].filter((key) => !(key in en)).sort();
    expect(missing).toEqual([]);
  });

  it('taradığı kodda anlamlı sayıda anahtar buluyor', () => {
    // Tarama bozulursa (yol değişikliği, desen hatası) test sessizce geçmesin.
    expect(collectKeys().size).toBeGreaterThan(300);
  });

  it('yer tutucuları çeviride koruyor', () => {
    const broken: string[] = [];
    for (const [key, value] of Object.entries(en)) {
      const source = [...key.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      const target = [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      if (JSON.stringify(source) !== JSON.stringify(target)) broken.push(key);
    }
    expect(broken).toEqual([]);
  });

  it('boş çeviri içermiyor', () => {
    const empty = Object.entries(en)
      .filter(([, value]) => value.trim().length === 0)
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });
});
