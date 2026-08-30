// The release rules for Kartaan Click, written as a program so nobody has to
// remember them. Run by the pre-commit hook on every commit and by GitHub on
// every push — a commit that breaks a rule is refused, not merely complained at.
//
//   node tools/check.js            — the everyday rules
//   node tools/check.js --release  — the everyday rules plus the stricter ones
//                                    that only matter when packaging for a store
//
// Every rule here exists because something actually went wrong once. Do not
// delete one to make a commit pass; fix the thing it is pointing at, or change
// the rule deliberately and say why in the commit.

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFileSync } = require('child_process');

const root    = path.join(__dirname, '..');
const release = process.argv.includes('--release');
const read    = f => fs.readFileSync(path.join(root, f), 'utf8');
const exists  = f => fs.existsSync(path.join(root, f));

const failures = [];
const warnings = [];
const fail = (rule, detail) => failures.push({ rule, detail });
const warn = (rule, detail) => warnings.push({ rule, detail });

const manifest = JSON.parse(read('manifest.json'));

// Which files does the manifest actually point at? Everything here must exist,
// must be packaged, and must end up at the right path inside the ZIP.
function manifestFiles() {
  const out = [];
  if (manifest.background && manifest.background.service_worker) out.push(manifest.background.service_worker);
  for (const cs of manifest.content_scripts || []) for (const js of cs.js || []) out.push(js);
  if (manifest.action && manifest.action.default_popup) out.push(manifest.action.default_popup);
  for (const set of [manifest.icons, manifest.action && manifest.action.default_icon]) {
    for (const k of Object.keys(set || {})) out.push(set[k]);
  }
  // A popup is a real page: whatever it loads has to ship with it. This is the
  // rule that popup.js would have failed.
  if (manifest.action && manifest.action.default_popup && exists(manifest.action.default_popup)) {
    const html = read(manifest.action.default_popup);
    for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)) out.push(m[1]);
  }
  return [...new Set(out)];
}

// ── 1. Everything the manifest points at exists ─────────────────────────────
const referenced = manifestFiles();
for (const f of referenced) {
  if (!exists(f)) fail('missing file', `manifest.json points at "${f}" but it is not on disk`);
}

// ── 2. ...and is in the list of files that get packaged ─────────────────────
// WHY: background.js and popup.js were each added to the extension and forgotten
// in the packaging list. The ZIP would have installed with a dead popup.
const zipSrc  = read('tools/make-zip.js');
const include = (zipSrc.match(/const include = \[([\s\S]*?)\];/) || [, ''])[1]
  .split('\n').map(l => (l.match(/'([^']+)'/) || [, ''])[1]).filter(Boolean);

const packaged = f => include.some(inc => f === inc || f.startsWith(inc.replace(/\/$/, '') + '/'));
for (const f of referenced) {
  if (!packaged(f)) fail('not packaged', `"${f}" is used by the extension but tools/make-zip.js would leave it out`);
}

// ── 3. The built ZIP really does contain them, at the right path ────────────
// WHY: handing Compress-Archive a list of file paths silently flattens them, so
// icons/icon16.png landed in the archive as icon16.png and every package built
// before 29 Aug 2026 was missing the icons the manifest points at. Checking the
// include list alone would NOT have caught that — only opening the ZIP does.
if (!failures.length) {
  const tmp = path.join(os.tmpdir(), `kc-check-${Date.now()}.zip`);
  try {
    execFileSync(process.execPath, [path.join(root, 'tools', 'make-zip.js')], { stdio: 'ignore' });
    const built = path.join(root, `kartaan-click-${manifest.version}.zip`);
    fs.copyFileSync(built, tmp);
    const listed = execFileSync('powershell', ['-NoProfile', '-Command',
      'Add-Type -A System.IO.Compression.FileSystem; ' +
      `[IO.Compression.ZipFile]::OpenRead('${tmp.replace(/'/g, "''")}').Entries | ForEach-Object { $_.FullName }`,
    ], { encoding: 'utf8' }).split(/\r?\n/).map(s => s.trim().replace(/\\/g, '/')).filter(Boolean);

    for (const f of referenced) {
      if (!listed.includes(f)) {
        fail('missing from the ZIP', `"${f}" is not in the built package at that path (found: ${listed.join(', ')})`);
      }
    }
  } catch (e) {
    warn('could not open the ZIP', `the package could not be built or read, so its contents were not checked — ${e.message}`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// ── 4. The documents must not claim less than the extension does ────────────
// WHY: PRIVACY.md, STORE-LISTING.md and README.md each said the extension asked
// for no permissions and contacted no server. Both stopped being true, on
// different days, and the sentences sat there wrong. The Edge review reads them.
//
// This rule is deliberately blunt: it bans the PHRASES outright rather than
// trying to work out what each sentence refers to. If it stops a sentence that
// was only ever about one small part, reword that sentence to say so plainly —
// a reviewer skim-reading it could have made the same mistake the rule did.
const DOCS = ['PRIVACY.md', 'STORE-LISTING.md', 'README.md'];
const STALE = [
  [/requests? no (special )?(browser )?permissions/i, 'says it requests no permissions'],
  [/no permissions at all/i,                          'says it requests no permissions'],
  [/(contacts?|talks to) no server/i,                 'says it contacts no server'],
  [/no network calls/i,                               'says it makes no network calls'],
  [/\bsends nothing\b/i,                              'says it sends nothing'],
];

const perms     = manifest.permissions || [];
const hostPerms = manifest.host_permissions || [];
const anyPerms  = perms.length > 0 || hostPerms.length > 0;

for (const doc of DOCS) {
  if (!exists(doc)) continue;
  const text = read(doc);
  for (const [re, what] of STALE) {
    if (anyPerms && re.test(text)) {
      fail('the documents contradict the manifest',
        `${doc} ${what}, but manifest.json asks for ${[...perms, ...hostPerms].join(', ')}`);
    }
  }
}

// ── 5. Every permission must be explained where a reviewer will look ────────
for (const p of perms) {
  for (const doc of ['PRIVACY.md', 'STORE-LISTING.md']) {
    if (exists(doc) && !read(doc).includes(p)) {
      fail('permission not explained', `manifest.json asks for "${p}" but ${doc} never mentions it`);
    }
  }
}
for (const h of hostPerms) {
  const host = h.replace(/^https?:\/\//, '').replace(/\/\*$/, '').replace(/^\*\./, '');
  for (const doc of ['PRIVACY.md', 'STORE-LISTING.md']) {
    if (exists(doc) && !read(doc).includes(host)) {
      fail('permission not explained', `manifest.json allows access to "${host}" but ${doc} never mentions it`);
    }
  }
}

// ── 6. Any server the code talks to must be named in the privacy policy ─────
const shipped = referenced.filter(f => f.endsWith('.js'));
for (const f of shipped) {
  const src = read(f);
  for (const m of src.matchAll(/fetch\(\s*['"`](https?:\/\/[^'"`\/]+)/g)) {
    const host = m[1].replace(/^https?:\/\//, '');
    if (!read('PRIVACY.md').includes(host)) {
      fail('undisclosed server', `${f} contacts ${host}, which PRIVACY.md does not mention`);
    }
  }
  for (const m of src.matchAll(/fetch\(\s*([A-Z_]{3,})\b/g)) {
    const decl = new RegExp(`${m[1]}\\s*=\\s*['"\`](https?://[^'"\`/]+)`).exec(src);
    if (decl) {
      const host = decl[1].replace(/^https?:\/\//, '');
      if (!read('PRIVACY.md').includes(host)) {
        fail('undisclosed server', `${f} contacts ${host}, which PRIVACY.md does not mention`);
      }
    }
  }
}

// ── 7. No secrets, ever (Golden Rule 8) ─────────────────────────────────────
const SECRET = [
  [/ghp_[A-Za-z0-9]{20,}/,             'a GitHub token'],
  [/AIzaSy[A-Za-z0-9_-]{20,}/,         'a Google API key'],
  [/discord(app)?\.com\/api\/webhooks/, 'a Discord webhook'],
  [/"private_key"\s*:/,                'a credentials file'],
  [/"client_secret"\s*:/,              'a client secret'],
];
for (const f of [...shipped, 'manifest.json', 'popup.html']) {
  if (!exists(f)) continue;
  const src = read(f);
  for (const [re, what] of SECRET) {
    if (re.test(src)) fail('secret in the code', `${f} appears to contain ${what}`);
  }
}

// ── 8. Temporary diagnostics must not reach a store ─────────────────────────
// Allowed day to day — that is the whole point of a diagnostic — but never in
// something submitted for review.
for (const f of shipped) {
  for (const m of read(f).matchAll(/const\s+([A-Z_]*(?:TEST|DEBUG|DRY_RUN)[A-Z_]*)\s*=\s*true/g)) {
    const msg = `${f} still has ${m[1]} switched on`;
    if (release) fail('diagnostic left on', msg);
    else warn('diagnostic left on', `${msg} — fine for now, but it must be off before submitting`);
  }
}

// ── 9. The submission notes must match the version being built ──────────────
if (exists('STORE-LISTING.md') && !read('STORE-LISTING.md').includes(`kartaan-click-${manifest.version}.zip`)) {
  fail('stale submission notes',
    `manifest.json is version ${manifest.version} but STORE-LISTING.md still names a different ZIP`);
}

// ── report ──────────────────────────────────────────────────────────────────
for (const w of warnings) console.log(`  note: ${w.rule} — ${w.detail}`);

if (failures.length) {
  console.error(`\nThis change breaks ${failures.length} of the release rules:\n`);
  for (const f of failures) console.error(`  ✗ ${f.rule}\n    ${f.detail}\n`);
  console.error('Fix these and commit again. The rules live in tools/check.js.\n');
  process.exit(1);
}

console.log(`release rules: all passed${release ? ' (including the stricter release-only ones)' : ''}`);
