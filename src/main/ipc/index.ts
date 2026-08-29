import { ipcMain } from 'electron';
import { inputSchemas, type IpcChannel, type IpcInput, type IpcOutput } from '@shared/ipc-contract';
import { toIpcError } from '../git/client';
import * as branches from '../git/branches';
import * as conflict from '../git/conflict';
import * as history from '../git/history';
import * as merge from '../git/merge';
import * as rewrite from '../git/rewrite';
import * as tags from '../git/tags';
import * as remote from '../git/remote';
import * as staging from '../git/staging';
import * as stash from '../git/stash';
import * as status from '../git/status';
import * as autopull from '../services/autopull';
import * as repos from '../services/repos';
import * as ssh from '../services/ssh';
import * as store from '../services/store';
import { watchRepo } from '../services/watcher';

/**
 * Kanal işleyicileri.
 *
 * Her işleyici sözleşmedeki girdiyi zod ile doğrulanmış hâlde alır ve
 * sözleşmedeki çıktı tipini döndürmek zorundadır — `Handlers` tipi bunu derleme
 * zamanında zorluyor, dolayısıyla sözleşmeye kanal ekleyip işleyiciyi unutmak
 * mümkün değil.
 */

type Handlers = {
  [C in IpcChannel]: (input: IpcInput<C>) => Promise<IpcOutput<C>> | IpcOutput<C>;
};

/**
 * Kullanıcının hangi depoya baktığını izliyoruz: dosya izleyicisi yalnızca bu
 * depoyu takip eder ve "son açılan" sıralaması buradan güncellenir.
 */
let activeRepoId: string | null = null;

function activateRepo(repoId: string): { id: string; path: string } {
  const repo = repos.requireRepo(repoId);
  if (activeRepoId !== repo.id) {
    activeRepoId = repo.id;
    store.touchRepo(repo.id);
    void watchRepo(repo.id, repo.path);
  }
  return { id: repo.id, path: repo.path };
}

const handlers: Handlers = {
  // --- Depo yönetimi ---
  'repo:list': () => store.getRepos(),
  'repo:add': ({ path }) => repos.addRepo(path),
  'repo:add-dialog': () => repos.addRepoViaDialog(),
  'repo:remove': ({ id }) => {
    if (activeRepoId === id) activeRepoId = null;
    repos.removeRepo(id);
    autopull.reconcileSchedules();
  },
  'repo:clone': ({ url, parentDir, name, taskId }) =>
    repos.cloneRepo(url, parentDir, name, taskId),
  'repo:pick-directory': () => repos.pickDirectory(),
  'repo:reveal': ({ repoId }) => repos.revealRepo(repoId),

  // --- Çalışma dizini ---
  'git:status': ({ repoId }) => {
    const repo = activateRepo(repoId);
    return status.getStatus(repo.id, repo.path);
  },
  'git:stage': ({ repoId, paths }) => {
    const repo = activateRepo(repoId);
    return status.stage(repo.id, repo.path, paths);
  },
  'git:unstage': ({ repoId, paths }) => {
    const repo = activateRepo(repoId);
    return status.unstage(repo.id, repo.path, paths);
  },
  'git:discard': ({ repoId, paths }) => {
    const repo = activateRepo(repoId);
    return status.discard(repo.id, repo.path, paths);
  },
  'git:diff': ({ repoId, path, staged }) => {
    const repo = activateRepo(repoId);
    return status.getFileDiff(repo.id, repo.path, path, staged);
  },
  'git:commit': ({ repoId, subject, body, amend }) => {
    const repo = activateRepo(repoId);
    return status.commit(repo.id, repo.path, subject, body, amend ?? false);
  },
  'git:last-commit-message': ({ repoId }) => {
    const repo = activateRepo(repoId);
    return status.getLastCommitMessage(repo.id, repo.path);
  },
  'git:stage-lines': ({ repoId, path, mode, selections }) => {
    const repo = activateRepo(repoId);
    return staging.stageLines(repo.id, repo.path, path, mode, selections);
  },
  'git:ignore-path': ({ repoId, path }) => {
    const repo = activateRepo(repoId);
    return repos.ignorePath(repo.path, path);
  },
  'git:open-external': ({ repoId, path }) => {
    const repo = activateRepo(repoId);
    return repos.openInSystem(repo.path, path);
  },

  // --- Dallar ---
  'git:branches': ({ repoId }) => {
    const repo = activateRepo(repoId);
    return branches.getBranches(repo.id, repo.path);
  },
  'git:branch-create': ({ repoId, name, from, checkout }) => {
    const repo = activateRepo(repoId);
    return branches.createBranch(repo.id, repo.path, name, from, checkout);
  },
  'git:checkout': ({ repoId, name }) => {
    const repo = activateRepo(repoId);
    return branches.checkout(repo.id, repo.path, name);
  },
  'git:branch-delete': ({ repoId, name, force }) => {
    const repo = activateRepo(repoId);
    return branches.deleteBranch(repo.id, repo.path, name, force);
  },
  'git:merge': ({ repoId, branch }) => {
    const repo = activateRepo(repoId);
    return merge.merge(repo.id, repo.path, branch);
  },
  'git:rebase': ({ repoId, branch }) => {
    const repo = activateRepo(repoId);
    return merge.rebase(repo.id, repo.path, branch);
  },
  'git:operation-abort': ({ repoId }) => {
    const repo = activateRepo(repoId);
    return merge.abortOperation(repo.id, repo.path);
  },
  'git:operation-continue': ({ repoId }) => {
    const repo = activateRepo(repoId);
    return merge.continueOperation(repo.id, repo.path);
  },

  // --- Geçmiş işlemleri ---
  'git:revert': ({ repoId, sha }) => {
    const repo = activateRepo(repoId);
    return rewrite.revert(repo.id, repo.path, sha);
  },
  'git:reset': ({ repoId, sha, mode }) => {
    const repo = activateRepo(repoId);
    return rewrite.reset(repo.id, repo.path, sha, mode);
  },

  // --- Etiketler ---
  'git:tag-list': ({ repoId }) => {
    const repo = activateRepo(repoId);
    return tags.listTags(repo.id, repo.path);
  },
  'git:tag-create': ({ repoId, name, sha, message }) => {
    const repo = activateRepo(repoId);
    return tags.createTag(repo.id, repo.path, name, sha, message);
  },
  'git:tag-delete': ({ repoId, name, remote }) => {
    const repo = activateRepo(repoId);
    return tags.deleteTag(repo.id, repo.path, name, remote);
  },
  'git:tag-push': ({ repoId, name }) => {
    const repo = activateRepo(repoId);
    return tags.pushTag(repo.id, repo.path, name);
  },

  // --- Stash ---
  'git:stash-list': ({ repoId }) => {
    const repo = activateRepo(repoId);
    return stash.listStashes(repo.id, repo.path);
  },
  'git:stash-create': ({ repoId, message, includeUntracked }) => {
    const repo = activateRepo(repoId);
    return stash.createStash(repo.id, repo.path, message, includeUntracked);
  },
  'git:stash-apply': ({ repoId, index, pop }) => {
    const repo = activateRepo(repoId);
    return stash.applyStash(repo.id, repo.path, index, pop);
  },
  'git:stash-drop': ({ repoId, index }) => {
    const repo = activateRepo(repoId);
    return stash.dropStash(repo.id, repo.path, index);
  },

  // --- Çakışma çözümü ---
  'git:conflict-read': ({ repoId, path }) => {
    const repo = activateRepo(repoId);
    return conflict.readConflict(repo.path, path);
  },
  'git:conflict-resolve': ({ repoId, path, choices }) => {
    const repo = activateRepo(repoId);
    return conflict.resolveConflict(repo.id, repo.path, path, choices);
  },

  // --- Geçmiş ---
  'git:log': ({ repoId, skip, limit, ref, filter }) => {
    const repo = activateRepo(repoId);
    return history.getLog(repo.id, repo.path, skip, limit, ref, filter);
  },
  'git:commit-detail': ({ repoId, sha }) => {
    const repo = activateRepo(repoId);
    return history.getCommitDetail(repo.id, repo.path, sha);
  },
  'git:commit-file-diff': ({ repoId, sha, path }) => {
    const repo = activateRepo(repoId);
    return history.getCommitFileDiff(repo.id, repo.path, sha, path);
  },

  // --- Uzak sunucular ---
  'git:remotes': ({ repoId }) => {
    const repo = activateRepo(repoId);
    return remote.getRemotes(repo.id, repo.path);
  },
  'git:fetch': ({ repoId }) => {
    const repo = activateRepo(repoId);
    return remote.fetch(repo.id, repo.path);
  },
  'git:pull': ({ repoId, fastForwardOnly }) => {
    const repo = activateRepo(repoId);
    // Elle pull'da kirli dizin engel değil: kullanıcı ne yaptığını biliyor,
    // git zaten üzerine yazacaksa kendisi durduruyor.
    return remote.pull(repo.id, repo.path, {
      fastForwardOnly: fastForwardOnly ?? false,
      requireClean: false,
    });
  },
  'git:push': ({ repoId, setUpstream, forceWithLease }) => {
    const repo = activateRepo(repoId);
    return remote.push(repo.id, repo.path, setUpstream ?? false, forceWithLease ?? false);
  },
  'git:remote-add': ({ repoId, name, url }) => {
    const repo = activateRepo(repoId);
    return remote.addRemote(repo.id, repo.path, name, url);
  },
  'git:remote-remove': ({ repoId, name }) => {
    const repo = activateRepo(repoId);
    return remote.removeRemote(repo.id, repo.path, name);
  },
  'git:remote-set-url': ({ repoId, name, url }) => {
    const repo = activateRepo(repoId);
    return remote.setRemoteUrl(repo.id, repo.path, name, url);
  },

  // --- Ayarlar ---
  'settings:get': () => store.getSettings(),
  'settings:set': (patch) => {
    const next = store.updateSettings(patch);
    autopull.reconcileSchedules();
    return next;
  },
  'settings:repo-get': ({ repoId }) => store.getRepoSettings(repoId),
  'settings:repo-set': ({ repoId, ...patch }) => {
    const next = store.updateRepoSettings(repoId, patch);
    autopull.reconcileSchedules();
    return next;
  },

  // --- Otomatik pull ---
  'autopull:run-now': ({ repoId }) => {
    repos.requireRepo(repoId);
    return autopull.pullNow(repoId);
  },

  // --- SSH ---
  'ssh:environment': () => ssh.getEnvironment(),
  'ssh:generate-key': ({ comment, fileName }) => ssh.generateKey(comment, fileName),
  'ssh:test-github': () => ssh.testGithub(),
  'ssh:copy-public-key': ({ publicKeyPath }) => ssh.copyPublicKey(publicKeyPath),
};

export function registerIpcHandlers(): void {
  for (const channel of Object.keys(handlers) as IpcChannel[]) {
    ipcMain.handle(channel, async (_event, rawInput: unknown) => {
      try {
        const schema = inputSchemas[channel];
        const input = schema.parse(rawInput);
        const handler = handlers[channel] as (value: unknown) => Promise<unknown>;
        return await handler(input);
      } catch (error) {
        // Hata fırlatmak yerine zarflayıp döndürüyoruz: Electron aksi hâlde
        // mesajın başına "Error invoking remote method" ekleyip okunmaz hâle getiriyor.
        return toIpcError(error);
      }
    });
  }
}
