export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Normalises a keyboard event to `mod+shift+alt+key` (mod = Cmd on macOS, Ctrl elsewhere). */
export function eventToShortcut(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (isMac ? event.metaKey : event.ctrlKey) parts.push('mod');
  if (isMac && event.ctrlKey) parts.push('ctrl');
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');
  let key = event.key.toLowerCase();
  if (key === ' ') key = 'space';
  if (event.code.startsWith('Digit')) key = event.code.slice(5);
  if (event.code === 'Backslash') key = '\\';
  if (event.code === 'Equal') key = '=';
  if (event.code === 'Minus') key = '-';
  if (event.code === 'Comma') key = ',';
  if (event.code === 'Period') key = '.';
  parts.push(key);
  return parts.join('+');
}

/** `mod+shift+p` → `Ctrl+Shift+P` (or `⌘⇧P` on macOS). */
export function formatShortcut(shortcut: string): string {
  const names: Record<string, string> = isMac
    ? { mod: '⌘', shift: '⇧', alt: '⌥', ctrl: '⌃' }
    : { mod: 'Ctrl', shift: 'Shift', alt: 'Alt', ctrl: 'Ctrl' };
  const keys: Record<string, string> = { tab: 'Tab', pagedown: 'PgDn', pageup: 'PgUp', escape: 'Esc', enter: 'Enter', f1: 'F1', f12: 'F12', '\\': '\\', space: 'Space' };
  const parts = shortcut.split('+').map((p) => names[p] ?? keys[p] ?? p.toUpperCase());
  return parts.join(isMac ? '' : '+');
}
