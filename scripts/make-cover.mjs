import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function inHex(x, y, cx, cy, r) {
  const dx = Math.abs(x - cx);
  const dy = Math.abs(y - cy);
  return dy <= r * 0.866 && dx <= r && r * 0.866 - dy >= dx * 0.5;
}

function star(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  const f = n - Math.floor(n);
  return f > 0.997;
}

function paint(x, y, w, h) {
  const cx = w / 2;
  const cy = h * 0.46;
  const r = Math.min(w, h) * 0.32;
  if (inHex(x, y, cx, cy, r)) {
    if (!inHex(x, y, cx, cy, r - Math.min(w, h) * 0.028)) {
      return [125, 216, 232, 255];
    }
    const nx = (x - cx) / r;
    const ny = (y - cy) / r;
    const inBar = nx > -0.28 && nx < 0.3 && ny > -0.36 && ny < 0.36;
    const inE =
      inBar &&
      (nx < -0.12 ||
        (ny > -0.36 && ny < -0.2) ||
        (ny > -0.08 && ny < 0.08) ||
        (ny > 0.2 && ny < 0.36));
    if (inE) {
      return [232, 244, 255, 255];
    }
    return [18, 36, 64, 255];
  }
  if (star(x, y)) {
    return [180, 198, 230, 255];
  }
  return [10, 12, 22, 255];
}

function encodePng(w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = paint(x, y, w, h);
      const o = row + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dest = resolve('yandex/cover-800x470.png');
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, encodePng(800, 470));
console.log(dest);
