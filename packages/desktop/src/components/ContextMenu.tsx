import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
}

interface MenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

/**
 * Menu de contexto próprio (missão §17) — não um dropdown de website,
 * fecha ao clicar fora ou apertar Escape, posicionado no ponto do clique.
 */
export function useContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);

  const openMenu = useCallback((x: number, y: number, items: ContextMenuItem[]) => {
    setMenu({ x, y, items });
  }, []);

  const close = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!menu) return;
    const onDocClick = () => close();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('click', onDocClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', onDocClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu, close]);

  const ContextMenuPortal = menu
    ? createPortal(
        <div className="mkd-context-menu" style={{ left: menu.x, top: menu.y }}>
          {menu.items.map((item) => (
            <div
              key={item.label}
              className="mkd-context-menu-item"
              data-destructive={item.destructive}
              onClick={(e) => {
                e.stopPropagation();
                item.onSelect();
                close();
              }}
            >
              {item.label}
            </div>
          ))}
        </div>,
        document.body,
      )
    : null;

  return { openMenu, ContextMenuPortal };
}
