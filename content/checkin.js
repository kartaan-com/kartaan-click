// ─── Kartaan Click — portal check-ins ────────────────────────────────────────
//
// WHY THIS EXISTS: Flipkart, Meesho and Amazon all judge a seller partly on how
// often they are actually on the portal looking at their orders. Doing that by
// hand every half hour, all day, is a job in itself. This does the round: opens
// the orders page, clicks through the sub-tabs the seller would click, and closes
// again.
//
// THIS FILE ONLY DOES THE CLICKING. The deciding — when a round happens, whether
// it is inside the seller's hours, which sites are switched on — all lives in
// background.js, because a content script dies with its tab.
//
// IT IS COMPLETELY INERT unless the background worker opened this exact tab for a
// round. On a tab the seller opened themselves it asks once, is told no, and
// stops. It never clicks anything on a page the seller is working on.
//
// ⚠️ TWO THINGS THAT WILL BITE ANYONE EDITING THIS:
//   1. The round tab is opened BEHIND whatever the seller is doing, so it is a
//      hidden tab. Chrome slows a hidden tab's timers to one tick a SECOND, and
//      after it has been hidden five MINUTES, to one tick a minute. So a round
//      has to finish well inside five minutes. It does — a round is about half a
//      minute — but do not add long waits here.
//   2. Never use requestAnimationFrame in this file. It does not just slow down
//      in a hidden tab, it stops completely. A guard written with it once looked
//      like it was working and was in fact dead. Plain setTimeout only.

(function () {
'use strict';

// ── the round, per site ─────────────────────────────────────────────────────
//
// Each step is the WORDS THE SELLER WOULD CLICK, not a web address. That is
// deliberate: guessing a platform's internal addresses is exactly the kind of
// thing that gets a seller account into trouble, and those addresses change
// without warning. Clicking what is on screen is what a person does.
//
// If a step's words are not on the page, the round says so in its log and stops
// there. Nothing is forced, nothing breaks, and the log tells us which word to
// correct.
const SITES = {
  'seller.flipkart.com': {
    name:  'Flipkart',
    steps: ['To Accept', 'To Pack', 'To Accept'],
  },
  'supplier.meesho.com': {
    name:  'Meesho',
    steps: ['Orders', 'On Hold', 'Pending', 'Ready to Ship'],
  },
  'sellercentral.amazon.in': {
    name:  'Amazon',
    steps: ['Manage Orders', 'Pending', 'Unshipped'],
  },
};

const site = SITES[location.hostname];
if (!site) return;

// ── small helpers ───────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand  = (a, b) => Math.floor(a + Math.random() * (b - a));
const txt   = el => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();

function isVisible(el) {
  if (!el || !el.getBoundingClientRect) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
}

// A tab's label is rarely just its words — it usually carries a count, as
// "To Accept 12" or "Pending (4)". Strip the numbers and brackets off before
// comparing, so the count changing never breaks the match.
const norm = t => t.replace(/[()\[\]\d,]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

// Finds the thing on screen whose words are the ones we want. Several nested
// elements usually match the same words — an outer box wrapping the real tab —
// so the innermost one is taken, which is the one a person's click would land on.
function findByWords(words) {
  const want  = words.toLowerCase();
  const nodes = [...document.querySelectorAll('a, button, li, span, div, p, [role="tab"], [role="button"], [role="menuitem"]')];
  const hits  = nodes.filter(el => {
    const t = txt(el);
    return t && t.length <= 60 && norm(t) === want && isVisible(el);
  });
  return hits.filter(e => !hits.some(o => o !== e && e.contains(o)))[0] || null;
}

// Waits for `fn()` to return something, or gives up. Deliberately coarse (half a
// second) because a hidden tab cannot tick faster than once a second anyway.
async function waitFor(fn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > deadline) return null;
    await sleep(500);
  }
}

// A click that looks like a person's: the pointer arrives, presses, releases.
// Some of these pages ignore a bare .click() because they listen for the press,
// not the click, so all four are sent.
function humanClick(el) {
  const r = el.getBoundingClientRect();
  const x = r.left + r.width  * (0.35 + Math.random() * 0.3);
  const y = r.top  + r.height * (0.35 + Math.random() * 0.3);
  const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
  for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
    const Ctor = type.startsWith('pointer') && window.PointerEvent ? PointerEvent : MouseEvent;
    el.dispatchEvent(new Ctor(type, opts));
  }
  if (typeof el.click === 'function') el.click();
}

// ── are we even meant to be here? ───────────────────────────────────────────
//
// The background worker knows which tab it opened for a round. Asking it is the
// only reliable way for this script to know whether this tab is that one — a
// content script cannot see its own tab number. On the seller's own tab the
// answer is no and this file does nothing at all for the rest of the page's life.
function ask(message) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(message, reply => {
      void chrome.runtime.lastError;   // worker asleep or gone — treated as "no"
      resolve(reply || null);
    });
  });
}

async function run() {
  // Asked twice, a moment apart, only because this page can finish loading before
  // the worker has finished writing down which tab it just opened. Being told
  // "no" twice on the seller's own tab costs nothing and changes nothing.
  let hello = await ask({ type: 'CHECKIN_HELLO' });
  if (!hello || !hello.run) {
    await sleep(1500);
    hello = await ask({ type: 'CHECKIN_HELLO' });
  }
  if (!hello || !hello.run) return;

  const done = [];
  let   stoppedAt = null;

  // The page has only just started loading. Give it room to draw before hunting
  // for anything, or the first step fails on a page that was merely slow.
  await sleep(rand(2500, 4500));

  for (const words of site.steps) {
    const el = await waitFor(() => findByWords(words), 12000);
    if (!el) { stoppedAt = words; break; }
    humanClick(el);
    done.push(words);
    // A real person reads the list before moving on. This is also what makes the
    // round worth doing at all — a burst of instant clicks is not a person.
    await sleep(rand(1800, 5000));
  }

  await ask({
    type:    'CHECKIN_DONE',
    site:    site.name,
    done,
    stoppedAt,
  });
}

run();

})();
