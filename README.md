# MarkUP

> Markdown was designed for text. MarkUP is designed for documents.

Editor e renderizador para o MarkUP: uma linguagem de documentos que preserva
a sintaxe familiar do Markdown e acrescenta componentes ricos e estruturados
via diretivas (`:::chart`, `:::card`, `:::alert`, `:::progress`, `:::math`,
`:::code`, `:::tabs`).

Roda inteiramente no navegador — sem backend, sem contas, sem serviços
externos. Documentos ficam salvos no `localStorage`.

## Uso

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`. Um documento de exemplo já vem carregado; use a
seção **Templates** na barra lateral para carregar outros, incluindo um que
exercita todos os recursos da linguagem.

Outros comandos:

```bash
npm run test    # suíte do parser e da geometria dos gráficos (Vitest)
npm run build   # build de produção (tsc + vite build)
npm run lint    # ESLint
```

## Arquitetura

```text
markup source ──► parser ──► AST + diagnósticos ──► renderer (React) ──► preview
                                                              │
                                                              └──► exportHtml ──► HTML autocontido
```

- [`src/markup`](src/markup) — núcleo da linguagem: scanner, parser de blocos
  e inline, registro de diretivas, AST, diagnósticos. TypeScript puro, sem
  dependência de React ou DOM.
- [`src/renderer`](src/renderer) — AST → React: um dispatcher central
  (`MarkupDocument.tsx`) e um componente por tipo de nó. `exportHtml.ts` usa
  os mesmos componentes via `renderToStaticMarkup`, garantindo que o HTML
  exportado nunca diverge do preview.
- [`src/app`](src/app) — casca da aplicação: editor (CodeMirror), preview,
  sidebar, toolbar, barra de status, estado (Zustand) e persistência
  (`localStorage`, atrás de uma interface `DocumentRepository`).

A especificação normativa da linguagem está em [`docs/SPEC.md`](docs/SPEC.md).

## Recursos

- Três modos de edição: Edit, Preview, Split.
- Indicador de erros de parsing em tempo real (sarjeta do editor, barra de
  status, painel de problemas).
- Tema claro/escuro.
- Novo documento, abrir arquivo local, salvar como `.markup`, exportar/copiar
  HTML.
- Templates prontos, incluindo um que cobre todas as construções da
  linguagem.

## Limitações conhecidas

Ver a seção final de [`docs/SPEC.md`](docs/SPEC.md#4-limitações-conhecidas-v1).
