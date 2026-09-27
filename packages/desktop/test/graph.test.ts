import { describe, expect, it } from 'vitest';
import { ForceLayout } from '../src/graph/layout.ts';
import { buildGraph, resolveLink } from '../src/graph/model.ts';

describe('resolveLink', () => {
  it('resolves MarkUP documents relative to the linking file', () => {
    expect(resolveLink('/w/docs/a.markup', 'b.mkup', '/w')).toBe('/w/docs/b.mkup');
    expect(resolveLink('/w/docs/a.markup', '../README.markup#intro', '/w')).toBe(
      '/w/README.markup',
    );
    expect(resolveLink('/w/docs/a.markup', './sub/c.md?x', '/w')).toBe('/w/docs/sub/c.md');
    expect(resolveLink('/w/docs/a.markup', '/api/index.markup', '/w')).toBe('/w/api/index.markup');
  });

  it('ignores URLs, anchors and other files', () => {
    for (const target of ['https://x.org/a.markup', '#top', 'pic.png', 'mailto:a@b.c'])
      expect(resolveLink('/w/a.markup', target, '/w')).toBeNull();
  });
});

describe('buildGraph', () => {
  const files = ['/w/README.markup', '/w/GUIDE.markup', '/w/EXAMPLES.mkup', '/w/API.markup'];

  it('makes a node per file and one undirected edge per linked pair', () => {
    const graph = buildGraph(files, {
      '/w/README.markup': ['/w/GUIDE.markup', '/w/EXAMPLES.mkup', '/w/README.markup'],
      '/w/GUIDE.markup': ['/w/README.markup', '/w/EXAMPLES.mkup'],
      '/w/EXAMPLES.mkup': ['/w/API.markup'],
    });
    expect(graph.nodes.map((n) => [n.label, n.degree, n.missing])).toEqual([
      ['README.markup', 2, false],
      ['GUIDE.markup', 2, false],
      ['EXAMPLES.mkup', 3, false],
      ['API.markup', 1, false],
    ]);
    expect(graph.edges).toHaveLength(4);
  });

  it('shows links to files that do not exist as missing nodes', () => {
    const graph = buildGraph(['/w/a.markup'], { '/w/a.markup': ['/w/todo.markup'] });
    expect(graph.nodes.find((n) => n.id === '/w/todo.markup')?.missing).toBe(true);
  });

  it('keeps unlinked documents', () => {
    expect(buildGraph(files, {}).nodes).toHaveLength(4);
  });
});

describe('ForceLayout', () => {
  const distance = (layout: ForceLayout, a: string, b: string) => {
    const p = layout.node(a)!;
    const q = layout.node(b)!;
    return Math.hypot(p.x - q.x, p.y - q.y);
  };

  it('settles with linked documents closer than unlinked ones', () => {
    const layout = new ForceLayout();
    const nodes = ['a', 'b', 'c', 'd'];
    layout.setGraph(buildGraph(nodes, { a: ['b'], c: ['d'] }));
    layout.settle(400);
    expect(layout.running).toBe(false);
    for (const n of layout.nodes) expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
    expect(distance(layout, 'a', 'b')).toBeLessThan(distance(layout, 'a', 'c'));
    expect(distance(layout, 'c', 'd')).toBeLessThan(distance(layout, 'b', 'd'));
  });

  it('keeps positions when the graph changes', () => {
    const layout = new ForceLayout();
    layout.setGraph(buildGraph(['a', 'b'], { a: ['b'] }));
    layout.settle();
    const before = { ...layout.node('a')! };
    layout.setGraph(buildGraph(['a', 'b', 'c'], { a: ['b'], c: ['a'] }));
    expect(layout.node('a')!.x).toBe(before.x);
    // The new document starts next to the one it links to.
    expect(distance(layout, 'a', 'c')).toBeLessThan(40);
    expect(layout.running).toBe(true);
  });

  it('holds a pinned document in place', () => {
    const layout = new ForceLayout();
    layout.setGraph(buildGraph(['a', 'b'], { a: ['b'] }));
    const a = layout.node('a')!;
    a.x = 500;
    a.y = -300;
    a.fixed = true;
    layout.reheat(1);
    layout.settle();
    expect([a.x, a.y]).toEqual([500, -300]);
  });

  it('stays fast on large workspaces', () => {
    const files = Array.from({ length: 2000 }, (_, i) => `/w/${i}.markup`);
    const links: Record<string, string[]> = {};
    files.forEach(
      (f, i) => (links[f] = [files[(i * 7 + 3) % files.length]!, files[Math.floor(i / 2)]!]),
    );
    const layout = new ForceLayout();
    const graph = buildGraph(files, links);
    const start = performance.now();
    layout.setGraph(graph);
    for (let i = 0; i < 60; i++) layout.tick();
    const perTick = (performance.now() - start) / 60;
    expect(graph.nodes).toHaveLength(2000);
    // Roughly a frame budget per tick even on slow CI machines.
    expect(perTick).toBeLessThan(40);
  });
});
