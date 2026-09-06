// Contexto usado apenas durante a exportação de HTML estático.
//
// `renderToStaticMarkup` é síncrono, então não pode aguardar o KaTeX ou o
// highlight.js carregarem em meio à árvore. Em vez de manter um segundo
// renderer, `exportHtml` resolve tudo isso ANTES de renderizar e injeta o
// resultado aqui; os componentes `Math` e `CodeBlock` consultam este
// contexto e, se estiver presente, usam o HTML já resolvido em vez de
// carregar as bibliotecas sob demanda. No preview ao vivo o contexto é
// `null` e o comportamento assíncrono normal se aplica.

import { createContext, useContext } from 'react';
import type { CodeBlock, MathBlock } from '../markup/parser';

export interface ExportResolved {
  math: Map<MathBlock, string>;
  code: Map<CodeBlock, { html: string; language?: string }>;
}

export const ExportContext = createContext<ExportResolved | null>(null);

export function useExportResolved() {
  return useContext(ExportContext);
}
