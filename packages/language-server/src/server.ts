/**
 * MarkUP language server. A thin LSP adapter over @markup-lang/language-service:
 * every feature comes from the shared service, positions are converted here.
 */
import { fileURLToPath } from 'node:url';
import type { Diagnostic as MarkupDiagnostic, LineIndex, MarkupPlugin, Range as MarkupRange } from '@markup-lang/core';
import { CONFIG_FILE, loadConfig } from '@markup-lang/core/node';
import {
  encodeSemanticTokens,
  getCodeActions,
  getCompletions,
  getDefinition,
  getDocumentLinks,
  getFoldingRanges,
  getHover,
  getReferences,
  getSemanticTokens,
  getSymbols,
  LanguageService,
  SEMANTIC_TOKEN_MODIFIERS,
  SEMANTIC_TOKEN_TYPES,
  type Analysis,
  type CompletionKind,
  type DocumentSymbol as MarkupSymbol,
} from '@markup-lang/language-service';
import {
  CodeActionKind,
  CompletionItemKind,
  DiagnosticSeverity,
  DiagnosticTag,
  DocumentSymbol,
  FoldingRangeKind,
  InsertTextFormat,
  MarkupKind,
  SymbolKind,
  TextDocumentSyncKind,
  TextDocuments,
  type CodeAction,
  type CompletionItem,
  type Connection,
  type Diagnostic,
  type InitializeResult,
  type Position,
  type Range,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

export interface ServerOptions {
  /** Import plugins from `markup.config.json` in workspace folders (trusted workspaces only). */
  loadPlugins?: boolean;
}

const COMPLETION_KINDS: Record<CompletionKind, CompletionItemKind> = {
  component: CompletionItemKind.Class,
  attribute: CompletionItemKind.Property,
  value: CompletionItemKind.EnumMember,
  key: CompletionItemKind.Field,
  anchor: CompletionItemKind.Reference,
  language: CompletionItemKind.Text,
  footnote: CompletionItemKind.Reference,
  snippet: CompletionItemKind.Snippet,
};

export function startServer(connection: Connection): void {
  const documents = new TextDocuments(TextDocument);
  let service = new LanguageService();
  const timers = new Map<string, NodeJS.Timeout>();

  const analyze = (document: TextDocument): Analysis => service.analyze(document.getText(), document.uri);

  const toPosition = (index: LineIndex, offset: number): Position => {
    const p = index.pointAt(offset);
    return { line: p.line - 1, character: p.column - 1 };
  };
  const toRange = (index: LineIndex, from: number, to: number): Range => ({ start: toPosition(index, from), end: toPosition(index, to) });
  const fromRange = (r: MarkupRange): Range => ({
    start: { line: r.start.line - 1, character: r.start.column - 1 },
    end: { line: r.end.line - 1, character: r.end.column - 1 },
  });

  const toDiagnostic = (d: MarkupDiagnostic, uri: string): Diagnostic => ({
    range: fromRange(d.range),
    severity:
      d.severity === 'error' ? DiagnosticSeverity.Error : d.severity === 'warning' ? DiagnosticSeverity.Warning : d.severity === 'info' ? DiagnosticSeverity.Information : DiagnosticSeverity.Hint,
    code: d.code,
    source: 'markup',
    message: d.message,
    tags: d.code === 'MU2022' ? [DiagnosticTag.Unnecessary] : undefined,
    relatedInformation: d.related?.map((r) => ({ location: { uri, range: fromRange(r.range) }, message: r.message })),
  });

  const validate = (document: TextDocument) => {
    const analysis = analyze(document);
    void connection.sendDiagnostics({ uri: document.uri, version: document.version, diagnostics: analysis.diagnostics.map((d) => toDiagnostic(d, document.uri)) });
  };

  const schedule = (document: TextDocument) => {
    clearTimeout(timers.get(document.uri));
    // Larger documents wait a little longer so typing stays smooth.
    const delay = Math.min(400, 80 + document.getText().length / 5000);
    timers.set(document.uri, setTimeout(() => validate(document), delay));
  };

  connection.onInitialize(async (params): Promise<InitializeResult> => {
    const options = (params.initializationOptions ?? {}) as ServerOptions;
    if (options.loadPlugins) {
      const plugins: MarkupPlugin[] = [];
      for (const folder of params.workspaceFolders ?? []) {
        try {
          const root = fileURLToPath(folder.uri);
          plugins.push(...(await loadConfig(root)).plugins);
        } catch (error) {
          connection.console.error(`MarkUP: could not load ${CONFIG_FILE}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      service = new LanguageService({ plugins });
    }
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        completionProvider: { triggerCharacters: [':', '{', ' ', '=', '#', '^', '`', '-'], resolveProvider: false },
        hoverProvider: true,
        documentSymbolProvider: true,
        foldingRangeProvider: true,
        definitionProvider: true,
        referencesProvider: true,
        documentLinkProvider: { resolveProvider: false },
        codeActionProvider: { codeActionKinds: [CodeActionKind.QuickFix] },
        semanticTokensProvider: {
          legend: { tokenTypes: [...SEMANTIC_TOKEN_TYPES], tokenModifiers: [...SEMANTIC_TOKEN_MODIFIERS] },
          full: true,
        },
      },
      serverInfo: { name: 'markup-language-server', version: '0.1.0' },
    };
  });

  documents.onDidOpen((e) => validate(e.document));
  documents.onDidChangeContent((e) => schedule(e.document));
  documents.onDidClose((e) => {
    clearTimeout(timers.get(e.document.uri));
    service.forget(e.document.uri);
    void connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
  });

  connection.onCompletion((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    const analysis = analyze(document);
    const result = getCompletions(analysis, document.offsetAt(params.position));
    if (!result) return null;
    const range = toRange(analysis.lineIndex, result.from, result.to);
    // The replaced range may start with colons (`:::no`); filter against the same shape.
    const prefix = /^[^A-Za-z0-9_]*/.exec(document.getText(range))![0];
    return result.items.map(
      (item): CompletionItem => ({
        label: item.label,
        kind: COMPLETION_KINDS[item.kind],
        detail: item.detail,
        documentation: item.documentation ? { kind: MarkupKind.Markdown, value: item.documentation } : undefined,
        insertTextFormat: item.snippet ? InsertTextFormat.Snippet : InsertTextFormat.PlainText,
        textEdit: { range, newText: item.insertText },
        filterText: prefix + item.label,
        sortText: item.sortText,
      }),
    );
  });

  connection.onHover((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    const analysis = analyze(document);
    const hover = getHover(analysis, document.offsetAt(params.position));
    return hover ? { contents: { kind: MarkupKind.Markdown, value: hover.contents }, range: toRange(analysis.lineIndex, hover.from, hover.to) } : null;
  });

  connection.onDocumentSymbol((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    const analysis = analyze(document);
    const convert = (s: MarkupSymbol): DocumentSymbol =>
      DocumentSymbol.create(
        s.name,
        s.detail,
        s.kind === 'heading' ? SymbolKind.String : s.kind === 'frontMatter' ? SymbolKind.Namespace : SymbolKind.Class,
        toRange(analysis.lineIndex, s.from, s.to),
        toRange(analysis.lineIndex, s.selectionFrom, s.selectionTo),
        s.children.map(convert),
      );
    return getSymbols(analysis).map(convert);
  });

  connection.onFoldingRanges((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    return getFoldingRanges(analyze(document)).map((r) => ({
      startLine: r.startLine - 1,
      endLine: r.endLine - 1,
      kind: r.kind === 'comment' ? FoldingRangeKind.Comment : r.kind === 'imports' ? FoldingRangeKind.Imports : FoldingRangeKind.Region,
    }));
  });

  connection.onDefinition((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    const analysis = analyze(document);
    const location = getDefinition(analysis, document.offsetAt(params.position));
    return location ? { uri: document.uri, range: toRange(analysis.lineIndex, location.from, location.to) } : null;
  });

  connection.onReferences((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    const analysis = analyze(document);
    return getReferences(analysis, document.offsetAt(params.position)).map((l) => ({ uri: document.uri, range: toRange(analysis.lineIndex, l.from, l.to) }));
  });

  connection.onDocumentLinks((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    const analysis = analyze(document);
    return getDocumentLinks(analysis).flatMap((link) => {
      let target: string;
      try {
        target = new URL(link.target, document.uri).href;
      } catch {
        return [];
      }
      return [{ range: toRange(analysis.lineIndex, link.from, link.to), target }];
    });
  });

  connection.onCodeAction((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    const analysis = analyze(document);
    const from = document.offsetAt(params.range.start);
    const to = document.offsetAt(params.range.end);
    return getCodeActions(analysis, from, to).map(
      (action): CodeAction => ({
        title: action.title,
        kind: CodeActionKind.QuickFix,
        isPreferred: action.preferred,
        diagnostics: [toDiagnostic(action.diagnostic, document.uri)],
        edit: { changes: { [document.uri]: action.edits.map((e) => ({ range: fromRange(e.range), newText: e.newText })) } },
      }),
    );
  });

  connection.languages.semanticTokens.on((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return { data: [] };
    return { data: encodeSemanticTokens(getSemanticTokens(analyze(document))) };
  });

  documents.listen(connection);
  connection.listen();
}
