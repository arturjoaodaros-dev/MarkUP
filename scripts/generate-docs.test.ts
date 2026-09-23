import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from '@markup-lang/core';
import { componentsPage, errorsPage } from './generate-docs.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('generated documentation', () => {
  it('is up to date (run `npm run docs:generate`)', () => {
    expect(readFileSync(join(root, 'docs/components.md'), 'utf8')).toBe(componentsPage());
    expect(readFileSync(join(root, 'docs/errors.md'), 'utf8')).toBe(errorsPage());
  });

  it('is valid MarkUP itself', () => {
    const errors = parse(componentsPage()).diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toEqual([]);
  });
});
