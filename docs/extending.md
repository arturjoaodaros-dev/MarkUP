# Extending MarkUP

A component has two halves:

1. a **spec** — language level: name, forms, label, typed attributes, content model, structure rules. The parser, the validator, editors and the docs use it.
2. **renderers** — output level: a function per output format (`html`, `text`, …).

A **plugin** bundles both. Nothing in the parser changes when you add a component.

## A complete example

[`examples/plugins/video.mjs`](../examples/plugins/video.mjs) adds `::video{youtube=…}`. The essentials:

```js
import { definePlugin, defineDirective, s } from '@markup-lang/core';

const video = defineDirective({
  name: 'video',
  forms: ['leaf'],                                  // ::video — no body
  description: 'An embedded YouTube or Vimeo video.',
  label: { use: 'optional', description: 'Caption.' },
  attributes: {
    youtube: s.string({ optional: true, pattern: /^[\w-]{11}$/, patternLabel: 'an 11-character YouTube id' }),
    vimeo: s.string({ optional: true, pattern: /^\d+$/ }),
    start: s.number({ integer: true, min: 0, optional: true }),
  },
  validate(node, ctx) {                            // rules the schema cannot express
    const keys = Object.keys(node.attributes?.values ?? {});
    if (keys.filter((k) => k === 'youtube' || k === 'vimeo').length !== 1) {
      ctx.report('MU2005', node.nameRange, 'A video needs exactly one of `youtube` or `vimeo`.');
    }
  },
});

export default definePlugin({
  name: 'video',
  directives: [video],
  renderers: {
    html: {
      video(node, ctx) {
        const { youtube, start } = ctx.props(node);  // typed, defaults applied
        return `<figure${ctx.rootAttributes(node, ['mu-video'])}><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtube)}"></iframe></figure>\n`;
      },
    },
    text: { video: (node, ctx) => `[Video: ${ctx.label(node)}]` },
  },
});
```

Use it:

```sh
markup render talk.markup --plugin examples/plugins/video.mjs
```

or permanently, in `markup.config.json`:

```json
{ "plugins": ["./examples/plugins/video.mjs"] }
```

The CLI, the language server (and therefore VS Code, in trusted workspaces) read the same config. With the plugin loaded, `::video` gets completion, hover docs, attribute validation with positions, and rendering.

## Specs

| Field | |
|---|---|
| `name` | `[A-Za-z][A-Za-z0-9_-]*` |
| `forms` | any of `container`, `leaf`, `inline`; the first is used for snippets |
| `description` | shown in hovers, completion and generated docs |
| `category` | groups the reference docs |
| `label` | `{ use: 'required' \| 'optional' \| 'none', model?: 'inline' \| 'raw', description? }` |
| `attributes` | `{ key: Schema }`; `#id` and `.class` are always accepted |
| `additionalAttributes` | accept undeclared attributes silently |
| `content` | `flow` (MarkUP blocks, the default), `data` (MarkUP Data) or `raw` (literal text) |
| `data` | schema of the data body |
| `bodyRequired` | report an empty body |
| `allowedParents` / `allowedChildren` | structure rules, e.g. `tab` only inside `tabs` |
| `examples` | `{ title?, source }[]` — must produce no diagnostics (the test suite checks built-ins) |
| `snippet` | editor snippet in LSP syntax (`${1:placeholder}`, `${1\|a,b\|}`, `$0`) |
| `validate` | `(node, ctx) => void`; call `ctx.report(code, range, message, options?)` |

Plugins may **replace** a built-in by registering a spec with the same name.

### Content models

The content model decides how the body is *parsed*, so it must be in the spec, not in a renderer. A `raw` component receives its body verbatim — useful for diagrams or math:

```js
defineDirective({ name: 'mermaid', forms: ['container'], content: 'raw', description: 'A Mermaid diagram.' });
```

```markup
:::mermaid
graph LR
  A --> B
:::
```

`node.body` is then `{ kind: 'raw', value: 'graph LR\n  A --> B' }`. A `data` component receives `{ kind: 'data', value: DataNode }`; `ctx.data(node)` in the HTML renderer returns it as plain objects merged over the typed attributes.

### Schemas

```js
s.string({ minLength, maxLength, pattern, patternLabel })
s.number({ min, max, integer })
s.boolean()
s.enum(['a', 'b'], { valueDescriptions })
s.array(items, { minItems, maxItems })
s.record(values, { minEntries })       // map with any keys
s.object({ key: schema }, { additional })
s.union([schemaA, schemaB])
s.any()
```

Every builder takes `description`, `optional`, `default` and `example`. Descriptions matter: they are the documentation editors show.

## HTML renderers

```ts
type HtmlComponent = (node: Directive, ctx: HtmlContext) => string;
```

| `ctx.` | |
|---|---|
| `props(node)` | attributes coerced to their schema types, with defaults |
| `data(node)` | data body (plain objects) merged over `props` |
| `label(node)` / `labelText(node)` | rendered label HTML / plain text |
| `body(node)` | rendered flow body |
| `blocks(nodes)` / `inlines(nodes)` | render any nodes |
| `rootAttributes(node, classes, extra?)` | ` id="…" class="…"` plus `data-line` when source positions are on |
| `uniqueId(prefix)` | ids that are unique within the document |
| `headings()` | `{ id, depth, text, html }` of every heading |
| `escape(text)` / `safeUrl(url)` | always escape document text; `safeUrl` returns null for unsafe schemes |

Renderers must return HTML that is safe for any input: escape everything that comes from the document. A renderer that throws is replaced by an error box; the rest of the document still renders.

You can also pass components directly, without a plugin:

```ts
import { markupToHtml } from '@markup-lang/html';
markupToHtml(source, { components: { note: (node, ctx) => `<div class="my-note">${ctx.body(node)}</div>` } });
```

## Other renderers

The tree is plain data (see the [specification](spec.md#appendix-a-syntax-tree)), so a new output format is a tree walk. `@markup-lang/text` is a complete second renderer in about 150 lines and is a good template. Use `renderers.<id>` in plugins for your format and look components up by name.

## Using the core directly

```ts
import { parse, visit, collectAnchors } from '@markup-lang/core';

const { document, diagnostics } = parse(source, { plugins });
visit(document, (node) => {
  if (node.type === 'link') console.log(node.url);
});
```

`parse` never throws; every node has a `position` with line, column and offset.
