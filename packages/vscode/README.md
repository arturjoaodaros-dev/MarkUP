# MarkUP for Visual Studio Code

Language support for [MarkUP](https://github.com/arturjoaodaros-dev/MarkUP) — Markdown with components — in `.markup` and `.mkup` files.

## Features

- **Live preview** (`Ctrl+Shift+V`, or `Ctrl+K V` to the side) that updates as you type, keeps its scroll position in sync with the editor, follows your color theme and jumps to the source on double-click.
- **Diagnostics** from the real MarkUP parser: unclosed components, unknown components and attributes, invalid chart data, broken `#anchors`, undefined footnotes — each with line and column, and quick fixes where one is obvious.
- **Completion** for components after `:::`, `::` and `:`, their attributes and values, the keys of chart data bodies, heading anchors after `](#`, footnote labels and code-fence languages.
- **Hover** documentation for components, attributes and data keys.
- **Outline**, breadcrumbs and folding for headings, components, code blocks and front matter.
- **Go to definition** for `#anchor` links, reference links and footnotes.
- **Commands**: *MarkUP: Export to HTML…*, *Insert Component…* (`Ctrl+Alt+I`), *Show Component Reference*, *Restart Language Server*.

## Plugins

If your workspace has a `markup.config.json` with `"plugins"`, the extension loads them for diagnostics, completion and the preview — only in [trusted workspaces](https://code.visualstudio.com/docs/editor/workspace-trust), since plugins are code.

## Settings

| Setting | Default | |
|---|---|---|
| `markup.preview.scrollSync` | `true` | Keep editor and preview scrolled together. |
| `markup.preview.theme` | `auto` | `auto` follows VS Code; or `light` / `dark`. |
| `markup.preview.doubleClickToEdit` | `true` | Double-click the preview to jump to the source line. |
| `markup.plugins.enable` | `true` | Load workspace plugins (trusted workspaces). |
| `markup.trace.server` | `off` | Log language server traffic. |
