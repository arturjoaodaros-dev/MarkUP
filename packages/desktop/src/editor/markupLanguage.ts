// Highlighting do editor: Markdown padrão vem do pacote oficial
// @codemirror/lang-markdown (não reinventa o que já existe e é mantido de
// verdade) — só a sintaxe própria das diretivas do MarkUP (`:::nome`,
// `chave="valor"`, o `:::` de fechamento, `[[wikilink]]`) ganha uma camada
// extra própria, via MatchDecorator (API confirmada lendo o .d.ts real do
// pacote instalado, não por suposição — ver node_modules/@codemirror/view).
//
// v1 léxico/baseado em regex, não semântico via AST — @markup/core já tem
// posição exata de cada nó (usado pelo preview), então subir isso pra
// highlighting orientado por AST é uma extensão natural depois, não uma
// reforma. Poucas cores de propósito (missão: "não transforme a sintaxe
// num arco-íris") — só o suficiente pra diretivas serem reconhecíveis.

import { markdown } from '@codemirror/lang-markdown';
import { Decoration, EditorView, MatchDecorator, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { RangeSet } from '@codemirror/state';
import type { Extension } from '@codemirror/state';

const directiveFenceDeco = Decoration.mark({ class: 'mkd-cm-directive-fence' });
const directiveAttrKeyDeco = Decoration.mark({ class: 'mkd-cm-directive-attr-key' });
const directiveAttrValueDeco = Decoration.mark({ class: 'mkd-cm-directive-attr-value' });
const wikilinkDeco = Decoration.mark({ class: 'mkd-cm-wikilink' });

// `:::nome` (abertura) ou `:::` sozinho (fechamento).
const fenceMatcher = new MatchDecorator({
  regexp: /:::[A-Za-z][\w-]*|:::(?![A-Za-z])/g,
  decoration: directiveFenceDeco,
});

// `chave="valor"` — o nome do atributo e o valor entre aspas ganham decorações separadas.
const attrKeyMatcher = new MatchDecorator({
  regexp: /([A-Za-z][\w-]*)=(?=")/g,
  decorate(add, from, _to, match) {
    add(from, from + match[1].length, directiveAttrKeyDeco);
  },
});

const attrValueMatcher = new MatchDecorator({
  regexp: /"[^"\n]*"/g,
  decoration: directiveAttrValueDeco,
});

const wikilinkMatcher = new MatchDecorator({
  regexp: /\[\[[^\]\n]+\]\]/g,
  decoration: wikilinkDeco,
});

const MATCHERS = [fenceMatcher, attrKeyMatcher, attrValueMatcher, wikilinkMatcher];

/** Um único plugin, quatro matchers combinados via RangeSet.join — mais barato que quatro plugins separados fazendo update() a cada digitação. */
const markupDirectivesPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = RangeSet.join(MATCHERS.map((m) => m.createDeco(view)));
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = RangeSet.join(MATCHERS.map((m) => m.createDeco(update.view)));
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export function markupLanguageExtensions(): Extension[] {
  return [markdown(), markupDirectivesPlugin];
}
