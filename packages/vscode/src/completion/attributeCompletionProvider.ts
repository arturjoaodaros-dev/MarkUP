import * as vscode from 'vscode';
import { getDirectiveSchema } from '@markup/core';
import { detectAttributePosition } from './cursorContext';

export class AttributeCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] | null {
    const line = document.lineAt(position.line).text;
    const ctx = detectAttributePosition(line, position.character);
    if (!ctx) return null;

    const schema = getDirectiveSchema(ctx.directiveName);
    if (!schema) return null;

    if (ctx.insideValueOf) {
      const attr = schema.attributes.find((a) => a.name === ctx.insideValueOf);
      if (!attr?.values) return null;
      return attr.values.map((value) => {
        const item = new vscode.CompletionItem(value, vscode.CompletionItemKind.EnumMember);
        if (value === attr.default) item.detail = 'padrão';
        return item;
      });
    }

    return schema.attributes.map((attr) => {
      const item = new vscode.CompletionItem(attr.name, vscode.CompletionItemKind.Property);
      item.detail = attr.description;
      item.insertText = new vscode.SnippetString(
        attr.valueKind === 'enum' && attr.values ? `${attr.name}="\${1|${attr.values.join(',')}|}"` : `${attr.name}="$1"`,
      );
      return item;
    });
  }
}
