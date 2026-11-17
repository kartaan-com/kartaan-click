// ─── Kartaan Click — loads a new build of itself when it is safe (R474, plan signed D1272) ───
//
// Control copies a new build into Click's own folder; the LAST file written is build-stamp.json
// (version, an id, and the SHA-256 of every packaged file; tools/make-stamp.js). This file notices a
// stamp whose version is not the running one, checks every listed file in the folder against its hash
// (a copy half done fails that, so nothing half-loaded ever loads), and only then, at a safe moment,
// calls Chrome's own chrome.runtime.reload(). Nothing is downloaded: it only re-reads files already in
// its own folder. A build that asks for a new permission is never loaded this way: he is told instead.
// Safe moment = computer idle 3 min (N063) and no round, accept run, print run, label download or bridge run.
// Click never refreshes his open seller tabs (content/kc-stale.js only tells him to).
//
// Loaded by background.js with importScripts, after print-flow.js.
'use strict';

const RELOAD_ALARM   = 'kcReloadCheck';
const RELOAD_DONE    = 'kcReloadedTo';      // { version, id, at } of the last stamp it reloaded for: once per stamp
const RELOAD_SINCE   = 'kcReloadWaiting';   // { at, told } while a whole new build waits for a safe moment
const RELOAD_EVERY_MIN = 10;
const RELOAD_TELL_MS = 60 * 60 * 1000;      // blocked this long: one Chrome notice, never a forced reload

const reloadNameOk = p => typeof p === 'string' && /^[A-Za-z0-9_.\/-]+$/.test(p) && !p.startsWith('/') && !p.split('/').includes('..');
const reloadNew = (a, b) => (a || []).some(x => !(b || []).includes(x));   // a has something b lacks

// The new build in this folder: { version, id } when it is whole and new, { needsYou } when it wants a new
// permission, null when there is nothing (or not yet a whole copy). deps: text, bytes, sha256, running (manifest).
async function reloadCandidate(deps, doneId) {
  let stamp;
  try { stamp = JSON.parse(await deps.text('build-stamp.json')); } catch (e) { return null; }
  if (!stamp || typeof stamp.version !== 'string' || typeof stamp.id !== 'string' || !stamp.files || typeof stamp.files !== 'object') return null;
  if (stamp.version === deps.running.version || stamp.id === doneId) return null;
  const names = Object.keys(stamp.files);
  if (!names.includes('manifest.json') || !names.every(reloadNameOk)) return null;
  let disk;
  for (const n of names) {
    let buf;
    try { buf = await deps.bytes(n); } catch (e) { return null; }
    if ((await deps.sha256(buf)) !== stamp.files[n]) return null;
    if (n === 'manifest.json') { try { disk = JSON.parse(new TextDecoder().decode(buf)); } catch (e) { return null; } }
  }
  if (!disk || disk.version !== stamp.version) return null;   // stamp and manifest must agree, or it would loop
  if (reloadNew(disk.permissions, deps.running.permissions) || reloadNew(disk.host_permissions, deps.running.host_permissions)) return { needsYou: true };
  return { version: stamp.version, id: stamp.id };
}

// One look. deps adds: busy() -> why not now or '', get, set, remove, now, reload, tell(text).
async function reloadTick(deps) {
  const done = await deps.get(RELOAD_DONE);
  const cand = await reloadCandidate(deps, done && done.id);
  if (!cand) { await deps.remove(RELOAD_SINCE); return 'nothing'; }
  const why = cand.needsYou ? 'new permission' : await deps.busy();
  if (why) {
    const w = (await deps.get(RELOAD_SINCE)) || { at: deps.now(), told: false };
    if (!w.told && deps.now() - w.at >= RELOAD_TELL_MS) {
      w.told = true;
      await deps.tell(cand.needsYou ? 'Click update needs you: it asks for a new Chrome permission, so it will not load by itself.'
                                    : 'Click update waiting. It will load when Click is not busy.');
    }
    await deps.set(RELOAD_SINCE, w);
    return 'waiting: ' + why;
  }
  await deps.set(RELOAD_DONE, { version: cand.version, id: cand.id, at: deps.now() });
  await deps.remove(RELOAD_SINCE);
  deps.reload();
  return 'reloaded';
}

if (typeof module !== 'undefined') module.exports = { reloadCandidate, reloadTick, reloadNameOk };
else {
  const own = n => fetch(chrome.runtime.getURL(n), { cache: 'no-store' });
  const hex = async b => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join('');
  const store = chrome.storage.local;
  // Why Click is busy right now, or '' when nothing is going on. Each line asks the record its own feature keeps.
  async function reloadBusy() {
    if (await computerInUse()) return 'computer in use';
    const lock = (await store.get(CHECKIN_LOCK))[CHECKIN_LOCK];
    if (_roundInFlight || (lock && Date.now() - lock < LOCK_MAX_MS)) return 'check-in round';
    if ((await flipkartRunInProgress()) || (await meeshoRunInProgress())) return 'accept run';
    if (bridgeRunning || (await chrome.storage.session.get(BRIDGE_TAB))[BRIDGE_TAB] != null) return 'label cropper run';
    for (const p of PRINT_PLATFORMS) { const r = (await store.get(PRINT_RUN + p))[PRINT_RUN + p]; if (r && r.state === 'printing') return 'print run'; }
    if (isArmed() || Date.now() <= _folderUntil) return 'label download';
    return '';
  }
  const deps = {
    text: async n => (await own(n)).text(), bytes: async n => (await own(n)).arrayBuffer(), sha256: hex,
    running: chrome.runtime.getManifest(), busy: reloadBusy, now: Date.now,
    get: async k => (await store.get(k))[k], set: (k, v) => store.set({ [k]: v }), remove: k => store.remove(k),
    reload: () => chrome.runtime.reload(),
    tell: text => chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon128.png', title: 'Kartaan Click', message: text }),
  };
  const look = () => reloadTick(deps).catch(e => console.log('[Kartaan Click] self-reload: ' + e));
  chrome.alarms.get(RELOAD_ALARM, a => { void chrome.runtime.lastError; if (!a) chrome.alarms.create(RELOAD_ALARM, { delayInMinutes: 1, periodInMinutes: RELOAD_EVERY_MIN }); });
  chrome.alarms.onAlarm.addListener(a => { if (a.name === RELOAD_ALARM) look(); });
  look();
}
