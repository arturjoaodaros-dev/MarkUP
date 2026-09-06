import * as vscode from 'vscode';
import { PreviewPanel } from '../preview/previewPanel';

export function registerOpenPreviewCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('markup.openPreview', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markup') {
      vscode.window.showWarningMessage('Abra um arquivo .markup ou .mkup para ver o preview.');
      return;
    }
    PreviewPanel.createOrShow(context.extensionUri, editor.document);
  });
}
