# MarkUP Desktop

A focused editor for MarkUP documents: a file explorer, tabs, an editor that understands the language, and a live preview — in a native window built with [Tauri](https://tauri.app) (Rust + the system WebView), with a React front end.

## Run it

**Installed**: Windows installers and a portable build are on the [download page](download.md).

**In a browser** (no native toolchain needed; files live in the browser's storage, with sample documents):

```sh
npm install
npm run dev -w @markup-lang/desktop     # http://localhost:1420
```

**As a desktop app** you also need [Rust](https://rustup.rs) and, on Windows, the Visual Studio *Desktop development with C++* workload including a **Windows SDK**; on Linux the [Tauri prerequisites](https://tauri.app/start/prerequisites/).

```sh
npm run app:dev -w @markup-lang/desktop     # development window with hot reload
npm run app:build -w @markup-lang/desktop   # installers in src-tauri/target/release/bundle
```

If Rust cannot find the MSVC linker on Windows, run the commands from a *Developer PowerShell for VS*.

The installer associates `.markup` and `.mkup` files with the app; opening one opens its folder with the file in a tab.

## Tour

- **Explorer** — the folder's files. Right-click for *New File*, *New Folder*, *Rename* (`F2`), *Delete* (to the system trash), *Copy Path*. Files with errors or warnings are colored and counted.
- **Tabs** — each keeps its own undo history and selection. Middle-click closes. A dot marks unsaved changes; you are always asked before unsaved work is discarded.
- **Editor** — highlighting, errors, completion and hover all come from the MarkUP language service (the same one used by VS Code): type `:::` for components, `{` for attributes, `](#` for headings. `Ctrl+.` applies a quick fix, `F12` or `Ctrl+Click` goes to a definition.
- **Preview** — renders as you type and scrolls with the editor. Double-click an element to jump to its source. Links to other documents open them in a tab.
- **Layouts** — editor only, split, preview only (`Ctrl+Alt+1/2/3`, or cycle with `Ctrl+\`). Drag the divider to resize.
- **Search** (`Ctrl+Shift+F`) across the folder with case, whole-word and regular-expression options.
- **Outline** — headings and components of the current file, following the cursor.
- **Problems** (`Ctrl+Shift+M`) — every error and warning in the folder.
- **Command palette** (`Ctrl+Shift+P`) and **quick open** (`Ctrl+P`). In quick open, `>` switches to commands, `@` to headings, `:` to a line number.
- **Export to HTML** (`Ctrl+Shift+S`) — a standalone page with the theme.
- **Settings** (`Ctrl+,`) — theme (dark, light, system), preview theme, font size, tab size, word wrap, line numbers, scroll sync, auto save. The shortcut list is in the same dialog.

Files changed outside the app are reloaded automatically when they have no unsaved edits; otherwise the tab is marked and saving overwrites the external change.

## Keyboard shortcuts

| | |
|---|---|
| Command palette | `Ctrl+Shift+P`, `F1` |
| Quick open file | `Ctrl+P` |
| Go to heading or component | `Ctrl+Shift+O` |
| Go to line | `Ctrl+G` |
| Insert component | `Ctrl+Alt+I` |
| Find in file | `Ctrl+F` |
| Search in folder | `Ctrl+Shift+F` |
| Save / save all | `Ctrl+S` / `Ctrl+Alt+S` |
| New file | `Ctrl+N` |
| Open folder | `Ctrl+O` |
| Close tab | `Ctrl+W` |
| Next / previous tab | `Ctrl+Tab` / `Ctrl+Shift+Tab` |
| Toggle sidebar | `Ctrl+B` |
| Explorer / outline / problems | `Ctrl+Shift+E` / `Ctrl+Shift+U` / `Ctrl+Shift+M` |
| Editor / split / preview | `Ctrl+Alt+1` / `2` / `3`, cycle `Ctrl+\` |
| Font size | `Ctrl+=` / `Ctrl+-` / `Ctrl+0` |
| Settings | `Ctrl+,` |
| Quick fix / go to definition | `Ctrl+.` / `F12` |

On macOS use `⌘` instead of `Ctrl`.

## How it is built

```
src/
  fs/          WorkspaceFs: Tauri implementation and an in-memory one for the browser
  state/       store (useSyncExternalStore), workbench actions, commands, settings
  editor/      CodeMirror integration with the language service
  components/  React UI
src-tauri/     Rust: workspace-scoped file commands, watcher, trash, dialogs
```

The Rust side is deliberately small: it only reads and writes files **inside the opened folder** (paths are canonicalised and checked), writes atomically, deletes to the trash, watches for changes and exports HTML through a save dialog. All language work happens in the front end with the shared packages.

See [ADR 0004](adr/0004-desktop-stack.md) for why Tauri, React and CodeMirror.
