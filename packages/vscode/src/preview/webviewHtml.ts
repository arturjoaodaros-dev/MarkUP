import * as vscode from 'vscode';

/**
 * HTML-shell do webview. `panel.webview.html` é setado UMA VEZ, na criação
 * do painel — nunca mais. Atualizações de conteúdo acontecem inteiramente
 * via `postMessage`, para que o webview nunca recarregue.
 */
export function buildWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'document.css'));
  const nonce = getNonce();

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="stylesheet" href="${styleUri}" />
<title>MarkUP Preview</title>
</head>
<body>
<div id="root" class="mu-preview"></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}
