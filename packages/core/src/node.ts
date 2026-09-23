/**
 * Node.js-only helpers (`@markup-lang/core/node`): loading `markup.config.json`
 * and plugin modules. Shared by the CLI and the language server.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { MarkupPlugin } from './plugin.ts';

export class ConfigError extends Error {}

export interface MarkupConfig {
  plugins: MarkupPlugin[];
  theme: 'light' | 'dark' | 'auto';
  /** Output directory for builds, resolved against the config file. */
  out: string | null;
  /** The config file that was read, if any. */
  path: string | null;
}

export const CONFIG_FILE = 'markup.config.json';

/**
 * Reads the config (an explicit path, or `markup.config.json` in `cwd` when it
 * exists) and imports its plugins plus `extraPlugins`. A plugin module exports a
 * MarkupPlugin — or an array of them — as its default export (or as `plugin`).
 */
export async function loadConfig(
  cwd: string,
  configPath?: string,
  extraPlugins: readonly string[] = [],
): Promise<MarkupConfig> {
  const path = configPath ? resolve(cwd, configPath) : join(cwd, CONFIG_FILE);
  let raw: { plugins?: unknown; theme?: unknown; out?: unknown } = {};
  let found: string | null = null;
  if (configPath || existsSync(path)) {
    if (!existsSync(path)) throw new ConfigError(`Config file not found: ${configPath}`);
    try {
      raw = JSON.parse(readFileSync(path, 'utf8')) as typeof raw;
    } catch (error) {
      throw new ConfigError(
        `Invalid config ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new ConfigError(`Invalid config ${path}: expected a JSON object.`);
    found = path;
  }
  const base = found ? dirname(found) : cwd;
  const specifiers = [
    ...(Array.isArray(raw.plugins)
      ? raw.plugins.filter((p): p is string => typeof p === 'string').map((p) => resolve(base, p))
      : []),
    ...extraPlugins.map((p) => resolve(cwd, p)),
  ];
  return {
    plugins: await loadPlugins(specifiers),
    theme: raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : 'auto',
    out: typeof raw.out === 'string' ? resolve(base, raw.out) : null,
    path: found,
  };
}

export async function loadPlugins(paths: readonly string[]): Promise<MarkupPlugin[]> {
  const plugins: MarkupPlugin[] = [];
  for (const path of paths) {
    let module: { default?: unknown; plugin?: unknown };
    try {
      module = (await import(pathToFileURL(path).href)) as typeof module;
    } catch (error) {
      throw new ConfigError(
        `Cannot load plugin ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const exported = module.default ?? module.plugin;
    for (const plugin of Array.isArray(exported) ? exported : [exported]) {
      if (
        !plugin ||
        typeof plugin !== 'object' ||
        typeof (plugin as MarkupPlugin).name !== 'string'
      ) {
        throw new ConfigError(
          `${path} does not export a MarkUP plugin (an object with a \`name\`).`,
        );
      }
      plugins.push(plugin as MarkupPlugin);
    }
  }
  return plugins;
}
