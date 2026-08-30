import { useState } from 'react';
import { Tag as TagIcon, Trash2, Upload } from 'lucide-react';
import { useT } from '../../i18n';
import { errorMessage, invoke } from '../../lib/ipc';
import { keys, useInvalidateRepo, useMutation, useQueryClient, useTags } from '../../lib/queries';
import { relativeTime } from '../../lib/format';
import { useUi } from '../../stores/ui';
import { Badge, Button, SectionLabel } from '../primitives';
import { DialogShell, Field, TextInput } from './DialogShell';
import type { Commit } from '@shared/types';

/**
 * Etiket oluşturma ve yönetimi.
 *
 * Mesaj alanı doluysa açıklamalı (annotated), boşsa hafif (lightweight) etiket
 * üretiliyor — git'in kendi davranışı bu ve sürüm etiketlerinde açıklamalı olan
 * tercih edilir. Ayrımı kullanıcıya alan altındaki ipucuyla anlatıyoruz, ayrı
 * bir seçenek kutusu koymaya gerek yok.
 */
export function TagDialog({
  repoId,
  commit,
  open,
  onOpenChange,
}: {
  repoId: string;
  commit: Commit | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const { data: tags } = useTags(repoId);
  const client = useQueryClient();
  const invalidate = useInvalidateRepo();
  const toast = useUi((s) => s.toast);

  const refresh = () => {
    invalidate(repoId);
    void client.invalidateQueries({ queryKey: keys.tags(repoId) });
  };

  const create = useMutation({
    mutationFn: () =>
      invoke('git:tag-create', {
        repoId,
        name: name.trim(),
        sha: commit?.sha,
        message: message.trim() || undefined,
      }),
    onSuccess: () => {
      refresh();
      toast({ kind: 'success', title: t('{name} etiketi oluşturuldu', { name: name.trim() }) });
      setName('');
      setMessage('');
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Etiket oluşturulamadı'), description: errorMessage(error) }),
  });

  const remove = useMutation({
    mutationFn: (tagName: string) =>
      invoke('git:tag-delete', { repoId, name: tagName, remote: false }),
    onSuccess: () => {
      refresh();
      toast({ kind: 'info', title: t('Etiket silindi') });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Etiket silinemedi'), description: errorMessage(error) }),
  });

  const pushTag = useMutation({
    mutationFn: (tagName: string) => invoke('git:tag-push', { repoId, name: tagName }),
    onSuccess: (_result, tagName) =>
      toast({ kind: 'success', title: t('{name} uzak sunucuya gönderildi', { name: tagName }) }),
    onError: (error) =>
      toast({ kind: 'error', title: t('Etiket gönderilemedi'), description: errorMessage(error) }),
  });

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t('Etiketler')}
      description={
        commit
          ? t('Yeni etiket {sha} commit’ine takılacak.', { sha: commit.shortSha })
          : t('Yeni etiket geçerli HEAD’e takılacak.')
      }
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('Kapat')}
          </Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={name.trim().length === 0}
            onClick={() => create.mutate()}
          >
            <TagIcon className="size-3.5" />
            {t('Etiketle')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {commit && (
          <div className="rounded-lg border border-line bg-ground p-2.5">
            <p className="truncate text-[13px] text-ink">{commit.subject}</p>
            <p className="font-mono text-[11px] text-ink-3">{commit.shortSha}</p>
          </div>
        )}

        <Field label={t('Etiket adı')} hint={t('Örnek: v1.0.0')}>
          <TextInput value={name} onChange={setName} placeholder="v1.0.0" mono autoFocus />
        </Field>

        <Field
          label={t('Mesaj')}
          hint={t('Doldurursan açıklamalı etiket oluşur — sürüm notu için doğru olan bu. Boş bırakırsan hafif etiket olur.')}
        >
          <TextInput value={message} onChange={setMessage} placeholder={t('Sürüm notu')} />
        </Field>

        <div className="flex flex-col gap-2 border-t border-line-soft pt-3">
          <SectionLabel>{t('Mevcut etiketler ({count})', { count: tags?.length ?? 0 })}</SectionLabel>
          {(tags?.length ?? 0) === 0 ? (
            <p className="py-4 text-center text-[12px] text-ink-3">{t('Bu depoda etiket yok.')}</p>
          ) : (
            <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
              {tags?.map((tag) => (
                <li
                  key={tag.name}
                  className="flex items-center gap-2 rounded-md border border-line bg-ground p-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-mono text-[12px] text-ink">{tag.name}</span>
                      {tag.isAnnotated ? (
                        <Badge tone="accent">{t('açıklamalı')}</Badge>
                      ) : (
                        <Badge tone="neutral">{t('hafif')}</Badge>
                      )}
                    </span>
                    <span className="block truncate text-[11px] text-ink-3">
                      {tag.message || t('mesaj yok')} · {relativeTime(tag.taggedAt)}
                    </span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => pushTag.mutate(tag.name)}>
                    <Upload className="size-3.5" />
                    {t('Gönder')}
                  </Button>
                  <button
                    type="button"
                    aria-label={t('{name} etiketini sil', { name: tag.name })}
                    onClick={() => remove.mutate(tag.name)}
                    className="rounded p-1 text-ink-3 hover:bg-crit-tint hover:text-crit"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </DialogShell>
  );
}
