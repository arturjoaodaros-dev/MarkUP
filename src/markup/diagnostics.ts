import type { Position } from './ast/nodes';

export type DiagnosticSeverity = 'error' | 'warning';

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  position: Position;
}

export function diagnostic(
  severity: DiagnosticSeverity,
  code: string,
  message: string,
  position: Position,
): Diagnostic {
  return { severity, code, message, position };
}
