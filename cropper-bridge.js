// ─── Kartaan Click — the Label Cropper bridge ────────────────────────────────
//
// Hands label files to the Kartaan Label Cropper page (kartaan.com/label-cropper)
// and takes the finished PDFs and the counts back. Everything stays inside the
// browser: Chrome's own extension port, no server. The page's side is the
// cropper's bridge.js (its handover note DONE_R466 is the contract).
//
// Loaded by background.js with importScripts. Two ways in, both from Click's own pages:
//   { type: 'KC_CROP', platform, files: [{ name, base64 }], settings? }
//   { type: 'KC_MARK_PRINTED', platform, orderIds: [...] }
//
// Nothing here finds, clicks or prints anything on a seller page.
'use strict';

const BRIDGE_URL      = 'https://kartaan.com/label-cropper/#from-click';
const BRIDGE_ORIGIN   = 'https://kartaan.com';
const BRIDGE_PATH     = '/label-cropper/';
const BRIDGE_V        = 1;
const BRIDGE_TAB      = 'kcBridgeTab';      // session storage: the tab of a run going, so a worker restart can close it
const BRIDGE_PRINTED  = 'kcPrinted';        // { platform: { orderId: time } }  D652: never twice
const BRIDGE_CONNECT_MS = 20 * 1000;        // the page must connect within this
const BRIDGE_RUN_MS   = 10 * 60 * 1000;     // and answer within this
const BRIDGE_PLATFORMS = ['meesho', 'flipkart', 'amazon'];
const BRIDGE_BUSY     = 'a print run is already going';

let bridgeRunning = null;   // { tabId, port, finish }  one run at a time, in memory (the worker is kept alive meanwhile)

// ── the "printed" record: an order counted printed is never sent again (D652) ──
async function printedLoad() {
  return (await chrome.storage.local.get(BRIDGE_PRINTED))[BRIDGE_PRINTED] || {};
}
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
// Marks are written one after another: two at once must not lose each other's ids.
let markChain = Promise.resolve();
function printedMark(platform, orderIds) {
  if (!BRIDGE_PLATFORMS.includes(platform)) return Promise.resolve(0);
  const job = markChain.then(async () => {
    const all = await printedLoad();
    const mine = has(all, platform) ? all[platform] : (all[platform] = {});
    let added = 0;
    for (const id of orderIds || []) {
      if (typeof id === 'string' && id && id !== '__proto__' && !has(mine, id)) { mine[id] = Date.now(); added++; }
    }
    await chrome.storage.local.set({ [BRIDGE_PRINTED]: all });
    return added;
  });
  markChain = job.catch(() => {});
  return job;
}
// Of these order ids, the ones already printed. Kept for the label download (C1b-walk), which must leave
// an already printed order out BEFORE it fetches its label; nothing calls it until that exists.
async function printedAmong(platform, orderIds) {
  const all = await printedLoad();
  return (orderIds || []).filter(id => typeof id === 'string' && has(all[platform], id));
}
// Of these rows, the order ids already printed, each looked up on the platform the row itself names.
async function printedRows(platform, rows) {
  const all = await printedLoad();
  return rows.filter(r => r && typeof r.orderId === 'string' && has(all[BRIDGE_PLATFORMS.includes(r.platform) ? r.platform : platform], r.orderId))
    .map(r => r.orderId);
}

// ── the count (D782): what was sent, what came out, what was left out on the way ──
// The page counts unreadable pages in report.unread and takes unreadable FILES out
// before it counts, listing them in leftOut — so a file left out is added back here.
// The page's own verdict also fails on any "problem" it reports, so that is counted too.
function bridgeCount(answer) {
  const report = answer.report || {};
  const leftOut = Array.isArray(answer.leftOut) ? answer.leftOut : [];
  const unread = Array.isArray(report.unread) ? report.unread.length : 0;
  const problems = Array.isArray(report.problems) ? report.problems.length : 0;
  const out = Number(report.ordersOut) || 0;
  const read = Number(report.ordersIn) || 0;
  const filesLeftOut = leftOut.length;
  return {
    ordersIn: read, ordersOut: out, unread, problems, filesLeftOut,
    // Every order the page read must have come out, and nothing may have been left out unsaid.
    matches: read === out && unread === 0 && problems === 0 && filesLeftOut === 0,
    text: 'Labels made for ' + out + ' of ' + read + ' orders'
      + (unread ? '; ' + unread + ' could not be read' : '')
      + (problems ? '; ' + problems + ' need a look' : '')
      + (filesLeftOut ? '; ' + filesLeftOut + ' file(s) left out' : '') + '.',
  };
}

// ── one run ──
// Resolves to { ok:true, outputs, rows, report, leftOut, ignored, count, alreadyPrinted } or { ok:false, reason }.
// It never marks an order printed: printing, and the seller's word on the count, come after.
async function bridgeRun(req) {
  const platform = req && req.platform;
  const files = req && Array.isArray(req.files) ? req.files : [];
  if (!BRIDGE_PLATFORMS.includes(platform)) return { ok: false, reason: 'no platform named' };
  if (files.length === 0) return { ok: false, reason: 'nothing to print' };
  // Taken before the first wait, so two requests at once cannot both pass.
  if (bridgeRunning) return { ok: false, reason: BRIDGE_BUSY };
  const run = bridgeRunning = { tabId: null, port: null };

  const id = 'kc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  let keepAlive = null, connectTimer = null, runTimer = null, onRemoved = null;
  const done = new Promise(resolve => {
    run.finish = (result) => { run.finish = () => {}; resolve(result); };
  });
  const cleanup = async () => {
    clearInterval(keepAlive); clearTimeout(connectTimer); clearTimeout(runTimer);
    if (onRemoved) chrome.tabs.onRemoved.removeListener(onRemoved);
    try { if (run.port) run.port.disconnect(); } catch (e) { /* already closed */ }
    if (run.tabId != null) { try { await chrome.tabs.remove(run.tabId); } catch (e) { /* the seller closed it */ } }
    await chrome.storage.session.remove(BRIDGE_TAB);
    if (bridgeRunning === run) bridgeRunning = null;
  };

  try {
    // Chrome stops an idle worker; the page sends nothing while it crops, so an
    // extension call every 20 s keeps this one alive for the whole run.
    keepAlive = setInterval(() => { chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError); }, 20 * 1000);
    const tab = await chrome.tabs.create({ url: BRIDGE_URL, active: false });
    run.tabId = tab.id;
    await chrome.storage.session.set({ [BRIDGE_TAB]: tab.id });
    onRemoved = (tabId) => { if (tabId === run.tabId) run.finish({ ok: false, reason: 'the cropper tab was closed before the labels were ready' }); };
    chrome.tabs.onRemoved.addListener(onRemoved);
    connectTimer = setTimeout(() => run.finish({ ok: false, reason: 'the cropper page did not connect in 20 seconds (a slow connection, or Click is not allowed on that page)' }), BRIDGE_CONNECT_MS);
    runTimer = setTimeout(() => run.finish({ ok: false, reason: 'the cropper did not answer in 10 minutes' }), BRIDGE_RUN_MS);
    run.request = { v: BRIDGE_V, type: 'crop', id, files: files.map(f => ({ name: String(f.name), base64: String(f.base64) })) };
    if (req.settings && typeof req.settings === 'object') run.request.settings = req.settings;
    run.connected = () => clearTimeout(connectTimer);
    run.answer = async (msg) => {
      if (!msg || msg.v !== BRIDGE_V || msg.id !== id) return;
      if (msg.type === 'error') return run.finish({ ok: false, reason: String(msg.reason || 'the cropper refused'), leftOut: Array.isArray(msg.leftOut) ? msg.leftOut : [] });
      if (msg.type !== 'result') return;
      const rows = Array.isArray(msg.rows) ? msg.rows : [];
      run.finish({
        ok: true, outputs: Array.isArray(msg.outputs) ? msg.outputs : [], rows, report: msg.report || {},
        leftOut: Array.isArray(msg.leftOut) ? msg.leftOut : [], ignored: Array.isArray(msg.ignored) ? msg.ignored : [],
        count: bridgeCount(msg),
        alreadyPrinted: await printedRows(platform, rows),
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
  // One port per run: a second one from the same tab would crop the labels twice.
  if (!bridgePortAllowed(port, run) || run.port) { try { port.disconnect(); } catch (e) { /* gone */ } return; }
  run.port = port;
  run.connected();
  port.onMessage.addListener(msg => { Promise.resolve(run.answer(msg)).catch(e => run.finish({ ok: false, reason: String(e) })); });
  port.onDisconnect.addListener(() => run.finish({ ok: false, reason: 'the cropper page closed before the labels were ready' }));
  port.postMessage(run.request);
}

// Click's own extension pages only (not its scripts inside seller pages, which carry the page's address).
function bridgeSenderOk(sender) {
  return !!sender && sender.id === chrome.runtime.id && typeof sender.url === 'string' && sender.url.startsWith(chrome.runtime.getURL(''));
}

// A worker that restarted mid-run left its cropper tab open: close it.
async function bridgeCloseLeftover() {
  const saved = (await chrome.storage.session.get(BRIDGE_TAB))[BRIDGE_TAB];
  if (saved == null) return;
  try { await chrome.tabs.remove(saved); } catch (e) { /* already gone */ }
  await chrome.storage.session.remove(BRIDGE_TAB);
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onConnectExternal) {
  chrome.runtime.onConnectExternal.addListener(bridgeOnConnect);
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !bridgeSenderOk(sender)) return;
    if (msg.type === 'KC_CROP') { bridgeRun(msg).then(sendResponse); return true; }
    if (msg.type === 'KC_MARK_PRINTED') { printedMark(msg.platform, msg.orderIds).then(n => sendResponse({ ok: true, marked: n })); return true; }
  });
  bridgeCloseLeftover().catch(e => console.log('[Kartaan Click] cropper bridge clean-up: ' + e));
}

if (typeof module !== 'undefined') module.exports = {
  BRIDGE_BUSY, bridgeRun, bridgeCount, bridgePortAllowed, bridgeOnConnect, bridgeSenderOk, bridgeCloseLeftover, printedMark, printedAmong,
};
