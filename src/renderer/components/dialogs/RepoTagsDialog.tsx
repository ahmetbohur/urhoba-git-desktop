import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useT } from '../../i18n';
import { errorMessage, invoke } from '../../lib/ipc';
import { keys, useAllTags, useMutation, useQueryClient } from '../../lib/queries';
import { useUi } from '../../stores/ui';
import { Button, SectionLabel } from '../primitives';
import { DialogShell, Field, TextInput } from './DialogShell';
import type { Repo } from '@shared/types';

/**
 * Depo etiketleri.
 *
 * Etiketler gruplamanın yerine değil üstüne geliyor: bir depo tek bir gruba ait
 * ama birden çok etiket taşıyabiliyor. "Nerede duruyor" ile "hangi durumda"
 * farklı sorular ve ikisini tek bir alanla cevaplamaya çalışmak ikisini de
 * bozuyor.
 */

const SUGGESTIONS = ['aktif', 'arşiv', 'bekliyor', 'müşteri', 'kişisel'];

export function RepoTagsDialog({
  repo,
  open,
  onOpenChange,
}: {
  repo: Repo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  /*
   * Başlangıç değeri doğrudan depodan geliyor ve depo değişince bileşen `key`
   * ile yeniden kuruluyor; böylece durumu effect içinde sıfırlamak gerekmiyor.
   */
  const [tags, setTags] = useState<string[]>(repo?.tags ?? []);
  const [draft, setDraft] = useState('');
  const { data: allTags } = useAllTags();
  const client = useQueryClient();
  const toast = useUi((s) => s.toast);

  const save = useMutation({
    mutationFn: (next: string[]) => invoke('repo:update', { id: repo?.id ?? '', tags: next }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.repos });
      void client.invalidateQueries({ queryKey: ['tags'] });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Etiketler kaydedilemedi'), description: errorMessage(error) }),
  });

  const apply = (next: string[]) => {
    setTags(next);
    save.mutate(next);
  };

  const add = (tag: string) => {
    const clean = tag.trim();
    if (clean.length === 0 || tags.includes(clean)) return;
    apply([...tags, clean]);
    setDraft('');
  };

  // Zaten kullanılan etiketler ile hazır öneriler; ikisi de tek tıkla ekleniyor.
  const available = [...new Set([...(allTags ?? []), ...SUGGESTIONS])].filter(
    (tag) => !tags.includes(tag),
  );

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t('Etiketler')}
      description={repo?.name}
      footer={
        <Button variant="primary" onClick={() => onOpenChange(false)}>
          {t('Kapat')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <SectionLabel>{t('Bu depoda')}</SectionLabel>
          {tags.length === 0 ? (
            <p className="text-[12px] text-ink-3">{t('Henüz etiket yok.')}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 rounded-md bg-accent-tint px-2 py-1 text-[12px] text-accent-ink"
                >
                  {tag}
                  <button
                    type="button"
                    aria-label={t('{tag} etiketini kaldır', { tag })}
                    onClick={() => apply(tags.filter((entry) => entry !== tag))}
                    className="rounded hover:bg-accent/20"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <Field label={t('Yeni etiket')}>
          <div className="flex gap-2">
            <TextInput value={draft} onChange={setDraft} placeholder={t('örn. aktif')} />
            <Button variant="secondary" disabled={draft.trim().length === 0} onClick={() => add(draft)}>
              <Plus className="size-3.5" />
              {t('Ekle')}
            </Button>
          </div>
        </Field>

        {available.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-line-soft pt-3">
            <SectionLabel>{t('Hızlı ekle')}</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {available.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => add(tag)}
                  className={cn(
                    'rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink-2',
                    'hover:bg-surface-2 hover:text-ink',
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </DialogShell>
  );
}
