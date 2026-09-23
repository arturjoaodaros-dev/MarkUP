import * as vscode from 'vscode';
import { LanguageClient, TransportKind, type LanguageClientOptions, type ServerOptions } from 'vscode-languageclient/node';
import { createRegistry, type MarkupPlugin } from '@markup-lang/core';
import { loadConfig } from '@markup-lang/core/node';
import { renderDocument } from '@markup-lang/html';
import { componentReference, snippetFor } from '@markup-lang/language-service';
import { parse } from '@markup-lang/core';
import { PreviewManager } from './preview.ts';

let client: LanguageClient | undefined;
let plugins: MarkupPlugin[] = [];

function pluginsEnabled(): boolean {
  return vscode.workspace.isTrusted && vscode.workspace.getConfiguration('markup').get<boolean>('plugins.enable', true);
}

async function loadWorkspacePlugins(output: vscode.OutputChannel): Promise<MarkupPlugin[]> {
  if (!pluginsEnabled()) return [];
  const loaded: MarkupPlugin[] = [];
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    if (folder.uri.scheme !== 'file') continue;
    try {
      loaded.push(...(await loadConfig(folder.uri.fsPath)).plugins);
    } catch (error) {
      output.appendLine(`Could not load plugins in ${folder.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return loaded;
}

async function startClient(context: vscode.ExtensionContext): Promise<void> {
  const module = context.asAbsolutePath('dist/server.cjs');
  const serverOptions: ServerOptions = {
    run: { module, transport: TransportKind.ipc },
    debug: { module, transport: TransportKind.ipc, options: { execArgv: ['--nolazy', '--inspect=6019'] } },
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: 'markup' }],
    initializationOptions: { loadPlugins: pluginsEnabled() },
    synchronize: { fileEvents: vscode.workspace.createFileSystemWatcher('**/markup.config.json') },
  };
  client = new LanguageClient('markup', 'MarkUP Language Server', serverOptions, clientOptions);
  await client.start();
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('MarkUP');
  plugins = await loadWorkspacePlugins(output);
  const previews = new PreviewManager(context, () => plugins);
  context.subscriptions.push(output, previews);

  const activeMarkupEditor = (): vscode.TextEditor | undefined => {
    const editor = vscode.window.activeTextEditor;
    return editor?.document.languageId === 'markup' ? editor : undefined;
  };
  const targetUri = (uri?: vscode.Uri): vscode.Uri | undefined => (uri instanceof vscode.Uri ? uri : activeMarkupEditor()?.document.uri);

  context.subscriptions.push(
    vscode.commands.registerCommand('markup.showPreview', (uri?: vscode.Uri) => {
      const target = targetUri(uri);
      if (target) void previews.show(target, vscode.ViewColumn.Active);
    }),
    vscode.commands.registerCommand('markup.showPreviewToSide', (uri?: vscode.Uri) => {
      const target = targetUri(uri);
      if (target) void previews.show(target, vscode.ViewColumn.Beside);
    }),
    vscode.commands.registerCommand('markup.exportHtml', async (uri?: vscode.Uri) => {
      const target = targetUri(uri);
      if (!target) return;
      const document = await vscode.workspace.openTextDocument(target);
      const destination = await vscode.window.showSaveDialog({
        defaultUri: target.with({ path: target.path.replace(/\.(markup|mkup)$/i, '') + '.html' }),
        filters: { HTML: ['html'] },
      });
      if (!destination) return;
      const { document: tree, diagnostics } = parse(document.getText(), { plugins });
      const html = renderDocument(tree, { plugins, rewriteUrl: (url) => (/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : url.replace(/\.(?:markup|mkup)(?=[?#]|$)/i, '.html')) });
      await vscode.workspace.fs.writeFile(destination, new TextEncoder().encode(html));
      const errors = diagnostics.filter((d) => d.severity === 'error').length;
      const choice = await vscode.window.showInformationMessage(
        `Exported ${vscode.workspace.asRelativePath(destination)}${errors ? ` (${errors} error${errors === 1 ? '' : 's'} in the document)` : ''}.`,
        'Open in Browser',
      );
      if (choice) await vscode.env.openExternal(destination);
    }),
    vscode.commands.registerCommand('markup.insertComponent', async () => {
      const editor = activeMarkupEditor();
      if (!editor) return;
      const registry = createRegistry(plugins);
      const pick = await vscode.window.showQuickPick(
        registry.list().map((spec) => ({ label: spec.name, description: spec.forms.map((f) => (f === 'container' ? ':::' : f === 'leaf' ? '::' : ':')).join(' '), detail: spec.description, spec })),
        { placeHolder: 'Insert a MarkUP component', matchOnDetail: true },
      );
      if (!pick) return;
      const form = pick.spec.forms[0]!;
      const line = editor.document.lineAt(editor.selection.active.line);
      const indent = /^\s*/.exec(line.text)![0];
      const colons = form === 'container' ? ':::' : form === 'leaf' ? '::' : ':';
      let snippet = snippetFor(pick.spec, form, colons, indent);
      // Block components go on their own line.
      if (form !== 'inline' && editor.selection.active.character > indent.length) snippet = `\n${indent}${snippet}`;
      await editor.insertSnippet(new vscode.SnippetString(snippet));
    }),
    vscode.commands.registerCommand('markup.showComponentReference', async () => {
      const source = componentReference(createRegistry(plugins), { live: true, title: 'MarkUP components' });
      const document = await vscode.workspace.openTextDocument({ language: 'markup', content: source });
      await previews.show(document.uri, vscode.ViewColumn.Active, { title: 'MarkUP Components' });
    }),
    vscode.commands.registerCommand('markup.restartServer', async () => {
      plugins = await loadWorkspacePlugins(output);
      await client?.stop();
      await startClient(context);
      previews.refreshAll();
    }),
    vscode.workspace.onDidGrantWorkspaceTrust(() => vscode.commands.executeCommand('markup.restartServer')),
  );

  await startClient(context);
}

export async function deactivate(): Promise<void> {
  await client?.stop();
}
