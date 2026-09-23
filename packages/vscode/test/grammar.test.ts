/**
 * Tokenises samples with the real TextMate engine used by VS Code.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import * as oniguruma from 'vscode-oniguruma';
import { INITIAL, Registry, parseRawGrammar, type IGrammar } from 'vscode-textmate';
import { grammar as source } from '../syntaxes/grammar.mjs';

let grammar: IGrammar;

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const wasm = readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'));
  await oniguruma.loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer);
  const registry = new Registry({
    onigLib: Promise.resolve({ createOnigScanner: (p) => new oniguruma.OnigScanner(p), createOnigString: (s) => new oniguruma.OnigString(s) }),
    loadGrammar: async (scope) => (scope === 'text.markup' ? parseRawGrammar(JSON.stringify(source), 'markup.tmLanguage.json') : null),
  });
  grammar = (await registry.loadGrammar('text.markup'))!;
});

/** Scopes of the token containing `needle` on the line where it appears. */
function scopesOf(text: string, needle: string): string[] {
  let state = INITIAL;
  for (const line of text.split('\n')) {
    const { tokens, ruleStack } = grammar.tokenizeLine(line, state);
    state = ruleStack;
    const at = line.indexOf(needle);
    if (at === -1) continue;
    const token = tokens.find((t) => t.startIndex <= at && at < t.endIndex)!;
    return token.scopes;
  }
  throw new Error(`${needle} not found`);
}

describe('TextMate grammar', () => {
  it('colours directive fences, names, labels and attributes', () => {
    const doc = ':::card[Title]{#main icon=x}\nBody\n:::';
    expect(scopesOf(doc, ':::card')).toContain('punctuation.definition.directive.markup');
    expect(scopesOf(doc, 'card')).toContain('entity.name.tag.directive.markup');
    expect(scopesOf(doc, 'Title')).toContain('string.other.label.markup');
    expect(scopesOf(doc, '#main')).toContain('entity.other.attribute-name.id.markup');
    expect(scopesOf(doc, 'icon')).toContain('entity.other.attribute-name.markup');
  });

  it('colours inline directives and leaf directives', () => {
    expect(scopesOf('Press :kbd[Ctrl+S] now', 'kbd')).toContain('entity.name.tag.directive.inline.markup');
    expect(scopesOf('::toc{depth=2}', 'toc')).toContain('entity.name.tag.directive.markup');
    expect(scopesOf('at 10:30 today', '30')).not.toContain('entity.name.tag.directive.inline.markup');
  });

  it('colours Markdown constructs', () => {
    expect(scopesOf('## Heading', 'Heading')).toContain('markup.heading.markup');
    expect(scopesOf('a **bold** b', 'bold')).toContain('markup.bold.markup');
    expect(scopesOf('a *it* b', 'it')).toContain('markup.italic.markup');
    expect(scopesOf('use `code` here', 'code')).toContain('markup.inline.raw.string.markup');
    expect(scopesOf('[text](https://x.dev)', 'https')).toContain('markup.underline.link.markup');
    expect(scopesOf('<!-- hidden -->', 'hidden')).toContain('comment.block.markup');
    expect(scopesOf('- [x] done', '[x]')).toContain('constant.language.task.markup');
  });

  it('keeps fenced code opaque', () => {
    const doc = '```text\n:::note\n**not bold**\n```';
    expect(scopesOf(doc, 'note')).toContain('markup.fenced_code.block.markup');
    expect(scopesOf(doc, 'note')).not.toContain('entity.name.tag.directive.markup');
    expect(scopesOf(doc, 'not bold')).not.toContain('markup.bold.markup');
  });
});
