# Contributing to MarkUP

Thanks for helping. Bug reports, documentation fixes, new components and editor improvements are all welcome.

## Reporting bugs

The most useful report is a **small MarkUP document**, what you expected, and what happened (the output of `markup render doc.markup -f json` is ideal). Parser crashes, hangs or slow documents are always bugs — please include the input.

## Making changes

1. Read [docs/development.md](docs/development.md) for the setup and how the workspace fits together.
2. For language changes, update [docs/spec.md](docs/spec.md) in the same pull request. If the change is not obviously right, open an issue first — syntax is hard to take back.
3. Add tests next to the code you change. Bug fixes need a test that failed before the fix.
4. Run `npm run check` (lint, types, tests) before pushing.

## Style

- TypeScript, strict. Prefer plain data and small functions; comment the *why*, not the *what*.
- User-facing messages are complete sentences that say what is wrong and, when possible, how to fix it.
- Diagnostic codes are stable: add new ones, never repurpose.
- Formatting is Prettier's (`npm run format`).

## Commit messages

Conventional style, imperative: `fix(core): close directives at the same nesting level`, `feat(desktop): add go to line`.
