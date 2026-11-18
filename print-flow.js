// ─── Kartaan Click — print times, the next-cutoff rule, and the print step ───
//
// The seller sets, per platform, one or more print times (D784). At each one Click
// looks at the NEXT cutoff and takes everything that must ship by it (D675), has
// the Label Cropper make the labels (cropper-bridge.js), puts them in front of the
// seller to print, then asks "printed N — got N?" (D782) and only on a yes marks
// the orders printed (D652). Every number is the seller's own setting.
//
// ONE record per platform describes its print run: kcPrintRun_<platform> = { at, state, since?, orderIds? }.
//   at    the print time the run is for; it is also in the pop-up ids, so a tap reaches only its own run
//   state waiting (computer in use) -> printing -> asked ("got N?") -> answered or expired (record removed);
//         or offer ("Print now?", after the computer was off or a print was cut off)
// A new print time replaces the old run: its pop-up goes, its answer can no longer act. Nothing ever prints
// by itself after the computer was off or the browser restarted: it asks (D664).
//
// Where the label files come from is `printSources[platform](shipBy)`: the walk of
// each platform's panel (round C1b-walk) puts its function there. The source must hand back every order due
// on or before `shipBy`, overdue ones included, and never an order already printed. Until it exists, a
// print time says so in a notice instead of doing nothing. No print time can be set on the settings page
// yet, so nothing here fires for anyone until that exists.
//
// Loaded by background.js with importScripts, after reminders.js and cropper-bridge.js.
'use strict';

const PRINT_KEY     = 'kcPrintTimes';      // { meesho: { times: ['18:00', '09:00'], mode: 'box' }, ... }
const PRINT_PREFIX  = 'kcPrint_';          // one alarm per platform: its next print time
const PRINT_WAIT    = 'kcPrintWait_';      // checks once a minute while the seller is using the computer
const PRINT_RUN     = 'kcPrintRun_';       // + platform: the run record, see above
const PRINT_NEXT    = 'kcPrintNext';       // { platform: the print time its alarm is set for }, to notice an alarm Chrome lost
const PRINT_PDFS    = 'kcPrintPdfs_';      // session storage, + platform_at: the finished PDFs print.html shows
const PRINT_LATE_MS = 5 * 60 * 1000;       // later than this after its time = the computer was off: ask, never print (D664)
const PRINT_WAIT_MS = 2 * 60 * 60 * 1000;  // a print waiting for a free computer gives up after this
const PRINT_WAIT_MSG = 'Time to print. Print now? Otherwise it waits for a quiet moment.';
const PRINT_SHOWN   = 'kcPrintShown';       // session storage: set once per browser run; gone when the browser closes
const PRINT_LOG     = 'kcPrintLog';        // [{ ts, p, text, bridge? }] newest first, at most 20: what the last runs did (the panel shows it)
const PRINT_PLATFORMS = ['meesho', 'flipkart', 'amazon'];
const printSources  = {};                  // platform -> async (shipBy) => [{ name, base64 }]

const printCutoffClean = typeof module !== 'undefined' ? require('./reminders.js').cutoffClean : cutoffClean;
const printBusy = typeof module !== 'undefined' ? require('./cropper-bridge.js').BRIDGE_BUSY : BRIDGE_BUSY;

// The seller's print times, cleaned: valid HH:MM only, no repeats, earliest first, at most 6.
function printTimesClean(raw) {
  const ok = (Array.isArray(raw) ? raw : []).filter(t => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t));
  return [...new Set(ok)].sort().slice(0, 6);
}

// The latest of these times that has already come round (ms), local time.
function printLatest(times, now) {
  let best = 0;
  for (const t of times) {
    const [h, m] = t.split(':').map(Number);
    const d = new Date(now); d.setHours(h, m, 0, 0);
    if (d.getTime() > now) d.setDate(d.getDate() - 1);
    best = Math.max(best, d.getTime());
  }
  return best;
}

// The next moment (ms) one of these times comes round, strictly after `now`, local time.
function printNextTime(times, now) {
  let best = null;
  for (const t of times) {
    const [h, m] = t.split(':').map(Number);
    for (let day = 0; day <= 1; day++) {
      const d = new Date(now); d.setDate(d.getDate() + day); d.setHours(h, m, 0, 0);
      if (d.getTime() > now) { if (best === null || d.getTime() < best) best = d.getTime(); break; }
    }
  }
  return best;
}

// D675: the next cutoff — everything that must ship by it is printed now. A print time exactly on a cutoff is for THIS cutoff (R480C).
function printShipBy(cutoff, now) {
  const clean = printCutoffClean(cutoff);
  if (!clean) return null;
  const d = new Date(now); d.setHours(clean.hour, clean.minute, 0, 0);
  if (d.getTime() < now) { d.setDate(d.getDate() + 1); d.setHours(clean.hour, clean.minute, 0, 0); }
  return d.getTime();
}

const printSay = (title, message, buttons, id) => chrome.notifications.create(id || '', {
  type: 'basic', iconUrl: 'icons/icon128.png', title: 'Kartaan Click — ' + title, message,
  ...(buttons ? { buttons: buttons.map(t => ({ title: t })), requireInteraction: true } : {}),
});
// One line of what a run did, kept for the panel. `bridge` is 'ok' or the cropper's own reason, when the run got as far as asking it.
async function printNote(p, text, bridge) {
  const log = (await chrome.storage.local.get(PRINT_LOG))[PRINT_LOG] || [];
  await chrome.storage.local.set({ [PRINT_LOG]: [{ ts: Date.now(), p, text, ...(bridge ? { bridge } : {}) }, ...log].slice(0, 20) });
}
const printName = platform => platform.charAt(0).toUpperCase() + platform.slice(1);
const goId = (p, at) => 'kcPrintGo_' + p + '_' + at;      // "Print now?"
const askId = (p, at) => 'kcPrintAsk_' + p + '_' + at;    // "got N?"

// A run's pop-up, put on screen from its record (the record keeps the words, so it can be shown again after a restart).
const printShow = (p, rec) => printSay(printName(p), rec.msg, rec.state === 'asked' ? ['Yes, got them', 'No'] : ['Print now'], (rec.state === 'asked' ? askId : goId)(p, rec.at));

// Everything that changes the print records runs one after another, never two at once.
let printChain = Promise.resolve();
const printSerial = fn => { const job = printChain.then(fn); printChain = job.catch(() => {}); return job; };

const runGet = async p => (await chrome.storage.local.get(PRINT_RUN + p))[PRINT_RUN + p];
// A run's pop-ups and PDFs: gone once the run is over or replaced, so none of it can act again.
async function runClean(p, at) {
  chrome.notifications.clear(goId(p, at)); chrome.notifications.clear(askId(p, at));
  await chrome.storage.session.remove(PRINT_PDFS + p + '_' + at);
}
// The platform's one record. A different print time replaces the old run (a "got N?" is never replaced: see printHold).
async function runPut(p, rec) {
  const old = await runGet(p);
  if (old && old.at !== rec.at) await runClean(p, old.at);
  if (rec.state !== 'waiting') await chrome.alarms.clear(PRINT_WAIT + p);
  await chrome.storage.local.set({ [PRINT_RUN + p]: rec });
}
async function runEnd(p) {
  const old = await runGet(p);
  if (old) await runClean(p, old.at);
  await chrome.alarms.clear(PRINT_WAIT + p);
  await chrome.storage.local.remove(PRINT_RUN + p);
}

// D652: while the last labels' "did you get N?" is open, a new print time never replaces it and never prints (the same orders could
// print twice): it is held on that record and offered the moment he answers.
async function printHold(p, old, at) {
  if (old.pendingAt === at) return;
  await chrome.storage.local.set({ [PRINT_RUN + p]: { ...old, pendingAt: at } });
  await printShow(p, old);   // his pop-up may be closed: bring the question back so he can answer it
  return printSay(printName(p), 'Time to print, but you have not answered "did you get ' + (old.n === undefined ? old.orderIds.length : old.n) + '?" yet. Answer it and Click offers to print.');
}

// A "Print now?" pop-up for this print time. Asked once: the same time again changes nothing.
async function printOffer(p, at, message) {
  const old = await runGet(p);
  if (old && old.state === 'asked' && old.at !== at) return printHold(p, old, at);
  if (old && old.at === at && old.state === 'offer') return;
  const rec = { at, state: 'offer', msg: message };
  await runPut(p, rec); await printShow(p, rec);
}

// The platform's print times, and its next print time; null when it has no times or no cutoff to print for.
const printPlan = (saved, p) => {
  const times = printTimesClean(((saved[PRINT_KEY] || {})[p] || {}).times);
  return { times, due: printCutoffClean((saved.kcCutoff || {})[p]) ? printNextTime(times, Date.now()) : null };
};

// Set (or clear) each platform's next print alarm. The time is also written down: an alarm Chrome lost while the browser was shut is asked about (D664).
async function printSchedule() {
  const saved = await chrome.storage.local.get([PRINT_KEY, 'kcCutoff', PRINT_NEXT]);
  const next = saved[PRINT_NEXT] || {};
  for (const p of PRINT_PLATFORMS) {
    const name = PRINT_PREFIX + p, { due } = printPlan(saved, p);
    if (due === null) {   // switched off: no alarm, and its "Print now?" goes too (a "got N?" stays: it is about labels already out)
      await chrome.alarms.clear(name); delete next[p];
      const rec = await runGet(p);
      if (rec && (rec.state === 'offer' || rec.state === 'waiting')) await runEnd(p);
      continue;
    }
    const existing = await chrome.alarms.get(name);
    if (existing && existing.scheduledTime <= Date.now()) continue;   // overdue and not fired yet: it fires and is handled, never replaced
    if (!existing && next[p] && Date.now() - next[p] > PRINT_LATE_MS) await printOffer(p, next[p], 'The computer was off at the print time. Print now?');
    next[p] = due;
    if (!(existing && existing.scheduledTime === due)) chrome.alarms.create(name, { when: due });
  }
  await chrome.storage.local.set({ [PRINT_NEXT]: next });
}

// The print step, behind one switch: how the finished PDFs reach paper. Both open each PDF in a tab (print.html).
// 'silent' (the default, his R480 ruling) also asks the page to print by itself: with Chrome started with the
// kiosk-printing setting that goes straight to the default printer; without it Chrome shows its own print box, so
// the labels are always in front of him and a print is never lost. 'box' only shows them and waits for him to press Print.
const printTabs = suffix => async (key, outputs) => {
  await chrome.storage.session.set({ [key]: outputs.map(o => o.base64) });
  for (let i = 0; i < outputs.length; i++) await chrome.tabs.create({ url: chrome.runtime.getURL('print.html?k=' + key + '&i=' + i + suffix) });
};
const PRINT_MODES = { silent: printTabs('&s=1'), box: printTabs('') };

// One print for the platform's print time `at`: labels for everything due by the cutoff that print time looks at, put in front of the
// seller, then the count question. `since` is when it first had to wait. Callers hold the print chain.
// `byHand`: he pressed Print now himself (the panel, or the notice button): the source need not wait for 3 idle minutes, as with a check-in round he starts by hand.
async function printStart(p, at, since = Date.now(), byHand = false) {
  await runPut(p, { at, state: 'printing', since });
  chrome.notifications.clear(goId(p, at));   // a "Print now?" for this time is spent
  const name = printName(p);
  const stop = async (message, bridge) => { await runEnd(p); await printNote(p, message, bridge); return printSay(name, message); };
  try {
    const saved = await chrome.storage.local.get([PRINT_KEY, 'kcCutoff']);
    const source = printSources[p];
    if (!source) return await stop('Print time reached, but Click cannot fetch ' + name + ' labels yet. Nothing was printed.');
    // The cutoff comes from the latest print time that has come round, not from the moment of the click: a late "Print now" is still for today's orders.
    const shipBy = printShipBy((saved.kcCutoff || {})[p], Math.max(at, printLatest(printPlan(saved, p).times, Date.now())));
    if (shipBy === null) return await stop('There is no cutoff set for ' + name + ', so Click cannot tell what to print. Nothing was printed.');
    const got = await source(shipBy, { byHand });   // a list of files, or { files, orderIds }: the ids the walk fetched (N9)
    const files = Array.isArray(got) ? got : got && got.files, fetched = got && !Array.isArray(got) && Array.isArray(got.orderIds) ? got.orderIds : null;
    if (!files || files.length === 0) return await stop('Nothing to print.' + (got && got.note ? ' ' + got.note : ''));
    const r = await bridgeRun({ platform: p, files });
    if (!r.ok && r.reason === printBusy) {   // something else is using the cropper: try again in a minute, same record
      await runPut(p, { at, state: 'waiting', since, msg: PRINT_WAIT_MSG });
      return chrome.alarms.create(PRINT_WAIT + p, { delayInMinutes: 1 });
    }
    if (!r.ok) return await stop('Labels were not made: ' + r.reason + ' Nothing was printed.', r.reason);
    const mode = ((saved[PRINT_KEY] || {})[p] || {}).mode;
    await (Object.prototype.hasOwnProperty.call(PRINT_MODES, mode) ? PRINT_MODES[mode] : PRINT_MODES.silent)(PRINT_PDFS + p + '_' + at, r.outputs);
    // The orders a Yes marks printed are the ones the walk fetched, never the ones the cropper page says it read (N9).
    const orderIds = fetched ? fetched.filter(id => typeof id === 'string' && !r.alreadyPrinted.includes(id))
      : r.rows.filter(o => o && typeof o.orderId === 'string' && !r.alreadyPrinted.includes(o.orderId)).map(o => o.orderId);
    const rec = { at, state: 'asked', orderIds, n: r.count.ordersOut, msg: 'Printed ' + r.count.ordersOut + ' — did you get ' + r.count.ordersOut + '? ' + r.count.text + (got && !Array.isArray(got) && got.note ? ' ' + got.note : '') };
    await runPut(p, rec);
    await printNote(p, rec.msg, 'ok');
    return printShow(p, rec);
  } catch (e) {
    return stop('Something went wrong and nothing was printed: ' + (e && e.message || e));
  }
}

// At a print time. Computer in use: wait for 3 idle minutes (N063), asking once if he wants it now (D793).
async function printWait(p, at, since) {
  const old = await runGet(p);
  if (old && old.state === 'asked' && old.at !== at) return printHold(p, old, at);
  if (!(await computerInUse())) return printStart(p, at, since);
  if (Date.now() - since > PRINT_WAIT_MS) {
    await runEnd(p);
    return printSay(printName(p), 'Print time passed while the computer was in use. Nothing was printed.');
  }
  if (!(old && old.at === at && old.state === 'waiting')) {
    const rec = { at, state: 'waiting', since, msg: PRINT_WAIT_MSG };
    await runPut(p, rec); await printShow(p, rec);
  }
  chrome.alarms.create(PRINT_WAIT + p, { delayInMinutes: 1 });
}

// An alarm. `firedAt` is when Chrome delivered it, taken before it queued: its lateness does not grow while earlier prints run.
const printFired = (alarm, firedAt) => printSerial(async () => {
  const isWait = alarm.name.startsWith(PRINT_WAIT);
  const p = alarm.name.slice((isWait ? PRINT_WAIT : PRINT_PREFIX).length);
  const late = alarm.scheduledTime !== undefined && firedAt - alarm.scheduledTime > PRINT_LATE_MS;
  const lateMsg = 'The computer was off at the print time. Print now?';   // D664: asks, never prints by itself
  if (isWait) {
    const rec = await runGet(p);
    if (!rec || rec.state !== 'waiting') return;
    return late ? printOffer(p, rec.at, lateMsg) : printWait(p, rec.at, rec.since);
  }
  if (printPlan(await chrome.storage.local.get([PRINT_KEY, 'kcCutoff']), p).due === null) return;   // switched off meanwhile
  const cur = await runGet(p);
  if (cur && (cur.at === alarm.scheduledTime || cur.pendingAt === alarm.scheduledTime)) return;   // this very time arrived twice
  await printSchedule();   // the next time is set BEFORE this print, which can take minutes: one that comes round meanwhile queues behind it
  await (late ? printOffer(p, alarm.scheduledTime, lateMsg) : printWait(p, alarm.scheduledTime, firedAt));
});

// The seller's tap on a pop-up. It acts only on the run whose print time is in its id, and only in the state that pop-up is for.
const printClick = (id, button) => printSerial(async () => {
  const m = /^kcPrint(Go|Ask)_([a-z]+)_(\d+)$/.exec(id);
  if (!m) return;
  const [, kind, p, at] = m, rec = await runGet(p);
  if (!rec || String(rec.at) !== at || !(kind === 'Go' ? rec.state === 'offer' || rec.state === 'waiting' : rec.state === 'asked')) return chrome.notifications.clear(id);
  if (kind === 'Go') return button === 0 ? printStart(p, rec.at, rec.since, true) : undefined;
  // D652: printed means downloaded AND printed, on his word. Marked first; the question goes only once that is recorded.
  if (button === 0) {
    try { await printedMark(p, rec.orderIds); } catch (e) {
      await printShow(p, rec);   // the tapped pop-up is gone: bring it back so he can answer again
      return printSay(printName(p), 'The labels were printed, but Click could not record it (' + (e && e.message || e) + '). Answer again, or they print again next time.');
    }
  }
  await runEnd(p);
  await printNote(p, button === 0 ? 'Answered: got them. Marked as printed.' : 'Answered: no. Not marked as printed.');
  if (button !== 0) await printSay(printName(p), 'Not marked as printed. They will be offered again at the next print time.');
  if (rec.pendingAt && printPlan(await chrome.storage.local.get([PRINT_KEY, 'kcCutoff']), p).due !== null) await printOffer(p, rec.pendingAt, 'Time to print. Print now?');   // the print time that came while this question was open
});

// At every worker start: a print that was cut off, or a wait whose alarm is gone, is asked about, never printed by itself (D664).
async function printRecover() {
  // Closing the browser takes its pop-ups away; the record brings them back, once per browser run (not at every worker wake-up, which would
  // bring back a pop-up he closed on purpose). The mark in session storage goes with the browser.
  const again = !(await chrome.storage.session.get(PRINT_SHOWN))[PRINT_SHOWN];
  const shown = (await chrome.notifications.getAll()) || {};
  for (const p of PRINT_PLATFORMS) {
    try {   // one platform's trouble does not stop the others
      const rec = await runGet(p);
      if (!rec) continue;
      if (rec.state === 'printing') await printOffer(p, rec.at, 'A print at ' + new Date(rec.at).toTimeString().slice(0, 5) + ' did not finish. Print now?');
      else if (rec.state === 'waiting' && !(await chrome.alarms.get(PRINT_WAIT + p))) await printOffer(p, rec.at, 'The computer was off at the print time. Print now?');
      else if (again && !shown[(rec.state === 'asked' ? askId : goId)(p, rec.at)]) await printShow(p, rec);
    } catch (e) { printLog('recover', 'Something went wrong bringing back a print question: ')(e); }
  }
  await chrome.storage.session.set({ [PRINT_SHOWN]: true });
}

// Anything that goes wrong outside a print itself is said to the seller too, and written to the console.
const printLog = (what, message) => e => {
  console.log('[Kartaan Click] print ' + what + ': ' + e);
  printSay('print', message + (e && e.message || e));
};
if (typeof chrome !== 'undefined' && chrome.alarms) {
  chrome.alarms.onAlarm.addListener(alarm => {
    const firedAt = Date.now();
    if (alarm.name.startsWith(PRINT_PREFIX) || alarm.name.startsWith(PRINT_WAIT)) printFired(alarm, firedAt).catch(printLog('time', 'Something went wrong at the print time: '));
  });
  chrome.notifications.onButtonClicked.addListener((id, button) => { printClick(id, button).catch(printLog('answer', 'Something went wrong with your answer: ')); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[PRINT_KEY] || changes.kcCutoff)) printSerial(printSchedule).catch(printLog('schedule', 'Click could not set the next print time: '));
  });
  printSerial(printRecover).catch(printLog('recover', 'Something went wrong bringing back a print question: '));
  printSerial(printSchedule).catch(printLog('schedule', 'Click could not set the next print time: '));
}

// The panel's "Print now" for one platform: the same print as at a print time, started by hand. Never while that platform's last labels are still open.
const printNow = p => printSerial(async () => {
  if (!PRINT_PLATFORMS.includes(p)) return { ok: false, reason: 'Unknown platform.' };
  const old = await runGet(p);
  if (old && ['printing', 'asked', 'waiting'].includes(old.state)) return { ok: false, reason: 'A print for ' + printName(p) + ' is already open. Answer it first.' };
  await printStart(p, Date.now(), undefined, true);
  const after = await runGet(p);
  return { ok: true, waiting: !!after && after.state === 'waiting' };
});
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.url !== chrome.runtime.getURL('panel.html') || !msg || msg.type !== 'KC_PRINT_NOW') return;   // only the panel, not a seller page's script
    printNow(msg.platform).then(sendResponse, e => sendResponse({ ok: false, reason: String(e && e.message || e) }));
    return true;
  });
}

if (typeof module !== 'undefined') module.exports = { printTimesClean, printNextTime, printShipBy, printSources };
