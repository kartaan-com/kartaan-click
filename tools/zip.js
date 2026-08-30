// A small, correct ZIP writer and reader. No dependencies.
//
// WHY THIS EXISTS: packaging used Windows' built-in Compress-Archive, which
// writes paths with BACKSLASHES. The ZIP format requires forward slashes
// (APPNOTE 4.4.17.1: "All slashes MUST be forward slashes '/' as opposed to
// backwards slashes"). Windows Explorer quietly tolerates its own output, so the
// package looked fine — but any other unzip tool reads "content\fk-orders.js" as
// a FILE NAME containing a backslash rather than a folder, and the extension
// will not load. That was shipping in a public download.
//
// Writing it here also means the release checks no longer need PowerShell, so
// they run anywhere.

'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// MS-DOS date/time, which is what the format stores.
function dosTime(d) {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}

// Walks a folder, or returns the single file, as { name, full } pairs where
// `name` is always the archive path with forward slashes.
function collect(root, rel) {
  const full = path.join(root, rel);
  const st   = fs.statSync(full);
  if (!st.isDirectory()) return [{ name: rel.split(path.sep).join('/'), full }];
  const out = [];
  for (const child of fs.readdirSync(full)) out.push(...collect(root, path.join(rel, child)));
  return out;
}

function createZip(root, includes, outPath) {
  const entries = [];
  for (const inc of includes) entries.push(...collect(root, inc));

  const chunks  = [];
  const central = [];
  let offset = 0;

  for (const e of entries) {
    const data  = fs.readFileSync(e.full);
    const name  = Buffer.from(e.name, 'utf8');
    if (name.includes(0x5c)) throw new Error(`refusing to write a backslash into an archive path: ${e.name}`);
    const comp  = zlib.deflateRawSync(data, { level: 9 });
    const crc   = crc32(data);
    const { time, date } = dosTime(fs.statSync(e.full).mtime);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);   // local file header
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0, 6);            // flags
    local.writeUInt16LE(8, 8);            // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);           // no extra field

    chunks.push(local, name, comp);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);      // central directory entry
    cd.writeUInt16LE(20, 4);              // version made by
    cd.writeUInt16LE(20, 6);              // version needed
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt16LE(0, 30);              // extra
    cd.writeUInt16LE(0, 32);              // comment
    cd.writeUInt16LE(0, 34);              // disk
    cd.writeUInt16LE(0, 36);              // internal attributes
    cd.writeUInt32LE(0, 38);              // external attributes
    cd.writeUInt32LE(offset, 42);         // where its local header is
    central.push(cd, name);

    offset += local.length + name.length + comp.length;
  }

  const cdBuf = Buffer.concat(central);
  const end   = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);       // end of central directory
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  fs.writeFileSync(outPath, Buffer.concat([...chunks, cdBuf, end]));
  return entries.map(e => e.name);
}

// Reads the names back out of a built archive, by walking its central directory
// — which is how an unzip tool reads it, so this checks what they will see.
function listZip(zipPath) {
  const buf = fs.readFileSync(zipPath);
  let end = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('not a zip file — no end-of-central-directory record');

  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const names = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('corrupt central directory');
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    names.push(buf.toString('utf8', p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

module.exports = { createZip, listZip, crc32 };
