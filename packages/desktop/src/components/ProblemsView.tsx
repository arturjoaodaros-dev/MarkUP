import { CircleX, Info, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Diagnostic } from '@markup-lang/core';
import { useAppState, useWorkbench } from '../context.ts';
import { editor } from '../editor/controller.ts';
import { relative } from '../fs/types.ts';
import { FileIcon } from './Explorer.tsx';
import { PanelHeader } from './Sidebar.tsx';

export function ProblemsView() {
  const { wb } = useWorkbench();
  const problems = useAppState((s) => s.problems);
  const docs = useAppState((s) => s.docs);
  const root = useAppState((s) => s.workspace?.root ?? '');
  const [details, setDetails] = useState<{ path: string; diagnostics: Diagnostic[] }[]>([]);

  const files = Object.entries(problems)
    .filter(([, p]) => p.errors + p.warnings > 0)
    .map(([path]) => path)
    .sort();
  const filesKey = files.join('|');

  // Full diagnostics: live buffers for open documents, disk content for the rest.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const out: { path: string; diagnostics: Diagnostic[] }[] = [];
      for (const path of filesKey ? filesKey.split('|') : []) {
        let text: string;
        try {
          text = docs[path]?.content ?? (await wb.fs.readText(path));
        } catch {
          continue;
        }
        const diagnostics = wb.service
          .analyze(text, docs[path] ? path : `problems:${path}`)
          .diagnostics.filter((d) => d.severity === 'error' || d.severity === 'warning');
        if (diagnostics.length) out.push({ path, diagnostics });
      }
      if (!cancelled) setDetails(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [filesKey, docs, wb]);

  return (
    <section className="panel" aria-label="Problems">
      <PanelHeader title="Problems" />
      <div className="results">
        {details.length === 0 && <p className="panel-empty">No problems in this workspace.</p>}
        {details.map(({ path, diagnostics }) => (
          <div key={path}>
            <div className="result-file is-static">
              <FileIcon name={path} />
              <span className="tree-label">{relative(root, path)}</span>
              <span className="result-count">{diagnostics.length}</span>
            </div>
            {diagnostics.map((d, i) => (
              <button
                key={i}
                type="button"
                className="problem-row"
                onClick={async () => {
                  await wb.openFile(path);
                  requestAnimationFrame(() =>
                    editor.select(d.range.start.offset, d.range.end.offset),
                  );
                }}
              >
                {d.severity === 'error' ? (
                  <CircleX size={14} className="sev-error" />
                ) : d.severity === 'warning' ? (
                  <TriangleAlert size={14} className="sev-warning" />
                ) : (
                  <Info size={14} className="sev-info" />
                )}
                <span className="problem-text">
                  <span className="problem-message">{d.message}</span>
                  <span className="problem-meta">
                    {d.code} · Ln {d.range.start.line}, Col {d.range.start.column}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
