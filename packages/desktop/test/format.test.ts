import { EditorSelection, EditorState } from '@codemirror/state';
import { markupToHtml } from '@markup-lang/html';
import { describe, expect, it } from 'vitest';
import {
  blockInsertion,
  insertLink,
  toggleInline,
  toggleLines,
  type InlineFormat,
  type LineFormat,
} from '../src/editor/format.ts';

/**
 * Documents are written with the selection inline: `|` is a cursor, `«` and `»`
 * delimit a selection (several are allowed). Results use the same notation.
 */
function state(source: string): EditorState {
  const ranges = [];
  let doc = '';
  let anchor = -1;
  for (const ch of source) {
    if (ch === '|') ranges.push(EditorSelection.cursor(doc.length));
    else if (ch === '«') anchor = doc.length;
    else if (ch === '»') ranges.push(EditorSelection.range(anchor, doc.length));
    else doc += ch;
  }
  return EditorState.create({
    doc,
    selection: EditorSelection.create(ranges.length ? ranges : [EditorSelection.cursor(0)]),
    extensions: EditorState.allowMultipleSelections.of(true),
  });
}

function show(s: EditorState): string {
  const marks: [number, string][] = [];
  for (const r of s.selection.ranges) {
    if (r.empty) marks.push([r.from, '|']);
    else marks.push([r.from, '«'], [r.to, '»']);
  }
  marks.sort((a, b) => b[0] - a[0]);
  let text = s.doc.toString();
  for (const [pos, mark] of marks) text = text.slice(0, pos) + mark + text.slice(pos);
  return text;
}

const strip = (text: string) => text.replace(/[«»|]/g, '');
const inline = (source: string, format: InlineFormat) => {
  const s = state(source);
  return show(s.update(toggleInline(s, format)).state);
};
const lines = (source: string, format: LineFormat) => {
  const s = state(source);
  return show(s.update(toggleLines(s, format)).state);
};
const html = (text: string) => markupToHtml(strip(text), { headingAnchors: false }).html;

describe('bold, italic, strikethrough', () => {
  it('wraps the selection and keeps it selected', () => {
    expect(inline('a «word» b', 'bold')).toBe('a **«word»** b');
    expect(inline('a «word» b', 'italic')).toBe('a *«word»* b');
    expect(inline('a «word» b', 'strikethrough')).toBe('a ~~«word»~~ b');
  });

  it('keeps surrounding spaces outside the markers', () => {
    // `** word **` would not be strong emphasis.
    const result = inline('a« word »b', 'bold');
    expect(result).toBe('a« **word** »b');
    expect(html(result)).toBe('<p>a <strong>word</strong> b</p>\n');
  });

  it('removes the format when the selection is already formatted', () => {
    expect(inline('a **«word»** b', 'bold')).toBe('a «word» b');
    expect(inline('a «**word**» b', 'bold')).toBe('a «word» b');
    expect(inline('a *«word»* b', 'italic')).toBe('a «word» b');
    expect(inline('a ~~«word»~~ b', 'strikethrough')).toBe('a «word» b');
  });

  it('tells bold and italic apart', () => {
    expect(inline('**«word»**', 'italic')).toBe('***«word»***');
    expect(inline('*«word»*', 'bold')).toBe('***«word»***');
    expect(inline('***«word»***', 'bold')).toBe('*«word»*');
    expect(inline('***«word»***', 'italic')).toBe('**«word»**');
  });

  it('formats the word under a bare cursor', () => {
    expect(inline('one tw|o three', 'bold')).toBe('one **tw|o** three');
    expect(inline('one **tw|o** three', 'bold')).toBe('one tw|o three');
  });

  it('inserts a selected placeholder where there is no word', () => {
    expect(inline('a | b', 'bold')).toBe('a **«bold text»** b');
    expect(inline('|', 'italic')).toBe('*«italic text»*');
    // Pressing again right away removes the pair.
    expect(inline('a **|** b', 'bold')).toBe('a | b');
  });

  it('formats multi-line selections line by line, outside block markers', () => {
    const result = inline('«# Title\n- one\n- [ ] two\n> quoted\n\nplain»', 'bold');
    expect(result).toBe('«# **Title**\n- **one**\n- [ ] **two**\n> **quoted**\n\n**plain**»');
    const out = html(result);
    expect(out).toContain('<strong>Title</strong></h1>');
    expect(out).toContain('<li><strong>one</strong></li>');
    expect(out).toContain('<input type="checkbox" disabled> <strong>two</strong>');
    expect(out).toContain('<blockquote>\n<p><strong>quoted</strong></p>');
    expect(out).toContain('<p><strong>plain</strong></p>');
  });

  it('handles several selections', () => {
    expect(inline('«a» and «b»', 'bold')).toBe('**«a»** and **«b»**');
  });
});

describe('underline', () => {
  it('uses the u component', () => {
    const result = inline('a «word» b', 'underline');
    expect(result).toBe('a :u[«word»] b');
    expect(html(result)).toBe('<p>a <u>word</u> b</p>\n');
  });

  it('removes it again', () => {
    expect(inline('a :u[«word»] b', 'underline')).toBe('a «word» b');
    expect(inline('a «:u[word]» b', 'underline')).toBe('a «word» b');
  });

  it('starts at a word boundary, where a directive can begin', () => {
    // `super:u[script]` would be plain text.
    const result = inline('super«script»', 'underline');
    expect(result).toBe(':u[super«script»]');
    expect(html(result)).toBe('<p><u>superscript</u></p>\n');
  });

  it('escapes unbalanced brackets in the label', () => {
    const result = inline('«a ] b»', 'underline');
    expect(result).toBe(':u[«a \\] b»]');
    expect(html(result)).toBe('<p><u>a ] b</u></p>\n');
    expect(inline('«a [b] c»', 'underline')).toBe(':u[«a [b] c»]');
  });

  it('inserts a placeholder, separated from a preceding colon', () => {
    expect(inline('end: |', 'underline')).toBe('end: :u[«underlined text»]');
    expect(inline('ratio:|', 'underline')).toBe('ratio: :u[«underlined text»]');
    expect(html('ratio: :u[x]')).toBe('<p>ratio: <u>x</u></p>\n');
  });

  it('combines with bold', () => {
    const s1 = state('a «word» b');
    const s2 = s1.update(toggleInline(s1, 'underline')).state;
    const s3 = s2.update(toggleInline(s2, 'bold')).state;
    expect(show(s3)).toBe('a :u[**«word»**] b');
    expect(html(show(s3))).toBe('<p>a <u><strong>word</strong></u> b</p>\n');
  });
});

describe('checkboxes and bullets', () => {
  it('turns a line into a task item', () => {
    expect(lines('Buy milk|', 'task')).toBe('- [ ] Buy milk|');
    expect(lines('|', 'task')).toBe('- [ ] |');
    expect(lines('- Buy milk|', 'task')).toBe('- [ ] Buy milk|');
    expect(lines('3. Third|', 'task')).toBe('3. [ ] Third|');
    expect(lines('  - nested|', 'task')).toBe('  - [ ] nested|');
    expect(lines('> quoted|', 'task')).toBe('> - [ ] quoted|');
  });

  it('removes the checkbox when every line has one', () => {
    expect(lines('- [ ] a|', 'task')).toBe('- a|');
    expect(lines('«- [x] a\n- [ ] b»', 'task')).toBe('«- a\n- b»');
  });

  it('adds checkboxes to every selected line, skipping blank ones', () => {
    const result = lines('«one\n\n- [x] two\n- three»', 'task');
    expect(result).toBe('«- [ ] one\n\n- [x] two\n- [ ] three»');
    expect(html(result)).toContain('<input type="checkbox" disabled checked> <p>two</p>');
  });

  it('produces task items the parser recognises', () => {
    expect(html(lines('«a\nb»', 'task'))).toBe(
      '<ul class="mu-tasks">\n<li class="mu-task"><input type="checkbox" disabled> a</li>\n' +
        '<li class="mu-task"><input type="checkbox" disabled> b</li>\n</ul>\n',
    );
  });

  it('toggles bullets', () => {
    expect(lines('a|', 'bullet')).toBe('- a|');
    expect(lines('- a|', 'bullet')).toBe('a|');
    expect(lines('- [ ] a|', 'bullet')).toBe('a|');
    expect(lines('1. a|', 'bullet')).toBe('- a|');
  });
});

describe('links and blocks', () => {
  const link = (source: string) => {
    const s = state(source);
    return show(s.update(insertLink(s)).state);
  };

  it('wraps text and URLs in links', () => {
    expect(link('see «the guide»')).toBe('see [the guide](«url»)');
    expect(link('«https://example.com»')).toBe('[«link text»](https://example.com)');
    expect(link('|')).toBe('[link text](«url»)');
  });

  it('puts blocks on lines of their own', () => {
    expect(blockInsertion(state('|'))).toEqual({ at: 0, before: '', after: '' });
    expect(blockInsertion(state('text|'))).toEqual({ at: 4, before: '\n\n', after: '' });
    expect(blockInsertion(state('a «b» c\nnext'))).toEqual({ at: 5, before: '\n\n', after: '\n' });
    expect(blockInsertion(state('a\n|\nb'))).toEqual({ at: 2, before: '\n', after: '\n' });
    expect(blockInsertion(state('a\n\n|\n\nb'))).toEqual({ at: 3, before: '', after: '' });
  });
});
