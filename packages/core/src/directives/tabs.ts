import type { TabEntry, Tabs } from '../ast/nodes';
import { diagnostic } from '../diagnostics';
import type { Line } from '../parser/scanner';
import { spanLines } from '../parser/scanner';
import type { DirectiveHandler } from './registry';
import type { DirectiveSchema } from './types';

export const tabsSchema: DirectiveSchema = {
  name: 'tabs',
  description: 'Conjunto de abas, cada uma introduzida por um heading "### Título" dentro do corpo.',
  hasBody: true,
  bodyDescription: 'Uma seção "### Título" por aba, seguida do conteúdo Markdown dessa aba.',
  attributes: [],
};

// Cada aba é introduzida por um heading de nível 3 dentro do corpo:
//
//   :::tabs
//   ### Python
//   ```python
//   print("hello")
//   ```
//   ### JavaScript
//   ```javascript
//   console.log("hello")
//   ```
//   :::
const TAB_HEADING_RE = /^\s{0,3}###\s+(.*?)\s*$/;

export const buildTabs: DirectiveHandler = (_attrs, input, ctx) => {
  const diagnostics = [];
  const sections: { title: string; lines: Line[] }[] = [];
  let current: { title: string; lines: Line[] } | null = null;
  const preamble: Line[] = [];

  for (const line of input.bodyLines) {
    const heading = TAB_HEADING_RE.exec(line.text);
    if (heading) {
      if (current) sections.push(current);
      current = { title: heading[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  }
  if (current) sections.push(current);

  if (preamble.some((l) => l.text.trim().length > 0)) {
    diagnostics.push(
      diagnostic(
        'warning',
        'tabs-content-before-heading',
        'Conteudo antes do primeiro "### Titulo" dentro de ":::tabs" foi ignorado.',
        spanLines(preamble[0], preamble[preamble.length - 1]),
      ),
    );
  }
  if (sections.length === 0) {
    diagnostics.push(diagnostic('warning', 'tabs-empty', 'Diretiva ":::tabs" sem nenhuma aba ("### Titulo").', input.position));
  }

  const tabs: TabEntry[] = sections.map((s) => ({ title: s.title, children: ctx.parseBlocks(s.lines) }));

  const node: Tabs = { type: 'tabs', tabs, position: input.position };
  return { node, diagnostics };
};
