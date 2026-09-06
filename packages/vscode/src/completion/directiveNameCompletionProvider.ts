import * as vscode from 'vscode';
import { getDirectiveNames, getDirectiveSchema } from '@markup/core';
import { isDirectiveNamePosition } from './cursorContext';

export class DirectiveNameCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] | null {
    const prefix = document.lineAt(position.line).text.slice(0, position.character);
    if (!isDirectiveNamePosition(prefix)) return null;

    return getDirectiveNames().map((name) => {
      const schema = getDirectiveSchema(name);
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Module);
      item.detail = schema?.description;
      item.documentation = schema ? buildDocumentation(schema.description, schema.bodyDescription) : undefined;
      return item;
    });
  }
}

function buildDocumentation(description: string, bodyDescription?: string): vscode.MarkdownString {
  const md = new vscode.MarkdownString(description);
  if (bodyDescription) md.appendText('\n' + bodyDescription);
  return md;
}
