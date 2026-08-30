import { z } from 'zod';
import type { IpcChannel } from './ipc-channels';
import type {
  AppSettings,
  BranchList,
  CheckoutResult,
  Commit,
  CommitDetail,
  AiStatus,
  AutostartStatus,
  BlameResult,
  BranchRenameResult,
  CommitSuggestion,
  DescriptionSuggestion,
  DeviceCodeInfo,
  ConflictFile,
  Diagnostics,
  GithubAuthStatus,
  GithubOwner,
  GithubRepo,
  GroupSuggestion,
  MergeResult,
  PublishResult,
  PullRequest,
  FetchResult,
  FileDiff,
  PullResult,
  PushResult,
  Remote,
  Repo,
  RepoContext,
  RepoDirtyCount,
  RepoSettings,
  RevertResult,
  ScannedRepo,
  SshEnvironment,
  SshKey,
  SshTestResult,
  Stash,
  Tag,
  WorkingTreeStatus,
} from './types';

/**
 * Girdi şemaları ve çıktı tipleri.
 *
 * Kanal adları `ipc-channels.ts` içinde; burası her kanalın ne aldığını ve ne
 * döndürdüğünü tanımlar. Dosyanın sonundaki `_channelCoverage` kontrolü iki
 * listenin birbirinden ayrılmasını derleme zamanında engelliyor.
 */

const repoId = z.object({ repoId: z.string().min(1) });

export const inputSchemas = {
  // --- Depo yönetimi ---
  'repo:list': z.undefined(),
  'repo:add': z.object({ path: z.string().min(1) }),
  'repo:add-dialog': z.undefined(),
  'repo:remove': z.object({ id: z.string().min(1) }),
  'repo:clone': z.object({
    url: z.string().min(1),
    parentDir: z.string().min(1),
    name: z.string().optional(),
    taskId: z.string().min(1),
  }),
  'repo:pick-directory': z.undefined(),
  'repo:scan': z.object({
    directory: z.string().min(1),
    maxDepth: z.number().int().min(1).max(8).optional(),
  }),
  'repo:add-many': z.object({ paths: z.array(z.string().min(1)).min(1) }),
  'repo:reveal': repoId,
  'repo:update': z.object({
    id: z.string().min(1),
    groupName: z.string().nullable().optional(),
    pinned: z.boolean().optional(),
    tags: z.array(z.string().min(1)).optional(),
  }),
  'repo:dirty-counts': z.undefined(),
  'repo:group-collapse': z.object({ name: z.string().min(1), collapsed: z.boolean() }),
  'repo:collapsed-groups': z.undefined(),
  'repo:group-rename': z.object({ from: z.string().min(1), to: z.string().min(1) }),
  'repo:tags': z.undefined(),

  // --- Çalışma dizini ---
  'git:status': repoId,
  'git:stage': repoId.extend({ paths: z.array(z.string()).min(1) }),
  'git:unstage': repoId.extend({ paths: z.array(z.string()).min(1) }),
  'git:discard': repoId.extend({ paths: z.array(z.string()).min(1) }),
  'git:diff': repoId.extend({ path: z.string().min(1), staged: z.boolean() }),
  'git:commit': repoId.extend({
    subject: z.string().min(1),
    body: z.string().optional(),
    amend: z.boolean().optional(),
  }),
  'git:last-commit-message': repoId,
  'git:stage-lines': repoId.extend({
    path: z.string().min(1),
    mode: z.enum(['stage', 'unstage', 'discard']),
    selections: z
      .array(
        z.object({
          hunkIndex: z.number().int().min(0),
          lineIndices: z.array(z.number().int().min(0)).min(1),
        }),
      )
      .min(1),
  }),
  'git:ignore-path': repoId.extend({ path: z.string().min(1) }),
  'git:open-external': repoId.extend({ path: z.string().min(1) }),

  // --- Dallar ---
  'git:branches': repoId,
  'git:branch-create': repoId.extend({
    name: z.string().min(1),
    from: z.string().optional(),
    checkout: z.boolean(),
  }),
  'git:checkout': repoId.extend({ name: z.string().min(1) }),
  'git:branch-delete': repoId.extend({ name: z.string().min(1), force: z.boolean() }),
  'git:branch-rename': repoId.extend({
    from: z.string().min(1),
    to: z.string().min(1),
    updateRemote: z.boolean(),
  }),
  'git:merge': repoId.extend({ branch: z.string().min(1) }),
  'git:rebase': repoId.extend({ branch: z.string().min(1) }),
  'git:operation-abort': repoId,
  'git:operation-continue': repoId,

  // --- Geçmiş ---
  'git:log': repoId.extend({
    skip: z.number().int().min(0),
    limit: z.number().int().min(1).max(1000),
    ref: z.string().optional(),
    filter: z
      .object({
        author: z.string().optional(),
        message: z.string().optional(),
        path: z.string().optional(),
        since: z.string().optional(),
        until: z.string().optional(),
      })
      .optional(),
  }),
  'git:commit-detail': repoId.extend({ sha: z.string().min(1) }),
  'git:commit-file-diff': repoId.extend({ sha: z.string().min(1), path: z.string().min(1) }),
  'git:blame': repoId.extend({ path: z.string().min(1), ref: z.string().optional() }),
  'git:cherry-pick': repoId.extend({ sha: z.string().min(1) }),

  // --- Geçmiş işlemleri ---
  'git:revert': repoId.extend({ sha: z.string().min(1) }),
  'git:reset': repoId.extend({
    sha: z.string().min(1),
    mode: z.enum(['soft', 'mixed', 'hard']),
  }),

  // --- Etiketler ---
  'git:tag-list': repoId,
  'git:tag-create': repoId.extend({
    name: z.string().min(1),
    sha: z.string().optional(),
    message: z.string().optional(),
  }),
  'git:tag-delete': repoId.extend({ name: z.string().min(1), remote: z.boolean() }),
  'git:tag-push': repoId.extend({ name: z.string().min(1) }),

  // --- Stash ---
  'git:stash-list': repoId,
  'git:stash-create': repoId.extend({
    message: z.string().optional(),
    includeUntracked: z.boolean(),
  }),
  'git:stash-apply': repoId.extend({ index: z.number().int().min(0), pop: z.boolean() }),
  'git:stash-drop': repoId.extend({ index: z.number().int().min(0) }),

  // --- Çakışma çözümü ---
  'git:conflict-read': repoId.extend({ path: z.string().min(1) }),
  'git:conflict-resolve': repoId.extend({
    path: z.string().min(1),
    // Bölüm bazlı seçim: her çakışma bölümü için bizimki / onlarki / ikisi.
    choices: z.array(z.enum(['ours', 'theirs', 'both'])),
  }),

  // --- Uzak sunucular ---
  'git:remotes': repoId,
  'git:remote-add': repoId.extend({ name: z.string().min(1), url: z.string().min(1) }),
  'git:remote-remove': repoId.extend({ name: z.string().min(1) }),
  'git:remote-set-url': repoId.extend({ name: z.string().min(1), url: z.string().min(1) }),
  'git:fetch': repoId,
  'git:pull': repoId.extend({ fastForwardOnly: z.boolean().optional() }),
  'git:push': repoId.extend({
    setUpstream: z.boolean().optional(),
    /**
     * Zorlamalı gönderim yalnızca `--force-with-lease` ile yapılır: uzak dalda
     * bizim bilmediğimiz bir commit varsa git reddeder. Düz `--force` hiçbir
     * yerde kullanılmıyor.
     */
    forceWithLease: z.boolean().optional(),
  }),

  // --- Ayarlar ---
  'settings:get': z.undefined(),
  'settings:set': z.object({
    theme: z.enum(['system', 'light', 'dark']).optional(),
    language: z.enum(['tr', 'en']).optional(),
    ai: z
      .object({
        provider: z.enum(['ollama', 'openai', 'anthropic']),
        model: z.string(),
        ollamaHost: z.string().min(1),
      })
      .optional(),
    sideBySideDiff: z.boolean().optional(),
    lastOpenedRepoId: z.string().nullable().optional(),
    defaults: z
      .object({
        autoPull: z.object({
          enabled: z.boolean(),
          intervalMinutes: z.number().int().min(1).max(1440),
          onlyWhenClean: z.boolean(),
          fastForwardOnly: z.boolean(),
        }),
        autoFetch: z.boolean(),
        allowCloudAi: z.boolean(),
        aiEnabled: z.boolean(),
      })
      .optional(),
  }),
  'settings:repo-get': repoId,
  /**
   * `null` verilen alan depo kaydından siliniyor ve depo yeniden genel ayarı
   * izlemeye başlıyor. Alanın hiç verilmemesi "dokunma" demek.
   */
  'settings:repo-set': repoId.extend({
    autoFetch: z.boolean().nullable().optional(),
    allowCloudAi: z.boolean().nullable().optional(),
    aiEnabled: z.boolean().nullable().optional(),
    autoPull: z
      .object({
        enabled: z.boolean(),
        intervalMinutes: z.number().int().min(1).max(1440),
        onlyWhenClean: z.boolean(),
        fastForwardOnly: z.boolean(),
      })
      .nullable()
      .optional(),
  }),

  // --- Otomatik pull ---
  'autopull:run-now': repoId,

  // --- Tanılama ---
  'app:diagnostics': z.undefined(),
  'app:autostart-get': z.undefined(),
  'app:autostart-set': z.object({ enabled: z.boolean() }),
  'app:open-logs': z.undefined(),

  // --- AI ---
  // Depo verilmezse genel varsayılan durum dönüyor: gruplama gibi tek bir
  // depoya bağlı olmayan işlemler için gereken de o.
  'ai:status': z.object({ repoId: z.string().nullable() }),
  'ai:models': z.undefined(),
  'ai:set-key': z.object({
    provider: z.enum(['ollama', 'openai', 'anthropic']),
    key: z.string(),
  }),
  'ai:suggest-commit': repoId,
  'ai:suggest-description': repoId,
  'ai:suggest-groups': z.undefined(),
  'ai:apply-groups': z.object({
    assignments: z.array(z.object({ group: z.string().min(1), repoIds: z.array(z.string()) })),
  }),

  // --- GitHub ---
  'github:status': z.undefined(),
  'github:sign-in': z.object({ token: z.string().min(1) }),
  'github:device-start': z.undefined(),
  // Kullanıcı tarayıcıda onaylayana kadar açık kalıyor; iptal ayrı kanaldan.
  'github:device-wait': z.undefined(),
  'github:device-cancel': z.undefined(),
  'github:sign-out': z.undefined(),
  'github:repo-context': repoId,
  'github:repos': z.object({ query: z.string().optional() }),
  'github:owners': z.undefined(),
  'github:publish': repoId.extend({
    // GitHub'ın kendi sınırı 100 karakter; buradan geçen ad zaten temizlenmiş
    // oluyor ama sözleşme yine de kendi başına ayakta durmalı.
    name: z.string().min(1).max(100),
    description: z.string().max(350).optional(),
    isPrivate: z.boolean(),
    owner: z.string().min(1),
  }),
  'github:pulls': repoId,
  'github:pull-checkout': repoId.extend({ number: z.number().int().positive() }),
  'github:pull-create': repoId.extend({
    title: z.string().min(1),
    body: z.string().optional(),
    base: z.string().min(1),
    draft: z.boolean(),
  }),

  // --- SSH ---
  'ssh:environment': z.undefined(),
  'ssh:generate-key': z.object({
    comment: z.string().min(1),
    fileName: z.string().min(1),
  }),
  'ssh:test-github': z.undefined(),
  'ssh:copy-public-key': z.object({ publicKeyPath: z.string().min(1) }),
} as const;

export type IpcInput<C extends IpcChannel> = z.infer<(typeof inputSchemas)[C]>;

export interface IpcOutputs {
  'repo:list': Repo[];
  'repo:add': Repo;
  'repo:add-dialog': Repo | null;
  'repo:remove': void;
  'repo:clone': Repo;
  'repo:pick-directory': string | null;
  'repo:scan': ScannedRepo[];
  'repo:add-many': Repo[];
  'repo:reveal': void;
  'repo:update': Repo | null;
  'repo:dirty-counts': RepoDirtyCount[];
  'repo:group-collapse': void;
  'repo:collapsed-groups': string[];
  'repo:group-rename': void;
  'repo:tags': string[];

  'git:status': WorkingTreeStatus;
  'git:stage': void;
  'git:unstage': void;
  'git:discard': void;
  'git:diff': FileDiff;
  'git:commit': { sha: string };
  'git:last-commit-message': { subject: string; body: string };
  'git:stage-lines': void;
  'git:ignore-path': void;
  'git:open-external': void;

  'git:branches': BranchList;
  'git:branch-create': void;
  'git:checkout': CheckoutResult;
  'git:branch-delete': void;
  'git:branch-rename': BranchRenameResult;
  'git:merge': MergeResult;
  'git:rebase': MergeResult;
  'git:operation-abort': void;
  'git:operation-continue': MergeResult;

  'git:stash-list': Stash[];
  'git:stash-create': void;
  'git:stash-apply': void;
  'git:stash-drop': void;

  'git:conflict-read': ConflictFile;
  'git:conflict-resolve': void;

  'git:log': Commit[];
  'git:commit-detail': CommitDetail;
  'git:commit-file-diff': FileDiff;
  'git:blame': BlameResult;
  'git:cherry-pick': MergeResult;

  'git:remotes': Remote[];
  'git:remote-add': void;
  'git:remote-remove': void;
  'git:remote-set-url': void;

  'git:revert': RevertResult;
  'git:reset': void;

  'git:tag-list': Tag[];
  'git:tag-create': void;
  'git:tag-delete': void;
  'git:tag-push': void;
  'git:fetch': FetchResult;
  'git:pull': PullResult;
  'git:push': PushResult;

  'settings:get': AppSettings;
  'settings:set': AppSettings;
  'settings:repo-get': RepoSettings;
  'settings:repo-set': RepoSettings;

  'autopull:run-now': PullResult;

  'app:diagnostics': Diagnostics;
  'app:autostart-get': AutostartStatus;
  'app:autostart-set': AutostartStatus;
  'app:open-logs': void;

  'ai:status': AiStatus;
  'ai:models': string[];
  'ai:set-key': boolean;
  'ai:suggest-commit': CommitSuggestion;
  'ai:suggest-description': DescriptionSuggestion;
  'ai:suggest-groups': GroupSuggestion[];
  'ai:apply-groups': void;

  'github:status': GithubAuthStatus;
  'github:sign-in': GithubAuthStatus;
  'github:device-start': DeviceCodeInfo;
  'github:device-wait': GithubAuthStatus;
  'github:device-cancel': void;
  'github:sign-out': void;
  'github:repo-context': RepoContext | null;
  'github:repos': GithubRepo[];
  'github:owners': GithubOwner[];
  'github:publish': PublishResult;
  'github:pulls': PullRequest[];
  'github:pull-checkout': CheckoutResult;
  'github:pull-create': PullRequest;

  'ssh:environment': SshEnvironment;
  'ssh:generate-key': SshKey;
  'ssh:test-github': SshTestResult;
  'ssh:copy-public-key': void;
}

export type IpcOutput<C extends IpcChannel> = IpcOutputs[C];

/**
 * Şema tablosu ile kanal listesinin birbirinden ayrılmasını engelleyen denetim:
 * her iki taraf da boş olmak zorunda, aksi hâlde bu atama derlenmiyor.
 */
type MissingSchemas = Exclude<IpcChannel, keyof typeof inputSchemas>;
type ExtraSchemas = Exclude<keyof typeof inputSchemas, IpcChannel>;
const _channelCoverage: [MissingSchemas, ExtraSchemas] = [
  undefined as never,
  undefined as never,
];
void _channelCoverage;

export type { IpcChannel };
export {
  APP_EVENT_CHANNEL,
  IPC_CHANNELS,
  isIpcError,
  type IpcErrorShape,
} from './ipc-channels';
