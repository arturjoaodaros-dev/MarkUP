/**
 * End-to-end test over stdio: a real server process speaking LSP.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from 'vscode-jsonrpc/node';

const bin = join(dirname(fileURLToPath(import.meta.url)), '../src/bin.ts');
let child: ChildProcess;
let connection: MessageConnection;
let workspace: string;
const diagnostics = new Map<
  string,
  { code: string; message: string; range: { start: { line: number; character: number } } }[]
>();
const waiters: (() => void)[] = [];

beforeAll(async () => {
  workspace = mkdtempSync(join(tmpdir(), 'markup-lsp-'));
  writeFileSync(
    join(workspace, 'shout.mjs'),
    `export default { name: 'shout', directives: [{ name: 'shout', forms: ['inline'], description: 'Shout.' }] };`,
  );
  writeFileSync(
    join(workspace, 'markup.config.json'),
    JSON.stringify({ plugins: ['./shout.mjs'] }),
  );
  child = spawn(process.execPath, ['--conditions=source', bin, '--stdio'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  connection = createMessageConnection(
    new StreamMessageReader(child.stdout!),
    new StreamMessageWriter(child.stdin!),
  );
  connection.onNotification(
    'textDocument/publishDiagnostics',
    (params: { uri: string; diagnostics: never[] }) => {
      diagnostics.set(params.uri, params.diagnostics);
      waiters.splice(0).forEach((w) => w());
    },
  );
  connection.listen();
  const result = await connection.sendRequest<{ capabilities: Record<string, unknown> }>(
    'initialize',
    {
      processId: process.pid,
      rootUri: pathToFileURL(workspace).href,
      workspaceFolders: [{ uri: pathToFileURL(workspace).href, name: 'ws' }],
      capabilities: {},
      initializationOptions: { loadPlugins: true },
    },
  );
  expect(result.capabilities).toHaveProperty('completionProvider');
  expect(result.capabilities).toHaveProperty('semanticTokensProvider');
  await connection.sendNotification('initialized', {});
}, 30_000);

afterAll(async () => {
  await connection.sendRequest('shutdown').catch(() => {});
  await connection.sendNotification('exit').catch(() => {});
  connection.dispose();
  child.kill();
  rmSync(workspace, { recursive: true, force: true });
});

const uri = 'file:///doc.markup';

async function open(text: string, version = 1): Promise<void> {
  const received = new Promise<void>((resolve) => waiters.push(resolve));
  await connection.sendNotification('textDocument/didOpen', {
    textDocument: { uri, languageId: 'markup', version, text },
  });
  await received;
}

describe('language server', () => {
  it('publishes diagnostics on open and on change', async () => {
    await open('# Doc\n\n:::nott\ntext\n\n:shout[hi]');
    // The plugin from markup.config.json is loaded, so `:shout` is known.
    expect(diagnostics.get(uri)!.map((d) => d.code)).toEqual(['MU1001', 'MU2001']);
    const received = new Promise<void>((resolve) => waiters.push(resolve));
    await connection.sendNotification('textDocument/didChange', {
      textDocument: { uri, version: 2 },
      contentChanges: [
        {
          range: { start: { line: 2, character: 3 }, end: { line: 2, character: 7 } },
          text: 'note',
        },
      ],
    });
    await received;
    expect(diagnostics.get(uri)!.map((d) => d.code)).toEqual(['MU1001']);
  });

  it('completes components with snippet edits', async () => {
    await open('Text\n\n:::ca', 3);
    const items = await connection.sendRequest<
      {
        label: string;
        insertTextFormat: number;
        textEdit: { newText: string; range: { start: { character: number } } };
        filterText: string;
      }[]
    >('textDocument/completion', {
      textDocument: { uri },
      position: { line: 2, character: 5 },
    });
    const card = items.find((i) => i.label === 'card')!;
    expect(card.insertTextFormat).toBe(2);
    expect(card.textEdit.range.start.character).toBe(0);
    expect(card.filterText).toBe(':::card');
  });

  it('answers hover, symbols, folding, semantic tokens and definitions', async () => {
    await open('# Intro\n\n:::chart\ndata:\n  a: 1\n:::\n\n[up](#intro)', 4);
    const hover = await connection.sendRequest<{ contents: { value: string } }>(
      'textDocument/hover',
      { textDocument: { uri }, position: { line: 2, character: 4 } },
    );
    expect(hover.contents.value).toContain('**chart**');
    const symbols = await connection.sendRequest<{ name: string; children: { name: string }[] }[]>(
      'textDocument/documentSymbol',
      { textDocument: { uri } },
    );
    expect(symbols[0]!.name).toBe('Intro');
    expect(symbols[0]!.children[0]!.name).toBe('chart');
    const folds = await connection.sendRequest<{ startLine: number; endLine: number }[]>(
      'textDocument/foldingRange',
      { textDocument: { uri } },
    );
    expect(folds).toContainEqual(expect.objectContaining({ startLine: 2, endLine: 5 }));
    const tokens = await connection.sendRequest<{ data: number[] }>(
      'textDocument/semanticTokens/full',
      { textDocument: { uri } },
    );
    expect(tokens.data.length % 5).toBe(0);
    expect(tokens.data.length).toBeGreaterThan(0);
    const definition = await connection.sendRequest<{ range: { start: { line: number } } }>(
      'textDocument/definition',
      { textDocument: { uri }, position: { line: 7, character: 2 } },
    );
    expect(definition.range.start.line).toBe(0);
  });

  it('offers quick fixes', async () => {
    await open(':::nott\nx\n:::', 5);
    const actions = await connection.sendRequest<
      { title: string; edit: { changes: Record<string, { newText: string }[]> } }[]
    >('textDocument/codeAction', {
      textDocument: { uri },
      range: { start: { line: 0, character: 3 }, end: { line: 0, character: 7 } },
      context: { diagnostics: [] },
    });
    expect(actions[0]!.title).toBe('Change to `note`');
    expect(actions[0]!.edit.changes[uri]![0]!.newText).toBe('note');
  });
});
