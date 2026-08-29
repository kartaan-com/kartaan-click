// Packages the extension for install and for the Edge store: only the files
// Chrome actually loads, with manifest.json at the top level of the archive,
// which is what "Load unpacked" and the store both expect.
// Run: node tools/make-zip.js

const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const root    = path.join(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).version;
const out     = path.join(root, `kartaan-click-${version}.zip`);

// Deliberately excludes tools/, STORE-LISTING.md and icons/icon300.png — build
// scripts, submission notes and the store artwork are not part of what ships.
const include = [
  'manifest.json',
  'popup.html',
  'background.js',
  'content',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png',
  'README.md',
  'PRIVACY.md',
  'LICENSE',
];

fs.rmSync(out, { force: true });

// Everything is copied into a staging folder first, then that folder's contents
// are zipped. Handing Compress-Archive the file paths directly looks like it
// works but flattens them — `icons/icon16.png` landed in the archive as
// `icon16.png`, so the icons the manifest points at were missing from every
// package built before 29 August 2026.
const stage = fs.mkdtempSync(path.join(require('os').tmpdir(), 'kartaan-click-'));
for (const rel of include) {
  const from = path.join(root, rel);
  const to   = path.join(stage, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

// Compress-Archive is built into Windows; no dependency to install.
execFileSync('powershell', [
  '-NoProfile', '-Command',
  `Compress-Archive -Path '${path.join(stage, '*').replace(/'/g, "''")}' `
  + `-DestinationPath '${out.replace(/'/g, "''")}' -Force`,
], { stdio: 'inherit' });

fs.rmSync(stage, { recursive: true, force: true });

// Prove the manifest's own icon paths survived, rather than trusting the above.
for (const rel of ['manifest.json', 'background.js', 'icons/icon16.png']) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error(`missing before packaging: ${rel}`);
}

console.log(`built ${out} (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`);
