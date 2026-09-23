import { CaseSensitive, ChevronRight, Regex, WholeWord } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAppState, useWorkbench } from '../context.ts';
import { editor } from '../editor/controller.ts';
import { flatten, relative } from '../fs/types.ts';
import { FileIcon, IconButton } from './Explorer.tsx';
import { PanelHeader } from './Sidebar.tsx';

const SEARCHABLE = /\.(markup|mkup|md|txt|json|css|html|ya?ml)$/i;
const MAX_RESULTS = 2000;

interface Hit {
  line: number;
  column: number;
  from: number;
  to: number;
  preview: string;
  matchStart: number;
  matchEnd: number;
}

export function SearchView() {
  const { wb } = useWorkbench();
  const query = useAppState((s) => s.searchQuery);
  const tree = useAppState((s) => s.tree);
  const root = useAppState((s) => s.workspace?.root ?? '');
  const [options, setOptions] = useState({ caseSensitive: false, regex: false, wholeWord: false });
  const [results, setResults] = useState<{ path: string; hits: Hit[] }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!query) {
        setResults([]);
        setError(null);
        return;
      }
      let pattern: RegExp;
      try {
        const source = options.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        pattern = new RegExp(options.wholeWord ? `\\b(?:${source})\\b` : source, options.caseSensitive ? 'g' : 'gi');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return;
      }
      setError(null);
      const files = flatten(tree).filter((e) => e.kind === 'file' && SEARCHABLE.test(e.name));
      const found: { path: string; hits: Hit[] }[] = [];
      let total = 0;
      for (const file of files) {
        if (cancelled || total >= MAX_RESULTS) break;
        let text: string;
        try {
          text = wb.state.docs[file.path]?.content ?? (await wb.fs.readText(file.path));
        } catch {
          continue;
        }
        const hits: Hit[] = [];
        const lines = text.split(/\r\n|\r|\n/);
        let offset = 0;
        lines.forEach((lineText, i) => {
          pattern.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = pattern.exec(lineText)) && total < MAX_RESULTS) {
            if (m[0].length === 0) {
              pattern.lastIndex++;
              continue;
            }
            const start = Math.max(0, m.index - 30);
            hits.push({
              line: i + 1,
              column: m.index + 1,
              from: offset + m.index,
              to: offset + m.index + m[0].length,
              preview: (start > 0 ? '…' : '') + lineText.slice(start, m.index + m[0].length + 80),
              matchStart: m.index - start + (start > 0 ? 1 : 0),
              matchEnd: m.index - start + (start > 0 ? 1 : 0) + m[0].length,
            });
            total++;
          }
          offset += lineText.length + 1;
        });
        if (hits.length) found.push({ path: file.path, hits });
      }
      if (!cancelled) setResults(found);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, options, tree, wb]);

  const count = results.reduce((n, r) => n + r.hits.length, 0);
  const toggle = (key: keyof typeof options) => setOptions((o) => ({ ...o, [key]: !o[key] }));

  return (
    <section className="panel" aria-label="Search">
      <PanelHeader title="Search" />
      <div className="search-box">
        <input
          ref={input}
          className="text-input"
          placeholder="Search in files"
          value={query}
          spellCheck={false}
          onChange={(e) => wb.store.set({ searchQuery: e.target.value })}
        />
        <div className="search-options">
          <IconButton label="Match case" active={options.caseSensitive} onClick={() => toggle('caseSensitive')}>
            <CaseSensitive size={15} />
          </IconButton>
          <IconButton label="Whole word" active={options.wholeWord} onClick={() => toggle('wholeWord')}>
            <WholeWord size={15} />
          </IconButton>
          <IconButton label="Regular expression" active={options.regex} onClick={() => toggle('regex')}>
            <Regex size={15} />
          </IconButton>
        </div>
      </div>
      {error && <p className="panel-note is-error">{error}</p>}
      {query && !error && (
        <p className="panel-note">
          {count === 0 ? 'No results.' : `${count}${count >= MAX_RESULTS ? '+' : ''} result${count === 1 ? '' : 's'} in ${results.length} file${results.length === 1 ? '' : 's'}`}
        </p>
      )}
      <div className="results">
        {results.map(({ path, hits }) => (
          <div key={path}>
            <button type="button" className="result-file" onClick={() => setCollapsed((c) => ({ ...c, [path]: !c[path] }))}>
              <ChevronRight size={14} className={`tree-chevron${collapsed[path] ? '' : ' is-open'}`} />
              <FileIcon name={path} />
              <span className="tree-label">{relative(root, path)}</span>
              <span className="result-count">{hits.length}</span>
            </button>
            {!collapsed[path] &&
              hits.map((hit, i) => (
                <button
                  key={i}
                  type="button"
                  className="result-line"
                  title={`Line ${hit.line}`}
                  onClick={async () => {
                    await wb.openFile(path);
                    requestAnimationFrame(() => editor.select(hit.from, hit.to));
                  }}
                >
                  <span className="result-text">
                    {hit.preview.slice(0, hit.matchStart)}
                    <mark>{hit.preview.slice(hit.matchStart, hit.matchEnd)}</mark>
                    {hit.preview.slice(hit.matchEnd)}
                  </span>
                  <span className="result-line-number">{hit.line}</span>
                </button>
              ))}
          </div>
        ))}
      </div>
    </section>
  );
}
