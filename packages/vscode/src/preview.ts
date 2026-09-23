import * as vscode from 'vscode';
import { parse, type MarkupPlugin } from '@markup-lang/core';
import { MARKUP_CSS, renderHtml } from '@markup-lang/html';

type FromWebview =
  | { type: 'ready' }
  | { type: 'revealLine'; line: number }
  | { type: 'openLine'; line: number }
  | { type: 'openLink'; href: string };

const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i;

class Preview {
  readonly panel: vscode.WebviewPanel;
  uri: vscode.Uri;
  private timer: NodeJS.Timeout | undefined;
  /** Ignore editor scroll events caused by the preview (and vice versa). */
  private syncingUntil = 0;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly context: vscode.ExtensionContext;
  private readonly plugins: () => readonly MarkupPlugin[];

  constructor(
    context: vscode.ExtensionContext,
    uri: vscode.Uri,
    column: vscode.ViewColumn,
    plugins: () => readonly MarkupPlugin[],
    title: string | undefined,
    onDispose: () => void,
  ) {
    this.context = context;
    this.plugins = plugins;
    this.uri = uri;
    const roots = [
      vscode.Uri.joinPath(context.extensionUri, 'dist'),
      ...(vscode.workspace.workspaceFolders?.map((f) => f.uri) ?? []),
    ];
    if (uri.scheme === 'file') roots.push(vscode.Uri.joinPath(uri, '..'));
    this.panel = vscode.window.createWebviewPanel(
      'markup.preview',
      title ?? this.title(),
      { viewColumn: column, preserveFocus: true },
      {
        enableScripts: true,
        enableFindWidget: true,
        retainContextWhenHidden: false,
        localResourceRoots: roots,
      },
    );
    this.panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'file-icon.svg');
    this.panel.webview.html = this.shell();
    this.panel.onDidDispose(
      () => {
        this.disposables.forEach((d) => d.dispose());
        onDispose();
      },
      null,
      this.disposables,
    );
    this.panel.webview.onDidReceiveMessage(
      (message: FromWebview) => this.onMessage(message),
      null,
      this.disposables,
    );
    vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document.uri.toString() === this.uri.toString()) this.schedule();
      },
      null,
      this.disposables,
    );
    vscode.window.onDidChangeTextEditorVisibleRanges(
      (e) => this.onEditorScroll(e),
      null,
      this.disposables,
    );
    vscode.window.onDidChangeActiveColorTheme(() => this.postTheme(), null, this.disposables);
    vscode.workspace.onDidChangeConfiguration(
      (e) => {
        if (e.affectsConfiguration('markup.preview')) this.postTheme();
      },
      null,
      this.disposables,
    );
  }

  private title(): string {
    return `Preview ${this.uri.path.split('/').pop()}`;
  }

  private nonce(): string {
    return Array.from(
      { length: 32 },
      () =>
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[
          Math.floor(Math.random() * 62)
        ],
    ).join('');
  }

  private shell(): string {
    const webview = this.panel.webview;
    const nonce = this.nonce();
    const script = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'preview.js'),
    );
    // Inline style attributes (table alignment, progress width) are allowed; scripts only with the nonce.
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} https: data:`,
      `media-src ${webview.cspSource} https:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');
    return `<!doctype html>
<html lang="en" data-theme="${this.theme()}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
html, body { margin: 0; padding: 0; background: var(--mu-page); }
html[data-theme="dark"] { --mu-page: #16181d; }
html[data-theme="light"] { --mu-page: #ffffff; }
.markup-body { min-height: 100vh; box-sizing: border-box; }
.mu-highlight-line { outline: 2px solid color-mix(in srgb, var(--mu-accent) 40%, transparent); outline-offset: 4px; border-radius: 4px; transition: outline-color 1s; }
${MARKUP_CSS}
</style>
</head>
<body>
<main class="markup-body" data-theme="${this.theme()}"></main>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }

  private theme(): 'light' | 'dark' {
    const setting = vscode.workspace
      .getConfiguration('markup')
      .get<string>('preview.theme', 'auto');
    if (setting === 'light' || setting === 'dark') return setting;
    const kind = vscode.window.activeColorTheme.kind;
    return kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight
      ? 'light'
      : 'dark';
  }

  private postTheme(): void {
    void this.panel.webview.postMessage({ type: 'theme', theme: this.theme() });
  }

  schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.update(), 120);
  }

  async update(): Promise<void> {
    const document = await vscode.workspace.openTextDocument(this.uri);
    const plugins = this.plugins();
    const { document: tree } = parse(document.getText(), { plugins });
    const base = this.uri.scheme === 'untitled' ? undefined : vscode.Uri.joinPath(this.uri, '..');
    const html = renderHtml(tree, {
      plugins,
      sourcePositions: true,
      rewriteUrl: (url, kind) => {
        // Relative images load from the document's folder through the webview.
        if (
          kind !== 'image' ||
          !base ||
          ABSOLUTE.test(url) ||
          url.startsWith('#') ||
          url.startsWith('//')
        )
          return url;
        return this.panel.webview
          .asWebviewUri(vscode.Uri.joinPath(base, url.split(/[?#]/)[0]!))
          .toString();
      },
    });
    const editor = vscode.window.visibleTextEditors.find(
      (e) => e.document.uri.toString() === this.uri.toString(),
    );
    await this.panel.webview.postMessage({
      type: 'update',
      html,
      theme: this.theme(),
      line: editor ? editor.visibleRanges[0]?.start.line : undefined,
    });
  }

  private onEditorScroll(e: vscode.TextEditorVisibleRangesChangeEvent): void {
    if (e.textEditor.document.uri.toString() !== this.uri.toString()) return;
    if (!vscode.workspace.getConfiguration('markup').get<boolean>('preview.scrollSync', true))
      return;
    if (Date.now() < this.syncingUntil) return;
    const range = e.visibleRanges[0];
    if (!range) return;
    // Fractional line: how far into the first visible line we are is unknown, so use the line itself.
    void this.panel.webview.postMessage({ type: 'scrollTo', line: range.start.line + 1 });
  }

  private async onMessage(message: FromWebview): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.update();
        return;
      case 'revealLine': {
        if (!vscode.workspace.getConfiguration('markup').get<boolean>('preview.scrollSync', true))
          return;
        const editor = vscode.window.visibleTextEditors.find(
          (e) => e.document.uri.toString() === this.uri.toString(),
        );
        if (!editor) return;
        this.syncingUntil = Date.now() + 150;
        const line = Math.max(0, Math.floor(message.line) - 1);
        editor.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.AtTop);
        return;
      }
      case 'openLine': {
        if (
          !vscode.workspace
            .getConfiguration('markup')
            .get<boolean>('preview.doubleClickToEdit', true)
        )
          return;
        const line = Math.max(0, message.line - 1);
        const editor = await vscode.window.showTextDocument(this.uri, {
          viewColumn:
            vscode.window.visibleTextEditors.find(
              (e) => e.document.uri.toString() === this.uri.toString(),
            )?.viewColumn ?? vscode.ViewColumn.One,
          selection: new vscode.Range(line, 0, line, 0),
        });
        editor.revealRange(
          new vscode.Range(line, 0, line, 0),
          vscode.TextEditorRevealType.InCenterIfOutsideViewport,
        );
        return;
      }
      case 'openLink': {
        const href = message.href;
        if (/^(https?|mailto):/i.test(href)) {
          await vscode.env.openExternal(vscode.Uri.parse(href));
          return;
        }
        if (ABSOLUTE.test(href) || this.uri.scheme === 'untitled') return;
        const [path] = href.split('#');
        if (!path) return;
        const target = vscode.Uri.joinPath(this.uri, '..', decodeURIComponent(path));
        try {
          await vscode.workspace.fs.stat(target);
          await vscode.window.showTextDocument(target, { viewColumn: vscode.ViewColumn.One });
        } catch {
          void vscode.window.showWarningMessage(
            `File not found: ${vscode.workspace.asRelativePath(target)}`,
          );
        }
        return;
      }
    }
  }

  dispose(): void {
    this.panel.dispose();
  }
}

export class PreviewManager implements vscode.Disposable {
  private readonly previews = new Map<string, Preview>();
  private readonly context: vscode.ExtensionContext;
  private readonly plugins: () => readonly MarkupPlugin[];

  constructor(context: vscode.ExtensionContext, plugins: () => readonly MarkupPlugin[]) {
    this.context = context;
    this.plugins = plugins;
  }

  async show(
    uri: vscode.Uri,
    column: vscode.ViewColumn,
    options: { title?: string } = {},
  ): Promise<void> {
    const key = uri.toString();
    const existing = this.previews.get(key);
    if (existing) {
      existing.panel.reveal(column, true);
      return;
    }
    const preview = new Preview(this.context, uri, column, this.plugins, options.title, () =>
      this.previews.delete(key),
    );
    this.previews.set(key, preview);
  }

  refreshAll(): void {
    for (const preview of this.previews.values()) preview.schedule();
  }

  dispose(): void {
    for (const preview of this.previews.values()) preview.dispose();
    this.previews.clear();
  }
}
