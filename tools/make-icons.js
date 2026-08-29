// Generates the extension icons from scratch — a rounded square with a "K" on it.
// Written by hand (no image library) so the repo stays dependency-free: anyone who
// clones it can regenerate the icons with plain `node tools/make-icons.js`.
// Replace icons/*.png with a real logo whenever there is one.

const fs   = require('fs');
const zlib = require('zlib');

const BG = [30, 58, 138];    // deep indigo
const FG = [255, 255, 255];  // white K

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  let t = lengthSquared ? ((px - x1) * dx + (py - y1) * dy) / lengthSquared : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function drawIcon(size) {
  const pad       = size * 0.20;
  const radius    = size * 0.22;
  const thickness = size * 0.085;
  const stemX     = pad + thickness;
  const midY      = size / 2;
  const rows      = [];

  for (let y = 0; y < size; y++) {
    const row = [0];  // PNG filter byte: 0 = none
    for (let x = 0; x < size; x++) {
      const cx = x + 0.5, cy = y + 0.5;

      // Rounded-square background: only the four corners need a circle test.
      const nx = Math.max(radius - cx, cx - (size - radius), 0);
      const ny = Math.max(radius - cy, cy - (size - radius), 0);
      if (Math.hypot(nx, ny) > radius) { row.push(0, 0, 0, 0); continue; }

      const onStem  = cx >= pad && cx <= stemX && cy >= pad && cy <= size - pad;
      const onUpper = distanceToSegment(cx, cy, stemX, midY, size - pad, pad) <= thickness / 2;
      const onLower = distanceToSegment(cx, cy, stemX, midY, size - pad, size - pad) <= thickness / 2;
      const ink     = onStem || onUpper || onLower ? FG : BG;
      row.push(ink[0], ink[1], ink[2], 255);
    }
    rows.push(Buffer.from(row));
  }
  return Buffer.concat(rows);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc  = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

function writePng(size, path) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;   // 8 bits per channel
  header[9] = 6;   // RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(drawIcon(size), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(path, png);
  console.log(`wrote ${path} (${size}x${size}, ${png.length} bytes)`);
}

for (const size of [16, 48, 128, 300]) writePng(size, `${__dirname}/../icons/icon${size}.png`);
