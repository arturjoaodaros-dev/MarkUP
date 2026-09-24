---
title: Markdown
description: The Markdown part of MarkUP — headings, paragraphs, emphasis, lists, links, images, code, tables, footnotes and comments — and where it differs from CommonMark.
---

# Markdown

MarkUP reads Markdown the way CommonMark does, with the common GitHub extensions: tables, task lists, strikethrough, footnotes and bare URLs. This page lists every construct with an example. The exact rules are in the [specification](../spec.md#5-blocks).

Two things are deliberately missing: raw HTML and indented code blocks. See [Differences from CommonMark](#differences-from-commonmark).

## Headings

```markup {result}
# Level 1
## Level 2
### Level 3 {#custom-id}
```

One to six `#` followed by a space. Every heading gets an id for links: the lowercase text with spaces replaced by `-` (`## Level 2` → `level-2`), made unique with a number suffix when repeated. An attribute block at the end sets the id and classes explicitly.

A line of `=` or `-` under a paragraph also makes a heading of level 1 or 2 (setext headings).

## Paragraphs and line breaks

```markup {result}
Lines next to each other
form one paragraph.

A blank line starts the next one.
End a line with a backslash\
for a hard line break.
```

Two or more trailing spaces also make a hard break. Leading indentation has no meaning: `    text` is a normal paragraph.

## Emphasis and inline code

```markup {result}
*emphasis*, **strong**, ***both***, ~~strikethrough~~ and `inline code`.
```

`_` works like `*` except inside words: `snake_case_name` stays as it is. A backslash makes punctuation literal: `\*not emphasis\*`.

## Lists

```markup {result}
- Bullet item
  - Nested item, indented to the content of its parent
1. Ordered item
2. Next item

- [x] Finished task
- [ ] Open task
```

Bullets are `-`, `+` or `*`; ordered markers are digits followed by `.` or `)`, and the first number is kept. Changing the marker starts a new list. A blank line between items makes the list *loose*, and its items render as paragraphs.

## Links and images

```markup {result}
[Inline link](https://example.com "Optional title"), [reference link][spec],
<https://example.com/autolink> and a bare URL: https://example.com.

[spec]: https://example.com/spec

![MarkUP icon](https://markup.rweb.site/icon.svg){width=32}
```

- Reference definitions (`[label]: url`) can appear anywhere; labels are case-insensitive.
- `#fragment` links are checked against the headings and ids of the document (MU2025).
- URLs with schemes other than `http`, `https`, `mailto`, `tel` and `ftp` are not rendered as links (MU2023). Images may also use `data:image/…`.
- Images accept an [attribute block](attributes.md) for `width`, `height`, id and classes.

## Code blocks

````markup {result}
```ts {title="greet.ts"}
export const greet = (name: string) => `Hello, ${name}`;
```
````

Fences are three or more backticks or tildes. The first word of the info string is the language; an attribute block after it can set a `title`, shown as a caption. Nothing inside a code block is interpreted — a `:::` line in code never closes a directive.

## Block quotes

```markup {result}
> A quote can contain any block,
> including lists and directives.
```

## Tables

```markup {result}
| Command | Description        | Exit code |
|:--------|:-------------------|----------:|
| `check` | Report problems    |         1 |
| `build` | Write HTML pages   |         0 |
```

The second row sets alignment with `:`. Cells contain inline syntax; write `\|` for a literal pipe. Rows with more cells than the header lose the extra cells (MU1014).

## Footnotes

```markup {result}
The parser is iterative.[^depth]

[^depth]: Nesting is limited to 64 block levels and 32 inline levels.
```

Footnotes are numbered in order of first reference and rendered at the end of the document. References without a definition are reported (MU2021).

## Thematic breaks, comments and entities

```markup {result}
Above the break.

---

<!-- Comments are kept in the syntax tree and never rendered. -->
Entities: &copy; &rarr; &#x2713;
```

## Differences from CommonMark

| CommonMark | MarkUP | Reason |
|---|---|---|
| Raw HTML | Text, escaped on output | Output-format independence; safe previews. Use components instead. |
| Indented code blocks | None; indentation is free | Content inside directives can be indented for readability. |
| Full HTML5 entity list | Common named entities and numeric references | Without raw HTML the long tail is rarely needed. |
| — | Directives, attributes, front matter | The extension mechanism of MarkUP. |

Directives are described in [Directives](directives.md).
