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
  runtime: { id: 'self', getURL: p => 'chrome-extension://self/' + p, onConnectExternal: { addListener: () => {} }, onMessage: { addListener: f => { handlers.msg = f; } } },
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
    getAll: async () => Object.fromEntries(Object.keys(live).map(k => [k, true])),
    create: async (id, o) => { if (!o.message) throw new Error('a notification needs a message'); const k = id || 'plain' + said.length; said.push({ id: k, ...o }); live[k] = o; },
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
const idsOf = p => Object.keys(live).filter(i => new RegExp('^kcPrint(Ask|Go)_' + p + '_\\d+$').test(i));
const idOf = p => idsOf(p)[0];
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
    assert.strictEqual(P.printShipBy(cut, T(15, 12, 0)), T(15, 12, 0), 'a print time exactly on the cutoff prints for THIS cutoff (R480C)');
    assert.strictEqual(P.printShipBy(cut, T(15, 12, 1)), T(16, 12, 0));
    assert.strictEqual(P.printShipBy({ time: 'x' }, T(15, 9, 0)), null);
  });

  // ── T1 (High): a Yes belongs to ONE print and is never applied to a later one ──
  await check('T1 old Yes, queued while a later run is in the cropper, marks nothing of it', async () => {
    await setup(['09:00', '18:00']);
    await main('meesho', T(15, 9, 0)); const id1 = idOf('meesho'); assert.ok(id1, 'run 1 asked');
    await main('meesho', T(15, 18, 0)); assert.strictEqual(bridgeCalls.length, 1, 'the open question holds the next print back');
    assert.ok(live[id1], 'and it stays on screen, answerable');
    await click(id1, 0); assert.deepStrictEqual(await marked('meesho', ['A', 'B']), ['A', 'B']);
    const go = idOf('meesho'); assert.ok(/^kcPrintGo_/.test(go), 'right after the answer: Print now for the held time');
    const g = gate(); bridgeImpl = async () => { await g.wait; return answer(['C', 'D']); };
    handlers.button(go, 0); await settle();                   // Print now: run 2 is in the cropper
    handlers.button(id1, 0); await settle();                  // the old pop-up tapped again
    g.go(); await settle();
    assert.deepStrictEqual(await marked('meesho', ['C', 'D']), [], 'nothing of run 2 marked by an answer to run 1');
    const id2 = idOf('meesho'); assert.ok(/^kcPrintAsk_/.test(id2) && id2 !== id1);
    await click(id2, 0); assert.deepStrictEqual(await marked('meesho', ['C', 'D']), ['C', 'D'], 'its own Yes works');
  });
  await check('T1 old No does not wipe the later question', async () => {
    await setup(['09:00', '18:00']);
    await main('meesho', T(15, 9, 0)); const id1 = idOf('meesho');
    await main('meesho', T(15, 18, 0)); await click(id1, 1);
    bridgeImpl = async () => answer(['A', 'B', 'C']); await click(idOf('meesho'), 0); const id2 = idOf('meesho');
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
    const ids = idsOf('meesho');
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
    const id = idOf('meesho');
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

  // ── the run, step by step (kept from the earlier design, now on one record) ──
  await check('schedule needs times AND a cutoff; times removed clears the alarm; changes are heard', async () => {
    await setup(['18:00'], ['meesho', 'flipkart']); delete store.kcCutoff.flipkart;
    handlers.changed({ kcCutoff: {} }, 'local'); await settle();
    assert.ok(alarms.kcPrint_meesho && !alarms.kcPrint_flipkart, 'no cutoff, no print alarm');
    store.kcPrintTimes = {}; handlers.changed({ kcPrintTimes: {} }, 'sync'); await settle(); assert.ok(alarms.kcPrint_meesho, 'only local changes count');
    handlers.changed({ kcPrintTimes: {} }, 'local'); await settle(); assert.ok(!alarms.kcPrint_meesho);
  });
  await check('no source yet: said, nothing asked', async () => {
    await setup(); delete P.printSources.meesho; await main('meesho', T(15, 18, 0));
    assert.ok(/cannot fetch Meesho labels/.test(said[0].message) && !bridgeCalls.length && !store.kcPrintRun_meesho);
  });
  await check('a good run: PDFs in front of him, count asked, nothing marked until Yes; No marks nothing', async () => {
    await setup(); await main('meesho', T(15, 18, 0));
    assert.strictEqual(tabs.length, 1); assert.ok(/^chrome-extension:\/\/self\/print\.html\?k=kcPrintPdfs_meesho_\d+&i=0&s=1$/.test(tabs[0]), 'silent print is the default (R480)');
    const ask = said[said.length - 1]; assert.ok(/did you get 2/.test(ask.message) && ask.requireInteraction);
    assert.deepStrictEqual(ask.buttons, [{ title: 'Yes, got them' }, { title: 'No' }]);
    assert.deepStrictEqual(await marked('meesho', ['A', 'B']), []); assert.deepStrictEqual(store.kcPrintRun_meesho.orderIds, ['A', 'B']);
    await click(idOf('meesho'), 1); assert.deepStrictEqual(await marked('meesho', ['A', 'B']), []);
    assert.ok(/Not marked as printed/.test(said[said.length - 1].message) && !store.kcPrintRun_meesho);
    await main('meesho', T(16, 18, 0)); await click(idOf('meesho'), 0); assert.deepStrictEqual(await marked('meesho', ['A', 'B']), ['A', 'B']);
  });
  await check('an order already printed is not asked about again', async () => {
    await setup(); bridgeImpl = async () => ({ ...answer(['A', 'B']), alreadyPrinted: ['A'] }); await main('meesho', T(15, 18, 0));
    assert.deepStrictEqual(store.kcPrintRun_meesho.orderIds, ['B']);
  });
  await check('R480W (N9): a source that returns { files, orderIds } decides which orders a Yes marks, not the cropper page', async () => {
    await setup(); bridgeImpl = async () => answer(['A', 'B', 'Z']);   // the page says it read Z too
    P.printSources.meesho = async () => ({ files: [{ name: 'l.pdf', base64: 'JVBERg==' }], orderIds: ['A', 'B'] }); await main('meesho', T(15, 18, 0));
    assert.deepStrictEqual(store.kcPrintRun_meesho.orderIds, ['A', 'B']);
  });
  await check('nothing to print / cropper failed: said, nothing opened, nothing asked', async () => {
    await setup(); P.printSources.meesho = async () => []; await main('meesho', T(15, 18, 0));
    assert.ok(/Nothing to print/.test(said[0].message) && !bridgeCalls.length && !store.kcPrintRun_meesho);
    await setup(); bridgeImpl = async () => ({ ok: false, reason: 'the cropper tab was closed.' }); await main('meesho', T(15, 18, 0));
    assert.ok(/not made: the cropper tab was closed/.test(said[0].message) && !tabs.length && !store.kcPrintRun_meesho);
  });
  await check('the print box is still one setting away: mode box opens the tab without the silent flag', async () => {
    await setup(); store.kcPrintTimes.meesho.mode = 'box'; await main('meesho', T(15, 18, 0)); assert.ok(/&i=0$/.test(tabs[0]));
  });
  await check('an unknown print mode falls back to silent print', async () => {
    await setup(); store.kcPrintTimes.meesho.mode = 'constructor'; await main('meesho', T(15, 18, 0)); assert.strictEqual(tabs.length, 1);
  });
  await check('a source that throws: said, record gone, next time still set', async () => {
    await setup(); P.printSources.meesho = async () => { throw new Error('page changed'); }; await main('meesho', T(15, 18, 0));
    assert.ok(/nothing was printed: page changed/.test(said[0].message) && !store.kcPrintRun_meesho && alarms.kcPrint_meesho);
  });
  await check('computer in use: asks once, waits; quiet = prints once; a stray wait prints nothing', async () => {
    await setup(); idleActive = true; await main('meesho', T(15, 18, 0));
    assert.strictEqual(store.kcPrintRun_meesho.state, 'waiting'); assert.ok(alarms.kcPrintWait_meesho); const n = said.length;
    await ring('kcPrintWait_meesho', T(15, 18, 1)); assert.strictEqual(said.length, n, 'still busy: nothing new said');
    idleActive = false; await ring('kcPrintWait_meesho', T(15, 18, 2)); assert.strictEqual(bridgeCalls.length, 1);
    assert.strictEqual(store.kcPrintRun_meesho.state, 'asked'); assert.ok(!alarms.kcPrintWait_meesho);
    await ring('kcPrintWait_meesho', T(15, 18, 3)); assert.strictEqual(bridgeCalls.length, 1);
  });
  await check('Print now while waiting prints once; the wait cannot print it again; a double click never marks', async () => {
    await setup(); idleActive = true; await main('meesho', T(15, 18, 0)); const id = idOf('meesho');
    handlers.button(id, 0); handlers.button(id, 0); await settle();
    assert.strictEqual(bridgeCalls.length, 1); assert.deepStrictEqual(await marked('meesho', ['A', 'B']), [], 'the second click is not a Yes');
    idleActive = false; await ring('kcPrintWait_meesho', T(15, 18, 2)); assert.strictEqual(bridgeCalls.length, 1);
  });
  await check('busy for over 2 hours: gives up, says so, no record', async () => {
    await setup(); idleActive = true; await main('meesho', T(15, 18, 0));
    await ring('kcPrintWait_meesho', T(15, 20, 59), T(15, 20, 59));
    assert.ok(/Nothing was printed/.test(said[said.length - 1].message) && !store.kcPrintRun_meesho && !live[Object.keys(live).find(i => /^kcPrintGo_/.test(i))]);
  });
  await check('computer was off: asks, never prints, and the next time is set again', async () => {
    await setup(); await main('meesho', T(15, 18, 0), T(15, 18, 20));
    assert.strictEqual(bridgeCalls.length, 0); assert.ok(/computer was off/.test(said[0].message) && /^kcPrintGo_meesho_/.test(said[0].id)); assert.ok(alarms.kcPrint_meesho);
  });
  await check('another platform is in the cropper: waits a minute on the same record, says nothing', async () => {
    await setup(); bridgeImpl = async () => ({ ok: false, reason: B.BRIDGE_BUSY }); await main('meesho', T(15, 18, 0));
    assert.ok(alarms.kcPrintWait_meesho && store.kcPrintRun_meesho.state === 'waiting' && !tabs.length && !said.length);
    bridgeImpl = async () => answer(['A']); await ring('kcPrintWait_meesho', T(15, 18, 1)); assert.strictEqual(store.kcPrintRun_meesho.state, 'asked');
  });
  await check('a later print time never replaces an unanswered question', async () => {
    await setup(['09:00', '18:00']); await main('meesho', T(15, 9, 0)); const id1 = idOf('meesho');
    await main('meesho', T(15, 18, 0)); assert.ok(live[id1] && store.kcPrintRun_meesho.at === T(15, 9, 0) && store.kcPrintRun_meesho.pendingAt === T(15, 18, 0));
  });
  await check('a print time with a worker restart in the middle of waiting asks instead of printing', async () => {
    await setup(); idleActive = true; await main('meesho', T(15, 18, 0)); delete alarms.kcPrintWait_meesho; idleActive = false;
    await load(); assert.strictEqual(bridgeCalls.length, 0); assert.ok(idOf('meesho') && /computer was off/.test(live[idOf('meesho')].message));
  });
  await check('a listener error is said and logged', async () => {
    await setup(); const real = console.log; let logged = ''; console.log = m => { logged += m; };
    global.computerInUse = async () => { throw new Error('idle broke'); };
    await main('meesho', T(15, 18, 0)); console.log = real; global.computerInUse = async () => idleActive;
    assert.ok(/print time: Error: idle broke/.test(logged) && said.some(s => /idle broke/.test(s.message)));
  });

  // ── what the proving run found nothing to stop (each of these goes red when its line is taken out) ──
  await check('Print now uses today\'s cutoff, counting a print time later today as yesterday\'s', async () => {
    await setup(['09:00', '18:00']); await main('meesho', T(14, 18, 0), T(16, 10, 0));
    await click(idOf('meesho'), 0); assert.deepStrictEqual(seenBy, [['meesho', T(16, 12, 0)]]);
  });
  await check('ending a run takes its wait alarm away (Print now, and switched off)', async () => {
    await setup(); idleActive = true; await main('meesho', T(15, 18, 0)); assert.ok(alarms.kcPrintWait_meesho);
    store.kcPrintTimes = {}; handlers.changed({ kcPrintTimes: {} }, 'local'); await settle(); assert.ok(!alarms.kcPrintWait_meesho);
    await setup(); idleActive = true; await main('meesho', T(15, 18, 0)); await click(idOf('meesho'), 0); assert.ok(!alarms.kcPrintWait_meesho);
  });
  await check('a lost alarm is asked about once, at start; the next time is written down; an overdue alarm is left alone', async () => {
    await setup(); assert.strictEqual(store.kcPrintNext.meesho, alarms.kcPrint_meesho.when);
    setNow(T(15, 18, 30)); delete alarms.kcPrint_meesho; store.kcPrintNext = { meesho: T(15, 18, 0) }; await load();
    assert.strictEqual(said.filter(s => /computer was off/.test(s.message)).length, 1);
    await ring('kcPrint_meesho', T(15, 18, 0), T(15, 18, 30)); assert.strictEqual(said.filter(s => /computer was off/.test(s.message)).length, 1, 'its late alarm adds no second question');
    await setup(); alarms.kcPrint_meesho = { when: T(15, 7, 0) }; await load(); assert.strictEqual(alarms.kcPrint_meesho.when, T(15, 7, 0)); assert.ok(!said.length);
  });
  await check('a slow print does not make the next schedule think its time was missed', async () => {
    await setup(); bridgeImpl = async () => { setNow(Date.now() + 6 * 60000); return answer(['A']); };
    await main('meesho', T(15, 18, 0), T(15, 18, 0), 60); assert.ok(!said.some(s => /computer was off/.test(s.message)));
  });
  await check('Print now with the cutoff gone says so; a pop-up id that is not ours does nothing', async () => {
    await setup(); idleActive = true; await main('meesho', T(15, 18, 0)); store.kcCutoff = {};
    await click(idOf('meesho'), 0); assert.ok(/no cutoff set for Meesho/.test(said[said.length - 1].message) && !bridgeCalls.length);
    const n = said.length; await click('somethingElse', 0); await click('kcPrintGo_meesho_x', 0); assert.strictEqual(said.length, n);
  });

  // ── the second Opus read (N1-N4, N8, N10) ──
  await check('N1 a "got N?" question is shown again after the browser was closed', async () => {
    await setup(); await main('meesho', T(15, 18, 0)); for (const k of Object.keys(live)) delete live[k]; delete sess.kcPrintShown;   // the browser was closed
    await load(); const id = idOf('meesho'); assert.ok(id && /did you get 2/.test(live[id].message) && live[id].buttons.length === 2);
    await click(id, 0); assert.deepStrictEqual(await marked('meesho', ['A', 'B']), ['A', 'B']);
  });
  await check('N2 a "Print now?" is shown again after the browser was closed, and not twice while it is up', async () => {
    await setup(); await main('meesho', T(15, 18, 0), T(15, 18, 20)); for (const k of Object.keys(live)) delete live[k]; delete sess.kcPrintShown;
    await load(); assert.ok(idOf('meesho') && /Print now/.test(live[idOf('meesho')].buttons[0].title)); const n = said.length;
    await load(); assert.strictEqual(said.length, n, 'a restart with the pop-up still up says nothing');
  });
  await check('N4 the next print time is set before a long print, so a time that comes meanwhile is not lost', async () => {
    await setup(['18:00', '18:03']); const g = gate(); bridgeImpl = async () => { await g.wait; return answer(['A']); };
    await main('meesho', T(15, 18, 0), T(15, 18, 0)); assert.strictEqual(alarms.kcPrint_meesho.when, T(15, 18, 3), 'still printing, next time already set');
    g.go(); await settle();
  });
  await check('N4 two platforms at one time, 6-minute prints: the second is not called missed', async () => {
    await setup(['18:00'], ['meesho', 'flipkart']); bridgeImpl = async () => { setNow(Date.now() + 6 * 60000); return answer(['A']); };
    setNow(T(15, 18, 0) + 500);
    for (const p of ['meesho', 'flipkart']) { delete alarms['kcPrint_' + p]; handlers.alarm({ name: 'kcPrint_' + p, scheduledTime: T(15, 18, 0) }); }
    await settle(80); assert.strictEqual(bridgeCalls.length, 2); assert.ok(!said.some(s => /computer was off/.test(s.message)));
  });
  await check('N8 the same print time arriving twice prints once', async () => {
    await setup(); await main('meesho', T(15, 18, 0)); await main('meesho', T(15, 18, 0)); assert.strictEqual(bridgeCalls.length, 1);
    assert.strictEqual(store.kcPrintRun_meesho.state, 'asked', 'its question is left as it was'); assert.ok(/^kcPrintAsk_/.test(idOf('meesho')));
  });
  await check('N10 a waiting print that starts by itself takes its Print now down', async () => {
    await setup(); idleActive = true; await main('meesho', T(15, 18, 0)); const id = idOf('meesho'); assert.ok(/^kcPrintGo/.test(id));
    idleActive = false; await ring('kcPrintWait_meesho', T(15, 18, 1)); assert.ok(!live[id]);
  });

  // ── the second Opus read of the fixes (M1-M3) ──
  await check('M1 a print time that comes while the last question is open holds, keeps the question answerable, sets the next time, and offers after the answer', async () => {
    await setup(['09:00', '18:00']); await main('meesho', T(15, 9, 0)); const id1 = idOf('meesho');
    await main('meesho', T(15, 18, 0));
    assert.strictEqual(bridgeCalls.length, 1); assert.ok(live[id1], 'the question is still there'); assert.ok(alarms.kcPrint_meesho, 'the next time is set (F1)');
    assert.ok(said.some(s => /not answered|have not answered/.test(s.message)), 'he is told');
    setNow(T(15, 18, 11)); await load();                      // a worker restart ten minutes later
    assert.ok(live[id1] && !said.some(s => /computer was off/.test(s.message)), 'no false "computer was off", question intact');
    await main('meesho', T(15, 18, 0)); assert.strictEqual(bridgeCalls.length, 1, 'the same time again: still nothing started (F3)');
    await click(id1, 0); assert.deepStrictEqual(await marked('meesho', ['A', 'B']), ['A', 'B'], 'Yes still marks the orders (F2)');
    assert.ok(/^kcPrintGo_/.test(idOf('meesho')), 'Print now offered after the answer');
  });
  await check('a late time, and a lost alarm, while a question is open: held too, said once', async () => {
    await setup(['09:00', '18:00']); await main('meesho', T(15, 9, 0)); const id1 = idOf('meesho');
    await main('meesho', T(15, 18, 0), T(15, 18, 30));
    assert.ok(live[id1] && store.kcPrintRun_meesho.state === 'asked' && store.kcPrintRun_meesho.pendingAt === T(15, 18, 0), 'late: held');
    await setup(['09:00', '18:00']); await main('meesho', T(15, 9, 0)); delete alarms.kcPrint_meesho; store.kcPrintNext = { meesho: T(15, 8, 0) }; setNow(T(15, 18, 0));
    handlers.changed({ kcCutoff: {} }, 'local'); await settle(); store.kcPrintNext = { meesho: T(15, 8, 0) }; delete alarms.kcPrint_meesho;
    handlers.changed({ kcCutoff: {} }, 'local'); await settle();
    assert.strictEqual(said.filter(s => /have not answered/.test(s.message)).length, 1, 'said once');
    assert.strictEqual(store.kcPrintRun_meesho.state, 'asked');
  });
  await check('F3 the same time arriving twice after an offer does not print by itself', async () => {
    await setup(); await main('meesho', T(15, 18, 0), T(15, 18, 20)); assert.strictEqual(bridgeCalls.length, 0);
    await main('meesho', T(15, 18, 0), T(15, 18, 21)); assert.strictEqual(bridgeCalls.length, 0);
  });
  await check('R1 a held print time brings back a question he closed, with the same number as the question', async () => {
    await setup(['09:00', '18:00']); await main('meesho', T(15, 9, 0)); const id1 = idOf('meesho'); delete live[id1];
    await main('meesho', T(15, 18, 0)); assert.ok(live[id1], 'the question is back');
    assert.ok(new RegExp('did you get ' + store.kcPrintRun_meesho.n + '\\?').test(said[said.length - 1].message), 'same number');
  });
  await check('R2 when the answer cannot be recorded the question comes back', async () => {
    await setup(); await main('meesho', T(15, 18, 0)); const id2 = idOf('meesho');
    markImpl = async () => { throw new Error('disk'); }; delete live[id2]; await click(id2, 0);
    assert.ok(live[id2] && store.kcPrintRun_meesho.state === 'asked', 'still answerable');
  });
  await check('R3 a platform switched off while a question was open gets no "Print now?" after the answer', async () => {
    await setup(['09:00', '18:00']); await main('meesho', T(15, 9, 0)); const id1 = idOf('meesho');
    await main('meesho', T(15, 18, 0)); store.kcPrintTimes = {}; handlers.changed({ kcPrintTimes: {} }, 'local'); await settle();
    await click(id1, 0); assert.ok(!store.kcPrintRun_meesho, 'no offer left behind');
  });
  await check('F4 one broken record does not stop the next print times being set', async () => {
    await setup(); store.kcPrintRun_flipkart = { at: 1, state: 'offer' }; delete sess.kcPrintShown; delete alarms.kcPrint_meesho; await load();
    assert.ok(alarms.kcPrint_meesho);
  });
  await check('M2 a pop-up he closed is not brought back by every worker wake-up, only after the browser was closed', async () => {
    await setup(); idleActive = true; await main('meesho', T(15, 18, 0));
    for (const k of Object.keys(live)) delete live[k];
    await load(); await load(); await load(); assert.strictEqual(Object.keys(live).length, 0, 'worker restarts alone bring nothing back');
    delete sess.kcPrintShown; await load(); assert.strictEqual(Object.keys(live).length, 1, 'a closed browser does');
  });
  await check('M3 a waiting print started by a busy cropper still has words after a restart', async () => {
    await setup(); bridgeImpl = async () => ({ ok: false, reason: B.BRIDGE_BUSY }); await main('meesho', T(15, 18, 0));
    delete sess.kcPrintShown; await load();   // its wait alarm is still there
    assert.ok(idOf('meesho') && live[idOf('meesho')].message);
  });

  // ── R496: the panel's "Print now" and the list of what the last runs did ──
  const now = platform => new Promise(r => { handlers.msg({ type: 'KC_PRINT_NOW', platform }, { id: 'self', url: 'chrome-extension://self/panel.html' }, r); });
  await check('R496 Print now prints that platform and is written in the runs list', async () => {
    await setup(['18:00'], ['meesho']); setNow(T(15, 10, 0));
    const r = await now('meesho'); assert.deepStrictEqual(r, { ok: true, waiting: false });
    assert.strictEqual(bridgeCalls.length, 1);
    const log = store.kcPrintLog; assert.strictEqual(log[0].p, 'meesho'); assert.strictEqual(log[0].bridge, 'ok'); assert.match(log[0].text, /^Printed 2/);
  });
  await check('R480W: the source is told when HE pressed Print now (no 3-minute wait), and not for a timed print', async () => {
    const opts = [], src = async (by, o) => { opts.push(o); return [{ name: 'l.pdf', base64: 'JVBERg==' }]; };
    await setup(['18:00'], ['meesho']); P.printSources.meesho = src; setNow(T(15, 10, 0)); await now('meesho');
    await setup(['18:00'], ['meesho']); P.printSources.meesho = src; await main('meesho', T(16, 18, 0));
    assert.deepStrictEqual(opts, [{ byHand: true }, { byHand: false }]);
  });
  await check('R496 Print now is refused while that platform has an open print, and from a stranger', async () => {
    await setup(['18:00'], ['meesho']); setNow(T(15, 10, 0)); await now('meesho');   // now "asked"
    const again = await now('meesho'); assert.strictEqual(again.ok, false); assert.match(again.reason, /already open/); assert.strictEqual(bridgeCalls.length, 1);
    let heard = false; handlers.msg({ type: 'KC_PRINT_NOW', platform: 'meesho' }, { id: 'someone-else' }, () => { heard = true; }); await settle();
    assert.strictEqual(heard, false); assert.strictEqual(bridgeCalls.length, 1);
    assert.strictEqual((await now('nope')).ok, false);
  });
  await check('R496 a refusal and the answer are in the runs list; the list keeps 20, newest first', async () => {
    await setup(['18:00'], ['meesho']); setNow(T(15, 10, 0)); bridgeImpl = async () => ({ ok: false, reason: 'the page did not answer' });
    await now('meesho'); assert.strictEqual(store.kcPrintLog[0].bridge, 'the page did not answer');
    bridgeImpl = async () => answer(['A']); await now('meesho'); await click(idOf('meesho'), 0);
    assert.match(store.kcPrintLog[0].text, /Answered: got them/); assert.match(store.kcPrintLog[1].text, /^Printed 1/);
    for (let i = 0; i < 25; i++) { bridgeImpl = async () => answer(['X' + i]); await now('meesho'); await click(idOf('meesho'), 1); }
    assert.strictEqual(store.kcPrintLog.length, 20);
  });

  if (failed) { console.log(failed + ' check(s) failed'); process.exit(1); }
  console.log('print checks: all passed');
})().catch(e => { console.error(e); process.exit(1); });
