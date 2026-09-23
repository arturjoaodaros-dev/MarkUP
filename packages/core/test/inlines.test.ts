import { describe, expect, it } from 'vitest';
import { codeList, inline } from './helpers.ts';

describe('emphasis and strong', () => {
  it('parses the basic forms', () => {
    expect(inline('*a* _b_ **c** __d__')).toBe('em("a") " " em("b") " " strong("c") " " strong("d")');
  });

  it('nests', () => {
    expect(inline('***both***')).toBe('em(strong("both"))');
    expect(inline('**a *b* c**')).toBe('strong("a ", em("b"), " c")');
    expect(inline('*a **b** c*')).toBe('em("a ", strong("b"), " c")');
  });

  it('requires left-flanking openers and right-flanking closers', () => {
    expect(inline('a * b *')).toBe('"a * b *"');
    expect(inline('*a *')).toBe('"*a *"');
  });

  it('does not use underscores inside words', () => {
    expect(inline('snake_case_name')).toBe('"snake_case_name"');
    expect(inline('in*tra*word')).toBe('"in" em("tra") "word"');
  });

  it('applies the rule of three', () => {
    expect(inline('*foo**bar**baz*')).toBe('em("foo", strong("bar"), "baz")');
    expect(inline('*foo**bar*')).toBe('em("foo**bar")');
  });

  it('leaves unmatched delimiters as text', () => {
    expect(inline('**open')).toBe('"**open"');
    expect(inline('close**')).toBe('"close**"');
    expect(inline('*a **b*')).toBe('"*a *" em("b")');
  });

  it('handles Unicode punctuation and whitespace when flanking', () => {
    expect(inline('«*quote*»')).toBe('"«" em("quote") "»"');
    const nbsp = String.fromCharCode(0xa0);
    expect(inline(`a${nbsp}*b*`)).toBe(`"a${nbsp}" em("b")`);
  });
});

describe('strikethrough', () => {
  it('uses exactly two tildes', () => {
    expect(inline('~~gone~~')).toBe('del("gone")');
    expect(inline('~one~ ~~~three~~~')).toBe('"~one~ ~~~three~~~"');
  });

  it('nests with emphasis', () => {
    expect(inline('~~**x**~~')).toBe('del(strong("x"))');
  });
});

describe('code spans', () => {
  it('parses matching backtick runs', () => {
    expect(inline('`a` and ``b ` c``')).toBe('code("a") " and " code("b ` c")');
  });

  it('strips one space on each side when both are present', () => {
    expect(inline('`` `x` ``')).toBe('code("`x`")');
    expect(inline('` a`')).toBe('code(" a")');
    expect(inline('`  `')).toBe('code("  ")');
  });

  it('turns newlines into spaces', () => {
    expect(inline('`a\nb`')).toBe('code("a b")');
  });

  it('is opaque: no emphasis, links or escapes inside', () => {
    expect(inline('`*a* [b](c) \\*`')).toBe('code("*a* [b](c) \\\\*")');
  });

  it('leaves unmatched backticks as text', () => {
    expect(inline('``no close`')).toBe('"``no close`"');
  });
});

describe('escapes and entities', () => {
  it('escapes ASCII punctuation', () => {
    expect(inline('\\*not em\\* \\[x\\]')).toBe('"*not em* [x]"');
  });

  it('keeps a backslash before other characters', () => {
    expect(inline('a\\b \\é')).toBe('"a\\\\b \\\\é"');
  });

  it('decodes named and numeric character references', () => {
    expect(inline('&copy; &#233; &#x1F600; &amp;')).toBe('"© é 😀 &"');
  });

  it('leaves unknown or invalid references as text', () => {
    expect(inline('&nope; &constructor; &#;')).toBe('"&nope; &constructor; &#;"');
    expect(inline('&#0;')).toBe(`"${String.fromCharCode(0xfffd)}"`);
  });
});

describe('line breaks', () => {
  it('keeps soft breaks as newlines', () => {
    expect(inline('a\nb')).toBe('"a\\nb"');
  });

  it('makes a hard break from two trailing spaces or a backslash', () => {
    expect(inline('a  \nb')).toBe('"a" br "b"');
    expect(inline('a\\\nb')).toBe('"a" br "b"');
  });

  it('drops a single trailing space', () => {
    expect(inline('a \nb')).toBe('"a\\nb"');
  });
});

describe('links', () => {
  it('parses inline links with titles', () => {
    expect(inline('[text](/url "Title")')).toBe('link[/url "Title"]("text")');
    expect(inline("[t](<a b> 'x')")).toBe('link[a b "x"]("t")');
    expect(inline('[t]()')).toBe('link[]("t")');
  });

  it('balances parentheses in destinations', () => {
    expect(inline('[a](foo(bar)) x')).toBe('link[foo(bar)]("a") " x"');
  });

  it('parses emphasis inside link text', () => {
    expect(inline('[**b**](u)')).toBe('link[u](strong("b"))');
  });

  it('does not allow links inside links', () => {
    expect(inline('[a [b](c) d](e)')).toBe('"[a " link[c]("b") " d](e)"');
  });

  it('resolves full, collapsed and shortcut references case-insensitively', () => {
    const defs = '\n\n[Foo]: /f "T"';
    expect(inline(`[x][foo] [Foo][] [FOO]${defs}`)).toBe('link[/f "T"]("x") " " link[/f "T"]("Foo") " " link[/f "T"]("FOO")');
  });

  it('leaves undefined references as text', () => {
    expect(inline('[x][nope]')).toBe('"[x][nope]"');
  });

  it('unescapes and decodes destinations', () => {
    expect(inline('[a](\\(x\\)&amp;y)')).toBe('link[(x)&y]("a")');
  });

  it('parses autolinks and email autolinks', () => {
    expect(inline('<https://example.com/a?b=c> <me@example.com>')).toBe(
      'link[https://example.com/a?b=c]("https://example.com/a?b=c") " " link[mailto:me@example.com]("me@example.com")',
    );
  });

  it('keeps other angle brackets as text (no raw HTML)', () => {
    expect(inline('<div>not html</div> a < b')).toBe('"<div>not html</div> a < b"');
  });

  it('links bare URLs, trimming trailing punctuation', () => {
    expect(inline('Visit https://example.com/path.')).toBe('"Visit " link[https://example.com/path]("https://example.com/path") "."');
    expect(inline('(see www.example.com)')).toBe('"(see " link[http://www.example.com]("www.example.com") ")"');
    expect(inline('https://en.wikipedia.org/wiki/Foo_(bar)')).toBe(
      'link[https://en.wikipedia.org/wiki/Foo_(bar)]("https://en.wikipedia.org/wiki/Foo_(bar)")',
    );
  });

  it('does not link URLs inside words or code', () => {
    expect(inline('xhttps://a.com')).toBe('"xhttps://a.com"');
    expect(inline('`https://a.com`')).toBe('code("https://a.com")');
  });
});

describe('images', () => {
  it('computes alt text from the description', () => {
    expect(inline('![a *b* c](img.png "t")')).toBe('img[img.png alt="a b c"]');
  });

  it('reads an attribute block right after the image', () => {
    expect(inline('![x](a.png){width=300 .round}')).toBe('img[a.png alt="x" {.round width=300}]');
  });

  it('keeps braces that are not attributes', () => {
    expect(inline('![x](a.png){not attrs}')).toBe('img[a.png alt="x"] "{not attrs}"');
  });
});

describe('footnote references and comments', () => {
  it('parses footnote references', () => {
    expect(inline('Claim[^1] and[^note-2].\n\n[^1]: a\n[^note-2]: b')).toBe('"Claim" fnref[1] " and" fnref[note-2] "."');
  });

  it('parses inline comments', () => {
    expect(inline('a <!-- hidden --> b')).toBe('"a " comment(" hidden ") " b"');
  });
});

describe('inline directives', () => {
  it('parses name, label and attributes', () => {
    expect(inline('Press :kbd[Ctrl+S] now')).toBe('"Press " :kbd["Ctrl+S"] " now"');
    expect(inline(':badge[**new**]{variant=success}')).toBe(':badge[strong("new")]{variant=success}');
    expect(inline(':abbr[AST]{title="Abstract syntax tree"}')).toBe(':abbr["AST"]{title=Abstract syntax tree}');
  });

  it('keeps raw labels raw', () => {
    expect(inline(':kbd[*a*]')).toBe(':kbd["*a*"]');
  });

  it('needs a label or attributes', () => {
    expect(inline('ratio 3:1 and :smile: and a:b[c]')).toBe('"ratio 3:1 and :smile: and a:b[c]"');
  });

  it('does not start after a letter, digit or colon', () => {
    expect(inline('word:badge[x] ::badge[y]')).toBe('"word:badge[x] ::badge[y]"');
  });

  it('nests labels', () => {
    expect(inline(':badge[:kbd[K]]')).toBe(':badge[:kbd["K"]]');
  });

  it('balances brackets and honours escapes in labels', () => {
    expect(inline(':badge[a [b] \\] c]')).toBe(':badge["a [b] ] c"]');
  });

  it('reports unterminated labels only for known components', () => {
    expect(codeList(':badge[open')).toEqual(['MU1007']);
    expect(codeList(':unknownthing[open')).toEqual([]);
  });

  it('can span a soft line break', () => {
    expect(inline(':badge[a\nb]')).toBe(':badge["a\\nb"]');
  });
});
