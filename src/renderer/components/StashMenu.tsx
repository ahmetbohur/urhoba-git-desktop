import { useState } from 'react';
import { Popover } from 'radix-ui';
import { Archive, Trash2 } from 'lucide-react';
import { useT } from '../i18n';
import { errorMessage, invoke } from '../lib/ipc';
import { useInvalidateRepo, useMutation, useStashes } from '../lib/queries';
import { relativeTime } from '../lib/format';
import { useUi } from '../stores/ui';
import { Badge, Button, SectionLabel } from './primitives';

/**
 * Stash yönetimi.
 *
 * `apply` ile `pop` arasındaki farkı düğme adıyla değil açıklamayla anlatıyoruz:
 * "Uygula" kaydı listede bırakır, "Uygula ve sil" kaldırır. Git terimlerini
 * bilmeyen biri de doğru olanı seçebilsin.
 */
export function StashMenu({ repoId, hasChanges }: { repoId: string; hasChanges: boolean }) {
  const t = useT();
  const { data: stashes } = useStashes(repoId);
  const invalidate = useInvalidateRepo();
  const toast = useUi((s) => s.toast);
  const [message, setMessage] = useState('');
  const [includeUntracked, setIncludeUntracked] = useState(true);

  const create = useMutation({
    mutationFn: () => invoke('git:stash-create', { repoId, message, includeUntracked }),
    onSuccess: () => {
      invalidate(repoId);
      setMessage('');
      toast({ kind: 'success', title: t('Değişiklikler saklandı') });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Saklanamadı'), description: errorMessage(error) }),
  });

  const apply = useMutation({
    mutationFn: ({ index, pop }: { index: number; pop: boolean }) =>
      invoke('git:stash-apply', { repoId, index, pop }),
    onSuccess: () => {
      invalidate(repoId);
      toast({ kind: 'success', title: t('Stash uygulandı') });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Uygulanamadı'), description: errorMessage(error) }),
  });

  const drop = useMutation({
    mutationFn: (index: number) => invoke('git:stash-drop', { repoId, index }),
    onSuccess: () => {
      invalidate(repoId);
      toast({ kind: 'info', title: t('Stash silindi') });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Silinemedi'), description: errorMessage(error) }),
  });

  const count = stashes?.length ?? 0;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          title={t('Stash')}
          aria-label={t('Stash')}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-[12px] font-medium whitespace-nowrap text-ink-2 hover:bg-surface-2"
        >
          <Archive className="size-3.5" />
          <span className="hidden lg:inline">{t('Stash')}</span>
          {count > 0 && <Badge tone="accent">{count}</Badge>}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 flex max-h-[28rem] w-96 flex-col gap-3 rounded-lg border border-line bg-surface p-3 shadow-xl"
        >
          <div>
            <SectionLabel>{t('Değişiklikleri sakla')}</SectionLabel>
            <p className="mt-1 text-[11px] text-ink-2">
              {t('Çalışma dizinini temizler, değişiklikleri kenara alır. Dal değiştirmeden önce işine yarar.')}
            </p>
          </div>

          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t('Açıklama (isteğe bağlı)')}
            aria-label={t('Stash açıklaması')}
            className="selectable h-8 w-full rounded-md border border-line bg-ground px-2 text-[12px] text-ink placeholder:text-ink-3 focus-visible:border-accent"
          />

          <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-ink-2">
            <input
              type="checkbox"
              checked={includeUntracked}
              onChange={(event) => setIncludeUntracked(event.target.checked)}
              className="size-3.5 accent-[var(--accent)]"
            />
            {t('Takip edilmeyen dosyalar da dahil olsun')}
          </label>

          <Button
            variant="primary"
            size="sm"
            disabled={!hasChanges}
            loading={create.isPending}
            onClick={() => create.mutate()}
          >
            {hasChanges ? t('Sakla') : t('Saklanacak değişiklik yok')}
          </Button>

          <div className="min-h-0 flex-1 overflow-y-auto border-t border-line-soft pt-2">
            <SectionLabel className="mb-1.5 block">{t('Saklananlar ({count})', { count })}</SectionLabel>
            {count === 0 ? (
              <p className="py-4 text-center text-[12px] text-ink-3">{t('Henüz stash yok.')}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {stashes?.map((stash) => (
                  <li key={stash.sha} className="rounded-md border border-line bg-ground p-2">
                    <p className="truncate text-[12px] font-medium text-ink">{stash.message}</p>
                    <p className="text-[11px] text-ink-3">
                      {stash.branch && `${stash.branch} · `}
                      {relativeTime(stash.createdAt)}
                    </p>
                    <div className="mt-1.5 flex gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => apply.mutate({ index: stash.index, pop: false })}
                      >
                        {t('Uygula')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => apply.mutate({ index: stash.index, pop: true })}
                      >
                        {t('Uygula ve sil')}
                      </Button>
                      <button
                        type="button"
                        aria-label={t('Stash’i sil')}
                        onClick={() => drop.mutate(stash.index)}
                        className="ml-auto rounded p-1 text-ink-3 hover:bg-crit-tint hover:text-crit"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
