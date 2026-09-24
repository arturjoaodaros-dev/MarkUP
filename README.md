<img src="packages/vscode/media/icon.png" width="64" alt="MarkUP logo">

# MarkUP

MarkUP is a markup language based on Markdown. It adds **directives** — named components with a label, attributes and a body — so documents can contain callouts, tabs, charts and other structure without raw HTML. This repository contains the parser, the HTML and text renderers, a command-line tool, a VS Code extension and a desktop editor.

Documentation: **[markup.rweb.site](https://markup.rweb.site/)** · Downloads: [installation](https://markup.rweb.site/installation.html)

```markup
---
title: Release checklist
---

# Release checklist

:::warning[Before tagging]
Run `npm run check` and update `CHANGELOG.md`.
:::

| Step  | Command         |
|-------|-----------------|
| Test  | `npm test`      |
| Build | `npm run build` |

Press :kbd[Ctrl+S] to save.
```

- **Markdown-compatible.** CommonMark blocks and inlines, GitHub tables, task lists, strikethrough, footnotes and front matter.
- **One directive syntax** in three forms: `:::name` … `:::` (container), `::name` (leaf), `:name[…]` (inline). Nesting uses more colons on the outside.
- **Parsing never fails.** Problems are diagnostics with a code, a line and column and, where possible, a fix.
- **No raw HTML.** `<div>` is text, so documents are renderer-independent and previews are safe.
- **Declared components.** A component is a specification (forms, label, typed attributes, content model) and a render function; plugins add new ones without changing the parser.

## Build from source

Requires Node.js 22.12 or newer.

```sh
git clone https://github.com/arturjoaodaros-dev/MarkUP.git
cd MarkUP
npm install
npm run build
```

```sh
node packages/cli/dist/markup.js check examples                          # report problems
node packages/cli/dist/markup.js build examples --out out                # write HTML pages
node packages/cli/dist/markup.js preview examples/showcase.markup --open # live preview
```

`npm link -w @markup-lang/cli` puts `markup` on your `PATH`.

| Tool | Build | Documentation |
|---|---|---|
| VS Code extension | `npm run package -w markup-lang` → `packages/vscode/dist/markup.vsix` | [docs/vscode.md](docs/vscode.md) |
| MarkUP Desktop | `npm run app:build -w @markup-lang/desktop` (Rust and a Windows SDK required); `npm run dev -w @markup-lang/desktop` runs it in a browser | [docs/desktop.md](docs/desktop.md) |
| Documentation site | `npm run site` → `site/` | [docs/development.md](docs/development.md) |

## Documentation

The documentation is in [`docs/`](docs) and published at [markup.rweb.site](https://markup.rweb.site/):

- [Quick start](docs/quick-start.md), [Installation](docs/installation.md)
- Syntax: [Markdown](docs/syntax/markdown.md), [Directives](docs/syntax/directives.md), [Attributes](docs/syntax/attributes.md), [Front matter and data](docs/syntax/data.md)
- [Components](docs/components.md) and [Diagnostics](docs/errors.md) (generated from the source)
- [Specification](docs/spec.md) — precise enough to write another parser
- [Extending MarkUP](docs/extending.md), [Architecture](docs/architecture.md), [design decisions](docs/adr)

## Repository

```
packages/
  core/              @markup-lang/core              parser, syntax tree, component specs, data syntax, validation
  html/              @markup-lang/html              HTML renderer, SVG charts, theme
  text/              @markup-lang/text              plain-text renderer, word counts
  language-service/  @markup-lang/language-service  completion, hover, outline, highlighting, navigation
  language-server/   @markup-lang/language-server   LSP server (VS Code, Neovim, Helix, …)
  cli/               @markup-lang/cli               the markup command
  vscode/            markup-lang                    VS Code extension
  desktop/           @markup-lang/desktop           Tauri + React editor
docs/                                               documentation
examples/                                           sample documents and a sample plugin
scripts/                                            documentation generators, site builder, icons
```

`npm run check` runs lint, type checks and the test suite. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
