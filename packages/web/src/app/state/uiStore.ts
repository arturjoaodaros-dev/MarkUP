import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type EditorMode = 'edit' | 'preview' | 'split';
export type Theme = 'light' | 'dark';

interface UiState {
  mode: EditorMode;
  theme: Theme;
  sidebarOpen: boolean;
  problemsPanelOpen: boolean;
  setMode: (mode: EditorMode) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setProblemsPanelOpen: (open: boolean) => void;
}

function prefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      mode: 'split',
      theme: prefersDark() ? 'dark' : 'light',
      sidebarOpen: true,
      problemsPanelOpen: false,
      setMode: (mode) => set({ mode }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === 'dark' ? 'light' : 'dark' }),
      toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
      setProblemsPanelOpen: (open) => set({ problemsPanelOpen: open }),
    }),
    { name: 'markup:ui:v1' },
  ),
);
