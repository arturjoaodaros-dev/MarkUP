import { build } from 'esbuild';

await build({
  entryPoints: ['src/bin.ts'],
  outfile: 'dist/markup.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  conditions: ['source'],
  banner: { js: '#!/usr/bin/env node' },
  sourcemap: true,
  logLevel: 'warning',
});
