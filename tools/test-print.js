// Checks for print-flow.js: print times, the next-cutoff rule, asleep / busy, the print step, the count question.
// Run: node tools/test-print.js
'use strict';
const assert = require('assert');

const store = {}, sess = {}, alarms = {}, said = [], tabs = [], cleared = [];
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
  notifications: { clear: id => { cleared.push(id); }, create: async (id, o) => { said.push({ id, ...o }); }, onButtonClicked: { addListener: f => { handlers.button = f; } } },
  tabs: { create: async o => { tabs.push(o.url); }, remove: async () => {}, onRemoved: { addListener() {}, removeListener() {} } },
};
// The pieces print-flow.js finds in the worker's shared scope.
const B = require('../cropper-bridge.js');
global.printedMark = B.printedMark;
global.BRIDGE_BUSY = B.BRIDGE_BUSY;
global.computerInUse = async () => idleActive;
let bridgeCalls = [], bridgeAnswer;
global.bridgeRun = async req => { bridgeCalls.push(req); return bridgeAnswer; };
// Set before the file loads: it must put the alarms back from the saved settings by itself when the worker starts.
store.kcPrintTimes = { amazon: { times: ['07:00'] } }; store.kcCutoff = { amazon: { time: '12:00', remindMin: 0 } };
const P = require('../print-flow.js');

// Chrome removes a one-time alarm when it fires.
const fire = a => { delete alarms[a.name]; return P.printFired(a); };
const clickGo = async p => { handlers.button('kcPrintGo_' + p, 0); await new Promise(r => setTimeout(r, 15)); };
const at = (d, h, m) => new Date(2026, 10, d, h, m).getTime();   // 2026-11-<d> h:m local
const answer = (over = {}) => ({ ok: true, outputs: [{ name: 'o', count: 2, base64: 'AA==' }], rows: [{ orderId: 'A' }, { orderId: 'B' }],
  report: {}, leftOut: [], count: { ordersOut: 2, text: 'Labels made for 2 of 2 orders.' }, alreadyPrinted: [], ...over });
const reset = () => { for (const k of Object.keys(store)) delete store[k]; for (const k of Object.keys(alarms)) delete alarms[k]; said.length = 0; tabs.length = 0; cleared.length = 0; bridgeCalls = []; idleActive = false; bridgeAnswer = answer(); };

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
  const due = alarms.kcPrint_meesho.when; assert.strictEqual(store.kcPrintNext.meesho, due, 'the next time is written down');
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
  assert.deepStrictEqual(store.kcPrintAsk, { meesho: { orderIds: ['A', 'B'] } });
  const ask = said[said.length - 1]; assert.strictEqual(ask.id, 'kcPrintAsk_meesho'); assert.ok(/did you get 2/.test(ask.message));
  assert.deepStrictEqual(ask.buttons, [{ title: 'Yes, got them' }, { title: 'No' }]); assert.strictEqual(ask.requireInteraction, true);
  assert.deepStrictEqual(await B.printedAmong('meesho', ['A', 'B']), []);
  handlers.button('kcPrintAsk_meesho', 1);                                   // No
  await new Promise(r => setTimeout(r, 5));
  assert.deepStrictEqual(store.kcPrintAsk, {}); assert.deepStrictEqual(await B.printedAmong('meesho', ['A']), []);
  assert.ok(/Not marked as printed/.test(said[said.length - 1].message));
  await P.printRun('meesho'); handlers.button('kcPrintAsk_meesho', 0);        // Yes
  await new Promise(r => setTimeout(r, 5));
  assert.deepStrictEqual(await B.printedAmong('meesho', ['A', 'B']), ['A', 'B']);
  // an already printed order is not asked about again
  bridgeAnswer = answer({ alreadyPrinted: ['A'] }); await P.printRun('meesho');
  assert.deepStrictEqual(store.kcPrintAsk.meesho.orderIds, ['B']);
  await P.printAnswer('meesho', true);                                 // answering with nothing waiting does nothing
  await P.printAnswer('meesho', true);

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
  await fire({ name: 'kcPrint_meesho', scheduledTime: Date.now() - 1000 });
  assert.strictEqual(bridgeCalls.length, 1, 'on time and free: printed');
  reset(); store.kcCutoff = { meesho: cut }; store.kcPrintTimes = { meesho: { times: ['18:00'] } }; idleActive = true;
  await fire({ name: 'kcPrint_meesho', scheduledTime: Date.now() - 1000 });
  assert.strictEqual(bridgeCalls.length, 0); assert.ok(alarms.kcPrintWait_meesho && store.kcPrintPending.meesho);
  assert.strictEqual(said.filter(s => s.id === 'kcPrintGo_meesho').length, 1);
  const nSaid = said.length;
  await fire({ name: 'kcPrintWait_meesho' });                       // still busy: waits again, no second question
  assert.strictEqual(said.length, nSaid, 'a wait alarm says nothing new');
  assert.strictEqual(said.filter(s => s.id === 'kcPrintGo_meesho').length, 1);
  idleActive = false; await fire({ name: 'kcPrintWait_meesho' });   // quiet now: prints, nothing left waiting
  assert.strictEqual(bridgeCalls.length, 1); assert.ok(!store.kcPrintPending.meesho && !alarms.kcPrintWait_meesho);
  await fire({ name: 'kcPrintWait_meesho' }); assert.strictEqual(bridgeCalls.length, 1, 'a stray wait alarm prints nothing');
  // "Print now" while waiting prints at once and the wait cannot print it a second time
  reset(); store.kcCutoff = { meesho: cut }; idleActive = true;
  await fire({ name: 'kcPrint_meesho', scheduledTime: Date.now() - 1000 });
  await clickGo('meesho');
  assert.strictEqual(bridgeCalls.length, 1); idleActive = false;
  await fire({ name: 'kcPrintWait_meesho' }); assert.strictEqual(bridgeCalls.length, 1);
  // busy for over 2 hours: gives up, says so
  reset(); store.kcCutoff = { meesho: cut }; idleActive = true; store.kcPrintPending = { meesho: Date.now() - 3 * 3600 * 1000 };
  await fire({ name: 'kcPrintWait_meesho' });
  assert.ok(/Nothing was printed/.test(said[0].message) && !store.kcPrintPending.meesho && !bridgeCalls.length);
  // asleep
  reset(); store.kcCutoff = { meesho: cut }; store.kcPrintTimes = { meesho: { times: ['18:00'] } };
  await fire({ name: 'kcPrint_meesho', scheduledTime: Date.now() - 20 * 60 * 1000 });
  assert.strictEqual(bridgeCalls.length, 0); assert.ok(/computer was off/.test(said[0].message) && said[0].id === 'kcPrintGo_meesho');
  assert.ok(alarms.kcPrint_meesho, 'the next print time is set again');

  // ── C1: starting a print takes down an old "Print now?" pop-up ──
  reset(); store.kcCutoff = { meesho: cut }; P.printSources.meesho = async () => [{ name: 'l.pdf', base64: 'JVBERg==' }];
  await P.printRun('meesho'); assert.deepStrictEqual(cleared, ['kcPrintGo_meesho']);
  // ── C2: two platforms, two questions; one yes marks only its own ──
  reset(); store.kcCutoff = { meesho: cut, flipkart: cut };
  P.printSources.flipkart = P.printSources.meesho;
  bridgeAnswer = answer({ rows: [{ orderId: 'M1' }] }); await P.printRun('meesho');
  bridgeAnswer = answer({ rows: [{ orderId: 'F9' }] }); await P.printRun('flipkart');
  handlers.button('kcPrintAsk_meesho', 0); await new Promise(r => setTimeout(r, 5));
  assert.deepStrictEqual(await B.printedAmong('meesho', ['M1']), ['M1']); assert.deepStrictEqual(await B.printedAmong('flipkart', ['F9']), []);
  assert.deepStrictEqual(Object.keys(store.kcPrintAsk), ['flipkart']);
  // ── C3: another platform's print is going: try again in a minute, say nothing ──
  reset(); store.kcCutoff = { meesho: cut }; bridgeAnswer = { ok: false, reason: B.BRIDGE_BUSY };
  await P.printRun('meesho', at(15, 18, 0));
  assert.ok(alarms.kcPrintWait_meesho && store.kcPrintPending.meesho === at(15, 18, 0) && !tabs.length && !said.length);
  // ── C4: an overdue alarm is not replaced; a lost one is asked about, once ──
  reset(); store.kcCutoff = { meesho: cut }; store.kcPrintTimes = { meesho: { times: ['18:00'] } };
  alarms.kcPrint_meesho = { when: Date.now() - 1000 }; await P.printSchedule();
  assert.ok(alarms.kcPrint_meesho.when < Date.now(), 'overdue alarm left to fire');
  delete alarms.kcPrint_meesho; store.kcPrintNext = { meesho: Date.now() - 10 * 60000 }; await P.printSchedule();
  assert.ok(said.some(s => s.id === 'kcPrintGo_meesho' && /computer was off/.test(s.message))); assert.ok(alarms.kcPrint_meesho.when > Date.now());
  // ── C6: any error after the start is said ──
  reset(); store.kcCutoff = { meesho: cut }; P.printSources.meesho = async () => { throw new Error('page changed'); };
  await P.printRun('meesho'); assert.ok(/nothing was printed: page changed/.test(said[0].message));
  P.printSources.meesho = async () => [{ name: 'l.pdf', base64: 'JVBERg==' }];
  // ── C7/C8: a failed print still sets the next time; an old waiting mark does not hide the question ──
  reset(); store.kcCutoff = { meesho: cut }; store.kcPrintTimes = { meesho: { times: ['18:00'] } }; idleActive = true;
  store.kcPrintPending = { meesho: Date.now() - 1000 };
  await fire({ name: 'kcPrint_meesho', scheduledTime: Date.now() - 1000 });
  assert.strictEqual(said.filter(s => s.id === 'kcPrintGo_meesho').length, 1); assert.ok(alarms.kcPrint_meesho);
  reset(); store.kcCutoff = { meesho: cut }; store.kcPrintTimes = { meesho: { times: ['18:00'] } };
  global.computerInUse = async () => { throw new Error('boom'); };
  await assert.rejects(fire({ name: 'kcPrint_meesho', scheduledTime: Date.now() - 1000 })); assert.ok(alarms.kcPrint_meesho);
  global.computerInUse = async () => idleActive;
  // ── C9: the cutoff is the one after the PRINT TIME, not after the moment it actually ran ──
  reset(); store.kcCutoff = { meesho: cut }; let seen = null;
  P.printSources.meesho = async by => { seen = by; return []; };
  await P.printRun('meesho', new Date(2026, 5, 1, 9, 0).getTime()); assert.strictEqual(seen, new Date(2026, 5, 1, 12, 0).getTime());
  P.printSources.meesho = async () => [{ name: 'l.pdf', base64: 'JVBERg==' }];

  // ── N1: a normal print time leaves no false "computer was off" question behind ──
  reset(); store.kcCutoff = { meesho: cut }; store.kcPrintTimes = { meesho: { times: ['18:00'] } };
  await P.printSchedule();                                              // writes kcPrintNext like a real day
  const t0 = alarms.kcPrint_meesho.when; store.kcPrintNext.meesho = t0;
  await fire({ name: 'kcPrint_meesho', scheduledTime: t0 + 1000 });
  assert.strictEqual(bridgeCalls.length, 1); assert.ok(!said.some(s => /computer was off/.test(s.message)), 'no false ask');
  assert.ok(alarms.kcPrint_meesho, 'the next time is set again');
  // a start-up while the overdue alarm is still waiting to fire asks nothing
  reset(); store.kcCutoff = { meesho: cut }; store.kcPrintTimes = { meesho: { times: ['18:00'] } };
  alarms.kcPrint_meesho = { when: Date.now() - 1000 }; store.kcPrintNext = { meesho: Date.now() - 1000 };
  await P.printSchedule(); assert.ok(!said.length);
  // ── C1: a "Print now?" pop-up starts a print once; a second click, or none was shown, starts nothing ──
  reset(); store.kcCutoff = { meesho: cut }; store.kcPrintTimes = { meesho: { times: ['18:00'] } };
  await fire({ name: 'kcPrint_meesho', scheduledTime: Date.now() - 20 * 60 * 1000 });
  assert.strictEqual(store.kcPrintOffer.meesho > 0, true);
  await Promise.all([clickGo('meesho'), clickGo('meesho')]); await clickGo('meesho');
  assert.strictEqual(bridgeCalls.length, 1, 'two quick clicks, one print');
  assert.deepStrictEqual(store.kcPrintOffer, {});
  reset(); await clickGo('meesho'); assert.strictEqual(bridgeCalls.length, 0, 'no pop-up was shown, no print');
  // the cutoff for a late "Print now" is the one after the PRINT TIME, not after the click
  reset(); store.kcCutoff = { meesho: cut }; let by = null;
  P.printSources.meesho = async x => { by = x; return []; };
  store.kcPrintOffer = { meesho: new Date(2026, 5, 1, 9, 0).getTime() }; await clickGo('meesho');
  assert.strictEqual(by, new Date(2026, 5, 1, 12, 0).getTime());
  P.printSources.meesho = async () => [{ name: 'l.pdf', base64: 'JVBERg==' }];
  // giving up on a busy computer takes the offer down too
  reset(); store.kcCutoff = { meesho: cut }; idleActive = true; store.kcPrintPending = { meesho: Date.now() - 3 * 3600 * 1000 }; store.kcPrintOffer = { meesho: 1 };
  await fire({ name: 'kcPrintWait_meesho' }); assert.deepStrictEqual(store.kcPrintOffer, {}); assert.ok(cleared.includes('kcPrintGo_meesho'));
  // ── N3: two platforms waiting at once are both kept, and both print in turn ──
  reset(); store.kcCutoff = { meesho: cut, flipkart: cut, amazon: cut }; P.printSources.flipkart = P.printSources.amazon = P.printSources.meesho;
  idleActive = true;
  await Promise.all(['meesho', 'flipkart', 'amazon'].map(p => fire({ name: 'kcPrint_' + p, scheduledTime: Date.now() - 1000 })));
  assert.deepStrictEqual(Object.keys(store.kcPrintPending).sort(), ['amazon', 'flipkart', 'meesho']);
  idleActive = false;
  await Promise.all(['meesho', 'flipkart', 'amazon'].map(p => fire({ name: 'kcPrintWait_' + p })));
  assert.deepStrictEqual(bridgeCalls.map(c => c.platform).sort(), ['amazon', 'flipkart', 'meesho']);
  // ── N4: a lost time is not asked about for a platform whose times were removed; no cutoff = said, not run ──
  reset(); store.kcCutoff = { meesho: cut }; store.kcPrintNext = { meesho: Date.now() - 10 * 60000 };
  await P.printSchedule(); assert.ok(!said.length, 'no times set, no question');
  store.kcPrintOffer = { meesho: Date.now() }; store.kcCutoff = {};
  await clickGo('meesho'); assert.ok(/no cutoff set for Meesho/.test(said[0].message) && !bridgeCalls.length);

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
