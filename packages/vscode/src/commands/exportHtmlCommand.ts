import * as vscode from 'vscode';
import { parse, visit } from '@markup/core';
import { exportHtml } from '@markup/renderer';
import { readDocumentCss, readKatexCss } from './readAssets';

export function registerExportHtmlCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('markup.exportHtml', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markup') {
      vscode.window.showWarningMessage('Abra um arquivo .markup ou .mkup para exportar.');
      return;
    }

    const html = await buildHtml(context, editor.document);
    const defaultName = editor.document.fileName.replace(/\.(markup|mkup)$/, '') + '.html';
    const target = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(defaultName),
      filters: { HTML: ['html'] },
    });
    if (!target) return;

    await vscode.workspace.fs.writeFile(target, Buffer.from(html, 'utf-8'));
    vscode.window.showInformationMessage(`MarkUP exportado para ${target.fsPath}`);
  });
}

export function registerCopyHtmlCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('markup.copyHtml', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markup') {
      vscode.window.showWarningMessage('Abra um arquivo .markup ou .mkup para copiar o HTML.');
      return;
    }
    const html = await buildHtml(context, editor.document);
    await vscode.env.clipboard.writeText(html);
    vscode.window.showInformationMessage('HTML copiado para a área de transferência.');
  });
}

async function buildHtml(context: vscode.ExtensionContext, document: vscode.TextDocument): Promise<string> {
  const { ast } = parse(document.getText());
  let hasMath = false;
  visit(ast, (n) => {
    if (n.type === 'math') hasMath = true;
  });
  const title = document.fileName.split(/[\\/]/).pop()?.replace(/\.(markup|mkup)$/, '');
  return exportHtml(ast, {
    title,
    documentCss: readDocumentCss(context),
    katexCss: hasMath ? readKatexCss(context) : undefined,
  });
}
