// ─── Kartaan Click — the panel's printing data: per-platform view, print-times edits, status, last runs ───
// Pure functions over the saved records (kcCutoff, kcPrintTimes, kcPrintNext, kcPrintLog), so tests check every state with no browser.
// A print time is saved only through addTime below (valid HH:MM, no repeats, at most 6, earliest first); print-flow.js's own
// printTimesClean still cleans whatever is read back before it acts, so a bad record cannot make a print.
'use strict';

const PRINT_MODE_LABELS = { silent: 'Print straight away', box: 'Show the labels and let me press Print' };

// What one platform's box shows. `fmt(ms)` writes a moment as the seller reads it.
function platformView(saved, p, fmt) {
  const times = [...((((saved.kcPrintTimes || {})[p]) || {}).times || [])].sort();
  const cut = (saved.kcCutoff || {})[p];
  const last = (saved.kcPrintLog || []).find(e => e && e.p === p);
  const next = (saved.kcPrintNext || {})[p];
  return {
    times,
    cutoff: cut && typeof cut.time === 'string' ? cut.time : null,
    next: next ? fmt(next) : '—',
    last: last ? fmt(last.ts) + ' — ' + last.text : 'Never printed',
    needsCutoff: times.length > 0 && !(cut && typeof cut.time === 'string'),
  };
}

// Add one print time to a platform's list: { times } or { error } in the seller's words.
function addTime(times, value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value || '')) return { error: 'Pick a time first.' };
  if (times.includes(value)) return { error: value + ' is already there.' };
  if (times.length >= 6) return { error: 'Up to 6 times a day per platform.' };
  return { times: [...times, value].sort() };
}
const removeTime = (times, value) => times.filter(t => t !== value);

// The cropper line: what the last run that reached it found. It is not asked about by itself: nothing is sent to it except to make labels.
function cropperView(log) {
  const e = (log || []).find(x => x && x.bridge);
  if (!e) return { ok: null, text: 'Not used yet — it is checked when a print runs' };
  return e.bridge === 'ok' ? { ok: true, text: 'Working — answered at the last print' } : { ok: false, text: 'Did not answer at the last print: ' + e.bridge };
}

// Reload (R474's record kcReloadedTo { version, at }): shown only while this build is the one it reloaded to.
function reloadView(res, version) {
  const r = res && res.kcReloadedTo;
  return r && r.at && r.version === version ? 'Updated by itself to ' + r.version + ' at ' + new Date(r.at).toLocaleString() : 'No self-update since this build was loaded';
}

// The runs list, newest first, one line each, as the seller reads it.
const logLines = (log, fmt) => (log || []).filter(e => e && e.text).map(e => fmt(e.ts) + '  ' + e.p.charAt(0).toUpperCase() + e.p.slice(1) + '  ' + e.text);

if (typeof module !== 'undefined') module.exports = { platformView, addTime, removeTime, cropperView, reloadView, logLines, PRINT_MODE_LABELS };
