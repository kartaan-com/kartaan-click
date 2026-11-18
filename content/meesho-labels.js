// ─── Kartaan Click — Meesho label walk, the page side (round R480W) ───
//
// Reads the seller's "Ready to Ship" list and, for ONE order at a time, does what he does by hand (watched 18 Nov 2026):
//   press the row's "Label" button -> the "Ready to Ship Labels" dialog says "Generating labels...", then
//   "Labels generated successfully for 1 order" with a "Download Manifest" box and a "Label" button
//   -> press that "Label" button: the dialog closes and Chrome saves Sub_Order_Labels_<uuid>.pdf.
// Catching the file is the worker's job (meesho-label-walk.js); this file only reads and presses.
// The list is known from the saved page of 17 Nov 2026: a table headed
//   (box) | Product Details | Sub-order ID | SKU ID | Meesho ID | Quantity | Size | Dispatch Date/SLA | Action
// with the order id as "Order ID: 123…" in the Product Details cell and "Not Downloaded" beside the row's Label button.
// A heading, button or word that is not there = the page is not the one Click knows, and the answer says which.
'use strict';
(function () {
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;
  if (globalThis.__kcMeeshoLabels === chrome.runtime.onMessage) return;   // put in twice into the same page (Click does that after its own reload): listen once, or a press is made twice
  globalThis.__kcMeeshoLabels = chrome.runtime.onMessage;
  const txt = el => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const HEADS = { details: /^product details$/i, sub: /^sub-order id$/i, due: /^dispatch date/i, action: /^action$/i };
  const DONE = /Labels generated successfully for (\d+) orders?/i;
  const labelButton = root => [...root.querySelectorAll('button')].find(b => txt(b) === 'Label') || null;

  function table() { return [...document.querySelectorAll('table')].find(t => [...t.querySelectorAll('thead th')].some(h => HEADS.due.test(txt(h)))) || null; }

  // What the page shows when the table is not found: facts only (address path, headings, counts, tab names), never order, buyer or product text.
  function shape() {
    const cut = (x, n) => txt({ textContent: x }).slice(0, n);
    return {
      path: location.pathname,
      tables: document.querySelectorAll('table').length,
      heads: [...document.querySelectorAll('table')].slice(0, 3).map(t => [...t.querySelectorAll('thead th')].slice(0, 12).map(h => cut(txt(h), 30)).join(' | ')),
      rows: document.querySelectorAll('tbody tr').length,
      roles: { table: document.querySelectorAll('[role=table]').length, grid: document.querySelectorAll('[role=grid]').length, row: document.querySelectorAll('[role=row]').length },
      iframes: document.querySelectorAll('iframe').length,
      tabs: [...document.querySelectorAll('[role=tab]')].slice(0, 12).map(x => cut(txt(x), 30) + (x.getAttribute('aria-selected') === 'true' ? ' *' : ''))
    };
  }

  // { ok, t, cols } or { ok:false, reason, seen } saying what is not as expected and what the page did show.
  function check() {
    if (!/^\/panel\/.*\/orders\/ready-to-ship\b/.test(location.pathname)) return { ok: false, reason: 'this is not the Ready to Ship page' };
    const t = table();
    if (!t) return { ok: false, reason: 'the orders table with a Dispatch Date column is missing', seen: shape() };
    const heads = [...t.querySelectorAll('thead th')].map(txt), cols = {};
    for (const k of Object.keys(HEADS)) {
      cols[k] = heads.findIndex(h => HEADS[k].test(h));
      if (cols[k] < 0) return { ok: false, reason: 'the "' + k + '" column heading is missing or renamed', seen: shape() };
    }
    return { ok: true, t, cols };
  }

  // The order rows as { tr, orderId, sub, due, action }; a one-cell row (seen on the saved page) is not an order.
  function orderRows(c) {
    const out = [];
    for (const tr of c.t.querySelectorAll('tbody tr')) {
      const cells = tr.querySelectorAll('td');
      if (cells.length <= Math.max(...Object.values(c.cols))) continue;
      const id = /Order ID:\s*(\d+)/.exec(txt(cells[c.cols.details]));
      if (!id) return null;
      out.push({ tr, orderId: id[1], sub: txt(cells[c.cols.sub]), due: txt(cells[c.cols.due]), action: cells[c.cols.action] });
    }
    return out;
  }

  // The page fills its table a few seconds after the tab opens (seen live 18 Nov): wait for it before deciding the page differs.
  // Only a missing table is waited for: a page that is not Ready to Ship at all, or a table with a wrong heading, is final at once.
  async function ready(waitMs) {
    for (const t0 = Date.now(); ; await sleep(300)) {
      const c = check();
      if (c.ok || !/orders table/.test(c.reason) || Date.now() - t0 >= waitMs) return c;
    }
  }

  // Every row of the checked table: its order id, sub-order id, dispatch date as shown, and whether its label is still "Not Downloaded".
  function rowsOf(c) {
    if (!c.ok) return c;
    const all = orderRows(c);
    if (!all) return { ok: false, reason: 'a row has no order id' };
    return { ok: true, rows: all.map(r => ({ orderId: r.orderId, sub: r.sub, due: r.due, notDownloaded: /not downloaded/i.test(txt(r.action)) })) };
  }

  // The dialog that says "Labels generated successfully": from that line, up to the first box that holds a "Label" button.
  function doneDialog() {
    const line = [...document.querySelectorAll('body *')].filter(e => DONE.test(txt(e))).pop();   // the innermost one comes last
    for (let e = line; e && e !== document.body; e = e.parentElement) {
      if (e.querySelector('table')) return null;   // reached the page itself (the success words were in a toast): not the dialog, and never a row's Label
      if (labelButton(e)) return { line, box: e };
    }
    return null;
  }

  // Press the Label button of ONE order and wait until its labels are ready ("generated successfully for 1 order").
  async function open(orderId, waitMs) {
    const c = check();
    if (!c.ok) return c;
    if (doneDialog()) return { ok: false, reason: 'a "Labels generated successfully" box is already open from before; close it first' };
    const all = orderRows(c), row = all && all.find(r => r.orderId === orderId);
    if (!row) return { ok: false, reason: 'order ' + orderId + ' is not in the list' };
    if (!/not downloaded/i.test(txt(row.action))) return { ok: false, reason: 'order ' + orderId + ' no longer says Not Downloaded' };
    const btn = labelButton(row.action);
    if (!btn) return { ok: false, reason: 'the row\'s Label button is missing' };
    btn.click();
    for (const t0 = Date.now(); Date.now() - t0 < waitMs; await sleep(300)) {
      const d = doneDialog();
      if (d) return Number(DONE.exec(txt(d.line))[1]) === 1 ? { ok: true } : { ok: false, reason: 'the dialog says labels for ' + DONE.exec(txt(d.line))[1] + ' orders, not 1' };
    }
    return { ok: false, reason: 'the "Labels generated successfully" message did not come in time' };
  }

  // Press the dialog's Label button (Download Manifest stays unticked) and wait for the dialog to close.
  async function save(waitMs) {
    const d = doneDialog();
    if (!d) return { ok: false, reason: 'the "Labels generated successfully" dialog is not showing' };
    const manifest = d.box.querySelector('input[type="checkbox"]');
    if (manifest && manifest.checked) manifest.click();
    labelButton(d.box).click();
    for (const t0 = Date.now(); Date.now() - t0 < waitMs; await sleep(300)) if (!doneDialog()) return { ok: true };
    return { ok: false, reason: 'the dialog did not close after pressing Label' };
  }

  // The label Chrome is saving may be a blob: address, which only this page can read, or a file of this same site. Only those; the bytes go back to Click, nowhere else.
  async function readBlob(url) {
    if (typeof url !== 'string' || !(url.startsWith('blob:' + location.origin + '/') || url.startsWith(location.origin + '/'))) return { ok: false, reason: 'not an address of this page' };
    // NET-OK: nowhere. `url` is a blob: address of a file this page itself made, checked above; the read stays in the browser.
    const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192));
    return { ok: true, base64: btoa(s) };
  }

  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (!msg || sender.id !== chrome.runtime.id) return;
    if (msg.type === 'KC_LABEL_CHECK') { ready(msg.waitMs === undefined ? 20000 : msg.waitMs).then(r => respond(r.ok ? { ok: true } : r)); return true; }
    else if (msg.type === 'KC_LABEL_ROWS') { ready(msg.waitMs === undefined ? 20000 : msg.waitMs).then(r => respond(rowsOf(r))); return true; }
    else if (msg.type === 'KC_LABEL_OPEN' && typeof msg.orderId === 'string') { open(msg.orderId, msg.waitMs || 60000).then(respond); return true; }
    else if (msg.type === 'KC_LABEL_BLOB') { readBlob(msg.url).then(respond, e => respond({ ok: false, reason: String(e && e.message || e) })); return true; }
    else if (msg.type === 'KC_LABEL_SAVE') { save(msg.waitMs || 15000).then(respond); return true; }
  });
  if (typeof module !== 'undefined') module.exports = { check, rowsOf, open, save };
})();
