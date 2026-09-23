# MarkUP for VS Code

The extension (`packages/vscode`) adds full language support for `.markup` and `.mkup` files. Language features come from the MarkUP language server, which uses the same core as the CLI and the desktop app.

## Install

```sh
npm install
npm run package -w markup-lang        # → packages/vscode/dist/markup.vsix
code --install-extension packages/vscode/dist/markup.vsix
```

Or in VS Code: *Extensions* → `…` → *Install from VSIX…*.

To work on the extension, open the repository in VS Code, run `npm run build -w markup-lang`, and start the *Run Extension* launch configuration (or `code --extensionDevelopmentPath=packages/vscode`).

## Features

**Preview.** *MarkUP: Open Preview* (`Ctrl+Shift+V`) or *Open Preview to the Side* (`Ctrl+K V`, or the button in the editor title). The preview:

- updates as you type, patching the page instead of reloading it (open `details` and selected tabs stay as they are);
- scrolls with the editor, and scrolls the editor when you scroll it;
- jumps to the source when you double-click an element;
- follows the color theme, loads images next to the document, opens links to other `.markup` files in the editor;
- runs with a strict Content Security Policy — document content can never run scripts.

**Diagnostics** appear as you type, with the same codes as `markup check`. Quick fixes (`Ctrl+.`) are offered where the fix is clear: close an unclosed component, correct a misspelt component or attribute name, turn trailing text into a label, remove a stray label, lengthen a short fence.

**Completion**

| Where | Suggests |
|---|---|
| after `:::` / `::` / `:` | components valid in that form, inserted as a snippet with the right number of colons and indentation |
| inside `{…}` of a component | its attributes, then enum and boolean values |
| inside a `chart` body | data keys (nested ones too) and values |
| after `](#` | the document's headings and ids |
| after `[^` | footnote labels |
| after ```` ``` ```` | code languages |

Suggestions never pop up while you write prose; they appear after the characters above or with `Ctrl+Space`.

**Hover** shows the documentation of components, attributes and data keys, the target of `#anchor` links and the text of footnotes.

**Navigation.** The outline and breadcrumbs show headings and components; *Go to Definition* (`F12`) works on `#anchor` links, reference links and footnotes; *Find All References* lists the links to a heading; folding covers components, code, sections and front matter; relative links are clickable.

**Commands:** *Export to HTML…*, *Insert Component…* (`Ctrl+Alt+I`), *Show Component Reference* (a live, rendered reference of every component), *Restart Language Server*.

## Settings

| Setting | Default | |
|---|---|---|
| `markup.preview.scrollSync` | `true` | Keep editor and preview scrolled together. |
| `markup.preview.theme` | `auto` | `auto` follows VS Code; or `light` / `dark`. |
| `markup.preview.doubleClickToEdit` | `true` | Double-click the preview to jump to the source line. |
| `markup.plugins.enable` | `true` | Load plugins from `markup.config.json` in trusted workspaces. |
| `markup.trace.server` | `off` | Log language server traffic to the output panel. |

For MarkUP files the extension sets sensible editor defaults: word wrap on, no automatic word suggestions in prose, semantic highlighting on.

## Plugins and workspace trust

Plugins are code. The extension loads the `plugins` of `markup.config.json` only when the workspace is trusted and `markup.plugins.enable` is on; after editing the config, run *MarkUP: Restart Language Server*.

## Other editors

The language server works with any LSP client:

```sh
node packages/language-server/dist/server.cjs --stdio
```

For example in Neovim:

```lua
vim.filetype.add({ extension = { markup = 'markup', mkup = 'markup' } })
vim.lsp.start({ name = 'markup', cmd = { 'node', '/path/to/server.cjs', '--stdio' } })
```
