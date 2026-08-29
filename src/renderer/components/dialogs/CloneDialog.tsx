import { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { errorMessage, invoke } from '../../lib/ipc';
import { keys, useMutation, useQueryClient } from '../../lib/queries';
import { useUi } from '../../stores/ui';
import { Button } from '../primitives';
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
