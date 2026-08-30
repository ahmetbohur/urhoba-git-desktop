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
  // --- Çalışma dizini ---
  'git:status',
  'git:stage',
  'git:unstage',
  'git:discard',
  'git:diff',
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
  'git:merge',
  'git:rebase',
  'git:operation-abort',
  'git:operation-continue',
  // --- Geçmiş ---
  'git:log',
  'git:commit-detail',
  'git:commit-file-diff',
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
  'app:open-logs',
  // --- GitHub ---
  'github:status',
  'github:sign-in',
  'github:sign-out',
  'github:repo-context',
  'github:repos',
  'github:pulls',
  'github:pull-checkout',
  'github:pull-create',
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
