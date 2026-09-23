import { Box, ChevronRight, Hash, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { snippetFor, getSymbols, type DocumentSymbol } from '@markup-lang/language-service';
import { useAppState, useWorkbench } from '../context.ts';
import { editor } from '../editor/controller.ts';
import { flatten, relative } from '../fs/types.ts';
import { fuzzyFilter } from '../lib/fuzzy.ts';
import { formatShortcut } from '../lib/keys.ts';
import type { PaletteMode } from '../state/store.ts';
import { FileIcon } from './Explorer.tsx';

interface Item {
  key: string;
  label: string;
  detail?: string;
  hint?: string;
  icon?: React.ReactNode;
  run: () => void;
}

const PREFIX: Record<string, PaletteMode> = { '>': 'commands', '@': 'symbols', ':': 'line' };
const PLACEHOLDER: Record<PaletteMode, string> = {
  files: 'Go to file — type > for commands, @ for headings, : for a line',
  commands: 'Type a command',
  symbols: 'Go to a heading or component',
  line: 'Type a line number',
  components: 'Insert a component',
};

export function Palette() {
  const palette = useAppState((s) => s.palette);
  if (!palette) return null;
  return <PaletteDialog mode={palette.mode} initialQuery={palette.query} />;
}

function PaletteDialog({ mode: initialMode, initialQuery }: { mode: PaletteMode; initialQuery: string }) {
  const { wb, commands } = useWorkbench();
  const tree = useAppState((s) => s.tree);
  const root = useAppState((s) => s.workspace?.root ?? '');
  const active = useAppState((s) => s.active);
  const content = useAppState((s) => (s.active ? s.docs[s.active]?.content : undefined));
  const prefix = initialMode === 'commands' ? '>' : initialMode === 'symbols' ? '@' : initialMode === 'line' ? ':' : '';
  const [input, setInput] = useState(prefix + initialQuery);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const mode: PaletteMode = initialMode === 'components' ? 'components' : (PREFIX[input[0] ?? ''] ?? 'files');
  const query = mode === 'files' || mode === 'components' ? input : input.slice(1);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const close = () => wb.closePalette();
  const runAndClose = (run: () => void) => {
    close();
    // Let the palette unmount before moving focus (e.g. into the editor).
    requestAnimationFrame(run);
  };

  const items = useMemo((): { item: Item; indices: number[] }[] => {
    switch (mode) {
      case 'commands': {
        const list = commands.filter((c) => c.available?.() ?? true);
        return fuzzyFilter(query, list, (c) => `${c.category}: ${c.title}`).map(({ item: c, match }) => ({
          item: { key: c.id, label: `${c.category}: ${c.title}`, hint: c.shortcuts?.[0] ? formatShortcut(c.shortcuts[0]) : undefined, run: () => void c.run() },
          indices: match.indices,
        }));
      }
      case 'files': {
        const files = flatten(tree).filter((e) => e.kind === 'file');
        return fuzzyFilter(query, files, (f) => relative(root, f.path)).map(({ item: f, match }) => ({
          item: { key: f.path, label: relative(root, f.path), icon: <FileIcon name={f.name} />, run: () => void wb.openFile(f.path) },
          indices: match.indices,
        }));
      }
      case 'symbols': {
        if (!active || content === undefined) return [];
        const flat: DocumentSymbol[] = [];
        const walk = (list: DocumentSymbol[]) => list.forEach((s) => (s.kind !== 'frontMatter' && flat.push(s), walk(s.children)));
        walk(getSymbols(wb.service.analyze(content, active)));
        return fuzzyFilter(query, flat, (s) => s.name).map(({ item: s, match }) => ({
          item: {
            key: `${s.from}`,
            label: s.name,
            hint: s.kind === 'heading' ? s.detail : undefined,
            icon: s.kind === 'component' ? <Box size={14} className="outline-icon is-component" /> : <Hash size={14} className="outline-icon" />,
            run: () => editor.select(s.selectionFrom),
          },
          indices: match.indices,
        }));
      }
      case 'line': {
        const [line, column] = query.split(/[:,]/).map((n) => parseInt(n, 10));
        if (!line) return [{ item: { key: 'hint', label: 'Type a line number, optionally :column', run: () => {} }, indices: [] }];
        return [{ item: { key: 'go', label: `Go to line ${line}${column ? `, column ${column}` : ''}`, icon: <ChevronRight size={14} />, run: () => editor.gotoLine(line, column || 1) }, indices: [] }];
      }
      case 'components': {
        const specs = wb.service.registry.list();
        return fuzzyFilter(query, specs, (s) => s.name).map(({ item: spec, match }) => {
          const form = spec.forms[0]!;
          const syntax = form === 'container' ? ':::' : form === 'leaf' ? '::' : ':';
          return {
            item: {
              key: spec.name,
              label: spec.name,
              detail: spec.description,
              hint: `${syntax}${spec.name}`,
              icon: <Box size={14} className="outline-icon is-component" />,
              run: () => editor.insertSnippet(snippetFor(spec, form, syntax, ''), form !== 'inline'),
            },
            indices: match.indices,
          };
        });
      }
    }
  }, [mode, query, commands, tree, root, active, content, wb]);

  useEffect(() => setSelected(0), [input]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-label="Command palette">
        <div className="palette-input">
          <Search size={16} />
          <input
            ref={inputRef}
            value={input}
            placeholder={PLACEHOLDER[mode]}
            spellCheck={false}
            aria-controls="palette-list"
            aria-activedescendant={items[selected] ? `palette-${selected}` : undefined}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') close();
              else if (event.key === 'ArrowDown') {
                event.preventDefault();
                setSelected((i) => Math.min(i + 1, items.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setSelected((i) => Math.max(i - 1, 0));
              } else if (event.key === 'Enter') {
                const item = items[selected]?.item;
                if (item) runAndClose(item.run);
              }
            }}
          />
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {items.length === 0 && <p className="palette-empty">No matches</p>}
          {items.map(({ item, indices }, i) => (
            <div
              key={item.key}
              id={`palette-${i}`}
              role="option"
              aria-selected={i === selected}
              className="palette-item"
              onMouseMove={() => setSelected(i)}
              onClick={() => runAndClose(item.run)}
            >
              {item.icon && <span className="palette-icon">{item.icon}</span>}
              <span className="palette-text">
                <span className="palette-label">
                  <Highlighted text={item.label} indices={indices} />
                </span>
                {item.detail && <span className="palette-detail">{item.detail}</span>}
              </span>
              {item.hint && <kbd className="palette-hint">{item.hint}</kbd>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Highlighted({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) return <>{text}</>;
  const set = new Set(indices);
  return (
    <>
      {[...text].map((ch, i) => (set.has(i) ? <b key={i}>{ch}</b> : <span key={i}>{ch}</span>))}
    </>
  );
}
