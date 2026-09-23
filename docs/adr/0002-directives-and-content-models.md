# ADR 0002 — Directive syntax and content models

**Status:** accepted

## Context

Components need a syntax that reads well as plain text, nests, carries a title and options, and can hold either prose or data (a chart's numbers are not paragraphs).

## Decision

**Syntax.** Adopt the “generic directives” proposal discussed in the CommonMark community (also used by remark-directive), and pin down what it leaves open:

- `:name[label]{attrs}` inline, `::name[label]{attrs}` for a whole line, `:::name[label]{attrs}` … `:::` for blocks;
- a closing fence closes the innermost directive **at the same nesting level** whose fence length matches exactly, else the innermost one if its fence is not longer (spec §6.4). This makes both styles work: more colons outside, or the same number closed in order;
- fenced code inside a directive is opaque, so documentation can show `:::` inside code blocks inside tabs;
- `::: name` (Pandoc style) is accepted with a warning and a fix, to avoid cascades of errors for a common habit.

**Content models.** A spec declares how a container's body is parsed: `flow` (MarkUP blocks), `data` (MarkUP Data, a strict YAML subset) or `raw` (verbatim). The parser needs this to know where a body ends — `:::` inside raw text must not close anything — so it is part of the language, not the renderer.

**MarkUP Data** instead of full YAML: no implicit type surprises (`no` is a string, `01234` is a string), no anchors or tags, positions on every value, and clear errors. It covers what component bodies need: maps, lists, flow lists, scalars, literal blocks.

## Consequences

- One syntax for every component; editors can complete names, attributes and data keys from the specs.
- The parser depends on the registry of specs. Unknown names default to `flow`, so documents with unknown components still parse sensibly.
- Data schemas give positioned validation errors (`data.Tuesday: Expected a number` on the exact value).
