# Changelog

## 0.1.0 — unreleased

MarkUP was rebuilt from scratch.

### Language

- Markdown base: headings (with `{#id .class}` attributes), paragraphs, emphasis, strong, strikethrough, code spans, fenced code with info attributes, block quotes, ordered, bullet and task lists, GFM tables, links, images with attributes, reference links, autolinks, bare URLs, footnotes, comments, front matter.
- Directives in three forms (`:::`, `::`, `:`) with labels and attributes, fence-length-aware nesting and precise closing rules.
- Content models (`flow`, `data`, `raw`) and MarkUP Data, a strict YAML subset.
- Built-in components: note, tip, important, warning, caution, card, columns, column, tabs, tab, details, figure, chart, toc, progress, badge, kbd, abbr.
- Diagnostics with stable codes, positions and fixes; validation against typed component specs.
- A formal specification.

### Tools

- `@markup-lang/core`, `@markup-lang/html`, `@markup-lang/text` libraries.
- `markup` CLI: render, build (with watch), check (pretty and JSON), live preview, component reference, plugins and config.
- Language service and LSP server.
- VS Code extension: diagnostics and quick fixes, completion, hover, outline, folding, navigation, semantic highlighting, live preview with scroll sync, HTML export.
- MarkUP Desktop (Tauri + React + CodeMirror): explorer, tabs, live preview with scroll sync, command palette, search, outline, problems, settings, light and dark themes.
