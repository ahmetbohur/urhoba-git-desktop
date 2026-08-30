import { useMemo } from 'react';
import { useT } from '../i18n';
import { errorMessage, invoke, platform } from './ipc';
import { keys, useBranches, useQueryClient, useRepos, useStatus } from './queries';
import { useUi } from '../stores/ui';
import type { Repo } from '@shared/types';

/**
 * Komut kayıt defteri.
 *
 * Komut paleti ile klavye kısayolları aynı listeden besleniyor: bir eylem
 * eklendiğinde ikisi de kendiliğinden öğreniyor ve paletteki kısayol etiketi
 * gerçekten çalışan tuşu gösteriyor. İki ayrı liste tutulsaydı bunlar er geç
 * birbirinden ayrılırdı.
 */

export interface Command {
  id: string;
  label: string;
  group: string;
  /** "mod" tuşu macOS'ta Cmd, diğerlerinde Ctrl olarak gösterilir ve dinlenir. */
  shortcut?: string;
  hint?: string;
  disabled?: boolean;
  run: () => void | Promise<void>;
}

const isMac = platform === 'darwin';

/** "mod+shift+p" → "⌘⇧P" ya da "Ctrl+Shift+P" */
export function formatShortcut(shortcut: string): string {
  const parts = shortcut.split('+');
  return parts
    .map((part) => {
      if (part === 'mod') return isMac ? '⌘' : 'Ctrl';
      if (part === 'shift') return isMac ? '⇧' : 'Shift';
      if (part === 'alt') return isMac ? '⌥' : 'Alt';
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join(isMac ? '' : '+');
}

/** Klavye olayının verilen kısayolla eşleşip eşleşmediği. */
export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.split('+');
  const key = parts[parts.length - 1];
  const needsMod = parts.includes('mod');
  const needsShift = parts.includes('shift');
  const needsAlt = parts.includes('alt');

  const modPressed = isMac ? event.metaKey : event.ctrlKey;
  if (needsMod !== modPressed) return false;
  if (needsShift !== event.shiftKey) return false;
  if (needsAlt !== event.altKey) return false;
  // Türkçe klavyede bile rakam ve harf tuşlarının `key` değeri Latin kalıyor.
  return event.key.toLowerCase() === key.toLowerCase();
}

export function useCommands(activeRepo: Repo | null): Command[] {
  const client = useQueryClient();
  const { data: repos } = useRepos();
  const { data: branches } = useBranches(activeRepo?.id ?? null);
  const { data: status } = useStatus(activeRepo?.id ?? null);

  const t = useT();
  const setActiveRepo = useUi((s) => s.setActiveRepo);
  const setTab = useUi((s) => s.setTab);
  const toggleCommandLog = useUi((s) => s.toggleCommandLog);
  const toast = useUi((s) => s.toast);

  return useMemo(() => {
    const repoId = activeRepo?.id ?? null;
    const invalidate = () => {
      if (repoId) void client.invalidateQueries({ queryKey: ['repo', repoId] });
    };

    /** Uzak sunucu işlemlerini tek yerden sarmalıyoruz: aynı hata ve bildirim davranışı. */
    const remoteAction = (
      title: string,
      action: () => Promise<{ message?: string; ok?: boolean }>,
    ) => async () => {
      if (!repoId) return;
      try {
        const result = await action();
        invalidate();
        toast({
          kind: result.ok === false ? 'error' : 'success',
          title: t(title),
          description: result.message,
        });
      } catch (error) {
        toast({
          kind: 'error',
          title: t('{action} başarısız', { action: t(title) }),
          description: errorMessage(error),
        });
      }
    };

    const commands: Command[] = [
      {
        id: 'view.changes',
        label: 'Değişiklikler sekmesine geç',
        group: 'Görünüm',
        shortcut: 'mod+1',
        run: () => setTab('changes'),
      },
      {
        id: 'view.history',
        label: 'Geçmiş sekmesine geç',
        group: 'Görünüm',
        shortcut: 'mod+2',
        run: () => setTab('history'),
      },
      {
        id: 'view.pulls',
        label: 'Pull request’ler sekmesine geç',
        group: 'Görünüm',
        shortcut: 'mod+3',
        run: () => setTab('pulls'),
      },
      {
        id: 'view.commandlog',
        label: 'Git komut günlüğünü aç/kapat',
        group: 'Görünüm',
        shortcut: 'mod+shift+g',
        run: toggleCommandLog,
      },
    ];

    if (repoId) {
      commands.push(
        {
          id: 'remote.fetch',
          label: 'Fetch',
          group: 'Uzak sunucu',
          shortcut: 'mod+shift+f',
          hint: 'Uzak dalların durumunu tazeler',
          run: remoteAction('Fetch tamamlandı', async () => {
            const result = await invoke('git:fetch', { repoId });
            return {
              message:
                result.behind > 0
                  ? t('Uzak dalda {count} yeni commit var.', { count: result.behind })
                  : t('Yeni commit yok.'),
            };
          }),
        },
        {
          id: 'remote.pull',
          label: 'Pull',
          group: 'Uzak sunucu',
          shortcut: 'mod+shift+l',
          hint: status?.behind ? t('{count} commit geride', { count: status.behind }) : undefined,
          run: remoteAction('Pull', async () => {
            const result = await invoke('git:pull', { repoId, fastForwardOnly: false });
            return { message: result.message, ok: result.outcome !== 'error' };
          }),
        },
        {
          id: 'remote.push',
          label: 'Push',
          group: 'Uzak sunucu',
          shortcut: 'mod+shift+p',
          hint: status?.ahead ? t('{count} commit ileride', { count: status.ahead }) : undefined,
          run: remoteAction('Push', async () => {
            const result = await invoke('git:push', { repoId });
            return { message: result.message, ok: result.ok };
          }),
        },
        {
          id: 'stash.create',
          label: 'Değişiklikleri sakla (stash)',
          group: 'Çalışma dizini',
          shortcut: 'mod+shift+s',
          disabled: !status || (status.staged.length === 0 && status.unstaged.length === 0),
          run: remoteAction('Değişiklikler saklandı', async () => {
            await invoke('git:stash-create', { repoId, includeUntracked: true });
            return {};
          }),
        },
        {
          id: 'autopull.now',
          label: 'Otomatik pull’u şimdi çalıştır',
          group: 'Çalışma dizini',
          run: remoteAction('Otomatik pull', async () => {
            const result = await invoke('autopull:run-now', { repoId });
            return { message: result.message, ok: result.outcome !== 'error' };
          }),
        },
      );

      for (const branch of branches?.local ?? []) {
        if (branch.isCurrent) continue;
        commands.push({
          id: `branch.checkout.${branch.fullName}`,
          label: t('{branch} dalına geç', { branch: branch.fullName }),
          group: 'Dallar',
          hint: branch.lastCommitSubject,
          run: async () => {
            try {
              const result = await invoke('git:checkout', { repoId, name: branch.fullName });
              invalidate();
              toast({
                kind: result.outcome === 'switched' ? 'success' : 'warning',
                title: t('Dal değiştirme'),
                description: result.message,
              });
            } catch (error) {
              toast({
                kind: 'error',
                title: t('Dal değiştirilemedi'),
                description: errorMessage(error),
              });
            }
          },
        });
      }
    }

    for (const repo of repos ?? []) {
      if (repo.id === repoId) continue;
      commands.push({
        id: `repo.open.${repo.id}`,
        label: t('{name} deposunu aç', { name: repo.name }),
        group: 'Depolar',
        hint: repo.path,
        run: () => setActiveRepo(repo.id),
      });
    }

    commands.push({
      id: 'repo.add',
      label: 'Depo ekle…',
      group: 'Depolar',
      run: async () => {
        try {
          const repo = await invoke('repo:add-dialog', undefined);
          if (!repo) return;
          void client.invalidateQueries({ queryKey: keys.repos });
          setActiveRepo(repo.id);
        } catch (error) {
          toast({ kind: 'error', title: t('Depo eklenemedi'), description: errorMessage(error) });
        }
      },
    });

    return commands;
  }, [activeRepo, branches, repos, status, client, setActiveRepo, setTab, toggleCommandLog, toast, t]);
}
