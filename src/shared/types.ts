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
  /**
   * Ait olduğu grup. Yoldan çıkarılır ama kullanıcı elle değiştirebilir;
   * değiştirdiyse sonraki çıkarımlar bunu ezmez.
   */
  groupName?: string;
  /** Kullanıcı grubu elle seçtiyse otomatik çıkarım devre dışı kalır. */
  groupPinnedByUser?: boolean;
  /** Listenin en üstündeki hızlı erişim bölümünde görünsün mü. */
  pinned?: boolean;
  /** Serbest etiketler — bir depo birden çok etiket taşıyabilir. */
  tags?: string[];
}

/** Kenar çubuğundaki bir grup ve durumu. */
export interface RepoGroup {
  name: string;
  count: number;
  collapsed: boolean;
}

/** Grup başlıklarındaki değişiklik rozetleri için hafif durum özeti. */
export interface RepoDirtyCount {
  repoId: string;
  /** Kaydedilmemiş değişiklik içeren dosya sayısı; okunamadıysa null. */
  changes: number | null;
}

/** Klasör taramasında bulunan bir depo. */
export interface ScannedRepo {
  path: string;
  name: string;
  /** Taranan klasöre göre yol — listede nerede olduğunu göstermek için. */
  relativePath: string;
  currentBranch: string | null;
  /** Depo listesinde zaten var mı. */
  alreadyAdded: boolean;
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

/** `git blame` çıktısındaki tek bir satır. */
export interface BlameLine {
  sha: string;
  shortSha: string;
  lineNumber: number;
  content: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  /** Satırı getiren commit'in özeti. */
  summary: string;
}

export interface BlameResult {
  path: string;
  lines: BlameLine[];
  /** İkili ya da çok büyük dosyalarda satır listesi boş gelir. */
  unavailableReason: string | null;
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

export type AiProviderId = 'ollama' | 'openai' | 'anthropic';

/**
 * Sağlayıcı, model ve adres hesap düzeyinde ayarlar — depo başına ayrı bir
 * model tutmak anahtar yönetimini de ikiye bölerdi. AI'ın açık olup olmaması
 * ise depoya göre değişebiliyor; o alan `ScopedSettings.aiEnabled` içinde.
 */
export interface AiSettings {
  provider: AiProviderId;
  model: string;
  ollamaHost: string;
}

export interface AiStatus {
  enabled: boolean;
  provider: AiProviderId;
  model: string;
  hasKey: boolean;
  /** Anahtarlar diske şifreli yazılabiliyor mu. */
  keysPersisted: boolean;
  /** Seçili sağlayıcı yerel mi — kod makineden çıkıyor mu. */
  isLocal: boolean;
}

/** Diff'in modele hangi ayrıntı düzeyinde gönderildiği. */
export type DiffDetail = 'full' | 'truncated-files' | 'changed-lines' | 'file-list';

export interface CommitSuggestion {
  subject: string;
  body: string;
  detail: DiffDetail;
  /** Daraltma uygulandıysa kullanıcıya gösterilecek açıklama. */
  note: string | null;
  charactersSent: number;
  provider: AiProviderId;
}

export interface DescriptionSuggestion {
  description: string;
  /** Modele neyin verildiği: README bulunduysa metni, yoksa dosya listesi. */
  source: 'readme' | 'file-list';
  charactersSent: number;
  provider: AiProviderId;
}

export interface GroupSuggestion {
  group: string;
  repoIds: string[];
  repoNames: string[];
}

/** Sistem açılışında otomatik başlatma durumu. */
export interface AutostartStatus {
  /** Bu ortamda ayarlanabiliyor mu. */
  supported: boolean;
  enabled: boolean;
  /** Desteklenmiyorsa ya da yazılamadıysa sebebi. */
  reason?: string;
}

/** Sorun bildirirken paylaşılacak ortam bilgisi. */
export interface Diagnostics {
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  platform: string;
  gitVersion: string;
  embeddedGitDirectory: string | null;
  usesEmbeddedGit: boolean;
  userDataPath: string;
  logPath: string;
}

export interface GithubUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
}

export interface GithubAuthStatus {
  authenticated: boolean;
  user: GithubUser | null;
  /** Token'ın sahip olduğu yetkiler; PR oluşturmak için `repo` gerekiyor. */
  scopes: string[];
  /**
   * Token diske şifrelenerek yazılabildi mi. İşletim sisteminde anahtarlık yoksa
   * token yalnızca bu oturum boyunca bellekte tutulur.
   */
  persisted: boolean;
  message?: string;
}

/** Yeni depo açılabilecek hesap: kişisel hesap ya da bir organizasyon. */
export interface GithubOwner {
  login: string;
  isOrganization: boolean;
  avatarUrl: string;
}

export interface PublishResult {
  repo: GithubRepo;
  /**
   * Dal gönderilebildi mi. Depo GitHub'da oluşup push başarısız olabiliyor;
   * arayüz bu ikisini ayırt edebilmeli.
   */
  pushed: boolean;
  message: string;
}

export interface GithubRepo {
  fullName: string;
  owner: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  isFork: boolean;
  defaultBranch: string;
  sshUrl: string;
  httpsUrl: string;
  updatedAt: string;
  stars: number;
}

export type PullRequestState = 'open' | 'closed' | 'merged';

export interface PullRequest {
  number: number;
  title: string;
  body: string;
  state: PullRequestState;
  isDraft: boolean;
  authorLogin: string;
  authorAvatarUrl: string;
  /** PR'ın geldiği dal adı. */
  headRef: string;
  /** Fork'tan geliyorsa kaynak deponun tam adı; aynı depodansa null. */
  headRepoFullName: string | null;
  baseRef: string;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  commentCount: number;
}

/** Aktif deponun hangi GitHub deposuna karşılık geldiği. */
export interface RepoContext {
  host: string;
  owner: string;
  name: string;
  isGithub: boolean;
  remoteName: string;
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

export interface BranchRenameResult {
  outcome: 'renamed' | 'error';
  message: string;
  /** Uzak sunucudaki dal da yeni ada taşındı mı. */
  remoteUpdated: boolean;
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

export type LanguagePreference = 'tr' | 'en';

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

/**
 * Hem genel hem depo bazlı ayarlanabilen alanlar.
 *
 * Genel ayar bütün depolar için geçerli; bir depo istediği alanı kendisi için
 * geçersiz kılabiliyor. Geçersiz kılınmayan alan genel ayarı izlemeye devam
 * ediyor — genel ayar değiştiğinde o depolar da kendiliğinden güncelleniyor.
 */
export interface ScopedSettings {
  autoPull: AutoPullSettings;
  /** Otomatik pull kapalıyken de arka planda fetch edilip rozetler tazelensin mi. */
  autoFetch: boolean;
  /** Bu deponun kodu bulut AI sağlayıcısına gönderilebilir mi. */
  allowCloudAi: boolean;
  /** AI yardımı açık mı — kapalıyken hiçbir istek gitmiyor. */
  aiEnabled: boolean;
}

/** Bir depoda hangi alanların genel ayardan ayrıldığı. */
export interface SettingsOverrides {
  autoPull: boolean;
  autoFetch: boolean;
  allowCloudAi: boolean;
  aiEnabled: boolean;
}

/** Bir depo için geçerli olan çözülmüş ayarlar ve hangilerinin özel olduğu. */
export interface RepoSettings extends ScopedSettings {
  overrides: SettingsOverrides;
}

export interface AppSettings {
  theme: ThemePreference;
  language: LanguagePreference;
  ai: AiSettings;
  /** Bütün depolar için geçerli varsayılanlar; depo bazlı ayar bunları ezebilir. */
  defaults: ScopedSettings;
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
  | { type: 'app:show-about' }
  | { type: 'repo:changed'; repoId: string }
  | { type: 'git:command'; entry: GitLogEntry }
  | { type: 'autopull:result'; result: AutoPullResult }
  | { type: 'clone:progress'; progress: CloneProgress };
