# Development

## Setup

```sh
npm install
npm run check        # lint + type check + all tests
```

Node.js 22.12+. The desktop app's native build also needs Rust (see [desktop.md](desktop.md)).

## How the workspace is wired

Every library exports a `source` condition pointing at its TypeScript entry:

```json
"exports": { ".": { "source": "./src/index.ts", "types": "./dist/index.d.ts", "default": "./dist/index.js" } }
```

Vitest, Vite and esbuild resolve `source`, so **tests, the desktop dev server and the bundles always use current sources — no build step in between**. `tsc` type checks with `customConditions: ["source"]` as well. `npm run build` emits `dist/` for publishing and bundles the CLI, the language server and the extension.

Sources use `.ts` extensions in relative imports and only erasable TypeScript syntax, so scripts can run directly with `node --conditions=source file.ts`.

## Common tasks

| Task | Command |
|---|---|
| All checks | `npm run check` |
| Tests (watch) | `npm run test:watch` |
| One package | `npx vitest run packages/core` |
| Build everything | `npm run build` |
| CLI from source | `node --conditions=source packages/cli/src/bin.ts check examples` |
| Desktop in a browser | `npm run dev -w @markup-lang/desktop` |
| Desktop native | `npm run app:dev -w @markup-lang/desktop` |
| VS Code extension | `npm run package -w markup-lang`, or *Run Extension* in VS Code |
| Regenerate reference docs | `npm run docs:generate` |
| Documentation website | `npm run site` → `site/` (see `scripts/site/build.ts`) |
| Format | `npm run format` |

## Tests

| Where | What |
|---|---|
| `packages/core/test` | every construct, directives and recovery, attributes, MarkUP Data, schemas, validation, anchors, source positions, **property-based fuzzing**, **performance and pathological inputs**, adversarial documents |
| `packages/html/test` | HTML output, components, charts, security properties (fuzzed) |
| `packages/text/test` | text output and word counts |
| `packages/language-service/test` | completion, hover, outline, folding, highlighting, navigation, fixes |
| `packages/language-server/test` | a real server process over stdio |
| `packages/cli/test` | every command in-process, plus the binary with exit codes |
| `packages/vscode/test` | the TextMate grammar through `vscode-textmate` |
| `packages/desktop/test` | workbench actions, the in-memory file system, helpers (jsdom) |
| `scripts/*.test.ts` | generated docs are current |
| `examples/**/*.test.ts` | the example plugin end to end |

When you fix a bug, add the input that triggered it to the tests of the relevant package.

## Changing the language

1. Update [spec.md](spec.md) first — the specification is the contract.
2. Change the parser and add tests for the new rule *and* for the inputs around it.
3. If a diagnostic is added, give it a new code in `packages/core/src/diagnostics.ts`; never reuse a code.
4. Run `npm run docs:generate` if component specs or diagnostics changed.
5. Check the TextMate grammar (`packages/vscode/syntaxes/grammar.mjs`) still colors the syntax.

## Adding a built-in component

1. Add its spec to `packages/core/src/directives/builtins.ts` with a description, attribute descriptions, an example and a snippet (the built-ins test enforces these).
2. Add its HTML renderer to `packages/html/src/components.ts` and styles to `packages/html/src/theme.ts`; add a text rendering if the default is not good enough.
3. `npm run docs:generate`.

## Releasing

- Libraries: `npm run build`, then `npm publish -w <package>`.
- CLI: `npm publish -w @markup-lang/cli` (the bundle has no runtime dependencies).
- VS Code: `npm run package -w markup-lang`, then `vsce publish` from `packages/vscode`.
- Desktop: `npm run app:build -w @markup-lang/desktop` on each target platform.
- Website and downloads: bump the versions named in `docs/installation.md` (and `tauri.conf.json` for a new desktop release), then push to `main`.
  - Vercel builds the site and the VSIX (`vercel.json`) and serves them at [markup.rweb.site](https://markup.rweb.site).
  - The *Desktop release* workflow builds the Windows installers once per desktop version and publishes them as the latest GitHub release; the site's `downloads/MarkUP-*` links redirect there. Run the workflow by hand to rebuild the current version.
  - Locally, `npm run site -- --require-downloads` builds the whole site with every download after the desktop and VSIX builds.
