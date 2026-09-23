# ADR 0005 — A language server

**Status:** accepted

## Context

The VS Code extension needs diagnostics, completion, hover, outline, folding, navigation, semantic highlighting and quick fixes. These could be implemented against the VS Code API directly.

## Decision

Implement the features once, editor-agnostically, in `@markup-lang/language-service` (plain offsets in, plain data out). Expose them to VS Code — and to any other editor — through a Language Server Protocol server (`@markup-lang/language-server`). The desktop app calls the service in-process.

## Consequences

- One implementation, tested once, used by VS Code, the desktop app and any LSP client (Neovim, Helix, Zed…).
- The extension is thin: an LSP client, a TextMate grammar for instant coloring, and the preview.
- Parsing happens in the server process, keeping the extension host responsive; the preview parses separately in the extension host (it is cheap and keeps the preview independent of server restarts).
- End-to-end tests drive a real server process over stdio.
