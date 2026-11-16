// Kartaan Click TEST copy, piece C2-0 (written by Claude Sonnet 5.5, R487 run 1; not DeepSeek, D1187).
// WATCHES ONLY: acts on nothing, clicks nothing on the seller panel. The one file it writes is a copy of the
// label PDF into Downloads\Kartaan Click Labels. Needs the person to press Arm in the popup, and to press
// Print Labels on ONE order himself.
'use strict';
importScripts('probe-lib.js');

const KEY = 'c2probe';
const LINE_MAX = 40;

async function load() { return (await chrome.storage.local.get(KEY))[KEY] || { armed: null, lines: [] }; }
async function save(s) { await chrome.storage.local.set({ [KEY]: s }); }
// Writes are queued one after another: two lines written at once would each read the old list and one would be lost.
let writing = Promise.resolve();
function say(text, badge, color) {
  writing = writing.then(async () => {
    const s = await load();
    s.lines.push(new Date().toLocaleTimeString() + '  ' + text);
    if (s.lines.length > LINE_MAX) s.lines.splice(0, s.lines.length - LINE_MAX);
    await save(s);
    if (badge !== undefined) { chrome.action.setBadgeText({ text: badge }); if (color) chrome.action.setBadgeBackgroundColor({ color }); }
    console.log('[C2-0 probe] ' + text);
  }).catch(() => {});
  return writing;
}

function b64ToBytes(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
function bytesToB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }

async function arm(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || new URL(tab.url).hostname !== 'seller.flipkart.com') return { ok: false, why: 'This tab is not seller.flipkart.com.' };
  const s = await load();
  if (s.armed && s.armed.tabId === tabId && Date.now() < s.armed.until) return { ok: false, why: 'Already armed on this tab. Press Print Labels on one order now.' };
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: 'ISOLATED', func: kcProbeRelay, args: [token, PROBE_TTL_MS] });
  await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: 'MAIN', func: kcProbeWatcher, args: [token, PROBE_CAP_BYTES, PROBE_TTL_MS] });
  s.armed = { tabId, until: Date.now() + PROBE_TTL_MS, done: false };
  await save(s);
  chrome.alarms.create('c2probe-off', { delayInMinutes: PROBE_TTL_MS / 60000 });
  await say('ARMED on this tab for 10 minutes. Now press Print Labels on ONE order yourself.', 'ON', '#c81e1e');
  return { ok: true };
}

async function disarm(why) {
  const s = await load(); s.armed = null; await save(s);
  chrome.alarms.clear('c2probe-off');
  await say(why || 'Disarmed.', '', null);
}

chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'c2probe-off') disarm('Ten minutes passed, watcher stopped. Reload the page and Arm again to retry.'); });

async function finishPdf(bytes, via, order) {
  if (!checkPdf(bytes)) { await say('Something came but it is NOT a PDF (or over 2 MB), ' + bytes.length + ' bytes. Ignored.', 'NO', '#b45309'); return; }
  const id = /^OD\d{12,24}$/.test(order || '') ? order : null;
  await say('GOT A PDF, ' + bytes.length + ' bytes, label for order ' + (id || '(order number not found on the page)') + ', via ' + via + '.', 'PDF', '#15803d');
  try {
    await chrome.downloads.download({ url: 'data:application/pdf;base64,' + bytesToB64(bytes), filename: 'Kartaan Click Labels/probe-C2-0-' + (id || 'order-unknown') + '-' + Date.now() + '.pdf', conflictAction: 'uniquify', saveAs: false });
    await say('One copy saved in Downloads\\Kartaan Click Labels.');
  } catch (e) { await say('Copy not saved: ' + e.message); }
}

// Everything the page sends is untrusted page data (it can read the token). So: top frame of the armed tab only, ONE result
// per arming (claimed in memory before any await), a size cap, a %PDF check, and NO fetch of any address by the worker:
// a fetch could repeat Flipkart's own label request on his real account.
let claimed = false;
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!sender || sender.id !== chrome.runtime.id) return;
  if (!sender.tab && msg && msg.type === 'ARM') { claimed = false; arm(msg.tabId).then(reply, e => reply({ ok: false, why: e.message })); return true; }
  if (!sender.tab && msg && msg.type === 'DISARM') { disarm().then(() => reply({ ok: true })); return true; }
  if (!msg || msg.type !== 'KC_PROBE' || !sender.tab || sender.frameId !== 0 || sender.origin !== 'https://seller.flipkart.com') return;
  const first = (msg.kind === 'pdf' || msg.kind === 'url') && !claimed;
  if ((msg.kind === 'pdf' || msg.kind === 'url') && claimed) return;
  if (first) claimed = true;
  (async () => {
    const s = await load();
    if (!s.armed || s.armed.tabId !== sender.tab.id || Date.now() > s.armed.until) { if (first) claimed = false; return; }
    if (msg.kind === 'seen') { await say('A file was built in the page: type "' + String(msg.btype).slice(0, 60) + '", ' + Number(msg.size) + ' bytes, ' + (msg.pdf ? 'PDF but over the size cap' : 'not a PDF') + '.'); return; }
    if (msg.kind === 'pdf') { if (typeof msg.b64 !== 'string' || msg.b64.length > PROBE_CAP_BYTES * 1.4) return; await finishPdf(b64ToBytes(msg.b64), 'the blob watcher', msg.order); return; }
    if (msg.kind === 'url') await say('The page used a normal address, not a blob: ' + safeAddress(String(msg.url)) + ' . Not fetched by this test copy; Control decides the next probe.', 'URL', '#b45309');
  })();
});

// What Chrome itself saw being downloaded (kind of address and name only, never the query). Says what happened even if the watcher saw nothing.
chrome.downloads.onCreated.addListener(async (item) => {
  const s = await load();
  if (!s.armed || Date.now() > s.armed.until) return;
  const scheme = (item.url || '').split(':')[0];
  await say('Chrome started a download: address type "' + scheme + '", mime "' + (item.mime || '?') + '", ' + (scheme === 'blob' || scheme === 'data' ? '' : safeAddress(item.url) + ', ') + 'file ' + (item.filename || '(no name yet)').split(/[\\/]/).pop());
});
