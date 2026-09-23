/**
 * The MarkUP document theme. Scoped to `.markup-body`, light and dark via
 * `prefers-color-scheme` or an explicit `data-theme` on any ancestor. Shared by
 * CLI builds, the VS Code preview and the desktop preview.
 */
export const MARKUP_CSS = `
.markup-body {
  --mu-bg: #ffffff;
  --mu-fg: #1f2328;
  --mu-muted: #5b6370;
  --mu-subtle: #f5f6f8;
  --mu-border: #e2e5ea;
  --mu-accent: #4f46e5;
  --mu-code-bg: #f3f4f6;
  --mu-note: #2563eb;
  --mu-tip: #16a34a;
  --mu-important: #7c3aed;
  --mu-warning: #b45309;
  --mu-caution: #dc2626;
  --mu-chart-1: #4f46e5; --mu-chart-2: #0891b2; --mu-chart-3: #f59e0b; --mu-chart-4: #db2777;
  --mu-chart-5: #16a34a; --mu-chart-6: #7c3aed; --mu-chart-7: #ea580c; --mu-chart-8: #64748b;
  --mu-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif;
  --mu-mono: ui-monospace, "JetBrains Mono", "Cascadia Code", "SF Mono", Menlo, Consolas, monospace;
  color: var(--mu-fg);
  background: var(--mu-bg);
  font: 16px/1.65 var(--mu-font);
  max-width: 780px;
  margin: 0 auto;
  padding: 40px 28px 80px;
  word-wrap: break-word;
  -webkit-font-smoothing: antialiased;
}
.markup-body[data-theme="dark"], [data-theme="dark"] .markup-body {
  --mu-bg: #16181d; --mu-fg: #e6e8ec; --mu-muted: #9aa3b0; --mu-subtle: #1d2027; --mu-border: #2c313a;
  --mu-accent: #8b85ff; --mu-code-bg: #1f232b; --mu-note: #60a5fa; --mu-tip: #4ade80; --mu-important: #a78bfa;
  --mu-warning: #fbbf24; --mu-caution: #f87171;
  --mu-chart-1: #8b85ff; --mu-chart-2: #22d3ee; --mu-chart-3: #fbbf24; --mu-chart-4: #f472b6;
  --mu-chart-5: #4ade80; --mu-chart-6: #c084fc; --mu-chart-7: #fb923c; --mu-chart-8: #94a3b8;
}
@media (prefers-color-scheme: dark) {
  .markup-body:not([data-theme="light"]):not([data-theme="light"] *) {
    --mu-bg: #16181d; --mu-fg: #e6e8ec; --mu-muted: #9aa3b0; --mu-subtle: #1d2027; --mu-border: #2c313a;
    --mu-accent: #8b85ff; --mu-code-bg: #1f232b; --mu-note: #60a5fa; --mu-tip: #4ade80; --mu-important: #a78bfa;
    --mu-warning: #fbbf24; --mu-caution: #f87171;
    --mu-chart-1: #8b85ff; --mu-chart-2: #22d3ee; --mu-chart-3: #fbbf24; --mu-chart-4: #f472b6;
    --mu-chart-5: #4ade80; --mu-chart-6: #c084fc; --mu-chart-7: #fb923c; --mu-chart-8: #94a3b8;
  }
}
.markup-body > :first-child { margin-top: 0; }
.markup-body :where(p, ul, ol, blockquote, pre, table, figure, details, aside, .mu-table, .mu-columns, .mu-tabs, .mu-card, .mu-toc, .mu-code-block) { margin: 0 0 1.1em; }
.markup-body :where(h1, h2, h3, h4, h5, h6) { position: relative; line-height: 1.25; font-weight: 650; letter-spacing: -0.015em; margin: 1.8em 0 0.6em; }
.markup-body h1 { font-size: 2.1em; margin-top: 0.4em; }
.markup-body h2 { font-size: 1.5em; padding-bottom: 0.25em; border-bottom: 1px solid var(--mu-border); }
.markup-body h3 { font-size: 1.22em; }
.markup-body h4 { font-size: 1.05em; }
.markup-body :where(h5, h6) { font-size: 0.95em; color: var(--mu-muted); }
.markup-body .mu-anchor { margin-left: 0.35em; color: var(--mu-muted); text-decoration: none; opacity: 0; font-weight: 400; }
.markup-body :where(h1, h2, h3, h4, h5, h6):hover .mu-anchor { opacity: 1; }
.markup-body a { color: var(--mu-accent); text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--mu-accent) 35%, transparent); text-underline-offset: 2px; }
.markup-body a:hover { text-decoration-color: currentColor; }
.markup-body strong { font-weight: 650; }
.markup-body del { color: var(--mu-muted); }
.markup-body hr { border: 0; border-top: 1px solid var(--mu-border); margin: 2em 0; }
.markup-body img { max-width: 100%; height: auto; border-radius: 6px; }
.markup-body :where(ul, ol) { padding-left: 1.6em; }
.markup-body li + li { margin-top: 0.25em; }
.markup-body li > :where(ul, ol) { margin: 0.25em 0 0; }
.markup-body ul.mu-tasks { list-style: none; padding-left: 0.4em; }
.markup-body .mu-task > input { margin: 0 0.45em 0 0; vertical-align: -1px; accent-color: var(--mu-accent); }
.markup-body blockquote { padding: 0.1em 1em; color: var(--mu-muted); border-left: 3px solid var(--mu-border); }
.markup-body code, .markup-body kbd, .markup-body pre { font-family: var(--mu-mono); font-size: 0.88em; }
.markup-body :not(pre) > code { background: var(--mu-code-bg); padding: 0.15em 0.4em; border-radius: 5px; }
.markup-body pre { background: var(--mu-code-bg); padding: 14px 16px; border-radius: 8px; overflow-x: auto; line-height: 1.55; }
.markup-body pre code { font-size: inherit; background: none; padding: 0; }
.markup-body .mu-code-block { border: 1px solid var(--mu-border); border-radius: 8px; overflow: hidden; }
.markup-body .mu-code-block figcaption { padding: 7px 14px; font: 500 0.8em var(--mu-mono); color: var(--mu-muted); border-bottom: 1px solid var(--mu-border); background: var(--mu-subtle); }
.markup-body .mu-code-block pre { margin: 0; border-radius: 0; }
.markup-body .mu-table { overflow-x: auto; }
.markup-body table { border-collapse: collapse; width: max-content; max-width: 100%; margin: 0; }
.markup-body :where(th, td) { border: 1px solid var(--mu-border); padding: 6px 12px; text-align: left; }
.markup-body th { background: var(--mu-subtle); font-weight: 600; }
.markup-body .mu-fnref a { text-decoration: none; font-size: 0.8em; }
.markup-body .mu-footnotes { font-size: 0.9em; color: var(--mu-muted); margin-top: 3em; }
.markup-body .mu-backref { text-decoration: none; }
.markup-body .mu-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.markup-body .mu-icon { flex: none; }
.markup-body .mu-error { color: var(--mu-caution); border: 1px dashed var(--mu-caution); border-radius: 6px; padding: 8px 12px; font-size: 0.9em; }

/* Callouts */
.markup-body .mu-callout { --c: var(--mu-note); border: 1px solid color-mix(in srgb, var(--c) 30%, var(--mu-border)); border-left: 3px solid var(--c); background: color-mix(in srgb, var(--c) 6%, var(--mu-bg)); border-radius: 8px; padding: 12px 16px; }
.markup-body .mu-callout-tip { --c: var(--mu-tip); }
.markup-body .mu-callout-important { --c: var(--mu-important); }
.markup-body .mu-callout-warning { --c: var(--mu-warning); }
.markup-body .mu-callout-caution { --c: var(--mu-caution); }
.markup-body .mu-callout-title { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; font-weight: 600; color: var(--c); }
.markup-body summary.mu-callout-title { cursor: pointer; margin: 0; list-style: none; }
.markup-body summary.mu-callout-title::-webkit-details-marker { display: none; }
.markup-body summary.mu-callout-title::after { content: ""; margin-left: auto; width: 7px; height: 7px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(-45deg); transition: transform 0.15s; }
.markup-body details[open] > summary.mu-callout-title::after { transform: rotate(45deg); }
.markup-body details[open] > summary.mu-callout-title { margin-bottom: 6px; }
.markup-body .mu-callout-body > :last-child { margin-bottom: 0; }

/* Cards and columns */
.markup-body .mu-card { border: 1px solid var(--mu-border); border-radius: 10px; padding: 16px 18px; background: var(--mu-bg); }
.markup-body .mu-card-title { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; font-weight: 600; }
.markup-body .mu-card-title a { text-decoration: none; }
.markup-body .mu-card-body > :last-child { margin-bottom: 0; }
.markup-body .mu-columns { display: flex; gap: 20px; align-items: stretch; }
.markup-body .mu-columns[data-gap="none"] { gap: 0; }
.markup-body .mu-columns[data-gap="small"] { gap: 10px; }
.markup-body .mu-columns[data-gap="large"] { gap: 32px; }
.markup-body .mu-columns[data-align="start"] { align-items: flex-start; }
.markup-body .mu-columns[data-align="center"] { align-items: center; }
.markup-body .mu-columns[data-align="end"] { align-items: flex-end; }
.markup-body .mu-column { flex: var(--mu-span, 1) 1 0; min-width: 0; }
.markup-body .mu-column > :last-child, .markup-body .mu-column > .mu-card { margin-bottom: 0; }
.markup-body .mu-column > .mu-card { height: 100%; box-sizing: border-box; }
@media (max-width: 640px) { .markup-body .mu-columns { flex-direction: column; } }

/* Tabs (CSS only) */
.markup-body .mu-tabs { display: flex; flex-wrap: wrap; border: 1px solid var(--mu-border); border-radius: 10px; overflow: hidden; }
.markup-body .mu-tab-input { position: absolute; opacity: 0; pointer-events: none; }
.markup-body .mu-tab-label { order: 0; padding: 9px 16px; font-size: 0.9em; font-weight: 500; color: var(--mu-muted); cursor: pointer; border-bottom: 2px solid transparent; background: var(--mu-subtle); }
.markup-body .mu-tab-label:hover { color: var(--mu-fg); }
.markup-body .mu-tab-input:checked + .mu-tab-label { color: var(--mu-fg); border-bottom-color: var(--mu-accent); background: var(--mu-bg); }
.markup-body .mu-tab-input:focus-visible + .mu-tab-label { outline: 2px solid var(--mu-accent); outline-offset: -2px; }
.markup-body .mu-tab-panel { order: 1; width: 100%; display: none; padding: 16px 18px 4px; border-top: 1px solid var(--mu-border); }
.markup-body .mu-tab-input:checked + .mu-tab-label + .mu-tab-panel { display: block; }
.markup-body .mu-tab-panel > pre:only-child { margin: -16px -18px -4px; border-radius: 0; }
.markup-body .mu-tab-orphan { display: block; border: 1px dashed var(--mu-border); border-radius: 8px; }
.markup-body .mu-tab-orphan-title { font-weight: 600; }

/* Details and figures */
.markup-body .mu-details { border: 1px solid var(--mu-border); border-radius: 8px; padding: 10px 16px; }
.markup-body .mu-details > summary { cursor: pointer; font-weight: 600; }
.markup-body .mu-details[open] > summary { margin-bottom: 8px; }
.markup-body .mu-details-body > :last-child { margin-bottom: 0; }
.markup-body .mu-figure { text-align: center; }
.markup-body .mu-figure[data-align="left"] { text-align: left; }
.markup-body .mu-figure[data-align="right"] { text-align: right; }
.markup-body .mu-figure > :where(p, pre) { margin-bottom: 0.5em; }
.markup-body figcaption { font-size: 0.88em; color: var(--mu-muted); }

/* Table of contents */
.markup-body .mu-toc { border-left: 2px solid var(--mu-border); padding: 2px 0 2px 16px; font-size: 0.93em; }
.markup-body .mu-toc-title { font-weight: 600; margin: 0 0 6px; }
.markup-body .mu-toc ul { list-style: none; padding-left: 0; margin: 0; }
.markup-body .mu-toc ul ul { padding-left: 14px; }
.markup-body .mu-toc a { text-decoration: none; color: var(--mu-muted); }
.markup-body .mu-toc a:hover { color: var(--mu-accent); }

/* Progress, badges, keys */
.markup-body .mu-progress { --c: var(--mu-accent); display: flex; align-items: center; gap: 10px; font-size: 0.92em; }
.markup-body span.mu-progress { display: inline-flex; vertical-align: middle; min-width: 160px; }
.markup-body .mu-progress[data-variant="success"] { --c: var(--mu-tip); }
.markup-body .mu-progress[data-variant="warning"] { --c: var(--mu-warning); }
.markup-body .mu-progress[data-variant="danger"] { --c: var(--mu-caution); }
.markup-body .mu-progress-track { flex: 1; height: 8px; border-radius: 99px; background: var(--mu-subtle); border: 1px solid var(--mu-border); overflow: hidden; display: block; min-width: 60px; }
.markup-body .mu-progress-bar { display: block; height: 100%; background: var(--c); border-radius: 99px; }
.markup-body .mu-progress-value { color: var(--mu-muted); font-variant-numeric: tabular-nums; }
.markup-body .mu-badge { --c: var(--mu-muted); display: inline-block; padding: 0.05em 0.55em; border-radius: 99px; font-size: 0.78em; font-weight: 600; line-height: 1.6; vertical-align: 0.1em; color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); border: 1px solid color-mix(in srgb, var(--c) 30%, transparent); }
.markup-body .mu-badge[data-variant="info"] { --c: var(--mu-note); }
.markup-body .mu-badge[data-variant="success"] { --c: var(--mu-tip); }
.markup-body .mu-badge[data-variant="warning"] { --c: var(--mu-warning); }
.markup-body .mu-badge[data-variant="danger"] { --c: var(--mu-caution); }
.markup-body kbd.mu-kbd { font-size: 0.85em; }
.markup-body kbd.mu-kbd kbd { display: inline-block; padding: 0.1em 0.45em; border: 1px solid var(--mu-border); border-bottom-width: 2px; border-radius: 5px; background: var(--mu-subtle); font-size: 0.95em; line-height: 1.3; }
.markup-body abbr[title] { text-decoration: underline dotted; cursor: help; }

/* Charts */
.markup-body .mu-chart { margin-left: 0; margin-right: 0; }
.markup-body .mu-chart-title { font-weight: 600; color: var(--mu-fg); font-size: 0.95em; margin-bottom: 8px; }
.markup-body .mu-chart-svg { display: block; overflow: visible; font-family: var(--mu-font); }
.markup-body .mu-chart-pie { max-width: 100%; height: auto; margin: 0 auto; }
.markup-body .mu-chart-grid { stroke: var(--mu-border); stroke-width: 1; }
.markup-body .mu-chart-zero { stroke: var(--mu-muted); stroke-opacity: 0.5; }
.markup-body .mu-chart-tick, .markup-body .mu-chart-label { fill: var(--mu-muted); font-size: 13px; }
.markup-body .mu-chart-area { fill-opacity: 0.16; }
.markup-body .mu-chart-hole { fill: var(--mu-bg); }
.markup-body .mu-chart-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 16px; list-style: none; padding: 0; margin: 10px 0 0; font-size: 0.85em; color: var(--mu-muted); }
.markup-body .mu-chart-legend li { display: inline-flex; align-items: center; gap: 6px; margin: 0; }
${Array.from({ length: 8 }, (_, i) => `.markup-body .mu-f${i + 1} { fill: var(--mu-chart-${i + 1}); } .markup-body .mu-s${i + 1} { stroke: var(--mu-chart-${i + 1}); }`).join('\n')}

/* Unknown components and unsafe content */
.markup-body .mu-directive { border: 1px dashed var(--mu-border); border-radius: 8px; padding: 10px 14px; }
.markup-body span.mu-directive { padding: 0 4px; border-radius: 4px; }
.markup-body .mu-directive-label { font-weight: 600; margin-bottom: 6px; }
.markup-body .mu-unsafe-link { text-decoration: line-through; }
`.trim();
