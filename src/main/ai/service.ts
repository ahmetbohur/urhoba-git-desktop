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
  ActivityDigest,
  ActivitySummary,
  CommitSuggestion,
  DescriptionSuggestion,
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

/** README'den modele verilecek metin için üst sınır (karakter). */
const README_LIMIT = 6_000;

const README_NAMES = ['README.md', 'README.markdown', 'README.txt', 'README', 'readme.md'];

const DESCRIPTION_SYSTEM = [
  'Sana bir yazılım deposunun adı, dosya listesi ve varsa README’si veriliyor.',
  'Bu depo için GitHub’daki "description" alanına yazılacak tek cümlelik bir tanıtım yaz.',
  'Projenin ne yaptığını söyle; "bu depo", "bu proje" gibi kalıplarla başlama.',
  'En fazla 200 karakter olsun, tek satır olsun, nokta ile bitmesin.',
  'README hangi dilde yazılmışsa tanıtımı da o dilde yaz.',
  'Yalnızca cümleyi döndür, tırnak ya da başka hiçbir şey ekleme.',
].join(' ');

/**
 * Depo tanıtımı önerisi.
 *
 * README varsa asıl kaynak o: bir projenin ne yaptığını en iyi anlatan metin
 * zaten orada duruyor. Yoksa üst düzey dosya listesiyle yetiniliyor — dosya
 * adları da bir şey söylüyor ve hiçbir şey önermemekten iyi.
 *
 * Listeyi `git ls-tree` veriyor, dosya sistemini taramak yerine: takip
 * edilmeyen `node_modules` gibi klasörler böylece hiç görünmüyor.
 */
export async function suggestDescription(
  repoId: string,
  repoPath: string,
  repoName: string,
): Promise<DescriptionSuggestion> {
  const settings = store.getSettings().ai;
  requireEnabled(repoId, settings);
  assertCloudAllowed(repoId, settings);

  let readme = '';
  for (const name of README_NAMES) {
    const candidate = path.join(repoPath, name);
    try {
      if (fs.existsSync(candidate)) {
        readme = fs.readFileSync(candidate, 'utf8').slice(0, README_LIMIT);
        break;
      }
    } catch {
      /* okunamayan dosyayı atla */
    }
  }

  let files = '';
  try {
    const { stdout } = await run({
      repoId,
      repoPath,
      args: ['ls-tree', '--name-only', 'HEAD'],
      skipQueue: true,
    });
    files = stdout.split('\n').filter(Boolean).slice(0, 60).join(', ');
  } catch {
    /* commit yoksa liste boş kalır */
  }

  const user = [
    `Depo adı: ${repoName}`,
    files.length > 0 ? `Üst düzey dosyalar: ${files}` : '',
    readme.length > 0 ? `README:\n${readme}` : 'README yok.',
  ]
    .filter((part) => part.length > 0)
    .join('\n\n');

  const raw = await clientFor(settings).complete(
    { system: DESCRIPTION_SYSTEM, user, maxTokens: 200 },
    settings.model,
  );

  /*
   * Model bazen cümleyi tırnağa alıyor ya da bir açıklama satırı ekliyor.
   * İlk dolu satırı alıp tırnakları kırpmak ikisini de temizliyor; GitHub'ın
   * 350 karakterlik sınırı da burada uygulanıyor.
   */
  const description = (raw.split('\n').find((line) => line.trim().length > 0) ?? '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .slice(0, 350);

  log('info', 'Depo tanıtımı önerisi üretildi', {
    provider: settings.provider,
    source: readme.length > 0 ? 'readme' : 'file-list',
    characters: user.length,
  });

  return {
    description,
    source: readme.length > 0 ? 'readme' : 'file-list',
    charactersSent: user.length,
    provider: settings.provider,
  };
}

const DIGEST_SYSTEM = [
  'Sana bir geliştiricinin belirli bir zaman aralığındaki git etkinliği veriliyor.',
  'Kendi yazdığı commit’ler ve uzak sunucudan inen commit’ler ayrı ayrı listeleniyor.',
  'Bunları kısa bir Türkçe özete çevir: neyin üzerinde çalışılmış, başkalarından ne gelmiş.',
  'Depo adlarını kullan. En fazla beş cümle yaz.',
  'Commit mesajlarını tek tek tekrar etme; anlamlı kümeler hâlinde topla.',
  'Yalnızca özeti döndür, başlık ya da giriş cümlesi ekleme.',
].join(' ');

/**
 * Etkinlik özetini metne çevirir.
 *
 * Commit mesajları depo adlarından çok daha fazla şey söylüyor. Bu yüzden
 * bulut sağlayıcı seçiliyse, bulut AI'ya kapalı olan depolar özetten
 * çıkarılıyor: o depo "kodum dışarı çıkmasın" demişse mesajları da çıkmamalı.
 * Gruplama bu izni aramıyor çünkü yalnızca ad gönderiyor; burada durum farklı.
 */
export async function summarizeActivity(summary: ActivitySummary): Promise<ActivityDigest> {
  const settings = store.getSettings().ai;
  requireEnabled(null, settings);

  const isCloud = settings.provider !== 'ollama';
  const allowed = summary.repos.filter(
    (repo) => !isCloud || store.getRepoSettings(repo.repoId).allowCloudAi,
  );
  const excludedRepos = summary.repos.length - allowed.length;

  if (allowed.length === 0) {
    throw new AiError(
      excludedRepos > 0
        ? 'Bütün depolar bulut AI’ya kapalı; özetlenecek bir şey kalmadı.'
        : 'Bu aralıkta özetlenecek hareket yok.',
    );
  }

  const parts: string[] = [];
  let commitsSent = 0;
  for (const repo of allowed) {
    const lines: string[] = [`Depo: ${repo.repoName}`];
    if (repo.authored.length > 0) {
      lines.push('Yazdıkları:');
      for (const commit of repo.authored) lines.push(`- ${commit.subject}`);
      commitsSent += repo.authored.length;
    }
    if (repo.arrived.length > 0) {
      lines.push('Uzaktan inenler:');
      for (const commit of repo.arrived) {
        lines.push(`- ${commit.subject} (${commit.authorName})`);
      }
      commitsSent += repo.arrived.length;
    }
    parts.push(lines.join('\n'));
  }

  const raw = await clientFor(settings).complete(
    { system: DIGEST_SYSTEM, user: parts.join('\n\n'), maxTokens: 600 },
    settings.model,
  );

  log('info', 'Etkinlik özeti üretildi', {
    provider: settings.provider,
    repos: allowed.length,
    excludedRepos,
    commits: commitsSent,
  });

  return {
    text: raw.trim(),
    provider: settings.provider,
    excludedRepos,
    commitsSent,
  };
}

const GROUP_SYSTEM = [
  'Sana bir geliştiricinin depo adları ve klasör yolları veriliyor.',
  'Bunları anlamlı kümelere ayır: aynı ürünün parçaları, aynı türden projeler, aynı müşteriye ait işler.',
  'Grup adları kısa ve Türkçe olsun.',
  'Yalnızca JSON dizisi döndür, başka hiçbir şey yazma.',
  'Biçim: [{"group":"grup adı","repos":["depo adı","depo adı"]}]',
  'Emin olamadığın depoları hiçbir gruba koyma.',
  'Kullanıcı ek istek yazdıysa onlara uy; biçim kuralı her durumda geçerli.',
].join(' ');

/**
 * Kullanıcının biriktirdiği istek sayısı için üst sınır.
 *
 * Gruplama uzun bir müzakere değil; sınırsız birikme hem istemi şişiriyor hem
 * de eski isteklerin yenileriyle çelişmesine yol açıyor.
 */
const MAX_GROUP_INSTRUCTIONS = 6;

/**
 * Gruplama önerisi.
 *
 * Kullanıcının istekleri sohbet dökümü olarak değil, biriken bir liste olarak
 * gönderiliyor: model her seferinde bütün kısıtlarla baştan türetiyor. Kendi
 * önceki çıktısını geri beslemek onu ona bağlıyor ve "şunu da böl" dendiğinde
 * eski hatayı taşımaya devam ediyordu. Ayrıca istemci sözleşmesi tek turlu;
 * çok turlu mesaj üç sağlayıcının üçünde de ayrı biçim demek.
 */
export async function suggestGroups(instructions: string[] = []): Promise<GroupSuggestion[]> {
  const settings = store.getSettings().ai;
  // Gruplama bütün depoları birden ilgilendiriyor; tek bir deponun ayarına
  // bakmak anlamsız olurdu, genel varsayılan geçerli.
  requireEnabled(null, settings);
  // Gruplama yalnızca depo adlarını gönderiyor; kod gitmediği için depo bazlı
  // izin aranmıyor.

  const repos: Repo[] = store.getRepos();
  if (repos.length === 0) return [];

  const listed = repos
    .map((repo) => `${repo.name}  (${repo.groupName ?? 'gruplanmamış'})`)
    .join('\n');

  const wanted = instructions
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(-MAX_GROUP_INSTRUCTIONS);

  const user =
    wanted.length === 0
      ? listed
      : [
          listed,
          '',
          'Kullanıcının istekleri (hepsine birden uy):',
          ...wanted.map((line, index) => `${index + 1}. ${line}`),
        ].join('\n');

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
