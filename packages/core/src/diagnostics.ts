import type { Range } from './source/position.ts';

export type Severity = 'error' | 'warning' | 'info' | 'hint';

export interface TextEdit {
  range: Range;
  newText: string;
}

/** A machine-applicable fix. Editors surface these as quick fixes. */
export interface DiagnosticFix {
  title: string;
  edits: TextEdit[];
  /** The fix most likely to be what the author wants. */
  preferred?: boolean;
}

export interface RelatedInformation {
  range: Range;
  message: string;
}

export interface Diagnostic {
  code: DiagnosticCode;
  severity: Severity;
  message: string;
  range: Range;
  source: 'markup';
  related?: RelatedInformation[];
  fixes?: DiagnosticFix[];
}

interface CodeInfo {
  name: string;
  severity: Severity;
  summary: string;
}

/**
 * The diagnostic catalogue. Codes are stable: tools may filter or suppress them.
 *
 * - `MU1xxx` — syntax (the document cannot be read the way the author intended)
 * - `MU15xx` — MarkUP Data syntax (front matter and data bodies)
 * - `MU2xxx` — validation against directive specs and document-level rules
 * - `MU9xxx` — internal
 */
export const DIAGNOSTIC_CODES = {
  MU1001: {
    name: 'unclosed-directive',
    severity: 'error',
    summary: 'A container directive was never closed with a `:::` fence.',
  },
  MU1002: {
    name: 'implicitly-closed-directive',
    severity: 'error',
    summary:
      'A container directive was closed implicitly by the closing fence of an outer directive or by the end of its parent block.',
  },
  MU1003: {
    name: 'stray-closing-fence',
    severity: 'error',
    summary: 'A closing fence does not match any open container directive at this nesting level.',
  },
  MU1004: {
    name: 'short-closing-fence',
    severity: 'error',
    summary: 'A closing fence is shorter than the opening fence of the innermost open directive.',
  },
  MU1005: {
    name: 'directive-trailing-content',
    severity: 'error',
    summary: 'Unexpected text after a block directive’s name, label or attributes.',
  },
  MU1006: {
    name: 'directive-name-spacing',
    severity: 'warning',
    summary:
      'Whitespace between the colons and a directive name (`::: note`). The directive is still recognised; write `:::note`.',
  },
  MU1007: {
    name: 'unterminated-label',
    severity: 'error',
    summary: 'A directive label `[` is not closed on the same line.',
  },
  MU1008: {
    name: 'unterminated-attributes',
    severity: 'error',
    summary: 'An attribute block `{` is not closed.',
  },
  MU1009: {
    name: 'invalid-attribute',
    severity: 'error',
    summary: 'An attribute block contains something that is not an id, class or key/value pair.',
  },
  MU1010: {
    name: 'duplicate-attribute',
    severity: 'warning',
    summary: 'The same attribute key appears more than once; the last value wins.',
  },
  MU1011: {
    name: 'unclosed-code-fence',
    severity: 'warning',
    summary: 'A fenced code block runs to the end of its container without a closing fence.',
  },
  MU1012: {
    name: 'comment-problem',
    severity: 'warning',
    summary:
      'A `<!--` comment block is never closed with `-->`, or has text after `-->` that is hidden with it.',
  },
  MU1013: {
    name: 'missing-directive-name',
    severity: 'error',
    summary: 'A directive fence is not followed by a name.',
  },
  MU1014: {
    name: 'table-extra-cells',
    severity: 'warning',
    summary: 'A table row has more cells than the header; the extra cells are dropped.',
  },
  MU1015: {
    name: 'nesting-too-deep',
    severity: 'error',
    summary: 'Nesting exceeds the parser’s depth limit; deeper structure is flattened into text.',
  },
  MU1016: {
    name: 'unclosed-front-matter',
    severity: 'warning',
    summary: 'A front matter block opened with `---` on the first line is never closed.',
  },
  MU1501: {
    name: 'data-syntax',
    severity: 'error',
    summary: 'MarkUP Data (front matter or a data body) is malformed.',
  },
  MU1502: {
    name: 'data-duplicate-key',
    severity: 'error',
    summary: 'A key appears twice in the same MarkUP Data mapping; the later entry is ignored.',
  },
  MU1503: {
    name: 'data-tab-indent',
    severity: 'error',
    summary: 'MarkUP Data indentation must use spaces, not tabs.',
  },
  MU1504: {
    name: 'data-unterminated-string',
    severity: 'error',
    summary: 'A quoted string in MarkUP Data is not closed on its line.',
  },
  MU2001: {
    name: 'unknown-directive',
    severity: 'warning',
    summary: 'No component with this name is registered.',
  },
  MU2002: {
    name: 'directive-form-not-allowed',
    severity: 'error',
    summary: 'The component cannot be used in this form (inline, leaf or container).',
  },
  MU2003: {
    name: 'unknown-attribute',
    severity: 'warning',
    summary: 'The component does not declare this attribute.',
  },
  MU2004: {
    name: 'invalid-attribute-value',
    severity: 'error',
    summary: 'An attribute value does not match the component’s schema.',
  },
  MU2005: {
    name: 'missing-attribute',
    severity: 'error',
    summary: 'A required attribute is missing.',
  },
  MU2006: {
    name: 'missing-label',
    severity: 'error',
    summary: 'The component requires a `[label]`.',
  },
  MU2007: {
    name: 'unexpected-label',
    severity: 'warning',
    summary: 'The component does not use a `[label]`; it is ignored.',
  },
  MU2008: {
    name: 'invalid-parent',
    severity: 'error',
    summary: 'The component is placed inside a parent that does not allow it.',
  },
  MU2009: {
    name: 'invalid-child',
    severity: 'error',
    summary: 'The component only accepts specific children.',
  },
  MU2010: {
    name: 'invalid-data',
    severity: 'error',
    summary: 'A data body or front matter value does not match its schema.',
  },
  MU2011: { name: 'missing-body', severity: 'error', summary: 'The component requires a body.' },
  MU2020: { name: 'duplicate-id', severity: 'warning', summary: 'Two elements share the same id.' },
  MU2021: {
    name: 'undefined-footnote',
    severity: 'warning',
    summary: 'A footnote reference has no matching definition.',
  },
  MU2022: {
    name: 'unused-footnote',
    severity: 'hint',
    summary: 'A footnote definition is never referenced.',
  },
  MU2023: {
    name: 'unsafe-url',
    severity: 'warning',
    summary: 'A link or image URL uses a scheme that renderers refuse to output.',
  },
  MU2024: {
    name: 'duplicate-definition',
    severity: 'warning',
    summary:
      'A link reference or footnote label is defined more than once; the first definition wins.',
  },
  MU2025: {
    name: 'unresolved-anchor',
    severity: 'warning',
    summary: 'A `#fragment` link does not match any heading or id in the document.',
  },
  MU9001: {
    name: 'internal-error',
    severity: 'error',
    summary: 'The parser hit an internal error. Please report it.',
  },
} as const satisfies Record<string, CodeInfo>;

export type DiagnosticCode = keyof typeof DIAGNOSTIC_CODES;

export interface ReportOptions {
  severity?: Severity;
  related?: RelatedInformation[];
  fixes?: DiagnosticFix[];
}

/** Collects diagnostics during a parse or validation pass. */
export class DiagnosticBag {
  readonly items: Diagnostic[] = [];

  report(
    code: DiagnosticCode,
    range: Range,
    message: string,
    options: ReportOptions = {},
  ): Diagnostic {
    const diagnostic: Diagnostic = {
      code,
      severity: options.severity ?? DIAGNOSTIC_CODES[code].severity,
      message,
      range,
      source: 'markup',
    };
    if (options.related?.length) diagnostic.related = options.related;
    if (options.fixes?.length) diagnostic.fixes = options.fixes;
    this.items.push(diagnostic);
    return diagnostic;
  }
}

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2, hint: 3 };

/** Sorts by position, then by severity. Stable for equal keys. */
export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort(
    (a, b) =>
      a.range.start.offset - b.range.start.offset ||
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.code.localeCompare(b.code),
  );
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}
