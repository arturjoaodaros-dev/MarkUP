import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { defineDirective, definePlugin, parse, s } from '@markup-lang/core';
import { chartModel, markupToHtml, niceTicks, renderDocument, renderHtml, type HtmlComponent } from '@markup-lang/html';

const html = (source: string, options = {}) => markupToHtml(source, options).html;

/** Checks that every emitted tag is closed in order (void elements excepted). */
function balanced(markup: string): boolean {
  const voids = new Set(['br', 'hr', 'img', 'input', 'meta']);
  const stack: string[] = [];
  for (const [, closing, name, selfClosing] of markup.matchAll(/<(\/?)([a-zA-Z][\w-]*)[^>]*?(\/?)>/g)) {
    const tag = name!.toLowerCase();
    if (selfClosing || (!closing && voids.has(tag))) continue;
    if (!closing) stack.push(tag);
    else if (stack.pop() !== tag) return false;
  }
  return stack.length === 0;
}

describe('Markdown elements', () => {
  it('renders blocks', () => {
    expect(html('# Title\n\nPara *em* **strong** ~~del~~ `code`\n\n---')).toBe(
      '<h1 id="title">Title<a class="mu-anchor" href="#title" aria-hidden="true" tabindex="-1">#</a></h1>\n' +
        '<p>Para <em>em</em> <strong>strong</strong> <del>del</del> <code>code</code></p>\n<hr>\n',
    );
  });

  it('renders tight and loose lists, tasks and start numbers', () => {
    expect(html('- a\n- b')).toBe('<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n');
    expect(html('- a\n\n- b')).toBe('<ul>\n<li><p>a</p></li>\n<li><p>b</p></li>\n</ul>\n');
    expect(html('3. x')).toBe('<ol start="3">\n<li>x</li>\n</ol>\n');
    expect(html('- [x] done')).toContain('<li class="mu-task"><input type="checkbox" disabled checked> done</li>');
  });

  it('renders code blocks with language and title', () => {
    expect(html('```ts\nlet a = 1 < 2;\n```')).toBe('<pre class="mu-code" data-lang="ts"><code class="language-ts">let a = 1 &lt; 2;\n</code></pre>\n');
    expect(html('```js {title="app.js"}\nx\n```')).toContain('<figure class="mu-code-block"><figcaption>app.js</figcaption>');
  });

  it('uses a highlighter when provided', () => {
    expect(html('```ts\nx\n```', { highlight: (code: string) => `<b>${code}</b>` })).toContain('<code class="language-ts"><b>x</b>');
  });

  it('renders tables with alignment', () => {
    const out = html('| a | b |\n|:-:|--:|\n| 1 | 2 |');
    expect(out).toContain('<th style="text-align:center">a</th>');
    expect(out).toContain('<td style="text-align:right">2</td>');
  });

  it('renders images with safe attributes only', () => {
    expect(html('![alt "x"](a.png "T"){width=200 .round onload=evil}')).toBe(
      '<p><img src="a.png" alt="alt &quot;x&quot;" title="T" class="round" width="200" loading="lazy"></p>\n',
    );
  });

  it('adds explicit and generated heading ids, deduplicated', () => {
    const out = html('# A\n# A\n## B {#custom .x}', { headingAnchors: false });
    expect(out).toBe('<h1 id="a">A</h1>\n<h1 id="a-1">A</h1>\n<h2 id="custom" class="x">B</h2>\n');
  });

  it('renders footnotes in reference order with backlinks', () => {
    const out = html('A[^b] B[^a] C[^b]\n\n[^a]: First.\n[^b]: Second.');
    expect(out).toContain('<sup class="mu-fnref"><a href="#fn-1" id="fnref-1">1</a></sup>');
    expect(out).toContain('<a href="#fn-1" id="fnref-1-2">1</a>');
    expect(out).toMatch(/<li id="fn-1"><p>Second\. <a href="#fnref-1".*<a href="#fnref-1-2"/);
    expect(out.indexOf('id="fn-1"')).toBeLessThan(out.indexOf('id="fn-2"'));
  });

  it('adds source line attributes on request', () => {
    expect(html('# A\n\ntext', { sourcePositions: true, headingAnchors: false })).toBe(
      '<h1 id="a" data-line="1" data-line-end="1">A</h1>\n<p data-line="3" data-line-end="3">text</p>\n',
    );
  });

  it('drops comments and definitions', () => {
    expect(html('<!-- x -->\n[a]: /b\n\ntext <!-- y -->')).toBe('<p>text </p>\n');
  });
});

describe('security', () => {
  it('escapes all text, including raw HTML', () => {
    expect(html('<script>alert(1)</script> & "q"')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;q&quot;</p>\n');
  });

  it('drops unsafe URLs', () => {
    expect(html('[x](javascript:alert(1)) ![y](data:text/html,x)')).toBe(
      '<p><span class="mu-unsafe-link">x</span> <span class="mu-unsafe-image">y</span></p>\n',
    );
    expect(html('[x](java&#9;script:alert(1))')).toContain('mu-unsafe-link');
  });

  it('escapes attribute values and never emits event handlers', () => {
    const out = html(':::card{href="x\\" onclick=\\"evil" icon="<b>"}\nx\n:::\n\n# T {onclick=evil}');
    expect(out).not.toMatch(/ onclick=/);
    expect(out).toContain('&lt;b&gt;');
    expect(out).toContain('data-onclick="evil"');
  });

  it('never produces script tags or javascript: URLs for arbitrary input', () => {
    const fragments = fc.constantFrom('<script>', '</script>', 'javascript:', '[x](', ')', '![y](', '"', "'", '<', '>', ':::card{href=', '}', '\n', 'onload=', ':badge[', ']', '{', '&#106;avascript:', '<img src=x>');
    fc.assert(
      fc.property(fc.array(fragments, { maxLength: 30 }).map((a) => a.join('')), (source) => {
        const out = html(source);
        expect(out).not.toMatch(/<script/i);
        expect(out).not.toMatch(/href="\s*javascript:/i);
        expect(out).not.toMatch(/<img[^>]*\son\w+=/i);
      }),
      { numRuns: 400 },
    );
  });

  it('produces balanced markup for arbitrary documents', () => {
    const fragments = fc.constantFrom('# ', '- ', '> ', ':::note', ':::', '::::tabs', ':::tab[A]', '::::', ':::chart', 'data:', '  a: 1', '```', '*a*', '[l](u)', '| a |', '|---|', 'text', '::toc', ':badge[b]', '[^1]', '[^1]: n', '\n', '\n\n');
    fc.assert(
      fc.property(fc.array(fragments, { maxLength: 40 }).map((a) => a.join('')), (source) => {
        expect(balanced(html(source))).toBe(true);
      }),
      { numRuns: 400 },
    );
  });
});

describe('components', () => {
  it('renders callouts with default and custom titles', () => {
    const out = html(':::warning\nCareful.\n:::');
    expect(out).toMatch(/^<aside class="mu-callout mu-callout-warning" role="note"><p class="mu-callout-title"><svg[^>]*>.*<\/svg><span>Warning<\/span><\/p>/);
    expect(out).toContain('<p>Careful.</p>');
    expect(html(':::tip[Pro tip]\nx\n:::')).toContain('<span>Pro tip</span>');
    expect(html(':::note{collapsible}\nx\n:::')).toMatch(/^<details class="mu-callout mu-callout-note">/);
  });

  it('applies ids and classes from attributes', () => {
    expect(html(':::note{#n .wide}\nx\n:::')).toMatch(/^<aside id="n" class="mu-callout mu-callout-note wide"/);
  });

  it('renders cards with icon and link', () => {
    const out = html(':::card[Docs]{href=/docs icon=📘}\nRead\n:::');
    expect(out).toContain('<p class="mu-card-title"><span class="mu-card-icon" aria-hidden="true">📘</span><a href="/docs">Docs</a></p>');
  });

  it('renders CSS-only tabs with unique groups', () => {
    const src = '::::tabs\n:::tab[A]\none\n:::\n:::tab[B]{selected}\ntwo\n:::\n::::';
    const out = html(`${src}\n\n${src}`);
    expect(out.match(/name="mu-tabs-1"/g)).toHaveLength(2);
    expect(out.match(/name="mu-tabs-2"/g)).toHaveLength(2);
    expect(out).toContain('<input type="radio" class="mu-tab-input" name="mu-tabs-1" id="mu-tabs-1-2" checked>');
    expect(out).toContain('<label class="mu-tab-label" for="mu-tabs-1-1">A</label>');
  });

  it('renders columns with spans', () => {
    const out = html('::::columns{gap=large}\n:::column{span=2}\nA\n:::\n:::column\nB\n:::\n::::');
    expect(out).toContain('<div class="mu-columns" data-gap="large" data-align="stretch">');
    expect(out).toContain('<div class="mu-column" style="--mu-span:2">');
  });

  it('renders details, figures and abbreviations', () => {
    expect(html(':::details[Why?]{open}\nBecause.\n:::')).toMatch(/^<details class="mu-details" open><summary>Why\?<\/summary>/);
    expect(html(':::figure[Caption]\n![a](b.png)\n:::')).toContain('<figcaption>Caption</figcaption></figure>');
    expect(html(':abbr[AST]{title="Abstract syntax tree"}')).toBe('<p><abbr title="Abstract syntax tree">AST</abbr></p>\n');
  });

  it('renders keyboard shortcuts key by key', () => {
    expect(html(':kbd[Ctrl + Shift+P] :kbd[Ctrl++]')).toBe(
      '<p><kbd class="mu-kbd"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd></kbd> <kbd class="mu-kbd"><kbd>Ctrl</kbd>+<kbd>+</kbd></kbd></p>\n',
    );
  });

  it('renders badges and progress bars', () => {
    expect(html(':badge[beta]{variant=warning}')).toBe('<p><span class="mu-badge" data-variant="warning">beta</span></p>\n');
    const bar = html('::progress[Docs]{value=30 max=40}');
    expect(bar).toContain('style="width:75%"');
    expect(bar).toContain('aria-valuenow="30"');
    expect(html('::progress{value=500}')).toContain('style="width:100%"');
  });

  it('renders a nested table of contents', () => {
    const out = html('::toc{depth=3}\n\n# Doc\n## A\n### A1\n## B\n#### deep');
    expect(out).toContain('<nav class="mu-toc" aria-label="Table of contents"><ul><li><a href="#a">A</a><ul><li><a href="#a1">A1</a></li></ul></li><li><a href="#b">B</a></li></ul></nav>');
  });

  it('keeps unknown components and their content', () => {
    expect(html(':::mystery[Label]{#m}\n**body**\n:::')).toBe(
      '<div id="m" class="mu-directive" data-directive="mystery"><div class="mu-directive-label">Label</div><p><strong>body</strong></p>\n</div>\n',
    );
    expect(html('x :thing[y]{a=1}')).toBe('<p>x <span class="mu-directive" data-directive="thing">y</span></p>\n');
  });

  it('falls back when a component is used in a form it does not support', () => {
    expect(html('::card[x]')).toContain('data-directive="card"');
  });

  it('isolates component failures', () => {
    const broken: HtmlComponent = () => {
      throw new Error('boom');
    };
    expect(html(':::note\nx\n:::', { components: { note: broken } })).toContain('<div class="mu-error">Component “note” failed: boom</div>');
  });
});

describe('charts', () => {
  it('renders one rect per value for bar charts', () => {
    const out = html(':::chart\ntitle: Langs\ndata:\n  Python: 80\n  Rust: 40\n:::');
    expect(out.match(/<rect class="mu-f1"/g)).toHaveLength(2);
    expect(out).toContain('<figcaption class="mu-chart-title">Langs</figcaption>');
    expect(out).toContain('<title>Python — Langs: 80</title>');
    expect(out).toContain('<table class="mu-sr-only">');
  });

  it('renders grouped series with a legend and custom colours', () => {
    const out = html(':::chart{type=line}\nlabels: [a, b]\nseries:\n  - name: x\n    values: [1, 2]\n  - name: y\n    color: "#ff0000"\n    values: [2, 3]\n:::');
    expect(out).toContain('class="mu-s1"');
    expect(out).toContain('style="stroke:#ff0000"');
    expect(out).toContain('<ul class="mu-chart-legend">');
  });

  it('renders pie and donut charts', () => {
    const pie = html(':::chart{type=pie}\ndata:\n  a: 1\n  b: 3\n:::');
    expect(pie.match(/<path class="mu-f\d" d="M/g)).toHaveLength(2);
    expect(pie).toContain('b: 3 (75.0%)');
    expect(html(':::chart{type=donut}\ndata:\n  only: 5\n:::')).toContain('mu-chart-hole');
  });

  it('handles negative values, stacking and areas', () => {
    const out = html(':::chart{type=bar stacked}\nlabels: [q1, q2]\nseries:\n  - name: a\n    values: [-3, 4]\n  - name: b\n    values: [2, -1]\n:::');
    expect(out).toContain('mu-chart-zero');
    expect(html(':::chart{type=area}\ndata:\n  a: 1\n  b: 2\n:::')).toContain('mu-chart-area');
  });

  it('reports charts without data', () => {
    expect(html(':::chart\ntype: bar\n:::')).toContain('This chart has no data.');
  });

  it('builds models defensively', () => {
    expect(chartModel({ data: { a: 1, b: 'x' } }, '')?.labels).toEqual(['a']);
    expect(chartModel({ series: [{ values: [1] }], labels: ['a'], type: 'pie' }, 'T')?.series).toHaveLength(1);
    expect(chartModel({ series: [{ values: [1], color: 'red;background:url(x)' }], labels: ['a'] }, '')?.series[0]?.color).toBeNull();
    expect(chartModel({}, '')).toBeNull();
  });

  it('computes nice ticks', () => {
    expect(niceTicks(0, 80)).toEqual([0, 20, 40, 60, 80]);
    expect(niceTicks(-3, 4)).toEqual([-4, -2, 0, 2, 4]);
    expect(niceTicks(0, 0)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });
});

describe('plugins', () => {
  it('renders plugin components', () => {
    const plugin = definePlugin({
      name: 'video',
      directives: [defineDirective({ name: 'youtube', forms: ['leaf'], description: 'Video', attributes: { id: s.string() } })],
      renderers: {
        html: {
          youtube: ((node, ctx) => `<iframe${ctx.rootAttributes(node, ['yt'], { src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(String(ctx.props(node).id))}` })}></iframe>`) satisfies HtmlComponent,
        },
      },
    });
    const { html: out, diagnostics } = markupToHtml('::youtube{id=abc}', { plugins: [plugin] });
    expect(diagnostics).toEqual([]);
    expect(out).toBe('<iframe class="yt" src="https://www.youtube-nocookie.com/embed/abc"></iframe>');
  });
});

describe('standalone documents', () => {
  it('uses front matter for title, description and language', () => {
    const { document } = parse('---\ntitle: My <Doc>\ndescription: About it\nlang: pt-BR\n---\n# Heading');
    const out = renderDocument(document);
    expect(out).toMatch(/^<!doctype html>\n<html lang="pt-BR">/);
    expect(out).toContain('<title>My &lt;Doc&gt;</title>');
    expect(out).toContain('<meta name="description" content="About it">');
    expect(out).not.toContain('<script');
  });

  it('falls back to the first heading and a fixed theme', () => {
    const out = renderDocument(parse('# First\n\ntext').document, { theme: 'dark' });
    expect(out).toContain('<title>First</title>');
    expect(out).toContain('<html data-theme="dark" lang="en">');
    expect(out).toContain('<main class="markup-body" data-theme="dark">');
  });

  it('rejects an invalid language tag', () => {
    expect(renderDocument(parse('---\nlang: "en\\" onload=x"\n---').document)).toContain('<html lang="en">');
  });

  it('renders an empty document', () => {
    expect(renderHtml(parse('').document)).toBe('');
  });
});
