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

// ⚠️ WHAT IS ON GITHUB IS WHAT GETS TAGGED. `gh release create` puts the tag on
// the branch as GitHub has it, not on the files sitting here — so a version bump
// that has not been pushed produces a release tagged at the version BEFORE it,
// pointing at code nobody can read, while the ZIP beside it holds the new build.
// The two would disagree for ever and nothing would say so. Refuse instead.
// ⚠️ A GUARD THAT CANNOT RUN MUST SAY SO, NOT PASS. Swallowing every failure into
// `null` meant a missing or broken git turned BOTH guards off silently, and the
// only thing printed blamed a missing upstream — the wrong cause entirely.
const git = args => {
  try {
    return { ok: true, out: execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim() };
  } catch (e) {
    return { ok: false, out: '' };
  }
};

const status = git(['status', '--porcelain']);
if (!status.ok) {
  console.error('\nNOT RELEASING — git could not be run here, so nothing can confirm that');
  console.error('what is about to be tagged is what is on GitHub. Fix git, or tag by hand.');
  process.exit(1);
}

// ⚠️ version.json IS WRITTEN BY THIS SCRIPT, so it is untracked or modified every
// single time it runs — and after a release that failed part way, the re-run would
// stop on its own output and walk you into "commit it, push it", which announces a
// version whose release does not exist yet. That is the one thing this file warns
// about, so it must not be the thing the guard causes. Ignore it here; step 3
// below is where it is committed, deliberately and last.
// ⚠️ BUT IGNORING IT OUTRIGHT SWITCHES OFF THE ONLY ALARM FOR THE VERY FAILURE
// THIS RELEASE EXISTS TO FIX. Step 3 below is done by hand, so it can be skipped —
// and then nothing notices, because the one check that would see the file left
// behind has been told to look away. Miss it twice and the update notice is dead
// again with every guard showing green.
//
// The two cases tell themselves apart: a file left over from THIS release names
// the version being packaged; one left over from a PREVIOUS release names an older
// one, which means that release was never announced. Refuse on the second.
const versionFilePath = path.join(root, 'version.json');
const leftover = status.out.split('\n').some(l => /\sversion\.json$/.test(l));
if (leftover && fs.existsSync(versionFilePath)) {
  let announced = null;
  try { announced = JSON.parse(fs.readFileSync(versionFilePath, 'utf8')).version; } catch (e) {}
  if (announced && announced !== manifest.version) {
    console.error(`\nNOT RELEASING — version.json still says ${announced} and has never been`);
    console.error('committed, which means that release was built but never announced. Nobody');
    console.error('was told about it. Sort that out before stacking another release on top:\n');
    console.error(`  git add version.json && git commit -m "Announce ${announced}" && git push\n`);
    console.error('(Only do that if the ' + announced + ' release actually exists on GitHub.)');
    process.exit(1);
  }
}

const dirty = status.out.split('\n')
  .filter(l => l.trim() && !/\sversion\.json$/.test(l));
if (dirty.length) {
  console.error('\nNOT RELEASING — there are changes that have not been committed:\n');
  console.error(dirty.map(l => '  ' + l).join('\n'));
  console.error('\nCommit them first. The tag would otherwise point at code that is not here.');
  process.exit(1);
}

// Ask GitHub what it actually has. Without this the comparison is against whatever
// this machine last heard, which can be days old — and `gh` tags GitHub's tip, not
// this machine's idea of it.
// ⚠️ AND THESE TWO REFUSE RATHER THAN PRINT A NOTE. Both used to say something and
// carry on, directly under the rule above saying a guard that cannot run must not
// pass — and the note blamed a missing upstream whatever the real cause was, which
// is the same wrong-cause bug that rule was written about. A detached HEAD, a
// pruned tracking ref or an unreachable network each land here for different
// reasons, and none of them means "carry on".
if (!git(['fetch', '--quiet']).ok) {
  console.error('\nNOT RELEASING — could not reach GitHub to compare what it has with what');
  console.error('is here. A release cannot be created offline anyway, so this is not the');
  console.error('moment to guess. Check the network, or the remote, and run this again.');
  process.exit(1);
}

const counts = git(['rev-list', '--left-right', '--count', '@{upstream}...HEAD']);
if (!counts.ok) {
  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  const branch   = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  console.error('\nNOT RELEASING — cannot tell whether what is here has been pushed.');
  console.error(!upstream.ok
    ? `  This branch (${branch.ok ? branch.out : 'unknown'}) is not tracking anything on GitHub.`
      + '\n  Set it: git push -u origin ' + (branch.ok ? branch.out : '<branch>')
    : `  Its upstream is ${upstream.out}, but the comparison itself failed —`
      + '\n  a detached HEAD or a pruned tracking ref will do that. Check with: git status');
  process.exit(1);
} else {
  const [behind, ahead] = counts.out.split(/\s+/);
  if (ahead !== '0') {
    console.error(`\nNOT RELEASING — ${ahead} commit(s) here have not been pushed.`);
    console.error('The release would be tagged at the version before this one.');
    console.error('\n  git push\n');
    process.exit(1);
  }
  if (behind !== '0') {
    console.error(`\nNOT RELEASING — GitHub is ${behind} commit(s) ahead of this machine.`);
    console.error('The tag would land on code that is not what was just packaged.');
    console.error('\n  git pull\n');
    process.exit(1);
  }
}

// The rules first — including the stricter release-only ones. A release that
// breaks them does not get built.
execFileSync(process.execPath, [path.join(__dirname, 'check.js'), '--release'], { stdio: 'inherit' });
execFileSync(process.execPath, [path.join(__dirname, 'make-zip.js')], { stdio: 'inherit' });

fs.copyFileSync(path.join(root, `kartaan-click-${manifest.version}.zip`), asset);
console.log(`\nrelease copy ready: ${asset}`);

// ── the version file ────────────────────────────────────────────────────────
//
// This is what tells everybody who already has the extension that a new one is
// out. It used to be a file somebody had to publish on kartaan.com by hand, and
// so it was never once updated — which meant the update notice had never told
// anybody anything. It is written HERE instead, from the manifest that was just
// packaged, so it cannot disagree with the release and cannot be forgotten.
//
// The heading of the newest CHANGELOG section supplies the one-line summary. If
// that cannot be read, the notes are left empty rather than guessed at — an empty
// note shows no summary, a wrong one misleads.
// ⚠️ A PARAGRAPH IS WRAPPED ACROSS SEVERAL LINES IN THIS FILE, so taking one line
// hands the seller a sentence chopped off in the middle — which is exactly what the
// first attempt did: "The 'a new version is out' notice now actually works. It has
// never once told". Gather the whole first paragraph, then cut at a full stop.
function newestChangelogLine() {
  const md = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const body = (md.split(/^## /m)[1] || '').split('\n').slice(1);

  // ⚠️ THREE THINGS HAVE GONE WRONG HERE ALREADY. Every one of them produced text
  // that LOOKED fine, which is the whole problem — this string is the update notice
  // every user reads, and nothing downstream can tell a half sentence from a whole
  // one. Test against every section of the real file after touching this.
  //   1. Taking ONE line gave "...It has never once told" — the prose wraps.
  //   2. Refusing to read a list left 17 of 26 sections with an EMPTY notice —
  //      most sections here open with a bullet, not a paragraph.
  //   3. Reading wrapped prose but not wrapped BULLETS gave
  //      "...instead of opening another" — which reverses what that release said.
  // A bullet's second line is not itself a bullet. That is the trap.
  //
  // ⚠️ AND THE BULLET TEST NEEDS THE SPACE AFTER IT: a paragraph opening in bold
  // starts "**", and a bare "starts with *" threw the paragraph away.
  const isBullet  = l => /^([-*+]|\d+\.)\s/.test(l);
  // A rule, a table, a heading, a quote or a code fence is not a summary. ⚠️ THE
  // RULE (`---`) MATTERS: without it a section that opens with one shipped "---"
  // as the notice, and it is not empty, so the warning below never fired.
  const isSkipped = l => /^(#|\||>|```|-{3,}$|\*{3,}$|_{3,}$)/.test(l);

  const para = [];
  let started = false;
  for (const raw of body) {
    const line = raw.trim();
    if (!line)          { if (started) break; continue; }   // a blank line ends it
    if (isSkipped(line)) { if (started) break; continue; }
    // Once reading, a NEW bullet ends the item — but a plain continuation line
    // belongs to it and must be kept, whether the item began as prose or a bullet.
    if (started && isBullet(line)) break;
    started = true;
    para.push(line.replace(/^([-*+]|\d+\.)\s+/, ''));
  }

  const text = para.join(' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')   // a link keeps its words, drops its address
    .replace(/[*_`]/g, '')                     // bold, italic and code marks are noise here
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';

  // One sentence is what fits in a notice, so cut at the first full stop that
  // really ends one. ⚠️ NOT the stop inside "1.6.0", and not the ones in "e.g."
  // or "i.e." — both appear in this file and both cut a sentence off mid-thought.
  const ABBREVIATIONS = ['e.g', 'i.e', 'etc', 'vs', 'approx', 'no', 'fig'];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '.') continue;
    if (i + 1 < text.length && !/\s/.test(text[i + 1])) continue;  // 1.6.0
    if (/\d/.test(text[i - 1] || '')) continue;                    // a version or a number
    const word = (text.slice(0, i).match(/[A-Za-z.]+$/) || [''])[0].toLowerCase();
    if (ABBREVIATIONS.includes(word)) continue;
    return text.slice(0, i + 1);
  }
  return text;
}

const versionFile = path.join(root, 'version.json');
const notes = newestChangelogLine();
fs.writeFileSync(versionFile, JSON.stringify({
  version: manifest.version,
  url: 'https://github.com/kartaan-com/kartaan-click/releases/latest/download/kartaan-click.zip',
  notes,
}, null, 2) + '\n');
console.log(`version file written: ${versionFile} (${manifest.version})`);
// Say so rather than printing the same cheerful line either way. An empty summary
// is survivable — the notice just shows the version with no description — but it
// is never what anyone intended, and silence is how it would go unnoticed.
console.log(notes
  ? `  summary: ${notes}`
  : '  ⚠️ NO SUMMARY — the newest CHANGELOG section gave nothing readable. The\n'
    + '     notice will show the version number with no description. Check the\n'
    + '     section starts with a sentence or a bullet, then run this again.');

console.log(`
Now, in order:

  1. gh release create ${tag} "${asset}" --title "${tag}" --notes-file CHANGELOG.md

  2. Check the link actually serves the new file:
       https://github.com/kartaan-com/kartaan-click/releases/latest/download/kartaan-click.zip

  3. LAST, not first — commit and push version.json:
       git add version.json && git commit -m "Announce ${manifest.version}" && git push

     ⚠️ THE ORDER MATTERS. This file is what tells everyone a new version is out,
     and the link it hands them is the "latest release" link. Pushing it before the
     release exists tells them to go and fetch ${manifest.version} and hands them
     the version before it. Release first, announce second.
`);
