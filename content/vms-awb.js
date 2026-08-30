// ─── Kartaan Click — VMS packing screen ─────────────────────────────
// Runs on the SynLabs VMS operator screen and does two things:
//   1. empties the AWB box by itself the moment a recording stops, and puts the
//      cursor back in it
//   2. lets a key on the keyboard stop the recording, so the operator does not
//      have to find the Stop button with the mouse between every parcel
//
// WHY THIS EXISTS: on the VMS packing screen, scanning an AWB starts the
// recording on its own, but stopping it does NOT clear the box. So between every
// two packets the operator has to click Stop, wipe the old number out by hand,
// and click the box again before the scanner will work — three actions where one
// should do, repeated hundreds of times a shift. This removes the last two.
//
// It never clicks anything and never touches the recording itself. It only
// watches the Record/Stop button's own text: Record → Stop means a packet is
// being recorded, Stop → Record means that packet is finished, and only on that
// second change is the box emptied — so the page has always finished with the
// number before it disappears.
//
// The whole extension is inert on any page that has no AWB box, so it costs
// nothing on the rest of the site.
//
// Free, from Kartaan — https://kartaan.com

if (!window.__kartaanVmsLoaded) {
window.__kartaanVmsLoaded = true;

'use strict';

const BUILD  = '1.0.0';
const AWB_ID = 'awbInput';
const IDLE   = 'record';   // button text when nothing is being recorded
const BUSY   = 'stop';     // button text while a packet is being recorded

// The page is React with Ant Design, so setting input.value directly does
// nothing — React keeps its own copy of the text and puts it straight back.
// Writing through the browser's own value setter and then firing an 'input'
// event is what makes React accept the box as genuinely empty.
function clearAwbBox() {
  const box = document.getElementById(AWB_ID);
  if (!box || !box.value) return false;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setValue.call(box, '');
  box.dispatchEvent(new Event('input', { bubbles: true }));
  box.focus();  // the barcode scanner types into whatever is focused
  return true;
}

// Found by its text, not by a class name — the button swaps classes when it
// flips between Record and Stop, but the words stay put.
function recordButton() {
  const buttons = [...document.querySelectorAll('button')];
  return buttons.filter(b => {
    const text = (b.innerText || '').trim().toLowerCase();
    return text === IDLE || text === BUSY;
  }).pop() || null;
}

function recordButtonLabel() {
  const button = recordButton();
  return button ? (button.innerText || '').trim().toLowerCase() : null;
}

let lastLabel = recordButtonLabel();
let recordingSince = 0;   // when the current recording started, for the guard below

function checkForStop() {
  const label = recordButtonLabel();
  if (label === lastLabel) return;
  const previous = lastLabel;
  lastLabel = label;
  if (previous === IDLE && label === BUSY) recordingSince = Date.now();
  if (previous === BUSY && label === IDLE && clearAwbBox()) {
    console.log(`[Kartaan Click ${BUILD}] recording stopped — AWB box cleared, cursor back in it`);
  }
}

// Watching the whole page rather than the button itself, because this is a
// single-page app: the button is thrown away and rebuilt whenever the operator
// moves between screens, so a watcher pinned to one button would go dead.
// The live video feed mutates constantly, so the check is collapsed down to at
// most one run per frame instead of one run per mutation.
let checkQueued = false;
new MutationObserver(() => {
  if (checkQueued) return;
  checkQueued = true;
  requestAnimationFrame(() => { checkQueued = false; checkForStop(); });
}).observe(document.body, { childList: true, subtree: true, characterData: true });

// The watcher above only runs on an animation frame, and the browser stops
// handing those out while a tab is not being drawn. That is fine for clearing
// the box — it happens as soon as the tab is looked at again — but the keyboard
// shortcut's safety guard needs to know exactly when a recording started, so it
// cannot depend on it. This slow timer calls the same function on the same
// terms; nothing about the behaviour changes, only how often it is checked.
setInterval(checkForStop, 300);

// ── Stop the recording from the keyboard ────────────────────────────────────
// Stopping a recording meant reaching for the mouse, finding the Stop button and
// clicking it, between every single parcel. This does it from one key instead.
//
// Enter by default, because the operator's hand is already there after a scan.
// Anyone whose barcode scanner sends Enter of its own accord can change the key
// from the extension's popup — for them, Enter would stop a recording the moment
// it started.
//
// TWO GUARDS, and both matter:
//   1. it only ever acts while the button actually says "Stop", so the key does
//      nothing at all when no recording is running
//   2. it ignores the key for the first moment of a recording, so a scanner that
//      sends its own Enter cannot cut a parcel short before it has been filmed
const STOP_KEY_SETTING = 'kcVmsStopKey';
const DEFAULT_STOP_KEY = 'Enter';
const MIN_RECORDING_MS = 1500;

let stopKey = DEFAULT_STOP_KEY;

try {
  chrome.storage.local.get(STOP_KEY_SETTING).then(res => {
    if (res && res[STOP_KEY_SETTING]) stopKey = res[STOP_KEY_SETTING];
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STOP_KEY_SETTING]) {
      stopKey = changes[STOP_KEY_SETTING].newValue || DEFAULT_STOP_KEY;
      console.log(`[Kartaan Click ${BUILD}] stop key is now "${stopKey}"`);
    }
  });
} catch (e) {
  // The extension was reloaded and this copy is orphaned. The shortcut simply
  // stays on its default; the page will be refreshed sooner or later.
}

document.addEventListener('keydown', (e) => {
  if (e.key !== stopKey) return;
  if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;

  const button = recordButton();
  if (!button) return;
  if ((button.innerText || '').trim().toLowerCase() !== BUSY) return;   // guard 1
  // Fail SAFE: if we never saw this recording start, we cannot know how long it
  // has been running, so the key does nothing rather than risk cutting it short.
  // (Happens only if the page was already recording when this script loaded —
  // the next parcel works normally.)
  if (!recordingSince || Date.now() - recordingSince < MIN_RECORDING_MS) return;   // guard 2

  // Nothing else should also act on this key — Enter in the AWB box would
  // otherwise reach the page's own handler as well.
  e.preventDefault();
  e.stopPropagation();
  button.click();
  console.log(`[Kartaan Click ${BUILD}] "${stopKey}" pressed — recording stopped`);
}, true);

// On a fresh page load the box is already empty and nothing is recording, so put
// the cursor there straight away — the first scan of a shift should work without
// a click too. Retried briefly because the box is drawn by React and may not
// exist yet at the moment this runs, and given up on quietly if it never appears
// (this is not the VMS screen, so there is nothing to do).
(function focusOnLoad() {
  let attempts = 0;
  const timer = setInterval(() => {
    const box = document.getElementById(AWB_ID);
    if (box) {
      box.focus();
      clearInterval(timer);
      console.log(`[Kartaan Click ${BUILD}] active on this VMS screen — kartaan.com`);
    } else if (++attempts > 20) {
      clearInterval(timer);
    }
  }, 250);
})();

}
