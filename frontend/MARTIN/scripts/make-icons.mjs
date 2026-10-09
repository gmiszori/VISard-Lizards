// Generates the PNG app icons without any image dependency.
// Design: tomato square, paper plate ring with a solid centre.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const TOMATO = [0xe5, 0x44, 0x1d];
const PAPER = [0xf3, 0xef, 0xe6];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function png(size, scale) {
  // scale < 1 shrinks the artwork inside the square (maskable safe zone)
  const SS = 3;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const cx = size / 2;
  const outer = size * 0.34 * scale;
  const ring = size * 0.065 * scale;
  const inner = size * 0.17 * scale;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let paper = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const d = Math.hypot(x + (sx + 0.5) / SS - cx, y + (sy + 0.5) / SS - cx);
          const inRing = d <= outer && d >= outer - ring;
          const inCore = d <= inner;
          if (inRing || inCore) paper++;
        }
      const t = paper / (SS * SS);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(TOMATO[c] * (1 - t) + PAPER[c] * t);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', png(192, 1));
writeFileSync('public/icons/icon-512.png', png(512, 1));
writeFileSync('public/icons/icon-maskable-512.png', png(512, 0.78));
writeFileSync('public/apple-touch-icon.png', png(180, 1));
console.log('icons written');
