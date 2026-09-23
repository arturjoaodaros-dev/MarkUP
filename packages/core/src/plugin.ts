/**
 * Plugins bundle new components. The core only understands `directives`
 * (language-level specs); renderer packages read their own keys from
 * `renderers` (`html`, `text`, …), so a single plugin object can extend every
 * layer without the core knowing about HTML.
 */
import { builtinRegistry } from './directives/builtins.ts';
import type { DirectiveRegistry, DirectiveSpec } from './directives/spec.ts';

export interface MarkupPlugin {
  /** Unique, human-readable name (used in error messages). */
  name: string;
  directives?: readonly DirectiveSpec[];
  /** Renderer-specific implementations keyed by renderer id, e.g. `{ html: { … } }`. */
  renderers?: { readonly [rendererId: string]: unknown };
}

export function definePlugin<T extends MarkupPlugin>(plugin: T): T {
  return plugin;
}

/** The built-in registry extended with every plugin's directives (later plugins win). */
export function createRegistry(
  plugins: readonly MarkupPlugin[] = [],
  base: DirectiveRegistry = builtinRegistry,
): DirectiveRegistry {
  if (plugins.length === 0) return base;
  return base.extend(plugins.flatMap((plugin) => plugin.directives ?? []));
}
