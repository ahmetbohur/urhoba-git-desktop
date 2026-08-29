import { run } from '../git/client';
import { getRemotes } from '../git/remote';
import { checkout } from '../git/branches';
import { fetchViewer, request, type RawUser } from './api';
import { canPersist, clearToken, loadToken, saveToken } from './auth';
import { isGithubHost, parseRemoteUrl } from './remote-url';
import type { ForgeProvider } from './forge';
import type {
  CheckoutResult,
  GithubAuthStatus,
  GithubRepo,
  GithubUser,
  PullRequest,
  PullRequestState,
  RepoContext,
} from '@shared/types';

/**
 * GitHub sağlayıcısı.
 *
 * Arayüz "GitHub" değil "kod barındırma sağlayıcısı" kavramıyla konuşsun diye
 * bütün GitHub'a özgü bilgi bu dosyada toplandı: API biçimleri, alan adları,
 * PR referansları. GitLab veya Gitea eklenmek istendiğinde aynı işlevleri
 * sunan ikinci bir dosya yazmak yetecek; IPC katmanı ve arayüz değişmeyecek.
 */

function toUser(raw: RawUser): GithubUser {
  return {
    login: raw.login,
    name: raw.name,
    avatarUrl: raw.avatar_url,
    htmlUrl: raw.html_url,
  };
}

export async function getStatus(): Promise<GithubAuthStatus> {
  const token = loadToken();
  if (!token) {
    return { authenticated: false, user: null, scopes: [], persisted: canPersist() };
  }
  try {
    const { user, scopes } = await fetchViewer(token);
    return {
      authenticated: true,
      user: toUser(user),
      scopes,
      persisted: canPersist(),
    };
  } catch (error) {
    return {
      authenticated: false,
      user: null,
      scopes: [],
      persisted: canPersist(),
      message: error instanceof Error ? error.message : undefined,
    };
  }
}

export async function signIn(token: string): Promise<GithubAuthStatus> {
  // Önce doğrula, sonra sakla: geçersiz bir token'ı diske yazmanın anlamı yok.
  const { user, scopes } = await fetchViewer(token.trim());
  const { persisted } = saveToken(token.trim());
  return {
    authenticated: true,
    user: toUser(user),
    scopes,
    persisted,
    message: persisted
      ? undefined
      : 'İşletim sisteminde anahtarlık bulunamadı; token güvenlik gereği diske yazılmadı ve yalnızca bu oturumda geçerli.',
  };
}

export function signOut(): void {
  clearToken();
}

/**
 * Yerel deponun hangi GitHub deposuna karşılık geldiğini bulur.
 * `origin` öncelikli; yoksa GitHub'a işaret eden ilk remote kullanılır.
 */
export async function getRepoContext(
  repoId: string,
  repoPath: string,
): Promise<RepoContext | null> {
  const remotes = await getRemotes(repoId, repoPath);
  if (remotes.length === 0) return null;

  const ordered = [...remotes].sort((a, b) =>
    a.name === 'origin' ? -1 : b.name === 'origin' ? 1 : 0,
  );

  for (const remote of ordered) {
    const identity = parseRemoteUrl(remote.fetchUrl || remote.pushUrl);
    if (!identity) continue;
    if (!isGithubHost(identity.host)) continue;
    return { ...identity, isGithub: true, remoteName: remote.name };
  }

  // GitHub değilse de bağlamı döndürüyoruz: arayüz "bu depo GitHub'da değil"
  // diyebilsin, sessizce boş liste göstermesin.
  const first = parseRemoteUrl(ordered[0].fetchUrl || ordered[0].pushUrl);
  if (!first) return null;
  return { ...first, isGithub: false, remoteName: ordered[0].name };
}

interface RawRepo {
  full_name: string;
  name: string;
  owner: { login: string };
  description: string | null;
  private: boolean;
  fork: boolean;
  default_branch: string;
  ssh_url: string;
  clone_url: string;
  updated_at: string;
  stargazers_count: number;
}

export async function listRepos(query?: string): Promise<GithubRepo[]> {
  // Kullanıcının erişebildiği depolar; en son güncellenen üstte.
  const raw = await request<RawRepo[]>(
    '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',
  );

  const mapped = raw.map((repo) => ({
    fullName: repo.full_name,
    owner: repo.owner.login,
    name: repo.name,
    description: repo.description,
    isPrivate: repo.private,
    isFork: repo.fork,
    defaultBranch: repo.default_branch,
    sshUrl: repo.ssh_url,
    httpsUrl: repo.clone_url,
    updatedAt: repo.updated_at,
    stars: repo.stargazers_count,
  }));

  const needle = query?.trim().toLocaleLowerCase('tr');
  if (!needle) return mapped;
  return mapped.filter(
    (repo) =>
      repo.fullName.toLocaleLowerCase('tr').includes(needle) ||
      (repo.description ?? '').toLocaleLowerCase('tr').includes(needle),
  );
}

interface RawPull {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  draft: boolean;
  merged_at: string | null;
  user: { login: string; avatar_url: string };
  head: { ref: string; repo: { full_name: string } | null };
  base: { ref: string };
  html_url: string;
  created_at: string;
  updated_at: string;
  comments?: number;
}

function toPullRequest(raw: RawPull, contextFullName: string): PullRequest {
  const state: PullRequestState = raw.merged_at ? 'merged' : raw.state;
  const headRepo = raw.head.repo?.full_name ?? null;
  return {
    number: raw.number,
    title: raw.title,
    body: raw.body ?? '',
    state,
    isDraft: raw.draft,
    authorLogin: raw.user.login,
    authorAvatarUrl: raw.user.avatar_url,
    headRef: raw.head.ref,
    // Aynı depodan gelen PR'larda kaynak deponun adını taşımaya gerek yok.
    headRepoFullName: headRepo && headRepo !== contextFullName ? headRepo : null,
    baseRef: raw.base.ref,
    htmlUrl: raw.html_url,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    commentCount: raw.comments ?? 0,
  };
}

export async function listPullRequests(context: RepoContext): Promise<PullRequest[]> {
  const raw = await request<RawPull[]>(
    `/repos/${context.owner}/${context.name}/pulls?state=open&per_page=50&sort=updated&direction=desc`,
  );
  return raw.map((pull) => toPullRequest(pull, `${context.owner}/${context.name}`));
}

export async function createPullRequest(
  context: RepoContext,
  input: { title: string; body?: string; head: string; base: string; draft: boolean },
): Promise<PullRequest> {
  const raw = await request<RawPull>(`/repos/${context.owner}/${context.name}/pulls`, {
    method: 'POST',
    body: {
      title: input.title,
      body: input.body ?? '',
      head: input.head,
      base: input.base,
      draft: input.draft,
    },
  });
  return toPullRequest(raw, `${context.owner}/${context.name}`);
}

/**
 * PR dalına geçer.
 *
 * Aynı depodan gelen PR'lar için normal bir dal geçişi yeterli. Fork'tan gelen
 * PR'ın dalı yerelde yok; GitHub bunları `refs/pull/<numara>/head` altında
 * sunuyor, oradan yerel bir dala çekiyoruz. Dal adına `pr-<numara>` diyoruz ki
 * fork sahibinin dal adıyla çakışmasın.
 */
export async function checkoutPullRequest(
  repoId: string,
  repoPath: string,
  context: RepoContext,
  pull: PullRequest,
): Promise<CheckoutResult> {
  if (!pull.headRepoFullName) {
    await run({
      repoId,
      repoPath,
      args: ['fetch', context.remoteName, pull.headRef],
      allowFailure: true,
    });
    return checkout(repoId, repoPath, pull.headRef);
  }

  const localBranch = `pr-${pull.number}`;
  const fetched = await run({
    repoId,
    repoPath,
    args: [
      'fetch',
      context.remoteName,
      `refs/pull/${pull.number}/head:${localBranch}`,
      '--force',
    ],
    allowFailure: true,
  });
  if (!fetched.ok) {
    return {
      outcome: 'error',
      message: `PR dalı indirilemedi: ${fetched.stderr.split('\n')[0]}`,
      blockingPaths: [],
    };
  }
  return checkout(repoId, repoPath, localBranch);
}

/**
 * Bu modülün sağlayıcı sözleşmesini karşıladığını derleme zamanında doğrular.
 * Bir işlev eksik kalırsa ya da imzası kayarsa hata burada çıkar.
 */
const _contract: ForgeProvider = {
  getStatus,
  signIn,
  signOut,
  getRepoContext,
  listRepos,
  listPullRequests,
  createPullRequest,
  checkoutPullRequest,
};
void _contract;
