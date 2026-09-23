export interface Settings {
  theme: 'dark' | 'light' | 'system';
  fontSize: number;
  lineNumbers: boolean;
  wordWrap: boolean;
  tabSize: number;
  scrollSync: boolean;
  autosave: 'off' | 'afterDelay' | 'onFocusChange';
  previewTheme: 'app' | 'light' | 'dark';
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  fontSize: 14,
  lineNumbers: true,
  wordWrap: true,
  tabSize: 2,
  scrollSync: true,
  autosave: 'off',
  previewTheme: 'app',
};

const KEY = 'markup.desktop.settings.v1';

/** Reads settings, keeping only known keys with valid types. */
export function loadSettings(storage: Storage | null): Settings {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const merged: Settings = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      if (parsed[key] !== undefined && typeof parsed[key] === typeof DEFAULT_SETTINGS[key])
        (merged as unknown as Record<string, unknown>)[key] = parsed[key];
    }
    merged.fontSize = Math.min(28, Math.max(10, merged.fontSize));
    merged.tabSize = [2, 4, 8].includes(merged.tabSize) ? merged.tabSize : 2;
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage: Storage | null, settings: Settings): void {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Settings still apply for this session.
  }
}

export function resolvedTheme(settings: Settings): 'dark' | 'light' {
  if (settings.theme !== 'system') return settings.theme;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}
