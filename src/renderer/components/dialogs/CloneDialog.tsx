import { useState } from 'react';
import { CloudDownload, FolderOpen, Lock, Search } from 'lucide-react';
import { cn } from '../../lib/cn';
import { relativeTime } from '../../lib/format';
import { errorMessage, invoke } from '../../lib/ipc';
import {
  keys,
  useGithubRepos,
  useGithubStatus,
  useMutation,
  useQueryClient,
} from '../../lib/queries';
import { useUi } from '../../stores/ui';
import { Badge, Button, SectionLabel, Spinner } from '../primitives';
import { DialogShell, Field, TextInput } from './DialogShell';

/** URL'den klasör adı türetir; kullanıcı isterse üzerine yazabilir. */
function suggestName(url: string): string {
  const trimmed = url.trim().replace(/\.git$/, '').replace(/\/$/, '');
  if (trimmed.length === 0) return '';
  return trimmed.split(/[/:]/).pop() ?? '';
}

export function CloneDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [url, setUrl] = useState('');
  const [parentDir, setParentDir] = useState('');
  const [name, setName] = useState('');
  const [progress, setProgress] = useState<string | null>(null);
  const [repoSearch, setRepoSearch] = useState('');

  const { data: auth } = useGithubStatus({ enabled: open });
  const githubConnected = auth?.authenticated ?? false;
  const { data: githubRepos, isLoading: reposLoading } = useGithubRepos(
    repoSearch,
    open && githubConnected,
  );

  const client = useQueryClient();
  const setActiveRepo = useUi((s) => s.setActiveRepo);
  const toast = useUi((s) => s.toast);

  const reset = () => {
    setUrl('');
    setParentDir('');
    setName('');
    setProgress(null);
  };

  const clone = useMutation({
    mutationFn: async () => {
      const taskId = crypto.randomUUID();
      // İlerleme olayları ana süreçten `clone:progress` ile geliyor; App'teki
      // dinleyici bunları toplayıp buraya durum metni olarak yansıtıyor.
      const unsubscribe = window.urhoba.onEvent((event) => {
        if (event.type === 'clone:progress' && event.progress.taskId === taskId) {
          setProgress(`${event.progress.phase} — %${Math.round(event.progress.percent)}`);
        }
      });
      try {
        return await invoke('repo:clone', {
          url: url.trim(),
          parentDir,
          name: name.trim() || undefined,
          taskId,
        });
      } finally {
        unsubscribe();
      }
    },
    onSuccess: (repo) => {
      void client.invalidateQueries({ queryKey: keys.repos });
      setActiveRepo(repo.id);
      toast({ kind: 'success', title: `${repo.name} klonlandı` });
      onOpenChange(false);
      reset();
    },
    onError: (error) => {
      setProgress(null);
      toast({ kind: 'error', title: 'Klonlama başarısız', description: errorMessage(error) });
    },
  });

  const pickDirectory = async () => {
    const chosen = await invoke('repo:pick-directory', undefined);
    if (chosen) setParentDir(chosen);
  };

  const canSubmit = url.trim().length > 0 && parentDir.length > 0 && !clone.isPending;

  return (
    <DialogShell
      open={open}
      onOpenChange={(next) => {
        if (clone.isPending) return;
        onOpenChange(next);
        if (!next) reset();
      }}
      title="Depo klonla"
      description="SSH adresi kullanman önerilir; HTTPS'te her işlemde kimlik doğrulaması gerekir."
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={clone.isPending}>
            Vazgeç
          </Button>
          <Button
            variant="primary"
            loading={clone.isPending}
            disabled={!canSubmit}
            onClick={() => clone.mutate()}
          >
            Klonla
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {githubConnected && (
          <div className="flex flex-col gap-2 rounded-lg border border-line bg-ground p-2.5">
            <div className="flex items-center gap-2">
              <CloudDownload className="size-3.5 text-ink-2" />
              <SectionLabel>GitHub depolarım</SectionLabel>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-ink-3" />
              <input
                value={repoSearch}
                onChange={(event) => setRepoSearch(event.target.value)}
                placeholder="Depo ara"
                aria-label="GitHub depolarında ara"
                className="selectable h-7 w-full rounded-md border border-line bg-surface pr-2 pl-7 text-[12px] text-ink placeholder:text-ink-3 focus-visible:border-accent"
              />
            </div>
            {reposLoading ? (
              <div className="flex justify-center py-4">
                <Spinner />
              </div>
            ) : (githubRepos?.length ?? 0) === 0 ? (
              <p className="py-3 text-center text-[11px] text-ink-3">Eşleşen depo yok.</p>
            ) : (
              <ul className="flex max-h-44 flex-col gap-0.5 overflow-y-auto">
                {githubRepos?.slice(0, 60).map((repo) => (
                  <li key={repo.fullName}>
                    <button
                      type="button"
                      onClick={() => {
                        // SSH adresini seçiyoruz: kullanıcının kurulu anahtarıyla
                        // her işlemde parola sorulmadan çalışır.
                        setUrl(repo.sshUrl);
                        setName(repo.name);
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded px-2 py-1 text-left',
                        url === repo.sshUrl ? 'bg-accent-tint' : 'hover:bg-surface-2',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              'truncate text-[12px]',
                              url === repo.sshUrl ? 'text-accent-ink' : 'text-ink',
                            )}
                          >
                            {repo.fullName}
                          </span>
                          {repo.isPrivate && <Lock className="size-2.5 shrink-0 text-ink-3" />}
                          {repo.isFork && <Badge tone="neutral">fork</Badge>}
                        </span>
                        <span className="block truncate text-[10px] text-ink-3">
                          {repo.description || 'açıklama yok'} · {relativeTime(repo.updatedAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <Field label="Depo adresi" hint="Örnek: git@github.com:kullanici/depo.git">
          <TextInput
            value={url}
            autoFocus
            mono
            placeholder="git@github.com:kullanici/depo.git"
            onChange={(next) => {
              setUrl(next);
              if (name.length === 0 || name === suggestName(url)) setName(suggestName(next));
            }}
          />
        </Field>

        <Field label="Hedef konum">
          <div className="flex gap-2">
            <TextInput value={parentDir} onChange={setParentDir} placeholder="Klasör seç" />
            <Button variant="secondary" onClick={() => void pickDirectory()}>
              <FolderOpen className="size-3.5" />
              Seç
            </Button>
          </div>
        </Field>

        <Field label="Klasör adı" hint="Boş bırakırsan adres son parçasından türetilir.">
          <TextInput value={name} onChange={setName} placeholder={suggestName(url)} />
        </Field>

        {progress && (
          <p className="rounded-md bg-surface-2 px-2.5 py-2 font-mono text-[11px] text-ink-2">
            {progress}
          </p>
        )}
      </div>
    </DialogShell>
  );
}
