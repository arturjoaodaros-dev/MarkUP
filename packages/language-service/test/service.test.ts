import { describe, expect, it } from 'vitest';
import { defineDirective } from '@markup-lang/core';
import {
  LanguageService,
  encodeSemanticTokens,
  getCodeActions,
  getCompletions,
  getDefinition,
  getDocumentLinks,
  getFoldingRanges,
  getHighlights,
  getHover,
  getReferences,
  getSemanticTokens,
  getSymbols,
  type CompletionResult,
} from '@markup-lang/language-service';

const service = new LanguageService();

/** Analyses `text` with `|` marking the cursor. */
function at(text: string) {
  const offset = text.indexOf('|');
  const source = text.slice(0, offset) + text.slice(offset + 1);
  return { analysis: service.analyze(source, `t${Math.random()}`), offset, source };
}

function labels(result: CompletionResult | null): string[] {
  return result?.items.map((i) => i.label) ?? [];
}

describe('completion', () => {
  it('completes container components after `:::`, with snippets', () => {
    const { analysis, offset } = at('Text\n\n:::no|');
    const result = getCompletions(analysis, offset)!;
    expect(result.from).toBe(offset - 5);
    expect(labels(result)).toContain('note');
    expect(labels(result)).not.toContain('kbd');
    const card = result.items.find((i) => i.label === 'card')!;
    expect(card).toMatchObject({ snippet: true, insertText: ':::card[${1:Title}]\n${2:Content}\n:::' });
    expect(card.documentation).toContain('**card**');
  });

  it('keeps extra colons and indentation in snippets', () => {
    const { analysis, offset } = at('- item\n  ::::|');
    const note = getCompletions(analysis, offset)!.items.find((i) => i.label === 'note')!;
    expect(note.insertText).toBe('::::note\n  ${1:Text}\n  ::::');
  });

  it('completes leaf components after `::`', () => {
    const { analysis, offset } = at('::|');
    expect(labels(getCompletions(analysis, offset))).toEqual(expect.arrayContaining(['toc', 'progress']));
    expect(labels(getCompletions(analysis, offset))).not.toContain('card');
  });

  it('completes inline components after `:`', () => {
    const { analysis, offset } = at('Press :k|');
    const result = getCompletions(analysis, offset)!;
    expect(labels(result)).toEqual(expect.arrayContaining(['kbd', 'badge', 'abbr', 'progress']));
    expect(result.from).toBe(offset - 2);
  });

  it('does not complete a colon inside words or times', () => {
    const { analysis, offset } = at('at 10:|');
    expect(getCompletions(analysis, offset)).toBeNull();
  });

  it('completes attribute names, skipping used ones', () => {
    const { analysis, offset } = at('::progress{value=3 |}');
    expect(labels(getCompletions(analysis, offset))).toEqual(['max', 'variant']);
  });

  it('completes enum and boolean attribute values', () => {
    const variant = at(':badge[x]{variant=su|');
    const result = getCompletions(variant.analysis, variant.offset)!;
    expect(labels(result)).toEqual(['neutral', 'info', 'success', 'warning', 'danger']);
    expect(result.from).toBe(variant.offset - 2);
    const open = at(':::details{open=|');
    expect(labels(getCompletions(open.analysis, open.offset))).toEqual(['true', 'false']);
  });

  it('completes data keys and values in chart bodies', () => {
    const top = at(':::chart\ntype: bar\n|\n:::');
    const keys = labels(getCompletions(top.analysis, top.offset));
    expect(keys).toContain('data');
    expect(keys).not.toContain('type');
    const value = at(':::chart\ntype: |\n:::');
    expect(labels(getCompletions(value.analysis, value.offset))).toEqual(['bar', 'line', 'area', 'pie', 'donut']);
    const nested = at(':::chart\nlabels: [a]\nseries:\n  - name: s\n    |\n:::');
    expect(labels(getCompletions(nested.analysis, nested.offset))).toEqual(['values', 'color']);
    const item = at(':::chart\nlabels: [a]\nseries:\n  - |\n:::');
    expect(labels(getCompletions(item.analysis, item.offset))).toEqual(['name', 'values', 'color']);
  });

  it('completes anchors, footnotes and code languages', () => {
    const anchor = at('# Getting started\n\n## Setup {#install}\n\n[go](#|)');
    expect(labels(getCompletions(anchor.analysis, anchor.offset))).toEqual(['getting-started', 'install']);
    const footnote = at('Text[^|\n\n[^note]: A note.');
    expect(labels(getCompletions(footnote.analysis, footnote.offset))).toEqual(['note']);
    const lang = at('```ty|');
    expect(labels(getCompletions(lang.analysis, lang.offset))).toContain('ts');
  });

  it('completes plugin components', () => {
    const plugin = { name: 'p', directives: [defineDirective({ name: 'youtube', forms: ['leaf'], description: 'Embed a video from YouTube.', attributes: {} })] };
    const custom = new LanguageService({ plugins: [plugin] });
    expect(labels(getCompletions(custom.analyze('::y'), 3))).toContain('youtube');
  });
});

describe('hover', () => {
  it('documents components, attributes and data keys', () => {
    const { analysis } = at(':::chart{unit=%}\ntype: bar\ndata:\n  a: 1\n:::|');
    expect(getHover(analysis, 5)!.contents).toContain('A chart rendered to static SVG');
    expect(getHover(analysis, 11)!.contents).toContain('**unit**');
    expect(getHover(analysis, analysis.text.indexOf('type'))!.contents).toContain('"bar" | "line"');
  });

  it('explains unknown components', () => {
    const { analysis } = at(':::mystery|\nx\n:::');
    expect(getHover(analysis, 5)!.contents).toContain('unknown component');
  });

  it('shows anchor targets and footnote text', () => {
    const { analysis } = at('# Intro\n\n[see](#intro) and[^1]\n\n[^1]: The note.|');
    expect(getHover(analysis, analysis.text.indexOf('[see') + 2)!.contents).toContain('heading **Intro**');
    expect(getHover(analysis, analysis.text.indexOf('[^1]') + 1)!.contents).toContain('The note.');
  });
});

describe('outline and folding', () => {
  const source = '---\ntitle: x\n---\n# A\n\n:::note[Hi]\n## Inside\n:::\n\n## B\n\n### B1\n\n# C\n';
  it('nests headings and components', () => {
    const symbols = getSymbols(service.analyze(source, 'outline'));
    const shape = (list: ReturnType<typeof getSymbols>): unknown => list.map((s) => [s.name, shape(s.children)]);
    expect(shape(symbols)).toEqual([
      ['Front matter', []],
      ['A', [['note: Hi', [['Inside', []]]], ['B', [['B1', []]]]]],
      ['C', []],
    ]);
  });

  it('folds sections, components, code and front matter', () => {
    const ranges = getFoldingRanges(service.analyze(source, 'outline'));
    expect(ranges).toEqual(
      expect.arrayContaining([
        { startLine: 1, endLine: 3, kind: 'imports' },
        { startLine: 4, endLine: 12, kind: 'region' },
        { startLine: 6, endLine: 8, kind: 'region' },
        { startLine: 10, endLine: 12, kind: 'region' },
      ]),
    );
  });
});

describe('highlighting', () => {
  it('marks directive parts, attributes and data', () => {
    const analysis = service.analyze(':::chart{#c unit=%}\ntype: bar\n:::\n\n:::nope\n:::', 'hl');
    const kinds = (kind: string) => getHighlights(analysis).filter((h) => h.kind === kind).map((h) => analysis.text.slice(h.from, h.to));
    expect(kinds('directiveFence')).toEqual([':::', ':::', ':::', ':::']);
    expect(kinds('directiveName')).toEqual(['chart']);
    expect(kinds('directiveUnknown')).toEqual(['nope']);
    expect(kinds('attributeId')).toEqual(['#c']);
    expect(kinds('attributeKey')).toEqual(['unit']);
    expect(kinds('dataKey')).toEqual(['type']);
    expect(kinds('dataString')).toEqual(['bar']);
  });

  it('marks Markdown constructs', () => {
    const analysis = service.analyze('# Title\n\n**b** *i* `c` [l](u)\n\n> q\n\n- x', 'md');
    const pick = (kind: string) => getHighlights(analysis).filter((h) => h.kind === kind).map((h) => analysis.text.slice(h.from, h.to));
    expect(pick('headingMarker')).toEqual(['#']);
    expect(pick('strong')).toEqual(['**b**']);
    expect(pick('code')).toEqual(['`c`']);
    expect(pick('link')).toEqual(['[l]']);
    expect(pick('url')).toEqual(['(u)']);
    expect(pick('marker')).toEqual(['**', '**', '*', '*', '>', '-']);
  });

  it('produces valid LSP semantic tokens', () => {
    const analysis = service.analyze('text\n:::note{a=1}\n:::', 'st');
    const tokens = getSemanticTokens(analysis);
    expect(tokens.map((t) => [t.line, t.character, t.length])).toEqual([
      [1, 0, 3],
      [1, 3, 4],
      [1, 8, 1],
      [1, 10, 1],
      [2, 0, 3],
    ]);
    expect(encodeSemanticTokens(tokens).slice(0, 10)).toEqual([1, 0, 3, 0, 0, 0, 3, 4, 1, 1]);
  });
});

describe('navigation and fixes', () => {
  const source = '# Intro {#top}\n\nGo [up](#top), [ref][r] and note[^n].\n\n[r]: https://example.com\n[^n]: A note.\n\n![img](pic.png)';
  const analysis = service.analyze(source, 'nav');

  it('goes to anchors, reference definitions and footnotes', () => {
    const def = (needle: string) => {
      const loc = getDefinition(analysis, source.indexOf(needle) + 1);
      return loc && source.slice(loc.from, loc.to);
    };
    expect(def('[up]')).toBe('#top');
    expect(def('[ref]')).toBe('[r]: https://example.com');
    expect(def('[^n]')).toBe('[^n]: A note.');
  });

  it('finds references', () => {
    const refs = getReferences(analysis, source.indexOf('#top') + 1);
    expect(refs.map((r) => source.slice(r.from, r.to))).toEqual(['[up](#top)']);
  });

  it('lists document links', () => {
    expect(getDocumentLinks(analysis).map((l) => [l.target, source.slice(l.from, l.to)])).toEqual([
      ['https://example.com', 'https://example.com'],
      ['pic.png', 'pic.png'],
    ]);
  });

  it('turns diagnostic fixes into code actions', () => {
    const broken = service.analyze(':::nott\nx', 'fix');
    const actions = getCodeActions(broken, 0, broken.text.length);
    expect(actions.map((a) => a.title)).toEqual(['Insert closing :::', 'Change to `note`']);
  });
});

describe('robustness', () => {
  it('reuses the analysis for unchanged text', () => {
    expect(service.analyze('same', 'k')).toBe(service.analyze('same', 'k'));
  });

  it('never throws on any cursor position of a messy document', () => {
    const messy = ':::chart\ntype: [\n  - x:\n:::\n:badge[{a="\n::toc{\n[^\n```\n> - :::note{#\n';
    const a = service.analyze(messy, 'messy');
    for (let i = 0; i <= messy.length; i++) {
      expect(() => {
        getCompletions(a, i);
        getHover(a, i);
        getDefinition(a, i);
      }).not.toThrow();
    }
    expect(() => [getSymbols(a), getFoldingRanges(a), getHighlights(a), getSemanticTokens(a)]).not.toThrow();
  });
});
