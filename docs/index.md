---
title: MarkUP
description: MarkUP is a Markdown-compatible markup language with directives for structured components, with a parser, HTML renderer, CLI, VS Code extension and desktop editor.
---

# MarkUP

MarkUP is a markup language based on Markdown. It adds **directives** — named components with a label, attributes and a body — so that documents can contain callouts, tabs, charts and other structure without raw HTML.

```markup {result}
:::warning[Before tagging a release]
Run `npm run check` and update `CHANGELOG.md`.
:::

| Step  | Command         |
|-------|-----------------|
| Test  | `npm test`      |
| Build | `npm run build` |

Press :kbd[Ctrl+S] to save. Status: :badge[stable]{variant=success}
```

Everything that is valid Markdown in the usual sense — headings, emphasis, lists, links, code, tables, footnotes — works the same way. Directives use one syntax in three forms:

| Form | Syntax | Example |
|---|---|---|
| Container | `:::name[label]{attributes}` … `:::` | `:::note` … `:::` |
| Leaf | `::name[label]{attributes}` on its own line | `::toc{depth=2}` |
| Inline | `:name[label]{attributes}` inside text | `:kbd[Ctrl+S]` |

## Properties of the language

- **Parsing never fails.** Every input produces a complete syntax tree. Problems are reported as diagnostics with a code, a line and column, and often a fix that editors can apply.
- **No raw HTML.** `<div>` is text. Documents stay independent of the output format, and previews of untrusted documents are safe.
- **Components are declared, not hard-coded.** A component is a specification — name, forms, label, typed attributes, content model — plus a render function. The parser only reads the specifications; plugins add new components without changing it.
- **Positions everywhere.** Every node of the tree carries its source range, which is what the editors use for highlighting, outline and scroll sync.

## Tools

| | |
|---|---|
| [Command line](cli.md) | `markup build`, `check`, `render`, `preview` and `components` |
| [VS Code extension](vscode.md) | Highlighting, completion, diagnostics with quick fixes, outline and live preview |
| [MarkUP Desktop](desktop.md) | An editor with file explorer, tabs, search and live preview, for Windows |

All three use the same packages: `@markup-lang/core` (parser, validation), `@markup-lang/html` and `@markup-lang/text` (renderers) and `@markup-lang/language-service` (editor features). See [Architecture](architecture.md).

## Next steps

- [Installation](installation.md) — the desktop app, the VS Code extension and the CLI.
- [Quick start](quick-start.md) — write, preview, check and build a first document.
- [Syntax](syntax/markdown.md) — the language, construct by construct.
- [Components](components.md) — every built-in component with its attributes.
- [Specification](spec.md) — the precise rules, for implementers.
