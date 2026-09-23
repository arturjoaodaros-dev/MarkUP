# ADR 0001 — Parser architecture

**Status:** accepted

## Context

MarkUP needs a parser that produces a fully positioned tree, never fails, explains errors precisely, runs fast enough to re-parse on every keystroke, and can be extended with new components. The textbook pipeline is *lexer → token stream → parser → AST*.

## Options

1. **Context-free lexer + grammar-driven parser** (or a parser generator). Markdown-like syntax defeats this: whether `*` is emphasis depends on the characters around it and on what else is open; `1.` is a list marker only at the start of a block; indentation belongs to whichever container is open; code spans take precedence over everything, link destinations are raw text. A lexer would need the parser's state to tokenise, which erases the separation it is meant to provide.
2. **Parser combinators / PEG.** Good for expressions, poor at Markdown's line-oriented containers, lazy continuation and error recovery; positions and recovery become ad hoc.
3. **Adopt an existing Markdown parser** (markdown-it, micromark) and bolt directives on. Fast to start, but their trees are HTML-oriented or event streams, their error model is "no errors", and the closing rules we want for directives (§6.4 of the spec) conflict with their extension hooks.
4. **Hand-written, layered parser** in the style of the CommonMark reference implementation.

## Decision

Option 4, organised in explicit layers:

- a **line scanner** (the block-level lexer) that produces lines with exact offsets;
- a **block parser** — a state machine with a stack of open blocks; each block kind declares how it continues and how it starts;
- an **inline parser** — one scan that tokenises and builds nodes, with the CommonMark delimiter-stack algorithm for emphasis;
- **sub-parsers with their own lexers** for attributes, code-fence info strings and MarkUP Data;
- a **validator** as a separate pass over the finished tree.

Components are data (specs), not grammar rules. The block parser consults the registry only for a directive's content model.

## Consequences

- Every construct has a precise, documented rule, and the tests exercise them one by one.
- Error recovery is local and deliberate (close late, report early, keep text).
- Performance is linear; a megabyte parses in a few hundred milliseconds.
- There is more code than a grammar file would be, and it must be read carefully when changed. The property-based tests (random documents, invariants on positions, determinism, line-ending independence) guard against regressions.
