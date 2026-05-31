const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;
const R = 108, G = 92, B = 231;

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const raw = Buffer.concat([t, data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(raw));
  return Buffer.concat([len, t, data, c]);
}

const raw = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    const cx = x - SIZE / 2 + 0.5;
    const cy = y - SIZE / 2 + 0.5;
    const dist = Math.sqrt(cx * cx + cy * cy);
    const maxR = SIZE * 0.42;
    if (dist < maxR) {
      const alpha = Math.max(0, Math.min(255, Math.round((1 - dist / maxR) * 255)));
      raw[i] = R + (255 - R) * (1 - alpha / 255);
      raw[i + 1] = G + (255 - G) * (1 - alpha / 255);
      raw[i + 2] = B + (255 - B) * (1 - alpha / 255);
      raw[i + 3] = alpha;
    }
  }
}

const filtered = Buffer.alloc(SIZE * SIZE * 4 + SIZE);
for (let y = 0; y < SIZE; y++) {
  filtered[y * (SIZE * 4 + 1)] = 0;
  raw.copy(filtered, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(filtered)),
  chunk('IEND', Buffer.alloc(0)),
]);

const outPath = path.join(__dirname, '..', 'build', 'icon.png');
fs.writeFileSync(outPath, png);
console.log('Icon generated: ' + outPath + ' (' + (png.length / 1024).toFixed(1) + ' KB)');
