// ─── Kartaan Click — the panel's Tools card: everything the old pop-up showed and did ───
//
// MOVED from popup.js (R496, his D1301: nothing of the pop-up is dropped). The words and the
// states are the pop-up's own; the pure functions below take the saved records and hand back what
// to show, so tests can check every state with no browser. The page draws them (panel.js).
'use strict';

const STOP_KEY_SETTING = 'kcVmsStopKey';
const DEFAULT_STOP_KEY = 'Enter';

// Space has no visible character, so it needs a name of its own on screen.
const keyName = k => (k === ' ' ? 'Space' : k || DEFAULT_STOP_KEY);

// Portal check-ins: off, on, or on with the next round's time.
function checkinView(res, fmt) {
  const on = !!(res.kcCheckin && res.kcCheckin.enabled), next = res.kcCheckinNext;
  return { on, text: !on ? 'Off' : (next ? 'On — next round ' + fmt(next) : 'On') };
}

// Accepting orders: off, on but nothing ticked (accepts nothing), or on.
function acceptView(res) {
  const s = res.kcAutoAccept || {};
  const on = !!s.enabled && !!(s.sites && (s.sites.flipkart || s.sites.meesho));
  if (!on) return { on: false, warn: false, text: 'Off' };
  const f = res.kcOrdersFilter || {};
  const ticked = (f.accept || []).length + (f.meeshoAccept || []).length;
  const never = (f.acceptBlock || []).length + (f.meeshoAcceptBlock || []).length;
  const onlyTicked = s.onlyTickedSkus !== false;
  if (onlyTicked && !ticked && !never) return { on: false, warn: true, text: 'On, but no SKUs ticked — nothing will be accepted' };
  return { on: true, warn: false, text: ticked ? 'On — ' + ticked + ' SKU(s) ticked'
    : never ? 'On — everything except ' + never + ' SKU(s)' : onlyTicked ? 'On — ' + ticked + ' SKU(s) ticked' : 'On — any SKU' };
}

// The update line: { kind: 'new'|'muted', lines: [text...], url? }. Text only; a version that came down from a web address is never markup.
function updateView(info, dateOf) {
  if (!info) return { kind: 'muted', lines: ['Checking for updates…'] };
  if (info.updateAvailable && info.latest) {
    const lines = ['Version ' + info.latest + ' is available.'];
    if (info.notes) lines.push(info.notes);
    lines.push('Unzip it over your existing folder, then press the reload arrow on this extension. Keeping the same folder keeps your settings.');
    return { kind: 'new', lines, url: info.url };
  }
  if (info.error) return { kind: 'muted', lines: [(info.latest && info.latestAt)
    ? 'Could not check for updates. Last heard on ' + dateOf(info.latestAt) + ' — the newest then was ' + info.latest + '.'
    : 'Could not check for updates right now.'] };
  return { kind: 'muted', lines: ['Up to date.'] };
}

// A plain letter or digit is a poor stop key: the barcode scanner types those into the page.
const keyHint = key => /^[a-z0-9]$/i.test(key)
  ? 'Saved — but your scanner types letters and numbers, so this one could fire by accident. Enter or a function key is safer.'
  : 'Saved. Refresh the VMS tab to use it.';

if (typeof module !== 'undefined') module.exports = { checkinView, acceptView, updateView, keyHint, keyName, STOP_KEY_SETTING };
