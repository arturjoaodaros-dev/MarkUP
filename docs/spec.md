# MarkUP specification

**Version 0.1 (draft)** · This document defines the MarkUP language precisely enough to write a compatible parser without reading the reference implementation.

The key words MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119. Examples use `→` for “produces”. Syntax is given in an EBNF variant where `?` is optional, `*` is zero or more, `+` is one or more and `|` separates alternatives.

---

## Contents

1. [Overview](#1-overview)
2. [Source text](#2-source-text)
3. [Document structure](#3-document-structure)
4. [Front matter](#4-front-matter)
5. [Blocks](#5-blocks)
6. [Directives](#6-directives)
7. [Attributes](#7-attributes)
8. [Inline content](#8-inline-content)
9. [MarkUP Data](#9-markup-data)
10. [Component specifications and validation](#10-component-specifications-and-validation)
11. [Anchors](#11-anchors)
12. [Diagnostics and error recovery](#12-diagnostics-and-error-recovery)
13. [Rendering](#13-rendering)
14. [Differences from CommonMark](#14-differences-from-commonmark)
15. [Examples](#15-examples)
- [Appendix A: syntax tree](#appendix-a-syntax-tree)

---

## 1. Overview

MarkUP is a plain-text markup language. It keeps the Markdown syntax people already know — headings, emphasis, lists, links, code, tables — and adds **directives**: named components with a label, attributes and a body.

```markup
:::card[Deploy]{icon=🚀}
Push to `main` and the site rebuilds.
:::
```

A MarkUP processor has three stages, each specified here:

1. **Parsing** (sections 2–9) turns source text into a syntax tree. Parsing never fails: every input produces a complete tree, and problems are reported as diagnostics.
2. **Validation** (section 10–11) checks the tree against component specifications and document rules. It reports diagnostics but never changes the tree.
3. **Rendering** (section 13) turns the tree into an output format. HTML is the reference output; other renderers are allowed.

A **conforming parser** MUST produce the tree described in this document for every input. Diagnostic messages are not normative; diagnostic codes (section 12) and their ranges are.

## 2. Source text

**2.1 Encoding.** A document is a sequence of Unicode code points. Files SHOULD be UTF-8. A leading U+FEFF (byte-order mark) is not part of the content.

**2.2 Lines.** The text is split into lines at `LF` (U+000A), `CR LF` and a lone `CR` (U+000D). A terminator at the very end of the text does not start an extra line. Line endings never appear in the tree except as soft line breaks (§8.10).

**2.3 Insecure characters.** Every U+0000 is replaced by U+FFFD before parsing.

**2.4 Whitespace.** *Whitespace* means space (U+0020) and tab (U+0009). A line is *blank* if it contains only whitespace. Tabs are expanded to the next multiple of 4 columns when indentation is measured; a tab that is only partly needed to reach an indentation is consumed whole.

**2.5 Positions.** Every node and diagnostic carries a range `{start, end}` of points `{line, column, offset}`. Lines and columns are 1-based; offsets are 0-based. Columns and offsets count **UTF-16 code units**, the unit of JavaScript strings, the Language Server Protocol and most editors. Ranges are half-open.

## 3. Document structure

A document is an optional front matter block (§4) followed by a sequence of blocks (§5–6). Blocks are either:

- **containers**, which hold other blocks: block quotes, lists, list items, container directives and footnote definitions;
- **leaves**, which hold inline content or text: paragraphs, headings, code blocks, tables, thematic breaks, comments, leaf directives, and link reference definitions.

Paragraphs, headings, table cells and directive labels contain **inline content** (§8), which is parsed after all blocks are known, so that link references can point forward.

## 4. Front matter

If the first line of the document is exactly `---` (trailing whitespace allowed), and a later line is exactly `---` or `...`, the lines between them are **front matter**, parsed as MarkUP Data (§9). Front matter MUST be a mapping (MU2010 otherwise).

```markup
---
title: Release notes
description: What changed in 0.2
lang: en
---
```

If no closing line exists, the first line is an ordinary thematic break. When the second line looks like `key: value`, the parser SHOULD report MU1016 so the author knows why their metadata is missing.

Renderers use `title`, `description` and `lang` when producing complete documents (§13.4).

## 5. Blocks

### 5.1 The block algorithm

Blocks are parsed line by line with a stack of **open blocks**, in the style of the CommonMark reference algorithm. For each line:

1. **Continuation.** Starting at the document, each open block is asked whether it continues on this line. Containers consume their prefix:
   - block quote: optional indentation then `>` and one optional space or tab;
   - list item: indentation of at least the item's content column (§5.6), or a blank line;
   - footnote definition: at least 2 columns of indentation, or a blank line;
   - list and container directive: always continue (they consume nothing).

   Leaves decide too: paragraphs and tables continue on non-blank lines; code blocks and raw directive bodies continue until their closing fence (§5.7, §6.4).

   The first block that does not continue, and everything below it, is *unmatched*.
2. **Raw leaves.** If every open block continued and the deepest one is a code block, raw directive body or comment, the rest of the line is added to it.
3. **Block starts.** Otherwise the parser tries to start new blocks at the current position (§5.2–§6), repeatedly, because a container may begin with another block (`> - # Title`). Starting a block closes the unmatched blocks first.
4. **Remainder.** If nothing started, the line is a *lazy continuation* when an unmatched paragraph is open and the line is not blank (the paragraph continues across a missing `>` or indentation, as in CommonMark). Otherwise unmatched blocks are closed and the line continues the open paragraph or table, starts a new paragraph, or — if blank — closes an open paragraph or table.

Indentation never has meaning of its own. In particular there are **no indented code blocks**: `    # Title` is a heading and `    code` is a paragraph. This lets authors indent the content of directives freely.

The nesting depth of containers is limited to **64**. A block start that would exceed it is ignored and the rest of the line is read as text (MU1015).

### 5.2 Paragraphs

A paragraph is a sequence of non-blank lines that do not start another block. Leading whitespace of each line and trailing whitespace of the last line are not part of its content. When a paragraph closes, link reference definitions at its start are removed from it (§5.10); a paragraph left empty produces no node.

### 5.3 Headings

**ATX headings.**

```ebnf
atx-heading = "#"{1,6} ( whitespace content )? closing? attributes? whitespace* ;
closing     = whitespace+ "#"+ ;
```

The opening sequence is 1–6 `#` followed by whitespace or the end of the line; `#hashtag` and `####### x` are paragraphs. A closing sequence of `#` preceded by whitespace is removed.

A trailing **attribute block** (§7) sets the heading's id and classes: `## Install {#setup .wide}`. To avoid surprises with ordinary braces, a trailing `{…}` is only an attribute block when it is preceded by whitespace and its first item is `#id`, `.class` or `key=value`. `# Using {braces}` keeps its braces.

ATX headings may interrupt paragraphs.

**Setext headings.** A line of `=` (level 1) or `-` (level 2), optionally followed by whitespace, directly under an open paragraph turns that paragraph into a heading. If the paragraph was made only of link reference definitions, `---` is a thematic break instead.

### 5.4 Thematic breaks

Three or more `*`, `-` or `_` of the same kind, optionally separated by whitespace, with nothing else on the line: `***`, `- - -`, `_____`. A thematic break may interrupt a paragraph (but see setext headings).

### 5.5 Block quotes

A line starting with `>` (after optional indentation) opens a block quote; subsequent lines continue it with `>`. A line containing only `>` is a blank line inside the quote. Lazy continuation (§5.1) applies to paragraphs.

### 5.6 Lists

**Markers.** A bullet is `-`, `+` or `*`; an ordered marker is 1–9 digits followed by `.` or `)`. A marker must be followed by whitespace or the end of the line. Ordered lists record the number of their first item.

**Content column.** Let *W* be the width of the marker and *N* the number of whitespace columns after it:

- if the rest of the line is blank, or *N* ≥ 5, the content column is marker column + *W* + 1;
- otherwise it is marker column + *W* + *N*.

Continuation lines must be indented at least to the content column (relative to the enclosing container). An item that starts with a blank line may contain content from the next line; an empty item followed by a blank line ends.

**Tasks.** `[ ]`, `[x]` or `[X]` followed by whitespace at the start of an item's content makes it a task item (`checked` false or true).

**Lists.** Consecutive items with the same bullet character (or the same delimiter, `.` or `)`, for ordered lists) form one list. A different marker starts a new list.

**Interrupting paragraphs.** A list item may interrupt a paragraph only if it is not empty and, when ordered, starts with 1. `The year\n1984. was` is one paragraph.

**Loose and tight.** A list is *loose* (`spread`) if two of its items are separated by a blank line, or if an item directly contains two blocks separated by a blank line. Blank lines inside nested lists, code blocks or directives do not make the outer list loose. Renderers wrap the paragraphs of loose lists in paragraph elements.

### 5.7 Fenced code

A **code fence** is at least three backticks or three tildes. It opens a code block anywhere a block may start (including inside paragraphs, which it interrupts). The rest of the line is the **info string**:

- the first word (up to whitespace or `{`) is the language, with backslash escapes resolved;
- if the remainder is exactly one attribute block (§7), it is the block's attributes, e.g. ` ```ts {title="app.ts"} `;
- otherwise the remainder is kept as `meta`.

A backtick fence's info string MUST NOT contain a backtick; such a line is a paragraph.

The block ends at a line containing only a fence of the same character, at least as long as the opening one, indented at most 3 columns more than the opening fence. Content lines lose up to as much indentation as the opening fence had.

**Code is opaque.** Inside a code block nothing is interpreted — not directive fences, not comments. A `:::` line inside code never closes a directive.

A code block that reaches the end of its container or document without a closing fence ends there (MU1011, warning); trailing blank lines are not part of it.

### 5.8 Tables

A table is a **header row** followed by a **delimiter row** and zero or more body rows:

```markup
| Name  | Score |
|:------|------:|
| Ada   |    10 |
```

- The delimiter row consists of cells of `-` with optional leading and/or trailing `:` (left, right, both = center), separated by `|`, with optional outer pipes.
- The header row is the last line of the paragraph directly above; earlier lines of that paragraph remain a paragraph. Link reference definitions are extracted first.
- The header and delimiter rows MUST have the same number of cells, and one of them MUST contain a `|`. Otherwise the line is not a delimiter row.
- Cells are split on unescaped `|`; outer pipes and whitespace are trimmed. `\|` is a literal pipe, also inside code spans in a cell.
- Body rows continue until a blank line or a line that starts another block. Missing cells are empty; extra cells are dropped (MU1014).

### 5.9 Comments

A line beginning with `<!--` opens a comment that runs to the line containing `-->`. If `-->` is on the opening line and followed by more text, the line is not a comment block but a paragraph with an inline comment (§8.12). Text after `-->` on the closing line of a multi-line comment is part of the comment (MU1012). An unclosed comment runs to the end of its container (MU1012). Comments are kept in the tree and never rendered.

### 5.10 Link reference definitions

```ebnf
definition = "[" label "]" ":" ws-nl destination ( ws-nl title )? whitespace* line-end ;
```

At the start of a paragraph, lines of the form `[label]: destination "title"` define link references and are removed from the paragraph. Labels are matched case-insensitively after collapsing whitespace. The title may be on the next line. When a label is defined twice, the first definition wins (MU2024). Definitions are not rendered.

### 5.11 Footnote definitions

`[^label]:` at the start of a line opens a footnote definition container; the rest of the line starts its content. Continuation lines are indented by at least two columns (or are lazy paragraph continuations). Labels contain no whitespace or `]`. A footnote definition cannot interrupt a paragraph, except one made only of link reference definitions. Duplicates: first wins (MU2024).

## 6. Directives

Directives are MarkUP's extension mechanism: named components with an optional **label** and optional **attributes**. There are three forms:

| Form | Syntax | Placement |
|---|---|---|
| container | `:::name[label]{attributes}` … `:::` | block, with a body |
| leaf | `::name[label]{attributes}` | a whole line |
| inline | `:name[label]{attributes}` | inside inline content |

### 6.1 Names

```ebnf
name = letter ( letter | digit | "-" | "_" )* ;   (* ASCII *)
```

Names are case-sensitive. By convention they are lowercase.

### 6.2 Container directives

```ebnf
open-fence  = ":"{3,} name label? attributes? whitespace* ;
close-fence = ":"{3,} whitespace* ;
label       = "[" label-text "]" ;          (* single line; balanced [ ]; \-escapes; `code` spans skipped *)
```

The **opening fence** may be indented and may appear inside any container or interrupt a paragraph. The name must follow the colons directly. As a courtesy to Pandoc users, `::: name` (whitespace before the name) is accepted with a warning and a fix (MU1006).

- The label is inline content (§8), used as the component's title. An unclosed label runs to the end of the line (MU1007).
- The attribute block must close on the same line (MU1008).
- Anything else after the name, label and attributes is an error (MU1005). When there is no label, the parser SHOULD offer a fix that turns the trailing text into a label: `:::card Title` → `:::card[Title]`.
- `:::` followed by `{` or `[` without a name is not a directive (MU1013).

The **content model** of the component (§6.3) decides how the body is read.

### 6.3 Content models

A component specification (§10) declares one of:

- **flow** (the default, and the model of unknown names): the body is MarkUP blocks, parsed by the ordinary block algorithm. The directive is a container that always continues (§5.1).
- **data**: the body is MarkUP Data (§9). The lines are collected verbatim (minus the fence's indentation) until the closing fence and then parsed.
- **raw**: the body is literal text, collected like data.

The content model MUST be known when the opening fence is read. A parser therefore receives the registry of component specifications as input (§10).

### 6.4 Closing fences

**Data and raw bodies** end at the first line consisting only of at least as many colons as the opening fence, at any indentation. Nothing else is special inside them.

**Flow bodies.** A line consisting only of three or more colons is a *closing fence*. After the continuation step (§5.1) let *C* be the deepest matched container, skipping lists (which are transparent here).

1. If *C* is not a container directive, the fence is **stray** (MU1003) and is read as paragraph text. If a directive is open further up — for example the fence is indented inside a list item that is inside the directive — the diagnostic points at that directive: a closing fence must be at the same nesting level (same list item, same block quote) as its opening fence.
2. Otherwise consider the chain of directives starting at *C* and going up through directly nested directives. The fence closes the innermost directive of that chain **whose opening fence has exactly as many colons**. If there is none, it closes *C* itself if *C*'s opening fence is not longer than the closing fence.
3. If *C*'s opening fence is longer and no directive matches exactly, the fence is **too short** (MU1004) and is read as text. A fix to lengthen it SHOULD be offered.
4. Directives between *C* and the one being closed are closed implicitly (MU1002 for each).

In practice: nest by using more colons outside (`::::tabs` around `:::tab`), or the same number with every directive closed in order — both work.

```markup
::::tabs
:::tab[npm]
npm install
:::
:::tab[pnpm]
pnpm add
:::
::::
```

**Unclosed directives.** A directive that is still open at the end of the document is closed there (MU1001). A directive closed because an enclosing container ended (a block quote without `>`, a list item that lost its indentation) is closed implicitly (MU1002). In both cases a fix inserting the missing fence SHOULD be offered. When an unclosed code block inside a directive swallowed the rest of the document, the diagnostic SHOULD point at that code block.

### 6.5 Leaf directives

```ebnf
leaf = "::" name label? attributes? whitespace* ;
```

Exactly two colons, alone on their line (anything after is MU1005). Leaf directives may interrupt paragraphs.

### 6.6 Inline directives

```ebnf
inline-directive = ":" name ( label attributes? | attributes ) ;
```

- The colon MUST NOT follow a letter, digit or another colon (`ratio 3:1`, `word:name[x]`, `::name` in text are not directives).
- At least one of label and attributes is required (`:smile:` is text).
- The label may span soft line breaks inside its paragraph and nests balanced brackets; `\]` escapes a bracket and code spans are skipped when looking for the end.
- Labels are inline content unless the component's label model is **raw** (e.g. `kbd`), in which case the label is literal text with backslash escapes resolved.
- An unterminated label or attribute block is text; for known components the parser reports MU1007/MU1008.
- Inline directive labels nest at most 32 levels deep (MU1015).

### 6.7 Unknown directives

A directive whose name is not registered is parsed as a flow container (or as a leaf/inline directive), kept in the tree and reported by validation (MU2001, warning) with a “did you mean” suggestion when a registered name is within a small edit distance (Damerau-Levenshtein, at most ⌊length/3⌋, minimum 1). Renderers MUST NOT drop unknown directives' content (§13.3).

## 7. Attributes

```ebnf
attributes = "{" ( ws* item )* ws* "}" ;
item       = "#" ident                     (* id *)
           | "." ident                     (* class *)
           | key ( "=" value )? ;          (* pair or flag *)
key        = ( letter | "_" ) ( letter | digit | "_" | ":" | "." | "-" )* ;
value      = '"' ( [^"\\] | '\"' | '\\' )* '"'
           | "'" ( [^'\\] | "\'" | '\\' )* "'"
           | unquoted ;                     (* no whitespace, quotes, "=", "`", "{", "}", "," *)
ws         = whitespace | "," | line break ;
```

- Items are separated by whitespace; commas are accepted as separators: `{type=bar, title=Sales}`.
- A bare key is a flag with the value `true`.
- The last `#id` wins; classes accumulate; for other keys the last value wins. Repeating a key or id is a warning (MU1010).
- Errors inside the block (MU1009) are reported with precise ranges and the parser continues with the next item.
- Keys are stored in a map without prototype semantics: `__proto__` is an ordinary key.

**Where attributes appear:** directives (anywhere after the name or label), headings (§5.3), code fence info strings (§5.7) and images, directly after the closing parenthesis: `![Logo](logo.png){width=120 .round}`. For headings and images, a block is only read as attributes when its first item is `#id`, `.class` or `key=value`.

## 8. Inline content

Inline content is read left to right. Precedence, from highest: code spans, autolinks and comments, backslash escapes and character references, links and images, emphasis. The rules are those of CommonMark except where stated.

### 8.1 Backslash escapes

A backslash before an ASCII punctuation character makes it literal: `\*not emphasis\*`. Before any other character the backslash is literal. A backslash at the end of a line is a hard line break.

### 8.2 Character references

`&name;` for a curated set of named references (the common typographic, currency, arrow, math, Greek and Latin-1 letters), `&#123;` (1–7 decimal digits) and `&#x1F600;` (1–6 hex digits). Invalid code points (0, surrogates, > U+10FFFF) become U+FFFD. Unknown names are literal text. Names are looked up as own properties only (`&constructor;` is text).

### 8.3 Code spans

A run of *n* backticks opens a code span closed by the next run of exactly *n* backticks. Line breaks become spaces. If the content starts and ends with a space and is not only spaces, one space is removed from each side. Nothing inside a code span is interpreted. Unmatched runs are literal.

### 8.4 Emphasis and strong emphasis

`*` and `_` delimiter runs follow the CommonMark flanking rules, using Unicode whitespace and Unicode punctuation (categories P and S). `_` cannot open or close inside words. Pairs are resolved with the CommonMark delimiter-stack algorithm, including the “rule of three”. One delimiter makes emphasis, two make strong emphasis; `***x***` is emphasis around strong.

Emphasis nests at most 32 levels deep; deeper delimiters stay literal.

### 8.5 Strikethrough

Exactly two tildes `~~` open and close strikethrough (flanking rules as for `*`). Runs of one or three or more tildes are literal.

### 8.6 Links and images

- **Inline:** `[text](destination "title")`. The destination may be `<…>` or raw with balanced parentheses (at most 32 levels). The title is `"…"`, `'…'` or `(…)`. Whitespace (including one line break) may separate the parts.
- **Reference:** `[text][label]`, collapsed `[text][]`, shortcut `[text]` — only when the label is defined (§5.10). An undefined full reference leaves the brackets as text.
- **Images** use `![alt](…)`; the alt text is the plain text of the bracketed content. An attribute block may follow (§7).
- Links cannot contain links: when a link is formed, earlier unclosed `[` openers are deactivated, and nested bare URLs inside link text are unwrapped.

### 8.7 Autolinks

`<scheme:…>` (scheme of 2–32 characters) and `<user@example.com>` (as `mailto:`).

### 8.8 Bare URLs

`http://`, `https://` and `www.` at the start of text or after whitespace, `(`, `*`, `_`, `~`, `"` or `'` become links. The URL runs to whitespace or `<`; then trailing `?!.,:*_~'"` are removed, trailing `)` are removed while unbalanced, and a trailing entity-like `&name;` is removed. `www.` URLs get `http://` and must contain a dot after `www.`.

### 8.9 Footnote references

`[^label]` is a footnote reference. Validation reports references without definitions (MU2021) and definitions never referenced (MU2022, hint).

### 8.10 Line breaks

A line break inside a paragraph is a *soft break*, kept as `\n` in text. Two or more spaces before it, or a backslash, make a *hard break*. Other trailing spaces and the next line's leading whitespace are removed.

### 8.11 No raw HTML

MarkUP has **no raw HTML**. `<div>` is literal text; renderers escape it. This keeps documents portable to non-HTML renderers and makes previews safe by construction. Structure that would need HTML is expressed with components.

### 8.12 Inline comments

`<!-- … -->` inside a paragraph is an inline comment node (not rendered). An unclosed `<!--` is text.

## 9. MarkUP Data

MarkUP Data is a strict, positioned subset of YAML, used for front matter and data bodies.

```ebnf
document  = node? ;
node      = mapping | sequence | scalar ;
mapping   = ( key ":" ( ws value | ws? line-end nested ) )+ ;       (* same indentation *)
sequence  = ( "-" ( ws value | ws? line-end nested ) )+ ;           (* same indentation *)
key       = plain-key | quoted ;
value     = flow-seq | quoted | literal | plain ;
flow-seq  = "[" ( value ( "," value )* ","? )? "]" ;                 (* single line *)
literal   = "|" ( "-" | "+" )? ;                                    (* followed by more-indented lines *)
```

- **Indentation** uses spaces only; a tab in indentation is an error (MU1503) and counts as one space.
- A **mapping** entry is `key:` followed by whitespace or the end of the line. A value on the following lines is more indented, or a sequence at the same indentation (`list:` then `- a`).
- **Sequences** of mappings: `- name: x` followed by keys aligned with `name`.
- **Plain scalars** run to the end of the line or ` #` (a comment). They resolve to: `null`, `Null`, `NULL`, `~` or empty → null; `true`/`false` in any case → booleans; numbers matching `-?(0|[1-9][0-9_]*)(\.[0-9]+)?([eE][-+]?[0-9]+)?` (and `.5`) → numbers; anything else → string. Numbers with leading zeros (`01234`) stay strings; `yes`, `no`, `on` are strings.
- **Quoted scalars:** `"…"` with escapes `\" \\ \/ \n \t \r \0 \b \f \xNN \uNNNN`; `'…'` with `''` for a quote. After a closing quote only whitespace and a comment may follow.
- **Literal blocks** `|` keep the following more-indented lines verbatim (relative to the first one), with one final newline; `|-` has none; `|+` keeps it.
- Colons inside plain values are fine: `url: https://example.com:8080`.
- Not supported (errors, MU1501): flow mappings `{…}`, folded scalars `>`, multi-line flow sequences. Anchors, aliases and tags have no meaning and are read as plain text.
- Duplicate keys are errors (MU1502); the later entry is dropped.
- Nesting is limited to 128 levels.

## 10. Component specifications and validation

### 10.1 Specifications

A component is described by a specification with:

| Field | Meaning |
|---|---|
| `name` | directive name |
| `forms` | allowed forms: `container`, `leaf`, `inline` (first is preferred) |
| `content` | `flow`, `data` or `raw` for the container form |
| `label` | `required`, `optional` or `none`; label model `inline` or `raw` |
| `attributes` | map of attribute name → schema |
| `data` | schema of a data body |
| `bodyRequired` | the container needs a non-empty body |
| `allowedParents` | the directive must be a direct child of one of these |
| `allowedChildren` | a flow body may only contain these directives (and comments) |
| `validate` | extra checks, e.g. chart series lengths |

The set of specifications is the **registry**. Implementations ship the built-in components listed in [components.md](components.md); plugins add or replace specifications by name.

### 10.2 Schemas

Schemas are declarative: `string` (min/max length, pattern), `number` (min, max, integer), `boolean`, `enum`, `array` (items, min/max items), `record` (values), `object` (properties, additional keys allowed or not), `union`, `any`. A property is required unless it is optional or has a default.

**Attribute coercion.** Attribute values are strings (or `true` for flags) and are converted: numbers with `Number()` after trimming; booleans from a flag, `true`, `false` or an empty value; enums must match exactly. Unions try options in order.

**Data validation** checks the data tree; plain numbers and booleans are accepted where strings are expected. Unknown keys of an `object` are reported on the key with a suggestion.

### 10.3 Rules

For every directive, validation reports:

- MU2001 unknown component (§6.7);
- MU2002 form not allowed;
- MU2006 missing required label; MU2007 label on a component without labels (with a removal fix);
- MU2003 unknown attribute (with a suggestion) — `#id` and `.class` are always allowed; MU2004 invalid value (enum suggestions); MU2005 missing required attribute (for `data` components, required values may come from the body);
- MU2010 data body not matching the schema; MU2011 missing body;
- MU2008 wrong parent; MU2009 disallowed child.

Document rules:

- MU2020 duplicate explicit id;
- MU2021 / MU2022 footnotes (§8.9);
- MU2023 unsafe URL in a link, image or definition (§13.2);
- MU2025 `#fragment` link that matches no anchor (§11), with a suggestion.

## 11. Anchors

Every heading has an id. An explicit `{#id}` wins. Otherwise the id is the **slug** of the heading's plain text:

1. trim; lowercase;
2. remove every character that is not a letter, mark, number, connector punctuation (`_`), hyphen or space;
3. replace each space with `-`;
4. an empty slug becomes `section`.

Explicit ids anywhere in the document (headings, directives, images) are reserved first. Generated slugs are made unique in document order: the second `a` is `a-1`, the third `a-2`; a slug that is taken gets the next free suffix.

The anchors of a document are the heading ids plus every explicit id.

## 12. Diagnostics and error recovery

Every diagnostic has a **code**, a **severity** (`error`, `warning`, `info`, `hint`), a **range**, a message, optional **related locations** and optional **fixes** (lists of text edits). The catalogue is in [errors.md](errors.md):

- `MU1xxx` syntax, `MU15xx` MarkUP Data, `MU2xxx` validation, `MU9xxx` internal.

Recovery principles, which every conforming parser MUST follow:

- **Never fail.** Every input yields a complete tree.
- **Keep the author's text.** Unrecognised syntax becomes text; unknown components keep their content.
- **Close late, explain early.** Unclosed constructs run to the end of their container, and the diagnostic is placed on the opening syntax, with the likely cause as related information.
- **One problem, one diagnostic.** Cascading reports are avoided (for example `::: note` is accepted with a warning instead of producing a stray fence later).

## 13. Rendering

### 13.1 HTML mapping

The reference HTML renderer maps nodes as follows (attributes from `{…}` add `id` and `class`):

| Node | HTML |
|---|---|
| paragraph | `<p>` |
| heading | `<h1>`–`<h6>` with its id and an optional `#` anchor link |
| thematic break | `<hr>` |
| block quote | `<blockquote>` |
| list / item | `<ul>` or `<ol start>`, `<li>`; tight lists render paragraph content without `<p>`; tasks get a disabled checkbox |
| code | `<pre><code class="language-x">`; with a `title` attribute, wrapped in `<figure>` with a caption |
| table | `<table>` in a scroll wrapper, `<thead>`/`<tbody>`, alignment as `text-align` |
| emphasis / strong / strikethrough / code span | `<em>` / `<strong>` / `<del>` / `<code>` |
| link / image | `<a href title>` / `<img src alt title width height loading="lazy">` (dimensions only when numeric, optionally `px` or `%`) |
| hard break | `<br>` |
| footnotes | numbered `<sup>` links in reference order; a closing section with back-links |
| comments, definitions | nothing |

All text and attribute values are HTML-escaped. No `on*` or `style` attribute is ever produced from document content.

### 13.2 URL safety

A URL is **safe** when, after removing ASCII control characters and whitespace, it is empty, relative, a fragment, a query, or uses `http:`, `https:`, `mailto:`, `tel:` or `ftp:`; for images, `data:image/(png|gif|jpeg|jpg|webp|avif|svg+xml);` is also safe. Unsafe links render their content without a link; unsafe images render their alt text.

### 13.3 Components

Renderers implement components by name. A component used in a form its specification does not allow, or an unknown component, is rendered generically: a container element carrying the name, the label and the rendered body, so no content is lost. A failing component implementation MUST NOT break the rest of the document.

### 13.4 Complete documents

When producing a standalone page, the title comes from front matter `title`, else the first heading; `description` becomes a meta description; `lang` (a valid language tag) sets the page language.

## 14. Differences from CommonMark

MarkUP is Markdown-compatible in spirit: typical Markdown documents read the same. The deliberate differences are:

| CommonMark | MarkUP | Why |
|---|---|---|
| Indented code blocks | none; indentation is free | lets authors indent directive content; fenced code is clearer |
| Raw HTML (blocks and inline) | literal text, except comments and autolinks | renderer independence and safe previews; components replace HTML |
| Full HTML5 entity table | curated set + numeric | no raw HTML, so the long tail is rarely useful |
| — | directives, attributes, front matter, tables, strikethrough, task lists, footnotes, bare URLs | the extensions people expect, with one consistent syntax |
| Headings, lists etc. need ≤ 3 spaces of indentation | any indentation | follows from having no indented code |

## 15. Examples

**Small.**

```markup
Press :kbd[Ctrl+S] to save. :badge[new]{variant=success}
```

→ an inline `kbd` directive with the raw label `Ctrl+S`, text, and a `badge` with the label `new` and the attribute `variant=success`.

```markup
:::note
Nested **content**.
:::
```

→ a container directive `note` whose flow body is one paragraph.

**Nesting and recovery.**

```markup
::::columns
:::column
A
:::column
B
:::
::::
```

The second `:::column` opens inside the first (it is not a closing fence). The `:::` closes the inner column; `::::` then closes `columns` exactly and the outer column implicitly (MU1002). Validation adds MU2008 because the inner column's parent is a column.

**Data.**

```markup
:::chart{type=line}
labels: [Q1, Q2, Q3]
series:
  - name: 2026
    values: [12, 18, 25]
:::
```

→ a container directive `chart` with a data body `{labels: ["Q1","Q2","Q3"], series: [{name: 2026, values: [12,18,25]}]}` and the attribute `type=line`.

**Complex.** See [`examples/showcase.markup`](../examples/showcase.markup) for a document using every construct, and the test suites under `packages/core/test` for hundreds of precise input/output pairs.

---

## Appendix A: syntax tree

All nodes have `type` and `position`. Field names follow mdast where concepts overlap.

| Node | Fields |
|---|---|
| `document` | `frontMatter` (`frontMatter` or null), `children` |
| `frontMatter` | `value` (data node or null), `raw` |
| `paragraph` | `children` |
| `heading` | `depth` 1–6, `style` `atx`/`setext`, `attributes`, `children` |
| `thematicBreak` | — |
| `blockquote` | `children` |
| `list` | `ordered`, `start`, `spread`, `children` (listItem) |
| `listItem` | `checked` (true/false/null), `spread`, `marker`, `children` |
| `code` | `lang`, `meta`, `attributes`, `value`, `closed` |
| `table` | `align` (left/center/right/null per column), `children` (tableRow) |
| `tableRow` | `head`, `children` (tableCell) |
| `tableCell` | `children` |
| `comment` | `value`, `closed` |
| `definition` | `label`, `identifier`, `url`, `title` |
| `footnoteDefinition` | `label`, `identifier`, `children` |
| `containerDirective` | `name`, `nameRange`, `label`, `rawLabel`, `labelRange`, `attributes`, `fence`, `body`, `closed`, `openRange`, `closeRange` |
| `leafDirective`, `inlineDirective` | `name`, `nameRange`, `label`, `rawLabel`, `labelRange`, `attributes` |
| `text` | `value` |
| `emphasis`, `strong`, `delete` | `children` |
| `inlineCode` | `value` |
| `break` | — |
| `link` | `kind` (inline/reference/autolink/bare), `url`, `title`, `children` |
| `image` | `url`, `title`, `alt`, `attributes` |
| `footnoteReference` | `label`, `identifier` |

A directive `body` is `{kind: "flow", children}`, `{kind: "data", value, raw, range}` or `{kind: "raw", value, range}`.

`attributes` is `{id, classes, values, items, range}` where `values` holds pairs and flags and `items` lists every item as written, with the ranges of keys and values.

Data nodes are `{kind: "map", entries: [{key, keyRange, value, range}], range}`, `{kind: "seq", items, flow, range}` and `{kind: "scalar", value, style, range}`.
