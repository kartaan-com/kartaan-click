// Packages the extension for install and for the Edge store: only the files the
// browser actually loads, with manifest.json at the top level of the archive,
// which is what "Load unpacked" and the store both expect.
// Run: node tools/make-zip.js

const fs   = require('fs');
const path = require('path');
const { createZip, listZip } = require('./zip');

const root    = path.join(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).version;
const out     = path.join(root, `kartaan-click-${version}.zip`);

// Deliberately excludes tools/, STORE-LISTING.md and icons/icon300.png — build
// scripts, submission notes and the store artwork are not part of what ships.
const include = [
  'manifest.json',
  'popup.html',
  'popup.js',
  'background.js',
  'content',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png',
  'README.md',
  'MANUAL.md',
  'CHANGELOG.md',
  'PRIVACY.md',
  'LICENSE',
];

fs.rmSync(out, { force: true });
createZip(root, include, out);

// Read the archive back the way an unzip tool would, rather than trusting the
// write. TWO packaging bugs have already shipped from this file — folders
// flattened into the root, then folders written with backslashes — and both
// looked fine until somebody actually opened the archive. So now it opens it.
const names = listZip(out);
const problems = [];
for (const n of names) {
  if (n.includes('\\')) problems.push(`"${n}" uses a backslash; archive paths must use "/"`);
}
for (const need of ['manifest.json', 'icons/icon16.png', 'content/vms-awb.js']) {
  if (!names.includes(need)) problems.push(`"${need}" is not in the archive at that path`);
}
if (problems.length) {
  fs.rmSync(out, { force: true });
  console.error('the package came out wrong, so it has been deleted:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}

console.log(`built ${out} (${(fs.statSync(out).size / 1024).toFixed(1)} KB, ${names.length} files)`);
