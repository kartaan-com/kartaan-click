// Checks for the cutoff reminder timing in reminders.js. Run: node tools/test-reminders.js
'use strict';
const assert = require('assert');

// A stand-in for the browser's own storage, alarms and notifications.
const store = {}, alarms = {}, shown = [];

global.chrome = {
  storage: {
    local: {
      get: async keys => { const o = {}; for (const k of [].concat(keys)) if (k in store) o[k] = store[k]; return o; },
      set: async obj => { Object.assign(store, obj); },
    },
    onChanged: { addListener: () => {} },
  },
  alarms: {
    clear: async name => { delete alarms[name]; },
    get: async name => (alarms[name] ? { scheduledTime: alarms[name].when } : undefined),
    create: (name, info) => { alarms[name] = info; },
    onAlarm: { addListener: () => {} },
  },
  notifications: { create: async o => { shown.push(o); } },
};
const { cutoffClean, cutoffNextDue, cutoffFired, cutoffSchedule } = require('../reminders.js');

const now = new Date(2026, 10, 15, 10, 0).getTime();   // 15 Nov, 10:00 local

// Due later today.
let due = new Date(cutoffNextDue(cutoffClean({ time: '16:00', remindMin: 30 }), now));
assert.strictEqual(due.getDate(), 15); assert.strictEqual(due.getHours(), 15); assert.strictEqual(due.getMinutes(), 30);

// Reminder time already past today -> tomorrow.
due = new Date(cutoffNextDue(cutoffClean({ time: '09:00', remindMin: 30 }), now));
assert.strictEqual(due.getDate(), 16); assert.strictEqual(due.getHours(), 8); assert.strictEqual(due.getMinutes(), 30);

// Reminder larger than the time left in the day: still a moment after now.
assert.ok(cutoffNextDue(cutoffClean({ time: '01:00', remindMin: 1200 }), now) > now);

// Edges of the day.
due = new Date(cutoffNextDue(cutoffClean({ time: '23:59', remindMin: 0 }), now));
assert.strictEqual(due.getHours(), 23); assert.strictEqual(due.getMinutes(), 59);
due = new Date(cutoffNextDue(cutoffClean({ time: '00:00', remindMin: 0 }), now));
assert.strictEqual(due.getDate(), 16);

// Exactly now is not "after now".
assert.ok(cutoffNextDue(cutoffClean({ time: '10:00', remindMin: 0 }), now) > now);

// Bad or missing settings are refused, not guessed.
for (const bad of [null, {}, { time: '25:00', remindMin: 1 }, { time: '10:00' }, { time: '10:00', remindMin: '' },
                   { time: '10:00', remindMin: -1 }, { time: '10:00', remindMin: 1.5 }, { time: '10:00', remindMin: 1440 },
                   { time: '1000', remindMin: 5 }]) {
  assert.strictEqual(cutoffClean(bad), null, JSON.stringify(bad));
}
console.log('reminder timing: all passed');

// ── what happens when the alarm goes off ─────────────────────────────────────
(async () => {
  store.kcCutoff = { flipkart: { time: '16:00', remindMin: 30 }, meesho: { time: '99:99', remindMin: 5 } };
  await cutoffSchedule();
  assert.ok(alarms.kcCutoff_flipkart && alarms.kcCutoff_flipkart.when > Date.now(), 'alarm set from settings');
  assert.ok(!alarms.kcCutoff_meesho && !alarms.kcCutoff_amazon, 'no alarm for a bad or missing setting');

  // On time: one notice, and the next day's alarm is set.
  delete alarms.kcCutoff_flipkart;
  await cutoffFired({ name: 'kcCutoff_flipkart', scheduledTime: Date.now() - 1000 });
  assert.strictEqual(shown.length, 1); assert.ok(/Flipkart/.test(shown[0].title) && /16:00/.test(shown[0].message));
  assert.ok(alarms.kcCutoff_flipkart, 'next alarm set after firing');

  // The same moment twice: shown once.
  const same = Date.now() - 2000;
  await cutoffFired({ name: 'kcCutoff_flipkart', scheduledTime: same });
  await cutoffFired({ name: 'kcCutoff_flipkart', scheduledTime: same });
  assert.strictEqual(shown.length, 2, 'a repeat of the same moment is not shown again');

  // Late (computer asleep): nothing shown, but the next one is still set.
  delete alarms.kcCutoff_flipkart;
  await cutoffFired({ name: 'kcCutoff_flipkart', scheduledTime: Date.now() - 3 * 3600000 });
  assert.strictEqual(shown.length, 2, 'a late reminder is not shown');
  assert.ok(alarms.kcCutoff_flipkart, 'next alarm set after a skipped one');

  // Setting cleared before it fired: nothing shown, no alarm left.
  store.kcCutoff = {};
  await cutoffFired({ name: 'kcCutoff_flipkart', scheduledTime: Date.now() - 1000 });
  assert.strictEqual(shown.length, 2, 'no notice once the setting is gone');
  assert.ok(!alarms.kcCutoff_flipkart, 'alarm removed once the setting is gone');

  // Zero minutes before: the notice says the cutoff is now.
  store.kcCutoff = { amazon: { time: '18:00', remindMin: 0 } };
  await cutoffFired({ name: 'kcCutoff_amazon', scheduledTime: Date.now() - 1000 });
  assert.strictEqual(shown.length, 3); assert.ok(/now/.test(shown[2].message) && !/in 0/.test(shown[2].message));

  // An alarm that is not ours, or an unknown platform, is ignored.
  await cutoffFired({ name: 'kcCutoff_other', scheduledTime: Date.now() });
  assert.strictEqual(shown.length, 3);
  // A wake-up must not replace an alarm already set for the right moment (it may be
  // due but not yet delivered).
  store.kcCutoff = { meesho: { time: '17:30', remindMin: 10 } };
  await cutoffSchedule();
  const first = alarms.kcCutoff_meesho;
  await cutoffSchedule();
  assert.strictEqual(alarms.kcCutoff_meesho, first, 'an alarm already set is left alone');
  store.kcCutoff = { meesho: { time: '17:31', remindMin: 10 } };
  await cutoffSchedule();
  assert.notStrictEqual(alarms.kcCutoff_meesho, first, 'a changed setting replaces the alarm');
  console.log('reminder firing: all passed');
})().catch(e => { console.error(e); process.exit(1); });
