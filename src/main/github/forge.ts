import type {
  CheckoutResult,
  GithubAuthStatus,
  GithubRepo,
  PullRequest,
  RepoContext,
} from '@shared/types';

/**
 * Kod barındırma sağlayıcısı sözleşmesi.
 *
 * Bugün tek uygulama GitHub. Arayüzü şimdiden yazmamızın sebebi ileride GitLab
 * ya da Gitea eklemek değil — o gün geldiğinde nasıl olsa gözden geçirilecek.
 * Sebep şu: IPC katmanının sağlayıcıdan tam olarak neye ihtiyaç duyduğunu tek
 * yerde görünür kılmak ve GitHub'a özgü bir ayrıntının (etiket adı, API alanı,
 * PR referans biçimi) yanlışlıkla dışarı sızmasını derleme zamanında yakalamak.
 */
export interface ForgeProvider {
  getStatus(): Promise<GithubAuthStatus>;
  signIn(token: string): Promise<GithubAuthStatus>;
  signOut(): void;
  getRepoContext(repoId: string, repoPath: string): Promise<RepoContext | null>;
  listRepos(query?: string): Promise<GithubRepo[]>;
  listPullRequests(context: RepoContext): Promise<PullRequest[]>;
  createPullRequest(
    context: RepoContext,
    input: { title: string; body?: string; head: string; base: string; draft: boolean },
  ): Promise<PullRequest>;
  checkoutPullRequest(
    repoId: string,
    repoPath: string,
    context: RepoContext,
    pull: PullRequest,
  ): Promise<CheckoutResult>;
}
