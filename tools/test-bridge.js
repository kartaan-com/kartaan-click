// Checks for the Label Cropper bridge in cropper-bridge.js. Run: node tools/test-bridge.js
'use strict';
const assert = require('assert');

const store = {}, sess = { kcBridgeTab: 77 };
let connectHandler = null, messageHandler = null, pings = 0, createFails = false, failSet = false;
let nextTab = 10, removedTabs = [], removedListeners = [];
global.chrome = {
  runtime: { id: 'self', getURL: p => 'chrome-extension://self/' + p, getPlatformInfo: cb => { pings++; if (cb) cb({}); }, lastError: undefined, onConnectExternal: { addListener: f => { connectHandler = f; } }, onMessage: { addListener: f => { messageHandler = f; } } },
  storage: { session: {
    set: async o => { Object.assign(sess, o); }, remove: async k => { delete sess[k]; },
    get: async k => (k in sess ? { [k]: sess[k] } : {}),
  }, local: {
    get: async keys => { const o = {}; for (const k of [].concat(keys)) if (k in store) o[k] = JSON.parse(JSON.stringify(store[k])); await new Promise(r => realSetTimeout(r, 1)); return o; },
    set: async obj => { if (failSet) { failSet = false; throw new Error('disk full'); } Object.assign(store, obj); },
    remove: async keys => { for (const k of [].concat(keys)) delete store[k]; },
  } },
  tabs: {
    create: async () => { if (createFails) throw new Error('no tabs'); return { id: nextTab++ }; },
    remove: async id => { removedTabs.push(id); },
    onRemoved: { addListener: f => removedListeners.push(f), removeListener: f => { removedListeners = removedListeners.filter(x => x !== f); } },
  },
};
// Shorten every wait so the time-out cases run at once.
const realSetTimeout = global.setTimeout;
global.setTimeout = (f, ms) => realSetTimeout(f, Math.min(ms, 150));
const realSetInterval = global.setInterval;
global.setInterval = (f, ms) => realSetInterval(f, Math.min(ms, 10));
const B = require('../cropper-bridge.js');

const goodSender = tab => ({ tab: { id: tab }, frameId: 0, url: 'https://kartaan.com/label-cropper/#from-click' });
function fakePort(sender) {
  const p = { sender, sent: [], disconnected: false, handlers: [], dis: [] };
  p.postMessage = m => p.sent.push(m);
  p.disconnect = () => { p.disconnected = true; };
  p.onMessage = { addListener: f => p.handlers.push(f) };
  p.onDisconnect = { addListener: f => p.dis.push(f) };
  return p;
}
const tick = () => new Promise(r => realSetTimeout(r, 5));
const files = [{ name: 'a.pdf', base64: 'JVBERi0=' }];
const result = (id, over = {}) => ({ v: 1, id, type: 'result', outputs: [{ name: 'o.pdf', count: 3, base64: 'AA==' }], rows: [{ orderId: 'X1' }, { orderId: 'X2' }, { orderId: 'X3' }], report: { ordersIn: 3, ordersOut: 3, unread: [] }, leftOut: [], ...over });

(async () => {
  // ── the count (D782) ──
  assert.strictEqual(B.bridgeCount(result('i')).matches, true);
  const c3 = B.bridgeCount(result('i', { report: { ordersIn: 5, ordersOut: 3, unread: [{}, {}] } }));
  assert.deepStrictEqual([c3.ordersIn, c3.ordersOut, c3.unread, c3.filesLeftOut], [5, 3, 2, 0]);
  assert.ok(/3 of 5 orders; 2 could not be read/.test(c3.text));
  assert.strictEqual(B.bridgeCount(result('i', { report: { ordersIn: 3, ordersOut: 2, unread: [{}] } })).matches, false);
  const left = B.bridgeCount(result('i', { leftOut: [{ file: 'b.pdf', reason: 'is empty' }] }));
  assert.strictEqual(left.matches, false); assert.ok(/1 file\(s\) left out/.test(left.text));   // a file left out is never lost from the count
  assert.strictEqual(B.bridgeCount({}).matches, true);                                           // nothing read, nothing out: nothing hidden

  // ── port check: only the tab Click opened, top frame, the cropper's own page ──
  const run = { tabId: 7 };
  assert.ok(B.bridgePortAllowed({ sender: goodSender(7) }, run));
  assert.ok(!B.bridgePortAllowed({ sender: goodSender(8) }, run), 'another tab');
  assert.ok(!B.bridgePortAllowed({ sender: { ...goodSender(7), frameId: 3 } }, run), 'a frame');
  assert.ok(!B.bridgePortAllowed({ sender: { ...goodSender(7), url: 'https://evil.example/label-cropper/' } }, run), 'another site');
  assert.ok(!B.bridgePortAllowed({ sender: { ...goodSender(7), url: 'https://kartaan.com/other' } }, run), 'another page');
  assert.ok(!B.bridgePortAllowed({ sender: { ...goodSender(7), url: 'https://kartaan.com.evil.example/label-cropper/' } }, run), 'look-alike host');
  assert.ok(!B.bridgePortAllowed({ sender: {} }, run), 'no tab');
  assert.ok(!B.bridgePortAllowed({ sender: goodSender(7) }, null), 'no run going');

  // ── printed record (D652) ──
  assert.strictEqual(await B.printedMark('meesho', ['A', 'B', 'A', '', 5]), 2);
  assert.strictEqual(await B.printedMark('meesho', ['A']), 0);
  assert.deepStrictEqual(await B.printedAmong('meesho', ['A', 'C']), ['A']);
  assert.deepStrictEqual(await B.printedAmong('flipkart', ['A']), []);    // per platform
  assert.strictEqual(await B.printedMark('nowhere', ['A']), 0);

  // ── refusals before anything opens ──
  assert.deepStrictEqual(await B.bridgeRun({ platform: 'meesho', files: [] }), { ok: false, reason: 'nothing to print' });
  assert.strictEqual((await B.bridgeRun({ platform: 'x', files })).ok, false);
  assert.strictEqual(nextTab, 10, 'no tab opened for nothing');

  // ── happy run ──
  let p = B.bridgeRun({ platform: 'meesho', files });
  await tick();
  const port = fakePort(goodSender(10));
  B.bridgeOnConnect(port);
  assert.strictEqual(port.sent.length, 1);
  assert.strictEqual(port.sent[0].type, 'crop'); assert.strictEqual(port.sent[0].v, 1);
  const id = port.sent[0].id;
  // a second run while one is going is refused
  assert.strictEqual((await B.bridgeRun({ platform: 'meesho', files })).reason, 'a print run is already going');
  await new Promise(r => realSetTimeout(r, 25));                    // the crop takes a while: the worker must be pinged meanwhile
  port.handlers[0](result('someone-elses-id'));                     // a wrong id is ignored
  port.handlers[0](result(id, { rows: [{ orderId: 'A' }, { orderId: 'N' }] }));
  const r = await p;
  assert.strictEqual(r.ok, true, JSON.stringify(r)); assert.deepStrictEqual(r.alreadyPrinted, ['A']);
  assert.strictEqual(r.count.matches, true); assert.strictEqual(r.count.ordersOut, 3);
  assert.ok(port.disconnected, 'port closed after'); assert.strictEqual(removedListeners.length, 0, 'tab listener removed');
  assert.ok(pings > 0, 'worker kept alive while the run was out');
  assert.ok(removedTabs.includes(10), 'cropper tab closed after');
  assert.strictEqual(sess.kcBridgeTab, undefined, 'tab record cleared');
  assert.strictEqual((await B.printedAmong('meesho', ['N'])).length, 0, 'the run itself marks nothing printed');

  let f;
  // ── settings pass through; a message that is not a result is ignored; a fresh lock refuses ──
  p = B.bridgeRun({ platform: 'meesho', files, settings: { a: 1 } });
  await tick();
  const ps = fakePort(goodSender(nextTab - 1)); B.bridgeOnConnect(ps);
  assert.deepStrictEqual(ps.sent[0].settings, { a: 1 });
  ps.handlers[0]({ v: 1, id: ps.sent[0].id, type: 'progress' });
  assert.ok(sess.kcBridgeTab >= 10, 'the run records its tab');
  ps.handlers[0](result(ps.sent[0].id));
  const psr = await p; assert.strictEqual(psr.ok, true); assert.strictEqual(psr.outputs.length, 1, 'the progress message was not taken for the answer');

  // ── connected but never answers = the answer time-out, not the connect one ──
  p = B.bridgeRun({ platform: 'meesho', files });
  await tick();
  B.bridgeOnConnect(fakePort(goodSender(nextTab - 1)));
  f = await p; assert.ok(/did not answer/.test(f.reason));

  // ── Chrome cannot open the tab ──
  createFails = true;
  f = await B.bridgeRun({ platform: 'meesho', files });
  assert.ok(!f.ok && /no tabs/.test(f.reason)); createFails = false;
  assert.strictEqual(sess.kcBridgeTab, undefined);

  // ── Click's own message handler: only Click's own pages ──
  assert.strictEqual(connectHandler, B.bridgeOnConnect);
  let answered = null;
  assert.strictEqual(messageHandler({ type: 'KC_MARK_PRINTED', platform: 'meesho', orderIds: ['Z9'] }, { id: 'other', url: 'chrome-extension://other/x.html' }, () => {}), undefined);
  assert.deepStrictEqual(await B.printedAmong('meesho', ['Z9']), []);
  assert.strictEqual(messageHandler({ type: 'KC_MARK_PRINTED', platform: 'meesho', orderIds: ['Z9'] }, { id: 'self', url: 'chrome-extension://self/options.html' }, r => { answered = r; }), true);
  await tick(); assert.deepStrictEqual(answered, { ok: true, marked: 1 });
  let crop = null;
  assert.strictEqual(messageHandler({ type: 'KC_CROP', platform: 'meesho', files: [] }, { id: 'self', url: 'chrome-extension://self/options.html' }, r => { crop = r; }), true);
  await tick(); assert.strictEqual(crop.reason, 'nothing to print');

  // Click's own script inside a seller page (same extension id, the page's address) is not let in
  assert.strictEqual(messageHandler({ type: 'KC_CROP', platform: 'meesho', files }, { id: 'self', url: 'https://supplier.meesho.com/x' }, () => {}), undefined);
  assert.strictEqual(B.bridgeSenderOk(null), false);

  // ── two requests at once: only one opens a tab; the other's end does not free the first ──
  const tabsBefore = nextTab;
  const first = B.bridgeRun({ platform: 'meesho', files });
  const second = await B.bridgeRun({ platform: 'meesho', files });
  assert.strictEqual(second.reason, 'a print run is already going');
  await tick();
  assert.strictEqual(nextTab, tabsBefore + 1, 'one tab only');
  // a second port from the same tab is cut; the first stays
  const one = fakePort(goodSender(nextTab - 1)); B.bridgeOnConnect(one);
  const two = fakePort(goodSender(nextTab - 1)); B.bridgeOnConnect(two);
  assert.ok(two.disconnected && two.sent.length === 0 && !one.disconnected);
  one.handlers[0](result(one.sent[0].id, { report: { ordersIn: 3, ordersOut: 3, unread: [], problems: [{}] }, ignored: ['x'], outputs: 'not a list' }));
  const fr = await first;
  assert.strictEqual(fr.count.matches, false); assert.ok(/1 need a look/.test(fr.count.text));   // the page's own "problems" count
  assert.deepStrictEqual(fr.ignored, ['x']); assert.deepStrictEqual(fr.outputs, []);

  // ── printed record: other platform on the row, odd ids, two marks at once ──
  await B.printedMark('flipkart', ['F1']);
  p = B.bridgeRun({ platform: 'meesho', files });
  await tick();
  const pf = fakePort(goodSender(nextTab - 1)); B.bridgeOnConnect(pf);
  pf.handlers[0](result(pf.sent[0].id, { rows: [{ orderId: 'F1', platform: 'flipkart' }, { orderId: 'F1', platform: 'meesho' }, { orderId: 'constructor' }, { orderId: '__proto__' }] }));
  assert.deepStrictEqual((await p).alreadyPrinted, ['F1']);
  assert.deepStrictEqual(await B.printedAmong('meesho', ['constructor', 'toString', '__proto__']), []);
  assert.strictEqual(await B.printedMark('meesho', ['__proto__', 'constructor']), 1);
  await Promise.all([B.printedMark('amazon', ['M1']), B.printedMark('amazon', ['M2'])]);
  assert.deepStrictEqual(await B.printedAmong('amazon', ['M1', 'M2']), ['M1', 'M2']);

  // ── a worker that restarted mid-run: its leftover cropper tab was closed at load; nothing left = nothing closed ──
  assert.ok(removedTabs.includes(77) && sess.kcBridgeTab === undefined);
  const nRemoved = removedTabs.length;
  await B.bridgeCloseLeftover(); assert.strictEqual(removedTabs.length, nRemoved);
  sess.kcBridgeTab = 55; await B.bridgeCloseLeftover();
  assert.ok(removedTabs.includes(55) && sess.kcBridgeTab === undefined);
  // a failed save does not stop the next mark
  failSet = true; await assert.rejects(B.printedMark('amazon', ['Q1']));
  assert.strictEqual(await B.printedMark('amazon', ['Q2']), 1);

  // ── a port from the wrong tab is cut and the run goes on waiting ──
  p = B.bridgeRun({ platform: 'meesho', files });
  await tick();
  const bad = fakePort(goodSender(999));
  B.bridgeOnConnect(bad);
  assert.ok(bad.disconnected && bad.sent.length === 0);
  assert.strictEqual((await p).ok, false);                           // and ends by the connect time-out

  // ── cropper tab closed mid-run = failed ──
  p = B.bridgeRun({ platform: 'meesho', files });
  await tick();
  const pm = fakePort(goodSender(nextTab - 1)); B.bridgeOnConnect(pm);
  removedListeners.forEach(f => f(nextTab - 1));
  f = await p; assert.strictEqual(f.ok, false); assert.ok(/tab was closed/.test(f.reason));

  // ── page closes the port without an answer = failed ──
  p = B.bridgeRun({ platform: 'meesho', files });
  await tick();
  const pc = fakePort(goodSender(nextTab - 1)); B.bridgeOnConnect(pc);
  pc.dis[0]();
  f = await p; assert.strictEqual(f.ok, false); assert.ok(/closed before/.test(f.reason));

  // ── the page says error ──
  p = B.bridgeRun({ platform: 'meesho', files });
  await tick();
  const pe = fakePort(goodSender(nextTab - 1)); B.bridgeOnConnect(pe);
  pe.handlers[0]({ v: 1, id: pe.sent[0].id, type: 'error', reason: 'no file could be read', leftOut: [{ file: 'a.pdf' }] });
  f = await p; assert.strictEqual(f.ok, false); assert.strictEqual(f.reason, 'no file could be read'); assert.strictEqual(f.leftOut.length, 1);

  // ── never connects ──
  f = await B.bridgeRun({ platform: 'meesho', files });
  assert.ok(!f.ok && /did not connect/.test(f.reason));
  assert.strictEqual(sess.kcBridgeTab, undefined);

  console.log('bridge checks: all passed');
})().catch(e => { console.error(e); process.exit(1); });
