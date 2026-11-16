// ─── Kartaan Click — the Label Cropper bridge ────────────────────────────────
//
// Hands label files to the Kartaan Label Cropper page (kartaan.com/label-cropper)
// and takes the finished PDFs and the counts back. Everything stays inside the
// browser: Chrome's own extension port, no server. The page's side is the
// cropper's bridge.js (its handover note DONE_R466 is the contract).
//
// Loaded by background.js with importScripts. Two ways in, both from Click itself:
//   { type: 'KC_CROP', platform, files: [{ name, base64 }], settings? }
//   { type: 'KC_MARK_PRINTED', platform, orderIds: [...] }
//
// Nothing here finds, clicks or prints anything on a seller page.
'use strict';

const BRIDGE_URL      = 'https://kartaan.com/label-cropper/#from-click';
const BRIDGE_ORIGIN   = 'https://kartaan.com';
const BRIDGE_PATH     = '/label-cropper/';
const BRIDGE_V        = 1;
const BRIDGE_LOCK     = 'kcBridgeLock';     // when a run started; a second run is refused while it is fresh
const BRIDGE_PRINTED  = 'kcPrinted';        // { platform: { orderId: time } }  D652: never twice
const BRIDGE_CONNECT_MS = 20 * 1000;        // the page must connect within this
const BRIDGE_RUN_MS   = 10 * 60 * 1000;     // and answer within this (also when a stale lock is ignored)
const BRIDGE_PLATFORMS = ['meesho', 'flipkart', 'amazon'];

let bridgeRunning = null;   // { tabId, id, port, finish }  one run at a time (kept in memory: the worker is kept alive meanwhile)

// ── the "printed" record: an order counted printed is never sent again (D652) ──
async function printedLoad() {
  return (await chrome.storage.local.get(BRIDGE_PRINTED))[BRIDGE_PRINTED] || {};
}
async function printedMark(platform, orderIds) {
  if (!BRIDGE_PLATFORMS.includes(platform)) return 0;
  const all = await printedLoad();
  const mine = all[platform] || (all[platform] = {});
  let added = 0;
  for (const id of orderIds || []) {
    if (typeof id === 'string' && id && !mine[id]) { mine[id] = Date.now(); added++; }
  }
  await chrome.storage.local.set({ [BRIDGE_PRINTED]: all });
  return added;
}
// Of these order ids, the ones already printed.
async function printedAmong(platform, orderIds) {
  const mine = (await printedLoad())[platform] || {};
  return (orderIds || []).filter(id => mine[id]);
}

// ── the count (D782): what was sent, what came out, what was left out on the way ──
// The page counts unreadable pages in report.unread and takes unreadable FILES out
// before it counts, listing them in leftOut — so a file left out is added back here.
function bridgeCount(answer) {
  const report = answer.report || {};
  const leftOut = Array.isArray(answer.leftOut) ? answer.leftOut : [];
  const unread = Array.isArray(report.unread) ? report.unread.length : 0;
  const out = Number(report.ordersOut) || 0;
  const read = Number(report.ordersIn) || 0;
  const filesLeftOut = leftOut.length;
  return {
    ordersIn: read, ordersOut: out, unread, filesLeftOut,
    // Every order the page read must have come out, and nothing may have been left out unsaid.
    matches: read === out && unread === 0 && filesLeftOut === 0,
    text: 'Labels made for ' + out + ' of ' + read + ' orders'
      + (unread ? '; ' + unread + ' could not be read' : '')
      + (filesLeftOut ? '; ' + filesLeftOut + ' file(s) left out' : '') + '.',
  };
}

// ── one run ──
// Resolves to { ok:true, outputs, rows, report, leftOut, count, alreadyPrinted } or { ok:false, reason }.
// It never marks an order printed: printing, and the seller's word on the count, come after.
async function bridgeRun(req) {
  const platform = req && req.platform;
  const files = req && Array.isArray(req.files) ? req.files : [];
  if (!BRIDGE_PLATFORMS.includes(platform)) return { ok: false, reason: 'no platform named' };
  if (files.length === 0) return { ok: false, reason: 'nothing to print' };
  const lock = (await chrome.storage.local.get(BRIDGE_LOCK))[BRIDGE_LOCK];
  if (bridgeRunning || (lock && Date.now() - lock < BRIDGE_RUN_MS)) return { ok: false, reason: 'a print run is already going' };
  await chrome.storage.local.set({ [BRIDGE_LOCK]: Date.now() });

  const id = 'kc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  let keepAlive = null, connectTimer = null, runTimer = null, onRemoved = null;
  const run = bridgeRunning = { tabId: null, id, port: null };

  const done = new Promise(resolve => {
    run.finish = (result) => { run.finish = () => {}; resolve(result); };
  });
  const cleanup = async () => {
    clearInterval(keepAlive); clearTimeout(connectTimer); clearTimeout(runTimer);
    if (onRemoved) chrome.tabs.onRemoved.removeListener(onRemoved);
    try { if (run.port) run.port.disconnect(); } catch (e) { /* already closed */ }
    if (run.tabId != null) { try { await chrome.tabs.remove(run.tabId); } catch (e) { /* the seller closed it */ } }
    bridgeRunning = null;
    await chrome.storage.local.remove(BRIDGE_LOCK);
  };

  try {
    // Chrome stops an idle worker; the page sends nothing while it crops, so an
    // extension call every 20 s keeps this one alive for the whole run.
    keepAlive = setInterval(() => { chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError); }, 20 * 1000);
    const tab = await chrome.tabs.create({ url: BRIDGE_URL, active: false });
    run.tabId = tab.id;
    onRemoved = (tabId) => { if (tabId === run.tabId) run.finish({ ok: false, reason: 'the cropper tab was closed before the labels were ready' }); };
    chrome.tabs.onRemoved.addListener(onRemoved);
    connectTimer = setTimeout(() => run.finish({ ok: false, reason: 'the cropper page did not connect (is Click allowed on it?)' }), BRIDGE_CONNECT_MS);
    runTimer = setTimeout(() => run.finish({ ok: false, reason: 'the cropper did not answer in 10 minutes' }), BRIDGE_RUN_MS);
    run.request = { v: BRIDGE_V, type: 'crop', id, files: files.map(f => ({ name: String(f.name), base64: String(f.base64) })) };
    if (req.settings && typeof req.settings === 'object') run.request.settings = req.settings;
    run.connected = () => clearTimeout(connectTimer);
    run.answer = async (msg) => {
      if (!msg || msg.v !== BRIDGE_V || msg.id !== id) return;
      if (msg.type === 'error') return run.finish({ ok: false, reason: String(msg.reason || 'the cropper refused'), leftOut: msg.leftOut || [] });
      if (msg.type !== 'result') return;
      const rows = Array.isArray(msg.rows) ? msg.rows : [];
      run.finish({
        ok: true, outputs: msg.outputs || [], rows, report: msg.report || {}, leftOut: msg.leftOut || [],
        count: bridgeCount(msg),
        alreadyPrinted: await printedAmong(platform, rows.map(r => r && r.orderId)),
      });
    };
    return await done;
  } catch (e) {
    return { ok: false, reason: String(e && e.message || e) };
  } finally {
    await cleanup();
  }
}

// Only the port from the tab Click opened, at the top of that tab, on the cropper's own page.
function bridgePortAllowed(port, run) {
  const s = port && port.sender;
  if (!run || !s || !s.tab || s.tab.id !== run.tabId || s.frameId !== 0 || typeof s.url !== 'string') return false;
  try {
    const u = new URL(s.url);
    return u.origin === BRIDGE_ORIGIN && u.pathname.startsWith(BRIDGE_PATH);
  } catch (e) { return false; }
}
function bridgeOnConnect(port) {
  const run = bridgeRunning;
  if (!bridgePortAllowed(port, run)) { try { port.disconnect(); } catch (e) { /* gone */ } return; }
  run.port = port;
  run.connected();
  port.onMessage.addListener(msg => { Promise.resolve(run.answer(msg)).catch(e => run.finish({ ok: false, reason: String(e) })); });
  port.onDisconnect.addListener(() => run.finish({ ok: false, reason: 'the cropper page closed before the labels were ready' }));
  port.postMessage(run.request);
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onConnectExternal) {
  chrome.runtime.onConnectExternal.addListener(bridgeOnConnect);
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || sender.id !== chrome.runtime.id) return;
    if (msg.type === 'KC_CROP') { bridgeRun(msg).then(sendResponse); return true; }
    if (msg.type === 'KC_MARK_PRINTED') { printedMark(msg.platform, msg.orderIds).then(n => sendResponse({ ok: true, marked: n })); return true; }
  });
}

if (typeof module !== 'undefined') module.exports = {
  bridgeRun, bridgeCount, bridgePortAllowed, bridgeOnConnect, printedMark, printedAmong,
};
