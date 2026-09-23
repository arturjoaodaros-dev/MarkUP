/**
 * Scroll synchronisation between editor and preview. Each side publishes the
 * source line at its top; the other side follows. Messages from the side that is
 * currently being followed are ignored briefly to avoid feedback loops.
 */
type Side = 'editor' | 'preview';
type Listener = (line: number) => void;

const listeners: Record<Side, Set<Listener>> = { editor: new Set(), preview: new Set() };
let quietUntil: Record<Side, number> = { editor: 0, preview: 0 };

export const scrollBus = {
  /** `from` scrolled so that `line` is at its top. */
  publish(from: Side, line: number): void {
    if (Date.now() < quietUntil[from]) return;
    const to: Side = from === 'editor' ? 'preview' : 'editor';
    quietUntil = { ...quietUntil, [to]: Date.now() + 160 };
    for (const listener of listeners[to]) listener(line);
  },
  /** Listen for the line `side` should scroll to. */
  subscribe(side: Side, listener: Listener): () => void {
    listeners[side].add(listener);
    return () => listeners[side].delete(listener);
  },
};
