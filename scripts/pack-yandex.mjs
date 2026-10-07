import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const root = resolve('.');
const dist = resolve(root, 'dist');
const zipPath = resolve(root, 'echo-raskola-yandex.zip');

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

function walk(dir, skip) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) {
      continue;
    }
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full, skip));
    } else {
      out.push(full);
    }
  }
  return out;
}

function zipFiles(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name.replace(/\\/g, '/'), 'utf8');
    const compressed = deflateRawSync(file.data);
    const crc = crc32(file.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);

    locals.push(local, name, compressed);
    centrals.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralStart = offset;
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(centralStart, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const bundled = new Set(
  [...html.matchAll(/assets\/index-[^"'\\s]+\.js/g)].map((m) => m[0].replace(/\\/g, '/')),
);

const files = walk(dist, new Set(['sdk.js']))
  .map((full) => ({
    name: relative(dist, full).replace(/\\/g, '/'),
    data: readFileSync(full),
  }))
  .filter((file) => {
    if (file.name.endsWith('.js') && file.name.startsWith('assets/')) {
      return bundled.has(file.name);
    }
    return true;
  });

if (!files.some((f) => f.name === 'index.html' || f.name === 'index.HTML')) {
  throw new Error('index.html must be at the zip root');
}

rmSync(zipPath, { force: true });
writeFileSync(zipPath, zipFiles(files));
const bytes = statSync(zipPath).size;
console.log(files.map((f) => f.name).join('\n'));
console.log(`zip ${zipPath}`);
console.log(`files ${files.length}`);
console.log(`bytes ${bytes}`);
console.log(`mb ${(bytes / 1024 / 1024).toFixed(2)}`);
