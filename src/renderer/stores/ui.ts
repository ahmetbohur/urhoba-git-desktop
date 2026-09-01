import { create } from 'zustand';
import type { AutoPullResult, GitLogEntry } from '@shared/types';

export type MainTab = 'changes' | 'history' | 'pulls';

export interface Toast {
  id: string;
  kind: 'info' | 'success' | 'warning' | 'error';
  title: string;
  description?: string;
}

/** Diff panelinde ne gösterileceğini tanımlayan seçim. */
export type Selection =
  | { kind: 'none' }
  | { kind: 'working'; path: string; staged: boolean }
  | { kind: 'conflict'; path: string }
  | { kind: 'commit'; sha: string; path: string | null };

interface UiState {
  activeRepoId: string | null;
  tab: MainTab;
  selection: Selection;
  commandLogOpen: boolean;
  /**
   * Yayınlama penceresi. Yerel durum yerine burada duruyor çünkü pencereyi
   * hem üst çubuktaki düğme hem komut paleti açabiliyor; palet üst çubuğun
   * yerel durumuna erişemez.
   */
  publishOpen: boolean;
  /**
   * GitHub giriş penceresi. Bunu da üst çubuk dışında bir yer açıyor: yayınlama
   * penceresi giriş yapılmamışken oraya bir düğme koyuyor.
   */
  githubOpen: boolean;
  /** Etkinlik özeti penceresi; kenar çubuğu ve komut paleti açıyor. */
  cloneOpen: boolean;
  /**
   * Klonlama penceresi hazır değerlerle açılabiliyor.
   *
   * Kaybolmuş bir depo yeniden klonlandığında eski kayıt da elden çıkmalı;
   * `replacesRepoId` bunu taşıyor. Aksi hâlde listede biri çalışan biri kırık
   * iki kayıt kalırdı.
   */
  clonePreset: { url: string; replacesRepoId?: string } | null;
  activityOpen: boolean;
  commandLog: GitLogEntry[];
  toasts: Toast[];
  /** Depo başına son otomatik pull sonucu — arayüzde "en son ne oldu" göstergesi. */
  lastAutoPull: Record<string, AutoPullResult>;

  setActiveRepo: (id: string | null) => void;
  setTab: (tab: MainTab) => void;
  select: (selection: Selection) => void;
  toggleCommandLog: () => void;
  setPublishOpen: (open: boolean) => void;
  setGithubOpen: (open: boolean) => void;
  setActivityOpen: (open: boolean) => void;
  setCloneOpen: (open: boolean) => void;
  setClonePreset: (preset: { url: string; replacesRepoId?: string } | null) => void;
  pushCommandLog: (entry: GitLogEntry) => void;
  pushCommandLogs: (entries: GitLogEntry[]) => void;
  toast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  recordAutoPull: (result: AutoPullResult) => void;
}

/** Komut günlüğü bellekte tutuluyor; sınırsız büyümesin diye son N kayıt. */
const MAX_LOG_ENTRIES = 200;

export const useUi = create<UiState>((set) => ({
  activeRepoId: null,
  tab: 'changes',
  selection: { kind: 'none' },
  commandLogOpen: false,
  publishOpen: false,
  githubOpen: false,
  cloneOpen: false,
  clonePreset: null,
  activityOpen: false,
  commandLog: [],
  toasts: [],
  lastAutoPull: {},

  setActiveRepo: (id) => set({ activeRepoId: id, selection: { kind: 'none' }, tab: 'changes' }),
  setTab: (tab) => set({ tab, selection: { kind: 'none' } }),
  select: (selection) => set({ selection }),
  toggleCommandLog: () => set((state) => ({ commandLogOpen: !state.commandLogOpen })),
  setPublishOpen: (publishOpen) => set({ publishOpen }),
  setGithubOpen: (githubOpen) => set({ githubOpen }),
  setActivityOpen: (activityOpen) => set({ activityOpen }),
  // Pencere kapanınca hazır değer de sıfırlanıyor; kalırsa bir sonraki
  // klonlama beklenmedik biçimde dolu açılır.
  setCloneOpen: (cloneOpen) => set(cloneOpen ? { cloneOpen } : { cloneOpen, clonePreset: null }),
  setClonePreset: (clonePreset) => set({ clonePreset }),
  pushCommandLog: (entry) =>
    set((state) => ({ commandLog: [entry, ...state.commandLog].slice(0, MAX_LOG_ENTRIES) })),
  /*
   * Toplu ekleme. Depo sayacı bütün depoları tarıyor ve her git komutu ayrı
   * bir olay yolluyor: elli depo, elli ayrı durum güncellemesi ve elli yeniden
   * çizim demek. Olaylar ayrı IPC mesajları olarak geldiği için React onları
   * kendiliğinden gruplamıyor; çağıran biriktirip tek seferde veriyor.
   */
  pushCommandLogs: (entries) =>
    set((state) =>
      entries.length === 0
        ? state
        : { commandLog: [...entries.reverse(), ...state.commandLog].slice(0, MAX_LOG_ENTRIES) },
    ),
  toast: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id: crypto.randomUUID() }].slice(-4),
    })),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  recordAutoPull: (result) =>
    set((state) => ({ lastAutoPull: { ...state.lastAutoPull, [result.repoId]: result } })),
}));
