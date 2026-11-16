// Makes the TEST icons for the C2-0 probe copy: Click's own icon with a red band
// and a white "T" across the bottom, so it is never mistaken for the real Click.
// Plain node, no image library: node tools/make-probe-icons.js
'use strict';
const fs = require('fs'), zlib = require('zlib');
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = b => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(body)); return Buffer.concat([l, body, c]); };
function readPng(file) {
  const b = fs.readFileSync(file); let p = 8, idat = [], w, h;
  while (p < b.length) { const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); if (d[8] !== 8 || d[9] !== 6) throw new Error('need 8-bit RGBA'); }
    if (type === 'IDAT') idat.push(d); p += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) { if (raw[y * (w * 4 + 1)] !== 0) throw new Error('need filter 0'); raw.copy(px, y * w * 4, y * (w * 4 + 1) + 1, (y + 1) * (w * 4 + 1)); }
  return { w, h, px };
}
for (const s of [16, 48, 128]) {
  const { w, h, px } = readPng(`icons/icon${s}.png`);
  const top = Math.floor(h * 0.62);
  for (let y = top; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; if (px[i + 3] === 0) continue;
    px[i] = 200; px[i + 1] = 30; px[i + 2] = 30;
    const bandH = h - top, cx = w / 2, bar = Math.max(1, Math.round(bandH * 0.18));
    const inBar = y >= top + bandH * 0.18 && y < top + bandH * 0.18 + bar && Math.abs(x + 0.5 - cx) <= bandH * 0.4;
    const inStem = y >= top + bandH * 0.18 && y < h - bandH * 0.12 && Math.abs(x + 0.5 - cx) <= bar / 2;
    if (inBar || inStem) { px[i] = px[i + 1] = px[i + 2] = 255; }
  }
  const rows = []; for (let y = 0; y < h; y++) rows.push(Buffer.concat([Buffer.from([0]), px.subarray(y * w * 4, (y + 1) * w * 4)]));
  const hd = Buffer.alloc(13); hd.writeUInt32BE(w, 0); hd.writeUInt32BE(h, 4); hd[8] = 8; hd[9] = 6;
  fs.writeFileSync(`c2-probe/icons/icon${s}.png`, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', hd), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]));
}
console.log('probe icons written');
