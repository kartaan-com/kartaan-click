// Checks for print-flow.js: print times, the next-cutoff rule, asleep / busy, the print step, the count question.
// Run: node tools/test-print.js
'use strict';
const assert = require('assert');

const store = {}, sess = {}, alarms = {}, said = [], tabs = [];
let idleActive = false, handlers = {};
global.chrome = {
  runtime: { getURL: p => 'chrome-extension://self/' + p, onConnectExternal: { addListener: () => {} }, onMessage: { addListener: () => {} } },
  storage: {
    local: {
      get: async keys => { const o = {}; for (const k of [].concat(keys)) if (k in store) o[k] = JSON.parse(JSON.stringify(store[k])); return o; },
      set: async obj => { Object.assign(store, obj); },
      remove: async keys => { for (const k of [].concat(keys)) delete store[k]; },
    },
    session: { set: async o => { Object.assign(sess, o); }, get: async k => (k in sess ? { [k]: sess[k] } : {}), remove: async () => {} },
    onChanged: { addListener: f => { handlers.changed = f; } },
  },
  alarms: {
    clear: async n => { delete alarms[n]; }, get: async n => (alarms[n] ? { scheduledTime: alarms[n].when } : undefined),
    create: (n, i) => { alarms[n] = i; }, onAlarm: { addListener: f => { handlers.alarm = f; } },
  },
  notifications: { create: async (id, o) => { said.push({ id, ...o }); }, onButtonClicked: { addListener: f => { handlers.button = f; } } },
  tabs: { create: async o => { tabs.push(o.url); }, remove: async () => {}, onRemoved: { addListener() {}, removeListener() {} } },
};
// The pieces print-flow.js finds in the worker's shared scope.
const B = require('../cropper-bridge.js');
global.printedMark = B.printedMark;
global.computerInUse = async () => idleActive;
let bridgeCalls = [], bridgeAnswer;
global.bridgeRun = async req => { bridgeCalls.push(req); return bridgeAnswer; };
// Set before the file loads: it must put the alarms back from the saved settings by itself when the worker starts.
store.kcPrintTimes = { amazon: { times: ['07:00'] } }; store.kcCutoff = { amazon: { time: '12:00', remindMin: 0 } };
const P = require('../print-flow.js');

const at = (d, h, m) => new Date(2026, 10, d, h, m).getTime();   // 2026-11-<d> h:m local
const answer = (over = {}) => ({ ok: true, outputs: [{ name: 'o', count: 2, base64: 'AA==' }], rows: [{ orderId: 'A' }, { orderId: 'B' }],
  report: {}, leftOut: [], count: { ordersOut: 2, text: 'Labels made for 2 of 2 orders.' }, alreadyPrinted: [], ...over });
const reset = () => { for (const k of Object.keys(store)) delete store[k]; for (const k of Object.keys(alarms)) delete alarms[k]; said.length = 0; tabs.length = 0; bridgeCalls = []; idleActive = false; bridgeAnswer = answer(); };

(async () => {
  await new Promise(r => setTimeout(r, 5));
  assert.ok(alarms.kcPrint_amazon, 'alarms are put back at start');
  // ── times ──
  assert.deepStrictEqual(P.printTimesClean(['18:00', '09:00', '18:00', '25:00', 'x', 5, '9:00']), ['09:00', '18:00']);
  assert.deepStrictEqual(P.printTimesClean('nope'), []);
  assert.strictEqual(P.printTimesClean(['01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00']).length, 6);
  // several per day: the next one after now, today or tomorrow
  assert.strictEqual(P.printNextTime(['09:00', '18:00'], at(15, 10, 0)), at(15, 18, 0));
  assert.strictEqual(P.printNextTime(['09:00', '18:00'], at(15, 19, 0)), at(16, 9, 0));
  assert.strictEqual(P.printNextTime(['09:00', '18:00'], at(15, 18, 0)), at(16, 9, 0), 'exactly now is not next');
  assert.strictEqual(P.printNextTime([], at(15, 10, 0)), null);
  // ── next cutoff (D675) ──
  const cut = { time: '12:00', remindMin: 30 };
  assert.strictEqual(P.printShipBy(cut, at(15, 19, 0)), at(16, 12, 0), 'evening print looks at tomorrow noon');
  assert.strictEqual(P.printShipBy(cut, at(15, 9, 0)), at(15, 12, 0), 'morning print looks at today noon');
  assert.strictEqual(P.printShipBy(cut, at(15, 12, 0)), at(16, 12, 0), 'a print time after / at the cutoff looks at the next one');
  assert.strictEqual(P.printShipBy({ time: 'x' }, at(15, 9, 0)), null);

  // ── schedule: needs times AND a cutoff ──
  reset();
  store.kcPrintTimes = { meesho: { times: ['18:00'] }, flipkart: { times: ['18:00'] } };
  store.kcCutoff = { meesho: cut };
  await P.printSchedule();
  assert.ok(alarms.kcPrint_meesho && !alarms.kcPrint_flipkart, 'no cutoff, no print alarm');
  const due = alarms.kcPrint_meesho.when;
  await P.printSchedule(); assert.strictEqual(alarms.kcPrint_meesho.when, due);
  delete store.kcPrintTimes; await P.printSchedule(); assert.ok(!alarms.kcPrint_meesho, 'times removed clears the alarm');

  // ── no source yet: said, not silent ──
  reset(); store.kcCutoff = { meesho: cut };
  await P.printRun('meesho');
  assert.ok(/cannot fetch Meesho labels/.test(said[0].message) && bridgeCalls.length === 0);

  // ── a good run: PDFs in front of him, count asked, nothing marked until yes ──
  reset(); store.kcCutoff = { meesho: cut };
  let shipBySeen = null;
  P.printSources.meesho = async by => { shipBySeen = by; return [{ name: 'l.pdf', base64: 'JVBERg==' }]; };
  await P.printRun('meesho');
  assert.ok(shipBySeen > Date.now(), 'the source is told the next cutoff');
  assert.deepStrictEqual(tabs, ['chrome-extension://self/print.html?i=0']); assert.deepStrictEqual(sess.kcPrintPdfs, ['AA==']);
  assert.deepStrictEqual(store.kcPrintAsk, { platform: 'meesho', orderIds: ['A', 'B'], n: 2 });
  const ask = said[said.length - 1]; assert.strictEqual(ask.id, 'kcPrintAsk'); assert.ok(/did you get 2/.test(ask.message));
  assert.deepStrictEqual(ask.buttons, [{ title: 'Yes, got them' }, { title: 'No' }]); assert.strictEqual(ask.requireInteraction, true);
  assert.deepStrictEqual(await B.printedAmong('meesho', ['A', 'B']), []);
  handlers.button('kcPrintAsk', 1);                                   // No
  await new Promise(r => setTimeout(r, 5));
  assert.strictEqual(store.kcPrintAsk, undefined); assert.deepStrictEqual(await B.printedAmong('meesho', ['A']), []);
  assert.ok(/Not marked as printed/.test(said[said.length - 1].message));
  await P.printRun('meesho'); handlers.button('kcPrintAsk', 0);        // Yes
  await new Promise(r => setTimeout(r, 5));
  assert.deepStrictEqual(await B.printedAmong('meesho', ['A', 'B']), ['A', 'B']);
  // an already printed order is not asked about again
  bridgeAnswer = answer({ alreadyPrinted: ['A'] }); await P.printRun('meesho');
  assert.deepStrictEqual(store.kcPrintAsk.orderIds, ['B']);
  await P.printAnswer(true);                                           // answering with nothing waiting does nothing
  await P.printAnswer(true);

  // ── nothing to print / cropper failed: said, nothing opened, nothing asked ──
  reset(); store.kcCutoff = { meesho: cut };
  P.printSources.meesho = async () => []; await P.printRun('meesho');
  assert.ok(/Nothing to print/.test(said[0].message) && !bridgeCalls.length);
  P.printSources.meesho = async () => [{ name: 'l.pdf', base64: 'JVBERg==' }]; bridgeAnswer = { ok: false, reason: 'the cropper tab was closed.' };
  await P.printRun('meesho');
  assert.ok(/not made: the cropper tab was closed/.test(said[1].message) && !tabs.length && !store.kcPrintAsk);

  // ── the print step is one switch: an unknown mode falls back to the box ──
  reset(); store.kcCutoff = { meesho: cut }; store.kcPrintTimes = { meesho: { times: ['18:00'], mode: 'silent' } };
  await P.printRun('meesho'); assert.strictEqual(tabs.length, 1);

  // ── on time + computer free = prints; busy = waits and asks once; asleep = asks, never prints ──
  reset(); store.kcCutoff = { meesho: cut }; store.kcPrintTimes = { meesho: { times: ['18:00'] } };
  await P.printFired({ name: 'kcPrint_meesho', scheduledTime: Date.now() - 1000 });
  assert.strictEqual(bridgeCalls.length, 1, 'on time and free: printed');
  reset(); store.kcCutoff = { meesho: cut }; store.kcPrintTimes = { meesho: { times: ['18:00'] } }; idleActive = true;
  await P.printFired({ name: 'kcPrint_meesho', scheduledTime: Date.now() - 1000 });
  assert.strictEqual(bridgeCalls.length, 0); assert.ok(alarms.kcPrintWait_meesho && store.kcPrintPending.meesho);
  assert.strictEqual(said.filter(s => s.id === 'kcPrintGo_meesho').length, 1);
  const nSaid = said.length;
  await P.printFired({ name: 'kcPrintWait_meesho' });                       // still busy: waits again, no second question
  assert.strictEqual(said.length, nSaid, 'a wait alarm says nothing new');
  assert.strictEqual(said.filter(s => s.id === 'kcPrintGo_meesho').length, 1);
  idleActive = false; await P.printFired({ name: 'kcPrintWait_meesho' });   // quiet now: prints, nothing left waiting
  assert.strictEqual(bridgeCalls.length, 1); assert.ok(!store.kcPrintPending.meesho && !alarms.kcPrintWait_meesho);
  await P.printFired({ name: 'kcPrintWait_meesho' }); assert.strictEqual(bridgeCalls.length, 1, 'a stray wait alarm prints nothing');
  // "Print now" while waiting prints at once and the wait cannot print it a second time
  reset(); store.kcCutoff = { meesho: cut }; idleActive = true;
  await P.printFired({ name: 'kcPrint_meesho', scheduledTime: Date.now() - 1000 });
  handlers.button('kcPrintGo_meesho', 0); await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(bridgeCalls.length, 1); idleActive = false;
  await P.printFired({ name: 'kcPrintWait_meesho' }); assert.strictEqual(bridgeCalls.length, 1);
  // busy for over 2 hours: gives up, says so
  reset(); store.kcCutoff = { meesho: cut }; idleActive = true; store.kcPrintPending = { meesho: Date.now() - 3 * 3600 * 1000 };
  await P.printFired({ name: 'kcPrintWait_meesho' });
  assert.ok(/Nothing was printed/.test(said[0].message) && !store.kcPrintPending.meesho && !bridgeCalls.length);
  // asleep
  reset(); store.kcCutoff = { meesho: cut }; store.kcPrintTimes = { meesho: { times: ['18:00'] } };
  await P.printFired({ name: 'kcPrint_meesho', scheduledTime: Date.now() - 20 * 60 * 1000 });
  assert.strictEqual(bridgeCalls.length, 0); assert.ok(/computer was off/.test(said[0].message) && said[0].id === 'kcPrintGo_meesho');
  assert.ok(alarms.kcPrint_meesho, 'the next print time is set again');

  // the worker's own listeners reach the same code
  reset(); store.kcCutoff = { meesho: cut }; store.kcPrintTimes = { meesho: { times: ['18:00'] } };
  handlers.changed({ kcPrintTimes: {} }, 'sync'); await new Promise(r => setTimeout(r, 5)); assert.ok(!alarms.kcPrint_meesho, 'only local changes count');
  handlers.changed({ kcPrintTimes: {} }, 'local'); await new Promise(r => setTimeout(r, 5)); assert.ok(alarms.kcPrint_meesho);
  handlers.alarm({ name: 'kcPrint_other' }); handlers.alarm({ name: 'kcCutoff_meesho' });
  P.printSources.meesho = async () => [{ name: 'l.pdf', base64: 'JVBERg==' }];
  handlers.alarm({ name: 'kcPrint_meesho', scheduledTime: Date.now() }); await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(bridgeCalls.length, 1);

  console.log('print checks: all passed');
})().catch(e => { console.error(e); process.exit(1); });
