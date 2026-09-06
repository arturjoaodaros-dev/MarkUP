# MarkUP para VS Code

Suporte de linguagem e preview nativo para documentos MarkUP (`.markup`, `.mkup`)
dentro do VS Code.

Reutiliza diretamente `@markup/core` (parser, AST, validação) e
`@markup/renderer` (o mesmo componente React usado pelo app web) — não existe
um segundo parser nem uma segunda lista de tipos/atributos válidos aqui.
Qualquer diretiva nova adicionada ao core (`packages/core/src/directives`)
aparece automaticamente no autocomplete, no hover e na validação da
extensão, sem precisar tocar neste pacote.

## Recursos

- Reconhecimento de `.markup`/`.mkup` como linguagem MarkUP.
- Realce de sintaxe que diferencia diretiva, atributo, valor e conteúdo do
  Markdown normal (não é o highlighting genérico de Markdown).
- Diagnósticos em tempo real (diretiva desconhecida, atributo inválido,
  bloco não fechado etc.), na posição exata reportada pelo parser.
- Autocomplete de nomes de diretiva (após `:::`) e de atributos/valores
  (ex.: `type="` sugere `bar`/`line`/`pie` dentro de `:::chart`).
- Hover com a documentação de cada diretiva e seus atributos.
- `MarkUP: Open Preview` — preview nativo, atualizado incrementalmente
  (sem recarregar o webview), com sincronização de posição entre editor e
  preview baseada nas posições reais da AST.
- `MarkUP: Export to HTML...` / `MarkUP: Copy as HTML` — usam o mesmo
  `exportHtml` do app web.
- Snippets para as sete diretivas (`chart`, `card`, `alert`, `progress`,
  `math`, `code`, `tabs`).

## Desenvolvimento

```bash
npm install        # na raiz do monorepo
npm run build --workspace=packages/vscode
```

Abra a pasta `packages/vscode` no VS Code e pressione `F5` para abrir um
Extension Development Host com a extensão carregada.

```bash
npm run watch --workspace=packages/vscode   # rebuild incremental
npm run test --workspace=packages/vscode    # testes unitários (Vitest, sem o vscode real)
npm run test:e2e --workspace=packages/vscode  # suíte de fumaça em uma instância real do VS Code
```

Empacotar em `.vsix` para instalação local:

```bash
npm run package --workspace=packages/vscode
code --install-extension packages/vscode/markup-lang-0.1.0.vsix
```

## Arquitetura

- `src/extension.ts` — ativação, wiring de providers e comandos.
- `src/diagnostics/` — `rangeMath.ts` (aritmética pura, testável) +
  `positionMapping.ts` (wrappers com `vscode.Range`) + `diagnosticsProvider.ts`
  (reparse debounced, AST em cache compartilhada com completion/hover/preview).
- `src/completion/` — `cursorContext.ts` (detecção pura de contexto do
  cursor) + os dois providers.
- `src/hover/` — usa `findNodeAtOffset` do core sobre a AST em cache.
- `src/preview/` — `previewPanel.ts` (protocolo de mensagens) +
  `webviewHtml.ts` (shell HTML do webview).
- `src/webview/index.tsx` — roda dentro do webview; monta o mesmo
  `MarkupDocument` do `@markup/renderer`.
- `src/commands/` — exportar/copiar HTML, abrir preview.
- `esbuild.mjs` — dois bundles (host da extensão em Node, webview em
  navegador) mais a cópia de `document.css`/`katex.min.css` para `media/`.

## Limitações conhecidas (v1)

- Sem highlighting embutido por linguagem dentro de `:::code language="X"`
  no editor (o preview já colore via highlight.js normalmente).
- A gramática TextMate aceita fechamento de diretiva por `:{3,}` de forma
  aproximada; nunca afeta o parser real, só a cor no editor em casos raros
  de aninhamento incomum.
- `publisher` no `package.json` é um placeholder — troque antes de publicar
  no Marketplace.
