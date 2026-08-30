import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useT } from '../i18n';
import { errorMessage, invoke } from '../lib/ipc';
import { keys, useMutation, useQueryClient, useRemotes } from '../lib/queries';
import { useUi } from '../stores/ui';
import { Button, SectionLabel } from './primitives';
import { TextInput } from './dialogs/DialogShell';

/**
 * Uzak sunucu yönetimi.
 *
 * Adres düzenlemeyi satır içinde yapıyoruz: bir remote'un URL'si genelde tek
 * seferlik bir düzeltmedir (HTTPS'ten SSH'a geçmek gibi), ayrı bir diyalog
 * açmaya değmez.
 */
export function RemoteSettings({ repoId }: { repoId: string }) {
  const t = useT();
  const { data: remotes } = useRemotes(repoId);
  const client = useQueryClient();
  const toast = useUi((s) => s.toast);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('origin');
  const [newUrl, setNewUrl] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState('');

  const refresh = () => void client.invalidateQueries({ queryKey: keys.remotes(repoId) });

  const add = useMutation({
    mutationFn: () => invoke('git:remote-add', { repoId, name: newName.trim(), url: newUrl.trim() }),
    onSuccess: () => {
      refresh();
      setAdding(false);
      setNewName('origin');
      setNewUrl('');
      toast({ kind: 'success', title: t('Uzak sunucu eklendi') });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Eklenemedi'), description: errorMessage(error) }),
  });

  const setUrl = useMutation({
    mutationFn: ({ name, url }: { name: string; url: string }) =>
      invoke('git:remote-set-url', { repoId, name, url }),
    onSuccess: () => {
      refresh();
      setEditing(null);
      toast({ kind: 'success', title: t('Adres güncellendi') });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Güncellenemedi'), description: errorMessage(error) }),
  });

  const remove = useMutation({
    mutationFn: (name: string) => invoke('git:remote-remove', { repoId, name }),
    onSuccess: () => {
      refresh();
      toast({ kind: 'info', title: t('Uzak sunucu kaldırıldı') });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Kaldırılamadı'), description: errorMessage(error) }),
  });

  return (
    <section>
      <div className="flex items-center justify-between">
        <SectionLabel>{t('Uzak sunucular')}</SectionLabel>
        <Button size="sm" variant="ghost" onClick={() => setAdding((value) => !value)}>
          <Plus className="size-3.5" />
          {t('Ekle')}
        </Button>
      </div>

      {adding && (
        <div className="mt-2 flex flex-col gap-2 rounded-lg border border-accent bg-accent-tint p-2.5">
          <div className="flex gap-2">
            <div className="w-28 shrink-0">
              <TextInput value={newName} onChange={setNewName} placeholder="origin" mono />
            </div>
            <TextInput
              value={newUrl}
              onChange={setNewUrl}
              placeholder="git@github.com:kullanici/depo.git"
              mono
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              {t('Vazgeç')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              loading={add.isPending}
              disabled={newName.trim().length === 0 || newUrl.trim().length === 0}
              onClick={() => add.mutate()}
            >
              {t('Ekle')}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-col gap-1.5">
        {(remotes?.length ?? 0) === 0 ? (
          <p className="rounded-lg border border-dashed border-line py-6 text-center text-[12px] text-ink-3">
            {t('Tanımlı uzak sunucu yok. Push edebilmek için bir tane eklemen gerekiyor.')}
          </p>
        ) : (
          remotes?.map((remote) => (
            <div
              key={remote.name}
              className="flex items-center gap-2 rounded-md border border-line bg-ground p-2"
            >
              <span className="w-24 shrink-0 truncate font-mono text-[12px] font-medium text-ink">
                {remote.name}
              </span>
              {editing === remote.name ? (
                <>
                  <TextInput value={editUrl} onChange={setEditUrl} mono />
                  <button
                    type="button"
                    aria-label={t('Kaydet')}
                    onClick={() => setUrl.mutate({ name: remote.name, url: editUrl.trim() })}
                    className="rounded p-1 text-ok hover:bg-ok-tint"
                  >
                    <Check className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={t('Vazgeç')}
                    onClick={() => setEditing(null)}
                    className="rounded p-1 text-ink-3 hover:bg-surface-2"
                  >
                    <X className="size-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <span className="selectable min-w-0 flex-1 truncate font-mono text-[11px] text-ink-2">
                    {remote.fetchUrl}
                  </span>
                  <button
                    type="button"
                    aria-label={t('{name} adresini düzenle', { name: remote.name })}
                    onClick={() => {
                      setEditing(remote.name);
                      setEditUrl(remote.fetchUrl);
                    }}
                    className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={t('{name} sunucusunu kaldır', { name: remote.name })}
                    onClick={() => remove.mutate(remote.name)}
                    className="rounded p-1 text-ink-3 hover:bg-crit-tint hover:text-crit"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
