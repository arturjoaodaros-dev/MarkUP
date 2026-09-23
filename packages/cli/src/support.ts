import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Diagnostic } from '@markup-lang/core';
import {
  ConfigError,
  loadConfig as loadSharedConfig,
  type MarkupConfig,
} from '@markup-lang/core/node';

export interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  readStdin: () => Promise<string>;
  cwd: string;
  color: boolean;
}

export class UsageError extends Error {}

// ---------------------------------------------------------------------------
// Colours

export function paint(io: Io) {
  const wrap = (open: number, close: number) => (text: string) =>
    io.color ? `\x1b[${open}m${text}\x1b[${close}m` : text;
  return {
    red: wrap(31, 39),
    yellow: wrap(33, 39),
    blue: wrap(34, 39),
    cyan: wrap(36, 39),
    green: wrap(32, 39),
    gray: wrap(90, 39),
    bold: wrap(1, 22),
    dim: wrap(2, 22),
  };
}

// ---------------------------------------------------------------------------
// Files

export const MARKUP_EXTENSIONS = ['.markup', '.mkup', '.md'];

export function isMarkupFile(path: string): boolean {
  return MARKUP_EXTENSIONS.includes(extname(path).toLowerCase());
}

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'out']);

/** Expands files and directories (recursively) into MarkUP files, sorted and de-duplicated. */
export function collectFiles(inputs: readonly string[], cwd: string): string[] {
  const files = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && isMarkupFile(path)) files.add(path);
    }
  };
  for (const input of inputs) {
    const path = resolve(cwd, input);
    if (!existsSync(path)) throw new UsageError(`No such file or directory: ${input}`);
    if (statSync(path).isDirectory()) walk(path);
    else files.add(path);
  }
  return [...files].sort();
}

/** The deepest directory containing every path. */
export function commonBase(paths: readonly string[]): string {
  if (paths.length === 0) return process.cwd();
  let base = dirname(paths[0]!);
  for (const path of paths) {
    while (relative(base, path).startsWith('..') || isAbsolute(relative(base, path))) {
      const parent = dirname(base);
      if (parent === base) break;
      base = parent;
    }
  }
  return base;
}

export function display(path: string, cwd: string): string {
  const rel = relative(cwd, path);
  return (rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel : path).replace(/\\/g, '/');
}

// ---------------------------------------------------------------------------
// Config and plugins

export type Config = MarkupConfig;

/** The shared loader, with its errors turned into usage errors. */
export async function loadConfig(
  cwd: string,
  configPath: string | undefined,
  pluginPaths: readonly string[],
): Promise<Config> {
  try {
    return await loadSharedConfig(cwd, configPath, pluginPaths);
  } catch (error) {
    if (error instanceof ConfigError)
      throw new UsageError(error.message.replaceAll(cwd + sep, '').replace(/\\/g, '/'));
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Diagnostics

export interface Counts {
  errors: number;
  warnings: number;
  others: number;
}

export function count(
  diagnostics: readonly Diagnostic[],
  into: Counts = { errors: 0, warnings: 0, others: 0 },
): Counts {
  for (const d of diagnostics) {
    if (d.severity === 'error') into.errors++;
    else if (d.severity === 'warning') into.warnings++;
    else into.others++;
  }
  return into;
}

/** `file:line:col severity CODE message` followed by a code frame. */
export function formatDiagnostic(d: Diagnostic, file: string, source: string, io: Io): string {
  const c = paint(io);
  const severity =
    d.severity === 'error'
      ? c.red('error')
      : d.severity === 'warning'
        ? c.yellow('warning')
        : c.blue(d.severity);
  const { line, column } = d.range.start;
  let out = `${c.bold(`${file}:${line}:${column}`)} ${severity} ${c.gray(d.code)} ${d.message}\n`;
  const lines = source.split(/\r\n|\r|\n/);
  const text = lines[line - 1];
  if (text !== undefined) {
    const gutter = String(line).length;
    const width =
      d.range.end.line === line
        ? Math.max(1, d.range.end.column - column)
        : Math.max(1, text.length - column + 1);
    const shown = text.replace(/\t/g, ' ');
    out += `${c.gray(`${' '.repeat(gutter)} |`)}\n`;
    out += `${c.gray(`${line} |`)} ${shown}\n`;
    out += `${c.gray(`${' '.repeat(gutter)} |`)} ${' '.repeat(column - 1)}${(d.severity === 'error' ? c.red : c.yellow)('^'.repeat(Math.min(width, Math.max(1, shown.length - column + 2))))}\n`;
  }
  for (const r of d.related ?? [])
    out += `  ${c.gray(`${file}:${r.range.start.line}:${r.range.start.column}`)} ${r.message}\n`;
  const fix = d.fixes?.[0];
  if (fix) out += `  ${c.cyan('fix:')} ${fix.title}\n`;
  return out;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
