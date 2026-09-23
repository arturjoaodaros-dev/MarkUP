<p align="center"><img src="packages/vscode/media/icon.png" width="72" alt=""></p>

<h1 align="center">MarkUP</h1>

<p align="center">Markdown with components — a real parser, a VS Code extension, a desktop editor and a CLI, all built on one language core.</p>

<p align="center"><a href="https://markup.rweb.site/">Website</a> · <a href="https://markup.rweb.site/download.html">Download for Windows</a></p>

---

```markup
---
title: Release 0.2
---

# Release 0.2

Everything you know from **Markdown** still works.

:::tip[New in this release]
Components add structure where plain Markdown runs out.
:::

:::chart
type: bar
data:
  Parser: 98
  Renderer: 91
  Editor: 87
:::

Press :kbd[Ctrl+Shift+P] to try the command palette. :badge[beta]{variant=warning}
```

## Why MarkUP

- **Markdown first.** Paragraphs, headings, lists, links, code, tables, footnotes and front matter work as you expect. Typical Markdown files are valid MarkUP.
- **One syntax for components.** `:::name[label]{attributes}` for blocks, `::name` for single-line components, `:name[…]` inline. Nest by adding colons. No HTML needed — and none allowed, so documents stay portable and previews are safe.
- **Errors you can act on.** The parser never fails; it reports problems with a code, the exact line and column, and a fix when one is obvious (`:::nott` → *did you mean `note`?*).
- **Extensible without touching the parser.** A component is a spec (forms, label, typed attributes, content model) plus a render function. Plugins add both.
- **The same core everywhere.** The CLI, the VS Code extension and the desktop app share the parser, the validator and the language features — highlighting, completion and diagnostics are identical in every tool.

## Get started

**Requirements:** Node.js 22.12 or newer.

```sh
git clone https://github.com/arturjoaodaros-dev/MarkUP.git
cd MarkUP
npm install
npm run build
```

Then:

```sh
# Check a folder for problems
node packages/cli/dist/markup.js check examples

# Build HTML pages
node packages/cli/dist/markup.js build examples --out out

# Live preview in the browser
node packages/cli/dist/markup.js preview examples/showcase.markup --open
```

To have a `markup` command on your PATH, run `npm link -w @markup-lang/cli`.

- **Downloads:** Windows installers for MarkUP Desktop and the VS Code extension are on the [website](https://markup.rweb.site/download.html).
- **VS Code:** `npm run package -w markup-lang` builds `packages/vscode/dist/markup.vsix`; install it with *Extensions → … → Install from VSIX*. See [docs/vscode.md](docs/vscode.md).
- **Desktop:** `npm run dev -w @markup-lang/desktop` runs the editor in a browser; `npm run app:build -w @markup-lang/desktop` builds the native app. See [docs/desktop.md](docs/desktop.md).

Read the [getting started guide](docs/getting-started.md) for a tour of the syntax.

## Documentation

| | |
|---|---|
| [Getting started](docs/getting-started.md) | Install, first document, the syntax in ten minutes |
| [Specification](docs/spec.md) | The language, precisely — enough to write another parser |
| [Components](docs/components.md) | Every built-in component (generated) |
| [Diagnostics](docs/errors.md) | Every error and warning code (generated) |
| [CLI](docs/cli.md) | `markup render`, `build`, `check`, `preview`, `components` |
| [VS Code](docs/vscode.md) | The extension and its settings |
| [Desktop](docs/desktop.md) | MarkUP Desktop |
| [Extending MarkUP](docs/extending.md) | Writing components and plugins |
| [Architecture](docs/architecture.md) | How the pieces fit, and why |
| [Development](docs/development.md) | Working on this repository |
| [Decisions](docs/adr) | Architecture decision records |

## Repository

```
packages/
  core/              @markup-lang/core              parser, AST, component specs, data syntax, validation
  html/              @markup-lang/html              HTML renderer, SVG charts, theme
  text/              @markup-lang/text              plain-text renderer, word counts
  language-service/  @markup-lang/language-service  completion, hover, outline, highlighting, navigation
  language-server/   @markup-lang/language-server   LSP server (VS Code, Neovim, Helix, …)
  cli/               @markup-lang/cli               the markup command
  vscode/            markup-lang                    VS Code extension
  desktop/           @markup-lang/desktop           Tauri + React editor
docs/                                               documentation
examples/                                           sample documents and a sample plugin
```

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). `npm run check` runs lint, type checks and the full test suite.

## License

[MIT](LICENSE)
