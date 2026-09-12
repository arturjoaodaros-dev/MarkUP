import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useAppStore } from '../state/appStore';

interface Command {
  id: string;
  title: string;
  run: () => void;
}

/**
 * Paleta de comandos própria (missão §15) — não copia visualmente o VS
 * Code, segue o mesmo vocabulário visual dos outros overlays do app. Só
 * comandos reais, ligados a ações que já existem (missão §17/§46: nunca
 * listar algo que não funciona).
 */
export function CommandPalette() {
  const isOpen = useAppStore((s) => s.isCommandPaletteOpen);
  const setOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const setNewDocumentDialogOpen = useAppStore((s) => s.setNewDocumentDialogOpen);
  const setSearchOpen = useAppStore((s) => s.setSearchOpen);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const themePreference = useAppStore((s) => s.themePreference);
  const setThemePreference = useAppStore((s) => s.setThemePreference);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const togglePreview = useAppStore((s) => s.togglePreview);
  const requestCloseTab = useAppStore((s) => s.requestCloseTab);
  const saveTab = useAppStore((s) => s.saveTab);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const hasWorkspace = useAppStore((s) => s.workspace !== null);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const openFolderPicker = useAppStore((s) => s.openFolderPicker);

  const commands = useMemo<Command[]>(() => {
    const themeOrder: Array<typeof themePreference> = ['dark', 'light', 'system'];
    const cycleTheme = () => {
      const next = themeOrder[(themeOrder.indexOf(themePreference) + 1) % themeOrder.length];
      setThemePreference(next);
    };

    const list: Command[] = [
      { id: 'open-folder', title: 'Abrir Pasta...', run: () => void openFolderPicker() },
      { id: 'toggle-sidebar', title: 'Alternar Sidebar', run: toggleSidebar },
      { id: 'cycle-theme', title: 'Alternar Tema (Escuro/Claro/Sistema)', run: cycleTheme },
      { id: 'settings', title: 'Abrir Configurações', run: () => setSettingsOpen(true) },
    ];
    if (hasWorkspace) {
      list.push({ id: 'new-document', title: 'Novo Documento...', run: () => setNewDocumentDialogOpen(true) });
      list.push({ id: 'search', title: 'Buscar Documentos', run: () => setSearchOpen(true) });
      list.push({ id: 'toggle-preview', title: 'Alternar Preview', run: togglePreview });
    }
    if (activeTabId) {
      list.push({ id: 'save', title: 'Salvar', run: () => void saveTab(activeTabId) });
      list.push({ id: 'close-tab', title: 'Fechar Aba', run: () => requestCloseTab(activeTabId) });
    }
    return list;
  }, [
    activeTabId,
    hasWorkspace,
    openFolderPicker,
    requestCloseTab,
    saveTab,
    setNewDocumentDialogOpen,
    setSearchOpen,
    setSettingsOpen,
    setThemePreference,
    themePreference,
    toggleSidebar,
    togglePreview,
  ]);

  const filtered = useMemo(
    () => commands.filter((c) => c.title.toLowerCase().includes(query.toLowerCase())),
    [commands, query],
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  useEffect(() => setSelectedIndex(0), [query]);

  if (!isOpen) return null;

  function execute(index: number) {
    const command = filtered[index];
    if (!command) return;
    setOpen(false);
    command.run();
  }

  return (
    <div className="mkd-overlay-backdrop" onClick={() => setOpen(false)}>
      <div className="mkd-overlay-panel" onClick={(e) => e.stopPropagation()}>
        <div className="mkd-overlay-input-row">
          <Search size={16} />
          <input
            ref={inputRef}
            className="mkd-overlay-input"
            placeholder="Digite um comando..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              else if (e.key === 'ArrowDown') setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
              else if (e.key === 'ArrowUp') setSelectedIndex((i) => Math.max(i - 1, 0));
              else if (e.key === 'Enter') execute(selectedIndex);
            }}
          />
        </div>
        <div className="mkd-overlay-list">
          {filtered.map((c, i) => (
            <div key={c.id} className="mkd-overlay-item" data-selected={i === selectedIndex} onClick={() => execute(i)}>
              {c.title}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
