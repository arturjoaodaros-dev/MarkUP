import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getDirectiveNames } from '@markup/core';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Os snippets são escritos à mão (o conteúdo de exemplo é prosa, não
// lógica), mas a LISTA de diretivas com snippet não pode divergir de
// `@markup/core` silenciosamente — este teste falha se alguém adicionar uma
// diretiva nova ao core e esquecer o snippet, ou vice-versa.
describe('snippets acompanham as diretivas do core', () => {
  it('tem um snippet para cada diretiva registrada, e nenhuma extra', () => {
    const raw = readFileSync(join(__dirname, '..', '..', 'snippets', 'markup.code-snippets'), 'utf-8');
    const snippets = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(snippets).sort()).toEqual(getDirectiveNames().sort());
  });
});
