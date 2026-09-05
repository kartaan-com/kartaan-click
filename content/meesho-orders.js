// ─── Kartaan Click — Meesho: accepting orders ────────────────────────────────
// Runs on https://supplier.meesho.com/* but stays completely inert unless the
// page is the seller's own Orders → Pending tab.
//
// WHY THIS EXISTS: Meesho's Pending tab lists orders waiting to be accepted, each
// with its own Accept button. On a busy day that is a few hundred individual
// clicks, and every one of them is a promise to dispatch by the date in the same
// row. This does those clicks — but only for the SKUs the seller has ticked, only
// for orders due soon enough, and only up to the daily number they set per SKU.
//
// IT NEVER STARTS ITSELF FROM THIS PAGE. The panel here is a SETUP panel: it
// lists the SKUs on the tab so they can be ticked, takes a daily number against
// each, and says in plain words what would happen right now. There is no Start
// button, because the seller asked for accepting to happen on the timed round and
// nowhere else — one way in, not two.
//
// The deciding lives in content/kc-accept-rules.js, shared with the Flipkart
// side, so "due soon enough" means exactly the same thing on both portals.
//
// ⚠️ FOUR THINGS THAT WILL BITE ANYONE EDITING THIS:
//   1. THE COLUMNS ARE FOUND BY THEIR HEADING, NEVER BY COUNTING. Meesho has
//      already added an "Ad order" badge and a leading blank column; a fixed
//      column number would have read the wrong cell the day either appeared, and
//      reading the wrong cell here means accepting the wrong order.
//   2. When two nested elements both match, take the INNERMOST. Meesho puts its
//      click handler on the inner element and a click travels outwards, never
//      inwards — this is exactly what stopped its pop-up cross from working.
//   3. A row that has been accepted DISAPPEARS. So never hold on to a row from
//      one turn of the loop to the next: read the table again every time.
//   4. Nothing is pressed inside a box that was already on screen before we
//      clicked. A confirmation we caused is fair game; a promotion that happened
//      to be open is not.

if (!window.__kartaanClickMeeshoOrders) {
window.__kartaanClickMeeshoOrders = true;

'use strict';

const RULES     = window.KC_ACCEPT;
const STATE_KEY = 'kcMeeshoBot';       // the run in progress, if any
const LOG_KEY   = 'kcMeeshoLog';       // what the panel shows
const UI_KEY    = 'kcMeeshoUi';        // collapsed or not
const FILTER_ID = 'meeshoAccept';      // its own list of ticked SKUs, inside kcOrdersFilter
const PORTAL    = 'meesho';

// Same pacing as the Flipkart tool, and for the same reason: a burst of instant
// clicks is not a person working through a list, and these portals are watching.
const PACE = {
  betweenOrdersMin: 2200,
  betweenOrdersMax: 6500,
  breakEveryMin:    8,
  breakEveryMax:    15,
  breakMin:         18000,
  breakMax:         55000,
  rowWaitMs:        30000,
  confirmWaitMs:    15000,
  maxFails:         4,
};

// ── small helpers ───────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand  = (a, b) => Math.floor(a + Math.random() * (b - a));
const txt   = el => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();

async function humanPause(min, max) {
  let ms = rand(min, max);
  if (Math.random() < 0.12) ms += rand(2000, 9000);
  await sleep(ms);
}

async function waitFor(fn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) return null;
    await sleep(250);
  }
}

function isVisible(el) {
  if (!el || !el.getBoundingClientRect) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity || '1') > 0.2;
}

function isDisabled(el) {
  if (el.disabled === true) return true;
  if (el.getAttribute('aria-disabled') === 'true') return true;
  const cs = getComputedStyle(el);
  if (cs.pointerEvents === 'none') return true;
  if (parseFloat(cs.opacity || '1') < 0.55) return true;
  return false;
}

// Of a set of elements that all match, the ones with no other match inside them.
const innermost = list => list.filter(e => !list.some(o => o !== e && e.contains(o)));

// ── which page is this ──────────────────────────────────────────────────────
//
// Only the seller's own Pending tab, and only under /panel/ — supplier.meesho.com
// on its own is Meesho's advert for sellers, not a panel, and looks nothing like
// a signed-out page. That trap cost two whole rounds on the check-in side.
function onPendingTab() {
  if (!/^\/panel\//.test(location.pathname)) return false;
  if (!/\/orders\/pending\b/.test(location.pathname)) return false;
  return true;
}

function signedOut() {
  return /\/login\b|\/signin\b/.test(location.pathname) || !/^\/panel\//.test(location.pathname);
}

// ── reading the order table ─────────────────────────────────────────────────
//
// The table Meesho draws has these headings, seen on the real page 2026-09-04:
//   (blank) | Product Details | Sub-order ID | SKU ID | Meesho ID | Quantity |
//   Size | Dispatch Date/SLA | Action
// The two that matter are found BY NAME. A heading Meesho renames stops the whole
// thing with a line saying which one went missing — which is the right outcome:
// not knowing which column is the date must never mean carrying on regardless.
const WANTED = { sku: /^sku\s*id$/i, due: /dispatch\s*date/i };

function orderTable() {
  return [...document.querySelectorAll('table')]
    .find(t => WANTED.due.test(t.innerText || '') && isVisible(t)) || null;
}

function columnIndexes(table) {
  const heads = [...table.querySelectorAll('thead th, thead td')].map(txt);
  if (!heads.length) return null;
  const find = re => heads.findIndex(h => re.test(h));
  const sku = find(WANTED.sku), due = find(WANTED.due);
  if (sku === -1 || due === -1) return null;
  return { sku, due, heads };
}

// ⚠️ MEESHO DRAWS THIS TAB TWO COMPLETELY DIFFERENT WAYS, and both have to work.
// On a wide window it is a real table with headings. On a narrower one there is no
// table on the page at all — every order becomes a card with its fields written as
// "SKU ID" / "Dispatch Date :" labels with the value beside them. This was found by
// opening the real page in a narrower window, 2026-09-04; the table version alone
// would simply have found nothing and stopped, on any window under about 1200px.
//
// A background tab is whatever width the window is, so which of the two a round
// meets is not something anybody chooses. Both are read the same way in principle:
// FIND THE FIELD BY ITS LABEL, never by counting across or down.
function readRows() {
  const table = orderTable();
  if (table) return readTableRows(table);
  return readCardRows();
}

// The cell that actually sits under column `index`, counting merged cells as the
// several columns they occupy. Indexing `tr.children` directly is not the same
// thing: one `colspan` anywhere to the left of the date shifts every cell after it,
// and reading the wrong cell here pairs one order's SKU with another order's date.
function cellAt(tr, index) {
  let at = 0;
  for (const td of tr.children) {
    const span = Math.max(1, parseInt(td.getAttribute('colspan'), 10) || td.colSpan || 1);
    if (index >= at && index < at + span) return td;
    at += span;
  }
  return null;
}

function readTableRows(table) {
  const cols = columnIndexes(table);
  if (!cols) {
    return { error: 'could not find the "SKU ID" and "Dispatch Date" columns by name — '
      + 'Meesho may have renamed them. Nothing was touched.', rows: [] };
  }
  const rows = [];
  for (const tr of table.querySelectorAll('tbody tr')) {
    const btns = innermost([...tr.querySelectorAll('button, [role="button"]')]
      .filter(b => /^accept$/i.test(txt(b)) && isVisible(b) && !isDisabled(b)));
    if (!btns.length) continue;
    const skuCell = cellAt(tr, cols.sku), dueCell = cellAt(tr, cols.due);
    if (!skuCell || !dueCell) continue;                     // spacer / short row
    const sku = txt(skuCell), due = txt(dueCell);
    if (!sku || !due) continue;

    // ⚠️ A SANITY CHECK ON THE COLUMN ITSELF. If the cell we picked as the date is
    // not one the date reader understands, but some OTHER cell in the row is, then
    // the columns and the rows do not line up and we are reading the wrong cell.
    // Stop the whole run: quietly skipping the row would hide the fault until the
    // day it lands on a cell that DOES parse, and by then it is accepting orders
    // against somebody else's date.
    if (RULES && !RULES.readDue(due)) {
      const elsewhere = [...tr.children].some(td => td !== dueCell && RULES.readDue(txt(td)));
      if (elsewhere) {
        return { error: 'the "Dispatch Date" column does not line up with the rows — a date '
          + 'was found in a different cell. Nothing was touched.', rows: [] };
      }
    }
    rows.push({ tr, btn: btns[0], sku, due });
  }
  return { error: null, rows, layout: 'table' };
}

// The card layout. A label is a leaf element whose whole text is the label, and the
// value is the element next to it — seen on the real page:
//   <p>SKU ID</p><p>DJ- 6 Bahubali Six</p>
//   <p>Dispatch Date :</p><p>05 Sept</p>      <p>SLA :</p><p>Breaching Soon</p>
const CARD_SKU = /^sku\s*id\s*:?$/i;
const CARD_DUE = /^dispatch\s*date\s*:?$/i;
const CARD_SLA = /^sla\s*:?$/i;

function valueBeside(card, re) {
  for (const el of card.querySelectorAll('p, span, div, b, strong, label')) {
    if (el.children.length) continue;                 // a label is a leaf
    if (!re.test(txt(el))) continue;
    const sib = el.nextElementSibling;
    if (sib) return txt(sib);
  }
  return '';
}

// The one card this Accept button belongs to. It has to carry the order number AND
// the SKU AND exactly one Accept button — one Accept is what proves it is a single
// order rather than the list they all sit in. Anything else and this gives up on
// that button rather than guessing which order it goes with.
function cardFor(btn) {
  let n = btn;
  for (let i = 0; i < 12 && n; i++) {
    n = n.parentElement;
    if (!n) break;
    const t = txt(n);
    if (!/order no/i.test(t) || !/sku\s*id/i.test(t)) continue;
    const accepts = [...n.querySelectorAll('button, [role="button"]')]
      .filter(b => /^accept$/i.test(txt(b)));
    if (accepts.length !== 1) return null;
    // ⚠️ EXACTLY ONE ORDER, NOT "AT LEAST ONE". One Accept covering several
    // sub-orders satisfies everything above, and the reader would then take the
    // FIRST SKU and the FIRST date in the card and commit all of them — including
    // ones with a different SKU and a different deadline, neither of which anything
    // checked. Counted, not assumed.
    if ((t.match(/order no/gi) || []).length !== 1) return null;
    if ((t.match(/sku\s*id/gi) || []).length !== 1) return null;
    return n;
  }
  return null;
}

function readCardRows() {
  const btns = innermost([...document.querySelectorAll('button, [role="button"]')]
    .filter(b => /^accept$/i.test(txt(b)) && isVisible(b) && !isDisabled(b)));
  const rows = [];
  for (const btn of btns) {
    const card = cardFor(btn);
    if (!card) continue;
    const sku = valueBeside(card, CARD_SKU);
    const due = valueBeside(card, CARD_DUE);
    const sla = valueBeside(card, CARD_SLA);
    // An order whose SKU or date could not be read is left alone. Never guessed at.
    if (!sku || !due) continue;
    rows.push({ tr: card, btn, sku, due: due + (sla ? ' ' + sla : '') });
  }
  return { error: null, rows, layout: 'cards' };
}

// The count Meesho itself puts on the Pending tab — "Pending (4)". Used only to
// notice when there are more orders than rows on screen, never to decide anything.
function pendingCount() {
  const tab = [...document.querySelectorAll('[role="tab"], button[id^="tab-"]')]
    .find(e => /^pending\b/i.test(txt(e)));
  if (!tab) return null;
  const m = txt(tab).match(/\((\d+)\)/);
  return m ? parseInt(m[1], 10) : null;
}

// ── state and log ───────────────────────────────────────────────────────────
const getState = async () => (await chrome.storage.local.get(STATE_KEY))[STATE_KEY] || null;
const setState = async s  => chrome.storage.local.set({ [STATE_KEY]: s });

// ⚠️ IS THIS TAB THE ONE THE RUN WAS STARTED IN?
//
// The run is written to storage, and storage is shouted at every tab at once. So
// every open Meesho Pending tab heard "a run is going" and started its own — two
// loops, one shared record, both clicking the same rows, both counting into the
// same daily total and losing each other's increments. The per-SKU cap, which is
// the thing standing between the seller and accepting more than they have in
// stock, was exceedable purely by having two tabs open. It also meant a run could
// start in the tab the seller was reading, with buttons being pressed under their
// cursor, which the manual explicitly promises will not happen.
//
// A tab cannot know its own number, so it asks. Only the worker knows which tab it
// opened the run in, and it answers no to every other tab. Asked before the loop
// starts and again on every page load — never assumed, and never cached, because
// the browser hands tab numbers out again from the bottom each session.
async function mayIRun() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'ACCEPT_MAY_I_RUN', portal: PORTAL });
    return !!(res && res.run);
  } catch (e) {
    return false;      // the worker did not answer: not our place to guess yes
  }
}

let panel, logBox, statLine, skuBox;

async function log(line) {
  const stamp = new Date().toLocaleTimeString('en-IN', { hour12: false });
  const entry = stamp + '  ' + line;
  const store = (await chrome.storage.local.get(LOG_KEY))[LOG_KEY] || [];
  store.push(entry);
  await chrome.storage.local.set({ [LOG_KEY]: store.slice(-200) });
  if (logBox) { logBox.textContent = store.slice(-80).join('\n'); logBox.scrollTop = logBox.scrollHeight; }
  console.log('[Kartaan Click] ' + line);
}

// Every accepted order also goes to the settings page's round list, because that
// is where the seller looks to find out what happened while they were away. The
// panel's own log only exists while this tab does.
function tellTheRoundLog(entry) {
  try {
    chrome.runtime.sendMessage({ type: 'ACCEPT_LOG', portal: 'Meesho', ...entry },
      () => void chrome.runtime.lastError);
  } catch (e) { /* worker asleep — the panel log still has it */ }
}

// ── clicking like a person ──────────────────────────────────────────────────
function fire(el, type, x, y) {
  const Ev = type.indexOf('pointer') === 0 && window.PointerEvent ? PointerEvent : MouseEvent;
  el.dispatchEvent(new Ev(type, {
    bubbles: true, cancelable: true, composed: true, view: window,
    clientX: x, clientY: y, button: 0,
    buttons: (type === 'pointerdown' || type === 'mousedown') ? 1 : 0,
  }));
}

// The panel must never sit on top of the thing being clicked — on Flipkart that
// silently swallowed every click until it was found.
function movePanelAsideFor(el) {
  if (!panel || !el || !el.getBoundingClientRect) return () => {};
  const a = panel.getBoundingClientRect(), b = el.getBoundingClientRect();
  if (!(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)) return () => {};
  const was = panel.style.visibility;
  panel.style.visibility = 'hidden';
  return () => { panel.style.visibility = was; };
}

async function humanClick(el) {
  const restore = movePanelAsideFor(el);
  try {
    el.scrollIntoView({ block: 'center' });
    await sleep(rand(400, 1100));
    const r = el.getBoundingClientRect();
    const x = r.left + r.width  * (0.28 + Math.random() * 0.44);
    const y = r.top  + r.height * (0.28 + Math.random() * 0.44);
    fire(el, 'pointerover', x, y); fire(el, 'mouseover', x, y);
    fire(el, 'mousemove', x + rand(-3, 3), y + rand(-2, 2));
    await sleep(rand(140, 480));
    fire(el, 'pointerdown', x, y); fire(el, 'mousedown', x, y);
    await sleep(rand(55, 165));
    fire(el, 'pointerup', x, y); fire(el, 'mouseup', x, y);
    fire(el, 'click', x, y);
    await sleep(rand(40, 90));
    if (typeof el.click === 'function') el.click();
  } finally {
    restore();
  }
}

async function idleFidget() {
  if (Math.random() < 0.35) {
    window.scrollBy({ top: rand(-90, 160), behavior: 'smooth' });
    await sleep(rand(250, 900));
  }
}

// ── the confirmation box, if Meesho shows one ───────────────────────────────
//
// NOBODY KNOWS YET WHETHER IT DOES. Finding out would have meant accepting a real
// order on a live account to see what happened, which is not a thing to do to
// somebody's shop for the sake of curiosity. So this is written to survive either
// answer, and to be honest in the log about which one it met.
//
// THE RULES, and they are deliberately tight:
//   - only a box that WAS NOT THERE before we clicked. Anything already open is
//     somebody else's — a promotion, a policy notice — and is left alone.
//   - only within a few seconds of our own click on an Accept button.
//   - only a button whose whole label is one of a short list of exact words.
//     Not "starts with", not "contains": the whole label.
//   - anything else: press NOTHING, write the box's exact words to the log, and
//     stop the run. The next wording is added from that log line, with proof —
//     never by guessing at it here.
// ⚠️ "ACCEPT" IS NOT ON THIS LIST, ON PURPOSE. Every order row's button reads
// exactly "Accept", so a rule that presses a button labelled "Accept" inside
// anything dialog-shaped cannot tell a confirmation from the NEXT ORDER'S button.
// React re-renders the list the moment a row disappears, and a re-rendered wrapper
// is a node that was not there before — so it read as a fresh box, and the first
// "Accept" inside it belonged to an order that had passed no checks at all.
// A confirmation that repeats the trigger word is not distinguishable from the
// trigger. Do not put it back.
const CONFIRM_WORDS = ['confirm', 'yes', 'yes, accept', 'proceed'];

// Only things that DECLARE themselves a dialog. Matching on class names containing
// "modal"/"dialog"/"drawer" swept up ordinary layout wrappers in a React app whose
// class names are generated — which is what let a re-rendered order list qualify.
const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"], [aria-modal="true"]';

function openDialogs() {
  return [...document.querySelectorAll(DIALOG_SELECTOR)].filter(isVisible);
}

// Returns 'none' | 'confirmed' | 'stuck'
async function confirmBoxIfAny(before) {
  const seen = new Set(before);
  const fresh = await waitFor(() => {
    const now = openDialogs().filter(d => !seen.has(d));
    return now.length ? innermost(now)[0] : null;
  }, 4000);
  if (!fresh) return 'none';

  const words = txt(fresh).slice(0, 300);
  const btns  = innermost([...fresh.querySelectorAll('button, [role="button"]')]
    .filter(b => isVisible(b) && !isDisabled(b)));
  const hit = btns.find(b => CONFIRM_WORDS.indexOf(txt(b).toLowerCase()) !== -1);
  if (!hit) {
    await log('  A BOX CAME UP AND NOTHING IN IT WAS PRESSED. Its words were:');
    await log('    "' + words + '"');
    await log('    buttons on it: ' + (btns.map(b => '"' + txt(b) + '"').join(', ') || 'none'));
    await log('  Stopping here on purpose. Send me those words and I will teach it this box.');
    return 'stuck';
  }
  await log('  a box came up — pressing "' + txt(hit) + '"');
  await humanClick(hit);
  await sleep(rand(700, 1600));
  return 'confirmed';
}

// ── the run ─────────────────────────────────────────────────────────────────
let looping = false;

async function runLoop() {
  if (looping) return;
  looping = true;
  let beatTimer = null;
  try {
    const s0 = await getState();
    if (!s0 || !s0.running) return;

    // Only the tab the worker actually opened the run in. Every other Meesho tab
    // hears the same storage change and would otherwise start its own copy.
    if (!await mayIRun()) { looping = false; return; }

    let settings   = await RULES.settings();
    const ticked   = await RULES.tickedSkus(FILTER_ID);

    // Says "still alive" every 45 seconds on its own timer, so a run that is
    // merely slow in a throttled tab is never mistaken for a dead one and cleared
    // — a cleared run that is still going means a second copy gets started on the
    // same live orders. The top of the loop alone is not often enough: one order
    // can take several minutes of waiting once the browser throttles the tab.
    beatTimer = setInterval(async () => {
      try {
        const st = await getState();
        if (!st || !st.running) return;
        if (st.ts && Date.now() - st.ts < 45000) return;
        st.ts = Date.now();
        await setState(st);
      } catch (e) { /* a missed beat is not worth ending a run over */ }
    }, 30000);

    await log('START — accepting up to ' + s0.limit + ', '
      + (settings.onlyTickedSkus
          ? (ticked.length ? ticked.length + ' SKU(s) ticked' : 'NO SKUs ticked, so nothing is allowed')
          : 'any SKU')
      + ', due within ' + settings.dueWithinDays + ' day(s)'
      + (settings.includeBreached ? ', late ones included' : ', late ones left alone'));

    let sinceBreak  = 0;
    let breakAfter  = rand(PACE.breakEveryMin, PACE.breakEveryMax);
    let consecFails = 0;
    const refused   = new Map();   // SKU → why, so the same reason is not logged 40 times

    for (;;) {
      const s = await getState();
      if (!s || !s.running) { await log('stopped.'); break; }

      if (!s.ts || Date.now() - s.ts > 60000) { s.ts = Date.now(); await setState(s); }

      // ⚠️ THE MANUAL SAYS IT WILL NOT KEEP GOING IN A TAB YOU ARE READING, and
      // refusing to START in one is a weaker promise: the seller can switch to this
      // tab five seconds after a round begins. So a run holds still while its tab
      // is on screen, and picks up again once it is not.
      if (document.visibilityState === 'visible') {
        await log('you are looking at this tab — holding still until you are done.');
        while (document.visibilityState === 'visible') {
          const st = await getState();
          if (!st || !st.running) break;
          await sleep(4000);
        }
        continue;
      }

      // The off switch has to work on a run that is ALREADY GOING. Asked again
      // every time round, which is what makes the manual's promise true — and it
      // also catches a run resumed from stored state after the seller switched
      // the feature off.
      settings = await RULES.settings();
      if (!settings.enabled || !settings.sites[PORTAL]) {
        await stop(s, 'STOPPED — accepting has been switched off in settings.');
        break;
      }

      if (s.done >= s.limit) {
        await stop(s, 'DONE — the limit of ' + s.limit + ' was reached.');
        break;
      }
      if (signedOut()) { await stop(s, 'STOPPED — signed out of Meesho.'); break; }
      if (!onPendingTab()) { await stop(s, 'STOPPED — this is no longer the Pending tab.'); break; }

      const read = await waitFor(async () => {
        const r = readRows();
        return (r.error || r.rows.length) ? r : null;
      }, PACE.rowWaitMs) || readRows();

      if (read.error) { await stop(s, 'STOPPED — ' + read.error); break; }
      if (!read.rows.length) {
        // Meesho's own tab count is the check on our reading. If it says orders are
        // waiting and we found none, we did not understand the page — which is a
        // different thing from being finished, and must not be reported as done.
        const waiting = pendingCount();
        await stop(s, waiting
          ? 'STOPPED — Meesho says ' + waiting + ' order(s) are waiting but none could be '
            + 'read off the page. Nothing was touched. Tell me and I will look at it.'
          : 'DONE — no orders left waiting to be accepted.');
        break;
      }

      // Freshly this turn: the tally can have moved since the last order, and the
      // caps are what the seller may have just changed in the panel.
      const tally = await RULES.tallyToday(PORTAL, Date.now());
      const ctx   = { ticked, settings, caps: await RULES.caps(PORTAL), tally, now: Date.now() };

      const picks = [];
      for (const r of read.rows) {
        // One Meesho row is one order — unlike Flipkart, where a row is a group.
        const d = RULES.decide({ sku: r.sku, due: r.due, count: 1 }, ctx);
        if (d.ok) picks.push(r);
        else if (!refused.has(r.sku + '|' + d.why)) {
          refused.set(r.sku + '|' + d.why, true);
          await log('leaving alone: ' + r.sku + ' (' + r.due + ') — ' + d.why);
        }
      }

      if (!picks.length) {
        const total = pendingCount();
        await stop(s, 'DONE — nothing on this tab passes your rules'
          + (total != null && total > read.rows.length
              ? ' (' + read.rows.length + ' of ' + total + ' were on screen)' : '') + '.');
        break;
      }

      // Mostly top-down, but not always the very first row.
      const pick = picks[Math.random() < 0.75 ? 0 : rand(0, Math.min(3, picks.length))];
      await paint();
      await idleFidget();

      if (s.dryRun) {
        await log('(dry) would accept ' + pick.sku + ' — due ' + pick.due);
        s.done += 1; s.ts = Date.now(); await setState(s);
        await humanPause(700, 1400);
        continue;
      }

      await log('accept ' + (s.done + 1) + '/' + s.limit + ' → ' + pick.sku + ' — due ' + pick.due);
      const dialogsBefore = openDialogs();
      const row = pick.tr;
      await humanClick(pick.btn);

      const box = await confirmBoxIfAny(dialogsBefore);
      if (box === 'stuck') { await stop(s, 'STOPPED — see the box above.'); break; }

      // It worked when the row is no longer in the page. Meesho takes an accepted
      // order off the Pending tab, so the row going is the portal's own answer —
      // better than anything we could read off a toast that may not appear.
      const gone = await waitFor(() => {
        if (!row.isConnected) return true;
        const still = [...row.querySelectorAll('button, [role="button"]')]
          .some(b => /^accept$/i.test(txt(b)) && isVisible(b) && !isDisabled(b));
        return !still;
      }, PACE.confirmWaitMs);

      const s2 = await getState();
      if (!s2 || !s2.running) break;

      if (gone) {
        consecFails = 0;
        s2.done += 1; s2.ts = Date.now(); await setState(s2);
        const t = await RULES.noteAccepted(PORTAL, pick.sku, Date.now(), 1);
        await log('  accepted. ' + t.forSku + ' of this SKU today, '
          + t.total + ' on Meesho today.');
        tellTheRoundLog({ accepted: 1, sku: pick.sku, due: pick.due });
      } else {
        consecFails += 1;
        s2.failed = (s2.failed || 0) + 1; s2.ts = Date.now(); await setState(s2);
        await log('  the row did not clear — counting it as a miss, not a success.');
        if (consecFails >= PACE.maxFails) {
          await stop(s2, 'STOPPED — ' + PACE.maxFails + ' rows in a row did not clear.');
          break;
        }
      }

      sinceBreak += 1;
      if (sinceBreak >= breakAfter) {
        sinceBreak = 0;
        breakAfter = rand(PACE.breakEveryMin, PACE.breakEveryMax);
        await log('  taking a short break…');
        await humanPause(PACE.breakMin, PACE.breakMax);
      } else {
        await humanPause(PACE.betweenOrdersMin, PACE.betweenOrdersMax);
      }
    }
  } catch (e) {
    // A run that throws must not leave "running" set for ever — that would make
    // every later round skip Meesho, silently, with nothing to look into.
    await log('STOPPED — something went wrong: ' + ((e && e.message) || e));
    const s = await getState();
    if (s) { s.running = false; s.ts = Date.now(); await setState(s); }
  } finally {
    looping = false;
    if (beatTimer) clearInterval(beatTimer);
    await paint();
  }
}

async function stop(s, line) {
  s.running = false; s.ts = Date.now();
  await setState(s);
  await log(line);
  tellTheRoundLog({ finished: line, done: s.done || 0, failed: s.failed || 0 });
}

// ── the setup panel ─────────────────────────────────────────────────────────
async function paint(extra) {
  if (!statLine) return;
  const s = await getState();
  const n = pendingCount();
  const tail = (n != null ? ', ' + n + ' waiting on this tab' : '') + (extra ? ' ' + extra : '');
  statLine.textContent = (s && s.running)
    ? 'Accepting — done ' + (s.done || 0) + ', missed ' + (s.failed || 0) + tail
    : 'Idle' + tail;
}

async function scanSkus() {
  const read = readRows();
  if (read.error) { await log('scan: ' + read.error); return; }
  const counts = new Map();
  for (const r of read.rows) counts.set(r.sku, (counts.get(r.sku) || 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  const all    = (await chrome.storage.local.get(RULES.FILTER_KEY))[RULES.FILTER_KEY] || {};
  const ticked = all[FILTER_ID] || [];
  const capMap = await RULES.caps(PORTAL);

  skuBox.textContent = '';
  for (const [sku, n] of sorted) {
    const line = document.createElement('div');
    const cb   = document.createElement('input');
    cb.type = 'checkbox'; cb.dataset.sku = sku; cb.checked = ticked.indexOf(sku) !== -1;
    const name = document.createElement('span');
    name.textContent = sku;
    const cap = document.createElement('input');
    cap.type = 'number'; cap.min = '0'; cap.className = 'cap';
    cap.dataset.sku = sku;
    cap.title = 'Most to accept of this SKU in one day. 0 means none today. '
              + 'Leave blank for no limit.';
    cap.placeholder = '∞';
    if (Number.isFinite(capMap[sku]) && capMap[sku] > 0) cap.value = String(capMap[sku]);
    const cnt = document.createElement('b');
    cnt.textContent = n + (n === 1 ? ' order' : ' orders');
    line.appendChild(cb); line.appendChild(name); line.appendChild(cap); line.appendChild(cnt);
    skuBox.appendChild(line);
  }
  skuBox.style.display = sorted.length ? 'block' : 'none';
  await log('scan done — ' + read.rows.length + ' order(s) across ' + sorted.length + ' SKU(s).');
  const total = pendingCount();
  if (total != null && total > read.rows.length) {
    await log('  note: Meesho says ' + total + ' are waiting but only ' + read.rows.length
      + ' are drawn on screen. The rest are picked up on later rounds as these clear.');
  }
  await preview();
}

async function saveTicks() {
  const skus = [...skuBox.querySelectorAll('input[type=checkbox]')]
    .filter(c => c.checked).map(c => c.dataset.sku);
  const all = (await chrome.storage.local.get(RULES.FILTER_KEY))[RULES.FILTER_KEY] || {};
  all[FILTER_ID] = skus;
  await chrome.storage.local.set({ [RULES.FILTER_KEY]: all });

  // ⚠️ ONLY THE SKUs ON SCREEN. Writing this list over the whole map deleted the
  // cap on every SKU that had sold out for the day, and a deleted cap reads as
  // "no limit on this one" rather than "nothing left". Merging happens in saveCaps.
  const visible = [], values = {};
  for (const box of skuBox.querySelectorAll('input.cap')) {
    visible.push(box.dataset.sku);
    const raw = String(box.value || '').trim();
    values[box.dataset.sku] = /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
  }
  const caps = await RULES.saveCaps(PORTAL, visible, values);
  await log('saved — ' + (skus.length ? skus.length + ' SKU(s) ticked' : 'nothing ticked')
    + ', ' + Object.keys(caps).length + ' with a daily limit.');
  await preview();
}

// What would happen if a round started this second. Not a switch and not a mode —
// just this page answering the question the seller would otherwise have to guess.
async function preview() {
  const read = readRows();
  if (read.error) { await log('right now: ' + read.error); return; }
  const settings = await RULES.settings();
  const ctx = {
    ticked: await RULES.tickedSkus(FILTER_ID),
    settings,
    caps:   await RULES.caps(PORTAL),
    tally:  await RULES.tallyToday(PORTAL, Date.now()),
    now:    Date.now(),
  };
  const yes = [], no = new Map();
  for (const r of read.rows) {
    const d = RULES.decide({ sku: r.sku, due: r.due, count: 1 }, ctx);
    if (d.ok) yes.push(r); else no.set(d.why, (no.get(d.why) || 0) + 1);
  }
  await log('right now a round would accept ' + yes.length + ' of ' + read.rows.length + ' on screen'
    + (settings.enabled && settings.sites.meesho ? '' : '  — but accepting is switched OFF in settings'));
  for (const [why, n] of no) await log('   ' + n + ' left alone: ' + why);
}

function buildPanel() {
  if (panel) return;
  panel = document.createElement('div');
  panel.id = '__kcMeeshoPanel';
  const style = document.createElement('style');
  style.textContent = [
    '#__kcMeeshoPanel{position:fixed;left:16px;bottom:16px;width:360px;z-index:2147483647;',
    'background:#14161a;color:#e8eaed;font:12px/1.45 system-ui,Segoe UI,Arial;border-radius:10px;',
    'box-shadow:0 8px 28px rgba(0,0,0,.45);overflow:hidden}',
    '#__kcMeeshoPanel h4{margin:0;padding:9px 12px;background:#7b2ff7;font-size:13px;font-weight:600;',
    'display:flex;align-items:center;justify-content:space-between;user-select:none}',
    '#__kcMeeshoPanel #__kcmToggle{flex:0 0 auto;width:24px;padding:1px 0;background:rgba(0,0,0,.25);font-size:14px}',
    '#__kcMeeshoPanel .bd{padding:10px 12px}',
    '#__kcMeeshoPanel .row{display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap}',
    '#__kcMeeshoPanel button{flex:1;padding:7px 8px;border:0;border-radius:6px;cursor:pointer;',
    'font-size:12px;font-weight:600;color:#fff;background:#3d444d}',
    '#__kcMeeshoPanel .scan{background:#7b2ff7}',
    '#__kcMeeshoPanel .save{background:#1a7f37}',
    '#__kcMeeshoPanel .stop{background:#b62324}',
    '#__kcMeeshoPanel .stat{font-size:12px;margin-bottom:8px;color:#9fb0c0}',
    '#__kcMeeshoPanel pre{margin:0;height:150px;overflow:auto;background:#0d1117;border-radius:6px;',
    'padding:7px;font:11px/1.4 Consolas,monospace;white-space:pre-wrap;color:#adbac7}',
    '#__kcMeeshoPanel .skus{max-height:170px;overflow:auto;background:#0d1117;border-radius:6px;',
    'padding:6px 8px;margin-bottom:8px;display:none}',
    '#__kcMeeshoPanel .skus div{display:flex;gap:6px;align-items:center;padding:2px 0;color:#c9d1d9}',
    '#__kcMeeshoPanel .skus b{margin-left:auto;color:#7ee787;font-weight:600;white-space:nowrap}',
    '#__kcMeeshoPanel input.cap{width:46px;background:#161b22;color:#e8eaed;border:1px solid #30363d;',
    'border-radius:5px;padding:2px 4px;font-size:11px}',
    '#__kcMeeshoPanel .hint{color:#6e7681;font-size:11px;margin-bottom:8px}',
  ].join('');
  panel.appendChild(style);

  const head = document.createElement('h4');
  const name = document.createElement('span');
  name.textContent = 'Kartaan Click — Meesho orders';
  const toggle = document.createElement('button');
  toggle.id = '__kcmToggle'; toggle.textContent = '–'; toggle.title = 'Collapse';
  head.appendChild(name); head.appendChild(toggle);
  panel.appendChild(head);

  const body = document.createElement('div');
  body.className = 'bd';
  statLine = document.createElement('div');
  statLine.className = 'stat'; statLine.textContent = 'Idle';
  body.appendChild(statLine);

  const r1 = document.createElement('div'); r1.className = 'row';
  const scanBtn = document.createElement('button'); scanBtn.className = 'scan'; scanBtn.textContent = 'Scan SKUs';
  const saveBtn = document.createElement('button'); saveBtn.className = 'save'; saveBtn.textContent = 'Save';
  r1.appendChild(scanBtn); r1.appendChild(saveBtn);
  body.appendChild(r1);

  skuBox = document.createElement('div'); skuBox.className = 'skus';
  body.appendChild(skuBox);

  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'Tick the SKUs a round may accept, and put a number beside one to cap '
    + 'how many of it you will take in a day. Blank means no cap. Nothing ticked means nothing '
    + 'is accepted at all.';
  body.appendChild(hint);

  const r2 = document.createElement('div'); r2.className = 'row';
  const prevBtn = document.createElement('button'); prevBtn.textContent = 'What would happen now';
  // There is no Start button here on purpose, but there must be a way OUT. Without
  // this the only way to halt a run on this page was to close the tab, while the
  // manual said unticking the setting would do it.
  const stopBtn = document.createElement('button');
  stopBtn.className = 'stop'; stopBtn.textContent = 'Stop';
  r2.appendChild(prevBtn); r2.appendChild(stopBtn);
  body.appendChild(r2);

  logBox = document.createElement('pre');
  body.appendChild(logBox);
  panel.appendChild(body);
  document.body.appendChild(panel);

  const applyCollapsed = c => {
    body.style.display = c ? 'none' : '';
    toggle.textContent = c ? '+' : '–';
    toggle.title = c ? 'Expand' : 'Collapse';
  };
  toggle.onclick = async () => {
    const ui = (await chrome.storage.local.get(UI_KEY))[UI_KEY] || {};
    ui.collapsed = body.style.display !== 'none';
    await chrome.storage.local.set({ [UI_KEY]: ui });
    applyCollapsed(ui.collapsed);
  };
  chrome.storage.local.get(UI_KEY).then(res => applyCollapsed(!!((res[UI_KEY] || {}).collapsed)));

  scanBtn.onclick = () => scanSkus();
  saveBtn.onclick = () => saveTicks();
  prevBtn.onclick = () => preview();
  stopBtn.onclick = async () => {
    const s = await getState();
    if (!s || !s.running) { await log('nothing is running.'); return; }
    s.running = false; s.ts = Date.now();
    await setState(s);
    await log('STOP requested — it will halt after the order it is on.');
  };
}

// ── start-up ────────────────────────────────────────────────────────────────
(async () => {
  if (!RULES) { console.log('[Kartaan Click] accept rules missing — Meesho panel not started'); return; }

  const mount = async () => {
    if (!onPendingTab()) {
      if (panel) { panel.remove(); panel = null; statLine = logBox = skuBox = null; }
      return;
    }
    if (panel) return;
    buildPanel();
    const store = (await chrome.storage.local.get(LOG_KEY))[LOG_KEY] || [];
    if (logBox) logBox.textContent = store.slice(-80).join('\n');
    await paint();
    // A run the round started, or one this tab was reloaded out of. The panel is
    // never what begins a run — only the state being set is.
    const s = await getState();
    if (s && s.running) {
      await log('picking the run back up after a page load…');
      await sleep(rand(2500, 5000));
      runLoop();
    }
  };

  await mount();
  // Meesho's panel is drawn in the page without a full load, so the address can
  // change under us. Watch for it rather than trusting the first look.
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) { lastPath = location.pathname; mount(); }
  }, 2000);

  // The round sets the state from the background worker; this tab is already
  // loaded by then, so it has to notice rather than be told.
  //
  // ⚠️ EVERY MEESHO TAB HEARS THIS. Storage changes are shouted at all of them at
  // once, so this fires in tabs that have nothing to do with the run — including
  // one the seller is reading. `runLoop` asks the worker whether THIS tab is the
  // one the run was opened in and gives up immediately if it is not. That check is
  // the only thing making this listener safe; do not remove it from runLoop and do
  // not start the loop from anywhere that skips it.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STATE_KEY]) return;
    const now = changes[STATE_KEY].newValue;
    if (now && now.running && !looping && onPendingTab()) runLoop();
  });
})();

}
