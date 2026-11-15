// Checks for the cutoff reminder timing in reminders.js. Run: node tools/test-reminders.js
'use strict';
const assert = require('assert');
const { cutoffClean, cutoffNextDue } = require('../reminders.js');

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
