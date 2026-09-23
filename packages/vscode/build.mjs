/**
 * Builds the extension: the client, the bundled language server, the preview
 * script, and the grammar (component snippets are served by the language server).
 */
import { writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { grammar } from './syntaxes/grammar.mjs';

const common = { bundle: true, conditions: ['source'], sourcemap: true, logLevel: 'warning', minify: process.argv.includes('--minify') };

await Promise.all([
  build({ ...common, entryPoints: ['src/extension.ts'], outfile: 'dist/extension.cjs', platform: 'node', format: 'cjs', target: 'node20', external: ['vscode'] }),
  build({
    ...common,
    entryPoints: ['../language-server/src/bin.ts'],
    outfile: 'dist/server.cjs',
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    supported: { 'dynamic-import': true },
  }),
  build({ ...common, entryPoints: ['src/webview/preview.ts'], outfile: 'dist/preview.js', platform: 'browser', format: 'iife', target: 'es2022' }),
]);

writeFileSync('syntaxes/markup.tmLanguage.json', `${JSON.stringify(grammar, null, 2)}\n`);
