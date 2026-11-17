// Checks for the panel's Tools card data (panel-tools.js): every state the old pop-up could show.
// Run: node tools/test-panel.js
'use strict';
const assert = require('assert');
const t = require('../panel-tools.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok - ' + name); };
const fmt = ms => 'T' + ms;
ok('check-ins off', () => assert.deepStrictEqual(t.checkinView({}, fmt), { on: false, text: 'Off' }));
ok('check-ins on, no next', () => assert.strictEqual(t.checkinView({ kcCheckin: { enabled: true } }, fmt).text, 'On'));
ok('check-ins on with next', () => assert.strictEqual(t.checkinView({ kcCheckin: { enabled: true }, kcCheckinNext: 5 }, fmt).text, 'On — next round T5'));
ok('accept off when no site', () => assert.strictEqual(t.acceptView({ kcAutoAccept: { enabled: true, sites: {} } }).text, 'Off'));
ok('accept on but nothing ticked warns', () => { const v = t.acceptView({ kcAutoAccept: { enabled: true, sites: { flipkart: true } } }); assert.ok(v.warn && !v.on && /nothing will be accepted/.test(v.text)); });
ok('accept on with ticked', () => assert.strictEqual(t.acceptView({ kcAutoAccept: { enabled: true, sites: { meesho: true } }, kcOrdersFilter: { accept: ['a'], meeshoAccept: ['b', 'c'] } }).text, 'On — 3 SKU(s) ticked'));
ok('accept on with blocks only', () => assert.strictEqual(t.acceptView({ kcAutoAccept: { enabled: true, sites: { meesho: true } }, kcOrdersFilter: { acceptBlock: ['x'] } }).text, 'On — everything except 1 SKU(s)'));
ok('accept any SKU', () => assert.strictEqual(t.acceptView({ kcAutoAccept: { enabled: true, onlyTickedSkus: false, sites: { meesho: true }, } , kcOrdersFilter: {} }).text, 'On — any SKU'));
ok('update new', () => { const v = t.updateView({ updateAvailable: true, latest: '1.9.0', notes: 'n', url: 'u' }); assert.strictEqual(v.kind, 'new'); assert.strictEqual(v.lines[0], 'Version 1.9.0 is available.'); assert.strictEqual(v.lines[1], 'n'); assert.match(v.lines[2], /^Unzip it over your existing folder/); assert.strictEqual(v.url, 'u'); });
ok('update error with history', () => assert.match(t.updateView({ error: 1, latest: '1.7.0', latestAt: 9 }, () => 'D').lines[0], /Last heard on D — the newest then was 1.7.0/));
ok('update error without history', () => assert.strictEqual(t.updateView({ error: 1 }).lines[0], 'Could not check for updates right now.'));
ok('update up to date, and empty = checking', () => { assert.strictEqual(t.updateView({}).lines[0], 'Up to date.'); assert.strictEqual(t.updateView(null).lines[0], 'Checking for updates…'); });
ok('stop key hint and names', () => { assert.match(t.keyHint('a'), /scanner/); assert.match(t.keyHint('F2'), /Refresh the VMS tab/); assert.strictEqual(t.keyName(' '), 'Space'); assert.strictEqual(t.keyName(undefined), 'Enter'); });
console.log(n + ' checks passed'); assert.ok(n > 0);

// ── the Printing / Status / last-runs data (panel-print.js) ──
const pr = require('../panel-print.js');
const f = ms => 'T' + ms;
const saved = { kcPrintTimes: { meesho: { times: ['18:00', '09:00'] }, flipkart: { times: ['18:00'] } }, kcCutoff: { meesho: { time: '17:00', remindMin: 30 } },
  kcPrintNext: { meesho: 7 }, kcPrintLog: [{ ts: 3, p: 'flipkart', text: 'Printed 9', bridge: 'ok' }, { ts: 2, p: 'meesho', text: 'Nothing to print.' }, { ts: 1, p: 'meesho', text: 'older' }] };
ok('platform view: times sorted, cutoff, next, newest last run', () => { const v = pr.platformView(saved, 'meesho', f); assert.deepStrictEqual(v.times, ['09:00', '18:00']); assert.strictEqual(v.cutoff, '17:00'); assert.strictEqual(v.next, 'T7'); assert.strictEqual(v.last, 'T2 — Nothing to print.'); assert.strictEqual(v.needsCutoff, false); });
ok('platform with times but no cutoff says so', () => assert.strictEqual(pr.platformView(saved, 'flipkart', f).needsCutoff, true));
ok('platform with nothing saved', () => { const v = pr.platformView({}, 'amazon', f); assert.deepStrictEqual(v.times, []); assert.strictEqual(v.cutoff, null); assert.strictEqual(v.next, '—'); assert.strictEqual(v.last, 'Never printed'); assert.strictEqual(v.needsCutoff, false); });
ok('add time: ok, sorted', () => assert.deepStrictEqual(pr.addTime(['18:00'], '09:30').times, ['09:30', '18:00']));
ok('add time: empty, repeat, seventh', () => { assert.match(pr.addTime([], '').error, /Pick a time/); assert.match(pr.addTime(['09:00'], '09:00').error, /already there/); assert.match(pr.addTime(['01:00', '02:00', '03:00', '04:00', '05:00', '06:00'], '07:00').error, /Up to 6/); });
ok('remove time', () => assert.deepStrictEqual(pr.removeTime(['09:00', '18:00'], '09:00'), ['18:00']));
ok('cropper view: unused, working, failed', () => { assert.strictEqual(pr.cropperView([]).ok, null); assert.strictEqual(pr.cropperView(saved.kcPrintLog).ok, true); assert.match(pr.cropperView([{ bridge: 'the page did not answer' }]).text, /[Dd]id not answer at the last print: the page did not answer/); });
ok('reload view: only for the build it reloaded to', () => { assert.match(pr.reloadView({}, '1.8.0'), /No self-update/); assert.match(pr.reloadView({ kcReloadedTo: { version: '1.8.0', at: 5 } }, '1.8.0'), /Updated by itself to 1.8.0/); assert.match(pr.reloadView({ kcReloadedTo: { version: '1.7.0', at: 5 } }, '1.8.0'), /No self-update/); });
ok('log lines newest first, named platform', () => assert.deepStrictEqual(pr.logLines(saved.kcPrintLog, f), ['T3  Flipkart  Printed 9', 'T2  Meesho  Nothing to print.', 'T1  Meesho  older']));
console.log(n + ' checks passed in all');
