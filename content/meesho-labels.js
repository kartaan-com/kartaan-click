// ─── Kartaan Click — Meesho label walk, the page side (round R480W) ───
//
// Reads the seller's "Ready to Ship" list and ticks rows. It never presses Generate label or Label:
// that step is meesho-label-walk.js's `arrive`, built only once the real pop-up has been watched.
// The page is known from the saved page of 17 Nov 2026: a table headed
//   (box) | Product Details | Sub-order ID | SKU ID | Meesho ID | Quantity | Size | Dispatch Date/SLA | Action
// with a "select all rows" box in the heading, a "Select row N" box in each row, the order id as
// "Order ID: 123…" in the Product Details cell, and "Not Downloaded" beside the row's Label button.
// A heading, box or word that is not there = the page is not the one Click knows, and it says which.
'use strict';
(function () {
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;
  const txt = el => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
  const HEADS = { details: /^product details$/i, sub: /^sub-order id$/i, due: /^dispatch date/i, action: /^action$/i };

  function table() { return [...document.querySelectorAll('table')].find(t => [...t.querySelectorAll('thead th')].some(h => HEADS.due.test(txt(h)))) || null; }

  // { ok, table, cols } or { ok:false, reason } saying what is not as expected.
  function check() {
    if (!/^\/panel\/.*\/orders\/ready-to-ship\b/.test(location.pathname)) return { ok: false, reason: 'this is not the Ready to Ship page' };
    const t = table();
    if (!t) return { ok: false, reason: 'the orders table with a Dispatch Date column is missing' };
    const heads = [...t.querySelectorAll('thead th')].map(txt), cols = {};
    for (const k of Object.keys(HEADS)) {
      cols[k] = heads.findIndex(h => HEADS[k].test(h));
      if (cols[k] < 0) return { ok: false, reason: 'the "' + k + '" column heading is missing or renamed' };
    }
    if (!t.querySelector('thead input[type="checkbox"][aria-label="select all rows"]')) return { ok: false, reason: 'the select-all box is missing' };
    return { ok: true, t, cols };
  }

  // Every row: its order id, its sub-order id, its dispatch date as shown, whether its label is still "Not Downloaded".
  function rows() {
    const c = check();
    if (!c.ok) return c;
    const out = [];
    for (const tr of c.t.querySelectorAll('tbody tr')) {
      const cells = tr.querySelectorAll('td'), box = tr.querySelector('input[type="checkbox"]');
      if (cells.length <= Math.max(...Object.values(c.cols))) continue;   // a one-cell row (seen on the saved page) is not an order
      const id = /Order ID:\s*(\d+)/.exec(txt(cells[c.cols.details]));
      if (!box || !id || !cells[c.cols.action]) return { ok: false, reason: 'a row has no order id or no tick box' };
      out.push({ orderId: id[1], sub: txt(cells[c.cols.sub]), due: txt(cells[c.cols.due]), notDownloaded: /not downloaded/i.test(txt(cells[c.cols.action])) });
    }
    return { ok: true, rows: out };
  }

  // Tick exactly these orders (clearing every other tick first) and say which ended up ticked. mode 'clear' unticks all.
  function tick(orderIds) {
    const c = check();
    if (!c.ok) return c;
    const want = new Set(orderIds), ticked = [];
    for (const tr of c.t.querySelectorAll('tbody tr')) {
      const box = tr.querySelector('input[type="checkbox"]'), m = /Order ID:\s*(\d+)/.exec(txt(tr.querySelectorAll('td')[c.cols.details]));
      if (!box || !m) continue;
      if (box.checked !== want.has(m[1])) box.click();
      if (box.checked) ticked.push(m[1]);
    }
    return { ok: true, ticked };
  }

  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (!msg || sender.id !== chrome.runtime.id) return;
    if (msg.type === 'KC_LABEL_CHECK') { const r = check(); respond(r.ok ? { ok: true } : r); }
    else if (msg.type === 'KC_LABEL_ROWS') respond(rows());
    else if (msg.type === 'KC_LABEL_TICK') respond(tick(Array.isArray(msg.orderIds) ? msg.orderIds.filter(i => typeof i === 'string') : []));
  });
  if (typeof module !== 'undefined') module.exports = { check, rows, tick };
})();
