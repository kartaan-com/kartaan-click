// ─── Kartaan Click — background service worker ───────────────────────────────
//
// Two jobs, and nothing else:
//   1. Getting Flipkart shipping labels onto the disk when the Print labels tool
//      clicks a row's "Print Labels" button. All of that is INERT unless the
//      on-page panel armed it in the last minute — no download the user starts
//      themselves is ever touched, renamed, or cancelled.
//   2. Asking once a day whether a newer version exists, so people on a manual
//      install find out instead of never hearing about it.

'use strict';

// Set by LABEL_ARM immediately before the panel clicks a "Print Labels" button.
// It times out on its own, so a stray download minutes later is never touched.
let _labelArmedAt = 0;
const ARM_WINDOW_MS = 60000;

// Separate from the arm above, and deliberately so. `_labelArmedAt` is cleared the
// instant the first download appears, because it decides whether to CANCEL — and a
// download we re-issue ourselves must never be cancelled again, or the worker
// chases its own tail forever. This second window only decides which folder a file
// goes in, which is safe to apply to both the original and the re-issue.
let _folderUntil = 0;

// DIAGNOSTIC, temporary — see BLOB_TEST in content/fk-orders.js. The tab that
// armed the current label, so the blob url can be handed straight back to it.
let _labelTabId = null;

// Where labels are filed. Chrome only allows a path relative to the user's own
// Downloads folder — an absolute path anywhere else on the disk is rejected by
// the browser, so this is as close to "a folder of your own" as an extension can
// get. Nothing outside this folder is affected.
const LABEL_FOLDER = 'Kartaan Click Labels';

const isArmed = () => _labelArmedAt && Date.now() - _labelArmedAt < ARM_WINDOW_MS;

// Writes the outcome where the panel can read it, so a failure shows up in the
// panel's log instead of disappearing silently.
function reportResult(result) {
  chrome.storage.local.set({ _labelDownloadResult: { ...result, ts: Date.now() } });
}

// Waits for the download to finish, then reports where it landed. When Chrome is
// set to ask where to save each file, the file only exists once the user has
// saved it — so this keeps waiting, which holds the whole run still (the panel
// waits on this result before touching the next order).
function trackDownload(id) {
  const deadline = Date.now() + 600000;   // ten minutes, then give up on this one
  const poll = () => {
    chrome.downloads.search({ id }, (items) => {
      const it = items && items[0];
      if (it && it.state === 'complete') {
        reportResult({ ok: true, filename: it.filename || '(saved)' });
        return;
      }
      if (it && it.state === 'interrupted') {
        reportResult({ ok: false, reason: 'Chrome stopped the download: ' + (it.error || 'unknown') });
        return;
      }
      if (Date.now() > deadline) {
        reportResult({ ok: false, reason: 'still not saved after 10 minutes — giving up on this one' });
        return;
      }
      setTimeout(poll, 700);
    });
  };
  poll();
}

// ─── Update check ────────────────────────────────────────────────────────────
//
// An extension installed from a ZIP never updates itself — only a store install
// does that, and self-hosted auto-update is Linux-only, so it does not exist for
// anyone here. This is the next best thing: the extension asks, once a day, what
// the newest version is, and says so. Nobody is forced to do anything.
//
// THIS IS THE ONLY TIME THE EXTENSION EVER CONTACTS A SERVER, and it sends
// nothing about the user — it is a plain read of one small public file.
//
// ⚠️ JAISWAL MUST PUBLISH THIS FILE for the check to do anything. Until it
// exists the check simply fails quietly and the extension carries on as normal.
// It should hold, and nothing else:
//   { "version": "1.2.0",
//     "url": "https://kartaan.com/download/kartaan-click.zip",
//     "notes": "Short line about what is new" }
const VERSION_URL    = 'https://kartaan.com/kartaan-click/version.json';
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

// True when `a` is a later version than `b`. Compares 1.2.0 style numbers part by
// part, so 1.10.0 correctly beats 1.9.0 — which comparing them as text would not.
function isNewer(a, b) {
  const pa = String(a || '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

async function checkForUpdate(force) {
  const previous  = (await chrome.storage.local.get('_updateInfo'))._updateInfo || {};
  const installed = chrome.runtime.getManifest().version;
  const now       = Date.now();

  // Once a day is plenty, and it means opening twenty tabs does not mean twenty
  // requests. `force` is for the popup's own "check now".
  if (!force && previous.checkedAt && now - previous.checkedAt < CHECK_EVERY_MS) return previous;

  let info;
  try {
    const res = await fetch(VERSION_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('the server answered ' + res.status);
    const data = await res.json();
    const latest = String(data.version || '');
    if (!latest) throw new Error('no version in the file');
    info = {
      checkedAt: now, installed, latest,
      url:   String(data.url || ''),
      notes: String(data.notes || ''),
      updateAvailable: isNewer(latest, installed),
      error: '',
    };
  } catch (e) {
    // Keep whatever was last known to be true and record why this attempt failed,
    // rather than silently pretending everything is fine (Golden Rule 29). Being
    // offline lands here, which is why it is never shown as an alarm.
    info = Object.assign({}, previous, {
      checkedAt: now, installed,
      error: (e && e.message) ? e.message : String(e),
    });
  }
  await chrome.storage.local.set({ _updateInfo: info });
  return info;
}

chrome.runtime.onInstalled.addListener(() => { checkForUpdate(true); });
chrome.runtime.onStartup.addListener(()   => { checkForUpdate(false); });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'LABEL_ARM') {
    _labelArmedAt = Date.now();
    _folderUntil  = Date.now() + ARM_WINDOW_MS;
    _labelTabId   = (sender && sender.tab && sender.tab.id != null) ? sender.tab.id : null;
    chrome.storage.local.remove(['_labelDownloadResult', '_labelBlobUrl'], () => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'CHECK_UPDATE') {
    checkForUpdate(!!msg.force).then(sendResponse);
    return true;
  }

  if (msg.type === 'LABEL_DISARM') {
    _labelArmedAt = 0;
    _folderUntil  = 0;
    sendResponse({ ok: true });
    return true;
  }
});

// Files the label into its own folder. This fires for EVERY download in the
// browser, so the armed check has to come first and has to be cheap — returning
// without calling suggest() leaves the download completely alone.
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  if (Date.now() > _folderUntil) return false;
  const name = (item.filename || 'label.pdf').split(/[\\/]/).pop();
  suggest({ filename: LABEL_FOLDER + '/' + name });
  return true;
});

chrome.downloads.onCreated.addListener((item) => {
  if (!isArmed()) return;
  _labelArmedAt = 0;   // one label per arm

  const url = item.url || '';

  // Flipkart builds the label inside its own page and hands Chrome a blob: url,
  // which belongs to that page — an extension cannot fetch it. Cancelling would
  // destroy the only copy, so leave Chrome to save it and just report where it
  // landed. (Proven the hard way; do not try to re-fetch a blob.)
  if (url.startsWith('blob:')) {
    // DIAGNOSTIC, temporary — see BLOB_TEST in content/fk-orders.js. Hand the blob
    // address straight back to the page's own content script, which lives at the
    // page's address and may be able to read what this worker cannot. Sent two
    // ways because the direct message can be refused for want of a host
    // permission, while storage always works; the content script takes whichever
    // arrives first. Nothing is cancelled and nothing waits on the answer — the
    // label saves exactly as it did before, either way.
    chrome.storage.local.set({ _labelBlobUrl: url });
    if (_labelTabId != null) {
      chrome.tabs.sendMessage(_labelTabId, { type: 'LABEL_BLOB_URL', url }, () => {
        void chrome.runtime.lastError;   // the tab may have gone; harmless here
      });
    }
    trackDownload(item.id);
    return;
  }

  // A normal https label can be re-issued by us with saveAs:false, which skips
  // the Save-As box even when Chrome is set to ask every time.
  chrome.downloads.cancel(item.id, () => { chrome.downloads.erase({ id: item.id }, () => {}); });
  chrome.downloads.download({ url, saveAs: false }, (id) => {
    if (chrome.runtime.lastError || id == null) {
      reportResult({ ok: false, reason: (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'download refused' });
      return;
    }
    trackDownload(id);
  });
});

// ─── Portal check-ins ────────────────────────────────────────────────────────
//
// Flipkart, Meesho and Amazon all take "is this seller on the portal looking at
// their orders" as a sign of how seriously the shop is being run. This does that
// round on the seller's behalf: every so often it opens each portal behind
// whatever they are doing, clicks through the order tabs, and closes again.
//
// The clicking itself is content/checkin.js. Everything about WHEN lives here,
// because a content script dies with its tab and a schedule cannot.
//
// NOTHING HAPPENS UNTIL THE SELLER SWITCHES IT ON. It is off out of the box, and
// the hours and the gap between rounds are theirs to set.
//
// ⚠️ THE TIMER MUST BE AN ALARM, NOT A setTimeout. This worker is shut down
// after about half a minute of doing nothing, and every setTimeout in it dies
// with it. chrome.alarms survives that — it is the only timer that does.

const CHECKIN_KEY   = 'kcCheckin';       // the seller's settings
const CHECKIN_LOG   = 'kcCheckinLog';    // what the last few rounds did
const CHECKIN_NEXT  = 'kcCheckinNext';   // when the next round is due
const CHECKIN_TAB   = 'kcCheckinTabId';  // the tab a round is using right now
const CHECKIN_ALARM = 'kcCheckinRound';

const CHECKIN_DEFAULTS = {
  enabled:   false,
  minGapMin: 20,     // never closer together than this
  maxGapMin: 60,     // never further apart than this
  fromHour:  9,      // 9 AM — the default; the seller can change both
  toHour:    21,     // 9 PM
  sites:     { flipkart: true, meesho: true, amazon: true },
};

// Where a round starts on each portal.
//
// Flipkart's is the Active Orders address the Flipkart tool already uses and
// which is proven in daily use — not a guess. The other two are the plain front
// door of the seller panel, on purpose: guessing a platform's inner addresses is
// the sort of thing that goes wrong quietly, and they change without notice. So
// the round lands on the front door and clicks its way in like a person would.
const CHECKIN_SITES = {
  flipkart: {
    name: 'Flipkart',
    url:  'https://seller.flipkart.com/index.html#dashboard/active-orders?query='
          + encodeURIComponent('{"activeShipmentTile":"pendingToAccept"}'),
  },
  meesho: { name: 'Meesho', url: 'https://supplier.meesho.com/' },
  amazon: { name: 'Amazon', url: 'https://sellercentral.amazon.in/' },
};

const ROUND_TIMEOUT_MS = 90000;   // a portal that never answers must not hold the round up
const checkinRand = (a, b) => Math.floor(a + Math.random() * (b - a));

async function checkinSettings() {
  const saved = (await chrome.storage.local.get(CHECKIN_KEY))[CHECKIN_KEY] || {};
  return { ...CHECKIN_DEFAULTS, ...saved, sites: { ...CHECKIN_DEFAULTS.sites, ...(saved.sites || {}) } };
}

async function checkinLog(entry) {
  const all = (await chrome.storage.local.get(CHECKIN_LOG))[CHECKIN_LOG] || [];
  all.unshift({ ts: Date.now(), ...entry });
  await chrome.storage.local.set({ [CHECKIN_LOG]: all.slice(0, 50) });
}

// Is `ts` inside the seller's working hours? Written to cope with a window that
// runs past midnight (9 PM to 9 AM), which is a perfectly reasonable thing for
// somebody on a night shift to want.
function insideHours(ts, s) {
  const d = new Date(ts);
  const mins = d.getHours() * 60 + d.getMinutes();
  const from = s.fromHour * 60, to = s.toHour * 60;
  if (from === to) return true;                 // a full day
  return from < to ? (mins >= from && mins < to) : (mins >= from || mins < to);
}

// The next moment the window opens, after `ts`.
function nextWindowStart(ts, s) {
  const start = new Date(ts);
  start.setHours(s.fromHour, 0, 0, 0);
  if (start.getTime() <= ts) start.setDate(start.getDate() + 1);
  return start.getTime();
}

// Picks when the next round happens and sets the alarm for it. A round that would
// land outside the seller's hours is not skipped, it is moved to just after the
// hours open — with a few random minutes on top, so it never arrives at the same
// tidy time every morning.
async function scheduleCheckin(reason) {
  const s = await checkinSettings();
  await chrome.alarms.clear(CHECKIN_ALARM);
  if (!s.enabled) {
    await chrome.storage.local.remove(CHECKIN_NEXT);
    return;
  }

  const lo = Math.max(1, Math.min(s.minGapMin, s.maxGapMin));
  const hi = Math.max(lo + 1, Math.max(s.minGapMin, s.maxGapMin));
  let when = Date.now() + checkinRand(lo, hi) * 60000;
  if (!insideHours(when, s)) when = nextWindowStart(when, s) + checkinRand(0, 9) * 60000;

  await chrome.storage.local.set({ [CHECKIN_NEXT]: when });
  chrome.alarms.create(CHECKIN_ALARM, { when });
  if (reason) console.log('[Kartaan Click] next check-in ' + new Date(when).toLocaleString() + ' (' + reason + ')');
}

// ── one round ───────────────────────────────────────────────────────────────

// The tab this round is driving, and the way to finish waiting on it. The content
// script asks "is this me?" before it touches anything, and only acts if the
// answer is yes — which is what keeps every other tab, the seller's own, alone.
let _roundTabId  = null;
let _roundFinish = null;

// This worker is shut down after roughly half a minute of quiet, which would
// abandon a round halfway through and leave its tab open. Touching a browser API
// every so often keeps it awake for the half minute a round actually takes.
function keepAwake() {
  const id = setInterval(() => { chrome.runtime.getPlatformInfo(() => {}); }, 20000);
  return () => clearInterval(id);
}

function visitOnce(key) {
  return new Promise(resolve => {
    const cfg = CHECKIN_SITES[key];
    let settled = false;

    const finish = async (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const tabId = _roundTabId;
      _roundTabId  = null;
      _roundFinish = null;
      await chrome.storage.local.remove(CHECKIN_TAB);
      if (tabId != null) chrome.tabs.remove(tabId, () => void chrome.runtime.lastError);
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ site: cfg.name, done: [], stoppedAt: null, timedOut: true });
    }, ROUND_TIMEOUT_MS);

    _roundFinish = finish;

    // Opened behind whatever the seller is doing — a round must never take the
    // screen away from them mid-task.
    chrome.tabs.create({ url: cfg.url, active: false }, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        finish({ site: cfg.name, done: [], stoppedAt: null, failed: true });
        return;
      }
      _roundTabId = tab.id;
      // Written down as well as held in memory: if this worker is shut down
      // mid-round, the next start-up finds the abandoned tab and closes it.
      chrome.storage.local.set({ [CHECKIN_TAB]: tab.id });
    });
  });
}

// The Flipkart tool works down a list of orders across page reloads, and it picks
// a run back up in ANY Flipkart tab that opens while it is going. A check-in tab
// is a Flipkart tab. So opening one mid-run would start a SECOND copy of the run
// clicking the same orders, and then close it half a minute later — on live
// orders. Flipkart is skipped for that round instead; there is no point checking
// in on a portal you are demonstrably already working on.
async function flipkartRunInProgress() {
  const st = (await chrome.storage.local.get('kcOrdersBot')).kcOrdersBot;
  return !!(st && st.running);
}

// `force` is the settings page's "do one round now": the seller asked for it there
// and then, so the working-hours window does not apply to it.
async function runCheckinRound(force) {
  const s = await checkinSettings();
  if (!s.enabled) return;

  if (!force && !insideHours(Date.now(), s)) {
    await scheduleCheckin('outside hours');
    return;
  }

  // A tab left behind by a round this worker was shut down in the middle of.
  await closeAbandonedRoundTab();

  const stopKeepAwake = keepAwake();
  try {
    for (const key of Object.keys(CHECKIN_SITES)) {
      if (!s.sites[key]) continue;
      if (key === 'flipkart' && await flipkartRunInProgress()) {
        await checkinLog({ site: 'Flipkart', done: [], stoppedAt: null, skipped: true });
        continue;
      }
      const r = await visitOnce(key);
      await checkinLog(r);
      // A breath between portals, so three tabs are not opened in one burst.
      await new Promise(res => setTimeout(res, checkinRand(4000, 12000)));
    }
  } finally {
    stopKeepAwake();
  }
  await scheduleCheckin('round finished');
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CHECKIN_ALARM) runCheckinRound();
});

// A second listener rather than another branch inside the one above: that one is
// working code doing a different job, and there is no reason to reach into it.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  // Asked by content/checkin.js on every page it loads on. Answering "no" is the
  // normal case — it means the seller opened that tab themselves.
  if (msg.type === 'CHECKIN_HELLO') {
    sendResponse({ run: !!(sender && sender.tab && sender.tab.id === _roundTabId) });
    return true;
  }

  if (msg.type === 'CHECKIN_DONE') {
    if (sender && sender.tab && sender.tab.id === _roundTabId && _roundFinish) {
      _roundFinish({ site: msg.site, done: msg.done || [], stoppedAt: msg.stoppedAt || null });
    }
    sendResponse({ ok: true });
    return true;
  }

  // The settings page saved a change, or asked for a round right now.
  if (msg.type === 'CHECKIN_RESCHEDULE') {
    scheduleCheckin('settings changed').then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'CHECKIN_RUN_NOW') {
    runCheckinRound(true).then(() => sendResponse({ ok: true }));
    return true;
  }
});

// If the worker was shut down mid-round, a tab it opened is still sitting there
// with nobody watching it. Close it on the way back up.
async function closeAbandonedRoundTab() {
  const id = (await chrome.storage.local.get(CHECKIN_TAB))[CHECKIN_TAB];
  if (id == null) return;
  await chrome.storage.local.remove(CHECKIN_TAB);
  chrome.tabs.remove(id, () => void chrome.runtime.lastError);
}

chrome.runtime.onStartup.addListener(()   => { closeAbandonedRoundTab(); scheduleCheckin('browser started'); });
chrome.runtime.onInstalled.addListener(() => { closeAbandonedRoundTab(); scheduleCheckin('installed or updated'); });
