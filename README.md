# MarkUP

> Markdown was designed for text. MarkUP is designed for documents.

MarkUP é uma linguagem de documentos que preserva a sintaxe familiar do
Markdown e acrescenta componentes ricos e estruturados via diretivas
(`:::chart`, `:::card`, `:::alert`, `:::progress`, `:::math`, `:::code`,
`:::tabs`). Este repositório é um monorepo (npm workspaces) com o núcleo da
linguagem, o app web e a extensão oficial do VS Code, todos construídos sobre
o mesmo parser/AST/renderer — nunca uma segunda implementação.

Roda inteiramente no navegador/editor — sem backend, sem contas, sem
serviços externos.

## Pacotes

| Pacote | O que é |
| --- | --- |
| [`packages/core`](packages/core) | `@markup/core` — scanner, parser de blocos e inline, AST, diagnósticos, registro de diretivas com schema (nomes/atributos/valores válidos). TypeScript puro, zero dependências, sem React/DOM. |
| [`packages/renderer`](packages/renderer) | `@markup/renderer` — AST → React: um dispatcher central (`MarkupDocument`) e um componente por tipo de nó, mais `exportHtml` (usa os mesmos componentes via `renderToStaticMarkup`, então o HTML exportado nunca diverge do preview). Agnóstico de bundler — roda tanto no Vite quanto no esbuild da extensão. |
| [`packages/vscode`](packages/vscode) | Extensão oficial do VS Code: linguagem `.markup`/`.mkup`, highlighting, diagnósticos, autocomplete, hover e preview nativo — tudo em cima de `@markup/core`/`@markup/renderer`, sem duplicar validação. |
| [`packages/site`](packages/site) | Site de documentação (`docs/GUIDE.md`/`docs/SPEC.md` renderizados pelo mesmo `@markup/renderer`, com um "Experimente" ao vivo). Estático, sem framework de site. |

A especificação normativa da linguagem está em [`docs/SPEC.md`](docs/SPEC.md).
Para o guia completo — todas as diretivas, Markdown suportado, diagnósticos,
comandos da extensão e exemplos — veja [`docs/GUIDE.md`](docs/GUIDE.md).

## Uso — extensão do VS Code

```bash
npm run build --workspace=packages/vscode
```

Abra a pasta `packages/vscode` no VS Code e pressione `F5` para testar num
Extension Development Host, ou gere um `.vsix` instalável localmente:

```bash
npm run package --workspace=packages/vscode
code --install-extension packages/vscode/markup-lang-0.1.0.vsix
```

Detalhes em [`packages/vscode/README.md`](packages/vscode/README.md).

## Site de documentação

```bash
npm run build --workspace=packages/site
npm run serve --workspace=packages/site
```

Abre em `http://localhost:4173`. Publicado automaticamente no GitHub Pages a
cada push em `main` (`.github/workflows/site.yml`). Detalhes em
[`packages/site/README.md`](packages/site/README.md).

## Comandos do monorepo

```bash
npm test         # todos os pacotes (Vitest workspace)
npm run build    # build de cada pacote que tiver script de build
npm run typecheck  # tsc --noEmit em cada pacote
npm run lint     # ESLint em todos os pacotes
```

## Arquitetura

```text
                 @markup/core  (zero deps, TS puro)
                      │
        ┌─────────────┼─────────────────┐
        │             │                 │
  @markup/renderer  (React)             │
        │             │                 │
   packages/vscode   packages/site ─────┘
   (extensão)         (docs, estático — inclui o Interpretador ao vivo)
```

## Recursos

- Indicador de erros de parsing em tempo real no VS Code (sublinhado +
  painel Problems), e ao vivo no Interpretador do site de documentação.
- Tema claro/escuro no site de documentação e no VS Code.
- Exportar/copiar HTML — mesmo `exportHtml` em todas as plataformas.
- Autocomplete, hover e preview nativo no VS Code, derivados do mesmo schema
  de diretivas do core (nenhuma lista de valores válidos duplicada).

## Limitações conhecidas

Ver [`docs/SPEC.md`](docs/SPEC.md#4-limitações-conhecidas-v1) para a
linguagem e [`packages/vscode/README.md`](packages/vscode/README.md#limitações-conhecidas-v1)
para a extensão.
