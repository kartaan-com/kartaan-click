// ─── Kartaan Click — "AI may drive" (R051, his D1331 + D1334) ───
//
// The same switch Kartaan Tune has: while HE turns it on in Click's panel, the AI app on this computer may call five tools
// through the Kartaan helper that Tune already uses (one helper, never a second; native messaging host com.kartaan.tune_bridge,
// which Chrome starts only for Tune's and Click's own ids). Each tool runs the SAME code the panel's own buttons run.
//   click_status, click_reload, click_set_cutoff, click_print_now, click_last_runs
// 60 minutes with no call, or his Stop, turns it off; so does a browser restart (the switch lives in session storage).
// The AI never presses anything on a seller page here: Print now is Click's own print, started the way the panel starts it.
//
// Loaded by background.js with importScripts, after reminders.js, print-flow.js and self-reload.js.
'use strict';

const AI_STATE     = 'kcAiDrive';          // session storage: { on, lastCall } — gone when the browser closes
const AI_RESUME    = 'kcAiResume';         // local: written by click_reload, read once by the next start
const AI_HOST      = 'com.kartaan.tune_bridge';
const AI_ALARM     = 'kcAiTick';
const AI_IDLE_MS   = 60 * 60 * 1000;
const AI_RESUME_MS = 2 * 60 * 1000;
const AI_PLATFORMS = ['meesho', 'flipkart', 'amazon'];
const AI_OFF       = 'Click\'s "AI may drive" switch is off. Ask the seller to turn it on in Click\'s panel.';

const aiMinutesLeft = (s, now) => (s && s.on ? Math.max(0, Math.ceil((s.lastCall + AI_IDLE_MS - now) / 60000)) : 0);
const aiPlatform = p => { if (!AI_PLATFORMS.includes(p)) throw Error('platform must be meesho, flipkart or amazon.'); return p; };

// One call from the AI. deps: now, getState, setState, off(why), saved() -> the records, setCutoff(p, clean), printNow(p), reload(rec), version.
async function aiCall(deps, tool, args) {
  const now = deps.now();
  const s = await deps.getState();
  if (!s || !s.on) return { ok: false, error: AI_OFF };
  if (now - s.lastCall > AI_IDLE_MS) { await deps.off('60 minutes with no call'); return { ok: false, error: AI_OFF + ' (60 minutes with no call)' }; }
  const a = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  try {
    let result;
    switch (tool) {
      case 'click_status': {
        const sv = await deps.saved(), plan = {};
        for (const p of AI_PLATFORMS) plan[p] = { cutoff: (sv.kcCutoff || {})[p] || null, print_times: (((sv.kcPrintTimes || {})[p]) || {}).times || [], next_print: (sv.kcPrintNext || {})[p] || null };
        result = { version: deps.version, switch_on: true, minutes_left: aiMinutesLeft(s, now), platforms: plan, last_runs: (sv.kcPrintLog || []).slice(0, 3) };
        break;
      }
      case 'click_last_runs': result = { runs: ((await deps.saved()).kcPrintLog || []).slice(0, 20) }; break;
      case 'click_set_cutoff': {
        const p = aiPlatform(a.platform), clean = deps.cutoffClean({ time: a.time, remindMin: a.remind_min });
        if (!clean) throw Error('time must be HH:MM (24-hour) and remind_min a whole number 0 to 1439. Nothing was changed.');
        await deps.setCutoff(p, { time: clean.time, remindMin: clean.remindMin });
        result = { platform: p, cutoff: clean.time, remind_min: clean.remindMin };
        break;
      }
      case 'click_print_now': result = await deps.printNow(aiPlatform(a.platform)); if (!result || result.ok === false) throw Error((result && result.reason) || 'Click did not print.'); break;
      case 'click_reload':
        await deps.reload({ lastCall: now, at: now });
        result = { reloading: true, note: 'Click reloads in a moment and turns the switch back on for the time that was left. Wait a few seconds, then call click_status.' };
        break;
      default: return { ok: false, error: 'Click has no tool called that.' };
    }
    await deps.setState({ on: true, lastCall: now });   // only a call that was accepted keeps the switch alive
    return { ok: true, result };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

if (typeof module !== 'undefined') module.exports = { aiCall, aiMinutesLeft, AI_IDLE_MS, AI_RESUME_MS, AI_OFF };
else {
  let aiPort = null;
  const sess = chrome.storage.session, loc = chrome.storage.local;
  const aiDeps = {
    now: () => Date.now(), version: chrome.runtime.getManifest().version,
    getState: async () => (await sess.get(AI_STATE))[AI_STATE],
    setState: s => sess.set({ [AI_STATE]: s }),
    off: why => aiOff(why),
    saved: () => loc.get(['kcCutoff', 'kcPrintTimes', 'kcPrintNext', 'kcPrintLog']),
    cutoffClean,
    setCutoff: async (p, c) => { const all = (await loc.get('kcCutoff')).kcCutoff || {}; all[p] = c; await loc.set({ kcCutoff: all }); },   // the key Settings writes; print-flow.js and reminders.js reschedule on the change
    printNow,                                                                                                  // the panel's Print now
    reload: async rec => { await loc.set({ [AI_RESUME]: rec }); setTimeout(() => chrome.runtime.reload(), 600); },
  };
  function aiOpen() {
    if (aiPort) return;
    const p = aiPort = chrome.runtime.connectNative(AI_HOST);
    p.onMessage.addListener(async m => { const r = await aiCall(aiDeps, m && m.tool, m && m.args); if (aiPort === p) p.postMessage({ id: m && m.id != null ? m.id : null, ...r }); });
    p.onDisconnect.addListener(() => { void chrome.runtime.lastError; if (aiPort === p) { aiPort = null; aiOff('the AI helper closed'); } });
  }
  async function aiOff(why) {
    await sess.remove(AI_STATE); await loc.remove(AI_RESUME); chrome.alarms.clear(AI_ALARM);
    const p = aiPort; aiPort = null; try { p && p.disconnect(); } catch (e) { /* already closed */ }
    console.log('[Kartaan Click] AI drive off: ' + why);
  }
  async function aiOn() { await sess.set({ [AI_STATE]: { on: true, lastCall: Date.now() } }); chrome.alarms.create(AI_ALARM, { periodInMinutes: 1 }); aiOpen(); }
  chrome.alarms.onAlarm.addListener(async a => { if (a.name !== AI_ALARM) return; const s = await aiDeps.getState(); if (!s || Date.now() - s.lastCall > AI_IDLE_MS) await aiOff('60 minutes with no call'); });
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.url !== chrome.runtime.getURL('panel.html') || !msg || msg.type !== 'KC_AI_SET') return;   // only the panel, never a seller page's script
    (msg.on === true ? aiOn() : aiOff('the seller pressed Stop')).then(() => sendResponse({ ok: true }), e => sendResponse({ ok: false, reason: String(e && e.message || e) }));
    return true;
  });
  // After click_reload: the switch comes back for the time that was left, once, only from a fresh record; otherwise it stays off.
  (async () => {
    const r = (await loc.get(AI_RESUME))[AI_RESUME]; await loc.remove(AI_RESUME);
    if (r && Date.now() - r.at < AI_RESUME_MS && Date.now() - r.lastCall < AI_IDLE_MS) { await sess.set({ [AI_STATE]: { on: true, lastCall: r.lastCall } }); chrome.alarms.create(AI_ALARM, { periodInMinutes: 1 }); aiOpen(); }
    else if ((await aiDeps.getState())) aiOpen();   // the worker only slept: its switch is still on
  })();
}
