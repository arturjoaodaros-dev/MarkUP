// Reparse debounced por documento: uma única fonte de verdade (a AST em
// cache) alimenta diagnósticos, completion, hover e o preview, para que uma
// tecla dispare um único `parse()`, não quatro.

import * as vscode from 'vscode';
import type { Document } from '@markup/core';
import { parse } from '@markup/core';
import { toVscodeRange, toVscodeSeverity } from './positionMapping';

// Mesmo valor usado no debounce do preview no app web (packages/web/src/App.tsx).
const DEBOUNCE_MS = 120;

export class DiagnosticsProvider implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('markup');
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly astCache = new Map<string, Document>();

  /** Último AST conhecido para um documento — reaproveitado por completion/hover/preview. */
  getCachedAst(uri: vscode.Uri): Document | undefined {
    return this.astCache.get(uri.toString());
  }

  scheduleReparse(document: vscode.TextDocument): void {
    if (document.languageId !== 'markup') return;
    const key = document.uri.toString();
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    this.timers.set(
      key,
      setTimeout(() => this.reparseNow(document), DEBOUNCE_MS),
    );
  }

  reparseNow(document: vscode.TextDocument): void {
    const { ast, diagnostics } = parse(document.getText());
    this.astCache.set(document.uri.toString(), ast);
    this.collection.set(
      document.uri,
      diagnostics.map(
        (d) => new vscode.Diagnostic(toVscodeRange(d.position), d.message, toVscodeSeverity(d.severity)),
      ),
    );
  }

  clear(uri: vscode.Uri): void {
    this.collection.delete(uri);
    this.astCache.delete(uri.toString());
    const key = uri.toString();
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    this.timers.delete(key);
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.collection.dispose();
  }
}
