# ADR 0004 — Desktop stack

**Status:** accepted

## Context

MarkUP Desktop must feel like a modern tool, reuse the TypeScript language core without duplication, and stay light.

## Options

- **Electron + React:** mature, all JavaScript; ships a browser (≈100 MB installers, high memory).
- **Tauri 2 + React:** system WebView, a small Rust core; ≈10 MB installers; needs a Rust toolchain to build.
- **Native UI toolkits:** would require re-implementing the editor, preview and language integration.

For the editor component: **Monaco** (VS Code's editor) is heavy and opinionated about languages; **CodeMirror 6** is modular, fast, and lets the language be defined entirely by our own analysis.

## Decision

Tauri 2 + React 19 + Vite + CodeMirror 6.

- The Rust side is a minimal, workspace-scoped file API (read, write atomically, create, rename, delete to trash, watch) and dialogs. All paths are checked against the opened folder.
- The front end talks to a `WorkspaceFs` interface with two implementations: Tauri, and an in-memory one persisted in the browser. The whole app therefore runs in a browser for development, demos and tests.
- CodeMirror's highlighting, lint, completion, hover and folding are thin adapters over `@markup-lang/language-service`.
- The preview renders with `@markup-lang/html` into a shadow root, patched with morphdom.

## Consequences

- Small, fast app; one language implementation for CLI, VS Code and desktop.
- Building installers needs Rust and platform prerequisites (on Windows, MSVC and the Windows SDK).
- Browser-mode storage is per browser profile; it is a convenience, not a replacement for real files.
