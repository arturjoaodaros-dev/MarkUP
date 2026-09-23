# ADR 0003 — No raw HTML

**Status:** accepted

## Context

Markdown passes raw HTML through. That ties documents to HTML output, makes every preview an XSS risk (a pasted `<img onerror>` runs in the editor), and CommonMark's seven HTML-block rules are a large, surprising part of the grammar.

## Decision

MarkUP has no raw HTML. `<tag>` is literal text and is escaped by renderers. The exceptions are `<!-- comments -->` (kept in the tree, never rendered) and `<scheme:…>` / `<email>` autolinks. Structure that would need HTML is expressed with components; attributes are rendered through an allow-list (no `on*`, no `style`), and URLs go through one safety rule shared by the validator and the renderers.

## Consequences

- Previews in VS Code and the desktop app are safe by construction; the VS Code webview additionally runs under a strict CSP.
- Documents can target other renderers (plain text today) without losing meaning.
- Some Markdown documents that embed HTML render it as text. `markup check` makes these visible, and components cover the common cases (`details`, `figure`, `kbd`, `abbr`).
