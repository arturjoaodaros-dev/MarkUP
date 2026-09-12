# ADR 0001 — Stack do aplicativo desktop MarkUP

- **Status**: aceita
- **Data**: 2026-09-11

## Contexto

A MarkUP tinha até agora uma extensão VS Code e um app web (SPA, removido). O
objetivo passou a ser uma aplicação desktop dedicada para Windows, inspirada
na filosofia do Obsidian (workspace, editor, preview, links, busca, grafo),
mas com identidade própria.

`@markup/core` (parser, zero dependências, TypeScript puro) e
`@markup/renderer` (AST → React, roda tanto no navegador quanto headless em
Node via `react-dom/server`) já existem e são reaproveitados sem mudança por
`packages/web`, `packages/vscode` e `packages/site`. A extensão VS Code já
prova um padrão de host nativo + webview: o host manda o AST via
`postMessage`, o webview roda `MarkupDocument` (bundle browser via esbuild) e
nunca recebe HTML bruto do documento.

## Alternativas consideradas

| | Tauri 2 (Rust) | Electron (Node) | .NET/WPF (C#) |
|---|---|---|---|
| Toolchain já presente na máquina de dev | Não — falta Rust/cargo e MSVC ARM64 build tools | Sim — Node 24 já instalado | Sim — .NET SDK 10 e `Microsoft.WindowsDesktop.App` já instalados |
| ARM64 | Binário nativo ARM64; instalador NSIS roda sob emulação x86 ([Tauri docs](https://v2.tauri.app/distribute/windows-installer/)) | Suporte oficial desde 6.0.8, builds dedicados ([electronjs.org](https://www.electronjs.org/docs/latest/tutorial/windows-arm)) | Runtime maduro em produção da Microsoft; publish self-contained precisa rodar em máquina ARM64 (não cross-compila) |
| Peso do runtime | Menor (binário nativo, sem runtime embutido) | Maior (Chromium+Node embutidos) | Pequeno-médio (WebView2 é componente do SO, não embutido) |
| Reuso do renderer existente | Via WebView2, sem reescrita | Via Chromium embutido, sem reescrita | Via WebView2, sem reescrita |

Em todas as três, o preview/editor MarkUP em si é resolvido hospedando o
mesmo bundle de `@markup/renderer` num webview Chromium — a diferença real
está em quem escreve o shell nativo (árvore de arquivos, comandos, janelas).

## Decisão

**.NET/WPF + WebView2.** C#/XAML para o shell nativo; o WebView2 hospeda o
bundle browser de `@markup/renderer` (mesmo padrão esbuild já usado em
`packages/vscode/esbuild.mjs`), recebendo o texto do documento do host e
devolvendo AST/preview via `postMessage` — sem reescrever parser nem
renderer em C#.

Motivo decisivo: zero instalação de toolchain necessária para começar hoje
(SDK .NET 10 e WebView2 Runtime já presentes), suporte ARM64 maduro em
produção da própria Microsoft, e controle fino de memória/performance sem
duplicar um runtime Chromium+Node (que o Electron embutiria).

## Sobre ARM64

O alvo original da missão era Windows ARM64 como restrição de primeira
classe. O usuário confirmou que **x64 é aceitável por ora** — não é mais
bloqueante. A arquitetura permanece portável (RIDs do .NET, WebView2 já
suporta ARM64 nativamente) para não fechar essa porta, mas nenhum esforço de
CI/hardware ARM64 foi gasto nesta fase.

## Consequências

- O app desktop não reimplementa highlighting, gráficos SVG, KaTeX ou
  tabelas — tudo isso continua vivendo em `@markup/renderer`.
- O C# só cuida de: janelas, árvore de arquivos, leitura/escrita de disco,
  comandos nativos. Nenhuma lógica de linguagem MarkUP em C#.
- Publish self-contained para `win-arm64` vai precisar rodar numa máquina ou
  runner ARM64 quando essa fase chegar — registrado como risco conhecido,
  não como bloqueio atual.

## Reversibilidade

Alta. O shell WPF é uma casca fina sobre o mesmo bundle de renderer já
usado por VS Code e site — trocar de shell nativo (para Tauri ou outro)
no futuro não exigiria tocar em `@markup/core`/`@markup/renderer`.
