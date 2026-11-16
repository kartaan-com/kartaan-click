// Checks for print-flow.js: print times, the next-cutoff rule, and one print run per platform (waiting -> printing -> asked -> answered / expired).
// Run: node tools/test-print.js
// T1-T11 are the third reviewer's cases (REVIEW_R480.md "Third read"); every one was written to fail before the rebuild.
// The stand-ins behave like Chrome: a fired one-time alarm is gone, an overdue alarm fires at start, a pop-up stays until cleared,
// and a worker restart is a fresh copy of the code with the same saved records.
'use strict';
const assert = require('assert');

const store = {}, sess = {}, alarms = {}, said = [], tabs = [], live = {};
let idleActive = false, handlers = {}, off = 0, bridgeCalls = [], bridgeImpl, markImpl, alarmGetBroken = false;
const realNow = Date.now; Date.now = () => realNow() + off;
const setNow = ms => { off = ms - realNow(); };
const clone = v => JSON.parse(JSON.stringify(v));
global.chrome = {
  runtime: { getURL: p => 'chrome-extension://self/' + p, onConnectExternal: { addListener: () => {} }, onMessage: { addListener: () => {} } },
  storage: {
    local: {
      get: async keys => { const o = {}; for (const k of [].concat(keys)) if (k in store) o[k] = clone(store[k]); return o; },
      set: async obj => { Object.assign(store, clone(obj)); },
      remove: async keys => { for (const k of [].concat(keys)) delete store[k]; },
    },
    session: {
      set: async o => { Object.assign(sess, o); }, get: async k => (k in sess ? { [k]: sess[k] } : {}),
      remove: async keys => { for (const k of [].concat(keys)) delete sess[k]; },
    },
    onChanged: { addListener: f => { handlers.changed = f; } },
  },
  alarms: {
    clear: async n => { delete alarms[n]; },
    get: async n => { if (alarmGetBroken) throw new Error('alarms gone'); return alarms[n] ? { scheduledTime: alarms[n].when } : undefined; },
    create: (n, i) => { alarms[n] = { when: i.when !== undefined ? i.when : Date.now() + i.delayInMinutes * 60000 }; },
    onAlarm: { addListener: f => { handlers.alarm = f; } },
  },
  notifications: {
    clear: id => { delete live[id]; },
    create: async (id, o) => { const k = id || 'plain' + said.length; said.push({ id: k, ...o }); live[k] = o; },
    onButtonClicked: { addListener: f => { handlers.button = f; } },
  },
  tabs: { create: async o => { tabs.push(o.url); }, remove: async () => {}, onRemoved: { addListener() {}, removeListener() {} } },
};
const B = require('../cropper-bridge.js');
markImpl = B.printedMark;
global.printedMark = (...a) => markImpl(...a);
global.BRIDGE_BUSY = B.BRIDGE_BUSY;
global.computerInUse = async () => idleActive;
global.bridgeRun = async req => { bridgeCalls.push(req); return bridgeImpl(req); };

const settle = (ms = 25) => new Promise(r => setTimeout(r, ms));
const T = (d, h, m) => new Date(2026, 10, d, h, m).getTime();   // 2026-11-<d> h:m local (the 14th is a Saturday)
const cut = { time: '12:00', remindMin: 0 };
const answer = ids => ({ ok: true, outputs: [{ name: 'o', count: ids.length, base64: 'AA==' }], rows: ids.map(orderId => ({ orderId })), report: {}, leftOut: [],
  count: { ordersOut: ids.length, text: 'Labels made for ' + ids.length + ' of ' + ids.length + ' orders.' }, alreadyPrinted: [] });
const modPath = require.resolve('../print-flow.js');
let P, seenBy = [];
// The worker starting: a fresh copy of the code, the saved records and alarms kept.
async function load() {
  delete require.cache[modPath]; P = require(modPath);
  for (const p of ['meesho', 'flipkart', 'amazon']) P.printSources[p] = async by => { seenBy.push([p, by]); return [{ name: 'l.pdf', base64: 'JVBERg==' }]; };
  await settle();
}
async function setup(times = ['18:00'], platforms = ['meesho'], now = T(15, 8, 0)) {
  for (const o of [store, sess, alarms, live]) for (const k of Object.keys(o)) delete o[k];
  said.length = 0; tabs.length = 0; bridgeCalls = []; seenBy = []; idleActive = false; alarmGetBroken = false; markImpl = B.printedMark;
  bridgeImpl = async () => answer(['A', 'B']); setNow(now);
  store.kcCutoff = {}; store.kcPrintTimes = {};
  for (const p of platforms) { store.kcCutoff[p] = cut; store.kcPrintTimes[p] = { times }; }
  await load();
}
// Chrome fires an alarm: it is removed, the browser clock is at `at`, the worker hears it.
async function ring(name, scheduledTime, at = scheduledTime + 1000, ms) { delete alarms[name]; setNow(at); handlers.alarm({ name, scheduledTime }); await settle(ms); }
const main = (p, t, at, ms) => ring('kcPrint_' + p, t, at, ms);
const click = async (id, b) => { handlers.button(id, b); await settle(); };
const idOf = p => Object.keys(live).find(i => i.startsWith('kcPrintAsk_' + p + '_'));
const marked = (p, ids) => B.printedAmong(p, ids);
const gate = () => { let go; const wait = new Promise(r => { go = r; }); return { wait, go }; };

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ' -- ' + String(e.message).split('\n')[0]); }
}

(async () => {
  await settle(5);
  // ── times and the next cutoff (pure) ──
  await load();
  await check('print times are cleaned', async () => {
    assert.deepStrictEqual(P.printTimesClean(['18:00', '09:00', '18:00', '25:00', 'x', 5, '9:00']), ['09:00', '18:00']);
    assert.deepStrictEqual(P.printTimesClean('nope'), []);
    assert.strictEqual(P.printTimesClean(['01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00']).length, 6);
  });
  await check('next print time, several per day', async () => {
    assert.strictEqual(P.printNextTime(['09:00', '18:00'], T(15, 10, 0)), T(15, 18, 0));
    assert.strictEqual(P.printNextTime(['09:00', '18:00'], T(15, 19, 0)), T(16, 9, 0));
    assert.strictEqual(P.printNextTime(['09:00', '18:00'], T(15, 18, 0)), T(16, 9, 0), 'exactly now is not next');
    assert.strictEqual(P.printNextTime([], T(15, 10, 0)), null);
  });
  await check('next cutoff (D675)', async () => {
    assert.strictEqual(P.printShipBy(cut, T(15, 19, 0)), T(16, 12, 0));
    assert.strictEqual(P.printShipBy(cut, T(15, 9, 0)), T(15, 12, 0));
    assert.strictEqual(P.printShipBy(cut, T(15, 12, 0)), T(16, 12, 0));
    assert.strictEqual(P.printShipBy({ time: 'x' }, T(15, 9, 0)), null);
  });

  // ── T1 (High): a Yes belongs to ONE print and is never applied to a later one ──
  await check('T1 old Yes, queued while a later run is in the cropper, marks nothing', async () => {
    await setup(['09:00', '18:00']);
    await main('meesho', T(15, 9, 0)); const id1 = idOf('meesho'); assert.ok(id1, 'run 1 asked');
    const g = gate(); bridgeImpl = async () => { await g.wait; return answer(['A', 'B', 'C']); };
    await main('meesho', T(15, 18, 0));                       // run 2 is in the cropper
    handlers.button(id1, 0); await settle();                  // he answers the 09:00 pop-up now
    g.go(); await settle();
    assert.deepStrictEqual(await marked('meesho', ['A', 'B', 'C']), [], 'nothing marked by an answer to another print');
    const id2 = idOf('meesho'); assert.ok(id2 && id2 !== id1 && !live[id1], 'only the new question is on screen');
    await click(id2, 0); assert.deepStrictEqual(await marked('meesho', ['A', 'B', 'C']), ['A', 'B', 'C'], 'its own Yes still works');
  });
  await check('T1 old No does not wipe the later question', async () => {
    await setup(['09:00', '18:00']);
    await main('meesho', T(15, 9, 0)); const id1 = idOf('meesho');
    bridgeImpl = async () => answer(['A', 'B', 'C']); await main('meesho', T(15, 18, 0)); const id2 = idOf('meesho');
    await click(id1, 1); await click(id2, 0);
    assert.deepStrictEqual(await marked('meesho', ['A', 'B', 'C']), ['A', 'B', 'C']);
  });

  // ── T2 (High): after the computer was off, a waiting print asks, it never prints by itself ──
  await check('T2 a wait alarm that fires hours late asks, does not print', async () => {
    await setup(); idleActive = true;
    await main('meesho', T(15, 18, 0));                       // in use: waits
    assert.ok(alarms.kcPrintWait_meesho); idleActive = false;
    await ring('kcPrintWait_meesho', T(15, 18, 1), T(16, 7, 0));   // next morning: the overdue wait alarm fires
    assert.strictEqual(bridgeCalls.length, 0, 'nothing printed by itself');
    assert.ok(Object.values(live).some(o => /computer was off/.test(o.message) && o.buttons), 'he is asked');
  });
  await check('T2 wait alarm then the next main alarm, both late: one print, on his click, never twice', async () => {
    await setup(); idleActive = true;
    await main('meesho', T(15, 18, 0)); idleActive = false;
    const t1 = T(16, 19, 0);
    await ring('kcPrintWait_meesho', T(15, 18, 1), t1); await main('meesho', T(16, 18, 0), t1);
    assert.strictEqual(bridgeCalls.length, 0);
    const ids = Object.keys(live).filter(i => i.startsWith('kcPrintAsk_meesho_'));
    assert.strictEqual(ids.length, 1, 'one question for the platform');
    await click(ids[0], 0); assert.strictEqual(bridgeCalls.length, 1);
    await click(ids[0], 0); assert.strictEqual(bridgeCalls.length, 1, 'a second click prints nothing');
  });

  // ── T3 (Medium): lateness is judged when the alarm FIRED, not when its turn came ──
  await check('T3 three platforms at one time, slow runs: all print, no false "computer was off"', async () => {
    await setup(['18:00'], ['meesho', 'flipkart', 'amazon']);
    bridgeImpl = async () => { setNow(Date.now() + 3 * 60000); return answer(['A']); };
    setNow(T(15, 18, 0) + 500);
    for (const p of ['meesho', 'flipkart', 'amazon']) { delete alarms['kcPrint_' + p]; handlers.alarm({ name: 'kcPrint_' + p, scheduledTime: T(15, 18, 0) }); }
    await settle(80);
    assert.deepStrictEqual(bridgeCalls.map(c => c.platform).sort(), ['amazon', 'flipkart', 'meesho']);
    assert.ok(!said.some(s => /computer was off/.test(s.message)));
  });

  // ── T4 (Medium): a print cut off by the browser closing is asked about at the next start ──
  await check('T4 a print that never finished is offered again, with a word, at the next start', async () => {
    await setup();
    bridgeImpl = () => new Promise(() => {});                 // the cropper never answers: the browser closes
    await main('meesho', T(15, 18, 0));
    bridgeImpl = async () => answer(['A', 'B']); await load();   // the next start
    const id = Object.keys(live).find(i => i.startsWith('kcPrintAsk_meesho_'));
    assert.ok(id && /did not finish/.test(live[id].message), 'asked, with a message');
    assert.strictEqual(bridgeCalls.length, 1, 'nothing printed by itself');
    await click(id, 0); assert.strictEqual(bridgeCalls.length, 2); assert.strictEqual(tabs.length, 1);
  });

  // ── T5 (Medium): a late "Print now" works out the cutoff from the print time that has passed, not the old alarm ──
  await check('T5 after a weekend off, Print now uses Monday\'s cutoff', async () => {
    await setup(['09:00'], ['meesho'], T(14, 8, 0)); alarms.kcPrint_meesho = { when: T(14, 9, 0) }; store.kcPrintNext = { meesho: T(14, 9, 0) };
    await ring('kcPrint_meesho', T(14, 9, 0), T(16, 10, 0));   // the browser was off from Saturday to Monday
    const id = idOf('meesho'); assert.ok(id, 'asked');
    await click(id, 0); assert.deepStrictEqual(seenBy, [['meesho', T(16, 12, 0)]], 'Monday noon, not Saturday noon');
  });

  // ── T6 (Low): the order is marked first; only then does the question go ──
  await check('T6 a failed mark keeps the question and says so', async () => {
    await setup(); await main('meesho', T(15, 18, 0)); const id = idOf('meesho');
    markImpl = async () => { throw new Error('disk full'); };
    await click(id, 0);
    assert.ok(/could not record/.test(said[said.length - 1].message) && !/nothing was printed/.test(said[said.length - 1].message), 'its own message');
    markImpl = B.printedMark; await click(id, 0);
    assert.deepStrictEqual(await marked('meesho', ['A', 'B']), ['A', 'B'], 'the same question still works');
  });

  // ── T7 (Low): switching a platform off takes down its Print now ──
  await check('T7 removing the print times clears a live Print now', async () => {
    await setup(); idleActive = true; await main('meesho', T(15, 18, 0));
    const id = idOf('meesho'); assert.ok(id, 'Time to print pop-up is up');
    store.kcPrintTimes = {}; handlers.changed({ kcPrintTimes: {} }, 'local'); await settle();
    assert.ok(!live[id], 'pop-up taken down'); await click(id, 0); assert.strictEqual(bridgeCalls.length, 0);
  });
  await check('T7 an overdue alarm for a switched-off platform asks nothing', async () => {
    await setup(); store.kcPrintTimes = {}; await main('meesho', T(15, 17, 0), T(15, 19, 0));
    assert.ok(!said.length && !bridgeCalls.length);
  });

  // ── T8 (Low): a late time is asked about once ──
  await check('T8 a lost alarm then its late alarm: one question', async () => {
    await setup(); setNow(T(15, 18, 30)); store.kcPrintNext = { meesho: T(15, 18, 0) };
    await load();
    await ring('kcPrint_meesho', T(15, 18, 0), T(15, 18, 30));
    assert.strictEqual(said.filter(s => /computer was off/.test(s.message)).length, 1);
  });

  // ── T9 (Low): each run keeps its own PDFs, and they go once it is answered ──
  await check('T9 PDFs are kept per run and removed after the answer', async () => {
    await setup(['18:00'], ['meesho', 'flipkart']);
    await main('meesho', T(15, 18, 0)); await main('flipkart', T(15, 18, 0));
    const keys = () => Object.keys(sess).filter(k => k.startsWith('kcPrintPdfs'));
    assert.strictEqual(keys().length, 2); assert.notStrictEqual(tabs[0], tabs[1]);
    await click(idOf('meesho'), 0); assert.strictEqual(keys().length, 1);
    await click(idOf('flipkart'), 1); assert.strictEqual(keys().length, 0);
  });

  // ── T10 (Low): each failure says what it is ──
  await check('T10 a schedule error is not called "nothing was printed"', async () => {
    await setup(); alarmGetBroken = true; handlers.changed({ kcCutoff: {} }, 'local'); await settle();
    assert.ok(said.length && said.every(s => !/nothing was printed/i.test(s.message)), said.map(s => s.message).join(' | '));
  });

  // ── T11 (Low): no dead code ──
  await check('T11 printRun is gone (only alarms and clicks start a print)', async () => {
    assert.strictEqual(P.printRun, undefined); assert.strictEqual(P.printRunNow, undefined);
  });

  if (failed) { console.log(failed + ' check(s) failed'); process.exit(1); }
  console.log('print checks: all passed');
})().catch(e => { console.error(e); process.exit(1); });
