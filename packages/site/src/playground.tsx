// Bundle de navegador (esbuild, alvo browser — ver scripts/build.mjs). Monta
// tanto o "Experimente" pequeno da home quanto a página cheia do
// Interpretador — o mesmo parser e o mesmo MarkupDocument de sempre,
// rodando ao vivo no navegador do visitante. Nenhuma lógica nova aqui, só a
// ligação entre um <textarea> comum (sem autocomplete, sem CodeMirror, de
// propósito) e o componente já existente.

import { createRoot } from 'react-dom/client';
import { createElement, useEffect, useState } from 'react';
import { parse } from '@markup/core';
import { MarkupDocument } from '@markup/renderer';

const HOME_DEFAULT = `Escreva **Markdown** normal, ou uma diretiva:

:::progress value="72" label="MarkUP"
:::

:::alert type="info"
Edite este texto e veja o preview mudar.
:::`;

const INTERPRETER_DEFAULT = `# Relatório de vendas

As vendas cresceram **18%** no último trimestre, puxadas por \`Q4\`.

:::chart type="bar" title="Vendas por trimestre"
Q1: 120
Q2: 180
Q3: 240
Q4: 310
:::

:::card title="Performance"
CPU: 78%
RAM: 64%
:::

:::alert type="warning"
Esta operação pode apagar dados.
:::

- Escreva à vontade aqui.
`;

const STORAGE_KEY = 'markup-site-interpreter';

interface PlaygroundProps {
  defaultSource: string;
  /** Persiste o conteúdo entre visitas (usado só no Interpretador, não no widget da home). */
  persist?: boolean;
}

// eslint-disable-next-line react-refresh/only-export-components -- ponto de entrada de bundle, não um módulo de componentes consumido por HMR
function Playground({ defaultSource, persist = false }: PlaygroundProps) {
  const [source, setSource] = useState(() => {
    if (persist) {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return saved;
      } catch {
        // localStorage indisponível (aba privada etc.) — segue com o padrão.
      }
    }
    return defaultSource;
  });

  useEffect(() => {
    if (!persist) return;
    try {
      localStorage.setItem(STORAGE_KEY, source);
    } catch {
      // idem — falha silenciosa, não é essencial.
    }
  }, [persist, source]);

  const { ast, diagnostics } = parse(source);

  return createElement(
    'div',
    { className: 'playground-grid' },
    createElement('textarea', {
      className: 'playground-input',
      value: source,
      spellCheck: false,
      autoCapitalize: 'off',
      autoCorrect: 'off',
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

const homeRoot = document.getElementById('playground-root');
if (homeRoot) {
  createRoot(homeRoot).render(createElement(Playground, { defaultSource: HOME_DEFAULT }));
}

const interpreterRoot = document.getElementById('interpreter-root');
if (interpreterRoot) {
  createRoot(interpreterRoot).render(createElement(Playground, { defaultSource: INTERPRETER_DEFAULT, persist: true }));
}
