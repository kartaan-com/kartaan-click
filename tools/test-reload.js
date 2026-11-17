// Checks for self-reload.js and make-stamp.js. Run: node tools/test-reload.js
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs'), os = require('os'), path = require('path');
const { reloadCandidate, reloadTick, reloadNameOk } = require('../self-reload.js');
const { packagedFiles, makeStamp } = require('../tools/make-stamp.js');

const root = path.join(__dirname, '..');
const sha = b => crypto.createHash('sha256').update(Buffer.from(b)).digest('hex');
const RUNNING = { version: '1.8.0', permissions: ['storage', 'alarms'], host_permissions: ['https://a/*'] };

// A folder of files and a store, standing in for Click's own folder and chrome.storage.
function world(files, running = RUNNING) {
  const store = {}, log = { reloads: 0, told: [] };
  let busy = '', t = 1000;
  const deps = {
    text: async n => { if (!(n in files)) throw new Error('missing ' + n); return files[n]; },
    bytes: async n => { if (!(n in files)) throw new Error('missing ' + n); return Buffer.from(files[n]); },
    sha256: async b => sha(b), running,
    busy: async () => busy, now: () => t,
    get: async k => store[k], set: async (k, v) => { store[k] = v; }, remove: async k => { delete store[k]; },
    reload: () => { log.reloads++; }, tell: async x => { log.told.push(x); },
  };
  return { deps, store, log, setBusy: b => { busy = b; }, advance: ms => { t += ms; } };
}
// A whole new build: files plus the stamp that describes them.
function build(version, extra = {}, perms = RUNNING) {
  const manifest = JSON.stringify({ version, permissions: perms.permissions, host_permissions: perms.host_permissions, ...extra });
  const files = { 'manifest.json': manifest, 'background.js': 'code ' + version };
  const hashes = {}; for (const n of Object.keys(files)) hashes[n] = sha(files[n]);
  files['build-stamp.json'] = JSON.stringify({ version, id: sha(JSON.stringify(hashes)), files: hashes });
  return files;
}

(async () => {
  // A whole new build, computer free: reloads once.
  let w = world(build('1.8.1'));
  assert.strictEqual(await reloadTick(w.deps), 'reloaded'); assert.strictEqual(w.log.reloads, 1);
  assert.strictEqual(w.store.kcReloadedTo.version, '1.8.1');
  // Same stamp again (the loop guard): no second reload.
  assert.strictEqual(await reloadTick(w.deps), 'nothing'); assert.strictEqual(w.log.reloads, 1);

  // Same version as running: nothing. No stamp at all (store install): nothing.
  w = world(build('1.8.0')); assert.strictEqual(await reloadTick(w.deps), 'nothing');
  const bare = build('1.8.1'); delete bare['build-stamp.json'];
  w = world(bare); assert.strictEqual(await reloadTick(w.deps), 'nothing'); assert.strictEqual(w.log.reloads, 0);

  // Each safe-moment reason refuses: while he is active, a round, a print run, an accept run.
  for (const why of ['computer in use', 'check-in round', 'print run', 'accept run', 'label cropper run', 'label download']) {
    w = world(build('1.8.1')); w.setBusy(why);
    assert.strictEqual(await reloadTick(w.deps), 'waiting: ' + why); assert.strictEqual(w.log.reloads, 0, why);
    w.setBusy('');   // the moment he is away and nothing runs, it goes
    assert.strictEqual(await reloadTick(w.deps), 'reloaded'); assert.strictEqual(w.log.reloads, 1);
  }

  // Half-copied folder: a file missing, a file still old, a stamp that is not JSON, an unsafe name: never.
  const ok = build('1.8.1');
  const missing = { ...ok }; delete missing['background.js'];
  const stale = { ...ok, 'background.js': 'code 1.8.0' };
  const garbled = { ...ok, 'build-stamp.json': '{"version":"1.8.1","id":' };
  const evil = build('1.8.1'); const es = JSON.parse(evil['build-stamp.json']); es.files['../x'] = 'aa'; evil['build-stamp.json'] = JSON.stringify(es);
  const noManifest = build('1.8.1'); const ns = JSON.parse(noManifest['build-stamp.json']); delete ns.files['manifest.json']; noManifest['build-stamp.json'] = JSON.stringify(ns);
  const disagree = build('1.8.1'); const ds = JSON.parse(disagree['build-stamp.json']); ds.version = '1.8.2'; disagree['build-stamp.json'] = JSON.stringify(ds);
  for (const [name, f] of Object.entries({ missing, stale, garbled, evil, noManifest, disagree })) {
    w = world(f); assert.strictEqual(await reloadTick(w.deps), 'nothing', name); assert.strictEqual(w.log.reloads, 0, name);
  }

  // A build asking for a new permission never reloads by itself; one notice after an hour.
  w = world(build('1.8.1', {}, { permissions: ['storage', 'alarms', 'tabs'], host_permissions: RUNNING.host_permissions }));
  assert.strictEqual(await reloadTick(w.deps), 'waiting: new permission'); assert.strictEqual(w.log.reloads, 0);
  w = world(build('1.8.1', {}, { permissions: RUNNING.permissions, host_permissions: ['https://a/*', 'https://b/*'] }));
  assert.strictEqual(await reloadTick(w.deps), 'waiting: new permission');
  // Fewer permissions is fine.
  w = world(build('1.8.1', {}, { permissions: ['storage'], host_permissions: RUNNING.host_permissions }));
  assert.strictEqual(await reloadTick(w.deps), 'reloaded');

  // Blocked an hour: ONE notice, still no reload; then it goes when free.
  w = world(build('1.8.1')); w.setBusy('computer in use');
  await reloadTick(w.deps); w.advance(59 * 60 * 1000); await reloadTick(w.deps); assert.strictEqual(w.log.told.length, 0);
  w.advance(2 * 60 * 1000); await reloadTick(w.deps); await reloadTick(w.deps);
  assert.strictEqual(w.log.told.length, 1); assert.strictEqual(w.log.reloads, 0);

  // A rollback (lower version) reaches Chrome too.
  w = world(build('1.7.9')); assert.strictEqual(await reloadTick(w.deps), 'reloaded');

  // Names: plain relative paths only.
  for (const bad of ['../a', '/a', 'a/../b', 'a b', '', 'a\\b', 5, null]) assert.ok(!reloadNameOk(bad), String(bad));
  for (const good of ['manifest.json', 'content/vms-awb.js', 'icons/icon16.png']) assert.ok(reloadNameOk(good), good);
  console.log('self-reload logic: all passed');

  // The stamp maker, on the real packaged files: whole, agrees with the manifest, and the packaged list is what it hashes.
  const names = packagedFiles(root);
  assert.ok(names.includes('self-reload.js') && names.includes('content/kc-stale.js') && names.includes('manifest.json'));
  assert.ok(!names.some(n => n.includes('build-stamp') || n.startsWith('tools/')));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-stamp-'));
  for (const n of names) { fs.mkdirSync(path.dirname(path.join(tmp, n)), { recursive: true }); fs.copyFileSync(path.join(root, n), path.join(tmp, n)); }
  const s = makeStamp(tmp, names);
  assert.strictEqual(s.version, JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).version);
  assert.strictEqual(s.id, makeStamp(root, names).id);
  fs.appendFileSync(path.join(tmp, 'background.js'), ' ');   // one changed byte changes the id
  assert.notStrictEqual(makeStamp(tmp, names).id, s.id);
  // And the real stamp, read back by the real checker, is accepted as whole when the running version differs.
  fs.copyFileSync(path.join(root, 'background.js'), path.join(tmp, 'background.js'));
  fs.writeFileSync(path.join(tmp, 'build-stamp.json'), JSON.stringify(s));
  const real = world({}, { version: '0.0.1', permissions: [], host_permissions: [] });
  real.deps.text = async n => fs.readFileSync(path.join(tmp, n), 'utf8'); real.deps.bytes = async n => fs.readFileSync(path.join(tmp, n));
  const man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  real.deps.running = { version: '0.0.1', permissions: man.permissions, host_permissions: man.host_permissions };
  const c = await reloadCandidate(real.deps, null);
  assert.deepStrictEqual(c, { version: s.version, id: s.id });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('stamp: all passed');
})().catch(e => { console.error(e); process.exit(1); });
