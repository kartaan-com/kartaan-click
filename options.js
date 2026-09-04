// The settings page for portal check-ins. It only reads and writes settings —
// all the deciding and the clicking happen in background.js and
// content/checkin.js. A separate file rather than a <script> block inside the
// page because extensions are not allowed to run script written inline.

'use strict';

const KEY  = 'kcCheckin';
const LOG  = 'kcCheckinLog';
const NEXT = 'kcCheckinNext';

const DEFAULTS = {
  enabled:   false,
  minGapMin: 20,
  maxGapMin: 60,
  fromHour:  9,
  toHour:    21,
  sites:     { flipkart: true, meesho: true, amazon: true },
};

const $ = id => document.getElementById(id);

// "9 AM", "12 noon", "9 PM" — the way somebody says a time out loud, rather than
// the 24-hour clock, which is easy to misread when setting working hours.
function hourName(h) {
  if (h === 0)  return '12 midnight';
  if (h === 12) return '12 noon';
  return (h % 12) + (h < 12 ? ' AM' : ' PM');
}

for (const sel of [$('fromHour'), $('toHour')]) {
  for (let h = 0; h < 24; h++) {
    const o = document.createElement('option');
    o.value = String(h);
    o.textContent = hourName(h);
    sel.appendChild(o);
  }
}

function fill(s) {
  $('enabled').checked = !!s.enabled;
  $('minGap').value    = s.minGapMin;
  $('maxGap').value    = s.maxGapMin;
  $('fromHour').value  = String(s.fromHour);
  $('toHour').value    = String(s.toHour);
  $('siteFlipkart').checked = !!s.sites.flipkart;
  $('siteMeesho').checked   = !!s.sites.meesho;
  $('siteAmazon').checked   = !!s.sites.amazon;
}

// Reads the boxes back. A typed number can be blank or nonsense, and the two gaps
// can be the wrong way round, so both are straightened out here rather than
// letting a bad pair reach the scheduler.
function collect() {
  const num = (el, dflt) => {
    const n = parseInt(el.value, 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 720) : dflt;
  };
  let lo = num($('minGap'), DEFAULTS.minGapMin);
  let hi = num($('maxGap'), DEFAULTS.maxGapMin);
  if (hi < lo) { const t = lo; lo = hi; hi = t; }

  return {
    enabled:   $('enabled').checked,
    minGapMin: lo,
    maxGapMin: hi,
    fromHour:  parseInt($('fromHour').value, 10),
    toHour:    parseInt($('toHour').value, 10),
    sites: {
      flipkart: $('siteFlipkart').checked,
      meesho:   $('siteMeesho').checked,
      amazon:   $('siteAmazon').checked,
    },
  };
}

async function showNext() {
  const when = (await chrome.storage.local.get(NEXT))[NEXT];
  const s    = { ...DEFAULTS, ...((await chrome.storage.local.get(KEY))[KEY] || {}) };
  if (!s.enabled)  { $('next').textContent = 'Check-ins are off.'; return; }
  if (!when)       { $('next').textContent = 'No round scheduled yet — press Save.'; return; }
  $('next').textContent = 'Next round: ' + new Date(when).toLocaleString();
}

function describe(e) {
  const at = new Date(e.ts).toLocaleString();
  if (e.skipped)  return at + '  ' + e.site + ' — skipped, the order panel was mid-run on this portal';
  if (e.failed)   return at + '  ' + e.site + ' — the tab could not be opened';
  if (e.timedOut) return at + '  ' + e.site + ' — no answer from the page (signed out, or very slow)';
  const did = (e.done && e.done.length) ? e.done.join(' → ') : 'nothing';
  return at + '  ' + e.site + ' — ' + did
       + (e.stoppedAt ? '\n            stopped: could not find "' + e.stoppedAt + '" on the page' : '');
}

async function showLog() {
  const all = (await chrome.storage.local.get(LOG))[LOG] || [];
  $('log').textContent = all.length ? all.map(describe).join('\n') : 'Nothing yet.';
}

$('save').addEventListener('click', async () => {
  const s = collect();
  await chrome.storage.local.set({ [KEY]: s });
  fill(s);                                   // show the tidied-up values back
  chrome.runtime.sendMessage({ type: 'CHECKIN_RESCHEDULE' }, () => {
    void chrome.runtime.lastError;
    showNext();
  });
  $('saved').textContent = 'Saved.';
  setTimeout(() => { $('saved').textContent = ''; }, 2500);
});

// A round on demand, so a new setup can be proved in half a minute instead of
// waiting to see whether it ever fires. It ignores the hours on purpose — you
// asked for it, so it runs.
$('runNow').addEventListener('click', async () => {
  const s = collect();
  if (!s.enabled) { $('saved').textContent = 'Switch check-ins on and Save first.'; return; }
  await chrome.storage.local.set({ [KEY]: s });
  $('runNow').disabled = true;
  $('saved').textContent = 'Running…';
  chrome.runtime.sendMessage({ type: 'CHECKIN_RUN_NOW' }, () => {
    void chrome.runtime.lastError;
    $('runNow').disabled = false;
    $('saved').textContent = 'Done — see the list below.';
    showLog();
    showNext();
  });
});

$('clearLog').addEventListener('click', async () => {
  await chrome.storage.local.remove(LOG);
  showLog();
});

chrome.storage.local.get(KEY).then(res => {
  const saved = res[KEY] || {};
  fill({ ...DEFAULTS, ...saved, sites: { ...DEFAULTS.sites, ...(saved.sites || {}) } });
  showNext();
  showLog();
});
