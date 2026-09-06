// Build do site: nenhum framework de site estático, nenhuma dependência
// nova além do esbuild que a extensão do VS Code já usa. Duas passadas de
// esbuild (a mesma ideia de dois alvos do packages/vscode/esbuild.mjs):
//
//   1. `src/renderPages.tsx` — roda em Node, importa @markup/core e
//      @markup/renderer direto do workspace, devolve HTML já renderizado
//      para cada página.
//   2. `src/playground.tsx` — bundle de navegador para o "Experimente" da
//      home.
//
// O resultado é HTML/CSS/JS estático em `public/`, publicável em qualquer
// host estático (GitHub Pages incluso — ver .github/workflows/site.yml).

import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const repoRoot = join(root, '..', '..');
const publicDir = join(root, 'public');
const buildTmp = join(root, '.build');

const NAV = [
  { slug: 'index', label: 'Início' },
  { slug: 'guide', label: 'Guia' },
  { slug: 'spec', label: 'Especificação' },
  { slug: 'interpreter', label: 'Interpretador' },
];

// Páginas cujo conteúdo vem de Markdown de verdade — @markup/core faz o
// parse, @markup/renderer faz o HTML. Ver src/renderPages.tsx.
const MARKDOWN_PAGES = [
  {
    slug: 'index',
    title: 'MarkUP',
    description: 'Markdown foi desenhado para texto. MarkUP é desenhado para documentos.',
    path: join(root, 'content', 'home.md'),
    toc: false,
    usesPlayground: true,
    extraHtml: () => PLAYGROUND_SECTION,
  },
  {
    slug: 'guide',
    title: 'Guia completo — MarkUP',
    description: 'Todas as diretivas, o Markdown suportado, diagnósticos e como usar o MarkUP.',
    path: join(repoRoot, 'docs', 'GUIDE.md'),
    toc: true,
  },
  {
    slug: 'spec',
    title: 'Especificação — MarkUP',
    description: 'A referência normativa da linguagem, testada linha a linha.',
    path: join(repoRoot, 'docs', 'SPEC.md'),
    toc: true,
  },
];

// O Interpretador não tem um documento-fonte: é a página inteira dedicada
// ao playground (textarea grande + preview grande, sem sumário lateral).
const INTERPRETER_PAGE = {
  slug: 'interpreter',
  title: 'Interpretador — MarkUP',
  description: 'Escreva MarkUP e veja o resultado ao vivo. Sem autocomplete, sem sugestões — só o editor e a preview.',
  toc: false,
  wide: true,
  usesPlayground: true,
};

async function main() {
  rmSync(publicDir, { recursive: true, force: true });
  mkdirSync(join(publicDir, 'assets'), { recursive: true });

  await buildRenderer();
  await buildPlayground();

  const { renderAll } = require(join(buildTmp, 'renderPages.cjs'));
  const results = renderAll(
    MARKDOWN_PAGES.map(({ slug, title, description, path }) => ({ slug, title, description, path })),
  );

  const documentCss = readFileSync(join(repoRoot, 'packages', 'renderer', 'src', 'styles', 'document.css'), 'utf-8');
  writeFileSync(join(publicDir, 'assets', 'document.css'), documentCss);
  cpSync(join(root, 'styles', 'site.css'), join(publicDir, 'assets', 'site.css'));

  for (const page of MARKDOWN_PAGES) {
    const result = results.find((r) => r.slug === page.slug);
    const html = renderPageHtml(page, result);
    writeFileSync(join(publicDir, `${page.slug}.html`), html);
  }

  writeFileSync(
    join(publicDir, `${INTERPRETER_PAGE.slug}.html`),
    renderPageHtml(INTERPRETER_PAGE, { contentHtml: INTERPRETER_SECTION, headings: [] }),
  );

  rmSync(buildTmp, { recursive: true, force: true });
  console.log(`site: build complete → ${publicDir}`);
}

async function buildRenderer() {
  await build({
    entryPoints: [join(root, 'src', 'renderPages.tsx')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    loader: { '.css': 'text' },
    outfile: join(buildTmp, 'renderPages.cjs'),
  });
}

async function buildPlayground() {
  await build({
    entryPoints: [join(root, 'src', 'playground.tsx')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    minify: true,
    // @markup/renderer carrega CSS do KaTeX/highlight.js sob demanda só
    // para o efeito colateral de injetar a folha de estilo via bundlers
    // baseados em Vite; tratamos como texto simples aqui pelo mesmo motivo
    // do bundle do webview da extensão (ver packages/vscode/esbuild.mjs).
    loader: { '.css': 'text' },
    outfile: join(publicDir, 'assets', 'playground.js'),
  });
}

function renderPageHtml(page, result) {
  const toc = page.toc ? buildToc(result.headings) : '';
  const layoutClass = page.toc ? 'site-layout' : `site-layout no-toc${page.wide ? ' wide' : ''}`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(page.title)}</title>
<meta name="description" content="${escapeHtml(page.description)}" />
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}" />
<link rel="stylesheet" href="assets/document.css" />
<link rel="stylesheet" href="assets/site.css" />
<script>
(function () {
  var saved = localStorage.getItem('markup-site-theme');
  var theme = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.className = 'mu-theme-' + theme;
})();
</script>
</head>
<body>
<header class="site-header">
  <div class="site-header-inner">
    <a class="site-logo" href="index.html">MarkUP</a>
    <nav class="site-nav">
      ${NAV.map((n) => `<a href="${n.slug}.html"${n.slug === page.slug ? ' aria-current="page"' : ''}>${n.label}</a>`).join('\n      ')}
    </nav>
    <div class="site-header-actions">
      <a href="https://github.com/arturjoaodaros-dev/MarkUP" aria-label="GitHub">GitHub</a>
      <button class="theme-toggle" id="theme-toggle" aria-label="Alternar tema" type="button">◐</button>
    </div>
  </div>
</header>
<div class="${layoutClass}">
  ${toc}
  <main class="site-content">
    <div class="mu-document-root">
      ${result.contentHtml}
      ${page.extraHtml ? page.extraHtml() : ''}
    </div>
  </main>
</div>
<footer class="site-footer">
  <p>MarkUP é software livre. <a href="https://github.com/arturjoaodaros-dev/MarkUP">Código-fonte no GitHub</a>.</p>
</footer>
${page.usesPlayground ? '<script src="assets/playground.js"></script>' : ''}
<script>
(function () {
  var toggle = document.getElementById('theme-toggle');
  toggle.addEventListener('click', function () {
    var isDark = document.documentElement.className === 'mu-theme-dark';
    var next = isDark ? 'light' : 'dark';
    document.documentElement.className = 'mu-theme-' + next;
    localStorage.setItem('markup-site-theme', next);
  });
  document.querySelectorAll('.site-content .mu-heading[id]').forEach(function (h) {
    var a = document.createElement('a');
    a.href = '#' + h.id;
    a.className = 'anchor-link';
    a.textContent = '#';
    a.setAttribute('aria-label', 'Link para esta seção');
    h.appendChild(a);
  });
})();
</script>
</body>
</html>
`;
}

function buildToc(headings) {
  if (!headings || headings.length === 0) return '';
  const items = headings
    .map((h) => `<li data-depth="${h.depth}"><a href="#${h.slug}">${escapeHtml(h.text)}</a></li>`)
    .join('\n      ');
  return `<nav class="page-toc" aria-label="Nesta página">
    <h2>Nesta página</h2>
    <ul>
      ${items}
    </ul>
  </nav>`;
}

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const PLAYGROUND_SECTION = `<h2 class="mu-heading" id="experimente">Experimente</h2>
<p class="mu-paragraph">Edite o texto abaixo e veja o resultado ao vivo — o mesmo parser e o mesmo renderer do resto do MarkUP, rodando no seu navegador.</p>
<div id="playground-root"></div>`;

const INTERPRETER_SECTION = `<div class="mu-document">
<h1 class="mu-heading">Interpretador</h1>
<p class="mu-paragraph">Escreva MarkUP à esquerda, veja o resultado à direita. Sem autocomplete, sem sugestões — só o texto e o preview, salvo automaticamente neste navegador.</p>
</div>
<div id="interpreter-root" class="interpreter-root"></div>`;

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#2563eb"/><text x="12" y="17" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="#fff" text-anchor="middle">M</text></svg>`;

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
