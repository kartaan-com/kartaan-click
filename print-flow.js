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
const PRINT_ASK     = 'kcPrintAsk';        // { platform, orderIds, n }: "printed N — got N?" not yet answered
const PRINT_PDFS    = 'kcPrintPdfs';       // session storage: the finished PDFs print.html shows
const PRINT_LATE_MS = 5 * 60 * 1000;       // later than this after its time = the computer was off: ask, never print (D664)
const PRINT_WAIT_MS = 2 * 60 * 60 * 1000;  // a print waiting for a free computer gives up after this
const printSources  = {};                  // platform -> async (shipBy) => [{ name, base64 }]

const printCutoffClean = typeof module !== 'undefined' ? require('./reminders.js').cutoffClean : cutoffClean;

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
  for (let day = 0; day <= 1; day++) {
    const d = new Date(now); d.setDate(d.getDate() + day); d.setHours(clean.hour, clean.minute, 0, 0);
    if (d.getTime() > now) return d.getTime();
  }
  return null;
}

const printSay = (title, message, buttons, id) => chrome.notifications.create(id || '', {
  type: 'basic', iconUrl: 'icons/icon128.png', title: 'Kartaan Click — ' + title, message,
  ...(buttons ? { buttons: buttons.map(t => ({ title: t })), requireInteraction: true } : {}),
});
const printName = platform => platform.charAt(0).toUpperCase() + platform.slice(1);

// Set (or clear) each platform's next print alarm. A platform with no cutoff set has no next cutoff to print for, so none.
async function printSchedule() {
  const saved = await chrome.storage.local.get([PRINT_KEY, 'kcCutoff']);
  for (const platform of ['meesho', 'flipkart', 'amazon']) {
    const times = printTimesClean(((saved[PRINT_KEY] || {})[platform] || {}).times);
    const due = printCutoffClean((saved.kcCutoff || {})[platform]) ? printNextTime(times, Date.now()) : null;
    const existing = await chrome.alarms.get(PRINT_PREFIX + platform);
    if (due === null) await chrome.alarms.clear(PRINT_PREFIX + platform);
    else if (!(existing && existing.scheduledTime === due)) chrome.alarms.create(PRINT_PREFIX + platform, { when: due });
  }
}

// The print step, behind one switch: how the finished PDFs reach paper. 'box' opens each in a tab for the
// seller to press Print once. A silent mode would be one more entry here, and nothing else would change.
const PRINT_MODES = {
  async box(outputs) {
    await chrome.storage.session.set({ [PRINT_PDFS]: outputs.map(o => o.base64) });
    for (let i = 0; i < outputs.length; i++) await chrome.tabs.create({ url: chrome.runtime.getURL('print.html?i=' + i) });
  },
};

// One print: labels for everything due by the next cutoff, put in front of the seller, then the count question.
async function printRun(platform) {
  // Whatever way it started (time, "Print now", the quiet-moment wait), nothing is left waiting to print it again.
  const waiting = (await chrome.storage.local.get(PRINT_PENDING))[PRINT_PENDING] || {};
  delete waiting[platform];
  await chrome.storage.local.set({ [PRINT_PENDING]: waiting });
  await chrome.alarms.clear(PRINT_WAIT + platform);
  const saved = await chrome.storage.local.get([PRINT_KEY, 'kcCutoff']);
  const source = printSources[platform];
  if (!source) return printSay(printName(platform), 'Print time reached, but Click cannot fetch ' + printName(platform) + ' labels yet. Nothing was printed.');
  const shipBy = printShipBy((saved.kcCutoff || {})[platform], Date.now());
  const files = await source(shipBy);
  if (!files || files.length === 0) return printSay(printName(platform), 'Nothing to print.');
  const r = await bridgeRun({ platform, files });
  if (!r.ok) return printSay(printName(platform), 'Labels were not made: ' + r.reason + ' Nothing was printed.');
  const mode = ((saved[PRINT_KEY] || {})[platform] || {}).mode;
  await (PRINT_MODES[mode] || PRINT_MODES.box)(r.outputs);
  const fresh = r.rows.filter(o => o && typeof o.orderId === 'string' && !r.alreadyPrinted.includes(o.orderId));
  await chrome.storage.local.set({ [PRINT_ASK]: { platform, orderIds: fresh.map(o => o.orderId), n: r.count.ordersOut } });
  return printSay(printName(platform), 'Printed ' + r.count.ordersOut + ' — did you get ' + r.count.ordersOut + '? ' + r.count.text,
    ['Yes, got them', 'No'], 'kcPrintAsk');
}

// The seller's answer to the count question (D652: printed means downloaded AND printed, on his word).
async function printAnswer(yes) {
  const ask = (await chrome.storage.local.get(PRINT_ASK))[PRINT_ASK];
  if (!ask) return;
  await chrome.storage.local.remove(PRINT_ASK);
  if (yes) await printedMark(ask.platform, ask.orderIds);
  else printSay(printName(ask.platform), 'Not marked as printed. They will be offered again at the next print time.');
}

// At a print time. Computer in use: wait for 3 idle minutes (N063), asking once if he wants it now (D793).
async function printWhenFree(platform, startedAt) {
  const pending = (await chrome.storage.local.get(PRINT_PENDING))[PRINT_PENDING] || {};
  if (await computerInUse()) {
    if (Date.now() - startedAt > PRINT_WAIT_MS) {
      delete pending[platform]; await chrome.storage.local.set({ [PRINT_PENDING]: pending });
      return printSay(printName(platform), 'Print time passed while the computer was in use. Nothing was printed.');
    }
    if (!pending[platform]) printSay(printName(platform), 'Time to print. Print now? Otherwise it waits for a quiet moment.', ['Print now'], 'kcPrintGo_' + platform);
    pending[platform] = startedAt; await chrome.storage.local.set({ [PRINT_PENDING]: pending });
    chrome.alarms.create(PRINT_WAIT + platform, { delayInMinutes: 1 });
    return;
  }
  return printRun(platform);
}

async function printFired(alarm) {
  if (alarm.name.startsWith(PRINT_WAIT)) {
    const platform = alarm.name.slice(PRINT_WAIT.length);
    const since = ((await chrome.storage.local.get(PRINT_PENDING))[PRINT_PENDING] || {})[platform];
    if (since) await printWhenFree(platform, since);
    return;
  }
  const platform = alarm.name.slice(PRINT_PREFIX.length);
  if (Date.now() - alarm.scheduledTime > PRINT_LATE_MS) {
    printSay(printName(platform), 'The computer was off at the print time. Print now?', ['Print now'], 'kcPrintGo_' + platform);   // D664: asks, never prints by itself
  } else {
    await printWhenFree(platform, Date.now());
  }
  await printSchedule();
}

const printLog = what => e => console.log('[Kartaan Click] print ' + what + ': ' + e);
if (typeof chrome !== 'undefined' && chrome.alarms) {
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name.startsWith(PRINT_PREFIX) || alarm.name.startsWith(PRINT_WAIT)) Promise.resolve(printFired(alarm)).catch(printLog('time'));
  });
  chrome.notifications.onButtonClicked.addListener((id, button) => {
    if (id === 'kcPrintAsk') Promise.resolve(printAnswer(button === 0)).catch(printLog('answer'));
    else if (id.startsWith('kcPrintGo_') && button === 0) Promise.resolve(printRun(id.slice('kcPrintGo_'.length))).catch(printLog('now'));
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[PRINT_KEY] || changes.kcCutoff)) Promise.resolve(printSchedule()).catch(printLog('schedule'));
  });
  Promise.resolve(printSchedule()).catch(printLog('schedule'));
}

if (typeof module !== 'undefined') module.exports = { printTimesClean, printNextTime, printShipBy, printSchedule, printRun, printAnswer, printFired, printSources };
