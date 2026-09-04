// Shows whether a newer version exists. The background worker does the asking and
// leaves the answer in storage; this only reads it and puts it on screen.
//
// A separate file rather than a <script> block inside popup.html because
// extensions are not allowed to run script written inline in a page.

'use strict';

const box     = document.getElementById('update');
const version = document.getElementById('version');

version.textContent = 'Version ' + chrome.runtime.getManifest().version;

function render(info) {
  if (!info) return;

  if (info.updateAvailable && info.latest) {
    box.className = 'update new';
    box.textContent = '';

    // Built rather than written out as markup: the version number comes down from
    // a web address, and text that came from somewhere else is put on a page as
    // text, never as markup. Nothing else in the extension does, and this was the
    // one place left.
    const line = document.createElement('div');
    const strong = document.createElement('b');
    strong.textContent = 'Version ' + info.latest + ' is available.';
    line.appendChild(strong);
    box.appendChild(line);

    if (info.notes) {
      const notes = document.createElement('div');
      notes.className = 'notes';
      notes.textContent = info.notes;
      box.appendChild(notes);
    }

    if (info.url) {
      const a = document.createElement('a');
      a.href = info.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Download it';
      box.appendChild(a);
    }

    const how = document.createElement('div');
    how.className = 'notes';
    how.textContent = 'Unzip it over your existing folder, then press the reload '
      + 'arrow on this extension. Keeping the same folder keeps your settings.';
    box.appendChild(how);
    return;
  }

  // An update check that fails is usually just being offline. Say so plainly and
  // quietly rather than hiding it, but never dress it up as a problem.
  if (info.error && !info.latest) {
    box.className = 'update muted';
    box.textContent = 'Could not check for updates right now.';
    return;
  }

  box.className = 'update muted';
  box.textContent = 'Up to date.';
}

// ── the key that stops a recording on the VMS screen ────────────────────────
const STOP_KEY_SETTING = 'kcVmsStopKey';
const DEFAULT_STOP_KEY = 'Enter';

const keyBox    = document.getElementById('stopKey');
const changeBtn = document.getElementById('changeKey');
const keyHint   = document.getElementById('keyHint');
const NORMAL_HINT = 'It only works while a recording is actually running.';

// Space has no visible character, so it needs a name of its own on screen.
const pretty = k => (k === ' ' ? 'Space' : k);

chrome.storage.local.get(STOP_KEY_SETTING).then(res => {
  keyBox.textContent = pretty((res && res[STOP_KEY_SETTING]) || DEFAULT_STOP_KEY);
});

let listening = false;
changeBtn.addEventListener('click', () => {
  if (listening) return;
  listening = true;
  keyBox.textContent = '…';
  changeBtn.disabled = true;
  keyHint.textContent = 'Press the key you want to use. Escape cancels.';

  const onKey = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.removeEventListener('keydown', onKey, true);
    listening = false;
    changeBtn.disabled = false;

    if (e.key === 'Escape') {
      const res = await chrome.storage.local.get(STOP_KEY_SETTING);
      keyBox.textContent = pretty((res && res[STOP_KEY_SETTING]) || DEFAULT_STOP_KEY);
      keyHint.textContent = NORMAL_HINT;
      return;
    }

    await chrome.storage.local.set({ [STOP_KEY_SETTING]: e.key });
    keyBox.textContent = pretty(e.key);
    // A plain letter or digit is a poor choice: the barcode scanner types those
    // into the page, so one could stop a recording by accident.
    keyHint.textContent = /^[a-z0-9]$/i.test(e.key)
      ? 'Saved — but your scanner types letters and numbers, so this one could fire by accident. Enter or a function key is safer.'
      : 'Saved. Refresh the VMS tab to use it.';
  };

  document.addEventListener('keydown', onKey, true);
});

chrome.storage.local.get('_updateInfo').then(res => render(res._updateInfo));
chrome.runtime.sendMessage({ type: 'CHECK_UPDATE' }, info => {
  void chrome.runtime.lastError;
  render(info);
});

// ── portal check-ins: on or off, and when the next round is ─────────────────
// The settings themselves live on the options page; this is only the one-line
// summary on the popup, so there is somewhere obvious to see it is running.
chrome.storage.local.get(['kcCheckin', 'kcCheckinNext']).then(res => {
  const badge = document.getElementById('checkinState');
  if (!badge) return;
  const on   = !!(res.kcCheckin && res.kcCheckin.enabled);
  const next = res.kcCheckinNext;
  badge.className   = on ? 'on' : 'off';
  badge.textContent = !on ? 'Off'
    : (next ? 'On — next round ' + new Date(next).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
            : 'On');
});

// ── accepting orders: on, off, or on but with nothing ticked ────────────────
// The third state is the one worth showing. "On" with no SKUs ticked accepts
// nothing at all, and somebody who has switched it on and walked away should not
// have to find that out from an empty list at the end of the day.
chrome.storage.local.get(['kcAutoAccept', 'kcOrdersFilter']).then(res => {
  const badge = document.getElementById('acceptState');
  if (!badge) return;
  const s  = res.kcAutoAccept || {};
  const on = !!s.enabled && !!(s.sites && (s.sites.flipkart || s.sites.meesho));
  if (!on) { badge.className = 'off'; badge.textContent = 'Off'; return; }
  const filter = res.kcOrdersFilter || {};
  const ticked = (filter.accept || []).length + (filter.meeshoAccept || []).length;
  const onlyTicked = s.onlyTickedSkus !== false;
  if (onlyTicked && !ticked) {
    badge.className   = 'off';
    badge.textContent = 'On, but no SKUs ticked — nothing will be accepted';
    return;
  }
  badge.className   = 'on';
  badge.textContent = onlyTicked ? 'On — ' + ticked + ' SKU(s) ticked' : 'On — any SKU';
});
