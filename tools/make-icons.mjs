// Generates icons/icon{16,32,48,128}.png — a white bookmark on a indigo gradient tile.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'icons');
mkdirSync(outDir, { recursive: true });

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const mix = (a, b, t) => a + (b - a) * t;

function insideRoundRect(x, y, radius) {
  const cx = Math.min(Math.max(x, radius), 1 - radius);
  const cy = Math.min(Math.max(y, radius), 1 - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

const BX0 = 0.335;
const BX1 = 0.665;
const BY0 = 0.235;
const BY1 = 0.775;
const BR = 0.045;
const NOTCH_HALF = 0.155;
const NOTCH_DEPTH = 0.135;

function insideBookmark(x, y) {
  if (x < BX0 || x > BX1 || y < BY0) return false;
  if (y < BY0 + BR) {
    if (x < BX0 + BR && (x - (BX0 + BR)) ** 2 + (y - (BY0 + BR)) ** 2 > BR ** 2) return false;
    if (x > BX1 - BR && (x - (BX1 - BR)) ** 2 + (y - (BY0 + BR)) ** 2 > BR ** 2) return false;
  }
  const dx = Math.abs(x - 0.5);
  let bottom = BY1;
  if (dx < NOTCH_HALF) bottom -= (1 - dx / NOTCH_HALF) * NOTCH_DEPTH;
  return y <= bottom;
}

function sample(x, y) {
  if (!insideRoundRect(x, y, 0.225)) return [0, 0, 0, 0];

  const t = clamp01((x * 0.5 + y * 0.5 - 0.06) / 0.88);
  let r = mix(0x6f, 0x3c, t);
  let g = mix(0x8b, 0x55, t);
  let b = mix(0xff, 0xd8, t);

  const glow = Math.max(0, 1 - Math.hypot(x - 0.26, y - 0.16) / 0.7) ** 2 * 0.16;
  r = mix(r, 255, glow);
  g = mix(g, 255, glow);
  b = mix(b, 255, glow);

  if (insideBookmark(x, y)) return [255, 255, 255, 255];
  return [r, g, b, 255];
}

function render(size) {
  const ss = 4;
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const [sr, sg, sb, sa] = sample((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
          r += sr * sa;
          g += sg * sa;
          b += sb * sa;
          a += sa;
        }
      }
      const index = (y * size + x) * 4;
      if (a > 0) {
        out[index] = Math.round(r / a);
        out[index + 1] = Math.round(g / a);
        out[index + 2] = Math.round(b / a);
      }
      out[index + 3] = Math.round(a / (ss * ss));
    }
  }
  return out;
}

for (const size of [16, 32, 48, 128]) {
  const file = join(outDir, `icon${size}.png`);
  writeFileSync(file, encodePng(size, render(size)));
  console.log('wrote', file);
}
