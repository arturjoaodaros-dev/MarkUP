import { Maximize, Minus, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppState, useWorkbench } from '../context.ts';
import { flatten, MARKUP_FILE, relative } from '../fs/types.ts';
import { ForceLayout, nodeRadius, type SimNode } from '../graph/layout.ts';
import { buildGraph } from '../graph/model.ts';
import { formatShortcut } from '../lib/keys.ts';

const MIN_ZOOM = 0.08;
const MAX_ZOOM = 4;
/** Above this many documents, labels only appear when zoomed in or highlighted. */
const MANY_NODES = 150;

interface Camera {
  x: number;
  y: number;
  k: number;
}

/**
 * The document graph: every MarkUP file is a dot, every link between two
 * files a line. Drag to move documents (they stay where they are dropped;
 * right-click releases one) or the canvas, scroll to zoom, click a document
 * to open it. Drawn on a canvas so large folders stay fluid.
 */
export function GraphView() {
  const { wb } = useWorkbench();
  const tree = useAppState((s) => s.tree);
  const docs = useAppState((s) => s.docs);
  const links = useAppState((s) => s.links);
  const active = useAppState((s) => s.active);
  const root = useAppState((s) => s.workspace?.root ?? '');
  const settings = useAppState((s) => s.settings);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layout = useRef(new ForceLayout());
  const camera = useRef<Camera>({ x: 0, y: 0, k: 1 });
  /** The camera follows the graph until the user pans or zooms. */
  const autoFit = useRef(true);
  const hovered = useRef<SimNode | null>(null);
  const frame = useRef(0);
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);

  // Keep the link index current while the graph is visible.
  useEffect(() => void wb.indexLinks(), [wb, tree]);
  useEffect(() => {
    const timer = setTimeout(() => void wb.indexLinks(), 400);
    return () => clearTimeout(timer);
  }, [wb, docs]);

  const files = useMemo(
    () =>
      flatten(tree)
        .filter((e) => e.kind === 'file' && MARKUP_FILE.test(e.path))
        .slice(0, 2000)
        .map((e) => e.path),
    [tree],
  );
  const graph = useMemo(() => buildGraph(files, links), [files, links]);
  const neighbours = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const { source, target } of graph.edges) {
      (map.get(source) ?? map.set(source, new Set()).get(source)!).add(target);
      (map.get(target) ?? map.set(target, new Set()).get(target)!).add(source);
    }
    return map;
  }, [graph]);
  const missingById = useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, n.missing] as const)),
    [graph],
  );

  // Drawing state that the render loop reads without re-rendering React.
  const scene = useRef({ neighbours, missingById, active, root });
  scene.current = { neighbours, missingById, active, root };

  const size = () => {
    const el = wrap.current;
    return el ? { w: el.clientWidth, h: el.clientHeight } : { w: 0, h: 0 };
  };

  const fit = () => {
    const bounds = layout.current.bounds();
    const { w, h } = size();
    if (!bounds || w === 0) return;
    const pad = 60;
    const bw = Math.max(bounds.maxX - bounds.minX, 1);
    const bh = Math.max(bounds.maxY - bounds.minY, 1);
    const k = Math.min(Math.max(Math.min((w - pad * 2) / bw, (h - pad * 2) / bh), MIN_ZOOM), 1.6);
    camera.current = {
      k,
      x: w / 2 - ((bounds.minX + bounds.maxX) / 2) * k,
      y: h / 2 - ((bounds.minY + bounds.maxY) / 2) * k,
    };
  };

  const draw = () => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const { w, h } = size();
    const dpr = window.devicePixelRatio || 1;
    if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
    }
    const css = getComputedStyle(document.documentElement);
    const color = (name: string) => css.getPropertyValue(name).trim();
    const colors = {
      bg: color('--surface'),
      edge: color('--border-strong'),
      node: color('--text-faint'),
      accent: color('--accent-text'),
      label: color('--text-muted'),
      strong: color('--text'),
    };
    const { neighbours: near, missingById: missing, active: current } = scene.current;
    const { x: tx, y: ty, k } = camera.current;
    const sim = layout.current;
    const focus = hovered.current;
    const lit = focus ? (near.get(focus.id) ?? new Set<string>()) : null;
    const isLit = (n: SimNode) => !focus || n === focus || lit!.has(n.id);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * tx, dpr * ty);

    // Links: all dimmed when a document is hovered, then its own links on top.
    ctx.lineWidth = 1 / k;
    ctx.strokeStyle = colors.edge;
    ctx.globalAlpha = focus ? 0.35 : 1;
    ctx.beginPath();
    for (const [a, b] of sim.links) {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    if (focus) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1.5 / k;
      ctx.beginPath();
      for (const [a, b] of sim.links) {
        if (a !== focus && b !== focus) continue;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    }

    // Documents. Visible ones only.
    const left = -tx / k;
    const top = -ty / k;
    const right = (w - tx) / k;
    const bottom = (h - ty) / k;
    const visible: SimNode[] = [];
    for (const n of sim.nodes) {
      const r = nodeRadius(n.degree);
      if (n.x + r < left || n.x - r > right || n.y + r < top || n.y - r > bottom) continue;
      visible.push(n);
      ctx.globalAlpha = isLit(n) ? 1 : 0.3;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      const highlight = n === focus || n.id === current;
      if (missing.get(n.id)) {
        ctx.setLineDash([2 / k, 2 / k]);
        ctx.lineWidth = 1.2 / k;
        ctx.strokeStyle = colors.node;
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = highlight ? colors.accent : colors.node;
        ctx.fill();
      }
    }

    // Labels in screen space, so they stay crisp at any zoom.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `11.5px ${color('--font-ui')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const all = sim.nodes.length <= MANY_NODES ? k >= 0.55 : k >= 1.1;
    for (const n of visible) {
      const emphasised = n === focus || n.id === current || (focus !== null && lit!.has(n.id));
      if (!all && !emphasised) continue;
      ctx.globalAlpha = isLit(n) ? 1 : 0.3;
      ctx.fillStyle = emphasised ? colors.strong : colors.label;
      const label = n.id.slice(n.id.lastIndexOf('/') + 1);
      ctx.fillText(label, n.x * k + tx, (n.y + nodeRadius(n.degree)) * k + ty + 4);
    }
    ctx.globalAlpha = 1;
  };

  const schedule = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const sim = layout.current;
      const ticks = sim.nodes.length > 800 ? 1 : 2;
      for (let i = 0; i < ticks; i++) sim.tick();
      if (autoFit.current) fit();
      draw();
      if (sim.running) schedule();
    });
  };

  // New or changed graph: keep known positions, settle the rest a little first.
  useEffect(() => {
    const sim = layout.current;
    const first = sim.nodes.length === 0;
    sim.setGraph(graph);
    if (first) sim.settle(graph.nodes.length > 500 ? 30 : 120);
    if (autoFit.current) fit();
    schedule();
  }, [graph]);

  // Redraw on highlight and theme changes.
  useEffect(schedule, [active, settings]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (autoFit.current) fit();
      draw();
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || wb.state.palette || wb.state.settingsOpen) return;
      wb.toggleGraph(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wb]);

  // ---------------------------------------------------------------- input

  const toWorld = (event: { clientX: number; clientY: number }) => {
    const rect = canvas.current!.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const { x, y, k } = camera.current;
    return { sx, sy, x: (sx - x) / k, y: (sy - y) / k };
  };

  const hit = (x: number, y: number): SimNode | null => {
    const slack = 4 / camera.current.k;
    let best: SimNode | null = null;
    let bestDistance = Infinity;
    for (const n of layout.current.nodes) {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d <= nodeRadius(n.degree) + slack && d < bestDistance) {
        best = n;
        bestDistance = d;
      }
    }
    return best;
  };

  const setHover = (node: SimNode | null) => {
    if (hovered.current === node) return;
    hovered.current = node;
    setHoverLabel(
      node
        ? relative(scene.current.root, node.id) +
            (node.fixed ? ' · pinned, right-click to release' : '')
        : null,
    );
    schedule();
  };

  const drag = useRef<{
    node: SimNode | null;
    wasFixed: boolean;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = toWorld(event);
    const node = hit(p.x, p.y);
    const wasFixed = node?.fixed ?? false;
    if (node) node.fixed = true;
    drag.current = {
      node,
      wasFixed,
      startX: p.sx,
      startY: p.sy,
      lastX: p.sx,
      lastY: p.sy,
      moved: false,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toWorld(event);
    const d = drag.current;
    if (!d) {
      setHover(hit(p.x, p.y));
      return;
    }
    if (!d.moved && Math.hypot(p.sx - d.startX, p.sy - d.startY) < 4) return;
    d.moved = true;
    // The camera stops following the layout once the user arranges things.
    autoFit.current = false;
    if (d.node) {
      d.node.x = p.x;
      d.node.y = p.y;
      layout.current.reheat(0.25);
    } else {
      camera.current.x += p.sx - d.lastX;
      camera.current.y += p.sy - d.lastY;
    }
    d.lastX = p.sx;
    d.lastY = p.sy;
    schedule();
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    // A dropped document stays pinned where it was put.
    if (d.node) d.node.fixed = d.moved || d.wasFixed;
    if (d.moved || !d.node) return;
    if (scene.current.missingById.get(d.node.id)) {
      wb.toast('info', `${relative(scene.current.root, d.node.id)} does not exist yet.`);
      return;
    }
    void wb.openFromGraph(d.node.id);
  };

  const zoomAt = (sx: number, sy: number, factor: number) => {
    const c = camera.current;
    const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.k * factor));
    camera.current = { k, x: sx - (sx - c.x) * (k / c.k), y: sy - (sy - c.y) * (k / c.k) };
    autoFit.current = false;
    schedule();
  };

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    // Non-passive, so the page does not scroll while zooming.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const p = toWorld(event);
      zoomAt(p.sx, p.sy, Math.exp(-event.deltaY * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const zoomCenter = (factor: number) => {
    const { w, h } = size();
    zoomAt(w / 2, h / 2, factor);
  };

  const documents = graph.nodes.filter((n) => !n.missing).length;
  return (
    <section className="graph-view" aria-label="Document graph">
      <header className="graph-toolbar">
        <h2>Graph</h2>
        <span className="graph-stats">
          {documents} {documents === 1 ? 'document' : 'documents'} · {graph.edges.length}{' '}
          {graph.edges.length === 1 ? 'link' : 'links'}
        </span>
        <span className="graph-hint">{hoverLabel ?? ''}</span>
        <div className="graph-actions">
          <button
            type="button"
            title="Zoom out"
            aria-label="Zoom out"
            onClick={() => zoomCenter(1 / 1.3)}
          >
            <Minus size={15} />
          </button>
          <button
            type="button"
            title="Zoom in"
            aria-label="Zoom in"
            onClick={() => zoomCenter(1.3)}
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            title="Fit to window"
            aria-label="Fit to window"
            onClick={() => {
              autoFit.current = true;
              fit();
              schedule();
            }}
          >
            <Maximize size={14} />
          </button>
          <button
            type="button"
            title={`Close graph (Esc) — ${formatShortcut('mod+shift+g')} toggles it`}
            aria-label="Close graph"
            onClick={() => wb.toggleGraph(false)}
          >
            <X size={15} />
          </button>
        </div>
      </header>
      <div ref={wrap} className="graph-canvas">
        <canvas
          ref={canvas}
          className={hoverLabel ? 'is-pointing' : undefined}
          role="img"
          aria-label={`${documents} documents and ${graph.edges.length} links between them`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(event) => {
            event.preventDefault();
            const p = toWorld(event);
            const node = hit(p.x, p.y);
            if (!node?.fixed) return;
            node.fixed = false;
            layout.current.reheat(0.3);
            schedule();
          }}
          onPointerLeave={() => {
            if (!drag.current) setHover(null);
          }}
        />
        {documents === 0 ? (
          <p className="graph-empty">No MarkUP documents in this folder.</p>
        ) : (
          graph.edges.length === 0 && (
            <p className="graph-empty">
              No links yet. Link documents with <code>[text](other.markup)</code> to connect them.
            </p>
          )
        )}
      </div>
    </section>
  );
}
