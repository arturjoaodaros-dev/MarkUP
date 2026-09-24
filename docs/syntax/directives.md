---
title: Directives
description: Container, leaf and inline directives in MarkUP — labels, attributes, nesting, closing fences, content models and unknown components.
---

# Directives

A directive is a named component in the text. It has an optional **label** in brackets, optional **attributes** in braces, and — for containers — a **body**. There are three forms, distinguished by the number of colons:

| Form | Syntax | Where |
|---|---|---|
| Container | `:::name[label]{attributes}` … `:::` | A block with a body |
| Leaf | `::name[label]{attributes}` | A whole line, no body |
| Inline | `:name[label]{attributes}` | Inside a paragraph, heading or table cell |

Which names exist, which forms they allow and which attributes they accept is defined by the component specifications. The built-in ones are listed in [Components](../components.md); plugins can add more ([Extending MarkUP](../extending.md)).

## Container directives

```markup {result}
:::tip[Faster builds]
Pass `--watch` to `markup build` to rebuild on every change.
:::
```

The opening fence is three or more colons followed directly by the name. The body is ordinary MarkUP until a line consisting only of colons. For most components the label is the title; `tip` uses *Tip* when there is none.

The body can contain any block, including lists, code and other directives. Indentation inside the body is free:

````markup {result}
:::details[Show the configuration]
  ```json
  { "out": "site", "plugins": ["./video.mjs"] }
  ```
:::
````

## Leaf directives

```markup {result}
::progress[Documentation]{value=80}
```

Exactly two colons, alone on the line. Leaf directives have no body; everything they need comes from the label and attributes.

## Inline directives

```markup {result}
Press :kbd[Ctrl+Shift+P] and choose :abbr[LSP]{title="Language Server Protocol"} commands.
```

One colon, followed by a label, attributes, or both. The colon must not follow a letter, digit or another colon, so `ratio 3:1` and `https://` are never directives, and `:smile:` (no label or attributes) is text.

## Nesting

Directives nest. Use more colons on the outside so that the fences are easy to match by eye:

````markup {result}
::::tabs
:::tab[npm]
```sh
npm install
```
:::
:::tab[pnpm]
```sh
pnpm install
```
:::
::::
````

A closing fence closes the innermost open directive whose opening fence has exactly as many colons. Directives with the same number of colons also work, as long as every one is closed in order.

A closing fence must be at the same nesting level as its opening fence: inside the same list item or block quote. Code blocks are opaque — `:::` inside a fenced code block is code, not a fence.

## Content models

Each component declares how its body is read:

| Model | Body | Example |
|---|---|---|
| `flow` | MarkUP blocks (the default) | `note`, `card`, `tab` |
| `data` | [MarkUP Data](data.md), validated against a schema | `chart` |
| `raw` | Literal text | — |

```markup {result}
:::chart{type=bar title="Pages per section"}
data:
  Syntax: 4
  Tools: 3
  Reference: 2
:::
```

## Unknown directives

A name that no specification declares is still parsed — as a flow container, leaf or inline directive — and reported as a warning (MU2001), with a suggestion when a known name is close:

```text
guide.markup:3:4 warning MU2001 Unknown component `nott` — did you mean `note`? It is rendered as a plain container.
```

Renderers keep the content of unknown directives, so nothing written is lost.

## Common mistakes

| Input | Diagnostic |
|---|---|
| A container without a closing `:::` | MU1001, with a fix that inserts the fence |
| `::: note` (space before the name) | MU1006 warning; accepted as `:::note` |
| `:::card Title` (text after the name) | MU1005, with a fix: `:::card[Title]` |
| A `:::` with nothing open at that level | MU1003 |
| `:::` inside a directive opened with `::::`, when nothing else matches | MU1004 |
| A fence that closes an outer directive while an inner one is open | MU1002 for the inner one |
| `:::tab` outside `:::tabs` | MU2008 |

The full list is in [Diagnostics](../errors.md). The algorithm is specified in [section 6 of the specification](../spec.md#6-directives).
