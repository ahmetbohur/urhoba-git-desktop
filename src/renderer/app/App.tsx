import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Tooltip } from 'radix-ui';
import { FolderGit2, GitCommitHorizontal, GitPullRequest, History } from 'lucide-react';
import { useT } from '../i18n';
import { cn } from '../lib/cn';
import { matchesShortcut, useCommands, type Command } from '../lib/commands';
import { onAppEvent } from '../lib/ipc';
import {
  refreshDirtyCount,
  useAutoPullRepoIds,
  useQueryClient,
  useRepos,
  useSettings,
} from '../lib/queries';
import { useUi, type MainTab } from '../stores/ui';
import { usePane } from '../lib/use-pane';
import { ChangesView } from '../components/ChangesView';
import { CommandLogPanel } from '../components/CommandLogPanel';
import { CommandPalette } from '../components/CommandPalette';
import { AboutDialog } from '../components/dialogs/AboutDialog';
import { EmptyState } from '../components/primitives';
import { HistoryView } from '../components/HistoryView';
import { OperationBar } from '../components/OperationBar';
import { SubmoduleBar } from '../components/SubmoduleBar';
import { PullRequestsView } from '../components/PullRequestsView';
import { MissingRepoView } from '../components/MissingRepoView';
import { RepoSidebar } from '../components/RepoSidebar';
import { Splitter } from '../components/Splitter';
import { Toasts } from '../components/Toasts';
import { TopBar } from '../components/TopBar';
import type { GitLogEntry } from '@shared/types';

const TABS: Array<{ id: MainTab; label: string; icon: typeof History }> = [
  { id: 'changes', label: 'Değişiklikler', icon: GitCommitHorizontal },
  { id: 'history', label: 'Geçmiş', icon: History },
  { id: 'pulls', label: 'Pull request’ler', icon: GitPullRequest },
];

/**
 * Ana süreçten gelen olayları uygulama durumuna bağlar.
 *
 * Depo değişimi bildirimi geldiğinde ilgili sorguları geçersiz kılıyoruz; böylece
 * kullanıcı dosyayı dışarıda düzenlediğinde (editörde kaydettiğinde, terminalde
 * commit attığında) arayüz kendiliğinden tazeleniyor.
 */
function useAppEvents(onShowAbout: () => void): void {
  const t = useT();
  const client = useQueryClient();
  const pushCommandLogs = useUi((s) => s.pushCommandLogs);
  const recordAutoPull = useUi((s) => s.recordAutoPull);
  const toast = useUi((s) => s.toast);
  const setActivityOpen = useUi((s) => s.setActivityOpen);

  /*
   * Komut günlüğü olayları kısa bir pencerede biriktiriliyor.
   *
   * Depo sayacı bütün depoları tarıyor ve her git komutu ayrı bir olay
   * yolluyor; elli depoda elli ayrı IPC mesajı geliyor. Ayrı mesajlar ayrı
   * görevlerde işlendiği için React onları gruplamıyor ve panel elli kez
   * yeniden çiziliyordu.
   *
   * Pencere kısa: günlük bir hata ayıklama aracı, yüz milisaniyelik gecikme
   * fark edilmiyor. Buna karşılık tek komut çalıştığında da aynı yoldan
   * geçiyor, yani davranış her iki uçta da aynı.
   */
  const buffer = useRef<GitLogEntry[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bufferCommandLog = useCallback(
    (entry: GitLogEntry) => {
      buffer.current.push(entry);
      if (flushTimer.current) return;
      flushTimer.current = setTimeout(() => {
        flushTimer.current = null;
        const bekleyen = buffer.current;
        buffer.current = [];
        pushCommandLogs(bekleyen);
      }, 100);
    },
    [pushCommandLogs],
  );

  // Bileşen sökülürken bekleyen kayıtlar kaybolmasın ve zamanlayıcı kalmasın.
  useEffect(
    () => () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
    },
    [],
  );

  useEffect(
    () =>
      onAppEvent((event) => {
        switch (event.type) {
          case 'app:show-about':
            onShowAbout();
            break;
          // Bildirime tıklanınca özet penceresi açılıyor.
          case 'activity:open':
            setActivityOpen(true);
            break;
          case 'repo:changed':
            void client.invalidateQueries({ queryKey: ['repo', event.repoId] });
            // Dosya izleyicisinden gelen değişiklik kenar çubuğundaki sayacı
            // da etkiliyor; commit terminalden atıldığında rozet buradan
            // güncelleniyor. Yalnızca değişen deponun sayacı tazeleniyor:
            // bütün listeyi taramak elli dört git süreci demekti.
            void refreshDirtyCount(client, event.repoId);
            break;
          case 'git:command':
            // Tek tek değil, kısa bir pencerede biriktirilip topluca veriliyor.
            bufferCommandLog(event.entry);
            break;
          case 'autopull:result': {
            recordAutoPull(event.result);
            /*
             * Otomatik pull ekranda açık olmayan depolarda da çalışıyor ve
             * dosya izleyicisi yalnızca aktif depoyu izliyor; o depoların
             * sayacı başka hiçbir yerden tazelenmiyor. Yine de taranacak olan
             * yalnızca pull'un çalıştığı depo.
             */
            void refreshDirtyCount(client, event.result.repoId);
            // Arka plan işi olduğu için yalnızca gerçekten bir şey olduğunda
            // bildirim çıkarıyoruz; "zaten güncel" sessizce geçiyor.
            if (event.result.commitsPulled > 0) {
              toast({
                kind: 'success',
                title: t('Otomatik pull'),
                description: event.result.message,
              });
            } else if (event.result.outcome === 'conflict' || event.result.outcome === 'error') {
              toast({
                kind: 'error',
                title: t('Otomatik pull başarısız'),
                description: event.result.message,
              });
            }
            break;
          }
          /*
            Arka plan kontrolü yeni sürüm buldu. Bildirim çıkarmıyoruz;
            sorgu tazeleniyor, rozet kendiliğinden görünüyor.
          */
          case 'update:available':
            client.setQueryData(['update-status'], event.status);
            break;
          case 'clone:progress':
            // Klonlama ilerlemesini diyaloğun kendisi dinliyor.
            break;
        }
      }),
    [client, bufferCommandLog, recordAutoPull, toast, t, onShowAbout, setActivityOpen],
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
  const t = useT();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const showAbout = useCallback(() => setAboutOpen(true), []);
  useAppEvents(showAbout);

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
    const fallback =
      remembered && repos.some((repo) => repo.id === remembered) ? remembered : repos[0].id;
    setActiveRepo(fallback);
  }, [repos, settings, activeRepoId, setActiveRepo]);

  const activeRepo = repos?.find((repo) => repo.id === activeRepoId) ?? null;
  const commands = useCommands(activeRepo);
  const {
    attach: sidebarAttach,
    width: sidebarWidth,
    available: sidebarAvailable,
    preview: sidebarPreview,
    commit: sidebarCommit,
  } = usePane('sidebar');
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  useShortcuts(commands, openPalette);

  return (
    <Tooltip.Provider delayDuration={400}>
      <div ref={sidebarAttach} className="flex h-full">
        <a href="#ana-icerik" className="skip-link">
          {t('İçeriğe atla')}
        </a>
        <RepoSidebar autoPullRepoIds={autoPullRepoIds} width={sidebarWidth} />
        <Splitter
          pane="sidebar"
          width={sidebarWidth}
          available={sidebarAvailable}
          onPreview={sidebarPreview}
          onCommit={sidebarCommit}
          label={t('Depo listesi genişliği')}
        />

        <main id="ana-icerik" className="flex min-w-0 flex-1 flex-col bg-ground">
          {activeRepo?.missing ? (
            /*
             * Klasör diskte yoksa depo görünümü hiç çizilmiyor. Eskiden
             * çiziliyordu ve bütün sorgular hata verdiği için ekranda
             * "çalışma dizini temiz" yazıyordu — depo hiç yokken verilen bu
             * bilgi, sessiz kalmaktan kötüydü.
             */
            <MissingRepoView repo={activeRepo} />
          ) : activeRepo ? (
            <>
              <TopBar repo={activeRepo} />

              <nav
                aria-label={t('Depo görünümleri')}
                role="tablist"
                className="flex shrink-0 gap-1 border-b border-line bg-surface px-3"
              >
                {TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={cn(
                      'flex items-center gap-1.5 border-b-2 px-2 py-2 text-[13px] font-medium',
                      tab === id
                        ? 'border-accent text-accent-ink'
                        : 'border-transparent text-ink-2 hover:text-ink',
                    )}
                  >
                    <Icon className="size-3.5" />
                    {t(label)}
                  </button>
                ))}
              </nav>

              <OperationBar repoId={activeRepo.id} />
              <SubmoduleBar repoId={activeRepo.id} />

              {tab === 'changes' ? (
                <ChangesView repoId={activeRepo.id} />
              ) : tab === 'history' ? (
                <HistoryView repoId={activeRepo.id} />
              ) : (
                <PullRequestsView repoId={activeRepo.id} />
              )}

              <CommandLogPanel />
            </>
          ) : (
            <EmptyState
              icon={<FolderGit2 className="size-6" />}
              title="Urhoba Git Desktop"
              description={t(
                'Başlamak için soldan bir depo ekle ya da uzak bir depoyu klonla. Komut paletini Ctrl/Cmd + K ile açabilirsin.',
              )}
            />
          )}
        </main>

        <Toasts />
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
        <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      </div>
    </Tooltip.Provider>
  );
}
