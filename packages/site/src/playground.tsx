// Bundle de navegador (esbuild, alvo browser — ver scripts/build.mjs). Monta
// o "Experimente" da home: o mesmo parser e o mesmo MarkupDocument de
// sempre, rodando ao vivo no navegador do visitante. Nenhuma lógica nova
// aqui, só a ligação entre um <textarea> e o componente já existente.

import { createRoot } from 'react-dom/client';
import { createElement, useState } from 'react';
import { parse } from '@markup/core';
import { MarkupDocument } from '@markup/renderer';

const DEFAULT_SOURCE = `Escreva **Markdown** normal, ou uma diretiva:

:::progress value="72" label="MarkUP"
:::

:::alert type="info"
Edite este texto e veja o preview mudar.
:::`;

// eslint-disable-next-line react-refresh/only-export-components -- ponto de entrada de bundle, não um módulo de componentes consumido por HMR
function Playground() {
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const { ast, diagnostics } = parse(source);

  return createElement(
    'div',
    { className: 'playground-grid' },
    createElement('textarea', {
      className: 'playground-input',
      value: source,
      spellCheck: false,
      'aria-label': 'Editor MarkUP',
      onChange: (e: { target: { value: string } }) => setSource(e.target.value),
    }),
    createElement(
      'div',
      { className: 'playground-output' },
      createElement(MarkupDocument, { document: ast }),
      diagnostics.length > 0 &&
        createElement(
          'p',
          { className: 'playground-hint' },
          `${diagnostics.length} aviso(s) de parsing — normal enquanto você digita.`,
        ),
    ),
  );
}

const root = document.getElementById('playground-root');
if (root) {
  createRoot(root).render(createElement(Playground));
}
