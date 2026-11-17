// Checks for the Meesho label walk (R480W): meesho-label-walk.js with stand-ins, and content/meesho-labels.js against the real saved page.
// Run: node tools/test-meesho-walk.js     (the page part needs jsdom, kept outside the repo: set KC_JSDOM to its folder, and the saved page
// at D:\Click-saved-pages\2026-11-17, which holds order ids and never enters a repo. Either missing = the page part FAILS, it is not skipped.)
'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
const W = require('../meesho-label-walk.js');
const day = (d, h = 12) => new Date(2026, 10, d, h, 0).getTime();   // 2026-11-<d>
let n = 0; const ok = name => { n++; console.log('ok ' + name); };

// ── dates and picking ──
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

// ── the walk, with a stand-in for Chrome ──
function io(over = {}) {
  const calls = [];
  const base = {
    tab: async () => ({ id: 1, url: 'https://supplier.meesho.com/panel/v3/new/fulfillment/x/orders/ready-to-ship' }), toReady: async t => t,
    call: async (id, m) => { calls.push(m.type + (m.orderIds ? ':' + m.orderIds.join(',') : '')); return base.answer(m); },
    answer: m => m.type === 'KC_LABEL_ROWS' ? { ok: true, rows } : m.type === 'KC_LABEL_TICK' ? { ok: true, ticked: m.orderIds } : { ok: true },
    idle: async () => true, printed: async () => [], arrive: async (id, ids) => [{ name: 'l.pdf', base64: 'AA==' }],
  };
  return Object.assign(base, over, { calls });
}
(async () => {
  let w = io(); let r = await W.meeshoLabelWalk(day(18, 12), w);
  assert.deepStrictEqual(r.orderIds, ['A', 'B', 'E']); assert.strictEqual(r.files.length, 1);
  assert.deepStrictEqual(w.calls, ['KC_LABEL_CHECK', 'KC_LABEL_ROWS', 'KC_LABEL_TICK:A,B,E']); ok('files come back WITH the order ids that were ticked');

  w = io({ answer: m => m.type === 'KC_LABEL_CHECK' ? { ok: false, reason: 'the "action" column heading is missing or renamed' } : { ok: true } });
  await assert.rejects(W.meeshoLabelWalk(day(18), w), /not as Click knows it.*action.*pressed nothing/); assert.deepStrictEqual(w.calls, ['KC_LABEL_CHECK']); ok('a changed page stops the walk, touching nothing');

  w = io({ idle: async () => false });
  await assert.rejects(W.meeshoLabelWalk(day(18), w), /came back to the computer/); assert.deepStrictEqual(w.calls, []); ok('computer in use: not one page action');
  let first = true;
  w = io({ idle: async () => { const v = first; first = false; return v; } });
  await assert.rejects(W.meeshoLabelWalk(day(18), w), /came back/); ok('he comes back mid-walk: it stops at the next step');

  w = io({ tab: async () => null });
  await assert.rejects(W.meeshoLabelWalk(day(18), w), /open Meesho/); ok('no Meesho tab: says so');

  w = io({ printed: async () => ['A', 'B', 'E'] }); r = await W.meeshoLabelWalk(day(18, 12), w);
  assert.deepStrictEqual(r, { files: [], orderIds: [] }); assert.ok(!w.calls.some(c => c.startsWith('KC_LABEL_TICK'))); ok('everything already printed: nothing ticked');

  w = io({ answer: m => m.type === 'KC_LABEL_ROWS' ? { ok: true, rows } : m.type === 'KC_LABEL_TICK' ? { ok: true, ticked: m.orderIds.slice(1) } : { ok: true } });
  await assert.rejects(W.meeshoLabelWalk(day(18, 12), w), /could not tick exactly/); assert.strictEqual(w.calls[w.calls.length - 1], 'KC_LABEL_TICK:'); ok('a wrong tick count unticks and stops');

  w = io({ arrive: async () => { throw new Error('boom'); } });
  await assert.rejects(W.meeshoLabelWalk(day(18, 12), w), /boom/); assert.strictEqual(w.calls[w.calls.length - 1], 'KC_LABEL_TICK:'); ok('the label step failing unticks the page');

  assert.strictEqual(W.mlwReadyUrl('https://supplier.meesho.com/panel/v3/new/fulfillment/xuptj/orders/pending?x=1'), 'https://supplier.meesho.com/panel/v3/new/fulfillment/xuptj/orders/ready-to-ship'); ok('the Pending address becomes Ready to Ship, seller id kept');

  // ── the page side, on the saved real page ──
  const jsdomDir = process.env.KC_JSDOM, saved = 'D:\\Click-saved-pages\\2026-11-17\\meesho-ready-to-ship-label-not-downloaded-2026-11-17.html';
  assert.ok(jsdomDir && fs.existsSync(saved), 'the page part needs KC_JSDOM and the saved page; it is not skipped');
  const { JSDOM } = require(path.join(jsdomDir, 'node_modules', 'jsdom'));
  const load = (html, url = 'https://supplier.meesho.com/panel/v3/new/fulfillment/xuptj/orders/ready-to-ship') => {
    const dom = new JSDOM(html, { url }); let handler;
    global.document = dom.window.document; global.location = dom.window.location; global.getComputedStyle = dom.window.getComputedStyle;
    global.chrome = { runtime: { id: 'me', onMessage: { addListener: f => { handler = f; } } } };
    delete require.cache[require.resolve('../content/meesho-labels.js')]; require('../content/meesho-labels.js');
    return msg => new Promise(res => handler(msg, { id: 'me' }, res));
  };
  const html = fs.readFileSync(saved, 'utf8');
  let send = load(html);
  assert.deepStrictEqual(await send({ type: 'KC_LABEL_CHECK' }), { ok: true }); ok('page: the saved page is recognised');
  const gr = await send({ type: 'KC_LABEL_ROWS' }); const got = gr.rows;
  assert.strictEqual(got.length, 13); assert.ok(got.every(x => /^\d{15,}$/.test(x.orderId) && x.notDownloaded && /^\d+ [A-Z][a-z]{2}/.test(x.due))); ok('page: 13 rows with order id, date, Not Downloaded');
  const two = [got[0].orderId, got[4].orderId], t = await send({ type: 'KC_LABEL_TICK', orderIds: two });
  assert.deepStrictEqual(t.ticked, two); ok('page: ticks exactly the two asked for');
  assert.deepStrictEqual((await send({ type: 'KC_LABEL_TICK', orderIds: [] })).ticked, []); ok('page: an empty list clears every tick');
  for (const [name, bad] of [['Dispatch Date/SLA', 'Dispatch Day'], ['Sub-order ID', 'Suborder'], ['select all rows', 'pick everything']]) {
    send = load(html.split(name).join(bad));
    const r = await send({ type: 'KC_LABEL_CHECK' }); assert.strictEqual(r.ok, false, name); console.log('   says: ' + r.reason);
  }
  ok('page: a renamed heading or select-all box is named, not guessed');
  send = load(html, 'https://supplier.meesho.com/panel/v3/new/fulfillment/xuptj/orders/pending');
  assert.strictEqual((await send({ type: 'KC_LABEL_CHECK' })).ok, false); ok('page: the Pending page is not Ready to Ship');
  console.log(n + ' checks passed');
})().catch(e => { console.error('FAILED', e); process.exit(1); });
