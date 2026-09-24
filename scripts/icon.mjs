/**
 * The MarkUP logo mark — a folded "M": a light left leg, a blue V and a darker blue
 * right leg — as SVG and as anti-aliased PNGs, without any image tooling.
 *
 *   node scripts/icon.mjs <out.png> <size> [more.png size…]   app icon (dark rounded square)
 *   node scripts/icon.mjs --svg <out.svg>                      app icon
 *   node scripts/icon.mjs --mark <out.svg> [leg color]         mark only, transparent
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

export const COLORS = {
  background: '#17191c',
  leg: '#f2f4f7',
  v: '#2f80ed',
  right: '#1f5cb8',
};
const RADIUS = 0.2;
/** Mark geometry in a unit box; later shapes are drawn on top. */
const SHAPES = [
  [
    'leg',
    [
      [0.08, 0.12],
      [0.3, 0.25],
      [0.3, 0.76],
      [0.08, 0.9],
    ],
  ],
  [
    'right',
    [
      [0.7, 0.24],
      [0.92, 0.1],
      [0.92, 0.9],
      [0.7, 0.76],
    ],
  ],
  [
    'v',
    [
      [0.3, 0.25],
      [0.5, 0.368],
      [0.92, 0.1],
      [0.92, 0.4],
      [0.5, 0.668],
      [0.3, 0.55],
    ],
  ],
];
/** Where the mark sits inside the app icon. */
const INSET = 0.15;

const fmt = (n) => Number(n.toFixed(2));

/** The mark as SVG polygons, scaled into [offset, offset + size] of a 100-unit box. */
function polygons(offset, size, colors) {
  return SHAPES.map(
    ([key, points]) =>
      `<polygon fill="${colors[key]}" points="${points
        .map(([x, y]) => `${fmt((offset + x * size) * 100)},${fmt((offset + y * size) * 100)}`)
        .join(' ')}"/>`,
  ).join('\n  ');
}

export function svg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect width="100" height="100" rx="${RADIUS * 100}" fill="${COLORS.background}"/>
  ${polygons(INSET, 1 - 2 * INSET, COLORS)}
</svg>
`;
}

export function markSvg(leg = COLORS.leg) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  ${polygons(0, 1, { ...COLORS, leg })}
</svg>
`;
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function inPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inRoundedSquare(x, y) {
  const r = RADIUS;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 && Math.hypot(x - cx, y - cy) <= r;
}

/** Color of the app icon at (x, y), or null outside it. */
function colorAt(x, y) {
  if (!inRoundedSquare(x, y)) return null;
  const mx = (x - INSET) / (1 - 2 * INSET);
  const my = (y - INSET) / (1 - 2 * INSET);
  let color = COLORS.background;
  for (const [key, points] of SHAPES) if (inPolygon(mx, my, points)) color = COLORS[key];
  return rgb(color);
}

export function png(size) {
  const samples = 4;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0; // filter: none
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0];
      let hits = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const c = colorAt((px + (sx + 0.5) / samples) / size, (py + (sy + 0.5) / samples) / size);
          if (!c) continue;
          hits++;
          for (let k = 0; k < 3; k++) sum[k] += c[k];
        }
      }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      for (let k = 0; k < 3; k++) raw[o + k] = hits ? Math.round(sum[k] / hits) : 0;
      raw[o + 3] = Math.round((hits / (samples * samples)) * 255);
    }
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/').replace(/^\//, '')}`) {
  const args = process.argv.slice(2);
  if (args[0] === '--svg') writeFileSync(args[1], svg());
  else if (args[0] === '--mark') writeFileSync(args[1], markSvg(args[2]));
  else for (let i = 0; i < args.length; i += 2) writeFileSync(args[i], png(Number(args[i + 1])));
}
