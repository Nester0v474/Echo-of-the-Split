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

function paint(x, y, w) {
  const cx = w / 2;
  const cy = w / 2;
  const r = w * 0.4;
  if (inHex(x, y, cx, cy, r)) {
    if (!inHex(x, y, cx, cy, r - w * 0.045)) {
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
  return [10, 12, 22, 255];
}

function encodePng(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x, y, size);
      const o = row + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [256, 512]) {
  const dest = resolve(`yandex/icon-${size}.png`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, encodePng(size));
  console.log(dest);
}
