import { describe, expect, it } from 'vitest';
import { parse } from '@markup-lang/core';
import { countWords, renderText } from '@markup-lang/text';

const text = (source: string) => renderText(parse(source).document);

describe('renderText', () => {
  it('renders blocks separated by blank lines', () => {
    expect(text('# Title\n\nSome **bold** and `code`.\n\n- a\n- [x] b\n\n1. one')).toBe(
      'Title\n\nSome bold and code.\n\n- a\n- [x] b\n\n1. one',
    );
  });

  it('renders components as readable text', () => {
    expect(text(':::warning\nCareful.\n:::')).toBe('Warning: Careful.');
    expect(text('Press :kbd[Ctrl+S] :badge[new]')).toBe('Press Ctrl+S new');
    expect(text('::progress[Docs]{value=50}')).toBe('Docs: 50%');
    expect(text(':::chart[Langs]\ndata:\n  a: 1\n  b: 2\n:::')).toBe('Langs\na: 1\nb: 2');
    expect(text('::::tabs\n:::tab[A]\none\n:::\n::::')).toBe('A\n\none');
    expect(text(':::mystery[L]\nbody\n:::')).toBe('L\n\nbody');
  });

  it('keeps table cells and code', () => {
    expect(text('| a | b |\n|---|---|\n| 1 | 2 |\n\n```\nx = 1\n```')).toBe('a\tb\n1\t2\n\nx = 1');
  });

  it('omits comments and definitions', () => {
    expect(text('<!-- c -->\n[a]: /x\n\nvisible')).toBe('visible');
  });
});

describe('countWords', () => {
  it('counts words in several scripts', () => {
    expect(countWords('Hello, world! Olá mundo.')).toBe(4);
    expect(countWords('')).toBe(0);
    expect(countWords('  --  ')).toBe(0);
    expect(countWords('日本語のテキスト')).toBeGreaterThan(1);
  });
});
