import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import { useAppStore } from '../state/appStore';
import { search as searchIndex } from '../state/workspaceIndex';

/** Busca por nome de arquivo (conteúdo/heading fica pra uma fase futura — mesma decisão de escopo da Etapa 2 em WPF). */
export function SearchDialog() {
  const isOpen = useAppStore((s) => s.isSearchOpen);
  const setOpen = useAppStore((s) => s.setSearchOpen);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const workspace = useAppStore((s) => s.workspace);
  const openDocument = useAppStore((s) => s.openDocument);

  const results = useMemo(
    () => (workspace ? searchIndex(workspace, searchQuery) : []),
    [workspace, searchQuery],
  );

  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  useEffect(() => setSelectedIndex(0), [searchQuery]);

  if (!isOpen) return null;

  function pick(index: number) {
    const node = results[index];
    if (!node) return;
    setOpen(false);
    void openDocument(node.path);
  }

  return (
    <div className="mkd-overlay-backdrop" onClick={() => setOpen(false)}>
      <div className="mkd-overlay-panel" onClick={(e) => e.stopPropagation()}>
        <div className="mkd-overlay-input-row">
          <Search size={16} />
          <input
            ref={inputRef}
            className="mkd-overlay-input"
            placeholder="Buscar documento por nome..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              else if (e.key === 'ArrowDown') setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
              else if (e.key === 'ArrowUp') setSelectedIndex((i) => Math.max(i - 1, 0));
              else if (e.key === 'Enter') pick(selectedIndex);
            }}
          />
        </div>
        <div className="mkd-overlay-list">
          {results.map((node, i) => (
            <div key={node.path} className="mkd-overlay-item" data-selected={i === selectedIndex} onClick={() => pick(i)}>
              <FileText size={14} />
              {node.name}
            </div>
          ))}
        </div>
        <div className="mkd-overlay-hint">Busca por nome de arquivo — conteúdo/heading ainda não é indexado.</div>
      </div>
    </div>
  );
}
