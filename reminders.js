// ─── Kartaan Click — cutoff reminders ────────────────────────────────────────
//
// The seller sets, once per platform, the time orders must be ready by (the
// dispatch cutoff) and how many minutes before it to be reminded. Every day, at
// that moment, Click shows one notice. It acts on no seller page, so the 3-minute
// idle wait does not apply to it. Nothing here names a time or a platform's
// cutoff: every number comes from the seller's saved settings.
//
// Loaded by background.js with importScripts. The timer is a chrome.alarms alarm
// (a service worker is shut down and a setTimeout would die with it).
'use strict';

const CUTOFF_KEY    = 'kcCutoff';        // { flipkart: { time: 'HH:MM', remindMin: 30 }, ... }
const CUTOFF_SHOWN  = 'kcCutoffShown';   // { flipkart: 'the reminder time already shown' }
const CUTOFF_SITES  = { flipkart: 'Flipkart', meesho: 'Meesho', amazon: 'Amazon' };
const CUTOFF_PREFIX = 'kcCutoff_';
// A reminder that fires later than this after its time (computer asleep, browser
// closed) is dropped, never shown late: "10 min to cutoff" 3 hours on is wrong.
const CUTOFF_LATE_MS = 5 * 60 * 1000;

// Clean one platform's saved setting; null when it is not a usable one.
function cutoffClean(raw) {
  if (!raw || typeof raw.time !== 'string') return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(raw.time);
  if (!m || raw.remindMin === '' || raw.remindMin == null) return null;
  const remind = Number(raw.remindMin);
  if (!Number.isInteger(remind) || remind < 0 || remind > 1439) return null;
  return { hour: Number(m[1]), minute: Number(m[2]), remindMin: remind, time: raw.time };
}

// The next moment (ms) this reminder is due, strictly after `now`, in the
// computer's own local time. A reminder time already past today means tomorrow.
function cutoffNextDue(clean, now) {
  for (let day = 0; day <= 2; day++) {
    const d = new Date(now);
    d.setDate(d.getDate() + day);
    d.setHours(clean.hour, clean.minute, 0, 0);
    const due = d.getTime() - clean.remindMin * 60000;
    if (due > now) return due;
  }
  return null;
}

// The ONE piece that delivers the reminder. Swap this function to change where
// it goes (a message centre, another channel); nothing else here knows.
function cutoffDeliver(platform, clean) {
  const text = clean.remindMin === 0
    ? 'Cutoff is now (' + clean.time + ').'
    : 'Cutoff at ' + clean.time + ', in ' + clean.remindMin + ' min.';
  return chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Kartaan Click — ' + platform,
    message: text,
  });
}

// Set (or clear) every platform's alarm from the saved settings.
async function cutoffSchedule() {
  const saved = (await chrome.storage.local.get(CUTOFF_KEY))[CUTOFF_KEY] || {};
  for (const site of Object.keys(CUTOFF_SITES)) {
    const clean = cutoffClean(saved[site]);
    const name = CUTOFF_PREFIX + site;
    await chrome.alarms.clear(name);
    if (!clean) continue;
    const due = cutoffNextDue(clean, Date.now());
    if (due != null) chrome.alarms.create(name, { when: due });
  }
}

async function cutoffFired(alarm) {
  const site = alarm.name.slice(CUTOFF_PREFIX.length);
  const saved = (await chrome.storage.local.get([CUTOFF_KEY, CUTOFF_SHOWN]));
  const clean = cutoffClean((saved[CUTOFF_KEY] || {})[site]);
  const shown = saved[CUTOFF_SHOWN] || {};
  const late = Date.now() - alarm.scheduledTime;
  // Shown once per due moment, only on time, only if the setting still exists.
  if (clean && late <= CUTOFF_LATE_MS && shown[site] !== alarm.scheduledTime) {
    shown[site] = alarm.scheduledTime;
    await chrome.storage.local.set({ [CUTOFF_SHOWN]: shown });
    await cutoffDeliver(CUTOFF_SITES[site], clean);
  }
  await cutoffSchedule();
}

if (typeof chrome !== 'undefined' && chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name.startsWith(CUTOFF_PREFIX)) {
      Promise.resolve(cutoffFired(alarm)).catch(e => console.log('[Kartaan Click] cutoff reminder: ' + e));
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[CUTOFF_KEY]) {
      Promise.resolve(cutoffSchedule()).catch(e => console.log('[Kartaan Click] cutoff schedule: ' + e));
    }
  });
  // The service worker starts again after Chrome restarts or Click updates: the
  // alarms are put back from the saved settings every time it does.
  Promise.resolve(cutoffSchedule()).catch(e => console.log('[Kartaan Click] cutoff schedule: ' + e));
}

if (typeof module !== 'undefined') module.exports = { cutoffClean, cutoffNextDue, cutoffFired, cutoffSchedule };
