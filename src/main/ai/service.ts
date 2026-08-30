import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { run } from '../git/client';
import { getStatus } from '../git/status';
import { getLog } from '../git/history';
import { log } from '../services/logger';
import * as store from '../services/store';
import { createAnthropicClient } from './anthropic';
import { createOllamaClient } from './ollama';
import { createOpenAiClient } from './openai';
import { fitDiff } from './diff-budget';
import { AiError, type AiClient } from './types';
import type {
  AiProviderId,
  AiSettings,
  AiStatus,
  CommitSuggestion,
  GroupSuggestion,
  Repo,
} from '@shared/types';

/**
 * AI servisleri.
 *
 * Üç kural bu dosyanın tamamını belirliyor:
 *
 * 1. **Varsayılan kapalı.** Açılmadan hiçbir istek gitmiyor.
 * 2. **Yerel önce.** Ollama varsayılan sağlayıcı; kod makineden çıkmıyor.
 *    Bulut sağlayıcı seçilmişse depo başına ayrı izin isteniyor — "bütün
 *    depolarda açık" diye bir seçenek yok.
 * 3. **Ne gönderildiği görünür.** Her öneri, gönderilen metnin ne kadar
 *    olduğunu ve hangi daraltmanın uygulandığını geri bildiriyor.
 */

const KEY_FILE = 'ai-keys.enc';

/** Bulut sağlayıcılarına gönderilecek diff için üst sınır (karakter). */
const DIFF_LIMIT = 24_000;

type KeyStore = Partial<Record<AiProviderId, string>>;

let keyCache: KeyStore | null = null;

function keyPath(): string {
  return path.join(app.getPath('userData'), KEY_FILE);
}

function loadKeys(): KeyStore {
  if (keyCache) return keyCache;
  keyCache = {};
  try {
    if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(keyPath())) return keyCache;
    keyCache = JSON.parse(safeStorage.decryptString(fs.readFileSync(keyPath()))) as KeyStore;
  } catch {
    // Anahtarlık değişmiş ya da dosya bozuk; kullanıcıdan yeniden girmesini isteyeceğiz.
    keyCache = {};
  }
  return keyCache;
}

function saveKeys(keys: KeyStore): boolean {
  keyCache = keys;
  try {
    if (!safeStorage.isEncryptionAvailable()) return false;
    fs.writeFileSync(keyPath(), safeStorage.encryptString(JSON.stringify(keys)), { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

export function setApiKey(provider: AiProviderId, key: string): boolean {
  const keys = { ...loadKeys() };
  if (key.trim().length === 0) delete keys[provider];
  else keys[provider] = key.trim();
  return saveKeys(keys);
}

function clientFor(settings: AiSettings): AiClient {
  const keys = loadKeys();
  switch (settings.provider) {
    case 'ollama':
      return createOllamaClient(settings.ollamaHost);
    case 'openai': {
      const key = keys.openai;
      if (!key) throw new AiError('OpenAI API anahtarı girilmemiş.');
      return createOpenAiClient(key);
    }
    case 'anthropic': {
      const key = keys.anthropic;
      if (!key) throw new AiError('Claude API anahtarı girilmemiş.');
      return createAnthropicClient(key);
    }
  }
}

/**
 * AI'ın açık olup olmaması depoya göre değişebiliyor; sağlayıcı ve model ise
 * hesap düzeyinde. Depo verilmediğinde (gruplama gibi tek bir depoya bağlı
 * olmayan işlemler) genel varsayılan geçerli.
 */
export function getStatusSummary(repoId: string | null): AiStatus {
  const settings = store.getSettings().ai;
  const keys = loadKeys();
  return {
    enabled: isEnabledFor(repoId),
    provider: settings.provider,
    model: settings.model,
    /** Bulut sağlayıcı seçiliyse anahtar var mı. */
    hasKey: settings.provider === 'ollama' ? true : !!keys[settings.provider],
    keysPersisted: (() => {
      try {
        return safeStorage.isEncryptionAvailable();
      } catch {
        return false;
      }
    })(),
    isLocal: settings.provider === 'ollama',
  };
}

export async function listModels(): Promise<string[]> {
  return clientFor(store.getSettings().ai).listModels();
}

/**
 * Bulut sağlayıcıya kod göndermeden önce deponun izni olmalı.
 * Yerel modelde bu soru hiç sorulmuyor; kod zaten makineden çıkmıyor.
 */
function assertCloudAllowed(repoId: string, settings: AiSettings): void {
  if (settings.provider === 'ollama') return;
  if (store.getRepoSettings(repoId).allowCloudAi) return;
  throw new AiError(
    'Bu depo için bulut sağlayıcıya kod göndermeye izin verilmemiş. Ayarlardan açabilirsin.',
  );
}

function isEnabledFor(repoId: string | null): boolean {
  return repoId === null
    ? store.getSettings().defaults.aiEnabled
    : store.getRepoSettings(repoId).aiEnabled;
}

function requireEnabled(repoId: string | null, settings: AiSettings): void {
  if (!isEnabledFor(repoId)) {
    throw new AiError(
      repoId === null
        ? 'AI yardımı kapalı. Ayarlardan açabilirsin.'
        : 'AI yardımı bu depo için kapalı. Ayarlardan açabilirsin.',
    );
  }
  if (!settings.model) throw new AiError('Model seçilmemiş. Ayarlardan bir model seç.');
}

const COMMIT_SYSTEM = [
  'Sen bir git commit mesajı yazarısın.',
  'Sana verilen diff için tek satırlık bir başlık ve isteğe bağlı bir gövde yaz.',
  'Başlık 72 karakteri geçmesin, emir kipiyle yazılsın, nokta ile bitmesin.',
  'Gövde varsa neyin neden değiştiğini anlatsın; ne yapıldığını satır satır tekrar etmesin.',
  'Sana örnek olarak verilen son commit mesajlarının dilini ve biçimini taklit et.',
  'Yanıtını şu biçimde ver: ilk satır başlık, sonra boş satır, sonra gövde. Başka hiçbir şey yazma.',
].join(' ');

export async function suggestCommitMessage(
  repoId: string,
  repoPath: string,
): Promise<CommitSuggestion> {
  const settings = store.getSettings().ai;
  requireEnabled(repoId, settings);
  assertCloudAllowed(repoId, settings);

  const status = await getStatus(repoId, repoPath);
  if (status.staged.length === 0) {
    throw new AiError('Hazırlanmış değişiklik yok. Önce dosyaları hazırla.');
  }

  const { stdout: diff } = await run({
    repoId,
    repoPath,
    args: ['diff', '--cached', '--no-color', '--no-ext-diff', '-U3'],
    skipQueue: true,
  });
  const budget = fitDiff(diff, status.staged, DIFF_LIMIT);

  // Deponun yazım tarzını modele göstermek için son commit'ler.
  const recent = await getLog(repoId, repoPath, 0, 5);
  const examples = recent.map((commit) => commit.subject).join('\n');

  const user = [
    `Dal: ${status.branch ?? 'bilinmiyor'}`,
    examples.length > 0 ? `Bu depodaki son commit mesajları:\n${examples}` : '',
    `Değişen dosyalar:\n${status.staged.map((file) => `${file.kind}: ${file.path}`).join('\n')}`,
    `Diff:\n${budget.text}`,
  ]
    .filter((part) => part.length > 0)
    .join('\n\n');

  const raw = await clientFor(settings).complete(
    { system: COMMIT_SYSTEM, user, maxTokens: 400 },
    settings.model,
  );

  const lines = raw.split('\n');
  const subject = (lines[0] ?? '').trim().replace(/^["'`]|["'`]$/g, '');
  const body = lines.slice(1).join('\n').trim();

  log('info', 'Commit mesajı önerisi üretildi', {
    provider: settings.provider,
    detail: budget.detail,
    characters: budget.characters,
  });

  return {
    subject,
    body,
    detail: budget.detail,
    note: budget.note,
    charactersSent: budget.characters,
    provider: settings.provider,
  };
}

const GROUP_SYSTEM = [
  'Sana bir geliştiricinin depo adları ve klasör yolları veriliyor.',
  'Bunları anlamlı kümelere ayır: aynı ürünün parçaları, aynı türden projeler, aynı müşteriye ait işler.',
  'Grup adları kısa ve Türkçe olsun.',
  'Yalnızca JSON dizisi döndür, başka hiçbir şey yazma.',
  'Biçim: [{"group":"grup adı","repos":["depo adı","depo adı"]}]',
  'Emin olamadığın depoları hiçbir gruba koyma.',
].join(' ');

export async function suggestGroups(): Promise<GroupSuggestion[]> {
  const settings = store.getSettings().ai;
  // Gruplama bütün depoları birden ilgilendiriyor; tek bir deponun ayarına
  // bakmak anlamsız olurdu, genel varsayılan geçerli.
  requireEnabled(null, settings);
  // Gruplama yalnızca depo adlarını gönderiyor; kod gitmediği için depo bazlı
  // izin aranmıyor.

  const repos: Repo[] = store.getRepos();
  if (repos.length === 0) return [];

  const user = repos
    .map((repo) => `${repo.name}  (${repo.groupName ?? 'gruplanmamış'})`)
    .join('\n');

  const raw = await clientFor(settings).complete(
    { system: GROUP_SYSTEM, user, maxTokens: 1200 },
    settings.model,
  );

  return parseGroupSuggestions(raw, repos);
}

/**
 * Model çıktısını ayrıştırır.
 *
 * Modeller JSON'u kod bloğuna sarmayı ve öncesine açıklama yazmayı seviyor;
 * ilk dizi parantezinden sonuncusuna kadar olan kısmı alıyoruz. Var olmayan
 * depo adları eleniyor — model uydurduğunda listeye hayalet giriş düşmesin.
 */
export function parseGroupSuggestions(raw: string, repos: Repo[]): GroupSuggestion[] {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const byName = new Map(repos.map((repo) => [repo.name, repo.id]));

  return parsed
    .map((entry) => {
      const record = entry as { group?: unknown; repos?: unknown };
      const group = typeof record.group === 'string' ? record.group.trim() : '';
      const names = Array.isArray(record.repos)
        ? record.repos.filter((name): name is string => typeof name === 'string')
        : [];
      const repoIds = names.map((name) => byName.get(name)).filter((id): id is string => !!id);
      return { group, repoIds, repoNames: names.filter((name) => byName.has(name)) };
    })
    .filter((suggestion) => suggestion.group.length > 0 && suggestion.repoIds.length > 0);
}
