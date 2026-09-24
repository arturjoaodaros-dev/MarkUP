---
title: Front matter and data
description: MarkUP Data, the YAML subset used for front matter and for the bodies of data components such as chart.
---

# Front matter and data

Some parts of a document are data rather than text: the metadata at the top of the file, and the body of components such as `chart`. Both use **MarkUP Data**, a strict subset of YAML in which every value keeps its position, so errors point at the exact key or value.

## Front matter

```markup
---
title: Release notes
description: What changed in version 0.2.
lang: en
---

# Release notes
```

Front matter starts with `---` on the first line of the file and ends with `---` or `...`. It must be a mapping. When a page is built, `title` becomes the page title (the first heading is used otherwise), `description` a meta description and `lang` the language of the page. Other keys are allowed and kept in the syntax tree.

If the closing line is missing, the first line is read as a thematic break and MU1016 explains why the metadata is not applied.

## Data bodies

A component with the `data` content model reads its body as MarkUP Data and validates it against a schema:

```markup {result}
:::chart
type: line
title: Open issues
labels: [Jan, Feb, Mar, Apr]
series:
  - name: Bugs
    values: [14, 11, 9, 6]
  - name: Features
    values: [8, 10, 12, 12]
:::
```

Attributes and data keys can be mixed: `:::chart{type=line}` is the same as a `type: line` line in the body.

## Syntax

```markup
# A comment
name: MarkUP                  # plain string
version: 0.2                  # number
stable: false                 # boolean
license: ~                    # null
url: https://example.com:8080 # colons inside values are fine
tags: [parser, editor]        # flow sequence, on one line
quoted: "Line one\nLine two"  # double quotes support escapes
single: 'It''s literal'       # single quotes; '' is a quote
authors:                      # block sequence of mappings
  - name: Ada
    role: maintainer
notes: |                      # literal block, kept verbatim
  First line.
  Second line.
```

| Value | Result |
|---|---|
| `null`, `~`, empty | null |
| `true`, `false` (any case) | boolean |
| `12`, `-3.5`, `1e6`, `.5` | number |
| `01234`, `yes`, `on` | string |
| `"…"`, `'…'` | string |

Indentation uses spaces. A sequence may be at the same indentation as its key (`list:` followed by `- a`).

## Not supported

These YAML features are errors (MU1501) or have no special meaning:

- flow mappings `{a: 1}`, folded scalars `>`, and flow sequences that span lines;
- anchors, aliases and tags — they are read as plain text;
- tabs in indentation (MU1503);
- duplicate keys (MU1502; the later entry is ignored).

The grammar is in [section 9 of the specification](../spec.md#9-markup-data).
