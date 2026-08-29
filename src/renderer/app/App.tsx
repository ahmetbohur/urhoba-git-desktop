import { useCallback, useEffect, useMemo, useState } from 'react';
import { Tooltip } from 'radix-ui';
import { FolderGit2, GitCommitHorizontal, History } from 'lucide-react';
import { cn } from '../lib/cn';
import { matchesShortcut, useCommands, type Command } from '../lib/commands';
import { onAppEvent } from '../lib/ipc';
import { useAutoPullRepoIds, useQueryClient, useRepos, useSettings } from '../lib/queries';
import { useUi, type MainTab } from '../stores/ui';
import { ChangesView } from '../components/ChangesView';
import { CommandLogPanel } from '../components/CommandLogPanel';
import { CommandPalette } from '../components/CommandPalette';
import { EmptyState } from '../components/primitives';
import { HistoryView } from '../components/HistoryView';
import { OperationBar } from '../components/OperationBar';
import { RepoSidebar } from '../components/RepoSidebar';
import { Toasts } from '../components/Toasts';
import { TopBar } from '../components/TopBar';

const TABS: Array<{ id: MainTab; label: string; icon: typeof History }> = [
  { id: 'changes', label: 'Değişiklikler', icon: GitCommitHorizontal },
  { id: 'history', label: 'Geçmiş', icon: History },
];

/**
 * Ana süreçten gelen olayları uygulama durumuna bağlar.
 *
 * Depo değişimi bildirimi geldiğinde ilgili sorguları geçersiz kılıyoruz; böylece
 * kullanıcı dosyayı dışarıda düzenlediğinde (editörde kaydettiğinde, terminalde
 * commit attığında) arayüz kendiliğinden tazeleniyor.
 */
function useAppEvents(): void {
  const client = useQueryClient();
  const pushCommandLog = useUi((s) => s.pushCommandLog);
  const recordAutoPull = useUi((s) => s.recordAutoPull);
  const toast = useUi((s) => s.toast);

  useEffect(
    () =>
      onAppEvent((event) => {
        switch (event.type) {
          case 'repo:changed':
            void client.invalidateQueries({ queryKey: ['repo', event.repoId] });
            break;
          case 'git:command':
            pushCommandLog(event.entry);
            break;
          case 'autopull:result': {
            recordAutoPull(event.result);
            // Arka plan işi olduğu için yalnızca gerçekten bir şey olduğunda
            // bildirim çıkarıyoruz; "zaten güncel" sessizce geçiyor.
            if (event.result.commitsPulled > 0) {
              toast({
                kind: 'success',
                title: 'Otomatik pull',
                description: event.result.message,
              });
            } else if (event.result.outcome === 'conflict' || event.result.outcome === 'error') {
              toast({
                kind: 'error',
                title: 'Otomatik pull başarısız',
                description: event.result.message,
              });
            }
            break;
          }
          case 'clone:progress':
            // Klonlama ilerlemesini diyaloğun kendisi dinliyor.
            break;
        }
      }),
    [client, pushCommandLog, recordAutoPull, toast],
  );
}

/**
 * Klavye kısayolları.
 *
 * Kısayollar komut listesinden okunuyor, ayrı bir tabloda tanımlanmıyor: paletin
 * gösterdiği tuş ile gerçekten çalışan tuş hep aynı kalıyor. Metin alanlarında
 * yalnızca paletin kendi kısayolu geçerli; kullanıcı commit mesajı yazarken
 * yanlışlıkla push etmesin.
 */
function useShortcuts(commands: Command[], openPalette: () => void): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (matchesShortcut(event, 'mod+k')) {
        event.preventDefault();
        openPalette();
        return;
      }

      const target = event.target as HTMLElement | null;
      const inTextField =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;
      if (inTextField) return;

      for (const command of commands) {
        if (!command.shortcut || !matchesShortcut(event, command.shortcut)) continue;
        event.preventDefault();
        if (!command.disabled) void command.run();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [commands, openPalette]);
}

export function App() {
  useAppEvents();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const { data: repos } = useRepos();
  const { data: settings } = useSettings();
  const activeRepoId = useUi((s) => s.activeRepoId);
  const setActiveRepo = useUi((s) => s.setActiveRepo);
  const tab = useUi((s) => s.tab);
  const setTab = useUi((s) => s.setTab);

  const repoIds = useMemo(() => (repos ?? []).map((repo) => repo.id), [repos]);
  const autoPullRepoIds = useAutoPullRepoIds(repoIds);

  // Açılışta en son bakılan depoya dön; o depo silinmişse listenin ilkine.
  useEffect(() => {
    if (activeRepoId || !repos || repos.length === 0) return;
    const remembered = settings?.lastOpenedRepoId;
    const fallback = remembered && repos.some((repo) => repo.id === remembered)
      ? remembered
      : repos[0].id;
    setActiveRepo(fallback);
  }, [repos, settings, activeRepoId, setActiveRepo]);

  const activeRepo = repos?.find((repo) => repo.id === activeRepoId) ?? null;
  const commands = useCommands(activeRepo);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  useShortcuts(commands, openPalette);

  return (
    <Tooltip.Provider delayDuration={400}>
      <div className="flex h-full">
        <RepoSidebar autoPullRepoIds={autoPullRepoIds} />

        <main className="flex min-w-0 flex-1 flex-col bg-ground">
          {activeRepo ? (
            <>
              <TopBar repo={activeRepo} />

              <nav className="flex shrink-0 gap-1 border-b border-line bg-surface px-3">
                {TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={cn(
                      'flex items-center gap-1.5 border-b-2 px-2 py-2 text-[13px] font-medium',
                      tab === id
                        ? 'border-accent text-accent-ink'
                        : 'border-transparent text-ink-2 hover:text-ink',
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
              </nav>

              <OperationBar repoId={activeRepo.id} />

              {tab === 'changes' ? (
                <ChangesView repoId={activeRepo.id} />
              ) : (
                <HistoryView repoId={activeRepo.id} />
              )}

              <CommandLogPanel />
            </>
          ) : (
            <EmptyState
              icon={<FolderGit2 className="size-6" />}
              title="Urhoba Git Desktop"
              description="Başlamak için soldan bir depo ekle ya da uzak bir depoyu klonla. Komut paletini Ctrl/Cmd + K ile açabilirsin."
            />
          )}
        </main>

        <Toasts />
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
      </div>
    </Tooltip.Provider>
  );
}
