import { defineWorkspace } from 'vitest/config';

export default defineWorkspace(['packages/core', 'packages/renderer', 'packages/web']);
// packages/vscode entra aqui quando ganhar seu próprio vitest.config.ts.
