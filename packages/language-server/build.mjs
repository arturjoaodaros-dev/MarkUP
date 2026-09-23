import { build } from 'esbuild';

await build({
  entryPoints: ['src/bin.ts'],
  outfile: 'dist/server.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  conditions: ['source'],
  banner: { js: '#!/usr/bin/env node' },
  sourcemap: true,
  supported: { 'dynamic-import': true },
  logLevel: 'warning',
});
