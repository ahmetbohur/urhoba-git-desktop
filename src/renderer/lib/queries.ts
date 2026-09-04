import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { invoke } from './ipc';
import type {
  AiStatus,
  AppSettings,
  BranchList,
  Commit,
  CommitDetail,
  ConflictFile,
  FileDiff,
  GithubAuthStatus,
  GithubRepo,
  LogFilter,
  PullRequest,
  Remote,
  RepoContext,
  RepoDirtyCount,
  RepoEntry,
  RepoSettings,
  SshEnvironment,
  Stash,
  Tag,
  UpdateStatus,
  WorkingTreeStatus,
} from '@shared/types';

/**
 * Sorgu anahtarları tek yerde: bir mutasyondan sonra neyin geçersiz kılınacağını
 * ararken dosya dosya dolaşmamak için.
 */
export const keys = {
  repos: ['repos'] as const,
  settings: ['settings'] as const,
  ssh: ['ssh'] as const,
  repo: (id: string) => ['repo', id] as const,
  status: (id: string) => ['repo', id, 'status'] as const,
  branches: (id: string) => ['repo', id, 'branches'] as const,
  remotes: (id: string) => ['repo', id, 'remotes'] as const,
  log: (id: string, filter?: LogFilter) => ['repo', id, 'log', filter ?? null] as const,
  tags: (id: string) => ['repo', id, 'tags'] as const,
  repoSettings: (id: string) => ['repo', id, 'settings'] as const,
  stashes: (id: string) => ['repo', id, 'stashes'] as const,
  github: ['github'] as const,
  repoContext: (id: string) => ['repo', id, 'github-context'] as const,
  pulls: (id: string) => ['repo', id, 'pulls'] as const,
  conflict: (id: string, path: string) => ['repo', id, 'conflict', path] as const,
  workingDiff: (id: string, path: string, staged: boolean) =>
    ['repo', id, 'diff', path, staged] as const,
  commitDetail: (id: string, sha: string) => ['repo', id, 'commit', sha] as const,
  commitDiff: (id: string, sha: string, path: string) => ['repo', id, 'commit', sha, path] as const,
};

export function useRepos() {
  return useQuery<RepoEntry[]>({
    queryKey: keys.repos,
    queryFn: () => invoke('repo:list', undefined),
  });
}

export function useDirtyCounts(enabled: boolean) {
  return useQuery<RepoDirtyCount[]>({
    queryKey: ['dirty-counts'],
    queryFn: () => invoke('repo:dirty-counts', undefined),
    enabled,
    // Grup rozetleri için; depo başına tek hafif komut çalışıyor.
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useAllTags() {
  return useQuery<string[]>({
    queryKey: ['tags'],
    queryFn: () => invoke('repo:tags', undefined),
  });
}

export function useSettings() {
  return useQuery<AppSettings>({
    queryKey: keys.settings,
    queryFn: () => invoke('settings:get', undefined),
  });
}

export function useRepoSettings(repoId: string | null) {
  return useQuery<RepoSettings>({
    queryKey: keys.repoSettings(repoId ?? ''),
    queryFn: () => invoke('settings:repo-get', { repoId: repoId as string }),
    enabled: !!repoId,
  });
}

/**
 * Bütün depoların ayarını tek seferde çeker — kenar çubuğunda hangi depolarda
 * otomatik pull açık olduğunu göstermek için. Sorgular `useRepoSettings` ile
 * aynı anahtarı paylaştığı için önbellek ortak, ekstra IPC trafiği doğurmaz.
 */
export function useAutoPullRepoIds(repoIds: string[]): Set<string> {
  const results = useQueries({
    queries: repoIds.map((id) => ({
      queryKey: keys.repoSettings(id),
      queryFn: () => invoke('settings:repo-get', { repoId: id }),
    })),
  });
  const enabled = new Set<string>();
  results.forEach((result, index) => {
    if (result.data?.autoPull.enabled) enabled.add(repoIds[index]);
  });
  return enabled;
}

export function useStatus(repoId: string | null) {
  return useQuery<WorkingTreeStatus>({
    queryKey: keys.status(repoId ?? ''),
    queryFn: () => invoke('git:status', { repoId: repoId as string }),
    enabled: !!repoId,
    // Dosya izleyicisi zaten haber veriyor; bu yalnızca izleyicinin kaçırdığı
    // durumlar için ağ niteliğinde bir emniyet ağı.
    refetchInterval: 15_000,
  });
}

export function useBranches(repoId: string | null) {
  return useQuery<BranchList>({
    queryKey: keys.branches(repoId ?? ''),
    queryFn: () => invoke('git:branches', { repoId: repoId as string }),
    enabled: !!repoId,
  });
}

export function useRemotes(repoId: string | null) {
  return useQuery<Remote[]>({
    queryKey: keys.remotes(repoId ?? ''),
    queryFn: () => invoke('git:remotes', { repoId: repoId as string }),
    enabled: !!repoId,
  });
}

const LOG_PAGE_SIZE = 150;

/**
 * Geçmişi sayfa sayfa yükler.
 *
 * Büyük depolarda tüm geçmişi çekmek hem yavaş hem gereksiz: kullanıcı ilk
 * ekranda son 150 commit'i görüyor, aşağı indikçe devamı geliyor. Filtre sorgu
 * anahtarının parçası olduğu için filtre değişince liste baştan yükleniyor.
 */
export function useLog(repoId: string | null, filter?: LogFilter) {
  return useInfiniteQuery({
    queryKey: keys.log(repoId ?? '', filter),
    queryFn: ({ pageParam }) =>
      invoke('git:log', {
        repoId: repoId as string,
        skip: pageParam,
        limit: LOG_PAGE_SIZE,
        filter,
      }),
    initialPageParam: 0,
    // Dolu sayfa geldiyse devamı olabilir; eksik sayfa geldiyse geçmiş bitti.
    getNextPageParam: (lastPage: Commit[], allPages: Commit[][]) =>
      lastPage.length < LOG_PAGE_SIZE
        ? undefined
        : allPages.reduce((total, page) => total + page.length, 0),
    enabled: !!repoId,
  });
}

export function useTags(repoId: string | null) {
  return useQuery<Tag[]>({
    queryKey: keys.tags(repoId ?? ''),
    queryFn: () => invoke('git:tag-list', { repoId: repoId as string }),
    enabled: !!repoId,
  });
}

export function useCommitDetail(repoId: string | null, sha: string | null) {
  return useQuery<CommitDetail>({
    queryKey: keys.commitDetail(repoId ?? '', sha ?? ''),
    queryFn: () => invoke('git:commit-detail', { repoId: repoId as string, sha: sha as string }),
    enabled: !!repoId && !!sha,
  });
}

export function useWorkingDiff(repoId: string | null, path: string | null, staged: boolean) {
  return useQuery<FileDiff>({
    queryKey: keys.workingDiff(repoId ?? '', path ?? '', staged),
    queryFn: () => invoke('git:diff', { repoId: repoId as string, path: path as string, staged }),
    enabled: !!repoId && !!path,
  });
}

export function useCommitFileDiff(repoId: string | null, sha: string | null, path: string | null) {
  return useQuery<FileDiff>({
    queryKey: keys.commitDiff(repoId ?? '', sha ?? '', path ?? ''),
    queryFn: () =>
      invoke('git:commit-file-diff', {
        repoId: repoId as string,
        sha: sha as string,
        path: path as string,
      }),
    enabled: !!repoId && !!sha && !!path,
  });
}

export function useStashes(repoId: string | null) {
  return useQuery<Stash[]>({
    queryKey: keys.stashes(repoId ?? ''),
    queryFn: () => invoke('git:stash-list', { repoId: repoId as string }),
    enabled: !!repoId,
  });
}

export function useConflict(repoId: string | null, path: string | null) {
  return useQuery<ConflictFile>({
    queryKey: keys.conflict(repoId ?? '', path ?? ''),
    queryFn: () => invoke('git:conflict-read', { repoId: repoId as string, path: path as string }),
    enabled: !!repoId && !!path,
    // Çakışma dosyası diskte değişebilir; önbellekte tutmuyoruz.
    staleTime: 0,
  });
}

export function useGithubStatus(options?: Partial<UseQueryOptions<GithubAuthStatus>>) {
  return useQuery<GithubAuthStatus>({
    queryKey: keys.github,
    queryFn: () => invoke('github:status', undefined),
    // Token doğrulaması bir ağ isteği; gereksiz yere tekrarlamıyoruz.
    staleTime: 5 * 60_000,
    retry: false,
    ...options,
  });
}

export function useRepoContext(repoId: string | null) {
  return useQuery<RepoContext | null>({
    queryKey: keys.repoContext(repoId ?? ''),
    queryFn: () => invoke('github:repo-context', { repoId: repoId as string }),
    enabled: !!repoId,
  });
}

export function usePullRequests(repoId: string | null, enabled: boolean) {
  return useQuery<PullRequest[]>({
    queryKey: keys.pulls(repoId ?? ''),
    queryFn: () => invoke('github:pulls', { repoId: repoId as string }),
    enabled: !!repoId && enabled,
    retry: false,
  });
}

export function useGithubRepos(query: string, enabled: boolean) {
  return useQuery<GithubRepo[]>({
    queryKey: [...keys.github, 'repos', query],
    queryFn: () => invoke('github:repos', { query: query || undefined }),
    enabled,
    retry: false,
  });
}

/**
 * `repoId` verilmezse genel varsayılan durum okunuyor — gruplama gibi tek bir
 * depoya bağlı olmayan yerlerde gereken de o. Anahtar depoyu içeriyor; aksi
 * hâlde bir depoda okunan durum diğerinde önbellekten dönerdi.
 */
/**
 * Bilinen sürüm durumu.
 *
 * Sorgu ağa gitmiyor; ana süreçteki son kontrolün sonucunu okuyor. Kontrolün
 * kendisi zamanlayıcıya bağlı — arayüzün her açılışında GitHub'a gitmek
 * gereksiz istek demek.
 */
export function useUpdateStatus() {
  return useQuery<UpdateStatus>({
    queryKey: ['update-status'],
    queryFn: () => invoke('app:update-status', undefined),
  });
}

export function useAiStatus(repoId: string | null = null) {
  return useQuery<AiStatus>({
    queryKey: ['ai-status', repoId],
    queryFn: () => invoke('ai:status', { repoId }),
  });
}

export function useAiModels(enabled: boolean) {
  return useQuery<string[]>({
    queryKey: ['ai-models'],
    queryFn: () => invoke('ai:models', undefined),
    enabled,
    retry: false,
  });
}

export function useSshEnvironment(options?: Partial<UseQueryOptions<SshEnvironment>>) {
  return useQuery<SshEnvironment>({
    queryKey: keys.ssh,
    queryFn: () => invoke('ssh:environment', undefined),
    ...options,
  });
}

/**
 * Depoya dokunan her mutasyondan sonra o deponun bütün sorgularını tazeler.
 * Tek tek hangi sorgunun etkilendiğini hesaplamak yerine depo ön ekiyle toptan
 * geçersiz kılmak hem daha az hatalı hem de pratikte yeterince hızlı.
 */
/**
 * Bir depo değiştiğinde tazelenmesi gerekenler.
 *
 * Kenar çubuğundaki değişiklik sayacı da buraya dahil. Eskiden değildi ve
 * sonucu sessizdi: commit ya da pull sonrası rozet olduğu yerde kalıyor,
 * ancak altmış saniyelik zamanlayıcı dönünce düzeliyordu. Kullanıcı açısından
 * sayı "takılmış" görünüyor.
 *
 * Sayaç bütün depoları tarıyor ama maliyeti ölçüldü: depo başına
 * `git status --porcelain -uno` üç milisaniye, elli depo paralelde yirmi
 * milisaniyenin altında. Her değişiklikte tazelemek için bir engel yok.
 */
export function useInvalidateRepo() {
  const client = useQueryClient();
  return (repoId: string) => {
    void client.invalidateQueries({ queryKey: ['repo', repoId] });
    void refreshDirtyCount(client, repoId);
  };
}

/**
 * Tek deponun sayacını tazeler ve önbellekteki listeye işler.
 *
 * Eskiden bütün liste geçersiz kılınıyordu: bir depo değiştiğinde elli dört
 * `git status` çalışıyordu. Ölçüldüğünde tek başına ucuz görünüyor (paralelde
 * yirmi bir milisaniye) ama ağ komutlarıyla aynı kuyruğa düştüğünde yüzlerce
 * milisaniyeye çıkıyordu. Değişen tek depoysa taranacak da tek depo.
 *
 * Liste henüz yüklenmemişse hiçbir şey yapmıyor: ilk yükleme zaten tam
 * taramayı çalıştırıyor.
 */
export async function refreshDirtyCount(
  client: ReturnType<typeof useQueryClient>,
  repoId: string,
): Promise<void> {
  if (!client.getQueryData(['dirty-counts'])) return;
  const guncel = await invoke('repo:dirty-count', { repoId });
  client.setQueryData<RepoDirtyCount[]>(['dirty-counts'], (onceki) => {
    if (!onceki) return onceki;
    const yeni = onceki.filter((entry) => entry.repoId !== repoId);
    yeni.push(guncel);
    return yeni;
  });
}

export { useMutation, useQuery, useQueryClient };
