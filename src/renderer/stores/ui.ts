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
  commandLog: GitLogEntry[];
  toasts: Toast[];
  /** Depo başına son otomatik pull sonucu — arayüzde "en son ne oldu" göstergesi. */
  lastAutoPull: Record<string, AutoPullResult>;

  setActiveRepo: (id: string | null) => void;
  setTab: (tab: MainTab) => void;
  select: (selection: Selection) => void;
  toggleCommandLog: () => void;
  setPublishOpen: (open: boolean) => void;
  pushCommandLog: (entry: GitLogEntry) => void;
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
  commandLog: [],
  toasts: [],
  lastAutoPull: {},

  setActiveRepo: (id) =>
    set({ activeRepoId: id, selection: { kind: 'none' }, tab: 'changes' }),
  setTab: (tab) => set({ tab, selection: { kind: 'none' } }),
  select: (selection) => set({ selection }),
  toggleCommandLog: () => set((state) => ({ commandLogOpen: !state.commandLogOpen })),
  setPublishOpen: (publishOpen) => set({ publishOpen }),
  pushCommandLog: (entry) =>
    set((state) => ({ commandLog: [entry, ...state.commandLog].slice(0, MAX_LOG_ENTRIES) })),
  toast: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id: crypto.randomUUID() }].slice(-4),
    })),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  recordAutoPull: (result) =>
    set((state) => ({ lastAutoPull: { ...state.lastAutoPull, [result.repoId]: result } })),
}));
