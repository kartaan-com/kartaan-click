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
// IT DOES NOTHING UNLESS THE BACKGROUND WORKER SAYS THIS TAB IS PART OF A ROUND.
// It asks first, on every page load, and on almost every tab the answer is no and
// this file stops there. There are exactly two tabs where the answer is yes:
//   - a tab the worker opened for the round, or a background tab on that portal
//     that it BORROWED for the round (a tab the seller opened themselves, but is
//     not looking at — if they are looking at it, the round skips that portal);
//   - a tab that was left open asking the seller to sign in, once they have.
// Be honest about that second pair in the manual and the store listing: this does
// act inside tabs the seller opened. It just never does it in the one in front of
// them.
//
// ⚠️ FOUR THINGS THAT WILL BITE ANYONE EDITING THIS:
//   1. A REDIRECT CHAIN GETS A FEW HOPS, NOT UNLIMITED AND NOT ONE. These portals
//      redirect on the way in — to a sign-in page, to a marketplace picker, from a
//      front door into the real panel — and every redirect starts this script
//      again from nothing. Letting every load try reads as the page reloading over
//      and over, which is what Amazon looked like. Letting exactly one try was
//      worse the other way: Meesho's front door redirected, the first script was
//      carried off mid-sentence, the second was refused, and nobody ever reported
//      back. The worker allows three, then stops answering.
//   2. The round tab is opened BEHIND whatever the seller is doing, so it is a
//      hidden tab. Chrome slows a hidden tab's timers to one tick a SECOND, and
//      after it has been hidden five MINUTES, to one tick a minute. So a round
//      has to finish well inside five minutes.
//   3. Never use requestAnimationFrame in this file. It does not just slow down
//      in a hidden tab, it stops completely. A guard written with it once looked
//      like it was working and was in fact dead. Plain setTimeout only.
//   4. Signing in is the seller's job, not ours. When the page is a sign-in page
//      this says so on the page, leaves the tab open, and gets out of the way.

(function () {
'use strict';

// ── the round, per site ─────────────────────────────────────────────────────
//
// Each step is the WORDS THE SELLER WOULD CLICK, not a web address. That is
// deliberate: guessing a platform's internal addresses is exactly the kind of
// thing that gets a seller account into trouble, and those addresses change
// without warning. Clicking what is on screen is what a person does.
//
// If a step's words are not on the page, the round says so — with the name of the
// page it was actually looking at — and stops there. Nothing is forced, nothing
// breaks, and the log tells us which word to correct.
// The round LANDS ON THE ORDERS PAGE ITSELF, so the first tab in each list is
// already open when these steps start — which is why "To Accept", "Orders" and
// "Manage Orders" are not in them. Opening the page is the first step; these are
// the ones after it.
const SITES = {
  'seller.flipkart.com': {
    name:  'Flipkart',
    steps: ['To Pack', 'To Accept'],          // lands on To Accept
  },
  'supplier.meesho.com': {
    name:  'Meesho',
    steps: ['On Hold', 'Pending', 'Ready to Ship'],   // lands on Orders → Pending
    // supplier.meesho.com/ is Meesho's SHOP WINDOW — "Sell online at 0%
    // commission" — not the seller's panel. A signed-in seller belongs under
    // /panel/. Landing anywhere else means we are not in yet, whatever the page
    // looks like: no password box, no "sign in" in the title, and still no way
    // through. Two rounds were spent hunting for an order tab on an advert.
    inside: () => /^\/panel\//.test(location.pathname),
  },
  'sellercentral.amazon.in': {
    name:  'Amazon',
    steps: ['Pending', 'Unshipped'],          // lands on Manage Orders
  },
};

const site = SITES[location.hostname];
if (!site) return;

// ── learning the Meesho account code ────────────────────────────────────────
//
// Meesho's orders page address carries a code belonging to the seller's own
// account — .../panel/v3/new/fulfillment/<code>/orders/pending — so there is no
// one address that works for everybody, and asking each seller to find and paste
// their own is a poor way to start using something.
//
// They do not have to. The code is sitting in the address bar every time they are
// on their own Meesho panel, so it is simply read and remembered the first time
// they are there. Nothing is asked for and nothing is sent anywhere: it is written
// to this browser's own storage and used only to build the address a round opens.
//
// This runs on ANY Meesho panel tab, including one the seller opened themselves,
// and BEFORE the round's own permission check — noticing the address of a page
// they are already looking at is not acting on their page.
const MEESHO_CODE_KEY = 'kcMeeshoCode';

// Words that sit in exactly the same place as the account code but are not one.
// Meesho's own sign-in route is .../fulfillment/login/orders/pending, and "login"
// was duly learned as the account code and used for a whole round. A real code is
// a meaningless little string; anything that is an ordinary word is not one.
const NOT_A_CODE = [
  'login', 'signin', 'sign-in', 'logout', 'signup', 'register', 'auth',
  'home', 'orders', 'order', 'dashboard', 'panel', 'new', 'index', 'main',
  'error', 'notfound', 'undefined', 'null', 'growth', 'fulfillment',
];
const looksLikeCode = c => !!c && NOT_A_CODE.indexOf(c.toLowerCase()) === -1;

function learnMeeshoCode() {
  if (location.hostname !== 'supplier.meesho.com') return;
  // The code sits after the section name in every panel address, not just the
  // orders one — .../panel/v3/new/fulfillment/<code>/orders/pending and
  // .../panel/v3/new/growth/<code>/home both carry it. Reading only the orders
  // shape was why a round that landed on the panel HOME learned nothing and then
  // went to the front door again next time.
  const m = location.pathname.match(/\/panel\/v[0-9]+\/[a-z]+\/[a-z-]+\/([A-Za-z0-9_-]{3,40})(?:\/|$)/i)
         || location.pathname.match(/\/fulfillment\/([A-Za-z0-9_-]{3,40})(?:\/|$)/);
  if (!m || !looksLikeCode(m[1])) return;
  chrome.storage.local.get(MEESHO_CODE_KEY, (res) => {
    void chrome.runtime.lastError;
    if (res && res[MEESHO_CODE_KEY] === m[1]) return;   // already known
    chrome.storage.local.set({ [MEESHO_CODE_KEY]: m[1] }, () => void chrome.runtime.lastError);
  });
}

if (location.hostname === 'supplier.meesho.com') {
  learnMeeshoCode();
  // Meesho's panel is a single-page application: signing in lands on the front
  // door and then moves to the real panel address without loading a new page, so
  // the code is often not there yet at this moment. These catch that move. Plain
  // timers on purpose — requestAnimationFrame stops dead in a hidden tab.
  window.addEventListener('popstate',   learnMeeshoCode);
  window.addEventListener('hashchange', learnMeeshoCode);
  for (const ms of [3000, 8000, 15000, 25000]) setTimeout(learnMeeshoCode, ms);
}

// How long to wait for the FIRST thing to appear. Much longer than the rest,
// because on the first step the whole seller portal is still starting up — these
// are big single-page applications and a cold start is not quick. Later steps are
// only redrawing a list that is already there.
const FIRST_STEP_MS = 30000;
const NEXT_STEP_MS  = 12000;

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

function isDisabled(el) {
  return !!(el.disabled || el.getAttribute('aria-disabled') === 'true'
         || (el.className && typeof el.className === 'string' && /disabled/.test(el.className)));
}

// A tab's label is rarely just its words — it usually carries a count, as
// "To Accept 12" or "Pending (4)". Strip the numbers and brackets off before
// comparing, so the count changing never breaks the match.
const norm = t => t.replace(/[()\[\]\d,]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

// A word we are looking for as a TAB is very often also a value in the orders
// table underneath it — "Pending" is a tab on Amazon and Meesho and also the
// status of every second row. Clicking the cell instead of the tab opens one
// order and the round then fails every step after it, having proved nothing.
// So anything inside a table or a grid is not a tab, whatever it says.
const IN_A_TABLE = 'table, thead, tbody, tr, td, th, [role="table"], [role="grid"], [role="row"], [role="gridcell"], [role="cell"], [role="rowheader"]';

// Finds the thing on screen whose words are the ones we want. Several nested
// elements usually match the same words — an outer box wrapping the real tab —
// so the innermost one is taken, which is the one a person's click would land on.
//
// Where several are still left, the one the page itself calls a tab wins, then a
// link or a button. Document order is the last thing consulted, not the first:
// it was picking whichever happened to be higher up the markup.
function findByWords(words) {
  const want  = words.toLowerCase();
  const nodes = [...document.querySelectorAll('a, button, li, span, div, p, [role="tab"], [role="button"], [role="menuitem"]')];
  const hits  = nodes.filter(el => {
    const t = txt(el);
    if (!t || t.length > 60 || norm(t) !== want) return false;
    if (!isVisible(el)) return false;
    return !el.closest(IN_A_TABLE);
  });
  const inner = hits.filter(e => !hits.some(o => o !== e && e.contains(o)));
  const rank  = (el) => {
    if (el.getAttribute && el.getAttribute('role') === 'tab') return 0;
    if (el.closest('[role="tablist"]')) return 1;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a' || tag === 'button') return 2;
    if (el.getAttribute && el.getAttribute('role') === 'button') return 2;
    return 3;
  };
  inner.sort((a, b) => rank(a) - rank(b));
  return inner[0] || null;
}

// Is this a sign-in page rather than the portal? Checked three ways because each
// portal announces it differently, and getting this wrong in either direction is
// costly: miss it and the round waits thirty seconds for a tab that will never
// appear; call it wrongly and a perfectly good round is abandoned.
function looksSignedOut() {
  const url = (location.href || '').toLowerCase();
  if (/\/(ap\/signin|signin|sign-in|login|log-in)\b/.test(url)) return true;
  if (/[?&](referral_url|openid\.)/.test(url)) return true;
  if (document.querySelector('input[type="password"]')) return true;
  const title = (document.title || '').toLowerCase();
  return /\b(sign in|log in|login|amazon sign-in)\b/.test(title);
}

// Not in yet — either the portal is plainly showing a sign-in page, or this is a
// site where being signed in means being somewhere particular and we are not there.
function needsSignIn() {
  if (looksSignedOut()) return true;
  return !!(site.inside && !site.inside());
}

// Waits for `fn()` to return something, or gives up. Deliberately coarse (half a
// second) because a hidden tab cannot tick faster than once a second anyway.
// Stops early the moment the page turns into a sign-in page, so a portal that
// signs us out mid-round is not waited on for the full thirty seconds.
async function waitFor(fn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (needsSignIn()) return null;
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

// ── pop-ups ─────────────────────────────────────────────────────────────────
//
// These portals put things in the way: a "what's new" box, a rate-us card, a
// cookie strip. One of those sitting over the order tabs is enough to stop a
// round, so they are closed first.
//
// DELIBERATELY TIMID, and it must stay that way. This is a live seller portal —
// clicking the wrong thing here could act on real orders. So it only ever presses
// something that is BOTH inside a box the page itself calls a dialog AND says one
// of a short list of words that can only mean "go away". No "Cancel" (it can
// abandon something the seller started), no "Continue", no guessing from an icon.
const DISMISS_WORDS = [
  'got it', 'close', 'dismiss', 'no thanks', 'no, thanks',
  'not now', 'maybe later', 'later', 'skip', 'skip for now', 'i understand',
];
// Kept OUT on purpose, and each for a reason:
//   "Cancel"      — can abandon something the seller started.
//   "Continue"    — that is going forward, not closing.
//   "Done"        — on a form that means submit it.
//   "Accept all"  — a cookie strip's wording, but "Accept" is also the word this
//                   very extension presses on real Flipkart orders. Nothing that
//                   starts with it goes anywhere near this list.
//   "OK"          — REMOVED 2026-09-04 after review. It reads like a way out of a
//                   notice, but on a question it is the ANSWER: "Cancel this
//                   order? [Cancel] [OK]" is a dialog like any other, and this
//                   list is used on anything the page calls an alertdialog. A
//                   notice with nothing but an OK on it is now left alone and
//                   Escape is tried instead — which closes it if it is a notice
//                   and does nothing at all if it is a question.

const DIALOG_SELECTOR = [
  '[role="dialog"]', '[role="alertdialog"]', '[aria-modal="true"]',
  '.modal', '.ReactModal__Content', '.ant-modal', '.MuiDialog-root',
].join(',');

// Not every pop-up says it is one. Meesho's in particular are plain boxes floated
// over the page with none of the markings above, and one of those sitting over the
// order tabs stops a round dead. So anything BEHAVING like a pop-up counts too:
// lifted off the page, stacked above it, and CARD-SHAPED — wide enough and tall
// enough to be a box rather than a strip.
//
// ⚠️ THE SHAPE TEST IS THE WHOLE POINT, and it was missing until 2026-09-04.
// "Big enough to be in the way" on its own catches the furniture of every one of
// these portals: a sticky header is the full width and a twentieth of the height,
// a fixed side menu is the full height and a sixth of the width, and both were
// being treated as pop-ups to be closed. Requiring BOTH a fifth of the width and
// an eighth of the height rules both out, and a real dialog passes easily.
const NOT_A_POPUP = 'header, nav, footer, [role="banner"], [role="navigation"], '
                  + '[role="toolbar"], [role="menubar"], [role="tablist"], [role="tooltip"]';

function overlayBoxes() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const out = [];

  for (const el of document.querySelectorAll('div, section, aside, dialog')) {
    if (el.id === '__kcSignIn') continue;              // our own note
    if (el.closest(NOT_A_POPUP)) continue;             // page furniture, not a pop-up
    const s = getComputedStyle(el);
    if (s.position !== 'fixed' && s.position !== 'absolute') continue;
    if ((parseInt(s.zIndex, 10) || 0) < 50) continue;
    if (!isVisible(el)) continue;

    const r = el.getBoundingClientRect();
    if (r.width  < vw * 0.20) continue;                // a side rail, not a box
    if (r.height < vh * 0.12) continue;                // a strip across the top
    const area = (r.width * r.height) / (vw * vh);
    if (area < 0.04 || area > 0.90) continue;          // a crumb, or the whole page

    // Something that holds another candidate is the backdrop, not the box.
    out.push(el);
  }
  return out.filter(e => !out.some(o => o !== e && e.contains(o)));
}

function candidateBoxes() {
  const named = [...document.querySelectorAll(DIALOG_SELECTOR)].filter(isVisible);
  return [...new Set([...named, ...overlayBoxes()])];
}

// A bare cross, in any of the shapes pages draw one. On its own it means nothing
// else, which is why a one-character button is safe to press and a one-word one
// would not be.
const CROSS = /^[×✕✖⨯xX]$/;

// Words that must never be pressed, wherever they are found. Until 2026-09-04
// this list only guarded ONE of the four ways a close button is looked for, so a
// thing could be excluded by its words and then clicked anyway a few lines later
// because of its class name or its position. It now guards all four.
const NEVER_PRESS = ['cancel', 'continue', 'done', 'ok', 'okay', 'yes', 'no',
                     'confirm', 'submit', 'save', 'delete', 'remove', 'proceed'];

function forbiddenWords(el) {
  // The words of the thing itself, and of the button it sits inside — a picture
  // inside a "Participate Now" button has no words of its own, but pressing it
  // presses the button.
  const holder = el.closest('button, a, [role="button"]') || el;
  for (const node of new Set([el, holder])) {
    const t = norm(txt(node));
    if (!t) continue;
    if (CROSS.test(txt(node))) continue;          // a bare cross is not a word
    if (t.indexOf('accept') === 0) return true;   // "Accept" is what we press on real orders
    if (NEVER_PRESS.indexOf(t) !== -1) return true;
    if (t.length > 24) return true;               // a paragraph is not a close button
  }
  return false;
}

// A close button does not take you somewhere else. Anything sitting inside a link
// to another page is a promotion, a cross-sell tile or an advert — and clicking
// one navigates the tab away in the middle of a round.
function leadsAway(el) {
  const a = el.closest('a[href]');
  if (!a) return false;
  const href = a.getAttribute('href') || '';
  return /^(https?:)?\/\//i.test(href) || /^\/[^/]/.test(href);
}

// How many times a round may press something it worked out for itself — a close
// control found by its class name or by where it sits, rather than by words the
// page put there. Three passes were allowed per call and the call happens up to
// three times a portal, so the ceiling was nine. It is now three for the whole of
// this page's life, which is enough for a stack of two pop-ups and a spare.
const HEURISTIC_CLICK_BUDGET = 3;
let heuristicClicks = 0;

// One pass. Returns what it closed, so the log can say so rather than the round
// quietly behaving differently from one day to the next.
function dismissOnce() {
  for (const box of candidateBoxes()) {
    if (!isVisible(box)) continue;

    // The page's own close control, named as such by the page. This is the
    // safest thing in here — it is a cross, and it says so.
    const pressable = el => isVisible(el) && !isDisabled(el)
                         && !forbiddenWords(el) && !leadsAway(el);

    const named = [...box.querySelectorAll('[aria-label], button, [role="button"]')].find(el => {
      const label = (el.getAttribute('aria-label') || '').toLowerCase();
      return /(^|\s)(close|dismiss)(\s|$)/.test(label) && pressable(el);
    });
    if (named) { humanClick(named); return named.getAttribute('aria-label') || 'close'; }

    const worded = [...box.querySelectorAll('button, [role="button"], a')].find(el =>
      DISMISS_WORDS.indexOf(norm(txt(el))) !== -1 && isVisible(el) && !isDisabled(el));
    if (worded) { humanClick(worded); return txt(worded); }

    const cross = [...box.querySelectorAll('button, [role="button"], a, span, i, svg')].find(el =>
      CROSS.test(txt(el)) && pressable(el));
    if (cross) { humanClick(cross); return 'the cross'; }

    // Everything below here is the round WORKING IT OUT rather than being told, so
    // it comes out of a small budget and stops when that budget is gone.
    if (heuristicClicks >= HEURISTIC_CLICK_BUDGET) continue;

    // Named in the markup rather than to a reader: class="close-icon",
    // data-testid="modal-close", id="dismissBtn". Common, and unambiguous.
    //
    // "cross" USED TO BE IN THIS LIST and is not any more: it matched cross-sell,
    // cross-border and cross-listing, which on a marketplace are the class names
    // of advert tiles. A real cross is caught by the line above, by being one.
    // The thing found here must also be wordless, so a button that happens to sit
    // in a container called "close-panel" is not pressed for its neighbour's name.
    const marked = [...box.querySelectorAll('button, [role="button"], a, span, i, div')].find(el => {
      const bits = [el.id || '', el.getAttribute('data-testid') || '',
                    (typeof el.className === 'string' ? el.className : '')].join(' ').toLowerCase();
      if (!/(^|[^a-z])(close|dismiss)([^a-z]|$)/.test(bits)) return false;
      const t = txt(el);
      if (t && !CROSS.test(t)) return false;                 // it has words: not a close icon
      return pressable(el);
    });
    if (marked) { heuristicClicks++; humanClick(marked); return 'the close button'; }

    // Last resort inside the box: the cross drawn as a picture, with no text, no
    // label and no helpful class — which is what Meesho's promotion box uses. It
    // is found by where it sits and how big it is: a small, wordless, clickable
    // thing tucked into the top-right corner of the pop-up is a close button and
    // is not anything else. Bounded entirely inside a box already judged to be a
    // pop-up, and it must have no words of its own — so a real button like
    // "Participate Now" can never be mistaken for it.
    //
    // ⚠️ "IT HAS NO WORDS" IS NOT ENOUGH ON ITS OWN. A picture never has words, so
    // that test passes for every advert creative, every gear, every bell and every
    // three-dot menu as well. It must ALSO not be inside a link to somewhere else
    // (an advert), not be inside a button that does have words (its own picture),
    // and not be one of the things a corner is normally used for.
    const b = box.getBoundingClientRect();
    const corner = [...box.querySelectorAll('button, [role="button"], a, span, i, svg, img, div')].find(el => {
      if (!pressable(el)) return false;
      const t = txt(el);
      if (t && !CROSS.test(t)) return false;                 // it has words: not an icon
      const bits = [el.id || '', el.getAttribute('data-testid') || '',
                    el.getAttribute('aria-label') || '',
                    (typeof el.className === 'string' ? el.className : '')].join(' ').toLowerCase();
      if (/menu|more|kebab|overflow|setting|gear|help|info|bell|notif|share|star|pin|cart|search|back|arrow|next|prev/.test(bits)) return false;
      const r = el.getBoundingClientRect();
      if (r.width > 56 || r.height > 56) return false;       // too big to be an icon
      if (r.width < 8  || r.height < 8)  return false;       // too small to be a target
      return (b.right - r.right) <= b.width * 0.18           // tucked to the right
          && (r.top - b.top)    <= b.height * 0.18;          // and to the top
    });
    if (corner) { heuristicClicks++; humanClick(corner); return 'the close icon'; }
  }
  return null;
}

// Escape closes most pop-ups that have no visible way out, and on a page that has
// none open it does nothing at all — which is what makes it safe to try. It is
// last, after every way of actually finding the button.
function pressEscape() {
  // Not while the seller is typing. On a borrowed tab of theirs, Escape in a part
  // filled box throws the typing away — on some pages it also backs out of the
  // view. Nothing here is worth that.
  const a = document.activeElement;
  if (a && (a.isContentEditable
        || /^(input|textarea|select)$/i.test(a.tagName || ''))) return;
  for (const type of ['keydown', 'keyup']) {
    document.dispatchEvent(new KeyboardEvent(type, {
      key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true,
    }));
  }
}

// Boxes sometimes come in twos — a cookie strip under a welcome card. Three
// passes is plenty; more than that and something is putting them back, which is
// not a fight worth having in a background tab.
async function dismissPopups() {
  const closed = [];
  for (let i = 0; i < 3; i++) {
    const what = dismissOnce();
    if (!what) break;
    closed.push(what);
    await sleep(rand(500, 1100));
  }

  // Still something over the page with no way out that could be found. Escape is
  // the last thing left to try.
  if (candidateBoxes().length) {
    pressEscape();
    await sleep(rand(500, 900));
    if (!candidateBoxes().length) closed.push('Escape');
  }
  return closed;
}

// The prompt on a portal that needs signing in. The tab is left open on purpose,
// so this is the first thing the seller sees when they get to it. Deliberately
// plain and deliberately dismissable — it is a note, not an alarm, and it must
// never sit on top of the sign-in box itself.
// Portals redraw their whole page after a sign-in step, which throws this away
// along with everything else — and then he never sees the one message that was
// asking him to do something. So it is put back a few times over the next half
// minute. Plain timers: requestAnimationFrame is dead in a hidden tab.
function keepSignInPromptUp() {
  for (const ms of [2000, 6000, 12000, 25000]) setTimeout(showSignInPrompt, ms);
}

function showSignInPrompt() {
  if (!document.body) return;
  if (document.getElementById('__kcSignIn')) return;
  const bar = document.createElement('div');
  bar.id = '__kcSignIn';
  bar.style.cssText = [
    'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:2147483647',
    'background:#1e3a8a', 'color:#fff', 'padding:12px 16px',
    'font:600 14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif',
    'display:flex', 'align-items:center', 'gap:12px',
    'box-shadow:0 -2px 12px rgba(0,0,0,.25)',
  ].join(';');

  const msg = document.createElement('span');
  msg.style.flex = '1';
  msg.textContent = 'Kartaan Click — please sign in to ' + site.name
    + ' in this tab. It picks up on its own the moment you are in, and carries on '
    + 'from here. The other portals were checked as normal.';

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Got it';
  close.style.cssText = 'font:inherit;padding:5px 12px;border:0;border-radius:6px;'
    + 'background:#fff;color:#1e3a8a;cursor:pointer';
  close.addEventListener('click', () => bar.remove());

  bar.appendChild(msg);
  bar.appendChild(close);
  (document.body || document.documentElement).appendChild(bar);
}

// ── are we even meant to be here? ───────────────────────────────────────────
//
// The background worker knows which tab it opened for a round, and hands out
// permission for it exactly once. Asking is the only reliable way for this script
// to know — a content script cannot see its own tab number. On the seller's own
// tab, and on every redirect after the first attempt, the answer is no and this
// file does nothing at all for the rest of that page's life.
function ask(message) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(message, reply => {
      void chrome.runtime.lastError;   // worker asleep or gone — treated as "no"
      resolve(reply || null);
    });
  });
}

// Where the round actually got to, for the log on the settings page. The address
// is cut down to the site and the path — never the part after "?", which on these
// portals can carry order numbers and search terms.
function whereWeAre() {
  return {
    page: (document.title || '').slice(0, 120),
    at:   location.hostname + location.pathname,
  };
}

// A portal often says "signed out" when the browser has the sign-in saved and one
// press of its own Log in button would walk straight through. So that press is
// tried once before anybody is asked to do anything.
//
// TO BE CLEAR ABOUT WHAT THIS DOES NOT DO: it never types a password, never fills
// a field, and never touches saved credentials. It presses the portal's own Log in
// button and sees what happens. If the portal wants anything typed, that is the
// seller's to do and the round stops and says so.
//
// ⚠️ TWO THINGS THIS GOT WRONG, BOTH FOUND IN REVIEW 2026-09-04:
//
//   1. "Continue" was in this list. It is the word this file's own pop-up rules
//      exclude, for the right reason — it means go forward, not go in. On
//      Meesho's shop window it is the button beside a phone number box, so
//      pressing it starts sending somebody an access code. Gone.
//
//   2. Pressing a sign-in form's own button while the browser has already filled
//      the boxes in SENDS those saved details, even though nothing here typed
//      them. That is not what "never touches your saved passwords" says to a
//      reader. So: if there is anywhere on the page to type a password, a phone
//      number or a code, nothing is pressed at all — that page is the seller's,
//      and the round stops and asks them.
//
// What is left is the one case this was for: a portal that has signed us out but
// remembers who we are, showing nothing but a button to go back in.
const LOGIN_WORDS = ['log in', 'login', 'sign in', 'signin'];

const CREDENTIAL_FIELDS = 'input[type="password"], input[type="tel"], input[type="email"], '
  + 'input[autocomplete*="password"], input[autocomplete*="username"], '
  + 'input[autocomplete*="one-time-code"], input[name*="otp" i], input[id*="otp" i]';

function wantsTyping() {
  return [...document.querySelectorAll(CREDENTIAL_FIELDS)].some(isVisible);
}

async function tryTheLoginButton() {
  if (wantsTyping()) return false;

  const btn = [...document.querySelectorAll('button, a, [role="button"], input[type="submit"]')]
    .filter(el => {
      const t = norm(txt(el) || el.value || '');
      return LOGIN_WORDS.indexOf(t) !== -1 && isVisible(el) && !isDisabled(el);
    })[0];
  if (!btn) return false;

  humanClick(btn);
  // Signing in is a round trip to their server, and this tab is hidden, so give it
  // room. If the page navigates, this script dies here and the next one picks the
  // story up — which is why a round tab is allowed more than one attempt.
  const backIn = await waitFor(() => !needsSignIn(), 15000);
  return !!backIn;
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

  // "resume" means this is a tab that was left open asking the seller to sign in,
  // and they have now loaded a page in it. If they are in, the round for that
  // portal is picked up here rather than abandoned — being blocked by a sign-in
  // page must never mean that portal is dropped for the day.
  const resuming = hello.mode === 'resume';

  // Let the page settle enough to know what kind of page it is. Kept short: a
  // portal that is going to bounce us to sign-in usually does it immediately, and
  // saying so quickly is better than waiting to be redirected out from under.
  await sleep(rand(2000, 3200));

  if (needsSignIn()) {
    const gotIn = await tryTheLoginButton();
    if (!gotIn) {
      showSignInPrompt();
      keepSignInPromptUp();
      // On a resume attempt this says nothing new — the seller has already been
      // asked and the tab is already open in front of them. Saying it again every
      // time they load a page would bury the log in repeats.
      if (!resuming) {
        await ask({ type: 'CHECKIN_DONE', site: site.name, done: [], closed: [], signedOut: true, ...whereWeAre() });
      }
      return;
    }
    // Through the door. Let the portal draw the page behind it.
    await sleep(rand(2000, 3500));
  }

  const done = [];
  const closed = [];
  let   stoppedAt = null;

  closed.push(...await dismissPopups());

  for (let i = 0; i < site.steps.length; i++) {
    const words = site.steps[i];
    let el = await waitFor(() => findByWords(words), i === 0 ? FIRST_STEP_MS : NEXT_STEP_MS);

    // Nothing found, but a box appeared while we were waiting and is sitting over
    // the tabs. Close it and give the step one more go before giving up.
    if (!el) {
      const late = await dismissPopups();
      if (late.length) {
        closed.push(...late);
        el = await waitFor(() => findByWords(words), NEXT_STEP_MS);
      }
    }

    // Signed out part-way through — the session ran out, or the portal bounced us.
    if (!el && needsSignIn()) {
      showSignInPrompt();
      keepSignInPromptUp();
      await ask({
        type: resuming ? 'CHECKIN_RESUMED_DONE' : 'CHECKIN_DONE',
        site: site.name, done, closed, signedOut: true, ...whereWeAre(),
      });
      return;
    }
    if (!el) { stoppedAt = words; break; }

    humanClick(el);
    done.push(words);
    // A real person reads the list before moving on. This is also what makes the
    // round worth doing at all — a burst of instant clicks is not a person.
    await sleep(rand(1800, 5000));
  }

  await ask({
    type: resuming ? 'CHECKIN_RESUMED_DONE' : 'CHECKIN_DONE',
    site: site.name, done, closed, stoppedAt, ...whereWeAre(),
  });
}

run();

})();
