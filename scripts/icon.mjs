/**
 * Generates the MarkUP logo — an "M" followed by the directive colon — as SVG
 * and as anti-aliased PNGs, without any image tooling.
 *
 *   node scripts/icon.mjs <out.png> <size> [more.png size…]
 *   node scripts/icon.mjs --svg <out.svg>
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [79, 70, 229]; // #4f46e5
const FG = [255, 255, 255];
const RADIUS = 0.22;
const STROKE = 0.1;
const M = [
  [0.2, 0.74],
  [0.2, 0.28],
  [0.44, 0.56],
  [0.68, 0.28],
  [0.68, 0.74],
];
const DOTS = [
  [0.845, 0.4],
  [0.845, 0.66],
];
const DOT_R = 0.058;

export function svg() {
  const points = M.map(([x, y]) => `${x * 100},${y * 100}`).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect width="100" height="100" rx="${RADIUS * 100}" fill="#4f46e5"/>
  <polyline points="${points}" fill="none" stroke="#fff" stroke-width="${STROKE * 100}" stroke-linecap="round" stroke-linejoin="round"/>
  ${DOTS.map(([x, y]) => `<circle cx="${x * 100}" cy="${y * 100}" r="${DOT_R * 100}" fill="#fff"/>`).join('\n  ')}
</svg>
`;
}

function segmentDistance(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function inRoundedSquare(x, y) {
  const r = RADIUS;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 && Math.hypot(x - cx, y - cy) <= r;
}

function inGlyph(x, y) {
  for (let i = 0; i < M.length - 1; i++)
    if (segmentDistance(x, y, M[i], M[i + 1]) <= STROKE / 2) return true;
  return DOTS.some(([cx, cy]) => Math.hypot(x - cx, y - cy) <= DOT_R);
}

export function png(size) {
  const samples = 4;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0; // filter: none
    for (let px = 0; px < size; px++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) / size;
          const y = (py + (sy + 0.5) / samples) / size;
          if (!inRoundedSquare(x, y)) continue;
          if (inGlyph(x, y)) fg++;
          else bg++;
        }
      }
      const total = samples * samples;
      const alpha = (bg + fg) / total;
      const o = py * (size * 4 + 1) + 1 + px * 4;
      for (let c = 0; c < 3; c++)
        raw[o + c] = alpha ? Math.round((BG[c] * bg + FG[c] * fg) / (bg + fg)) : 0;
      raw[o + 3] = Math.round(alpha * 255);
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
  else for (let i = 0; i < args.length; i += 2) writeFileSync(args[i], png(Number(args[i + 1])));
}
