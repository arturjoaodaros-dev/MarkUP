# The `markup` command

```text
markup <command> [options]
```

| Command | What it does |
|---|---|
| `render <file\|->` | Render one document to stdout (or `--out`) |
| `build <paths…>` | Build standalone HTML pages from files and folders |
| `check <paths…>` | Report errors and warnings |
| `preview <file>` | Live-reloading preview in the browser |
| `components [name]` | List components, or describe one |

**Exit codes:** `0` success · `1` the documents have errors (or too many warnings with `--max-warnings`) · `2` usage error (bad option, missing file).

Colours are used when stdout is a terminal; `NO_COLOR` or `--no-color` turns them off.

## render

```sh
markup render guide.markup                    # HTML fragment
markup render guide.markup --standalone -o guide.html
markup render guide.markup -f text            # plain text
markup render guide.markup -f ast             # the syntax tree as JSON
markup render guide.markup -f json            # tree and diagnostics
cat guide.markup | markup render - -f text    # from stdin
```

Errors are printed to stderr, so stdout stays clean for pipes.

| Option | |
|---|---|
| `-f, --format` | `html` (default), `text`, `ast`, `json` |
| `-o, --out <file>` | write to a file |
| `--standalone` | a complete page with the theme (HTML only) |
| `--theme` | `auto` (follows the reader's system), `light`, `dark` |

## build

```sh
markup build docs --out site
markup build README.md guide.markup --out site --theme light
markup build docs --out site --watch
```

Every `.markup`, `.mkup` and `.md` file under the given paths becomes a page, keeping the folder structure relative to their common parent. Links between documents are rewritten: `[Next](guide.markup#install)` points at `guide.html#install`. Folders named `node_modules`, `dist`, `out` and hidden folders are skipped.

Pages with errors are still written, and the command exits with `1`.

| Option | |
|---|---|
| `-o, --out <dir>` | output folder (default `out`, or `out` from the config) |
| `-w, --watch` | rebuild when files change |
| `--css` | also write `markup.css` (the theme) next to the pages |
| `--theme` | `auto`, `light`, `dark` |

## check

```sh
markup check                         # the current folder
markup check docs README.md
markup check docs --max-warnings 0   # warnings fail the build too
markup check docs --format json      # for tools
```

Each problem is printed with its code, position and a code frame, plus the suggested fix:

```text
docs/guide.markup:8:4 warning MU2001 Unknown component `nott` — did you mean `note`? It is rendered as a plain container.
  |
8 | :::nott
  |    ^^^^
  fix: Change to `note`
```

The JSON format is `{ files: [{ file, diagnostics: [...] }], summary: { files, errors, warnings, others } }`, with diagnostics exactly as in the [specification](spec.md#12-diagnostics-and-error-recovery).

## preview

```sh
markup preview guide.markup --open
markup preview guide.markup --port 5000
```

Serves the rendered document at `http://localhost:4000` (or the next free port), reloads the page when the file changes, and keeps the scroll position. Images and other files next to the document are served too. Problems appear in a panel in the page and in the terminal.

## components

```sh
markup components          # list
markup components chart    # attributes, types, defaults, examples
```

## Configuration

`markup.config.json` in the working directory (or `--config <path>`):

```json
{
  "plugins": ["./plugins/youtube.mjs"],
  "out": "site",
  "theme": "auto"
}
```

`plugins` are module paths relative to the config file. `--plugin <path>` adds more (repeatable). See [extending.md](extending.md).
