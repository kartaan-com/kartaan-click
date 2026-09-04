// Copies the extension straight into the folder Jaiswal has loaded as an unpacked
// extension, so testing a change is: run this, press the reload arrow. No ZIP, no
// unzipping over the top, no chance of testing yesterday's build by mistake.
//
//   node tools/deploy-local.js
//
// The folder is read from `.local-test-folder` in the repository root — one line,
// the full path. That file is NOT committed: this repository is public, and the
// path contains a Windows username.
//
// It copies exactly the files that get packaged, from the one list in make-zip.js,
// so what he loads is what would ship. Nothing else in the target folder is
// touched, and nothing is deleted.

'use strict';

const fs   = require('fs');
const path = require('path');

const root    = path.join(__dirname, '..');
const cfgFile = path.join(root, '.local-test-folder');

if (!fs.existsSync(cfgFile)) {
  console.error('No .local-test-folder file. Put the full path of the unpacked-extension');
  console.error('folder in it, on one line. It is deliberately not committed.');
  process.exit(1);
}

const target = fs.readFileSync(cfgFile, 'utf8').trim().replace(/^["']|["']$/g, '');
if (!target || !fs.existsSync(target)) {
  console.error(`The folder in .local-test-folder does not exist:\n  ${target}`);
  process.exit(1);
}

// The same list make-zip.js packages from, read from that file rather than copied
// here — two lists would drift, and the one that drifted would be this one.
const zipSrc = fs.readFileSync(path.join(root, 'tools', 'make-zip.js'), 'utf8');
const include = (zipSrc.match(/const include = \[([\s\S]*?)\];/) || [, ''])[1]
  .split('\n').map(l => (l.match(/'([^']+)'/) || [, ''])[1]).filter(Boolean);

let files = 0;
function copy(rel) {
  const from = path.join(root, rel);
  if (!fs.existsSync(from)) return;
  if (fs.statSync(from).isDirectory()) {
    for (const name of fs.readdirSync(from)) copy(path.join(rel, name));
    return;
  }
  const to = path.join(target, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  files += 1;
}

for (const rel of include) copy(rel);

const version = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).version;
console.log(`copied ${files} files of version ${version} into:\n  ${target}`);
console.log('Now press the reload arrow on Kartaan Click at chrome://extensions.');
