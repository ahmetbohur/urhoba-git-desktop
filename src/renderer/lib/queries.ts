import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { invoke } from './ipc';
import type {
  AppSettings,
  BranchList,
  Commit,
  CommitDetail,
  ConflictFile,
  FileDiff,
  Remote,
  Repo,
  RepoSettings,
  SshEnvironment,
  Stash,
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
  log: (id: string) => ['repo', id, 'log'] as const,
  repoSettings: (id: string) => ['repo', id, 'settings'] as const,
  stashes: (id: string) => ['repo', id, 'stashes'] as const,
  conflict: (id: string, path: string) => ['repo', id, 'conflict', path] as const,
  workingDiff: (id: string, path: string, staged: boolean) =>
    ['repo', id, 'diff', path, staged] as const,
  commitDetail: (id: string, sha: string) => ['repo', id, 'commit', sha] as const,
  commitDiff: (id: string, sha: string, path: string) =>
    ['repo', id, 'commit', sha, path] as const,
};

export function useRepos() {
  return useQuery<Repo[]>({ queryKey: keys.repos, queryFn: () => invoke('repo:list', undefined) });
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

const LOG_PAGE_SIZE = 200;

export function useLog(repoId: string | null) {
  return useQuery<Commit[]>({
    queryKey: keys.log(repoId ?? ''),
    queryFn: () => invoke('git:log', { repoId: repoId as string, skip: 0, limit: LOG_PAGE_SIZE }),
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
    queryFn: () =>
      invoke('git:diff', { repoId: repoId as string, path: path as string, staged }),
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
    queryFn: () =>
      invoke('git:conflict-read', { repoId: repoId as string, path: path as string }),
    enabled: !!repoId && !!path,
    // Çakışma dosyası diskte değişebilir; önbellekte tutmuyoruz.
    staleTime: 0,
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
export function useInvalidateRepo() {
  const client = useQueryClient();
  return (repoId: string) => {
    void client.invalidateQueries({ queryKey: ['repo', repoId] });
  };
}

export { useMutation, useQueryClient };
