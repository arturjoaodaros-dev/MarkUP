---
title: Attributes
description: The MarkUP attribute block — ids, classes, key/value pairs and flags on directives, headings, images and code blocks.
---

# Attributes

An attribute block is a list of items in braces:

```markup
{#install .wide width=320 title="Getting started" open}
```

| Item | Meaning |
|---|---|
| `#install` | The element id. The last one wins. |
| `.wide` | A class. Classes accumulate. |
| `width=320` | A key with a value. |
| `title="Getting started"` | A quoted value; `"…"` or `'…'`, with `\"` and `\\` escapes. |
| `open` | A flag: a key without a value, meaning `true`. |

Items are separated by spaces or commas: `{type=bar, title=Sales}` is valid. Unquoted values cannot contain whitespace, quotes, `=`, `` ` ``, `{`, `}` or `,`.

## Where attributes are allowed

**Directives**, after the name or label:

```markup {result}
:::note[Heads up]{#release-note collapsible}
Collapsible callouts render as a `details` element.
:::
```

**Headings**, at the end of the line:

```markup {result}
### Configuration file {#config}
```

**Images**, directly after the closing parenthesis:

```markup
![Logo](logo.png){width=120 .round}
```

**Code blocks**, after the language:

````markup {result}
```sh {title="Terminal"}
markup check docs
```
````

For headings and images, braces are only read as attributes when the first item is `#id`, `.class` or `key=value`, so `# Using {braces}` keeps its text.

## Values and validation

Attribute values are text. Each component declares a type for every attribute, and values are converted before rendering: `value=72` becomes the number 72, `open` or `open=true` the boolean `true`. The declared attributes of every built-in component are in [Components](../components.md).

Problems are reported with the position of the item:

| Problem | Code |
|---|---|
| The block is not closed on its line | MU1008 |
| An item is not an id, class or key/value pair | MU1009 |
| A key or id appears twice | MU1010 (warning; the last one wins) |
| The component does not declare the attribute | MU2003 (warning, with a suggestion) |
| The value does not match the declared type | MU2004 |
| A required attribute is missing | MU2005 |

`#id` and `.class` are accepted by every component.
