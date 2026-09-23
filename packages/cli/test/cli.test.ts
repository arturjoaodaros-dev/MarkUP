import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { main, rewriteUrl } from '../src/main.ts';
import { renderPreviewPage, startPreview } from '../src/preview.ts';
import type { Io } from '../src/support.ts';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'markup-cli-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function write(path: string, content: string): string {
  const full = join(dir, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  return full;
}

async function run(
  args: string[],
  stdin = '',
): Promise<{ code: number; out: string; err: string }> {
  let out = '';
  let err = '';
  const io: Io = {
    stdout: (t) => (out += t),
    stderr: (t) => (err += t),
    readStdin: async () => stdin,
    cwd: dir,
    color: false,
  };
  const code = await main(args, io);
  return { code, out, err };
}

describe('markup (general)', () => {
  it('prints help and version', async () => {
    expect((await run(['--help'])).out).toContain('Usage');
    expect((await run(['--version'])).out).toBe('0.1.0\n');
    expect((await run([])).code).toBe(2);
  });

  it('rejects unknown commands and options with exit code 2', async () => {
    expect(await run(['explode'])).toMatchObject({ code: 2 });
    expect((await run(['render', '--nope'])).code).toBe(2);
    expect((await run(['render', 'missing.markup'])).err).toContain('Cannot read missing.markup');
  });
});

describe('markup render', () => {
  it('renders HTML, text, AST and JSON', async () => {
    write('a.markup', '# Hi\n\n:badge[x]');
    expect((await run(['render', 'a.markup'])).out).toContain('<h1 id="hi">Hi');
    expect((await run(['render', 'a.markup', '-f', 'text'])).out).toBe('Hi\n\nx\n');
    expect(JSON.parse((await run(['render', 'a.markup', '-f', 'ast'])).out).type).toBe('document');
    expect(JSON.parse((await run(['render', 'a.markup', '--format', 'json'])).out)).toHaveProperty(
      'diagnostics',
    );
  });

  it('renders standalone pages to a file', async () => {
    write('a.markup', '# Page');
    expect(
      (await run(['render', 'a.markup', '--standalone', '--theme', 'dark', '-o', 'out/a.html']))
        .code,
    ).toBe(0);
    const html = readFileSync(join(dir, 'out/a.html'), 'utf8');
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('data-theme="dark"');
  });

  it('reads stdin and reports errors on stderr with exit code 1', async () => {
    const result = await run(['render', '-'], ':::note\nopen');
    expect(result.code).toBe(1);
    expect(result.out).toContain('<aside');
    expect(result.err).toContain('<stdin>:1:1 error MU1001');
  });

  it('validates option values', async () => {
    write('a.markup', 'x');
    expect((await run(['render', 'a.markup', '-f', 'pdf'])).code).toBe(2);
    expect((await run(['render', 'a.markup', '--theme', 'blue'])).code).toBe(2);
  });
});

describe('markup check', () => {
  it('reports diagnostics with a code frame and exits 1 on errors', async () => {
    write('docs/bad.markup', 'Intro\n\n:::note\nnever closed');
    write('docs/good.mkup', '# Fine');
    const result = await run(['check', 'docs']);
    expect(result.code).toBe(1);
    expect(result.out).toContain('docs/bad.markup:3:1 error MU1001');
    expect(result.out).toContain('3 | :::note');
    expect(result.out).toContain('  | ^^^^^^^');
    expect(result.out).toContain('fix: Insert closing :::');
    expect(result.out).toContain('1 error, 0 warnings in 2 files');
  });

  it('succeeds on clean files and honours --max-warnings', async () => {
    write('ok.markup', '# Fine\n\n:::note\nok\n:::');
    expect(await run(['check', 'ok.markup'])).toMatchObject({
      code: 0,
      out: '✔ 1 file checked, no problems\n',
    });
    write('warn.markup', ':::nott\nx\n:::');
    expect((await run(['check', 'warn.markup'])).code).toBe(0);
    expect((await run(['check', 'warn.markup', '--max-warnings', '0'])).code).toBe(1);
  });

  it('outputs JSON', async () => {
    write('a.markup', ':::nott\nx\n:::');
    const report = JSON.parse((await run(['check', 'a.markup', '--format', 'json'])).out);
    expect(report.summary).toMatchObject({ files: 1, errors: 0, warnings: 1 });
    expect(report.files[0].diagnostics[0].code).toBe('MU2001');
  });

  it('checks the current directory by default and skips node_modules', async () => {
    write('a.markup', '# a');
    write('node_modules/x/b.markup', ':::broken');
    expect((await run(['check'])).out).toContain('1 file checked');
  });
});

describe('markup build', () => {
  it('builds a directory into standalone pages, mirroring the structure', async () => {
    write(
      'site/index.markup',
      '# Home\n\nSee [the guide](guide/intro.markup#top) and [ext](https://x.dev/a.md).',
    );
    write('site/guide/intro.mkup', '# Intro');
    const result = await run(['build', 'site', '--out', 'public', '--css']);
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/✔ 2 pages → public in \d+ ms/);
    const index = readFileSync(join(dir, 'public/index.html'), 'utf8');
    expect(index).toContain('href="guide/intro.html#top"');
    expect(index).toContain('href="https://x.dev/a.md"');
    expect(existsSync(join(dir, 'public/guide/intro.html'))).toBe(true);
    expect(existsSync(join(dir, 'public/markup.css'))).toBe(true);
  });

  it('still writes pages with errors but exits 1', async () => {
    write('a.markup', ':::note\nopen');
    const result = await run(['build', 'a.markup']);
    expect(result.code).toBe(1);
    expect(existsSync(join(dir, 'out/a.html'))).toBe(true);
    expect(result.err).toContain('MU1001');
  });

  it('uses markup.config.json for the output directory and theme', async () => {
    write('markup.config.json', JSON.stringify({ out: 'dist-site', theme: 'light' }));
    write('a.markup', '# A');
    await run(['build', 'a.markup']);
    expect(readFileSync(join(dir, 'dist-site/a.html'), 'utf8')).toContain('data-theme="light"');
  });

  it('requires inputs', async () => {
    expect((await run(['build'])).code).toBe(2);
    mkdirSync(join(dir, 'empty'));
    expect((await run(['build', 'empty'])).err).toContain('No .markup');
  });
});

describe('plugins', () => {
  const pluginSource = `
export default {
  name: 'shout',
  directives: [{ name: 'shout', forms: ['inline'], description: 'Upper-cases its label.', label: { use: 'required' } }],
  renderers: {
    html: { shout: (node, ctx) => '<strong class="shout">' + ctx.escape(ctx.labelText(node).toUpperCase()) + '</strong>' },
    text: { shout: (node, ctx) => ctx.label(node).toUpperCase() },
  },
};`;

  it('loads plugins from --plugin and the config file', async () => {
    write('plugins/shout.mjs', pluginSource);
    write('a.markup', 'Say :shout[hello]');
    const direct = await run(['render', 'a.markup', '--plugin', 'plugins/shout.mjs']);
    expect(direct.out).toBe('<p>Say <strong class="shout">HELLO</strong></p>\n');
    write('markup.config.json', JSON.stringify({ plugins: ['./plugins/shout.mjs'] }));
    expect((await run(['render', 'a.markup', '-f', 'text'])).out).toBe('Say HELLO\n');
    expect((await run(['check', 'a.markup'])).code).toBe(0);
    expect((await run(['components', 'shout'])).out).toContain('Upper-cases its label.');
  });

  it('reports bad plugins and configs', async () => {
    write('bad.mjs', 'export default 42;');
    write('a.markup', 'x');
    expect((await run(['render', 'a.markup', '--plugin', 'bad.mjs'])).err).toContain(
      'does not export a MarkUP plugin',
    );
    expect((await run(['render', 'a.markup', '--plugin', 'missing.mjs'])).err).toContain(
      'Cannot load plugin',
    );
    write('markup.config.json', '{ nope');
    expect((await run(['render', 'a.markup'])).err).toContain('Invalid config');
  });
});

describe('markup components', () => {
  it('lists and describes components', async () => {
    const list = await run(['components']);
    expect(list.out).toMatch(/chart\s+:::/);
    expect(list.out).toContain('components. Run');
    const chart = await run(['components', 'chart']);
    expect(chart.out).toContain('type: "bar" | "line" | "area" | "pie" | "donut" = "bar"');
    expect(chart.out).toContain('Single series');
    expect((await run(['components', 'chrt'])).err).toContain('did you mean `chart`');
  });
});

describe('awkward files', () => {
  it('builds files with spaces, Unicode, BOMs, CRLF and no content', async () => {
    write('docs/ação 1.markup', '# Ação\r\n\r\n[next](a%23b.markup)\r\n');
    write('docs/a#b.markup', `${String.fromCharCode(0xfeff)}# Hash in name`);
    write('docs/empty.mkup', '');
    write('docs/nested/deep/x.md', '> '.repeat(40) + 'deep');
    const result = await run(['build', 'docs', '--out', 'site']);
    expect(result.code).toBe(0);
    expect(readFileSync(join(dir, 'site/ação 1.html'), 'utf8')).toContain('<h1 id="ação">Ação');
    expect(readFileSync(join(dir, 'site/a#b.html'), 'utf8')).toContain(
      '<title>Hash in name</title>',
    );
    expect(existsSync(join(dir, 'site/empty.html'))).toBe(true);
    expect(existsSync(join(dir, 'site/nested/deep/x.html'))).toBe(true);
    expect((await run(['check', 'docs'])).out).toContain('4 files');
  });
});

describe('rewriteUrl', () => {
  it.each([
    ['page.markup', 'page.html'],
    ['dir/page.mkup#x', 'dir/page.html#x'],
    ['a.md?q=1', 'a.html?q=1'],
    ['https://x.dev/a.md', 'https://x.dev/a.md'],
    ['image.png', 'image.png'],
  ])('%s → %s', (input, output) => expect(rewriteUrl(input)).toBe(output));
});

describe('preview', () => {
  it('injects live reload and a problems overlay', () => {
    const page = renderPreviewPage(':::note\nopen', { theme: 'auto', plugins: [], title: 'a' });
    expect(page).toContain("new EventSource('/__markup/events')");
    expect(page).toContain('1 problem in this document');
  });

  it('serves the page, static files and events, and refuses path traversal', async () => {
    const file = write('doc/page.markup', '# Live\n\n![x](img.png)');
    write('doc/img.png', 'PNG');
    write('secret.txt', 'no');
    const io: Io = {
      stdout: () => {},
      stderr: () => {},
      readStdin: async () => '',
      cwd: dir,
      color: false,
    };
    const server = await startPreview({
      file,
      port: 0,
      open: false,
      theme: 'auto',
      plugins: [],
      io,
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const fetchText = (path: string) =>
      new Promise<{ status: number; body: string }>((resolve, reject) => {
        get({ host: '127.0.0.1', port, path }, (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
        }).on('error', reject);
      });
    try {
      expect((await fetchText('/')).body).toContain('<h1 id="live">');
      expect(await fetchText('/img.png')).toMatchObject({ status: 200, body: 'PNG' });
      expect((await fetchText('/..%2Fsecret.txt')).status).toBe(403);
      expect((await fetchText('/missing.png')).status).toBe(404);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });
});

describe('the markup binary', () => {
  const bin = join(dirname(fileURLToPath(import.meta.url)), '../src/bin.ts');

  it('runs from source with process exit codes and stdin', () => {
    const ok = spawnSync(
      process.execPath,
      ['--conditions=source', bin, 'render', '-', '-f', 'text'],
      { input: '# From stdin', encoding: 'utf8' },
    );
    expect(ok.status).toBe(0);
    expect(ok.stdout).toBe('From stdin\n');
    const failed = spawnSync(
      process.execPath,
      ['--conditions=source', bin, 'check', join(dir, 'nope.markup')],
      { encoding: 'utf8' },
    );
    expect(failed.status).toBe(2);
    expect(
      execFileSync(process.execPath, ['--conditions=source', bin, '--version'], {
        encoding: 'utf8',
      }),
    ).toBe('0.1.0\n');
  });
});
