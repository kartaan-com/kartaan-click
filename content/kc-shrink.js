// Kartaan Click -- shrink other extensions' overlays on the seller pages to a small round icon (N040, D791).
//
// WHAT IT CAN AND CANNOT REACH (Chrome docs, developer.chrome.com):
//  - Content scripts "share access to the page's DOM" (content-scripts, "Communication with
//    the embedding page"), so another extension's box that sits in the page can be hidden
//    and shown again from here.
//  - chrome.dom.openOrClosedShadowRoot "Gets the open shadow root or the closed shadow root
//    hosted by the specified element" (dom API), so a box drawn inside a closed shadow root
//    is still recognised as an extension's box.
//  - A box inside an iframe from another extension cannot be read, but the iframe itself is
//    an element of this page and can be hidden whole.
// It never edits another extension's contents: it only hides the box and puts a round icon
// in its corner. One click on the icon shows the box again, a second click folds it back.
// It recognises only: a fixed box hosting a shadow root, or a fixed iframe from an extension.
// Everything else (the platform's own controls) is left alone. No clicking, no reading of page
// text -- so the 3-minute idle wait (which guards clicks) does not apply to it.

(function () {
'use strict';

// Sign-in pages are left alone: a password manager's list there is not an add-on box to shrink.
if (/sign-?in|login|\/ap\//i.test(location.pathname)) return;

const OWN_IDS = ['__kcPanel', '__kcMeeshoPanel', '__kcSignIn', '__kcShrinkHost'];
const MAX_REDRAWS = 5;          // after this, the box keeps coming back: leave it open and say so
const REDRAW_WINDOW_MS = 10000; // the count starts again after ten quiet seconds
const tracked = new Map();      // element -> { name, open, redraws, icon }
const gaveUp = new Set();
let host, root, paused = false, timer = null;

function shadowOf(el) {
  try { return (chrome.dom && chrome.dom.openOrClosedShadowRoot(el)) || el.shadowRoot || null; }
  catch (e) { return el.shadowRoot || null; }
}

function recognise(el) {
  if (!(el instanceof HTMLElement) || OWN_IDS.indexOf(el.id) !== -1) return '';
  if (tracked.has(el) || gaveUp.has(el)) return '';
  const cs = getComputedStyle(el);
  if (cs.position !== 'fixed' || cs.display === 'none') return '';
  const r = el.getBoundingClientRect();
  if (r.width <= 64 && r.height <= 64) return '';           // already small
  if (el.tagName === 'IFRAME' && /^(chrome|moz)-extension:/.test(el.src || '')) return 'extension box';
  if (shadowOf(el)) return (el.id || el.tagName.toLowerCase()).slice(0, 24);
  return '';
}

function ensureHost() {
  if (host) return;
  host = document.createElement('div');
  host.id = '__kcShrinkHost';
  root = host.attachShadow({ mode: 'closed' });
  const st = document.createElement('style');
  st.textContent = 'button{all:initial;position:fixed;z-index:2147483647;width:36px;height:36px;border-radius:50%;'
    + 'background:#1f6feb;color:#fff;font:700 13px system-ui,Arial;text-align:center;line-height:36px;'
    + 'cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4)}button:hover{filter:brightness(1.15)}';
  root.appendChild(st);
  document.documentElement.appendChild(host);
}

function place(icon, r, open) {
  const top = open ? (r.top >= 40 ? r.top - 38 : r.bottom + 4) : r.top;
  icon.style.top = Math.max(4, Math.min(innerHeight - 40, top)) + 'px';
  const right = innerWidth - r.right;
  if (r.left > innerWidth / 2) icon.style.right = Math.max(4, right) + 'px';
  else icon.style.left = Math.max(4, r.left) + 'px';
}

function shrink(el, name) {
  ensureHost();
  const r = el.getBoundingClientRect();
  const icon = document.createElement('button');
  icon.textContent = name.charAt(0).toUpperCase();
  icon.title = 'Open ' + name + ' (shrunk by Kartaan Click)';
  const rec = { name, open: false, redraws: 0, last: 0, icon, shown: el.style.display, rect: r };
  place(icon, r, false);
  icon.onclick = () => {
    rec.open = !rec.open;
    paused = true;
    if (rec.open) { el.style.removeProperty('display'); if (rec.shown) el.style.display = rec.shown; }
    else el.style.setProperty('display', 'none', 'important');
    icon.textContent = rec.open ? '−' : name.charAt(0).toUpperCase();
    icon.title = (rec.open ? 'Fold ' : 'Open ') + name;
    icon.style.left = icon.style.right = '';
    place(icon, rec.rect, rec.open);
    setTimeout(() => { paused = false; }, 50);
  };
  root.appendChild(icon);
  tracked.set(el, rec);
  rec.watcher = new MutationObserver(later);
  rec.watcher.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
  el.style.setProperty('display', 'none', 'important');
}

function scan() {
  if (paused) { later(); return; }
  paused = true;
  const found = [];
  for (const el of document.body ? Array.from(document.body.children).concat(Array.from(document.documentElement.children)) : []) {
    const name = recognise(el);
    if (name) { shrink(el, name); found.push(name); }
  }
  // A box that came back by itself: hide it again, but only a few times.
  for (const [el, rec] of tracked) {
    if (!el.isConnected) { rec.icon.remove(); rec.watcher.disconnect(); tracked.delete(el); continue; }
    if (!rec.open && getComputedStyle(el).display !== 'none') {
      const now = Date.now();
      if (now - rec.last > REDRAW_WINDOW_MS) rec.redraws = 0;
      rec.last = now;
      if (++rec.redraws > MAX_REDRAWS) {
        rec.icon.remove(); rec.watcher.disconnect(); tracked.delete(el); gaveUp.add(el);
        el.style.removeProperty('display'); if (rec.shown) el.style.display = rec.shown;
      } else el.style.setProperty('display', 'none', 'important');
    }
  }
  noteInPanel(Array.from(gaveUp).filter(e => e.isConnected).map(e => (e.id || e.tagName.toLowerCase()).slice(0, 24)).slice(0, 5));
  setTimeout(() => { paused = false; }, 50);
}

// Say it in plain words inside Click's own order panel (Golden Rule 29). Text only, never markup.
function noteInPanel(left) {
  const panel = document.getElementById('__kcPanel') || document.getElementById('__kcMeeshoPanel');
  if (!panel || !left.length || panel.querySelector('.kcShrinkNote')) return;
  const note = document.createElement('div');
  note.className = 'kcShrinkNote';
  note.style.cssText = 'margin:0 10px 8px;padding:7px 9px;border-radius:6px;background:#2e2400;color:#f0d68a;font-size:11px';
  note.textContent = 'Kartaan Click could not keep this add-on box small: ' + left.join(', ') + '. It left it as it was.';
  const head = panel.querySelector('h4');
  if (head) head.after(note); else panel.appendChild(note);
  panel.setAttribute('data-kcnote', '1');      // lights the dot on the folded icon
}

function later() { clearTimeout(timer); timer = setTimeout(scan, 400); }   // one look per burst, no busy loop

const watch = { childList: true, subtree: false, attributes: true, attributeFilter: ['style', 'class'] };
const mo = new MutationObserver(later);
mo.observe(document.documentElement, watch);
if (document.body) mo.observe(document.body, watch);
later();
setTimeout(scan, 3000);     // overlays that draw themselves late
})();
