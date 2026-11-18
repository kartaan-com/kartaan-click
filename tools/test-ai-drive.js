// Checks for ai-drive.js (R051). Run: node tools/test-ai-drive.js
'use strict';
const assert = require('assert');
const fs = require('fs'), path = require('path');
const { aiCall, aiMinutesLeft, AI_IDLE_MS, AI_OFF } = require('../ai-drive.js');
const { cutoffClean } = require('../reminders.js');

function world(state = { on: true, lastCall: 1000 }) {
  let st = state, t = 1000;
  const log = { cutoffs: {}, prints: [], reloads: [], offs: [] };
  const deps = {
    now: () => t, version: '1.8.0',
    getState: async () => st, setState: async s => { st = s; },
    off: async why => { st = undefined; log.offs.push(why); },
    saved: async () => ({ kcCutoff: { meesho: { time: '16:00', remindMin: 30 } }, kcPrintTimes: { meesho: { times: ['18:00'] } }, kcPrintLog: [{ ts: 5, p: 'meesho', text: 'ok' }] }),
    cutoffClean, setCutoff: async (p, c) => { log.cutoffs[p] = c; },
    printNow: async p => { log.prints.push(p); return { ok: true, waiting: false }; },
    reload: async r => { log.reloads.push(r); },
  };
  return { deps, log, state: () => st, advance: ms => { t += ms; } };
}

(async () => {
  // Switch off: every tool refused in plain words, nothing runs.
  let w = world(null);
  for (const tool of ['click_status', 'click_reload', 'click_set_cutoff', 'click_print_now', 'click_last_runs']) {
    const r = await aiCall(w.deps, tool, { platform: 'meesho', time: '16:00', remind_min: 1 });
    assert.deepStrictEqual(r, { ok: false, error: AI_OFF });
  }
  assert.deepStrictEqual([w.log.prints, w.log.reloads, w.log.cutoffs], [[], [], {}]);

  // 60 minutes with no call: refused, and the switch goes off.
  w = world(); w.advance(AI_IDLE_MS + 1);
  let r = await aiCall(w.deps, 'click_print_now', { platform: 'meesho' });
  assert.strictEqual(r.ok, false); assert.match(r.error, /60 minutes/); assert.deepStrictEqual(w.log.prints, []); assert.strictEqual(w.state(), undefined);

  // Status: version, minutes left, cutoffs; a call renews the 60 minutes.
  w = world(); w.advance(30 * 60 * 1000);
  r = await aiCall(w.deps, 'click_status', {});
  assert.strictEqual(r.ok, true); assert.strictEqual(r.result.version, '1.8.0'); assert.strictEqual(r.result.minutes_left, 30);
  assert.strictEqual(r.result.platforms.meesho.cutoff.time, '16:00'); assert.deepStrictEqual(r.result.platforms.meesho.print_times, ['18:00']);
  assert.strictEqual(aiMinutesLeft(w.state(), 1000 + 30 * 60 * 1000), 60);

  // Set cutoff: valid is saved through cutoffClean; every bad input saves nothing and does not renew the switch.
  w = world();
  r = await aiCall(w.deps, 'click_set_cutoff', { platform: 'meesho', time: '17:30', remind_min: 15 });
  assert.strictEqual(r.ok, true); assert.deepStrictEqual(w.log.cutoffs.meesho, { time: '17:30', remindMin: 15 });
  for (const bad of [{ platform: 'meesho', time: '25:00', remind_min: 1 }, { platform: 'meesho', time: '17:30' }, { platform: 'meesho', time: '17:30', remind_min: 1440 }, { platform: 'ebay', time: '17:30', remind_min: 1 }, { platform: 'meesho', time: '17:30', remind_min: 1.5 }]) {
    w = world(); r = await aiCall(w.deps, 'click_set_cutoff', bad);
    assert.strictEqual(r.ok, false, JSON.stringify(bad)); assert.deepStrictEqual(w.log.cutoffs, {});
  }

  // Print now: the panel's own function, one platform; a refusal from it comes back as an error.
  w = world(); r = await aiCall(w.deps, 'click_print_now', { platform: 'meesho' });
  assert.strictEqual(r.ok, true); assert.deepStrictEqual(w.log.prints, ['meesho']);
  w = world(); r = await aiCall(w.deps, 'click_print_now', { platform: 'x' }); assert.strictEqual(r.ok, false); assert.deepStrictEqual(w.log.prints, []);
  w = world(); w.deps.printNow = async () => ({ ok: false, reason: 'A print for Meesho is already open. Answer it first.' });
  r = await aiCall(w.deps, 'click_print_now', { platform: 'meesho' }); assert.deepStrictEqual(r, { ok: false, error: 'A print for Meesho is already open. Answer it first.' });

  // Reload keeps the time left; last runs; unknown tool; non-object inputs do not crash.
  w = world(); r = await aiCall(w.deps, 'click_reload', {}); assert.strictEqual(r.ok, true); assert.deepStrictEqual(w.log.reloads, [{ lastCall: 1000, at: 1000 }]);
  w = world(); r = await aiCall(w.deps, 'click_last_runs', null); assert.strictEqual(r.result.runs.length, 1);
  r = await aiCall(w.deps, 'open_listing', {}); assert.strictEqual(r.ok, false); assert.deepStrictEqual(w.log.prints, []);
  r = await aiCall(w.deps, 'click_print_now', [1]); assert.strictEqual(r.ok, false);

  // The files: permission is declared and explained, the module is loaded and packaged, nothing here opens a seller page or a network address.
  const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.ok(JSON.parse(read('manifest.json')).permissions.includes('nativeMessaging'));
  assert.match(read('background.js'), /importScripts\('ai-drive\.js'\)/); assert.match(read('tools/make-zip.js'), /'ai-drive\.js'/);
  assert.doesNotMatch(read('ai-drive.js'), /fetch\(|XMLHttpRequest|WebSocket|tabs\.(create|update)|executeScript/);
  assert.match(read('ai-drive.js'), /sender\.url !== chrome\.runtime\.getURL\('panel\.html'\)/);
  console.log('ai-drive: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
