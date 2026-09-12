import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  createEmptyIndex,
  getFileList,
  isIgnoredPath,
  isMarkupFile,
  isTempFile,
  reconcileWithFreshScan,
  resolveWikiLink,
  search,
} from './workspaceIndex';
import type { WorkspaceIndexState } from './workspaceTypes';

const ROOT = 'C:/ws';

describe('helpers', () => {
  it('isMarkupFile reconhece .markup e .mkup, ignora outras extensões', () => {
    expect(isMarkupFile('C:/ws/doc.markup')).toBe(true);
    expect(isMarkupFile('C:/ws/doc.mkup')).toBe(true);
    expect(isMarkupFile('C:/ws/doc.txt')).toBe(false);
  });

  it('isTempFile reconhece o padrão do salvamento atômico', () => {
    expect(isTempFile('.doc.markup.tmp-abc123')).toBe(true);
    expect(isTempFile('doc.markup')).toBe(false);
  });

  it('isIgnoredPath detecta segmentos de pasta ignorada em qualquer profundidade', () => {
    expect(isIgnoredPath(ROOT, 'C:/ws/node_modules/x/y.markup')).toBe(true);
    expect(isIgnoredPath(ROOT, 'C:/ws/.git/config')).toBe(true);
    expect(isIgnoredPath(ROOT, 'C:/ws/docs/y.markup')).toBe(false);
  });
});

describe('applyBatch — criação', () => {
  it('cria um arquivo markup na raiz', () => {
    const state = createEmptyIndex(ROOT);
    const { state: next } = applyBatch(state, [{ kind: 'created', path: 'C:/ws/novo.markup' }], new Map());

    expect(next.nodes['C:/ws/novo.markup']).toMatchObject({ name: 'novo.markup', isDirectory: false });
    expect(next.nodes[ROOT].childPaths).toContain('C:/ws/novo.markup');
  });

  it('ignora extensão que não é markup quando o Rust já diz que é arquivo (isDirectory: false)', () => {
    const state = createEmptyIndex(ROOT);
    const { state: next } = applyBatch(
      state,
      [{ kind: 'created', path: 'C:/ws/notas.txt', isDirectory: false }],
      new Map(),
    );
    expect(next.nodes['C:/ws/notas.txt']).toBeUndefined();
  });

  it('sem a dica do Rust (ex.: reconciliação sem stat), cai na heurística de extensão — limitação conhecida e documentada', () => {
    const state = createEmptyIndex(ROOT);
    const { state: next } = applyBatch(state, [{ kind: 'created', path: 'C:/ws/notas.txt' }], new Map());
    // Vira uma pasta fantasma até a próxima reconciliação corrigir —
    // registrado no comentário de applyCreated, não escondido.
    expect(next.nodes['C:/ws/notas.txt']).toMatchObject({ isDirectory: true });
  });

  it('cria uma pasta de verdade quando o Rust diz isDirectory: true', () => {
    const state = createEmptyIndex(ROOT);
    const { state: next } = applyBatch(
      state,
      [{ kind: 'created', path: 'C:/ws/Notas', isDirectory: true }],
      new Map(),
    );
    expect(next.nodes['C:/ws/Notas']).toMatchObject({ isDirectory: true });
  });

  it('ignora caminho dentro de pasta ignorada', () => {
    const state = createEmptyIndex(ROOT);
    const { state: next } = applyBatch(state, [{ kind: 'created', path: 'C:/ws/node_modules/x.markup' }], new Map());
    expect(Object.keys(next.nodes)).toEqual([ROOT]);
  });

  it('cria ancestrais que ainda não existiam (criação em lote de pasta aninhada)', () => {
    const state = createEmptyIndex(ROOT);
    const { state: next } = applyBatch(
      state,
      [{ kind: 'created', path: 'C:/ws/a/b/doc.markup' }],
      new Map(),
    );

    expect(next.nodes['C:/ws/a']).toMatchObject({ isDirectory: true });
    expect(next.nodes['C:/ws/a/b']).toMatchObject({ isDirectory: true });
    expect(next.nodes['C:/ws/a/b/doc.markup']).toMatchObject({ isDirectory: false });
    expect(next.nodes[ROOT].childPaths).toContain('C:/ws/a');
    expect(next.nodes['C:/ws/a'].childPaths).toContain('C:/ws/a/b');
  });

  it('criado duas vezes não duplica entrada', () => {
    let state = createEmptyIndex(ROOT);
    state = applyBatch(state, [{ kind: 'created', path: 'C:/ws/a.markup' }], new Map()).state;
    state = applyBatch(state, [{ kind: 'created', path: 'C:/ws/a.markup' }], new Map()).state;
    expect(state.nodes[ROOT].childPaths.filter((p) => p === 'C:/ws/a.markup')).toHaveLength(1);
  });
});

describe('applyBatch — caminhos nativos do Windows (separador \\)', () => {
  // Regressão: o scan inicial (via joinPath) e os eventos do watcher Rust
  // chegam com separador \ no Windows — se applyCreated normalizasse pra /
  // só na hora de procurar o pai no mapa de nodes, a busca nunca batia com
  // as chaves (criadas com \), e todo arquivo criado externamente virava
  // um no-op silencioso. Os testes acima usam ROOT com / e não pegavam isso.
  const WIN_ROOT = 'C:\\Users\\artur\\Downloads\\ws';

  it('cria um arquivo markup na raiz usando caminhos com \\', () => {
    const state = createEmptyIndex(WIN_ROOT);
    const { state: next } = applyBatch(
      state,
      [{ kind: 'created', path: 'C:\\Users\\artur\\Downloads\\ws\\novo.markup', isDirectory: false }],
      new Map(),
    );

    expect(next.nodes['C:\\Users\\artur\\Downloads\\ws\\novo.markup']).toMatchObject({
      name: 'novo.markup',
      isDirectory: false,
    });
    expect(next.nodes[WIN_ROOT].childPaths).toContain('C:\\Users\\artur\\Downloads\\ws\\novo.markup');
  });

  it('cria ancestrais aninhados usando caminhos com \\', () => {
    const state = createEmptyIndex(WIN_ROOT);
    const { state: next } = applyBatch(
      state,
      [{ kind: 'created', path: 'C:\\Users\\artur\\Downloads\\ws\\a\\b\\doc.markup', isDirectory: false }],
      new Map(),
    );

    expect(next.nodes['C:\\Users\\artur\\Downloads\\ws\\a']).toMatchObject({ isDirectory: true });
    expect(next.nodes['C:\\Users\\artur\\Downloads\\ws\\a\\b']).toMatchObject({ isDirectory: true });
    expect(next.nodes['C:\\Users\\artur\\Downloads\\ws\\a\\b\\doc.markup']).toMatchObject({ isDirectory: false });
  });
});

describe('applyBatch — alteração e conflito externo', () => {
  function seeded(): WorkspaceIndexState {
    return applyBatch(createEmptyIndex(ROOT), [{ kind: 'created', path: 'C:/ws/a.markup' }], new Map()).state;
  }

  it('mudança não anunciada como self-write vira conflito externo', () => {
    const { external } = applyBatch(seeded(), [{ kind: 'modified', path: 'C:/ws/a.markup' }], new Map());
    expect(external.changed).toEqual(['C:/ws/a.markup']);
  });

  it('mudança dentro da janela de self-write recente não vira conflito', () => {
    const selfWrites = new Map([['C:/ws/a.markup', Date.now()]]);
    const { external } = applyBatch(seeded(), [{ kind: 'modified', path: 'C:/ws/a.markup' }], selfWrites);
    expect(external.changed).toEqual([]);
  });

  it('self-write expirado (fora da janela de 2s) volta a contar como externo', () => {
    const selfWrites = new Map([['C:/ws/a.markup', Date.now() - 5000]]);
    const { external } = applyBatch(seeded(), [{ kind: 'modified', path: 'C:/ws/a.markup' }], selfWrites);
    expect(external.changed).toEqual(['C:/ws/a.markup']);
  });

  it('modified de um caminho ainda não indexado se autocura como created', () => {
    const { state, external } = applyBatch(seeded(), [{ kind: 'modified', path: 'C:/ws/b.markup' }], new Map());
    expect(state.nodes['C:/ws/b.markup']).toBeDefined();
    expect(external.changed).toEqual([]);
  });
});

describe('applyBatch — remoção', () => {
  it('remove um arquivo e reporta como externo', () => {
    const seeded = applyBatch(createEmptyIndex(ROOT), [{ kind: 'created', path: 'C:/ws/a.markup' }], new Map()).state;
    const { state: next, external } = applyBatch(seeded, [{ kind: 'removed', path: 'C:/ws/a.markup' }], new Map());

    expect(next.nodes['C:/ws/a.markup']).toBeUndefined();
    expect(next.nodes[ROOT].childPaths).not.toContain('C:/ws/a.markup');
    expect(external.removed).toEqual(['C:/ws/a.markup']);
  });

  it('remove uma pasta remove a subárvore inteira', () => {
    let state = createEmptyIndex(ROOT);
    state = applyBatch(state, [{ kind: 'created', path: 'C:/ws/a/doc.markup' }], new Map()).state;
    state = applyBatch(state, [{ kind: 'removed', path: 'C:/ws/a' }], new Map()).state;

    expect(state.nodes['C:/ws/a']).toBeUndefined();
    expect(state.nodes['C:/ws/a/doc.markup']).toBeUndefined();
  });

  it('remover caminho não indexado não faz nada', () => {
    const state = createEmptyIndex(ROOT);
    const { state: next, external } = applyBatch(state, [{ kind: 'removed', path: 'C:/ws/fantasma.markup' }], new Map());
    expect(next).toEqual(state);
    expect(external.removed).toEqual([]);
  });
});

describe('reconcileWithFreshScan', () => {
  it('detecta arquivo presente no scan fresco e ausente no índice atual', () => {
    const current = createEmptyIndex(ROOT);
    const fresh = applyBatch(createEmptyIndex(ROOT), [{ kind: 'created', path: 'C:/ws/novo.markup' }], new Map()).state;

    const { state } = reconcileWithFreshScan(current, fresh);
    expect(state.nodes['C:/ws/novo.markup']).toBeDefined();
  });

  it('detecta arquivo ausente no scan fresco e presente no índice atual', () => {
    const current = applyBatch(createEmptyIndex(ROOT), [{ kind: 'created', path: 'C:/ws/sumiu.markup' }], new Map()).state;
    const fresh = createEmptyIndex(ROOT);

    const { state } = reconcileWithFreshScan(current, fresh);
    expect(state.nodes['C:/ws/sumiu.markup']).toBeUndefined();
  });
});

describe('search', () => {
  it('encontra por nome de arquivo, ignora maiúsculas/minúsculas', () => {
    const state = applyBatch(
      createEmptyIndex(ROOT),
      [
        { kind: 'created', path: 'C:/ws/Relatorio-Vendas.markup' },
        { kind: 'created', path: 'C:/ws/outro.markup' },
      ],
      new Map(),
    ).state;

    expect(search(state, 'vendas')).toHaveLength(1);
  });

  it('query vazia não retorna nada', () => {
    const state = applyBatch(createEmptyIndex(ROOT), [{ kind: 'created', path: 'C:/ws/a.markup' }], new Map()).state;
    expect(search(state, '   ')).toEqual([]);
  });
});

describe('resolveWikiLink', () => {
  it('encontra por nome de arquivo sem extensão', () => {
    const state = applyBatch(
      createEmptyIndex(ROOT),
      [{ kind: 'created', path: 'C:/ws/Guia de Instalação.markup' }],
      new Map(),
    ).state;

    expect(resolveWikiLink(state, 'Guia de Instalação')).toEqual({ exists: true, path: 'C:/ws/Guia de Instalação.markup' });
  });

  it('não encontrado retorna exists false', () => {
    const state = createEmptyIndex(ROOT);
    expect(resolveWikiLink(state, 'Não Existe')).toEqual({ exists: false });
  });
});

describe('getFileList', () => {
  it('lista só arquivos, com nome sem extensão', () => {
    const state = applyBatch(
      createEmptyIndex(ROOT),
      [{ kind: 'created', path: 'C:/ws/a/doc.markup' }],
      new Map(),
    ).state;

    const files = getFileList(state);
    expect(files).toEqual([{ name: 'doc', path: 'C:/ws/a/doc.markup' }]);
  });
});
