# Changelog

## MarkUP Desktop 0.2.0, VS Code extension 0.2.1

- New logo: app, installer, file and site icons.
- Desktop: a menu bar (File, Edit, View, Go, Help) with every command and its shortcut, sidebar tabs instead of the icon rail, a plain start page, and a gray and navy color scheme with the system UI font. Undo and redo in the Edit menu; Help links to the documentation.
- Documentation site: sidebar navigation, a table of contents per page, search, MarkUP syntax highlighting, rendered results under examples, previous/next links, sitemap and 404 page. New pages for installation, quick start and the syntax (Markdown, directives, attributes, front matter and data).
- Document theme: neutral colors without purple, smaller corner radii.

## 0.1.0

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
