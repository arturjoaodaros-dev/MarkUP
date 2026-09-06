// Wrappers finos que constroem `vscode.Range`/`vscode.DiagnosticSeverity` a
// partir da aritmética pura de `rangeMath.ts`. Este módulo importa `vscode`,
// então nunca é importado por testes — só pelo código que roda de verdade
// dentro do host da extensão.

import type { Position, DiagnosticSeverity as CoreSeverity } from '@markup/core';
import * as vscode from 'vscode';
import { toZeroBasedRange } from './rangeMath';

export function toVscodeRange(pos: Position): vscode.Range {
  const r = toZeroBasedRange(pos);
  return new vscode.Range(
    new vscode.Position(r.start.line, r.start.column),
    new vscode.Position(r.end.line, r.end.column),
  );
}

export function toVscodeSeverity(severity: CoreSeverity): vscode.DiagnosticSeverity {
  return severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
}
