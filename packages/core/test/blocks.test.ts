import { describe, expect, it } from 'vitest';
import { parse } from '@markup-lang/core';
import { codeList, codes, tree } from './helpers.ts';

describe('paragraphs', () => {
  it('joins consecutive lines and splits on blank lines', () => {
    expect(tree('one\ntwo\n\nthree')).toBe('p("one\\ntwo") p("three")');
  });

  it('strips leading whitespace of every line and trailing whitespace of the last', () => {
    expect(tree('   one\n      two   ')).toBe('p("one\\ntwo")');
  });

  it('produces an empty document for blank input', () => {
    expect(tree('')).toBe('');
    expect(tree('\n\n   \n\t\n')).toBe('');
  });
});

describe('ATX headings', () => {
  it('parses levels 1 to 6', () => {
    expect(tree('# a\n## b\n### c\n#### d\n##### e\n###### f')).toBe('h1("a") h2("b") h3("c") h4("d") h5("e") h6("f")');
  });

  it('requires a space after the hashes and at most six of them', () => {
    expect(tree('#hashtag')).toBe('p("#hashtag")');
    expect(tree('####### seven')).toBe('p("####### seven")');
  });

  it('removes a closing sequence of hashes', () => {
    expect(tree('## Title ##')).toBe('h2("Title")');
    expect(tree('## Title#')).toBe('h2("Title#")');
    expect(tree('#')).toBe('h1()');
  });

  it('reads a trailing attribute block', () => {
    expect(tree('## Install {#setup .wide}')).toBe('h2{#setup .wide}("Install")');
    expect(tree('# A {data-x=1}')).toBe('h1{data-x=1}("A")');
  });

  it('keeps braces that are not attributes as text', () => {
    expect(tree('# Using {braces}')).toBe('h1("Using {braces}")');
    expect(tree('# Set {a b}')).toBe('h1("Set {a b}")');
  });

  it('may interrupt a paragraph', () => {
    expect(tree('text\n# Heading')).toBe('p("text") h1("Heading")');
  });

  it('allows indentation (no indented code in MarkUP)', () => {
    expect(tree('        # Deep')).toBe('h1("Deep")');
  });
});

describe('setext headings', () => {
  it('turns the paragraph above into a heading', () => {
    expect(tree('Title\n=====')).toBe('h1("Title")');
    expect(tree('Multi\nline\n---')).toBe('h2("Multi\\nline")');
  });

  it('is a thematic break when there is no paragraph', () => {
    expect(tree('\n---')).toBe('hr');
  });
});

describe('thematic breaks', () => {
  it('accepts ***, --- and ___ with spaces', () => {
    expect(tree('***\n\n- - -\n\n_____')).toBe('hr hr hr');
  });

  it('rejects mixed characters and runs shorter than three', () => {
    expect(tree('--*')).toBe('p("--*")');
    expect(tree('**')).toBe('p("**")');
  });
});

describe('blockquotes', () => {
  it('nests and continues lazily', () => {
    expect(tree('> a\n> > b\n> c')).toBe('quote(p("a"), quote(p("b\\nc")))');
    expect(tree('> a\nlazy')).toBe('quote(p("a\\nlazy"))');
  });

  it('treats `>` alone as a blank line inside the quote', () => {
    expect(tree('> a\n>\n> b')).toBe('quote(p("a"), p("b"))');
  });

  it('ends at a blank line', () => {
    expect(tree('> a\n\nb')).toBe('quote(p("a")) p("b")');
  });

  it('may contain any block', () => {
    expect(tree('> # H\n> - x\n> ```\n> code\n> ```')).toBe('quote(h1("H"), ul(li(p("x"))), pre("code"))');
  });
});

describe('lists', () => {
  it('parses bullet lists with any marker', () => {
    expect(tree('- a\n- b')).toBe('ul(li(p("a")), li(p("b")))');
    expect(tree('* a\n* b')).toBe('ul(li(p("a")), li(p("b")))');
    expect(tree('+ a')).toBe('ul(li(p("a")))');
  });

  it('starts a new list when the marker changes', () => {
    expect(tree('- a\n* b')).toBe('ul(li(p("a"))) ul(li(p("b")))');
    expect(tree('1. a\n2) b')).toBe('ol(li(p("a"))) ol[2](li(p("b")))');
  });

  it('parses ordered lists and keeps the start number', () => {
    expect(tree('1. a\n2. b')).toBe('ol(li(p("a")), li(p("b")))');
    expect(tree('7) a\n8) b')).toBe('ol[7](li(p("a")), li(p("b")))');
  });

  it('nests by indentation', () => {
    expect(tree('- a\n  - b\n    - c\n- d')).toBe('ul(li(p("a"), ul(li(p("b"), ul(li(p("c")))))), li(p("d")))');
  });

  it('indents continuation paragraphs to the content column', () => {
    expect(tree('1.  a\n\n    b')).toBe('ol*(li(p("a"), p("b")))');
  });

  it('is loose when items are separated by blank lines', () => {
    expect(tree('- a\n\n- b')).toBe('ul*(li(p("a")), li(p("b")))');
    expect(tree('- a\n- b')).toBe('ul(li(p("a")), li(p("b")))');
  });

  it('stays tight when the blank line is inside a nested list', () => {
    expect(tree('- a\n  - b\n\n  - c\n- d')).toBe('ul(li(p("a"), ul*(li(p("b")), li(p("c")))), li(p("d")))');
  });

  it('stays tight when the blank line is inside a fenced code block', () => {
    expect(tree('- a\n  ```\n  x\n\n  y\n  ```\n- b')).toBe('ul(li(p("a"), pre("x\\n\\ny")), li(p("b")))');
  });

  it('parses task items', () => {
    expect(tree('- [ ] todo\n- [x] done\n- [X] also')).toBe('ul(li[ ](p("todo")), li[x](p("done")), li[x](p("also")))');
  });

  it('only lets a list interrupt a paragraph with a non-empty item, and an ordered list only from 1', () => {
    expect(tree('The year\n1984. was')).toBe('p("The year\\n1984. was")');
    expect(tree('Shopping\n1. milk')).toBe('p("Shopping") ol(li(p("milk")))');
    expect(tree('Text\n-\nmore')).toBe('h2("Text") p("more")');
  });

  it('allows an empty item followed by content on the next line', () => {
    expect(tree('-\n  foo')).toBe('ul(li(p("foo")))');
  });

  it('closes an empty item at a blank line', () => {
    expect(tree('-\n\n  foo')).toBe('ul(li()) p("foo")');
  });

  it('continues a paragraph lazily', () => {
    expect(tree('- a\nlazy')).toBe('ul(li(p("a\\nlazy")))');
  });

  it('ends when a non-list block starts at a lower indentation', () => {
    expect(tree('- a\n# H')).toBe('ul(li(p("a"))) h1("H")');
  });

  it('handles tabs after the marker', () => {
    expect(tree('-\tone\n\ttwo')).toBe('ul(li(p("one\\ntwo")))');
  });
});

describe('fenced code', () => {
  it('parses backtick and tilde fences with an info string', () => {
    expect(tree('```ts\nconst a = 1;\n```')).toBe('pre[ts]("const a = 1;")');
    expect(tree('~~~\n```\n~~~')).toBe('pre("```")');
  });

  it('separates language, meta and attributes', () => {
    expect(tree('```js title.js\nx\n```')).toBe('pre[js]{meta=title.js}("x")');
    expect(tree('```js {title="app.js" .numbered}\nx\n```')).toBe('pre[js]{.numbered title=app.js}("x")');
    expect(tree('```{title=x}\ny\n```')).toBe('pre{title=x}("y")');
  });

  it('needs a closing fence at least as long as the opening one', () => {
    expect(tree('````\n```\n````')).toBe('pre("```")');
  });

  it('strips the fence indentation from content lines', () => {
    expect(tree('  ```\n  a\n    b\n c\n  ```')).toBe('pre("a\\n  b\\nc")');
  });

  it('does not allow backticks in a backtick info string', () => {
    expect(tree('``` a`b\nc')).toBe('p("``` a`b\\nc")');
  });

  it('warns about an unclosed fence and offers a fix', () => {
    const { diagnostics, document } = parse('```\ncode\n\n');
    expect(document.children[0]).toMatchObject({ type: 'code', value: 'code', closed: false });
    expect(diagnostics.map((d) => d.code)).toEqual(['MU1011']);
    expect(diagnostics[0]!.fixes?.[0]?.edits[0]?.newText).toBe('\n```');
  });

  it('keeps blank lines inside the block', () => {
    expect(tree('```\na\n\n\nb\n```')).toBe('pre("a\\n\\n\\nb")');
  });

  it('may interrupt a paragraph', () => {
    expect(tree('para\n```\ncode\n```')).toBe('p("para") pre("code")');
  });
});

describe('tables', () => {
  it('parses a GFM table with alignment', () => {
    expect(tree('| a | b | c |\n|:--|:-:|--:|\n| 1 | 2 | 3 |')).toBe(
      'table[left,center,right](th(td("a"), td("b"), td("c")), tr(td("1"), td("2"), td("3")))',
    );
  });

  it('accepts tables without outer pipes', () => {
    expect(tree('a | b\n--|--\n1 | 2')).toBe('table[-,-](th(td("a"), td("b")), tr(td("1"), td("2")))');
  });

  it('pads short rows and reports long ones', () => {
    expect(tree('| a | b |\n|---|---|\n| 1 |')).toBe('table[-,-](th(td("a"), td("b")), tr(td("1"), td()))');
    expect(codeList('| a |\n|---|\n| 1 | 2 |')).toEqual(['MU1014']);
  });

  it('keeps escaped pipes in cells, including code spans', () => {
    expect(tree('| a |\n|---|\n| x \\| y |\n| `a\\|b` |')).toBe('table[-](th(td("a")), tr(td("x | y")), tr(td(code("a|b"))))');
  });

  it('requires the header and delimiter rows to have the same number of cells', () => {
    expect(tree('| a | b |\n|---|\n| 1 |')).toBe('p("| a | b |\\n|---|\\n| 1 |")');
  });

  it('keeps earlier paragraph lines as a paragraph', () => {
    expect(tree('intro\n| a |\n|---|\n| 1 |')).toBe('p("intro") table[-](th(td("a")), tr(td("1")))');
  });

  it('ends at a blank line or another block', () => {
    expect(tree('| a |\n|---|\n| 1 |\n\nafter')).toBe('table[-](th(td("a")), tr(td("1"))) p("after")');
    expect(tree('| a |\n|---|\n# H')).toBe('table[-](th(td("a"))) h1("H")');
  });

  it('parses inline content in cells', () => {
    expect(tree('| **b** | [l](u) |\n|---|---|')).toBe('table[-,-](th(td(strong("b")), td(link[u]("l"))))');
  });
});

describe('comments', () => {
  it('parses single-line and multi-line comment blocks', () => {
    expect(tree('<!-- hidden -->\ntext')).toBe('comment(" hidden ") p("text")');
    expect(tree('<!--\na\nb\n-->')).toBe('comment("\\na\\nb\\n")');
  });

  it('warns about an unclosed comment', () => {
    expect(codeList('<!-- open\nstill')).toEqual(['MU1012']);
  });

  it('warns about text after the closing marker of a comment block', () => {
    expect(codeList('<!--\nx\n--> tail')).toEqual(['MU1012']);
  });

  it('treats a comment followed by text on its line as inline', () => {
    expect(tree('<!-- a --> text')).toBe('p(comment(" a "), " text")');
  });
});

describe('link reference definitions', () => {
  it('are extracted from the start of paragraphs', () => {
    expect(tree('[a]: /url "Title"\n[B]: <other url>\ntext')).toBe('def[a -> /url "Title"] def[B -> other url] p("text")');
  });

  it('may put the title on the next line', () => {
    expect(tree("[a]: /url\n  'T'")).toBe('def[a -> /url "T"]');
  });

  it('warns about duplicates; the first wins', () => {
    const result = parse('[a]: /one\n[a]: /two\n\n[a]');
    expect(result.diagnostics.map((d) => d.code)).toEqual(['MU2024']);
    expect(tree('[a]: /one\n[a]: /two\n\n[a]')).toContain('link[/one]("a")');
  });

  it('leaves no empty paragraph for a setext/table underline (fuzz regression)', () => {
    expect(tree('[ref]: /u\n---\n')).toBe('def[ref -> /u] hr');
    expect(tree('[ref]: /u\n|---|\n')).toBe('def[ref -> /u] p("|---|")');
  });

  it('is not a definition when trailing text follows the title', () => {
    expect(tree('[a]: /url "t" x')).toBe('p("[a]: /url \\"t\\" x")');
  });
});

describe('footnote definitions', () => {
  it('holds indented continuation content', () => {
    expect(tree('[^1]: First\n  second\n\n  para\n\n[^1] ref')).toBe('fn[1](p("First\\nsecond"), p("para")) p(fnref[1], " ref")');
  });

  it('cannot interrupt a paragraph', () => {
    expect(tree('text\n[^1]: no')).toBe('p("text\\n", fnref[1], ": no")');
  });
});

describe('front matter', () => {
  it('is parsed as MarkUP Data at the very start', () => {
    const { document } = parse('---\ntitle: Hello\ntags: [a, b]\n---\n# Body');
    expect(document.frontMatter?.value?.kind).toBe('map');
    expect(document.frontMatter?.raw).toBe('title: Hello\ntags: [a, b]');
    expect(tree('---\ntitle: x\n---\n# Body')).toBe('h1("Body")');
  });

  it('accepts `...` as the closing fence', () => {
    expect(parse('---\na: 1\n...\n').document.frontMatter).not.toBeNull();
  });

  it('is a thematic break when unclosed, with a hint when it looks like data', () => {
    expect(codes('---\ntitle: x\n\nbody')).toEqual(['MU1016 1:1']);
    expect(parse('---\ntitle: x').document.frontMatter).toBeNull();
    expect(codeList('---\n\nbody')).toEqual([]);
  });

  it('reports data errors with positions', () => {
    expect(codes('---\na: 1\na: 2\n---')).toEqual(['MU1502 3:1']);
  });

  it('must be a mapping', () => {
    expect(codeList('---\n- a\n---')).toEqual(['MU2010']);
  });
});

describe('line endings and special characters', () => {
  it('treats CRLF and CR like LF', () => {
    expect(tree('# a\r\n\r\ntext\r\nmore')).toBe('h1("a") p("text\\nmore")');
    expect(tree('# a\r\rtext\rmore')).toBe('h1("a") p("text\\nmore")');
  });

  it('skips a byte-order mark', () => {
    expect(tree(`${String.fromCharCode(0xfeff)}# Title`)).toBe('h1("Title")');
  });

  it('replaces NUL with U+FFFD', () => {
    expect(tree('a\0b')).toBe(`p("a${String.fromCharCode(0xfffd)}b")`);
  });
});

describe('definitions followed by footnotes', () => {
  it('lets a footnote definition follow link reference definitions directly', () => {
    expect(tree('[r]: /u\n[^n]: Note.\n\ntext[^n]')).toBe('def[r -> /u] fn[n](p("Note.")) p("text", fnref[n])');
  });

  it('still does not let a footnote definition interrupt real text', () => {
    expect(tree('[r]: /u\ntext\n[^n]: no')).toBe('def[r -> /u] p("text\\n", fnref[n], ": no")');
  });
});
