const assert = require('node:assert');
const path = require('node:path');
const vscode = require('vscode');

suite('MarkUP — suíte de fumaça', () => {
  test('a extensão ativa e reconhece a linguagem markup', async () => {
    const ext = vscode.extensions.getExtension('markup-lang.markup-lang');
    assert.ok(ext, 'extensão não encontrada');
    await ext.activate();
    assert.strictEqual(ext.isActive, true);
  });

  test('abrir um .markup com diretiva inválida produz diagnósticos', async () => {
    const fixture = path.join(__dirname, '..', 'fixtures', 'example.markup');
    const doc = await vscode.workspace.openTextDocument(fixture);
    await vscode.window.showTextDocument(doc);

    // Dá tempo para o debounce de diagnóstico (120ms) rodar.
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const diagnostics = vscode.languages.getDiagnostics(doc.uri);
    assert.ok(diagnostics.length > 0, 'esperava ao menos um diagnóstico para o tipo de chart inválido');
    assert.ok(diagnostics.some((d) => d.message.includes('bar')), 'esperava aviso mencionando os tipos válidos');
  });

  test('o comando de preview não lança exceção', async () => {
    const fixture = path.join(__dirname, '..', 'fixtures', 'example.markup');
    const doc = await vscode.workspace.openTextDocument(fixture);
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand('markup.openPreview');
  });

  test('completion sugere nomes de diretiva após ":::"', async () => {
    const doc = await vscode.workspace.openTextDocument({ language: 'markup', content: ':::' });
    await vscode.window.showTextDocument(doc);
    const position = new vscode.Position(0, 3);
    const list = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', doc.uri, position);
    const labels = list.items.map((i) => (typeof i.label === 'string' ? i.label : i.label.label));
    assert.ok(labels.includes('chart'), `esperava "chart" entre as sugestões, recebeu: ${labels.join(', ')}`);
    assert.ok(labels.includes('alert'), `esperava "alert" entre as sugestões, recebeu: ${labels.join(', ')}`);
  });

  test('hover sobre ":::chart" mostra a descrição do schema', async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: 'markup',
      content: ':::chart type="bar"\nQ1: 1\n:::',
    });
    await vscode.window.showTextDocument(doc);
    await new Promise((resolve) => setTimeout(resolve, 500)); // aguarda o parse popular a AST em cache
    const position = new vscode.Position(0, 5);
    const hovers = await vscode.commands.executeCommand('vscode.executeHoverProvider', doc.uri, position);
    assert.ok(hovers.length > 0, 'esperava ao menos um hover');
    const text = hovers[0].contents.map((c) => (typeof c === 'string' ? c : c.value)).join('\n');
    assert.ok(text.toLowerCase().includes('gráfico'), `esperava a descrição do chart no hover, recebeu: ${text}`);
  });
});
