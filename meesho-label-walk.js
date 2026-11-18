// ─── Kartaan Click — the Meesho label walk (round R480W) ───
//
// The source behind printSources.meesho: gives print-flow.js the label files of every Meesho order due by
// the cutoff that has no label downloaded yet, AND the order ids those files are for (a Yes later marks
// exactly these printed — never what the cropper page says it read, N9).
//   1 the seller's Meesho tab goes to Ready to Ship (a tab he already has open; never a new sign-in)
//   2 the page is checked against what Click knows; anything different = stop, touch nothing, say what
//   3 the orders due by the cutoff, label not downloaded, not already printed, are taken ONE AT A TIME, as he does it by hand
//     (watched 18 Nov 2026): the row's Label button, wait for "Labels generated successfully", the dialog's Label button;
//     Chrome then saves Sub_Order_Labels_<uuid>.pdf (it stays in Downloads) and its bytes are read from that download.
//   An order whose step fails stops the walk; the files already made are still handed on, the rest stay "Not Downloaded" for next time.
// Before every page action of a timed print the computer must have been left alone for 3 minutes (N063); if he comes back, it stops.
// A print he starts himself (Print now) does not wait: he is there, watching.
'use strict';

const MLW_PAGE_WAIT_MS = 30 * 1000;
const MLW_FILE_WAIT_MS = 20 * 1000;
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
  return [...new Set(rows.filter(r => r.notDownloaded && !printed.includes(r.orderId) && (mlwDueDay(r.due, now) ?? Infinity) <= last).map(r => r.orderId))];
}

// Why nothing was picked, in words: counts per reason (no buyer or product text, only dates), for the 'Nothing to print' line.
function mlwWhy(rows, shipBy, printed, now) {
  if (!rows.length) return 'The Ready to Ship list shows no orders.';
  const last = new Date(shipBy).setHours(23, 59, 59, 999), day = ms => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const made = rows.filter(r => !r.notDownloaded), left = rows.filter(r => r.notDownloaded), already = left.filter(r => printed.includes(r.orderId)), rest = left.filter(r => !printed.includes(r.orderId));
  const undated = rest.filter(r => mlwDueDay(r.due, now) === null), late = rest.filter(r => (mlwDueDay(r.due, now) ?? -Infinity) > last);
  const part = [];
  if (already.length) part.push(already.length + ' already printed by Click');
  if (made.length) part.push(made.length + ' label already made (not "Not Downloaded")');
  if (late.length) part.push(late.length + ' due after the cutoff day ' + day(last) + ' (earliest ' + day(Math.min(...late.map(r => mlwDueDay(r.due, now)))) + ')');
  if (undated.length) part.push(undated.length + ' with a date Click cannot read ("' + String(undated[0].due).slice(0, 20) + '")');
  return 'The Ready to Ship list shows ' + rows.length + (rows.length === 1 ? ' order' : ' orders') + '; none was picked. ' + part.join('; ') + '.';
}

// The bytes of a data: address (what the page hands Chrome for the label), as base64; null for anything else.
function mlwDataUrlBase64(url) {
  const m = /^data:[^,]*?(;base64)?,(.*)$/s.exec(url || '');
  if (!m) return null;
  return m[1] ? m[2] : (typeof Buffer !== 'undefined' ? Buffer.from(decodeURIComponent(m[2]), 'latin1').toString('base64') : btoa(decodeURIComponent(m[2])));
}
const mlwIsPdf = base64 => typeof base64 === 'string' && /^JVBER/.test(base64);   // "%PDF" in base64

// The walk. `io` holds everything that touches Chrome, so it can be tried without a browser:
//   tab() -> a Meesho panel tab | null;  toReady(tab) -> the tab on Ready to Ship;  call(tabId, msg) -> the page's answer
//   idle() -> true when the computer has been left alone 3 min;  printed(ids) -> those already printed
//   capture() -> { done: Promise<{ name, base64 }>, stop() }, watching for the label download BEFORE the dialog's Label is pressed
//   pause() -> a short human-sized wait between orders
async function meeshoLabelWalk(shipBy, io, byHand = false) {
  const stopIfUsed = async () => { if (!byHand && !(await io.idle())) throw new Error('you came back to the computer, so Click stopped.'); };
  const ask = async (tabId, msg, afterPress = false) => {   // afterPress: the row's Label is already pressed, so the dialog's Label goes on even if he came back (else the box stays open and the order is lost)
    if (!afterPress) await stopIfUsed();
    const r = await io.call(tabId, msg);
    if (!r || r.ok === false) throw new Error('the Meesho Ready to Ship page is not as Click knows it (' + (r && r.reason || 'no answer from the page: reload the Meesho tab (F5) and press again') + '). Click stopped.' + (r && r.seen ? ' Seen on the page: ' + JSON.stringify(r.seen) : ''));
    return r;
  };
  const found = await io.tab();
  if (!found) throw new Error('open Meesho\'s seller panel in a tab once, signed in, so Click can use it.');
  await stopIfUsed();
  const tab = await io.toReady(found);
  // After Click reloads itself, the open Meesho tab can still hold the old script and not answer: put the script back in, once, and ask again.
  if (io.revive && !(await io.call(tab.id, { type: 'KC_LABEL_CHECK' }))) await io.revive(tab.id);
  await ask(tab.id, { type: 'KC_LABEL_CHECK' });
  const rows = (await ask(tab.id, { type: 'KC_LABEL_ROWS' })).rows || [];
  const ids = mlwPick(rows, shipBy, await io.printed(rows.map(r => r.orderId)), Date.now());
  if (!ids.length) return { files: [], orderIds: [], note: mlwWhy(rows, shipBy, await io.printed(rows.map(r => r.orderId)), Date.now()) };
  const files = [], orderIds = [];
  for (const id of ids) {
    try {
      await ask(tab.id, { type: 'KC_LABEL_OPEN', orderId: id });
      const cap = io.capture(tab.id);
      try { await ask(tab.id, { type: 'KC_LABEL_SAVE' }, true); files.push(await cap.done); }
      catch (e) { throw new Error('Order ' + id + ': its label was made on Meesho but Click could not take the file (' + (e && e.message || e) + ').'); }
      finally { cap.stop(); }
      orderIds.push(id);
    } catch (e) {
      if (files.length === 0) throw e;
      return { files, orderIds, note: 'Stopped after ' + files.length + ' of ' + ids.length + ' orders: ' + (e && e.message || e) };
    }
    if (id !== ids[ids.length - 1]) await io.pause();
  }
  return { files, orderIds };
}

// The real Chrome behind `io`. The Meesho tab: one he already has; the seller id in the address is his own, taken from there.
const mlwReadyUrl = url => url.replace(/\/orders\/[\w-]+.*$/, '/orders/ready-to-ship');
// The label Chrome is saving: bytes from its data: address; from the Meesho page itself when it is a blob: address (a blob belongs to
// the page that made it, so only that page's script can read it); fetched when it is a plain https address.
const mlwFileFrom = async (item, readBlob) => {
  const url = item.url || '';
  const name = (item.filename || '').split(/[\\/]/).pop() || 'label.pdf';
  let base64 = mlwDataUrlBase64(url);
  if (base64 === null && /^blob:/.test(url)) base64 = (await readBlob(url) || {}).base64;
  if (base64 === null && /^https:/.test(url)) {
    const buf = new Uint8Array(await (await fetch(url, { credentials: 'include' })).arrayBuffer());
    base64 = btoa(Array.from(buf, b => String.fromCharCode(b)).join(''));
  }
  if (!mlwIsPdf(base64)) throw new Error('Click could not read the label file Chrome saved (it is in your Downloads folder).');
  return { name, base64 };
};
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
  revive: tabId => chrome.scripting.executeScript({ target: { tabId }, files: ['content/meesho-labels.js'] }).catch(() => {}),
  call: (tabId, msg) => new Promise(res => chrome.tabs.sendMessage(tabId, msg, r => res(chrome.runtime.lastError ? null : r))),
  idle: async () => !(await computerInUse()),
  printed: ids => printedAmong('meesho', ids),
  pause: () => new Promise(r => setTimeout(r, 3000 + Math.random() * 3000)),
  capture: tabId => {
    let on, timer;
    const done = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('the label file did not come in time (it may be in your Downloads folder).')), MLW_FILE_WAIT_MS);
      on = item => { if (/^data:|^blob:/.test(item.url || '') || /Sub_Order_Labels/i.test(item.filename || item.url || '')) { clearTimeout(timer); mlwFileFrom(item, u => mlwIo.call(tabId, { type: 'KC_LABEL_BLOB', url: u })).then(resolve, reject); } };
      chrome.downloads.onCreated.addListener(on);
    });
    done.catch(() => {});
    return { done, stop: () => { clearTimeout(timer); chrome.downloads.onCreated.removeListener(on); } };
  },
};
if (typeof printSources !== 'undefined') printSources.meesho = (shipBy, opts) => meeshoLabelWalk(shipBy, mlwIo, !!(opts && opts.byHand));

if (typeof module !== 'undefined') module.exports = { meeshoLabelWalk, mlwWhy, mlwPick, mlwDueDay, mlwReadyUrl, mlwDataUrlBase64, mlwIsPdf, mlwFileFrom };
