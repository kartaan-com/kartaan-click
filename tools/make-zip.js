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
  'content',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png',
  'README.md',
  'PRIVACY.md',
  'LICENSE',
];

fs.rmSync(out, { force: true });

// Compress-Archive is built into Windows; no dependency to install.
const list = include.map(f => `'${path.join(root, f).replace(/'/g, "''")}'`).join(',');
execFileSync('powershell', [
  '-NoProfile', '-Command',
  `Compress-Archive -Path ${list} -DestinationPath '${out.replace(/'/g, "''")}' -Force`,
], { stdio: 'inherit' });

console.log(`built ${out} (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`);
