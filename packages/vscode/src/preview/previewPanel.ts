import * as vscode from 'vscode';
import { findNodeAtOffset, parse, type Document } from '@markup/core';
import { buildWebviewHtml } from './webviewHtml';

type WebviewMessage = { type: 'ready' } | { type: 'revealPosition'; offset: number };

/**
 * Um painel de preview por editor de texto de origem. `retainContextWhenHidden`
 * evita remontar o React ao trocar de aba; `panel.webview.html` é setado uma
 * única vez, na criação — todo update depois disso vai por `postMessage`.
 */
export class PreviewPanel {
  private static readonly panels = new Map<string, PreviewPanel>();

  static createOrShow(extensionUri: vscode.Uri, document: vscode.TextDocument): void {
    const key = document.uri.toString();
    const existing = PreviewPanel.panels.get(key);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.Beside);
      existing.update(document);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'markupPreview',
      `Preview: ${document.fileName.split(/[\\/]/).pop()}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist'), vscode.Uri.joinPath(extensionUri, 'media')],
      },
    );

    const instance = new PreviewPanel(panel, extensionUri, document);
    PreviewPanel.panels.set(key, instance);
    panel.onDidDispose(() => PreviewPanel.panels.delete(key));
  }

  /** Reenvia a AST atual para o preview aberto deste documento, se houver. */
  static updateIfOpen(document: vscode.TextDocument): void {
    PreviewPanel.panels.get(document.uri.toString())?.update(document);
  }

  static postHighlight(document: vscode.TextDocument, offset: number): void {
    PreviewPanel.panels.get(document.uri.toString())?.panel.webview.postMessage({ type: 'highlight', offset });
  }

  private ready = false;
  private pendingAst: Document | null = null;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private sourceDocument: vscode.TextDocument,
  ) {
    this.panel.webview.html = buildWebviewHtml(this.panel.webview, extensionUri);
    this.panel.webview.onDidReceiveMessage((message: WebviewMessage) => this.handleMessage(message));
    this.pendingAst = parse(sourceDocument.getText()).ast;
  }

  private update(document: vscode.TextDocument): void {
    this.sourceDocument = document;
    const ast = parse(document.getText()).ast;
    if (!this.ready) {
      this.pendingAst = ast;
      return;
    }
    this.panel.webview.postMessage({ type: 'update', ast });
  }

  private handleMessage(message: WebviewMessage): void {
    if (message.type === 'ready') {
      this.ready = true;
      this.panel.webview.postMessage({ type: 'init', ast: this.pendingAst ?? parse(this.sourceDocument.getText()).ast });
      return;
    }
    if (message.type === 'revealPosition') {
      this.revealInEditor(message.offset);
    }
  }

  private revealInEditor(offset: number): void {
    const editor = vscode.window.visibleTextEditors.find(
      (e) => e.document.uri.toString() === this.sourceDocument.uri.toString(),
    );
    if (!editor) return;
    const ast = parse(this.sourceDocument.getText()).ast;
    const node = findNodeAtOffset(ast, offset);
    const position = this.sourceDocument.positionAt(node?.position.start.offset ?? offset);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    editor.selection = new vscode.Selection(position, position);
  }
}
