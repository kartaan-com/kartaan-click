// ─── Kartaan Seller Assist — VMS packing screen ─────────────────────────────
// Runs on the SynLabs VMS operator screen and does one thing: empties the AWB
// box by itself the moment a recording stops, then puts the cursor back in it.
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
function recordButtonLabel() {
  const buttons = [...document.querySelectorAll('button')];
  const button = buttons.filter(b => {
    const text = (b.innerText || '').trim().toLowerCase();
    return text === IDLE || text === BUSY;
  }).pop();
  return button ? (button.innerText || '').trim().toLowerCase() : null;
}

let lastLabel = recordButtonLabel();

function checkForStop() {
  const label = recordButtonLabel();
  if (label === lastLabel) return;
  const previous = lastLabel;
  lastLabel = label;
  if (previous === BUSY && label === IDLE && clearAwbBox()) {
    console.log(`[Kartaan Seller Assist ${BUILD}] recording stopped — AWB box cleared, cursor back in it`);
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
      console.log(`[Kartaan Seller Assist ${BUILD}] active on this VMS screen — kartaan.com`);
    } else if (++attempts > 20) {
      clearInterval(timer);
    }
  }, 250);
})();

}
