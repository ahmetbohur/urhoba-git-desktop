/**
 * Kanal adları ve hata zarfı.
 *
 * Bu dosya bilerek bağımlılıksız: preload yalnızca burayı import ediyor, böylece
 * güven sınırındaki paket zod'u ve şema tablosunu taşımıyor. Şemalar ve çıktı
 * tipleri `ipc-contract.ts` içinde; orası kanal listesiyle birebir örtüşmek
 * zorunda ve bu derleme zamanında denetleniyor.
 */

export const IPC_CHANNELS = [
  // --- Depo yönetimi ---
  'repo:list',
  'repo:add',
  'repo:add-dialog',
  'repo:remove',
  'repo:clone',
  'repo:pick-directory',
  'repo:scan',
  'repo:add-many',
  'repo:reveal',
  'repo:update',
  'repo:dirty-counts',
  'repo:group-collapse',
  'repo:collapsed-groups',
  'repo:group-rename',
  'repo:tags',
  // --- Çalışma dizini ---
  'git:status',
  'git:stage',
  'git:unstage',
  'git:discard',
  'git:diff',
  'git:file-preview',
  'git:commit',
  'git:last-commit-message',
  'git:stage-lines',
  'git:ignore-path',
  'git:open-external',
  // --- Dallar ---
  'git:branches',
  'git:branch-create',
  'git:checkout',
  'git:branch-delete',
  'git:branch-rename',
  'git:merge',
  'git:rebase',
  'git:rebase-interactive',
  'git:operation-abort',
  'git:operation-continue',
  // --- Geçmiş ---
  'git:log',
  'git:commit-detail',
  'git:commit-file-diff',
  'git:blame',
  'git:reflog',
  'activity:summary',
  'git:bisect-start',
  'git:bisect-mark',
  'git:bisect-reset',
  'git:worktrees',
  'git:submodules',
  'git:submodule-update',
  'git:cherry-pick',
  // --- Geçmiş işlemleri ---
  'git:revert',
  'git:reset',
  // --- Etiketler ---
  'git:tag-list',
  'git:tag-create',
  'git:tag-delete',
  'git:tag-push',
  // --- Stash ---
  'git:stash-list',
  'git:stash-create',
  'git:stash-apply',
  'git:stash-drop',
  // --- Çakışma çözümü ---
  'git:conflict-read',
  'git:conflict-resolve',
  // --- Uzak sunucular ---
  'git:remotes',
  'git:remote-add',
  'git:remote-remove',
  'git:remote-set-url',
  'git:fetch',
  'git:pull',
  'git:push',
  // --- Ayarlar ---
  'settings:get',
  'settings:set',
  'settings:repo-get',
  'settings:repo-set',
  // --- Otomatik pull ---
  'autopull:run-now',
  // --- Tanılama ---
  'app:diagnostics',
  'app:autostart-get',
  'app:autostart-set',
  'app:open-logs',
  // --- AI ---
  'ai:status',
  'ai:models',
  'ai:set-key',
  'ai:suggest-commit',
  'ai:suggest-description',
  'ai:suggest-groups',
  'ai:summarize-activity',
  'ai:apply-groups',
  // --- GitHub ---
  'github:status',
  'github:sign-in',
  'github:device-start',
  'github:device-wait',
  'github:device-cancel',
  'github:sign-out',
  'github:repo-context',
  'github:repos',
  'github:pulls',
  'github:pull-checkout',
  'github:pull-create',
  'github:owners',
  'github:publish',
  // --- SSH ---
  'ssh:environment',
  'ssh:generate-key',
  'ssh:test-github',
  'ssh:copy-public-key',
] as const;

export type IpcChannel = (typeof IPC_CHANNELS)[number];

/** Ana süreçten arayüze itilen olayların taşındığı tek kanal. */
export const APP_EVENT_CHANNEL = 'app:event';

/**
 * IPC sınırından geçerken Error nesnesi düz objeye dönüşüp yığın izini kaybeder.
 * Git hataları arayüzde okunabilir kalsın diye kendi zarfımızı kullanıyoruz.
 */
export interface IpcErrorShape {
  __urhobaError: true;
  message: string;
  /** Git'in stderr çıktısı — komut günlüğü panelinde gösterilir. */
  detail?: string;
  code?: string;
}

export function isIpcError(value: unknown): value is IpcErrorShape {
  return typeof value === 'object' && value !== null && '__urhobaError' in value;
}
