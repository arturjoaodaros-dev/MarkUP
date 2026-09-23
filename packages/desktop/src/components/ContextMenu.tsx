import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type MenuItem = { separator: true } | { label: string; action: () => void; shortcut?: string; danger?: boolean; separator?: false };

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPosition({ x: Math.min(x, window.innerWidth - rect.width - 8), y: Math.min(y, window.innerHeight - rect.height - 8) });
    el.querySelector<HTMLButtonElement>('button')?.focus();
  }, [x, y]);

  useEffect(() => {
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      if (event instanceof MouseEvent && ref.current?.contains(event.target as Node)) return;
      onClose();
    };
    window.addEventListener('mousedown', close, true);
    window.addEventListener('keydown', close, true);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('mousedown', close, true);
      window.removeEventListener('keydown', close, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      style={{ left: position.x, top: position.y }}
      onKeyDown={(event) => {
        const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === 'ArrowDown') buttons[(index + 1) % buttons.length]?.focus();
        if (event.key === 'ArrowUp') buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
      }}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="menu-separator" role="separator" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={`menu-item${item.danger ? ' is-danger' : ''}`}
            onClick={() => {
              onClose();
              item.action();
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && <kbd>{item.shortcut}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}
