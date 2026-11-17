// Makes build-stamp.json for a folder: the version, an id, and the SHA-256 of every packaged file
// (the one list in make-zip.js). self-reload.js checks a copy against it. Run: node tools/make-stamp.js <folder>
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

// Files in the packaged list (folders expanded). The list is read from make-zip.js, never copied.
function packagedFiles(root) {
  const src = fs.readFileSync(path.join(root, 'tools', 'make-zip.js'), 'utf8');
  const include = (src.match(/const include = \[([\s\S]*?)\];/) || [, ''])[1].split('\n').map(l => (l.match(/'([^']+)'/) || [, ''])[1]).filter(Boolean);
  const out = [];
  const walk = rel => fs.statSync(path.join(root, rel)).isDirectory() ? fs.readdirSync(path.join(root, rel)).forEach(n => walk(rel + '/' + n)) : out.push(rel);
  include.forEach(walk);
  return out.sort();
}
const sha = (dir, rel) => crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, rel))).digest('hex');

// The stamp of the files `names` as they are in `dir`.
function makeStamp(dir, names) {
  const files = {};
  for (const n of names) files[n] = sha(dir, n);
  const version = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).version;
  const id = crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex');
  return { version, id, files };
}

module.exports = { packagedFiles, makeStamp };
if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) { console.error('usage: node tools/make-stamp.js <folder>'); process.exit(1); }
  const s = makeStamp(dir, packagedFiles(path.join(__dirname, '..')));
  fs.writeFileSync(path.join(dir, 'build-stamp.json'), JSON.stringify(s, null, 1));
  console.log(`stamp written: version ${s.version}, ${Object.keys(s.files).length} files`);
}
