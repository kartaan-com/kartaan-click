// Prepares a release. Run: node tools/release.js
//
// The download link on kartaan.com and in the README points at
//   .../releases/latest/download/kartaan-click.zip
// which only keeps working if the uploaded file is called exactly that, every
// time. So the release copy has a fixed name, while the local build keeps its
// version in the filename for your own sanity.

'use strict';

const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root     = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const tag      = `v${manifest.version}`;
const asset    = path.join(root, 'kartaan-click.zip');   // the fixed name the link needs

// The rules first — including the stricter release-only ones. A release that
// breaks them does not get built.
execFileSync(process.execPath, [path.join(__dirname, 'check.js'), '--release'], { stdio: 'inherit' });
execFileSync(process.execPath, [path.join(__dirname, 'make-zip.js')], { stdio: 'inherit' });

fs.copyFileSync(path.join(root, `kartaan-click-${manifest.version}.zip`), asset);
console.log(`\nrelease copy ready: ${asset}`);

console.log(`
Now, in order:

  1. gh release create ${tag} "${asset}" --title "${tag}" --notes-file CHANGELOG.md

  2. Update the version file on kartaan.com so existing users are told:
       https://kartaan.com/kartaan-click/version.json
       { "version": "${manifest.version}",
         "url": "https://github.com/kartaan-com/kartaan-click/releases/latest/download/kartaan-click.zip",
         "notes": "<the one-line summary from CHANGELOG.md>" }

  3. Check the link actually serves the new file:
       https://github.com/kartaan-com/kartaan-click/releases/latest/download/kartaan-click.zip
`);
