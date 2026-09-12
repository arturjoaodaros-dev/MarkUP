// Persistência de configurações via `@tauri-apps/plugin-store` (grava em
// `settings.json` no diretório de dados do app — AppData no Windows).
// Um único documento (`app-settings`) guarda todo o esquema; migração leve
// no load lê as chaves antigas (`lastWorkspacePath`/`theme` soltas, do
// esquema mínimo anterior a esta etapa) quando o documento novo ainda não
// existe, pra não perder a pasta/tema já configurados de quem já usava o app.

import { load } from '@tauri-apps/plugin-store';

export type ThemePreference = 'dark' | 'light' | 'system';

export interface EditorSettings {
  fontSize: number;
  /** Sempre uma pilha de font-family completa (com fallbacks) — nunca um nome solto. */
  fontFamily: string;
  /** `null` = sem limite (largura total do painel), como o comportamento atual. */
  maxWidth: number | null;
  wordWrap: boolean;
  lineNumbers: boolean;
  tabSize: number;
}

export interface PreviewSettings {
  updateMode: 'live' | 'onSave' | 'manual';
  maxWidth: number | null;
  openBehavior: 'always' | 'closed' | 'remember';
}

export interface FilesSettings {
  autoSave: 'off' | 'delayed' | 'on';
  autoSaveIntervalSeconds: number;
  confirmBeforeClosingDirty: boolean;
  restoreLastSession: boolean;
}

export interface MarkupSettings {
  defaultExtension: '.markup' | '.mkup';
}

export interface AppSettings {
  lastWorkspacePath: string | null;
  theme: ThemePreference;
  isPreviewCollapsed: boolean;
  lastOpenTabPaths: string[];
  lastActiveTabPath: string | null;
  editor: EditorSettings;
  preview: PreviewSettings;
  files: FilesSettings;
  markup: MarkupSettings;
}

// Todo default aqui reproduz o comportamento que já existia antes desta
// etapa (fonte 14px, sem limite de largura, word wrap sempre ligado, etc.)
// — a única mudança de comportamento default é o tema, pedido explicitamente.
export const DEFAULT_SETTINGS: AppSettings = {
  lastWorkspacePath: null,
  theme: 'dark',
  isPreviewCollapsed: false,
  lastOpenTabPaths: [],
  lastActiveTabPath: null,
  editor: {
    fontSize: 14,
    fontFamily: 'var(--font-mono)',
    maxWidth: null,
    wordWrap: true,
    lineNumbers: true,
    tabSize: 2,
  },
  preview: {
    updateMode: 'live',
    maxWidth: null,
    openBehavior: 'always',
  },
  files: {
    autoSave: 'off',
    autoSaveIntervalSeconds: 5,
    confirmBeforeClosingDirty: true,
    restoreLastSession: false,
  },
  markup: {
    defaultExtension: '.markup',
  },
};

let storePromise: ReturnType<typeof load> | null = null;

function getStore() {
  storePromise ??= load('settings.json', { autoSave: false });
  return storePromise;
}

function mergeDefaults(stored: Partial<AppSettings> | null | undefined): AppSettings {
  if (!stored) return structuredClone(DEFAULT_SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    editor: { ...DEFAULT_SETTINGS.editor, ...stored.editor },
    preview: { ...DEFAULT_SETTINGS.preview, ...stored.preview },
    files: { ...DEFAULT_SETTINGS.files, ...stored.files },
    markup: { ...DEFAULT_SETTINGS.markup, ...stored.markup },
  };
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const store = await getStore();
    const stored = await store.get<Partial<AppSettings>>('app-settings');
    if (stored) return mergeDefaults(stored);

    // Migração leve do esquema mínimo anterior (chaves soltas), só quando o
    // documento novo ainda não existe — evita perder pasta/tema já escolhidos.
    const legacyLastWorkspacePath = await store.get<string>('lastWorkspacePath');
    const legacyTheme = await store.get<ThemePreference>('theme');
    if (legacyLastWorkspacePath !== undefined || legacyTheme !== undefined) {
      return mergeDefaults({
        lastWorkspacePath: legacyLastWorkspacePath ?? null,
        theme: legacyTheme ?? DEFAULT_SETTINGS.theme,
      });
    }

    return structuredClone(DEFAULT_SETTINGS);
  } catch {
    // Configuração é conveniência, não dado crítico — uma falha aqui não
    // deve impedir o app de abrir (missão §111).
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    const store = await getStore();
    await store.set('app-settings', settings);
    await store.save();
  } catch {
    // Idem — falha silenciosa, não deve incomodar o fluxo principal.
  }
}
