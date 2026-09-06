// Build da extensão: dois alvos esbuild (host da extensão em Node, webview
// em navegador) mais uma cópia de assets estáticos. Cada um resolve
// `@markup/core`/`@markup/renderer` direto do workspace — nada de passo de
// build separado para eles, ver README.
import { build, context } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

function copyAssets() {
  mkdirSync(join(here, 'media'), { recursive: true });
  cpSync(join(here, '..', 'renderer', 'src', 'styles', 'document.css'), join(here, 'media', 'document.css'));
  cpSync(
    join(here, '..', '..', 'node_modules', 'katex', 'dist', 'katex.min.css'),
    join(here, 'media', 'katex.min.css'),
  );
  cpSync(join(here, '..', '..', 'node_modules', 'katex', 'dist', 'fonts'), join(here, 'media', 'fonts'), {
    recursive: true,
  });
}

// `@markup/renderer/src/lazyLibs.ts` importa `katex/dist/katex.min.css` de
// forma dinâmica só para que o Vite injete a folha de estilo no app web — o
// valor do módulo nunca é usado ali. No esbuild, tratamos qualquer import
// de `.css` como texto simples (em vez de deixar o esbuild processá-lo como
// CSS de verdade, o que exigiria loaders para as fontes referenciadas via
// `url()`). A extensão já fornece o CSS do KaTeX separadamente, via
// `media/katex.min.css` referenciado por `<link>` no HTML do webview.
const cssAsTextLoader = { '.css': 'text' };

const extensionConfig = {
  entryPoints: [join(here, 'src', 'extension.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  loader: cssAsTextLoader,
  outfile: join(here, 'dist', 'extension.js'),
  sourcemap: !production,
  minify: production,
};

const webviewConfig = {
  entryPoints: [join(here, 'src', 'webview', 'index.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  loader: cssAsTextLoader,
  outfile: join(here, 'dist', 'webview.js'),
  sourcemap: !production,
  minify: production,
};

async function run() {
  copyAssets();
  if (watch) {
    const [extCtx, webCtx] = await Promise.all([context(extensionConfig), context(webviewConfig)]);
    await Promise.all([extCtx.watch(), webCtx.watch()]);
    console.log('esbuild: watching...');
  } else {
    await Promise.all([build(extensionConfig), build(webviewConfig)]);
    console.log('esbuild: build complete.');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
