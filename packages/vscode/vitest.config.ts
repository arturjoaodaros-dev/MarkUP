import { defineConfig } from 'vitest/config';

// Só os módulos puros (sem import de `vscode`) são exercitados aqui — ver
// o comentário em src/diagnostics/rangeMath.ts. Cobertura de integração
// real (com a API do vscode) fica para a suíte de fumaça em test/, rodada
// via @vscode/test-electron.
export default defineConfig({
  test: {
    name: '@markup/vscode',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
