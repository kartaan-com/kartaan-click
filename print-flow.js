// ─── Kartaan Click — print times, the next-cutoff rule, and the print step ───
//
// The seller sets, per platform, one or more print times (D784). At each one Click
// looks at the NEXT cutoff and takes everything that must ship by it (D675), has
// the Label Cropper make the labels (cropper-bridge.js), puts them in front of the
// seller to print, then asks "printed N — got N?" (D782) and only on a yes marks
// the orders printed (D652). Every number is the seller's own setting.
//
// Where the label files come from is `printSources[platform](shipBy)`: the walk of
// each platform's panel (round C1b-walk) puts its function there. Until it does, a
// print time says so in a notice instead of doing nothing. No print time can be set
// on the settings page yet, so nothing here fires for anyone until that exists.
//
// Loaded by background.js with importScripts, after reminders.js and cropper-bridge.js.
'use strict';

const PRINT_KEY     = 'kcPrintTimes';      // { meesho: { times: ['18:00', '09:00'], mode: 'box' }, ... }
const PRINT_PREFIX  = 'kcPrint_';          // one alarm per platform: its next print time
const PRINT_WAIT    = 'kcPrintWait_';      // checks once a minute while the seller is using the computer
const PRINT_PENDING = 'kcPrintPending';    // { platform: time it started waiting }
const PRINT_ASK     = 'kcPrintAsk';        // { platform: { orderIds } }: "printed N — got N?" not yet answered, one per platform
const PRINT_OFFER   = 'kcPrintOffer';      // { platform: print time }: a "Print now?" pop-up that is still live
const PRINT_NEXT    = 'kcPrintNext';       // { platform: the print time its alarm is set for }
const PRINT_PDFS    = 'kcPrintPdfs';       // session storage: the finished PDFs print.html shows
const PRINT_LATE_MS = 5 * 60 * 1000;       // later than this after its time = the computer was off: ask, never print (D664)
const PRINT_WAIT_MS = 2 * 60 * 60 * 1000;  // a print waiting for a free computer gives up after this
const printSources  = {};                  // platform -> async (shipBy) => [{ name, base64 }]

const printCutoffClean = typeof module !== 'undefined' ? require('./reminders.js').cutoffClean : cutoffClean;
const printBusy = typeof module !== 'undefined' ? require('./cropper-bridge.js').BRIDGE_BUSY : BRIDGE_BUSY;

// The seller's print times, cleaned: valid HH:MM only, no repeats, earliest first, at most 6.
function printTimesClean(raw) {
  const ok = (Array.isArray(raw) ? raw : []).filter(t => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t));
  return [...new Set(ok)].sort().slice(0, 6);
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

// D675: the next cutoff after `now` — everything that must ship by it is printed now.
function printShipBy(cutoff, now) {
  const clean = printCutoffClean(cutoff);
  if (!clean) return null;
  const d = new Date(now); d.setHours(clean.hour, clean.minute, 0, 0);
  if (d.getTime() <= now) { d.setDate(d.getDate() + 1); d.setHours(clean.hour, clean.minute, 0, 0); }
  return d.getTime();
}

const printSay = (title, message, buttons, id) => chrome.notifications.create(id || '', {
  type: 'basic', iconUrl: 'icons/icon128.png', title: 'Kartaan Click — ' + title, message,
  ...(buttons ? { buttons: buttons.map(t => ({ title: t })), requireInteraction: true } : {}),
});
const printName = platform => platform.charAt(0).toUpperCase() + platform.slice(1);

// Everything that changes the print records runs one after another, never two at once.
let printChain = Promise.resolve();
const printSerial = fn => { const job = printChain.then(fn); printChain = job.catch(() => {}); return job; };

// A "Print now?" pop-up, written down as live with the print time it stands for. Only a live one can start a print, once.
async function printOffer(platform, at, message) {
  const offers = (await chrome.storage.local.get(PRINT_OFFER))[PRINT_OFFER] || {};
  offers[platform] = at;
  await chrome.storage.local.set({ [PRINT_OFFER]: offers });
  printSay(printName(platform), message, ['Print now'], 'kcPrintGo_' + platform);
}

// Set (or clear) each platform's next print alarm. A platform with no cutoff set has no next cutoff to print for, so none.
// The time is also written down: if Chrome lost the alarm while the browser was shut, the missed time is asked about (D664).
async function printSchedule() {
  const saved = await chrome.storage.local.get([PRINT_KEY, 'kcCutoff', PRINT_NEXT]);
  const next = saved[PRINT_NEXT] || {};
  for (const platform of ['meesho', 'flipkart', 'amazon']) {
    const name = PRINT_PREFIX + platform;
    const existing = await chrome.alarms.get(name);
    if (existing && existing.scheduledTime <= Date.now()) continue;   // overdue and not fired yet: it fires and is handled, never replaced
    const times = printTimesClean(((saved[PRINT_KEY] || {})[platform] || {}).times);
    const due = printCutoffClean((saved.kcCutoff || {})[platform]) ? printNextTime(times, Date.now()) : null;
    if (due === null) { await chrome.alarms.clear(name); delete next[platform]; continue; }
    // A time whose alarm is gone and was never handled (printFired takes it out of the record) was missed with the browser shut.
    if (!existing && next[platform] && Date.now() - next[platform] > PRINT_LATE_MS) await printOffer(platform, next[platform], 'The computer was off at the print time. Print now?');
    next[platform] = due;
    if (!(existing && existing.scheduledTime === due)) chrome.alarms.create(name, { when: due });
  }
  await chrome.storage.local.set({ [PRINT_NEXT]: next });
}

// The print step, behind one switch: how the finished PDFs reach paper. 'box' opens each in a tab for the
// seller to press Print once. A silent mode would be one more entry here, and nothing else would change.
const PRINT_MODES = {
  async box(outputs) {
    await chrome.storage.session.set({ [PRINT_PDFS]: outputs.map(o => o.base64) });
    for (let i = 0; i < outputs.length; i++) await chrome.tabs.create({ url: chrome.runtime.getURL('print.html?i=' + i) });
  },
};

// One print: labels for everything due by the cutoff after `at` (the print time), put in front of the seller, then the count question.
// Callers hold the print chain (printSerial); nothing else calls this.
async function printRunNow(platform, at) {
  // Whatever way it started (time, "Print now", the quiet-moment wait), nothing is left waiting to print it again,
  // and an older "Print now?" pop-up must not be able to print the same labels a second time.
  const waiting = (await chrome.storage.local.get([PRINT_PENDING, PRINT_OFFER]));
  const pending = waiting[PRINT_PENDING] || {}, offers = waiting[PRINT_OFFER] || {};
  delete pending[platform]; delete offers[platform];
  await chrome.storage.local.set({ [PRINT_PENDING]: pending, [PRINT_OFFER]: offers });
  await chrome.alarms.clear(PRINT_WAIT + platform);
  chrome.notifications.clear('kcPrintGo_' + platform);
  const name = printName(platform);
  try {
    const saved = await chrome.storage.local.get([PRINT_KEY, 'kcCutoff']);
    const source = printSources[platform];
    if (!source) return printSay(name, 'Print time reached, but Click cannot fetch ' + name + ' labels yet. Nothing was printed.');
    const shipBy = printShipBy((saved.kcCutoff || {})[platform], at);
    if (shipBy === null) return printSay(name, 'There is no cutoff set for ' + name + ', so Click cannot tell what to print. Nothing was printed.');
    const files = await source(shipBy);
    if (!files || files.length === 0) return printSay(name, 'Nothing to print.');
    const r = await bridgeRun({ platform, files });
    if (!r.ok && r.reason === printBusy) {   // something else is using the cropper: try again in a minute, same as a busy computer
      pending[platform] = at; await chrome.storage.local.set({ [PRINT_PENDING]: pending });
      return chrome.alarms.create(PRINT_WAIT + platform, { delayInMinutes: 1 });
    }
    if (!r.ok) return printSay(name, 'Labels were not made: ' + r.reason + ' Nothing was printed.');
    const mode = ((saved[PRINT_KEY] || {})[platform] || {}).mode;
    await (PRINT_MODES[mode] || PRINT_MODES.box)(r.outputs);
    const asks = (await chrome.storage.local.get(PRINT_ASK))[PRINT_ASK] || {};
    asks[platform] = { orderIds: r.rows.filter(o => o && typeof o.orderId === 'string' && !r.alreadyPrinted.includes(o.orderId)).map(o => o.orderId) };
    await chrome.storage.local.set({ [PRINT_ASK]: asks });
    return printSay(name, 'Printed ' + r.count.ordersOut + ' — did you get ' + r.count.ordersOut + '? ' + r.count.text, ['Yes, got them', 'No'], 'kcPrintAsk_' + platform);
  } catch (e) {
    return printSay(name, 'Something went wrong and nothing was printed: ' + (e && e.message || e));
  }
}
const printRun = (platform, at = Date.now()) => printSerial(() => printRunNow(platform, at));

// "Print now" on a pop-up: starts the print for the time that pop-up stood for, but only while the pop-up is live, and only once.
const printTake = platform => printSerial(async () => {
  const at = ((await chrome.storage.local.get(PRINT_OFFER))[PRINT_OFFER] || {})[platform];
  if (at !== undefined) await printRunNow(platform, at);
});

// The seller's answer to one platform's count question (D652: printed means downloaded AND printed, on his word).
async function printAnswer(platform, yes) {
  const asks = (await chrome.storage.local.get(PRINT_ASK))[PRINT_ASK] || {};
  if (!asks[platform]) return;
  const ask = asks[platform];
  delete asks[platform];
  await chrome.storage.local.set({ [PRINT_ASK]: asks });
  if (yes) await printedMark(platform, ask.orderIds);
  else printSay(printName(platform), 'Not marked as printed. They will be offered again at the next print time.');
}

// At a print time. Computer in use: wait for 3 idle minutes (N063), asking once if he wants it now (D793).
async function printWhenFree(platform, startedAt) {
  const pending = (await chrome.storage.local.get(PRINT_PENDING))[PRINT_PENDING] || {};
  if (await computerInUse()) {
    if (Date.now() - startedAt > PRINT_WAIT_MS) {
      const offers = (await chrome.storage.local.get(PRINT_OFFER))[PRINT_OFFER] || {};   // its "Print now?" is no longer good
      delete pending[platform]; delete offers[platform];
      await chrome.storage.local.set({ [PRINT_PENDING]: pending, [PRINT_OFFER]: offers });
      chrome.notifications.clear('kcPrintGo_' + platform);
      return printSay(printName(platform), 'Print time passed while the computer was in use. Nothing was printed.');
    }
    if (!pending[platform]) await printOffer(platform, startedAt, 'Time to print. Print now? Otherwise it waits for a quiet moment.');
    pending[platform] = startedAt; await chrome.storage.local.set({ [PRINT_PENDING]: pending });
    chrome.alarms.create(PRINT_WAIT + platform, { delayInMinutes: 1 });
    return;
  }
  return printRunNow(platform, startedAt);
}

const printFired = alarm => printSerial(async () => {
  if (alarm.name.startsWith(PRINT_WAIT)) {
    const platform = alarm.name.slice(PRINT_WAIT.length);
    const since = ((await chrome.storage.local.get(PRINT_PENDING))[PRINT_PENDING] || {})[platform];
    if (since) await printWhenFree(platform, since);
    return;
  }
  const platform = alarm.name.slice(PRINT_PREFIX.length);
  try {
    const saved = await chrome.storage.local.get([PRINT_PENDING, PRINT_NEXT]);
    const pending = saved[PRINT_PENDING] || {}, next = saved[PRINT_NEXT] || {};
    delete pending[platform]; delete next[platform];   // one left by an earlier time must not hide this one's question; this time is handled
    await chrome.storage.local.set({ [PRINT_PENDING]: pending, [PRINT_NEXT]: next });
    if (Date.now() - alarm.scheduledTime > PRINT_LATE_MS) {
      await printOffer(platform, alarm.scheduledTime, 'The computer was off at the print time. Print now?');   // D664: asks, never prints by itself
    } else {
      await printWhenFree(platform, alarm.scheduledTime);
    }
  } finally {
    await printSchedule();   // the next print time is set even when this one went wrong
  }
});

// Anything that goes wrong outside a print itself is said to the seller too, and written to the console.
const printLog = what => e => {
  console.log('[Kartaan Click] print ' + what + ': ' + e);
  printSay('print', 'Something went wrong and nothing was printed: ' + (e && e.message || e));
};
if (typeof chrome !== 'undefined' && chrome.alarms) {
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name.startsWith(PRINT_PREFIX) || alarm.name.startsWith(PRINT_WAIT)) printFired(alarm).catch(printLog('time'));
  });
  chrome.notifications.onButtonClicked.addListener((id, button) => {
    if (id.startsWith('kcPrintAsk_')) printSerial(() => printAnswer(id.slice('kcPrintAsk_'.length), button === 0)).catch(printLog('answer'));
    else if (id.startsWith('kcPrintGo_') && button === 0) printTake(id.slice('kcPrintGo_'.length)).catch(printLog('now'));
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[PRINT_KEY] || changes.kcCutoff)) printSerial(printSchedule).catch(printLog('schedule'));
  });
  printSerial(printSchedule).catch(printLog('schedule'));
}

if (typeof module !== 'undefined') module.exports = { printTimesClean, printNextTime, printShipBy, printSchedule, printRun, printAnswer, printFired, printTake, printSources };
