// Ponto de entrada da suíte de fumaça: baixa/abre uma instância real do VS
// Code e roda test/suite/index.js dentro dela. JS puro de propósito — este
// arquivo roda fora de qualquer bundle, então evitar TypeScript aqui evita
// precisar de um passo de compilação só para os testes de integração.
//
// Cobertura mínima por design: a maior parte da lógica já é testada sem o
// `vscode` real (ver src/__tests__, rodado via `npm run test`). Isto aqui
// só confirma que a extensão ativa, reconhece a linguagem e produz
// diagnósticos dentro de uma instância real do editor. Requer acesso à
// rede na primeira execução, para baixar o binário do VS Code.

const path = require('node:path');
const { runTests } = require('@vscode/test-electron');

async function main() {
  const extensionDevelopmentPath = path.join(__dirname, '..');
  const extensionTestsPath = path.join(__dirname, 'suite', 'index.js');

  await runTests({ extensionDevelopmentPath, extensionTestsPath });
}

main().catch((err) => {
  console.error('Falha ao rodar a suíte de fumaça:', err);
  process.exit(1);
});
