import { describe, expect, it } from 'vitest';
import { WorkspaceChangeCoalescer } from './workspaceChangeCoalescer';

describe('WorkspaceChangeCoalescer', () => {
  it('um evento único sobrevive ao flush', () => {
    const c = new WorkspaceChangeCoalescer();
    c.enqueue('C:/ws/a.markup', 'created');
    expect(c.flush()).toEqual([{ path: 'C:/ws/a.markup', kind: 'created' }]);
  });

  it('eventos duplicados pro mesmo caminho colapsam em um, o mais recente vence', () => {
    const c = new WorkspaceChangeCoalescer();
    c.enqueue('C:/ws/a.markup', 'modified');
    c.enqueue('C:/ws/a.markup', 'modified');
    c.enqueue('C:/ws/a.markup', 'removed');
    expect(c.flush()).toEqual([{ path: 'C:/ws/a.markup', kind: 'removed' }]);
  });

  it('criado depois apagado no mesmo lote cancela', () => {
    const c = new WorkspaceChangeCoalescer();
    c.enqueue('C:/ws/temp.markup', 'created');
    c.enqueue('C:/ws/temp.markup', 'removed');
    expect(c.flush()).toEqual([]);
  });

  it('caminhos diferentes produzem entradas separadas', () => {
    const c = new WorkspaceChangeCoalescer();
    c.enqueue('C:/ws/a.markup', 'created');
    c.enqueue('C:/ws/b.markup', 'created');
    expect(c.flush()).toHaveLength(2);
  });

  it('flush limpa o pendente — segundo flush vem vazio', () => {
    const c = new WorkspaceChangeCoalescer();
    c.enqueue('C:/ws/a.markup', 'created');
    c.flush();
    expect(c.flush()).toEqual([]);
  });

  it('hasPending reflete se há algo acumulado', () => {
    const c = new WorkspaceChangeCoalescer();
    expect(c.hasPending).toBe(false);
    c.enqueue('C:/ws/a.markup', 'created');
    expect(c.hasPending).toBe(true);
    c.flush();
    expect(c.hasPending).toBe(false);
  });
});
