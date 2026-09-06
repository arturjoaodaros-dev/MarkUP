import * as vscode from 'vscode';
import { findNodeAtOffset, getDirectiveSchema, type DirectiveSchema } from '@markup/core';
import type { DiagnosticsProvider } from '../diagnostics/diagnosticsProvider';

export class MarkupHoverProvider implements vscode.HoverProvider {
  constructor(private readonly diagnostics: DiagnosticsProvider) {}

  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
    const ast = this.diagnostics.getCachedAst(document.uri);
    if (!ast) return null;

    const offset = document.offsetAt(position);
    const node = findNodeAtOffset(ast, offset);
    if (!node) return null;

    const schema = getDirectiveSchema(node.type);
    if (!schema) return null;

    return new vscode.Hover(buildHoverMarkdown(schema));
  }
}

function buildHoverMarkdown(schema: DirectiveSchema): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${capitalize(schema.name)}**\n\n${schema.description}`);
  if (schema.bodyDescription) {
    md.appendMarkdown(`\n\n${schema.bodyDescription}`);
  }
  const withValues = schema.attributes.filter((a) => a.values && a.values.length > 0);
  for (const attr of withValues) {
    md.appendMarkdown(`\n\n**${attr.name}**: ${attr.description}\n`);
    md.appendMarkdown(attr.values!.map((v) => `- \`${v}\`${v === attr.default ? ' (padrão)' : ''}`).join('\n'));
  }
  return md;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
