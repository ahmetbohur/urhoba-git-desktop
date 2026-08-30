import { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useT } from '../../i18n';
import { errorMessage, invoke } from '../../lib/ipc';
import { keys, useAiStatus, useMutation, useQueryClient } from '../../lib/queries';
import { useUi } from '../../stores/ui';
import { Badge, Button, SectionLabel, Spinner } from '../primitives';
import { DialogShell } from './DialogShell';
import type { GroupSuggestion } from '@shared/types';

/**
 * AI ile gruplama önerisi.
 *
 * Buraya yalnızca depo adları gidiyor, kod gitmiyor — bu yüzden commit mesajı
 * önerisindeki depo bazlı izin burada aranmıyor ve kullanıcıya da bu açıkça
 * söyleniyor. Öneriler onaylanmadan uygulanmıyor; her grup ayrı ayrı kabul
 * edilebiliyor.
 */
export function AiGroupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const { data: status } = useAiStatus();
  const [suggestions, setSuggestions] = useState<GroupSuggestion[] | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const client = useQueryClient();
  const toast = useUi((s) => s.toast);

  const ask = useMutation({
    mutationFn: () => invoke('ai:suggest-groups', undefined),
    onSuccess: (result) => {
      setSuggestions(result);
      setAccepted(new Set(result.map((suggestion) => suggestion.group)));
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Öneri alınamadı'), description: errorMessage(error) }),
  });

  const apply = useMutation({
    mutationFn: () =>
      invoke('ai:apply-groups', {
        assignments: (suggestions ?? [])
          .filter((suggestion) => accepted.has(suggestion.group))
          .map((suggestion) => ({ group: suggestion.group, repoIds: suggestion.repoIds })),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.repos });
      void client.invalidateQueries({ queryKey: ['collapsed-groups'] });
      toast({ kind: 'success', title: t('{count} grup uygulandı', { count: accepted.size }) });
      onOpenChange(false);
      setSuggestions(null);
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('Gruplar uygulanamadı'), description: errorMessage(error) }),
  });

  const toggle = (group: string) =>
    setAccepted((previous) => {
      const next = new Set(previous);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t('AI ile grupla')}
      description={t('Yalnızca depo adları gönderilir; kod gönderilmez.')}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('Vazgeç')}
          </Button>
          {suggestions && suggestions.length > 0 && (
            <Button
              variant="primary"
              loading={apply.isPending}
              disabled={accepted.size === 0}
              onClick={() => apply.mutate()}
            >
              {t('{count} grubu uygula', { count: accepted.size })}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {!status?.enabled ? (
          <p className="rounded-md bg-warn-tint px-2.5 py-2 text-[12px] text-ink">
            {t('AI yardımı kapalı. Ayarlardan açman gerekiyor.')}
          </p>
        ) : !suggestions ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Sparkles className="size-6 text-accent" />
            <p className="max-w-sm text-[13px] text-ink-2">
              {t('Depo adlarına bakıp anlamlı kümeler önerir. Klasör yapısının yakalayamadığı benzerlikleri bulur.')}
            </p>
            {status.isLocal && <Badge tone="ok">{t('yerel model — veri dışarı çıkmıyor')}</Badge>}
            <Button variant="primary" loading={ask.isPending} onClick={() => ask.mutate()}>
              <Sparkles className="size-3.5" />
              {t('Öneri iste')}
            </Button>
          </div>
        ) : ask.isPending ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : suggestions.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-ink-2">
            {t('Model anlamlı bir grup öneremedi.')}
          </p>
        ) : (
          <>
            <SectionLabel>{t('{count} grup önerildi', { count: suggestions.length })}</SectionLabel>
            <ul className="flex flex-col gap-1.5">
              {suggestions.map((suggestion) => {
                const on = accepted.has(suggestion.group);
                return (
                  <li key={suggestion.group}>
                    <button
                      type="button"
                      onClick={() => toggle(suggestion.group)}
                      className={cn(
                        'flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left',
                        on ? 'border-accent bg-accent-tint' : 'border-line bg-surface hover:bg-surface-2',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border',
                          on ? 'border-accent bg-accent text-white' : 'border-line',
                        )}
                      >
                        {on && <Check className="size-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium text-ink">
                          {suggestion.group}
                        </span>
                        <span className="block truncate font-mono text-[11px] text-ink-3">
                          {suggestion.repoNames.join(', ')}
                        </span>
                      </span>
                      <Badge tone="neutral">{suggestion.repoIds.length}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </DialogShell>
  );
}
