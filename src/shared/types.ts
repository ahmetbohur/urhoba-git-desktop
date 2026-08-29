/**
 * Ana süreç ile arayüzün paylaştığı veri modeli.
 * Buradaki tipler IPC sınırından geçtiği için serileştirilebilir olmak zorunda:
 * sınıf örneği, fonksiyon veya Date yok — tarihler ISO metin olarak taşınır.
 */

/** Depo listesindeki bir kayıt. Disk üzerindeki yolun kimliği id'dir. */
export interface Repo {
  id: string;
  name: string;
  path: string;
  /** Listede en son ne zaman açıldı — sıralama için. ISO 8601. */
  lastOpenedAt: string;
  addedAt: string;
}

export type FileChangeKind =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'conflicted'
  | 'typechange';

export interface FileChange {
  /** Depo köküne göre yol. */
  path: string;
  /** Yeniden adlandırmada eski yol. */
  oldPath?: string;
  kind: FileChangeKind;
  /** İkili dosyalar için diff gösterilmez. */
  isBinary: boolean;
}

/** Depoda yarım kalmış bir işlem varsa arayüz farklı davranır (commit yerine "devam et"). */
export type RepoOperation = 'none' | 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'bisect';

export interface WorkingTreeStatus {
  branch: string | null;
  /** Örn. "origin/main". Upstream yoksa null. */
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: FileChange[];
  unstaged: FileChange[];
  conflicted: FileChange[];
  operation: RepoOperation;
  /** HEAD hiç commit almamışsa true — ilk commit akışı farklı. */
  isEmptyRepo: boolean;
}

export type DiffLineKind = 'context' | 'add' | 'del' | 'meta';

export interface DiffLine {
  kind: DiffLineKind;
  content: string;
  /** Eski dosyadaki satır numarası; eklenen satırlarda null. */
  oldLine: number | null;
  /** Yeni dosyadaki satır numarası; silinen satırlarda null. */
  newLine: number | null;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  oldPath?: string;
  isBinary: boolean;
  /** Diff üretilemeyecek kadar büyük dosyalarda hunk listesi boş gelir. */
  isTooLarge: boolean;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

export interface CommitRef {
  /** Etiket, dal veya HEAD işaretçisi. */
  name: string;
  kind: 'head' | 'local' | 'remote' | 'tag';
}

export interface Commit {
  sha: string;
  shortSha: string;
  subject: string;
  body: string;
  authorName: string;
  authorEmail: string;
  /** ISO 8601. */
  authoredAt: string;
  parents: string[];
  refs: CommitRef[];
}

export interface CommitDetail extends Commit {
  files: FileChange[];
  additions: number;
  deletions: number;
}

export interface Branch {
  name: string;
  /** Uzak dallarda "origin/main" biçiminde tam ad. */
  fullName: string;
  isCurrent: boolean;
  isRemote: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  lastCommitSha: string;
  lastCommitSubject: string;
  lastCommitAt: string;
}

export interface BranchList {
  current: string | null;
  local: Branch[];
  remote: Branch[];
}

export interface Remote {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export interface FetchResult {
  /** Uzak sunucudan gelen yeni commit sayısı (mevcut dalın upstream'i için). */
  behind: number;
  ahead: number;
  updatedRefs: string[];
}

export type PullOutcome =
  | 'up-to-date'
  | 'fast-forwarded'
  | 'merged'
  | 'conflict'
  | 'skipped-dirty'
  | 'skipped-no-upstream'
  | 'skipped-diverged'
  | 'skipped-operation-in-progress'
  | 'error';

export interface PullResult {
  outcome: PullOutcome;
  /** Kullanıcıya gösterilecek Türkçe açıklama. */
  message: string;
  commitsPulled: number;
}

export interface PushResult {
  ok: boolean;
  message: string;
  /** Upstream yoksa push sırasında kurulmuş olabilir. */
  upstreamSet: boolean;
}

export interface Tag {
  name: string;
  sha: string;
  /** Açıklamalı (annotated) etiketlerde mesaj; hafif etiketlerde commit özeti. */
  message: string;
  isAnnotated: boolean;
  taggedAt: string;
}

export type ResetMode = 'soft' | 'mixed' | 'hard';

/**
 * Geçmiş filtresi. Boş bırakılan alanlar git komutuna hiç eklenmiyor;
 * "hepsi" ile "boş dize" arasındaki farkı korumak için tipler isteğe bağlı.
 */
export interface LogFilter {
  author?: string;
  message?: string;
  path?: string;
  /** ISO tarih (YYYY-MM-DD). */
  since?: string;
  until?: string;
}

export type RevertOutcome = 'reverted' | 'conflict' | 'error';

export interface RevertResult {
  outcome: RevertOutcome;
  message: string;
  conflictedPaths: string[];
}

/** Bir stash kaydı. `index` listedeki sırayı verir: 0 en son stash'lenen. */
export interface Stash {
  index: number;
  message: string;
  branch: string | null;
  createdAt: string;
  sha: string;
}

export type CheckoutOutcome = 'switched' | 'blocked-dirty' | 'error';

export interface CheckoutResult {
  outcome: CheckoutOutcome;
  message: string;
  /** Engellenen durumda hangi dosyaların üzerine yazılacağı. */
  blockingPaths: string[];
}

export type MergeOutcome = 'merged' | 'up-to-date' | 'conflict' | 'error';

export interface MergeResult {
  outcome: MergeOutcome;
  message: string;
  conflictedPaths: string[];
}

/**
 * Çakışan dosyanın çakışma işaretlerine göre bölünmüş hâli.
 * `stable` parçalar iki tarafta da aynı; `conflict` parçalarında seçim gerekiyor.
 */
export type ConflictSection =
  | { kind: 'stable'; lines: string[] }
  | {
      kind: 'conflict';
      /** Bizim dalımızdaki hâli (<<<<<<< ile ======= arası). */
      ours: string[];
      /** Gelen daldaki hâli (======= ile >>>>>>> arası). */
      theirs: string[];
      oursLabel: string;
      theirsLabel: string;
    };

export interface ConflictFile {
  path: string;
  sections: ConflictSection[];
  /** İkili dosyalarda metin birleştirme yapılamaz. */
  isBinary: boolean;
}

export type ConflictChoice = 'ours' | 'theirs' | 'both';

/** Satır bazlı hazırlama isteğinde hangi hunk'tan hangi satırların seçildiği. */
export interface HunkSelection {
  hunkIndex: number;
  /** Hunk içindeki satır dizinleri (yalnızca add/del satırları anlamlı). */
  lineIndices: number[];
}

export type LineStageMode = 'stage' | 'unstage' | 'discard';

export interface AutoPullResult extends PullResult {
  repoId: string;
  at: string;
}

/** Git komut günlüğü paneli — hangi komutun çalıştığı kullanıcıya görünür olsun. */
export interface GitLogEntry {
  id: string;
  repoId: string | null;
  command: string;
  durationMs: number;
  ok: boolean;
  error?: string;
  at: string;
}

export type ThemePreference = 'system' | 'light' | 'dark';

export interface AutoPullSettings {
  enabled: boolean;
  /** Dakika cinsinden aralık. */
  intervalMinutes: number;
  /** Çalışma dizini kirliyken pull denenmesin (varsayılan davranış). */
  onlyWhenClean: boolean;
  /**
   * Yalnızca fast-forward. Ayrılmış (diverged) geçmişte otomatik merge yapmak
   * kullanıcının haberi olmadan commit üretir; varsayılan olarak kapalıdır.
   */
  fastForwardOnly: boolean;
}

export interface RepoSettings {
  autoPull: AutoPullSettings;
  /** Otomatik pull kapalıyken de arka planda fetch edilip rozetler tazelensin mi. */
  autoFetch: boolean;
}

export interface AppSettings {
  theme: ThemePreference;
  /** Tüm depolar için varsayılan; depo bazlı ayar bunu ezer. */
  defaultAutoPull: AutoPullSettings;
  autoFetchIntervalMinutes: number;
  /** Commit ekranında diff'i yan yana göster. */
  sideBySideDiff: boolean;
  lastOpenedRepoId: string | null;
}

export interface SshKey {
  /** Özel anahtarın tam yolu. */
  path: string;
  publicKeyPath: string;
  type: string;
  comment: string;
  /** Tam public key metni — GitHub'a yapıştırılmak üzere. */
  publicKey: string;
  fingerprint: string;
  /** ssh-agent'a yüklü mü. */
  loadedInAgent: boolean;
}

export interface SshEnvironment {
  agentRunning: boolean;
  keys: SshKey[];
  /** ssh-keygen bulunamazsa anahtar üretimi kapalı olur. */
  sshKeygenAvailable: boolean;
}

export interface SshTestResult {
  ok: boolean;
  /** GitHub başarılı kimlik doğrulamada kullanıcı adını döner. */
  username: string | null;
  message: string;
}

export interface CloneProgress {
  taskId: string;
  phase: string;
  percent: number;
}

/** Ana süreçten arayüze itilen olaylar. Tek kanal, ayrımlı birleşim. */
export type AppEvent =
  | { type: 'repo:changed'; repoId: string }
  | { type: 'git:command'; entry: GitLogEntry }
  | { type: 'autopull:result'; result: AutoPullResult }
  | { type: 'clone:progress'; progress: CloneProgress };
