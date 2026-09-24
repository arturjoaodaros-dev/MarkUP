import { useEffect, useRef, useState } from 'react';
import { useWorkbench } from '../context.ts';
import { formatShortcut } from '../lib/keys.ts';
import type { Command } from '../state/commands.ts';
import { Logo } from './Logo.tsx';

/** Menus list command ids; '-' is a separator. */
const MENUS: { label: string; items: string[] }[] = [
  {
    label: 'File',
    items: [
      'file.new',
      'file.newFolder',
      'file.openFolder',
      'workspace.samples',
      '-',
      'file.save',
      'file.saveAll',
      'file.export',
      '-',
      'file.close',
      'file.closeOthers',
      '-',
      'settings.open',
    ],
  },
  {
    label: 'Edit',
    items: [
      'edit.undo',
      'edit.redo',
      '-',
      'edit.find',
      'view.search',
      '-',
      'edit.insertComponent',
      '-',
      'edit.foldAll',
      'edit.unfoldAll',
    ],
  },
  {
    label: 'View',
    items: [
      'palette.commands',
      '-',
      'view.sidebar',
      'view.explorer',
      'view.outline',
      'view.problems',
      '-',
      'view.editor',
      'view.split',
      'view.preview',
      '-',
      'view.zoomIn',
      'view.zoomOut',
      'view.zoomReset',
      '-',
      'settings.theme',
      'settings.wrap',
      'settings.lineNumbers',
      'settings.scrollSync',
    ],
  },
  {
    label: 'Go',
    items: [
      'palette.files',
      'palette.symbols',
      'palette.line',
      '-',
      'view.nextTab',
      'view.previousTab',
    ],
  },
  { label: 'Help', items: ['help.shortcuts', 'help.syntax', 'help.docs', '-', 'help.issue'] },
];

/** Items that only exist in some environments (the samples live in browser storage). */
const HIDDEN_WHEN_UNAVAILABLE = new Set(['workspace.samples']);

export function MenuBar() {
  const { commands } = useWorkbench();
  const [open, setOpen] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const byId = new Map(commands.map((c) => [c.id, c]));

  const topButtons = () => [...(bar.current?.querySelectorAll<HTMLElement>('.menubar-top') ?? [])];
  const menuItems = () => [
    ...(bar.current?.querySelectorAll<HTMLElement>(
      '.menubar-menu [role="menuitem"]:not(:disabled)',
    ) ?? []),
  ];

  const close = (refocus = false) => {
    const index = open;
    setOpen(null);
    if (refocus && index !== null) topButtons()[index]?.focus();
  };

  // Close on outside clicks; Alt (alone) or F10 focuses the menu bar, as in Windows apps.
  useEffect(() => {
    let altAlone = false;
    const onDown = (event: KeyboardEvent) => {
      altAlone = event.key === 'Alt' && !event.repeat;
      if (event.key === 'F10' && !event.shiftKey && !event.ctrlKey) {
        event.preventDefault();
        topButtons()[0]?.focus();
      }
    };
    const onUp = (event: KeyboardEvent) => {
      if (event.key === 'Alt' && altAlone && !document.querySelector('[aria-modal="true"]')) {
        event.preventDefault();
        topButtons()[0]?.focus();
      }
      altAlone = false;
    };
    const onPointer = (event: PointerEvent) => {
      if (!bar.current?.contains(event.target as Node)) setOpen(null);
    };
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, []);

  // Focus the first item when a menu opens from the keyboard.
  const openFromKeyboard = (index: number) => {
    setOpen(index);
    requestAnimationFrame(() => menuItems()[0]?.focus());
  };

  const run = (command: Command) => {
    setOpen(null);
    void command.run();
  };

  const onTopKey = (event: React.KeyboardEvent, index: number) => {
    const count = MENUS.length;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const next = (index + (event.key === 'ArrowRight' ? 1 : count - 1)) % count;
      topButtons()[next]?.focus();
      if (open !== null) openFromKeyboard(next);
    } else if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openFromKeyboard(index);
    } else if (event.key === 'Escape') {
      close();
      (document.querySelector('.cm-content') as HTMLElement | null)?.focus();
    }
  };

  const onMenuKey = (event: React.KeyboardEvent) => {
    const items = menuItems();
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : items.length - 1;
      items[(at + step) % items.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const count = MENUS.length;
      const next = (open! + (event.key === 'ArrowRight' ? 1 : count - 1)) % count;
      topButtons()[next]?.focus();
      openFromKeyboard(next);
    } else if (event.key === 'Tab') {
      close();
    }
  };

  return (
    <div className="menubar" role="menubar" aria-label="Main menu" ref={bar}>
      <span className="menubar-logo">
        <Logo size={14} />
      </span>
      {MENUS.map((menu, index) => (
        <div key={menu.label} className="menubar-entry">
          <button
            type="button"
            role="menuitem"
            className="menubar-top"
            aria-haspopup="menu"
            aria-expanded={open === index}
            onClick={() => setOpen(open === index ? null : index)}
            onPointerEnter={() => open !== null && setOpen(index)}
            onKeyDown={(e) => onTopKey(e, index)}
          >
            {menu.label}
          </button>
          {open === index && (
            <div className="menubar-menu" role="menu" aria-label={menu.label} onKeyDown={onMenuKey}>
              {menu.items.map((id, i) => {
                if (id === '-')
                  return <div key={`-${i}`} className="menu-separator" role="separator" />;
                const command = byId.get(id);
                if (
                  !command ||
                  (HIDDEN_WHEN_UNAVAILABLE.has(id) && command.available?.() === false)
                )
                  return null;
                const shortcut = command.shortcuts?.[0] ?? command.hint;
                return (
                  <button
                    key={id}
                    type="button"
                    role="menuitem"
                    className="menu-item"
                    disabled={command.available?.() === false}
                    onClick={() => run(command)}
                  >
                    <span>{command.title}</span>
                    {shortcut && <span className="menu-shortcut">{formatShortcut(shortcut)}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
