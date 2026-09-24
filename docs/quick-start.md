---
title: Quick start
description: Write a first MarkUP document, preview it with live reload, check it for problems and build it into an HTML page.
---

# Quick start

This page uses the `markup` command. Install it as described in [Installation](installation.md#command-line-tool). The same steps work in [MarkUP Desktop](desktop.md) and [VS Code](vscode.md), where preview and diagnostics are built in.

## Write a document

Create `hello.markup`:

```markup {result}
---
title: Hello
---

# Hello, MarkUP

A paragraph with **strong**, *emphasised* and `code` text.

:::note
Container directives start with `:::name` and end with `:::`.
:::

- [x] Write a document
- [ ] Build it
```

The block between the `---` lines is [front matter](syntax/data.md#front-matter); `title` becomes the page title. The rest is Markdown plus one directive, `note`.

## Preview it

```sh
markup preview hello.markup --open
```

This starts a local server and opens the page. Saving the file reloads it; problems are shown in the terminal and in a panel at the bottom of the page.

## Check it

`markup check` reports problems with their position. If the closing `:::` of the note were missing:

```text
hello.markup:9:1 error MU1001 Directive `note` is never closed. Add a `:::` line after its content.
  |
9 | :::note
  | ^^^^^^^
  fix: Insert closing :::
```

The exit code is 1 when there are errors, so the command can run in CI. Every code is listed in [Diagnostics](errors.md).

## Build it

```sh
markup build hello.markup --out site
```

`site/hello.html` is a standalone page: the theme is inlined and it needs no JavaScript. Pass a folder instead of a file to build every `.markup`, `.mkup` and `.md` file in it, keeping the directory structure; links between documents are rewritten to the `.html` files.

## Next steps

- [Markdown](syntax/markdown.md) — the Markdown part of the syntax.
- [Directives](syntax/directives.md) — components, labels, nesting.
- [Components](components.md) — the built-in components.
- [Command line](cli.md) — all commands and options.
