// ─── Kartaan Click — the Meesho label walk (round R480W) ───
//
// The source behind printSources.meesho: gives print-flow.js the label files of every Meesho order due by
// the cutoff that has no label downloaded yet, AND the order ids those files are for (a Yes later marks
// exactly these printed — never what the cropper page says it read, N9).
//   1 the seller's Meesho tab goes to Ready to Ship (a tab he already has open; never a new sign-in)
//   2 the page is checked against what Click knows; anything different = stop, touch nothing, say what
//   3 the orders due by the cutoff, label not downloaded, not already printed, are ticked
//   4 `arrive`: Generate label and the file coming back. NOT BUILT: its pop-up has not been watched yet.
// Before every page action the computer must have been left alone for 3 minutes (N063); if he comes back, it stops.
// Until `arrive` exists the source is not registered, so nothing here ever touches his page.
'use strict';

const MLW_ARRIVE_READY = false;                // the day `arrive` is real, this becomes true
const MLW_PAGE_WAIT_MS = 30 * 1000;
const MLW_MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// "17 Nov" as the page shows it -> that day's start (ms), in the year that puts it nearest to `now`. null if it is not a date.
function mlwDueDay(text, now) {
  const m = /(\d{1,2})\s+([A-Za-z]{3})/.exec(text || '');
  if (!m || !(m[2].toLowerCase() in MLW_MONTHS)) return null;
  const y = new Date(now).getFullYear();
  return [y - 1, y, y + 1].map(yy => new Date(yy, MLW_MONTHS[m[2].toLowerCase()], Number(m[1])).getTime()).sort((a, b) => Math.abs(a - now) - Math.abs(b - now))[0];
}

// The rows to print: label not downloaded, due on or before the cutoff's day (overdue included), not already printed.
function mlwPick(rows, shipBy, printed, now) {
  const last = new Date(shipBy).setHours(23, 59, 59, 999);
  return rows.filter(r => r.notDownloaded && !printed.includes(r.orderId) && (mlwDueDay(r.due, now) ?? Infinity) <= last).map(r => r.orderId);
}

// The walk. `io` holds everything that touches Chrome, so it can be tried without a browser:
//   tab() -> a Meesho panel tab | null;  toReady(tab) -> the tab on Ready to Ship;  call(tabId, msg) -> the page's answer
//   idle() -> true when the computer has been left alone 3 min;  printed(ids) -> those already printed;  arrive(tabId, ids) -> files
async function meeshoLabelWalk(shipBy, io) {
  const stopIfUsed = async () => { if (!(await io.idle())) throw new Error('you came back to the computer, so Click stopped. Nothing was printed.'); };
  const ask = async (tabId, msg) => {
    await stopIfUsed();
    const r = await io.call(tabId, msg);
    if (!r || r.ok === false) throw new Error('the Meesho Ready to Ship page is not as Click knows it (' + (r && r.reason || 'no answer from the page') + '). Click stopped and pressed nothing.');
    return r;
  };
  const found = await io.tab();
  if (!found) throw new Error('open Meesho\'s seller panel in a tab once, signed in, so Click can use it.');
  await stopIfUsed();
  const tab = await io.toReady(found);
  await ask(tab.id, { type: 'KC_LABEL_CHECK' });
  const rows = (await ask(tab.id, { type: 'KC_LABEL_ROWS' })).rows || [];
  const ids = mlwPick(rows, shipBy, await io.printed(rows.map(r => r.orderId)), Date.now());
  if (ids.length === 0) return { files: [], orderIds: [] };
  try {
    const t = await ask(tab.id, { type: 'KC_LABEL_TICK', orderIds: ids });
    if (t.ticked.length !== ids.length || ids.some(i => !t.ticked.includes(i))) throw new Error('Click could not tick exactly the orders it meant to (' + t.ticked.length + ' of ' + ids.length + ').');
    return { files: await io.arrive(tab.id, ids), orderIds: ids };
  } catch (e) {
    try { await io.call(tab.id, { type: 'KC_LABEL_TICK', orderIds: [] }); } catch (x) { /* the page is gone or changed: nothing more to undo */ }
    throw e;
  }
}

// The real Chrome behind `io`. The Meesho tab: one he already has; the seller id in the address is his own, taken from there.
const mlwReadyUrl = url => url.replace(/\/orders\/[\w-]+.*$/, '/orders/ready-to-ship');
const mlwIo = {
  tab: async () => (await chrome.tabs.query({ url: 'https://supplier.meesho.com/panel/*' })).find(t => /\/orders\//.test(t.url)) || null,
  toReady: async tab => {
    if (/\/orders\/ready-to-ship\b/.test(tab.url)) return tab;
    await chrome.tabs.update(tab.id, { url: mlwReadyUrl(tab.url) });
    for (const t0 = Date.now(); Date.now() - t0 < MLW_PAGE_WAIT_MS;) {
      await new Promise(r => setTimeout(r, 500));
      const now = await chrome.tabs.get(tab.id);
      if (now.status === 'complete' && /\/orders\/ready-to-ship\b/.test(now.url)) return now;
    }
    throw new Error('the Ready to Ship page did not open in time.');
  },
  call: (tabId, msg) => new Promise(res => chrome.tabs.sendMessage(tabId, msg, r => res(chrome.runtime.lastError ? null : r))),
  idle: async () => !(await computerInUse()),
  printed: ids => printedAmong('meesho', ids),
  arrive: async () => { throw new Error('the label download step is not built yet.'); },
};
if (MLW_ARRIVE_READY && typeof printSources !== 'undefined') printSources.meesho = shipBy => meeshoLabelWalk(shipBy, mlwIo);

if (typeof module !== 'undefined') module.exports = { meeshoLabelWalk, mlwPick, mlwDueDay, mlwReadyUrl };
