# Getting started

## Install

MarkUP needs [Node.js](https://nodejs.org) 22.12 or newer.

```sh
git clone https://github.com/arturjoaodaros-dev/MarkUP.git
cd MarkUP
npm install
npm run build
npm link -w @markup-lang/cli   # optional: puts `markup` on your PATH
```

Check it works:

```sh
markup --version
markup components
```

## Your first document

Create `hello.markup`:

```markup
# Hello, MarkUP

This is a paragraph with **bold**, *italic* and `code`.

:::note
Components start with three colons and end with three colons.
:::
```

Preview it while you edit:

```sh
markup preview hello.markup --open
```

Every save reloads the page. Problems appear in a small panel at the bottom, and in the terminal.

When you are done, build a standalone page:

```sh
markup build hello.markup --out site
```

## The syntax in ten minutes

### Markdown you already know

```markup
# Heading 1
## Heading 2

A paragraph. Lines next to each other join;
a blank line starts a new paragraph.

**bold**, *italic*, ~~strikethrough~~, `code`, [a link](https://example.com)

- a list
- [x] a finished task
1. an ordered list

> A quote.

| Column | Other |
|--------|------:|
| a      |     1 |

A statement that needs a source.[^1]

[^1]: The footnote text.
```

Code blocks use fences; add a title with an attribute:

~~~markup
```ts {title="greet.ts"}
export const greet = (name: string) => `Hello, ${name}`;
```
~~~

### Front matter

Metadata at the very top, between `---` lines. `title`, `description` and `lang` are used when building pages.

```markup
---
title: Deployment guide
description: How we ship.
---
```

### Components

A **block component** opens with `:::name` and closes with `:::`:

```markup
:::warning
Back up your data first.
:::
```

Give it a **label** in brackets — for most components, the title:

```markup
:::details[How does it work?]
Hidden until the reader expands it.
:::
```

Add **attributes** in braces: `#id`, `.class`, `key=value`, `key="with spaces"`, or a bare `flag`:

```markup
:::card[Docs]{href=/docs icon=📘}
Everything you need to know.
:::
```

**Nest** components by using more colons on the outside:

```markup
::::tabs
:::tab[macOS]
Use Homebrew.
:::
:::tab[Windows]
Use winget.
:::
::::
```

**Single-line components** use two colons:

```markup
::toc{depth=2}
::progress[Translation]{value=72}
```

**Inline components** use one colon and sit inside text:

```markup
Press :kbd[Ctrl+S] to save — this is :badge[new]{variant=success}.
```

### Data components

Some components take data instead of text. The body is a small, strict YAML subset:

```markup
:::chart
type: line
labels: [Jan, Feb, Mar]
series:
  - name: Visitors
    values: [120, 180, 240]
:::
```

See [components.md](components.md) for everything available.

### What MarkUP does not have

- **Raw HTML.** `<div>` shows up as text. Use components instead; it keeps documents portable and previews safe.
- **Indented code blocks.** Indent freely for readability — use fences for code.

## When something is wrong

Run `markup check`:

```text
docs/guide.markup:12:1 error MU1001 Directive `note` is never closed. Add a `:::` line after its content.
   |
12 | :::note
   | ^^^^^^^
  fix: Insert closing :::
```

Every problem has a code ([errors.md](errors.md)), a position, and often a fix that editors can apply for you.

## Next steps

- Edit with live preview and completion in [VS Code](vscode.md) or [MarkUP Desktop](desktop.md).
- Read the [specification](spec.md) for the exact rules.
- [Write your own component](extending.md).
