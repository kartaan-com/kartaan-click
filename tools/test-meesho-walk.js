// Checks for the Meesho label walk (R480W): meesho-label-walk.js with stand-ins, and content/meesho-labels.js against the real saved page
// plus a dialog built from the watched walk of 18 Nov (D:\Click-saved-pages\2026-11-18\meesho-generate-label-walk-2026-11-18.md).
// Run: node tools/test-meesho-walk.js     (the page part needs jsdom, kept outside the repo: set KC_JSDOM to its folder, and the saved page
// at D:\Click-saved-pages\2026-11-17, which holds order ids and never enters a repo. Either missing = the page part FAILS, it is not skipped.)
'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
const W = require('../meesho-label-walk.js');
const day = (d, h = 12) => new Date(2026, 10, d, h, 0).getTime();   // 2026-11-<d>
let n = 0; const ok = name => { n++; console.log('ok ' + name); };

// ── dates, picking, file bytes ──
assert.strictEqual(W.mlwDueDay('17 Nov', day(18)), day(17, 0)); ok('a date shown as "17 Nov" is read');
assert.strictEqual(W.mlwDueDay('2 Jan', day(18)), new Date(2027, 0, 2).getTime()); ok('January seen in November is next year');
assert.strictEqual(W.mlwDueDay('soon', day(18)), null); ok('a non-date is null');
const rows = [
  { orderId: 'A', due: '17 Nov', notDownloaded: true }, { orderId: 'B', due: '18 Nov', notDownloaded: true },
  { orderId: 'C', due: '19 Nov', notDownloaded: true }, { orderId: 'D', due: '17 Nov', notDownloaded: false },
  { orderId: 'E', due: '16 Nov', notDownloaded: true }, { orderId: 'F', due: '??', notDownloaded: true },
];
assert.deepStrictEqual(W.mlwPick(rows, day(18, 12), ['E'], day(18)), ['A', 'B']); ok('due by the cutoff day, label not downloaded, not printed, not undated');
assert.deepStrictEqual(W.mlwPick(rows, day(18, 12), [], day(18)), ['A', 'B', 'E']); ok('overdue orders are included');
// R480W: when nothing is picked, the words say WHY, order by order counts, no buyer text.
assert.strictEqual(W.mlwWhy(rows, day(18, 12), ['E'], day(18)), 'The Ready to Ship list shows 6 orders; none was picked. 1 already printed by Click; 1 label already made (not "Not Downloaded"); 1 due after the cutoff day 18 Nov (earliest 19 Nov); 1 with a date Click cannot read ("??").' );
assert.strictEqual(W.mlwWhy([], day(18, 12), [], day(18)), 'The Ready to Ship list shows no orders.');
assert.strictEqual(W.mlwWhy([{ orderId: 'C', due: '19 Nov', notDownloaded: true }], day(18, 12), [], day(18)), 'The Ready to Ship list shows 1 order; none was picked. 1 due after the cutoff day 18 Nov (earliest 19 Nov).'); ok('nothing picked: the reason is said in words, per kind, with the cutoff day');
const real = fs.readFileSync('D:\\Click-saved-pages\\2026-11-18\\Sub_Order_Labels_86add923-9fe9-4e13-ae1e-e9d040cdbde3.pdf');
assert.ok(W.mlwIsPdf(real.toString('base64'))); assert.strictEqual(W.mlwDataUrlBase64('data:application/pdf;base64,' + real.toString('base64')), real.toString('base64'));
assert.strictEqual(W.mlwDataUrlBase64('data:application/pdf,%25PDF-1'), Buffer.from('%PDF-1').toString('base64')); assert.strictEqual(W.mlwDataUrlBase64('blob:https://x/1'), null);
assert.ok(!W.mlwIsPdf(Buffer.from('<html>').toString('base64'))); ok('a data: address gives the label bytes (the real saved label); a non-PDF is refused');
(async () => {
  const b64 = real.toString('base64'), noBlob = async () => { throw new Error('no blob reader wanted'); };
  assert.deepStrictEqual(await W.mlwFileFrom({ url: 'data:application/pdf;base64,' + b64, filename: 'C:\\Downloads\\Sub_Order_Labels_x.pdf' }, noBlob), { name: 'Sub_Order_Labels_x.pdf', base64: b64 });
  let asked; assert.deepStrictEqual(await W.mlwFileFrom({ url: 'blob:https://supplier.meesho.com/abc' }, async u => { asked = u; return { ok: true, base64: b64 }; }), { name: 'label.pdf', base64: b64 });
  assert.strictEqual(asked, 'blob:https://supplier.meesho.com/abc');
  await assert.rejects(W.mlwFileFrom({ url: 'blob:https://supplier.meesho.com/abc' }, async () => ({ ok: false })), /could not read the label file/);
  await assert.rejects(W.mlwFileFrom({ url: 'blob:https://supplier.meesho.com/abc' }, async () => null), /could not read the label file/);
  await assert.rejects(W.mlwFileFrom({ url: 'data:text/html;base64,PGh0bWw+' }, noBlob), /could not read the label file/);
  ok('a blob: address is read by the page; a failed or non-PDF read says the file is in Downloads');
})().then(() => {})
.catch(e => { console.error('FAILED', e); process.exit(1); });

// ── the walk, with a stand-in for Chrome ──
function io(over = {}) {
  const calls = [];
  const base = {
    tab: async () => ({ id: 1, url: 'https://supplier.meesho.com/panel/v3/new/fulfillment/x/orders/ready-to-ship' }), toReady: async t => t,
    call: async (id, m) => { calls.push(m.type + (m.orderId ? ':' + m.orderId : '')); return base.answer(m); },
    answer: m => m.type === 'KC_LABEL_ROWS' ? { ok: true, rows } : { ok: true },
    idle: async () => true, printed: async () => [], pause: async () => {},
    capture: () => ({ done: Promise.resolve({ name: 'l.pdf', base64: 'JVBERg==' }), stop() { calls.push('STOP'); } }),
  };
  return Object.assign(base, over, { calls });
}
(async () => {
  let w = io(); let r = await W.meeshoLabelWalk(day(18, 12), w);
  assert.deepStrictEqual(r.orderIds, ['A', 'B', 'E']); assert.strictEqual(r.files.length, 3);
  assert.deepStrictEqual(w.calls.slice(0, 7), ['KC_LABEL_CHECK', 'KC_LABEL_ROWS', 'KC_LABEL_OPEN:A', 'KC_LABEL_SAVE', 'STOP', 'KC_LABEL_OPEN:B', 'KC_LABEL_SAVE']); ok('one order at a time: Label, dialog Label, file; files come back WITH their order ids');

  w = io({ answer: m => m.type === 'KC_LABEL_CHECK' ? { ok: false, reason: 'the "action" column heading is missing or renamed' } : { ok: true } });
  await assert.rejects(W.meeshoLabelWalk(day(18), w), /not as Click knows it.*action/); assert.deepStrictEqual(w.calls, ['KC_LABEL_CHECK']); ok('a changed page stops the walk, pressing nothing');

  // R480W: after Click reloads itself the Meesho tab may hold the OLD script (no answer): Click puts the script back in, once, then asks again.
  { let first = true; w = io({ answer: m => (m.type === 'KC_LABEL_CHECK' && first) ? (first = false, null) : (m.type === 'KC_LABEL_ROWS' ? { ok: true, rows } : { ok: true }), revive: async id => { w.calls.push('REVIVE:' + id); } });
    r = await W.meeshoLabelWalk(day(18, 12), w); assert.deepStrictEqual(w.calls.slice(0, 3), ['KC_LABEL_CHECK', 'REVIVE:1', 'KC_LABEL_CHECK']); assert.deepStrictEqual(r.orderIds, ['A', 'B', 'E']); ok('no answer from the page: the script is put back in once and the check is asked again'); }
  { w = io({ answer: () => null, revive: async id => { w.calls.push('REVIVE:' + id); } });
    await assert.rejects(W.meeshoLabelWalk(day(18), w), /no answer from the page.*[Rr]eload the Meesho tab/); assert.deepStrictEqual(w.calls, ['KC_LABEL_CHECK', 'REVIVE:1', 'KC_LABEL_CHECK']); ok('still no answer after that: says plainly to reload the Meesho tab, tried only once'); }
  w = io({ answer: () => null }); await assert.rejects(W.meeshoLabelWalk(day(18), w), /[Rr]eload the Meesho tab/); ok('no answer and nothing to put back: also says reload the Meesho tab');
  { w = io({ answer: m => m.type === 'KC_LABEL_CHECK' ? { ok: false, reason: 'x' } : { ok: true }, revive: async () => { w.calls.push('REVIVE'); } });
    await assert.rejects(W.meeshoLabelWalk(day(18), w), /not as Click knows it \(x\)/); assert.ok(!w.calls.includes('REVIVE')); ok('a page that answers (even badly) is never re-injected'); }
  w = io({ answer: m => m.type === 'KC_LABEL_ROWS' ? { ok: true, rows: [{ orderId: 'C', due: '19 Nov', notDownloaded: true }] } : { ok: true } });
  r = await W.meeshoLabelWalk(day(18, 12), w); assert.deepStrictEqual(r.files, []); assert.deepStrictEqual(r.orderIds, []); assert.match(r.note, /1 due after the cutoff day 18 Nov/); assert.deepStrictEqual(w.calls, ['KC_LABEL_CHECK', 'KC_LABEL_ROWS']); ok('the walk hands the reason back with an empty result, pressing nothing');
  w = io({ idle: async () => false });
  await assert.rejects(W.meeshoLabelWalk(day(18), w), /came back to the computer/); assert.deepStrictEqual(w.calls, []); ok('computer in use: not one page action');
  w = io({ idle: async () => false }); r = await W.meeshoLabelWalk(day(18, 12), w, true); assert.deepStrictEqual(r.orderIds, ['A', 'B', 'E']); ok('Print now by hand: he is there, so the walk does not wait for 3 idle minutes');
  let left = 5;   // idle for the check, the rows and the first Label + dialog Label (5 asks), then he comes back
  w = io({ idle: async () => left-- > 0 });
  r = await W.meeshoLabelWalk(day(18, 12), w); assert.deepStrictEqual(r.orderIds, ['A']); assert.ok(/Stopped after 1 of 3.*came back/.test(r.note)); ok('he comes back mid-walk: the finished label is kept, the rest stop, and it says so');

  w = io({ tab: async () => null });
  await assert.rejects(W.meeshoLabelWalk(day(18), w), /open Meesho/); ok('no Meesho tab: says so');

  w = io({ printed: async () => ['A', 'B', 'E'] }); r = await W.meeshoLabelWalk(day(18, 12), w);
  assert.deepStrictEqual([r.files, r.orderIds], [[], []]); assert.match(r.note, /3 already printed by Click/); assert.ok(!w.calls.some(c => c.startsWith('KC_LABEL_OPEN'))); ok('everything already printed: nothing pressed');

  w = io({ answer: m => m.type === 'KC_LABEL_OPEN' ? { ok: false, reason: 'order A no longer says Not Downloaded' } : m.type === 'KC_LABEL_ROWS' ? { ok: true, rows } : { ok: true } });
  await assert.rejects(W.meeshoLabelWalk(day(18, 12), w), /no longer says Not Downloaded/); ok('the first order failing is an error, nothing handed on');

  w = io({ capture: () => ({ done: Promise.reject(new Error('the label file did not come in time')), stop() {} }) });
  await assert.rejects(W.meeshoLabelWalk(day(18, 12), w), /did not come in time/); ok('no file arriving is an error, not an empty success');

  assert.strictEqual(W.mlwReadyUrl('https://supplier.meesho.com/panel/v3/new/fulfillment/xuptj/orders/pending?x=1'), 'https://supplier.meesho.com/panel/v3/new/fulfillment/xuptj/orders/ready-to-ship'); ok('the Pending address becomes Ready to Ship, seller id kept');

  // ── the page side, on the saved real page ──
  const jsdomDir = process.env.KC_JSDOM, saved = 'D:\\Click-saved-pages\\2026-11-17\\meesho-ready-to-ship-label-not-downloaded-2026-11-17.html';
  assert.ok(jsdomDir && fs.existsSync(saved), 'the page part needs KC_JSDOM and the saved page; it is not skipped');
  const { JSDOM } = require(path.join(jsdomDir, 'node_modules', 'jsdom'));
  let window;
  const load = (html, url = 'https://supplier.meesho.com/panel/v3/new/fulfillment/xuptj/orders/ready-to-ship') => {
    const dom = new JSDOM(html, { url }); let handler; window = dom.window;
    global.document = dom.window.document; global.location = dom.window.location;
    global.chrome = { runtime: { id: 'me', onMessage: { addListener: f => { handler = f; } } } };
    delete require.cache[require.resolve('../content/meesho-labels.js')]; require('../content/meesho-labels.js');
    return msg => new Promise(res => { if (handler(msg, { id: 'me' }, res) !== true && !['KC_LABEL_CHECK', 'KC_LABEL_ROWS'].includes(msg.type)) res(undefined); });
  };
  const html = fs.readFileSync(saved, 'utf8');
  let send = load(html);
  assert.deepStrictEqual(await send({ type: 'KC_LABEL_CHECK' }), { ok: true }); ok('page: the saved page is recognised');
  const got = (await send({ type: 'KC_LABEL_ROWS' })).rows;
  assert.strictEqual(got.length, 13); assert.ok(got.every(x => /^\d{15,}$/.test(x.orderId) && x.notDownloaded && /^\d+ [A-Z][a-z]{2}/.test(x.due))); ok('page: 13 rows with order id, date, Not Downloaded');
  for (const [name, bad] of [['Dispatch Date/SLA', 'Dispatch Day'], ['Sub-order ID', 'Suborder']]) {
    send = load(html.split(name).join(bad));
    const r2 = await send({ type: 'KC_LABEL_CHECK', waitMs: 300 }); assert.strictEqual(r2.ok, false, name); console.log('   says: ' + r2.reason);
  }
  ok('page: a renamed heading is named, not guessed');
  send = load(html, 'https://supplier.meesho.com/panel/v3/new/fulfillment/xuptj/orders/pending');
  assert.strictEqual((await send({ type: 'KC_LABEL_CHECK', waitMs: 300 })).ok, false); ok('page: the Pending page is not Ready to Ship');
  // R480W: when the table is not found, the answer carries what the page DID show (no order, buyer or product text) so one failed press tells us its shape.
  send = load(html); window.document.querySelector('table').remove();
  const noTbl = await send({ type: 'KC_LABEL_CHECK', waitMs: 200 });
  assert.ok(noTbl.seen && noTbl.seen.path === '/panel/v3/new/fulfillment/xuptj/orders/ready-to-ship' && noTbl.seen.tables === 0 && typeof noTbl.seen.rows === 'number' && typeof noTbl.seen.iframes === 'number' && Array.isArray(noTbl.seen.tabs));
  send = load(html); { const th = window.document.querySelector('table thead th:nth-child(8)'); th.textContent = 'Ship By'; }
  const renamed = await send({ type: 'KC_LABEL_CHECK', waitMs: 200 });
  assert.ok(renamed.seen && renamed.seen.tables === 1 && renamed.seen.heads[0].includes('Ship By') && renamed.seen.heads[0].includes('Product Details'));
  assert.ok(!JSON.stringify([noTbl, renamed]).includes('Order ID'), 'no order text in what is recorded');
  assert.ok(JSON.stringify(renamed.seen).length < 1500); ok('page: a missed table reports its shape (path, headings, counts, tabs) and no order text');
  w = io({ answer: m => m.type === 'KC_LABEL_CHECK' ? { ok: false, reason: 'the orders table is missing', seen: { path: '/x', tables: 0 } } : { ok: true } });
  await assert.rejects(W.meeshoLabelWalk(day(18), w), /orders table is missing[\s\S]*Seen on the page: \{"path":"\/x","tables":0\}/); ok('the walk puts the page shape into its failure message (which the last-runs list records)');
  { let listeners = 0; const dom = new JSDOM(html, { url: 'https://supplier.meesho.com/panel/v3/new/fulfillment/xuptj/orders/ready-to-ship' }); global.document = dom.window.document; global.location = dom.window.location;
    global.chrome = { runtime: { id: 'me', onMessage: { addListener: () => { listeners++; } } } };
    for (let i = 0; i < 2; i++) { delete require.cache[require.resolve('../content/meesho-labels.js')]; require('../content/meesho-labels.js'); }
    assert.strictEqual(listeners, 1); ok('page: the script put in twice in the same page listens once (a press is never made twice)'); }
  // The live run of 18 Nov: the page fills its table a few seconds after the tab opens, and its heading reads "Dispatch Date/SLA" (maybe with an icon after it).
  send = load(html.replace('Dispatch Date/SLA', 'Dispatch Date/SLA ⓘ'));
  assert.deepStrictEqual(await send({ type: 'KC_LABEL_CHECK', waitMs: 300 }), { ok: true }); ok('page: a heading with something after "Dispatch Date" is still the date column');
  send = load(html); const tbl = window.document.querySelector('table'), holder = tbl.parentElement, next = tbl.nextSibling; tbl.remove();
  setTimeout(() => holder.insertBefore(tbl, next), 700);
  assert.deepStrictEqual(await send({ type: 'KC_LABEL_CHECK', waitMs: 5000 }), { ok: true }); ok('page: the table appearing after a short wait is waited for');
  send = load(html); window.document.querySelector('table').remove(); const t0 = Date.now();
  const late = await send({ type: 'KC_LABEL_CHECK', waitMs: 600 }); assert.strictEqual(late.ok, false); assert.ok(Date.now() - t0 >= 550 && /Dispatch Date column is missing/.test(late.reason)); ok('page: a table that never comes is reported only after the wait');
  send = load(html); window.document.querySelector('table').remove(); setTimeout(() => window.document.body.appendChild(Object.assign(window.document.createElement('p'), { textContent: 'x' })), 100);
  const t1 = Date.now(); const rowsLate = await send({ type: 'KC_LABEL_ROWS', waitMs: 500 }); assert.strictEqual(rowsLate.ok, false); assert.ok(Date.now() - t1 >= 450); ok('page: reading the rows waits for the table too');

  // The dialog, as watched on 18 Nov: Label on a row -> "Generating labels..." -> "Labels generated successfully for 1 order" + Download Manifest + Label -> closes.
  const id0 = got[0].orderId;
  const dialogPage = (gen, after) => {   // the page's own behaviour, written as the watched note describes it
    send = load(html); const d = window.document, rowBtn = [...d.querySelectorAll('tbody button')].find(b => b.textContent.trim() === 'Label');
    const pressed = []; window.__pressed = pressed;
    rowBtn.addEventListener('click', () => {
      const box = d.createElement('div'); box.setAttribute('role', 'dialog'); box.innerHTML = '<h2>Ready to Ship Labels</h2><p>Generating labels...</p>'; d.body.appendChild(box);
      setTimeout(() => { box.innerHTML = '<h2>Ready to Ship Labels</h2><div><h3>' + gen + '</h3></div><label><input type="checkbox"><h4>Download Manifest</h4></label><button>Label</button>';
        box.querySelector('button').addEventListener('click', () => { pressed.push({ manifest: box.querySelector('input').checked }); if (after) box.remove(); }); }, 50);
    });
  };
  dialogPage('Labels generated successfully for 1 order', true);
  assert.deepStrictEqual(await send({ type: 'KC_LABEL_OPEN', orderId: id0, waitMs: 3000 }), { ok: true }); ok('page: Label pressed, waits for "generated successfully for 1 order"');
  assert.deepStrictEqual(await send({ type: 'KC_LABEL_SAVE', waitMs: 3000 }), { ok: true }); assert.deepStrictEqual(window.__pressed, [{ manifest: false }]); ok('page: the dialog Label pressed once, Download Manifest left unticked, dialog closed');
  dialogPage('Labels generated successfully for 1 order', true);
  await send({ type: 'KC_LABEL_OPEN', orderId: id0, waitMs: 3000 });
  [...window.document.querySelectorAll('[role=dialog] input')][0].click();
  await send({ type: 'KC_LABEL_SAVE', waitMs: 3000 }); assert.deepStrictEqual(window.__pressed, [{ manifest: false }]); ok('page: a ticked Download Manifest is cleared before pressing Label');
  dialogPage('Labels generated successfully for 3 orders', true);
  const bad = await send({ type: 'KC_LABEL_OPEN', orderId: id0, waitMs: 3000 }); assert.strictEqual(bad.ok, false); assert.ok(/3 orders, not 1/.test(bad.reason)); ok('page: a dialog for more than 1 order stops');
  dialogPage('Something else', true);
  const never = await send({ type: 'KC_LABEL_OPEN', orderId: id0, waitMs: 700 }); assert.strictEqual(never.ok, false); assert.ok(/did not come in time/.test(never.reason)); ok('page: no success message in time stops');
  send = load(html); assert.ok(/is not in the list/.test((await send({ type: 'KC_LABEL_OPEN', orderId: '999', waitMs: 500 })).reason)); assert.ok(/not showing/.test((await send({ type: 'KC_LABEL_SAVE', waitMs: 500 })).reason)); ok('page: an order not in the list, or no dialog showing, presses nothing');
  console.log(n + ' checks passed');
})().catch(e => { console.error('FAILED', e); process.exit(1); });
