import { mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  createRegistry,
  describeType,
  hasErrors,
  isRequired,
  labelSpec,
  parse,
  type ParseResult,
} from '@markup-lang/core';
import { MARKUP_CSS, renderDocument, renderHtml } from '@markup-lang/html';
import { renderText } from '@markup-lang/text';
import { startPreview } from './preview.ts';
import {
  collectFiles,
  commonBase,
  count,
  display,
  formatDiagnostic,
  loadConfig,
  paint,
  plural,
  UsageError,
  type Config,
  type Io,
} from './support.ts';

export const VERSION = '0.1.0';

const HELP = `markup ${VERSION} — MarkUP command line

Usage
  markup <command> [options]

Commands
  render <file|->         Render one document to stdout (or --out)
  build <paths...>        Build standalone HTML pages from files or directories
  check <paths...>        Report errors and warnings
  preview <file>          Live-reloading preview in the browser
  components [name]       List components, or describe one

Options
  -f, --format <fmt>      render: html (default), text, ast, json
  -o, --out <path>        render: output file; build: output directory (default: out)
      --standalone        render: full HTML page with the theme
      --theme <theme>     auto (default), light or dark
  -w, --watch             build: rebuild on changes
      --css               build: also write markup.css next to the pages
      --format <fmt>      check: pretty (default) or json
      --max-warnings <n>  check: fail when there are more warnings than n
  -p, --port <n>          preview: port (default 4000)
      --open              preview: open the browser
      --plugin <path>     Load a plugin module (repeatable)
  -c, --config <path>     Config file (default: ./markup.config.json)
      --no-color          Disable colours
  -h, --help              Show help
  -v, --version           Show the version

Exit codes: 0 success · 1 errors found · 2 usage error`;

/** Runs the CLI. Returns the exit code; long-running commands resolve when stopped. */
export async function main(argv: readonly string[], io: Io): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        format: { type: 'string', short: 'f' },
        out: { type: 'string', short: 'o' },
        standalone: { type: 'boolean' },
        theme: { type: 'string' },
        watch: { type: 'boolean', short: 'w' },
        css: { type: 'boolean' },
        'max-warnings': { type: 'string' },
        port: { type: 'string', short: 'p' },
        open: { type: 'boolean' },
        plugin: { type: 'string', multiple: true },
        config: { type: 'string', short: 'c' },
        'no-color': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (error) {
    io.stderr(
      `${error instanceof Error ? error.message : String(error)}\nRun \`markup --help\` for usage.\n`,
    );
    return 2;
  }
  const { values, positionals } = parsed;
  if (values['no-color']) io = { ...io, color: false };
  if (values.version) {
    io.stdout(`${VERSION}\n`);
    return 0;
  }
  const [command, ...args] = positionals;
  if (values.help || !command || command === 'help') {
    io.stdout(`${HELP}\n`);
    return command || values.help ? 0 : 2;
  }

  try {
    const config = await loadConfig(io.cwd, values.config, values.plugin ?? []);
    const theme = parseTheme(values.theme) ?? config.theme;
    switch (command) {
      case 'render':
        return await render(
          args,
          {
            format: values.format ?? 'html',
            out: values.out,
            standalone: !!values.standalone,
            theme,
          },
          config,
          io,
        );
      case 'build':
        return await build(
          args,
          { out: values.out, watch: !!values.watch, css: !!values.css, theme },
          config,
          io,
        );
      case 'check':
        return check(
          args,
          { format: values.format ?? 'pretty', maxWarnings: parseCount(values['max-warnings']) },
          config,
          io,
        );
      case 'preview':
        return await preview(
          args,
          { port: parseCount(values.port) ?? 4000, open: !!values.open, theme },
          config,
          io,
        );
      case 'components':
        return components(args, config, io);
      default:
        throw new UsageError(`Unknown command \`${command}\`. Run \`markup --help\` for usage.`);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr(`${paint(io).red('error')} ${error.message}\n`);
      return 2;
    }
    throw error;
  }
}

function parseTheme(value: string | undefined): Config['theme'] | undefined {
  if (value === undefined) return undefined;
  if (value === 'auto' || value === 'light' || value === 'dark') return value;
  throw new UsageError(`--theme must be auto, light or dark (got \`${value}\`).`);
}

function parseCount(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0)
    throw new UsageError(`Expected a non-negative integer, got \`${value}\`.`);
  return n;
}

function readSource(path: string, io: Io): string {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    throw new UsageError(
      `Cannot read ${display(path, io.cwd)}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function writeOutput(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** Links between MarkUP files point at the built pages. */
export function rewriteUrl(url: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  return url.replace(/\.(?:markup|mkup|md)(?=[?#]|$)/i, '.html');
}

// ---------------------------------------------------------------------------

async function render(
  args: string[],
  options: { format: string; out: string | undefined; standalone: boolean; theme: Config['theme'] },
  config: Config,
  io: Io,
): Promise<number> {
  if (args.length !== 1) throw new UsageError('render takes exactly one file (or `-` for stdin).');
  const input = args[0]!;
  const source = input === '-' ? await io.readStdin() : readSource(resolve(io.cwd, input), io);
  const result = parse(source, { plugins: config.plugins });
  let output: string;
  switch (options.format) {
    case 'html':
      output = options.standalone
        ? renderDocument(result.document, { plugins: config.plugins, theme: options.theme })
        : renderHtml(result.document, { plugins: config.plugins });
      break;
    case 'text':
      output = `${renderText(result.document, { plugins: config.plugins })}\n`;
      break;
    case 'ast':
      output = `${JSON.stringify(result.document, null, 2)}\n`;
      break;
    case 'json':
      output = `${JSON.stringify({ document: result.document, diagnostics: result.diagnostics }, null, 2)}\n`;
      break;
    default:
      throw new UsageError(`Unknown format \`${options.format}\` (html, text, ast, json).`);
  }
  if (options.out) writeOutput(resolve(io.cwd, options.out), output);
  else io.stdout(output);
  reportErrorsBriefly(result, input === '-' ? '<stdin>' : input, source, io);
  return hasErrors(result.diagnostics) ? 1 : 0;
}

/** Errors go to stderr so that stdout stays clean for pipes. */
function reportErrorsBriefly(result: ParseResult, file: string, source: string, io: Io): void {
  for (const d of result.diagnostics)
    if (d.severity === 'error') io.stderr(formatDiagnostic(d, file, source, io));
}

async function build(
  args: string[],
  options: { out: string | undefined; watch: boolean; css: boolean; theme: Config['theme'] },
  config: Config,
  io: Io,
): Promise<number> {
  if (args.length === 0) throw new UsageError('build needs at least one file or directory.');
  const outDir = options.out
    ? resolve(io.cwd, options.out)
    : (config.out ?? resolve(io.cwd, 'out'));
  const c = paint(io);

  const buildAll = (): number => {
    const files = collectFiles(args, io.cwd).filter((f) => !f.startsWith(outDir));
    if (files.length === 0) throw new UsageError('No .markup, .mkup or .md files found.');
    const base = commonBase(files);
    let failed = 0;
    const totals = count([]);
    const started = performance.now();
    for (const file of files) {
      const source = readSource(file, io);
      const result = parse(source, { plugins: config.plugins });
      count(result.diagnostics, totals);
      for (const d of result.diagnostics)
        if (d.severity === 'error' || d.severity === 'warning')
          io.stderr(formatDiagnostic(d, display(file, io.cwd), source, io));
      if (hasErrors(result.diagnostics)) failed++;
      const target = join(outDir, relative(base, file)).replace(/\.(markup|mkup|md)$/i, '.html');
      writeOutput(
        target,
        renderDocument(result.document, {
          plugins: config.plugins,
          theme: options.theme,
          rewriteUrl,
        }),
      );
    }
    if (options.css) writeOutput(join(outDir, 'markup.css'), `${MARKUP_CSS}\n`);
    const ms = Math.round(performance.now() - started);
    const summary = `${plural(files.length, 'page')} → ${display(outDir, io.cwd)} in ${ms} ms`;
    io.stdout(
      `${failed ? c.red('✖') : c.green('✔')} ${summary}${totals.errors || totals.warnings ? ` (${plural(totals.errors, 'error')}, ${plural(totals.warnings, 'warning')})` : ''}\n`,
    );
    return failed ? 1 : 0;
  };

  const code = buildAll();
  if (!options.watch) return code;
  io.stdout(c.gray('Watching for changes… (Ctrl+C to stop)\n'));
  return new Promise<number>(() => {
    let timer: NodeJS.Timeout | undefined;
    for (const input of args) {
      watch(resolve(io.cwd, input), { recursive: true }, (_event, name) => {
        if (name && !/\.(markup|mkup|md|json)$/i.test(String(name))) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          try {
            buildAll();
          } catch (error) {
            io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
          }
        }, 80);
      });
    }
  });
}

function check(
  args: string[],
  options: { format: string; maxWarnings: number | undefined },
  config: Config,
  io: Io,
): number {
  if (options.format !== 'pretty' && options.format !== 'json')
    throw new UsageError(`Unknown format \`${options.format}\` (pretty, json).`);
  const files = collectFiles(args.length ? args : ['.'], io.cwd);
  const totals = count([]);
  const report: { file: string; diagnostics: ParseResult['diagnostics'] }[] = [];
  const c = paint(io);
  for (const file of files) {
    const source = readSource(file, io);
    const { diagnostics } = parse(source, { plugins: config.plugins });
    count(diagnostics, totals);
    const name = display(file, io.cwd);
    report.push({ file: name, diagnostics });
    if (options.format === 'pretty')
      for (const d of diagnostics) io.stdout(`${formatDiagnostic(d, name, source, io)}\n`);
  }
  if (options.format === 'json') {
    io.stdout(
      `${JSON.stringify({ files: report, summary: { files: files.length, ...totals } }, null, 2)}\n`,
    );
  } else if (totals.errors + totals.warnings + totals.others === 0) {
    io.stdout(`${c.green('✔')} ${plural(files.length, 'file')} checked, no problems\n`);
  } else {
    const mark = totals.errors ? c.red('✖') : c.yellow('⚠');
    io.stdout(
      `${mark} ${plural(totals.errors, 'error')}, ${plural(totals.warnings, 'warning')}${totals.others ? `, ${plural(totals.others, 'hint')}` : ''} in ${plural(files.length, 'file')}\n`,
    );
  }
  if (totals.errors > 0) return 1;
  if (options.maxWarnings !== undefined && totals.warnings > options.maxWarnings) {
    if (options.format === 'pretty')
      io.stdout(c.red(`Too many warnings (${totals.warnings} > ${options.maxWarnings}).\n`));
    return 1;
  }
  return 0;
}

async function preview(
  args: string[],
  options: { port: number; open: boolean; theme: Config['theme'] },
  config: Config,
  io: Io,
): Promise<number> {
  if (args.length !== 1) throw new UsageError('preview takes exactly one file.');
  const file = resolve(io.cwd, args[0]!);
  readSource(file, io);
  await startPreview({
    file,
    port: options.port,
    open: options.open,
    theme: options.theme,
    plugins: config.plugins,
    io,
  });
  return new Promise<number>(() => {});
}

function components(args: string[], config: Config, io: Io): number {
  const registry = createRegistry(config.plugins);
  const c = paint(io);
  if (args.length === 0) {
    const specs = registry.list();
    const width = Math.max(...specs.map((s) => s.name.length));
    for (const spec of specs) {
      const forms = spec.forms
        .map((f) => (f === 'container' ? ':::' : f === 'leaf' ? '::' : ':'))
        .join(' ');
      io.stdout(
        `${c.bold(spec.name.padEnd(width))}  ${c.gray(forms.padEnd(9))} ${spec.description.split('. ')[0]!.replace(/\.$/, '')}.\n`,
      );
    }
    io.stdout(
      c.gray(`\n${specs.length} components. Run \`markup components <name>\` for details.\n`),
    );
    return 0;
  }
  const spec = registry.get(args[0]!);
  if (!spec) {
    const suggestion = registry.suggest(args[0]!);
    throw new UsageError(
      `Unknown component \`${args[0]}\`${suggestion ? ` — did you mean \`${suggestion}\`?` : '.'}`,
    );
  }
  const label = labelSpec(spec);
  let out = `${c.bold(spec.name)} ${c.gray(`(${spec.forms.join(', ')}${spec.content && spec.content !== 'flow' ? `, ${spec.content} body` : ''})`)}\n\n${spec.description}\n`;
  if (label.use !== 'none')
    out += `\n${c.bold('Label')} ${label.use === 'required' ? '(required)' : '(optional)'}: ${label.description ?? ''}\n`;
  const attrs = Object.entries(spec.attributes ?? {});
  if (attrs.length) {
    out += `\n${c.bold('Attributes')}\n`;
    for (const [key, schema] of attrs) {
      const extra =
        schema.default !== undefined
          ? ` = ${JSON.stringify(schema.default)}`
          : isRequired(schema)
            ? ' (required)'
            : '';
      out += `  ${c.cyan(key)}: ${describeType(schema)}${extra}${schema.description ? `  ${c.gray(schema.description)}` : ''}\n`;
    }
  }
  if (spec.allowedParents) out += `\nMust be inside: ${spec.allowedParents.join(', ')}\n`;
  if (spec.allowedChildren) out += `\nMay contain: ${spec.allowedChildren.join(', ')}\n`;
  for (const example of spec.examples ?? [])
    out += `\n${c.bold(example.title ?? 'Example')}\n${example.source.replace(/^/gm, '  ')}\n`;
  io.stdout(out);
  return 0;
}
