import { describe, expect, it } from 'vitest';
import { BUILTIN_DIRECTIVES, builtinRegistry, parse } from '@markup-lang/core';

describe('built-in components', () => {
  it('have unique names and at least one form', () => {
    const names = BUILTIN_DIRECTIVES.map((spec) => spec.name);
    expect(new Set(names).size).toBe(names.length);
    for (const spec of BUILTIN_DIRECTIVES) expect(spec.forms.length).toBeGreaterThan(0);
  });

  describe.each(BUILTIN_DIRECTIVES.map((spec) => [spec.name, spec] as const))(
    '%s',
    (_name, spec) => {
      it('has a description and a snippet', () => {
        expect(spec.description.length).toBeGreaterThan(10);
        expect(spec.snippet).toBeTruthy();
      });

      it('has examples that parse without any diagnostic', () => {
        for (const example of spec.examples ?? []) {
          const { diagnostics } = parse(example.source);
          expect(diagnostics, example.source).toEqual([]);
        }
      });

      it('describes every attribute', () => {
        for (const [key, schema] of Object.entries(spec.attributes ?? {})) {
          expect(schema.description, `${spec.name}.${key}`).toBeTruthy();
        }
      });

      it('declares content models only for containers', () => {
        if (spec.content && spec.content !== 'flow') expect(spec.forms).toContain('container');
        if (spec.content === 'data') expect(spec.data).toBeDefined();
      });
    },
  );

  it('are all in the default registry', () => {
    expect(builtinRegistry.names().sort()).toEqual(BUILTIN_DIRECTIVES.map((s) => s.name).sort());
  });
});
