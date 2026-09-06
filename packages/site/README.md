# @markup/site

O site de documentação do MarkUP — minimalista, inspirado em sites como
python.org: uma coluna de conteúdo, um sumário lateral por página, e quase
nenhuma cor além do texto e um único tom de azul para links.

Não é um segundo renderer nem um site gerado por um framework de
documentação. `docs/GUIDE.md` e `docs/SPEC.md` são Markdown de verdade,
processados pelo mesmo `@markup/core` e renderizados pelo mesmo
`MarkupDocument` de `@markup/renderer` que o app web e a extensão do VS Code
usam — o site é só uma casca (cabeçalho, sumário, tema) em volta do mesmo
HTML que o resto do MarkUP já produz. A home tem um "Experimente" ao vivo:
o mesmo parser rodando no navegador, sem servidor.

## Build

```bash
npm run build --workspace=packages/site
```

Gera HTML/CSS/JS estático em `packages/site/public/` — sem servidor, sem
passo de build no destino. Publicável em qualquer host estático.

## Pré-visualizar localmente

```bash
npm run serve --workspace=packages/site
```

Abre em `http://localhost:4173`.

## Deploy

`.github/workflows/site.yml` builda e publica `packages/site/public/` no
GitHub Pages a cada push em `main` que toque `docs/`, `packages/core/`,
`packages/renderer/` ou o próprio `packages/site/`. Para ativar: nas
configurações do repositório, em **Settings → Pages**, mude a fonte para
"GitHub Actions".

## Estrutura

- `content/home.md` — conteúdo da página inicial (as demais páginas vêm
  direto de `docs/GUIDE.md` e `docs/SPEC.md`, sem duplicar o texto aqui).
- `src/renderPages.tsx` — roda em Node (empacotado pelo esbuild): lê cada
  página, chama `parse()` e `MarkupDocument`, devolve o HTML já renderizado.
- `src/playground.tsx` — bundle de navegador para o "Experimente" da home.
- `styles/site.css` — só a casca do site (cabeçalho, layout, sumário). As
  cores e a tipografia do conteúdo em si vêm de
  `@markup/renderer/document.css`, reaproveitado sem cópia.
- `scripts/build.mjs` — orquestra as duas passadas do esbuild e monta o HTML
  final de cada página.
