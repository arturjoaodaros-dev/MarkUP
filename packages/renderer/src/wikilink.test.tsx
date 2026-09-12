// Render headless (react-dom/server) do nó `wikilink` — sem DOM real, o
// mesmo mecanismo que `exportHtml` usa. Cobre os três estados possíveis:
// sem host que resolva, resolvido/existente, resolvido/ausente.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parse } from '@markup/core';
import { MarkupDocument } from './MarkupDocument';

function renderSource(source: string, resolveWikiLink?: (target: string) => { exists: boolean; href?: string }) {
  const { ast } = parse(source);
  return renderToStaticMarkup(createElement(MarkupDocument, { document: ast, resolveWikiLink }));
}

describe('wikilink no renderer', () => {
  it('sem resolveWikiLink, renderiza como texto sem destino', () => {
    const html = renderSource('[[Página X]]');
    expect(html).toContain('mu-wikilink-unresolved');
    expect(html).toContain('Página X');
    expect(html).not.toContain('<a');
  });

  it('com resolveWikiLink e documento existente, renderiza link', () => {
    const html = renderSource('[[Página X]]', () => ({ exists: true, href: 'pagina-x.html' }));
    expect(html).toContain('<a');
    expect(html).toContain('mu-wikilink');
    expect(html).not.toContain('mu-wikilink-missing');
    expect(html).toContain('href="pagina-x.html"');
  });

  it('com resolveWikiLink e documento ausente, marca como quebrado', () => {
    const html = renderSource('[[Não Existe]]', () => ({ exists: false }));
    expect(html).toContain('mu-wikilink-missing');
    expect(html).toContain('Documento não encontrado');
  });

  it('usa o alias como rótulo quando presente', () => {
    const html = renderSource('[[Página X|clique aqui]]');
    expect(html).toContain('clique aqui');
    expect(html).not.toContain('>Página X<');
  });

  it('sanitiza esquema javascript: em links normais', () => {
    const html = renderSource('[clique](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="#"');
  });

  it('preserva URLs http/https/relativas normais', () => {
    const html = renderSource('[a](https://example.com) e [b](./local.html)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('href="./local.html"');
  });
});
