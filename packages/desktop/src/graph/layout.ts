/**
 * A small force-directed layout: links pull like springs, documents push each
 * other apart, and a weak gravity keeps separate groups in view. Repulsion only
 * considers nearby nodes (a spatial grid), so a tick is roughly linear in the
 * size of the graph. The simulation cools down and stops by itself.
 */
import type { DocumentGraph } from './model.ts';

export interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Held in place (while being dragged). */
  fixed: boolean;
  degree: number;
}

const LINK_LENGTH = 70;
const LINK_STRENGTH = 0.3;
const REPULSION = 1200;
const REPULSION_RANGE = 220;
const GRAVITY = 0.015;
const VELOCITY_DECAY = 0.55;
const ALPHA_DECAY = 0.025;
const ALPHA_MIN = 0.003;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export class ForceLayout {
  nodes: SimNode[] = [];
  links: [SimNode, SimNode][] = [];
  alpha = 1;
  private byId = new Map<string, SimNode>();

  get running(): boolean {
    return this.alpha >= ALPHA_MIN;
  }

  node(id: string): SimNode | undefined {
    return this.byId.get(id);
  }

  /** Replaces the graph, keeping the positions of documents that were already there. */
  setGraph(graph: DocumentGraph): void {
    const previous = this.byId;
    const fresh = graph.nodes.filter((n) => !previous.has(n.id)).map((n) => n.id);
    const neighbours = new Map<string, string[]>();
    for (const { source, target } of graph.edges) {
      (neighbours.get(source) ?? neighbours.set(source, []).get(source)!).push(target);
      (neighbours.get(target) ?? neighbours.set(target, []).get(target)!).push(source);
    }
    this.byId = new Map();
    this.nodes = graph.nodes.map((n, i) => {
      const old = previous.get(n.id);
      if (old) {
        old.degree = n.degree;
        this.byId.set(n.id, old);
        return old;
      }
      // New documents start next to a document they link to, or on a spiral.
      const anchor = neighbours
        .get(n.id)
        ?.map((id) => previous.get(id))
        .find(Boolean);
      const r = anchor ? 24 : 12 * Math.sqrt(0.5 + i);
      const angle = i * GOLDEN_ANGLE;
      const node: SimNode = {
        id: n.id,
        x: (anchor?.x ?? 0) + r * Math.cos(angle),
        y: (anchor?.y ?? 0) + r * Math.sin(angle),
        vx: 0,
        vy: 0,
        fixed: false,
        degree: n.degree,
      };
      this.byId.set(n.id, node);
      return node;
    });
    this.links = graph.edges.map((e) => [this.byId.get(e.source)!, this.byId.get(e.target)!]);
    const changed = fresh.length > 0 || this.nodes.length !== previous.size;
    this.reheat(previous.size === 0 ? 1 : changed ? 0.5 : 0.15);
  }

  reheat(alpha = 0.3): void {
    this.alpha = Math.max(this.alpha, alpha);
  }

  /** Advances the simulation one step. */
  tick(): void {
    if (!this.running) return;
    const alpha = this.alpha;
    this.repel(alpha);
    for (const [a, b] of this.links) {
      const dx = b.x + b.vx - (a.x + a.vx) || 0.01;
      const dy = b.y + b.vy - (a.y + a.vy) || 0.01;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const f = ((distance - LINK_LENGTH) / distance) * LINK_STRENGTH * alpha;
      // Well-connected documents move less, which keeps hubs stable.
      const bias = a.degree / (a.degree + b.degree || 1);
      b.vx -= dx * f * bias;
      b.vy -= dy * f * bias;
      a.vx += dx * f * (1 - bias);
      a.vy += dy * f * (1 - bias);
    }
    for (const n of this.nodes) {
      n.vx -= n.x * GRAVITY * alpha;
      n.vy -= n.y * GRAVITY * alpha;
      if (n.fixed) {
        n.vx = n.vy = 0;
        continue;
      }
      n.vx *= VELOCITY_DECAY;
      n.vy *= VELOCITY_DECAY;
      n.x += n.vx;
      n.y += n.vy;
    }
    this.alpha += (0 - this.alpha) * ALPHA_DECAY;
  }

  private repel(alpha: number): void {
    const size = REPULSION_RANGE;
    const grid = new Map<string, SimNode[]>();
    for (const n of this.nodes) {
      const key = `${Math.floor(n.x / size)},${Math.floor(n.y / size)}`;
      (grid.get(key) ?? grid.set(key, []).get(key)!).push(n);
    }
    const range2 = size * size;
    for (const a of this.nodes) {
      const cx = Math.floor(a.x / size);
      const cy = Math.floor(a.y / size);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          for (const b of grid.get(`${gx},${gy}`) ?? []) {
            if (b === a) continue;
            let dx = a.x - b.x;
            let dy = a.y - b.y;
            let d2 = dx * dx + dy * dy;
            if (d2 > range2) continue;
            if (d2 < 1) {
              // Coincident nodes: separate them in a stable direction.
              dx = a.id < b.id ? 1 : -1;
              dy = 0.5;
              d2 = 1;
            }
            const f = (REPULSION * alpha) / d2;
            a.vx += dx * f * 0.5;
            a.vy += dy * f * 0.5;
          }
        }
      }
    }
  }

  /** Runs the simulation without drawing, e.g. to settle a graph before showing it. */
  settle(maxTicks = 300): void {
    for (let i = 0; i < maxTicks && this.running; i++) this.tick();
  }

  bounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    if (this.nodes.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of this.nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x);
      maxY = Math.max(maxY, n.y);
    }
    return { minX, minY, maxX, maxY };
  }
}

/** Radius of a document's dot: bigger when it has more connections. */
export function nodeRadius(degree: number): number {
  return 4 + Math.min(8, Math.sqrt(degree) * 1.6);
}
