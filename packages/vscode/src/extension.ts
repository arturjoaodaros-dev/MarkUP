import * as vscode from 'vscode';
import { findNodeAtOffset } from '@markup/core';
import { DiagnosticsProvider } from './diagnostics/diagnosticsProvider';
import { DirectiveNameCompletionProvider } from './completion/directiveNameCompletionProvider';
import { AttributeCompletionProvider } from './completion/attributeCompletionProvider';
import { MarkupHoverProvider } from './hover/hoverProvider';
import { PreviewPanel } from './preview/previewPanel';
import { registerOpenPreviewCommand } from './commands/openPreviewCommand';
import { registerExportHtmlCommand, registerCopyHtmlCommand } from './commands/exportHtmlCommand';

const MARKUP_SELECTOR: vscode.DocumentSelector = { language: 'markup' };

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = new DiagnosticsProvider();
  context.subscriptions.push(diagnostics);

  for (const doc of vscode.workspace.textDocuments) diagnostics.reparseNow(doc);

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => diagnostics.reparseNow(doc)),
    vscode.workspace.onDidChangeTextDocument((e) => {
      diagnostics.scheduleReparse(e.document);
      // O preview reage ao próprio evento de mudança de documento com o
      // mesmo debounce da linter, então a atualização chega junto.
      setTimeout(() => PreviewPanel.updateIfOpen(e.document), 130);
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => diagnostics.clear(doc.uri)),
  );

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(MARKUP_SELECTOR, new DirectiveNameCompletionProvider(), ':'),
    vscode.languages.registerCompletionItemProvider(MARKUP_SELECTOR, new AttributeCompletionProvider(), ' ', '"', "'"),
    vscode.languages.registerHoverProvider(MARKUP_SELECTOR, new MarkupHoverProvider(diagnostics)),
  );

  context.subscriptions.push(
    registerOpenPreviewCommand(context),
    registerExportHtmlCommand(context),
    registerCopyHtmlCommand(context),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (e.textEditor.document.languageId !== 'markup') return;
      const ast = diagnostics.getCachedAst(e.textEditor.document.uri);
      if (!ast) return;
      const offset = e.textEditor.document.offsetAt(e.selections[0].active);
      const node = findNodeAtOffset(ast, offset);
      if (node) PreviewPanel.postHighlight(e.textEditor.document, node.position.start.offset);
    }),
  );
}

export function deactivate(): void {
  // Nada a limpar explicitamente — os `Disposable`s em `context.subscriptions`
  // já cobrem diagnósticos, listeners e comandos.
}
