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
