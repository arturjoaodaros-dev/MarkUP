/**
 * Scroll synchronisation between a source editor and rendered HTML that was
 * produced with `sourcePositions: true` (`data-line` / `data-line-end`).
 * DOM-only; shared by the VS Code preview and the desktop app.
 */

interface Entry {
  el: HTMLElement;
  line: number;
  end: number;
  top: number;
  height: number;
}

function entries(root: HTMLElement): Entry[] {
  const rootTop = root.getBoundingClientRect().top;
  const list: Entry[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('[data-line]')) {
    const rect = el.getBoundingClientRect();
    if (rect.height === 0 && rect.width === 0) continue; // hidden (collapsed details, inactive tabs)
    const line = Number(el.dataset.line);
    const end = Number(el.dataset.lineEnd ?? line);
    if (!Number.isFinite(line)) continue;
    list.push({ el, line, end: Math.max(line, end), top: rect.top - rootTop, height: rect.height });
  }
  // Innermost element wins for a given start line; keep document order otherwise.
  list.sort((a, b) => a.line - b.line || b.top - a.top);
  return list;
}

/** The vertical offset (relative to `root`) where source line `line` (1-based, fractional) is rendered. */
export function offsetForLine(root: HTMLElement, line: number): number | null {
  const list = entries(root);
  if (list.length === 0) return null;
  let previous: Entry | null = null;
  for (const entry of list) {
    if (entry.line > line) {
      if (!previous) return entry.top;
      if (line <= previous.end) {
        const span = previous.end - previous.line + 1;
        return previous.top + ((line - previous.line) / span) * previous.height;
      }
      const ratio = (line - previous.end) / Math.max(1, entry.line - previous.end);
      const from = previous.top + previous.height;
      return from + ratio * (entry.top - from);
    }
    previous = entry;
  }
  const last = list[list.length - 1]!;
  const span = last.end - last.line + 1;
  return last.top + Math.min(1, (line - last.line) / span) * last.height;
}

/** The (fractional, 1-based) source line rendered at vertical offset `y` (relative to `root`). */
export function lineForOffset(root: HTMLElement, y: number): number | null {
  const list = entries(root).sort((a, b) => a.top - b.top);
  if (list.length === 0) return null;
  let previous: Entry | null = null;
  for (const entry of list) {
    if (entry.top > y) {
      if (!previous) return entry.line;
      if (y <= previous.top + previous.height) {
        const ratio = previous.height > 0 ? (y - previous.top) / previous.height : 0;
        return previous.line + ratio * (previous.end - previous.line + 1);
      }
      const from = previous.top + previous.height;
      const ratio = (y - from) / Math.max(1, entry.top - from);
      return previous.end + ratio * (entry.line - previous.end);
    }
    previous = entry;
  }
  return previous ? previous.end : null;
}

/** The innermost element rendered from a source line, for highlighting. */
export function elementForLine(root: HTMLElement, line: number): HTMLElement | null {
  let best: HTMLElement | null = null;
  for (const el of root.querySelectorAll<HTMLElement>('[data-line]')) {
    const start = Number(el.dataset.line);
    const end = Number(el.dataset.lineEnd ?? start);
    if (start <= line && line <= end) best = el;
  }
  return best;
}
