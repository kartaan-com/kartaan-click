// ─── Kartaan Click — background service worker ───────────────────────────────
//
// Three jobs, and nothing else:
//   1. Getting Flipkart shipping labels onto the disk when the Print labels tool
//      clicks a row's "Print Labels" button. All of that is INERT unless the
//      on-page panel armed it in the last minute — no download the user starts
//      themselves is ever touched, renamed, or cancelled.
//   2. Asking once a day whether a newer version exists, so people on a manual
//      install find out instead of never hearing about it.
//   3. The portal check-in rounds — the whole second half of this file. Off
//      unless the seller switches it on.

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
    // NET-OK: kartaan.com/kartaan-click/version.json — the version file, read
    // only. Sends no body, no identifiers, no cookies of ours.
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
// whatever they are doing, clicks through the order tabs, and LEAVES THE TAB OPEN
// — one per portal, already signed in, so the next round has no login to get past.
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
  urls:      { flipkart: '', meesho: '', amazon: '' },   // blank means use the built-in
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
    host: 'seller.flipkart.com',
    url:  'https://seller.flipkart.com/index.html#dashboard/active-orders?query='
          + encodeURIComponent('{"activeShipmentTile":"pendingToAccept"}'),
  },
  meesho: {
    name: 'Meesho',
    host: 'supplier.meesho.com',
    // ⚠️ MEESHO HAS NO ADDRESS THAT WORKS FOR EVERYBODY. A real one looks like
    // .../panel/v3/new/fulfillment/<code>/orders/pending, and that <code> belongs
    // to one seller's account. Hard-coding one would send every other user of this
    // extension at somebody else's shop, and would put a real account code in a
    // public repository.
    //
    // The seller is not asked for it either. content/checkin.js reads the code out
    // of the address bar the first time they are on their own Meesho panel and
    // remembers it, and meeshoOrdersUrl() below builds the address from that. This
    // front door is only the fallback for before that has happened — and opening
    // it is itself what usually teaches the code, so the round after it works.
    url: 'https://supplier.meesho.com/',
  },
  amazon: {
    name: 'Amazon',
    host: 'sellercentral.amazon.in',
    url:  'https://sellercentral.amazon.in/orders-v3',
  },
};

// The address a round starts at for one portal: the seller's own if they have
// given one, otherwise the built-in. Checked against that portal's own hostname
// before it is used, so a typo or a pasted wrong link can never send a round
// somewhere else entirely.
// The Meesho orders address for THIS seller, built from the code learned off
// their own panel. Returns nothing until that has happened.
const MEESHO_CODE_KEY = 'kcMeeshoCode';

// Checked here as well as where it is learned, because a bad one may already be
// stored from before this list existed — "login" was, and a whole round went to
// Meesho's sign-in page because of it. Ignoring it here means the next time he is
// on a real panel page the right code is read and everything rights itself.
const MEESHO_NOT_A_CODE = [
  'login', 'signin', 'sign-in', 'logout', 'signup', 'register', 'auth',
  'home', 'orders', 'order', 'dashboard', 'panel', 'new', 'index', 'main',
  'error', 'notfound', 'undefined', 'null', 'growth', 'fulfillment',
];

async function meeshoOrdersUrl() {
  const code = (await chrome.storage.local.get(MEESHO_CODE_KEY))[MEESHO_CODE_KEY];
  if (!code || !/^[A-Za-z0-9_-]{3,40}$/.test(code)) return '';
  if (MEESHO_NOT_A_CODE.indexOf(String(code).toLowerCase()) !== -1) return '';
  return 'https://supplier.meesho.com/panel/v3/new/fulfillment/' + code + '/orders/pending';
}

async function checkinUrlFor(key, s) {
  const cfg    = CHECKIN_SITES[key];
  const custom = ((s.urls || {})[key] || '').trim();
  if (!custom) {
    if (key === 'meesho') return (await meeshoOrdersUrl()) || cfg.url;
    return cfg.url;
  }
  try {
    const u = new URL(custom);
    if (u.protocol === 'https:' && u.hostname === cfg.host) return u.href;
  } catch (e) { /* not a web address at all */ }
  return cfg.url;
}

// Long enough for the slowest honest case — a cold portal start-up, which the
// content script waits 30 seconds for, plus the clicks after it — and no longer.
const ROUND_TIMEOUT_MS = 75000;

// Tabs left open on a portal that needs signing in, one per portal. Kept so the
// next round does not open a SECOND tab on the same sign-in page, and the one
// after that a third. While that tab is still open the portal is skipped; once
// the seller closes it, the portal is tried again.
const CHECKIN_SIGNIN_TABS = 'kcCheckinSignInTabs';
const checkinRand = (a, b) => Math.floor(a + Math.random() * (b - a));

async function checkinSettings() {
  const saved = (await chrome.storage.local.get(CHECKIN_KEY))[CHECKIN_KEY] || {};
  return {
    ...CHECKIN_DEFAULTS, ...saved,
    sites: { ...CHECKIN_DEFAULTS.sites, ...(saved.sites || {}) },
    urls:  { ...CHECKIN_DEFAULTS.urls,  ...(saved.urls  || {}) },
  };
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

  // ⚠️ THE FLOOR IS NOT DECORATION. A gap of a minute is thirty rounds an hour
  // across three portals — hundreds of automatic visits a day to his own seller
  // account, which is precisely the pattern the settings page warns a platform
  // could take a dim view of. The settings page will not save less than ten, and
  // this holds the same line for anything saved before that rule existed.
  const MIN_GAP = 10;
  const lo = Math.max(MIN_GAP, Math.min(s.minGapMin, s.maxGapMin));
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

// How many page loads in the round tab have been allowed to try. These portals
// redirect on the way in — to sign-in, to a marketplace picker, from a front door
// to the real panel — and every redirect starts the content script again from
// nothing.
//
// Allowing every one of them is what made Amazon look like it was reloading over
// and over. Allowing exactly ONE was worse in the other direction: Meesho's front
// door redirects into the panel, the first script was carried off mid-sentence,
// the second was refused, and nobody ever reported back — which is exactly the
// "the page never answered" that came out of the 4 Sep round.
//
// So: a small handful. A genuine way in is one or two hops. Anything still
// bouncing after three is a loop, and gets nothing.
const MAX_ATTEMPTS_PER_TAB = 3;
let _roundAttempts = 0;

// This worker is shut down after roughly half a minute of quiet, which would
// abandon a round halfway through and leave its tab open. Touching a browser API
// every so often keeps it awake for the half minute a round actually takes.
function keepAwake() {
  const id = setInterval(() => { chrome.runtime.getPlatformInfo(() => {}); }, 20000);
  return () => clearInterval(id);
}

// ⚠️ A TAB NUMBER IS NOT A NAME. Chrome hands them out from a low number again
// every time it starts, so a number written down today is somebody else's tab
// tomorrow — and this list is what decides whether a tab is allowed to be clicked
// in. Left to itself it grew stale entries that were never removed, and a stale
// entry meant a round could start clicking about in an ordinary Meesho tab the
// seller had opened and was reading. Found in review 2026-09-04.
//
// Three things keep it honest now, and all three matter:
//   - the whole list is thrown away when the browser starts, because no number in
//     it survives that;
//   - an entry goes the moment its tab is closed (chrome.tabs.onRemoved);
//   - an entry says which portal it was for and when it was written, and both are
//     checked before it is believed — a tab now showing a different site, or one
//     written down more than half a day ago, is not it.
const SIGNIN_TAB_MAX_AGE_MS = 12 * 60 * 60 * 1000;

async function rememberSignInTab(key, tabId) {
  const all = (await chrome.storage.local.get(CHECKIN_SIGNIN_TABS))[CHECKIN_SIGNIN_TABS] || {};
  if (tabId == null) delete all[key];
  else all[key] = { id: tabId, host: CHECKIN_SITES[key].host, ts: Date.now() };
  await chrome.storage.local.set({ [CHECKIN_SIGNIN_TABS]: all });
}

// Which portal, if any, this tab is the waiting sign-in tab for. `url` is the
// address the tab is actually showing right now, which is the half of the check a
// stored number cannot do for itself.
function signInTabPortal(all, tabId, url) {
  if (tabId == null) return null;
  let host = '';
  try { host = new URL(url || '').hostname; } catch (e) { return null; }

  for (const key of Object.keys(all || {})) {
    const e = all[key];
    // Written by an older version as a bare number, with no portal and no date.
    // Not trusted — it is exactly the kind of entry this went wrong on.
    if (!e || typeof e !== 'object') continue;
    if (e.id !== tabId) continue;
    if (e.host !== host) continue;                                  // a different site now
    if (!e.ts || Date.now() - e.ts > SIGNIN_TAB_MAX_AGE_MS) continue;  // too old to mean anything
    return key;
  }
  return null;
}

async function forgetSignInTab(tabId) {
  const all = (await chrome.storage.local.get(CHECKIN_SIGNIN_TABS))[CHECKIN_SIGNIN_TABS] || {};
  let changed = false;
  for (const k of Object.keys(all)) {
    const e = all[k];
    const id = (e && typeof e === 'object') ? e.id : e;
    if (id === tabId) { delete all[k]; changed = true; }
  }
  if (changed) await chrome.storage.local.set({ [CHECKIN_SIGNIN_TABS]: all });
}

chrome.tabs.onRemoved.addListener((tabId) => { forgetSignInTab(tabId); });

// Is this portal already open somewhere in the browser?
//
// HIS IDEA, AND A GOOD ONE. A brand new tab starts from nothing, which on Meesho
// means the shop window and a sign-in — the thing that has stopped every Meesho
// round so far. A tab he already has open is already signed in and already
// through the door. Using it removes the whole problem rather than working round
// it, and it is one fewer tab on his screen.
//
// Returns the tab, and whether it is the one he is actually looking at.
async function findPortalTab(key) {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://' + CHECKIN_SITES[key].host + '/*' });
    if (!tabs || !tabs.length) return null;
    // Prefer one sitting in the background. Working in a tab somebody is watching
    // is the rude option, so it is the last resort, not the first.
    const idle = tabs.find(t => !t.active);
    return { tab: idle || tabs[0], watching: !idle };
  } catch (e) {
    return null;   // no permission, or the browser is not ready — fall back to a new tab
  }
}

// Do these two addresses land on the same loaded page? Everything but the part
// after the "#" being equal means the browser will not load anything.
function sameDocument(a, b) {
  try {
    const x = new URL(a), y = new URL(b);
    return x.origin === y.origin && x.pathname === y.pathname && x.search === y.search;
  } catch (e) {
    return false;
  }
}

function visitOnce(key, url, reuse) {
  return new Promise(resolve => {
    const cfg = CHECKIN_SITES[key];
    // Where his own tab was before the round borrowed it, so it can be put back.
    const cameFrom = reuse ? reuse.url : null;
    let settled = false;

    const finish = async (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const tabId = _roundTabId;
      _roundTabId    = null;
      _roundFinish   = null;
      _roundAttempts = 0;
      await chrome.storage.local.remove(CHECKIN_TAB);

      // NOTHING IS CLOSED. His point, and it is the right one: closing the tab
      // means the next round starts from nothing again — the front door, the
      // sign-in, the whole wall that has stopped every Meesho round. Left open,
      // the next round finds it, borrows it, and is already through the door.
      // One tab per portal, sitting there signed in, is the cheapest possible
      // answer to the problem.
      //
      // A tab that was HIS to begin with is also put back on the page it was on,
      // which a tab of ours has no need of — leaving ours on the orders page is
      // exactly where the next round wants it.
      if (tabId != null) {
        if (reuse && !result.signedOut && cameFrom && cameFrom !== url) {
          chrome.tabs.update(tabId, { url: cameFrom }, () => void chrome.runtime.lastError);
        }
        if (result.signedOut) await rememberSignInTab(key, tabId);
      }
      resolve({ ...result, reused: !!reuse });
    };

    const timer = setTimeout(() => {
      finish({ site: cfg.name, done: [], stoppedAt: null, timedOut: true });
    }, ROUND_TIMEOUT_MS);

    _roundFinish = finish;

    const started = (tab) => {
      if (chrome.runtime.lastError || !tab) {
        finish({ site: cfg.name, done: [], stoppedAt: null, failed: true });
        return;
      }
      _roundTabId    = tab.id;
      _roundAttempts = 0;
      // Written down as well as held in memory: if this worker is shut down
      // mid-round, the next start-up finds the abandoned tab and closes it. Only
      // ever a tab we opened — his own is never closed by that.
      if (!reuse) chrome.storage.local.set({ [CHECKIN_TAB]: tab.id });
    };

    if (reuse) {
      // ⚠️ SETTING A TAB'S ADDRESS IS NOT ALWAYS A PAGE LOAD. If it is already at
      // that address, the browser does nothing at all; and on Flipkart, where the
      // order tab lives after the "#", changing only that part moves the page
      // without loading it. Either way no content script starts, nobody says
      // hello, and the round sits there until it times out — which is exactly
      // what "Running…" and three idle tabs looked like.
      //
      // So when the address leads to the same document, it is reloaded on purpose.
      chrome.tabs.update(reuse.id, { url }, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          finish({ site: cfg.name, done: [], stoppedAt: null, failed: true });
          return;
        }
        started(tab);
        if (sameDocument(reuse.url, url)) {
          chrome.tabs.reload(tab.id, () => void chrome.runtime.lastError);
        }
      });
    } else {
      // Opened behind whatever the seller is doing — a round must never take the
      // screen away from them mid-task.
      chrome.tabs.create({ url, active: false }, started);
    }
  });
}

// The Flipkart tool works down a list of orders across page reloads, and it picks
// a run back up in ANY Flipkart tab that opens while it is going. A check-in tab
// is a Flipkart tab. So opening one mid-run would start a SECOND copy of the run
// clicking the same orders, and then close it half a minute later — on live
// orders. Flipkart is skipped for that round instead; there is no point checking
// in on a portal you are demonstrably already working on.
//
// "Running" is written by that tool and cleared by it when it stops. If its tab is
// closed part way, or the browser is shut down on it, nothing clears it and it
// says running for ever — and Flipkart would then be skipped on every round from
// then on, with a log line nobody has any reason to look into. So a run that
// started long enough ago that it cannot still be going is not believed. Six
// hours: his longest real runs are a hundred orders, well under an hour.
const ORDER_RUN_MAX_MS = 6 * 60 * 60 * 1000;

async function flipkartRunInProgress() {
  const st = (await chrome.storage.local.get('kcOrdersBot')).kcOrdersBot;
  if (!st || !st.running) return false;
  if (st.startedAt && Date.now() - st.startedAt > ORDER_RUN_MAX_MS) return false;
  return true;
}

// Only one round at a time. The alarm can go off while a "do one round now" is
// still going, and the button can be pressed twice — and two rounds share the one
// set of notes about which tab is which, so the first one's tab is orphaned and
// sits there until it times out. That is where the duplicate tabs and the "the
// page never answered" lines came from.
//
// The note is written down as well as held in memory, because the two rounds may
// not be in the same worker. It carries the time it was taken so a worker that
// dies mid-round cannot lock the feature out for good — after five minutes the
// note is simply out of date and ignored.
const CHECKIN_LOCK = 'kcCheckinRunning';
const LOCK_MAX_MS  = 5 * 60 * 1000;
let _roundInFlight = false;

async function takeRoundLock() {
  if (_roundInFlight) return false;
  const held = (await chrome.storage.local.get(CHECKIN_LOCK))[CHECKIN_LOCK];
  if (held && Date.now() - held < LOCK_MAX_MS) return false;
  _roundInFlight = true;
  await chrome.storage.local.set({ [CHECKIN_LOCK]: Date.now() });
  return true;
}

async function releaseRoundLock() {
  _roundInFlight = false;
  await chrome.storage.local.remove(CHECKIN_LOCK);
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

  if (!await takeRoundLock()) return;   // one already going

  const stopKeepAwake = keepAwake();
  try {
    // The note from a round this worker was shut down in the middle of. Only that
    // note — NOT the lock, which this round is now holding.
    await chrome.storage.local.remove(CHECKIN_TAB);

    for (const key of Object.keys(CHECKIN_SITES)) {
      if (!s.sites[key]) continue;
      if (key === 'flipkart' && await flipkartRunInProgress()) {
        await checkinLog({ site: 'Flipkart', done: [], stoppedAt: null, skipped: true });
        continue;
      }

      // There used to be a "skip this portal while its sign-in tab is open" rule
      // here, to stop sign-in tabs stacking up one per round. Reusing an existing
      // tab does that job properly: the same tab is borrowed again and the Log in
      // button tried again, so a portal that gets signed in comes back on its own
      // at the next round instead of waiting to be noticed.

      // Already open somewhere? Borrow it rather than starting a new one from
      // nothing — a tab he already has is signed in, which a new one may not be.
      const open = await findPortalTab(key);

      // He is looking at that portal right now. Checking in on a page somebody is
      // reading would take it out from under them, and there is nothing to prove
      // anyway: being on it is the very thing a check-in is standing in for.
      if (open && open.watching) {
        await checkinLog({ site: CHECKIN_SITES[key].name, done: [], onItAlready: true });
        continue;
      }

      const url = await checkinUrlFor(key, s);

      // Asked again, right at the last moment. The first ask was several waits
      // ago — looking up the open tabs and building the address are both trips
      // out of this worker — and an order run started in that gap would have a
      // second copy of itself opened on top of it, clicking real orders.
      if (key === 'flipkart' && await flipkartRunInProgress()) {
        await checkinLog({ site: 'Flipkart', done: [], stoppedAt: null, skipped: true });
        continue;
      }

      const r = await visitOnce(key, url, open ? open.tab : null);
      await checkinLog(r);
      // A breath between portals, so three tabs are not opened in one burst.
      await new Promise(res => setTimeout(res, checkinRand(4000, 12000)));
    }
  } catch (e) {
    // ⚠️ THE NEXT ROUND IS ARMED AT THE END OF THIS ONE, so anything thrown in the
    // middle used to end check-ins for good — silently, with the settings page
    // still showing a time for a round that was never coming. Whatever went
    // wrong, it is written to the log and the next round is still set.
    console.log('[Kartaan Click] check-in round failed: ' + (e && e.message ? e.message : e));
    try { await checkinLog({ site: '—', done: [], roundError: String((e && e.message) || e) }); } catch (e2) { /* nothing more to do */ }
  } finally {
    stopKeepAwake();
    await releaseRoundLock();
    await scheduleCheckin('round finished');
  }
}

// ── the watchdog ────────────────────────────────────────────────────────────
//
// The round timer is a single alarm, set for one moment, and it is re-set at the
// end of each round. So one round that never reaches its end — the worker shut
// down mid-round, the browser closed with it — takes the whole feature with it,
// and nothing ever notices. That is not a failure anybody would spot: the
// settings page goes on showing the time of a round that is not coming.
//
// This is the second timer that watches the first. It repeats on its own, so it
// cannot be lost the same way, and all it does is ask: are check-ins on, and is
// the next round either missing or overdue? If so, set one.
const CHECKIN_WATCHDOG = 'kcCheckinWatchdog';
const WATCHDOG_EVERY_MIN = 15;

async function checkinWatchdog() {
  const s = await checkinSettings();
  if (!s.enabled) return;
  if (_roundInFlight) return;

  const next = (await chrome.storage.local.get(CHECKIN_NEXT))[CHECKIN_NEXT];
  const overdue = !next || Date.now() - next > 2 * 60 * 1000;
  if (!overdue) return;

  // A lock left behind by a round that was shut down part way. Clearing it is
  // what lets rounds start again at all.
  const held = (await chrome.storage.local.get(CHECKIN_LOCK))[CHECKIN_LOCK];
  if (held && Date.now() - held >= LOCK_MAX_MS) await releaseRoundLock();

  await scheduleCheckin('watchdog — no round was due');
}

// ⚠️ ONLY IF IT IS NOT ALREADY THERE. Creating an alarm again with the same name
// replaces the old one and starts its wait over — and this worker is started up
// again several times an hour, by every message and every alarm. Re-arming each
// time would push the watchdog's own turn forever into the future, so the one
// timer meant to catch a stopped feature would itself never run.
function armWatchdog() {
  chrome.alarms.get(CHECKIN_WATCHDOG, (existing) => {
    void chrome.runtime.lastError;
    if (existing) return;
    chrome.alarms.create(CHECKIN_WATCHDOG, {
      delayInMinutes: WATCHDOG_EVERY_MIN, periodInMinutes: WATCHDOG_EVERY_MIN,
    });
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  // Nothing thrown in here may escape: an alarm listener that rejects takes its
  // error nowhere useful and the round is lost with it.
  if (alarm.name === CHECKIN_ALARM) {
    Promise.resolve(runCheckinRound()).catch(e => console.log('[Kartaan Click] round: ' + e));
  }
  if (alarm.name === CHECKIN_WATCHDOG) {
    Promise.resolve(checkinWatchdog()).catch(e => console.log('[Kartaan Click] watchdog: ' + e));
  }
});

// A second listener rather than another branch inside the one above: that one is
// working code doing a different job, and there is no reason to reach into it.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  // Asked by content/checkin.js on every page it loads on. Answering "no" is the
  // normal case — it means the seller opened that tab themselves.
  if (msg.type === 'CHECKIN_HELLO') {
    const tabId = sender && sender.tab ? sender.tab.id : null;

    if (tabId != null && tabId === _roundTabId && _roundAttempts < MAX_ATTEMPTS_PER_TAB) {
      _roundAttempts += 1;
      sendResponse({ run: true, mode: 'round' });
      return true;
    }

    // A tab left open asking the seller to sign in, which has just loaded a page.
    // If they are through, the round for that portal is picked up here instead of
    // being dropped for the day — being stopped by a sign-in page is a pause, not
    // an ending. The content script decides: it only carries on if the page it is
    // looking at is no longer a sign-in page.
    //
    // The tab is checked properly before that permission is given: it must still
    // be on the portal it was remembered for, the note must be recent, and — for
    // Flipkart — the order panel must not be mid-run, the same rule the round
    // itself follows. This branch had none of those and was the way a stale tab
    // number could be handed permission to click.
    (async () => {
      try {
        const waiting = (await chrome.storage.local.get(CHECKIN_SIGNIN_TABS))[CHECKIN_SIGNIN_TABS] || {};
        const url = (sender && sender.tab && sender.tab.url) || '';
        const key = signInTabPortal(waiting, tabId, url);
        if (!key)                                          { sendResponse({ run: false }); return; }
        if (key === 'flipkart' && await flipkartRunInProgress()) { sendResponse({ run: false }); return; }
        const s = await checkinSettings();
        if (!s.enabled || !s.sites[key])                   { sendResponse({ run: false }); return; }
        sendResponse({ run: true, mode: 'resume' });
      } catch (e) {
        sendResponse({ run: false });
      }
    })();
    return true;
  }

  // The seller signed in and the round for that portal ran in the tab that was
  // left open for them. The tab is theirs now and stays where it is — closing a
  // tab somebody is looking at is not ours to do — but the portal is no longer
  // waiting, so the next round treats it normally again.
  if (msg.type === 'CHECKIN_RESUMED_DONE') {
    const tabId = sender && sender.tab ? sender.tab.id : null;
    (async () => {
      if (!msg.signedOut) {
        await forgetSignInTab(tabId);
        await checkinLog({
          site: msg.site, done: msg.done || [], closed: msg.closed || [],
          stoppedAt: msg.stoppedAt || null, resumed: true,
          page: msg.page || '', at: msg.at || '',
        });
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === 'CHECKIN_DONE') {
    if (sender && sender.tab && sender.tab.id === _roundTabId && _roundFinish) {
      _roundFinish({
        site:      msg.site,
        done:      msg.done || [],
        stoppedAt: msg.stoppedAt || null,
        signedOut: !!msg.signedOut,
        page:      msg.page || '',
        at:        msg.at   || '',
      });
    }
    sendResponse({ ok: true });
    return true;
  }

  // The settings page saved a change, or asked for a round right now.
  if (msg.type === 'CHECKIN_RESCHEDULE') {
    scheduleCheckin('settings changed').then(() => sendResponse({ ok: true }));
    return true;
  }

  // Answered straight away, NOT when the round finishes. A round can take a
  // couple of minutes if a portal is slow, and waiting for it left the settings
  // page saying "Running…" with no sign of life. The list updates itself as each
  // portal reports in, which is a better thing to watch anyway.
  if (msg.type === 'CHECKIN_RUN_NOW') {
    runCheckinRound(true);
    sendResponse({ started: true });
    return true;
  }
});

// Notes a round leaves behind. NOTHING IS CLOSED — a portal tab left open is the
// whole point, and the next round borrows it rather than starting from the front
// door again. This only throws away the paperwork: which tab a round was using,
// and the note saying a round is going on.
//
// (This used to be called closeAbandonedRoundTab and its comment said the next
// start-up would close the tab. It has not closed anything since 30 Aug. Renamed
// so it says what it does.)
async function clearRoundNotes() {
  await chrome.storage.local.remove([CHECKIN_TAB, CHECKIN_LOCK]);
  _roundInFlight = false;
}

// Everything a browser session leaves behind that must not be believed in the
// next one. Tab numbers head that list: Chrome starts handing them out from the
// bottom again, so yesterday's numbers are today's other tabs.
async function clearStaleSession() {
  await clearRoundNotes();
  await chrome.storage.local.remove(CHECKIN_SIGNIN_TABS);
}

chrome.runtime.onStartup.addListener(() => {
  clearStaleSession().then(() => scheduleCheckin('browser started'));
  armWatchdog();
});
chrome.runtime.onInstalled.addListener(() => {
  clearStaleSession().then(() => scheduleCheckin('installed or updated'));
  armWatchdog();
});

// The worker is started again for all sorts of reasons after those two have been
// and gone — a message, an alarm, a download. Making sure the watchdog exists is
// cheap and it is the one timer that must never quietly not be there.
armWatchdog();
