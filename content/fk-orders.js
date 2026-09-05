// ─── Kartaan Click — Flipkart one-by-one order actions ──────────────────────
// Runs on https://seller.flipkart.com/* (document_idle), but stays completely
// inert unless the page is Active Orders → Pending-to-Pack or Pending-to-Accept.
//
// WHY THIS EXISTS: Flipkart's bulk actions normally work. When they do not go
// through, every order has to be handled with its own individual click instead.
// This drives those clicks one at a time, with randomised pacing so it behaves
// like a person working through the list rather than a burst of scripted clicks.
//
// Three modes, picked automatically from the page:
//   To Pack / Pending RTD   → clicks "Mark RTD" on each row
//   To Pack / Pending Label → clicks "Print Labels" on each row, in batches of
//                             whatever "Stop after" is set to
//   To Accept               → clicks "Accept" on each row, optionally only for
//                             the SKUs ticked in the panel (Scan SKUs lists every
//                             SKU on the tab with its order count first)
// The two To Pack sub-tabs share one URL, so those two are told apart by which
// row buttons are on screen, re-checked every few seconds while idle.
//
// It never auto-starts — only the Start button on its own on-page panel begins a
// run. State lives in chrome.storage.local so a page reload (its own, or
// Flipkart's) resumes the run instead of losing it.

if (!window.__kartaanClickOrders) {
window.__kartaanClickOrders = true;

'use strict';

const BUILD      = '2026-08-29b';  // shown in the log so it is obvious which build a tab is running
const DRY_RUN    = false;          // set true to make Start only report what it would click

// TEMPORARY DIAGNOSTIC — delete this and everything marked "BLOB TEST" once the
// question below is answered. It changes nothing about how labels are saved.
//
// THE QUESTION: Flipkart builds each label inside its own page and hands the
// browser a blob: address. The background worker cannot read one of those — it
// lives at a different address to the page, so the lookup fails. That is what
// killed the hands-free route once already. But a content script runs at the
// PAGE's address, so it may be able to read the very same blob. If it can, the
// extension can save the label itself with no Save-As box and no settings change.
//
// Two things have to be true, and only a real browser can say:
//   A. a content script can read a blob at all, and registers at the page address
//   B. the blob is still alive by the time we reach it (pages usually throw the
//      address away the instant the download starts)
// Probe A runs from the panel button any time, with no orders needed. Probe B
// runs on the next real label. Neither cancels or delays anything.
const BLOB_TEST = false;   // switched on only for the one-off test build
const STATE_KEY  = 'kcOrdersBot';
const LOG_KEY    = 'kcOrdersLog';
const UI_KEY     = 'kcOrdersUi';      // panel position, collapsed state, dismissed notice
const FILTER_KEY = 'kcOrdersFilter';  // { mode: [sku, sku, ...] } — survives reloads mid-run

// ── accepting on the timed round (added for auto-accept) ────────────────────
//
// EVERYTHING IN THIS FILE MARKED "AUTO" ONLY RUNS WHEN A ROUND STARTED THE RUN —
// that is, when the stored state says `auto: true`, which only background.js ever
// sets. Pressing Start on this panel by hand goes down exactly the same path it
// always has, with none of it switched on. That was the point of adding it this
// way rather than changing what was already working: the by-hand run somebody
// relies on every day executes the same lines today as it did yesterday.
//
// The rules themselves — which dates count as soon enough, which SKUs are allowed,
// how many of one SKU may be taken in a day — live in content/kc-accept-rules.js
// and are shared with the Meesho side, so the answer is the same on both portals.
const RULES = window.KC_ACCEPT;
const AUTO_PORTAL = 'flipkart';

// How long a run may go without stamping itself before it is treated as dead
// rather than merely slow. Kept in step with ACCEPT_STALL_MS in background.js.
const AUTO_STALL_MS = 20 * 60 * 1000;

// AUTO. ⚠️ IS THIS TAB THE ONE THE ROUND OPENED THE RUN IN?
//
// This file has always picked a run back up in ANY Flipkart tab that loads while
// the stored state says one is going — which is right for a by-hand run, because
// the person who pressed Start is sitting in front of exactly one tab. It is wrong
// for a run a round started: several Flipkart tabs can be open, they would all
// resume, and two loops working the same list share one set of totals and lose
// each other's counting. Only the worker knows which tab it opened, so it is asked.
async function mayIRun() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'ACCEPT_MAY_I_RUN', portal: AUTO_PORTAL });
    return !!(res && res.run);
  } catch (e) {
    return false;      // the worker did not answer: not our place to guess yes
  }
}

// Chrome and Edge both default to asking where to save every file. While that is
// on, printing labels cannot be hands-free: the browser puts a Save-As box on
// screen and the run has to stop and wait for a human every single time. There is
// no way for an extension to read that setting, let alone change it — so the panel
// says this up front on the labels tab, and says it again the moment a label
// actually stalls, which is proof the setting is on.
const SAVE_HELP = [
  'For hands-free label printing, the browser must stop asking where to save:',
  '  Chrome: Settings → Downloads → turn OFF "Ask where to save each file before downloading"',
  '  Edge:   Settings → Downloads → turn OFF "Ask me what to do with each download"',
  'Labels then save on their own into your Downloads → "Kartaan Click Labels" folder.',
].join('\n');

// The two Active Orders tabs this works on. `labels` are the exact button texts
// on a row; `tile` is the counter chip used to confirm an action landed.
const MODES = {
  pack: {
    id:     'pack',
    tabKey: 'pendingToPack',
    title:  'Mark RTD',
    verb:   'Mark RTD',
    labels: ['mark rtd', 'mark as rtd', 'mark ready to dispatch'],
    tiles:  ['Pending RTD', 'To Pack'],
    skuFilter: false,
  },
  // The Pending Label sub-tab lives on the SAME url as Pending RTD, so this mode
  // is chosen by what is actually on screen (see currentMode). The row control is
  // a real enabled BUTTON reading "Print Labels"; the bulk one in the toolbar is
  // disabled and covers the whole table, so the row/bulk rules already exclude it.
  label: {
    id:     'label',
    tabKey: 'pendingToPack',
    title:  'Print labels',
    verb:   'Print Labels',
    labels: ['print labels', 'print label'],
    tiles:  ['Pending Label'],
    // Same SKU picker as the Accept tab: Scan SKUs lists every SKU waiting for a
    // label with its order count, and only the ticked ones get printed.
    skuFilter: true,
    // The browser may open a viewer or start a download, either of which takes a
    // moment longer than a plain button press.
    confirmWaitMs: 20000,
    // Getting the file on disk is the point of this mode, so that is what counts
    // as success — not whether Flipkart also moved the row off the sub-tab.
    successOnAct: true,
    async act(pick) {
      // Arm the background worker first: it files the label into its own folder,
      // and re-issues the download without a Save-As box where that is possible.
      await chrome.runtime.sendMessage({ type: 'LABEL_ARM' });
      const startedAt = Date.now();
      await humanClick(pick.el);

      // If the browser asks where to save, the run simply waits here until the
      // file is actually on disk — no clicking ahead to the next order meanwhile.
      let told = false;
      const res = await waitFor(async () => {
        const r = (await chrome.storage.local.get('_labelDownloadResult'))._labelDownloadResult;
        if (r) return r;
        if (!told && Date.now() - startedAt > 6000) {
          told = true;
          await log('  waiting for you to save this label — paused until then');
          await log(SAVE_HELP);
        }
        return null;
      }, 610000);

      if (!res) {
        await chrome.runtime.sendMessage({ type: 'LABEL_DISARM' });
        await log('  no label download appeared — if a Save-As box is on screen, close it and tell me');
        return false;
      }
      if (!res.ok) {
        await log('  label NOT saved — ' + res.reason);
        return false;
      }
      await log('  saved → ' + res.filename);
      return true;
    },
  },
  accept: {
    id:     'accept',
    tabKey: 'pendingToAccept',
    title:  'Accept orders',
    verb:   'Accept',
    labels: ['accept', 'accept order', 'accept orders'],
    tiles:  ['To Accept'],
    skuFilter: true,
    // A row's "Accept Orders" is NOT a button — it is an accordion header (a plain
    // div, data-testid="accordion-header") that opens a small panel offering
    // "Accept All N Order(s)" and "Accept Orders Partially". So this tab needs two
    // clicks per row, and we always take the full-accept option.
    findRows() {
      return [...document.querySelectorAll('[data-testid="accordion-header"]')]
        .filter(h => /^accept orders?/i.test(txt(h)) && isVisible(h) && !isDisabled(h))
        .map(h => {
          const ctx = rowContextFor(h);
          return ctx ? { el: h, ctx, sku: skuOf(ctx.text), count: countOf(ctx.text) } : null;
        })
        .filter(Boolean);
    },
    async act(pick, opts) {
      const strict = !!(opts && opts.strict);
      // Opening a row re-renders it, which detaches the very element that was
      // clicked — so anything scoped to it (its parent, its ancestors) is stale
      // and finds nothing, even though the panel is plainly open on screen. Only
      // one row panel is ever open, so search the whole page instead.
      const findAcceptAll = () => {
        const all = [...document.querySelectorAll('button')].filter(b =>
          /^accept all \d+ orders?$/i.test(txt(b)) && isVisible(b) && !isDisabled(b));
        // ⚠️ WHEN A ROUND IS DRIVING, THE BUTTON MUST BE PROVED TO BE THIS ROW'S —
        // however few are on screen. "Only one panel is ever open" is an assumption
        // about the page, not something this code makes true: a panel left open by
        // a failed attempt a moment ago is still there, and most rows read
        // "1 Order" so the count check cannot tell them apart. Taking the wrong one
        // accepts orders nothing checked and tallies them against the wrong SKU.
        if (!strict) {
          if (all.length < 2) return all[0] || null;
          const loose = all.find(b => {
            const c = rowContextFor(b);
            return c && skuOf(c.text) === pick.sku;
          });
          return loose || all[0];
        }
        // Two open panels means the page is not in the state the decision was made
        // about. Take nothing; the row comes round again next turn.
        if (all.length !== 1) return null;
        const ctx = rowContextFor(all[0]);
        return (ctx && skuOf(ctx.text) === pick.sku) ? all[0] : null;
      };

      // One native click opens the row; the arrival of the "Accept All ..."
      // button is the signal (aria-expanded is not reliable here — it read
      // "false" on a panel that had visibly opened).
      await humanClick(pick.el, { native: true });
      const btn = await waitFor(findAcceptAll, 8000);
      if (!btn) {
        await log(strict ? '  could not find this row\'s own Accept button — leaving it alone'
                         : '  row panel did not open');
        // ⚠️ TIDY UP BEFORE GIVING UP. Strict mode refuses when more than one row
        // panel is open, which is the right rule — but nothing used to close the one
        // this attempt opened, so the next attempt would see two, then three, and
        // five refusals in a row ended the whole run over one transient miss. One
        // press back on the header we opened puts it away; Escape catches the rest.
        if (strict) {
          // ⚠️ NOT BY CLICKING `pick.el` AGAIN. Opening a row re-renders it, so that
          // element is detached and the click does nothing — and in the other case,
          // where the panel never opened at all, clicking it OPENS a row instead of
          // closing one. Escape only, and then the loop's own recovery below deals
          // with anything Escape did not shift.
          try {
            document.body.dispatchEvent(new KeyboardEvent('keydown',
              { key: 'Escape', keyCode: 27, bubbles: true }));
          } catch (e) { /* nothing here is worth failing the run over */ }
          await sleep(rand(500, 1200));
        }
        return false;
      }

      // ⚠️ THE BUTTON SAYS HOW MANY ORDERS THIS PRESS TAKES. A round decided it
      // was allowed to take `pick.count` of them, counted against the seller's cap
      // — so if the button now says a different number, the decision no longer
      // covers what is about to happen. Do not press it.
      if (strict) {
        const said = (txt(btn).match(/^accept all (\d+) orders?$/i) || [])[1];
        const n = said ? parseInt(said, 10) : null;
        if (n === null || n !== pick.count) {
          await log('  NOT pressing: the row said ' + pick.count + ' order(s) but the button says "'
            + txt(btn) + '". Nothing was accepted.');
          return false;
        }
      }
      await log('  panel open → "' + txt(btn) + '"');
      await humanClick(btn, { native: true });
      return true;
    },
  },
};

const urlFor = mode =>
  'https://seller.flipkart.com/index.html#dashboard/active-orders?query='
  + encodeURIComponent('{"activeShipmentTile":"' + mode.tabKey + '"}');

function currentMode() {
  const h = decodeURIComponent(location.hash || '');
  if (!/active-orders/i.test(h)) return null;
  if (new RegExp(MODES.accept.tabKey, 'i').test(h)) return MODES.accept;
  if (new RegExp(MODES.pack.tabKey,   'i').test(h)) return packSubTab();
  return null;
}

// "Pending Label" and "Pending RTD" share one url, so the url cannot tell them
// apart — the rows can. An enabled row-level "Print Labels" button only exists on
// the Pending Label sub-tab (the toolbar's own copy is always disabled).
function packSubTab() {
  const onLabelTab = [...document.querySelectorAll('button')].some(b =>
    /^print labels?$/i.test(txt(b)) && !b.disabled && isVisible(b) && rowContextFor(b));
  return onLabelTab ? MODES.label : MODES.pack;
}

// Pacing (milliseconds). Every wait is randomised around these — never a fixed beat.
const PACE = {
  betweenOrdersMin:  2200,
  betweenOrdersMax:  6500,
  breakEveryMin:     8,      // after this many clicks (randomised up to Max) take a longer break
  breakEveryMax:     15,
  breakMin:          18000,
  breakMax:          55000,
  rowWaitMs:         45000,  // how long to wait for the list to render before reloading
  confirmWaitMs:     12000,  // how long to wait for the row to disappear after a click
  maxReloads:        6,      // consecutive reloads with no rows before giving up
  maxFails:          5,      // consecutive clicks that changed nothing before giving up
  reloadEveryClicks: 25,     // refresh the list periodically so it doesn't go stale
};

// ── small helpers ───────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand  = (a, b) => Math.floor(a + Math.random() * (b - a));

// Randomised wait that is occasionally much longer — a flat random range still
// looks mechanical; real people stall now and then.
async function humanPause(min, max) {
  let ms = rand(min, max);
  if (Math.random() < 0.12) ms += rand(2000, 9000);
  await sleep(ms);
}

// Polls until `fn()` returns something truthy, or the timeout runs out.
async function waitFor(fn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();   // works for plain predicates too
    if (v) return v;
    if (Date.now() > deadline) return null;
    await sleep(250);
  }
}

const txt = el => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();

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
  if (/disabled/i.test(el.className || '')) return true;
  const cs = getComputedStyle(el);
  if (cs.pointerEvents === 'none') return true;
  if (parseFloat(cs.opacity || '1') < 0.55) return true;
  return false;
}

// A row's action button sits inside a container that also carries the order's
// SKU / FSN text. The toolbar's bulk button does not — that is how the two are
// told apart, on top of the disabled check.
function rowContextFor(el) {
  let node = el;
  for (let i = 0; i < 10 && node; i++) {
    node = node.parentElement;
    if (!node) break;
    const t = txt(node);
    if (/SKU ID|FSN|Order ID/i.test(t) && t.length > 40) {
      // The toolbar's bulk button has no row of its own, so walking up from it
      // eventually lands on a container holding the WHOLE table. Anything covering
      // more than one order is not a row — reject it outright (an outer container
      // can only get bigger, so there is no point walking further).
      if ((t.match(/SKU ID/gi) || []).length > 1 || t.length > 600) return null;
      return { node, text: t };
    }
  }
  return null;
}

function skuOf(rowText) {
  const m = rowText.match(/SKU ID:\s*([^|]+?)\s*(?:\||FSN\b|$)/i);
  return m ? m[1].trim() : '(no SKU)';
}

// ⚠️ A FLIPKART ROW IS A GROUP OF ORDERS, NOT ONE ORDER. Its text begins "1 Order"
// or "12 Orders", and the button inside it reads "Accept All 12 Order(s)" — one
// press takes all twelve. Counting a press as ONE made a daily cap of five let
// twenty-one orders through, which is the exact opposite of what a cap is for.
//
// Returns null when the row does not say. Null is not "probably one": a round
// refuses a row it cannot count, because that number is the whole basis of the cap.
// ⚠️ ANCHORED TO THE FRONT OF THE ROW, where Flipkart puts it. Searching the whole
// row took the first "<number> Order" anywhere in it, and a SKU the seller named
// himself — "MY-100 Orders-Pack" — won. That could never cause a wrong accept,
// because the number on the button is checked against this one before the press,
// but it did stop the run dead on that row every single time.
function countOf(rowText) {
  const m = String(rowText || '').match(/^\s*(\d{1,3})\s+Orders?\b/i);
  return m ? parseInt(m[1], 10) : null;
}

function actionRowButtons(mode) {
  if (mode.findRows) return mode.findRows();
  const nodes = [...document.querySelectorAll('button, a, [role="button"]')];
  const out = [];
  for (const el of nodes) {
    const t = txt(el).toLowerCase();
    if (mode.labels.indexOf(t) === -1) continue;
    if (!isVisible(el) || isDisabled(el)) continue;
    const ctx = rowContextFor(el);
    if (!ctx) continue;                       // toolbar / bulk button — skip
    out.push({ el, ctx, sku: skuOf(ctx.text), count: countOf(ctx.text) });
  }
  return out;
}

// Reads a counter chip such as "Pending RTD 75" or the "0 To Accept" tile.
function readTile(label) {
  const nodes = [...document.querySelectorAll('div, span, li, button, a')];
  const re    = new RegExp('^(\\d+)\\s*' + label + '$|^' + label + '\\s*(\\d+)$', 'i');
  for (const el of nodes) {
    const t = txt(el);
    if (t.length > 30) continue;
    const m = t.match(re);
    if (m) return parseInt(m[1] || m[2], 10);
  }
  return null;
}

function readPendingCount(mode) {
  for (const label of mode.tiles) {
    const n = readTile(label);
    if (n != null) return n;
  }
  return null;
}

// Flipkart's own empty-state artwork, e.g. "No orders to accept" / "No orders
// to pack". Its exact wording differs per tab, so only the shape is matched.
function isEmptyState() {
  return [...document.querySelectorAll('div, p, span, h1, h2, h3')].some(el => {
    const t = txt(el);
    return t.length < 60 && /^No orders/i.test(t) && isVisible(el);
  });
}

function isLoggedOut() {
  const url = location.href, title = (document.title || '').toLowerCase();
  return url.includes('/login') || url.includes('/signin')
      || /[?&]referral_url=/.test(url)
      || title.includes('become an online seller')
      || title.includes('sign in');
}

// ── state ───────────────────────────────────────────────────────────────────
const getState = async () => (await chrome.storage.local.get(STATE_KEY))[STATE_KEY] || null;
const setState = async s   => chrome.storage.local.set({ [STATE_KEY]: s });

async function getFilter(mode) {
  const all = (await chrome.storage.local.get(FILTER_KEY))[FILTER_KEY] || {};
  return all[mode.id] || [];
}
async function setFilter(mode, skus) {
  const all = (await chrome.storage.local.get(FILTER_KEY))[FILTER_KEY] || {};
  all[mode.id] = skus;
  await chrome.storage.local.set({ [FILTER_KEY]: all });
}

// ── on-page panel ───────────────────────────────────────────────────────────
let panel, logBox, statLine, skuBox;

async function log(line) {
  const stamp = new Date().toLocaleTimeString('en-IN', { hour12: false });
  const entry = stamp + '  ' + line;
  console.log('[Kartaan Click]', line);
  // After the extension is reloaded, the copy of this script already running in
  // an open tab is orphaned — every chrome.* call throws and the buttons look
  // dead. Say so instead of failing silently.
  let store;
  try {
    store = (await chrome.storage.local.get(LOG_KEY))[LOG_KEY] || [];
  } catch (e) {
    if (logBox) logBox.textContent = 'Extension was reloaded — refresh this page (F5) to use the panel.';
    return;
  }
  store.push(entry);
  while (store.length > 120) store.shift();
  await chrome.storage.local.set({ [LOG_KEY]: store });
  if (logBox) { logBox.textContent = store.slice(-80).join('\n'); logBox.scrollTop = logBox.scrollHeight; }
}

function buildPanel(mode) {
  if (panel) return;
  panel = document.createElement('div');
  panel.id = '__kcPanel';
  panel.innerHTML = [
    '<style>',
    // Default bottom-LEFT: the action buttons live on the right of the table,
    // and the panel must never sit on top of the thing it is clicking.
    '#__kcPanel{position:fixed;left:16px;bottom:16px;width:340px;z-index:2147483647;',
    'background:#14161a;color:#e8eaed;font:12px/1.45 system-ui,Segoe UI,Arial;border-radius:10px;',
    'box-shadow:0 8px 28px rgba(0,0,0,.45);overflow:hidden}',
    '#__kcPanel h4{margin:0;padding:9px 12px;background:#1f6feb;font-size:13px;font-weight:600;',
    'cursor:move;display:flex;align-items:center;justify-content:space-between;user-select:none}',
    '#__kcPanel #__kcToggle{flex:0 0 auto;width:24px;padding:1px 0;background:rgba(0,0,0,.25);',
    'font-size:14px;line-height:1.2}',
    '#__kcPanel .bd{padding:10px 12px}',
    '#__kcPanel .row{display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap}',
    '#__kcPanel button{flex:1;padding:7px 8px;border:0;border-radius:6px;cursor:pointer;',
    'font-size:12px;font-weight:600;color:#fff;background:#3d444d}',
    '#__kcPanel .go{background:#1a7f37}',
    '#__kcPanel .stop{background:#b62324}',
    '#__kcPanel .scan{background:#8250df}',
    '#__kcPanel .save{background:#1a7f37}',
    '#__kcPanel input[type=number]{width:62px;background:#0d1117;color:#e8eaed;border:1px solid #30363d;',
    'border-radius:5px;padding:4px 6px}',
    '#__kcPanel .stat{font-size:12px;margin-bottom:8px;color:#9fb0c0}',
    '#__kcPanel pre{margin:0;height:140px;overflow:auto;background:#0d1117;border-radius:6px;',
    'padding:7px;font:11px/1.4 Consolas,monospace;white-space:pre-wrap;color:#adbac7}',
    '#__kcPanel label{color:#9fb0c0}',
    '#__kcPanel .skus{max-height:150px;overflow:auto;background:#0d1117;border-radius:6px;',
    'padding:6px 8px;margin-bottom:8px;display:none}',
    '#__kcPanel .skus div{display:flex;gap:6px;align-items:center;padding:2px 0;color:#c9d1d9}',
    '#__kcPanel .skus b{margin-left:auto;color:#7ee787;font-weight:600;white-space:nowrap}',
    // AUTO. The daily cap box beside each SKU. Narrower than the "Stop after" box
    // above it on purpose — they are different things and should not look alike.
    '#__kcPanel input.cap{width:46px;background:#161b22;color:#e8eaed;border:1px solid #30363d;',
    'border-radius:5px;padding:2px 4px;font-size:11px;flex:0 0 auto}',
    '#__kcPanel .hint{color:#6e7681;font-size:11px;margin-bottom:8px}',
    '#__kcPanel .upd{background:#2e2400;border:1px solid #5a4400;border-radius:6px;padding:7px 9px;',
    'margin-bottom:8px;color:#f0d68a;font-size:11px;line-height:1.5;display:none}',
    '#__kcPanel .upd a{color:#ffd866;font-weight:600}',
    '#__kcPanel .notice{background:#3d2c00;border:1px solid #7a5c00;border-radius:6px;padding:8px;',
    'margin-bottom:8px;color:#f0d68a;font-size:11px;line-height:1.5}',
    '#__kcPanel .notice b{display:block;margin-bottom:3px;color:#ffd866}',
    '#__kcPanel .notice button{margin-top:6px;padding:4px 8px;font-size:11px;background:#5a4400}',
    '</style>',
    '<h4><span>Kartaan Click — ' + mode.title + '</span><button id="__kcToggle" title="Collapse">–</button></h4>',
    '<div class="bd">',
    '  <div class="stat" id="__kcStat">Idle</div>',
    '  <div class="upd" id="__kcUpdate"></div>',
    // Labels are the only mode that puts a file on the disk, so this is the only
    // mode where the browser's "ask where to save" setting can stall a run.
    (mode.id === 'label'
      ? '  <div class="notice" id="__kcNotice" style="display:none">'
        + '<b>Before you start — one browser setting</b>'
        + 'If your browser asks where to save every download, it will ask for <b style="display:inline">every single label</b> '
        + 'and the run will wait for you each time.<br><br>'
        + 'To make it hands-free:<br>'
        + '<b style="display:inline">Chrome</b> — Settings → Downloads → turn off "Ask where to save each file before downloading"<br>'
        + '<b style="display:inline">Edge</b> — Settings → Downloads → turn off "Ask me what to do with each download"<br><br>'
        + 'Labels then save on their own into <b style="display:inline">Downloads → Kartaan Click Labels</b>.'
        + '<button id="__kcNoticeOk">Got it, don\'t show again</button>'
        + '</div>'
      : ''),
    // ⚠️ THE CAP UI IS FOR THE ACCEPT TAB ONLY. Print Labels also has a SKU list,
    // and the caps are stored per PORTAL, not per tab — so saving ticks from the
    // labels tab wrote the labels tab's SKUs over the whole Flipkart cap map and
    // deleted every accept cap that was not currently waiting for a label.
    (mode.skuFilter && mode.id === 'accept'
      ? '  <div class="row"><button class="scan" id="__kcScan">Scan SKUs</button>'
        + '<button class="save" id="__kcSave">Save ticks</button></div>'
        + '  <div class="skus" id="__kcSkus"></div>'
        // The same list of ticks means two different things depending on who is
        // reading it, and saying so here is the only place it can be said at the
        // moment somebody is ticking. Pressing Start by hand has always treated
        // "nothing ticked" as "work through all of them". A round that accepts on
        // its own treats it the other way round — nothing ticked, nothing touched
        // — because a filter nobody has filled in must never be read as consent.
        + '  <div class="hint" id="__kcHint">Scan first, then tick the SKUs.<br>'
        + '<b>Start</b> (by hand): nothing ticked = all of them.<br>'
        + '<b>Accepting on its own</b>: nothing ticked = nothing accepted. Put a number '
        + 'beside a SKU to cap how many of it you will take in one day; blank means no cap. '
        + 'Press <b>Save ticks</b> to keep them without starting a run.</div>'
        + '  <div class="row"><button id="__kcAutoPreview">What a round would do now</button></div>'
      : mode.skuFilter
      ? '  <div class="row"><button class="scan" id="__kcScan">Scan SKUs</button></div>'
        + '  <div class="skus" id="__kcSkus"></div>'
        + '  <div class="hint" id="__kcHint">Scan first, then tick the SKUs to work through. '
        + 'Nothing ticked = all of them.</div>'
      : ''),
    '  <div class="row"><label>Stop after <input type="number" id="__kcLimit" min="1" value="50"> orders</label></div>',
    // On every tab, not just the labels one: this probe makes its own file and
    // needs no orders waiting, so it can be answered today.
    (BLOB_TEST
      ? '  <div class="row"><button id="__kcBlobTest">Blob test (diagnostic)</button></div>'
      : ''),
    '  <div class="row">',
    '    <button class="go" id="__kcStart">Start</button>',
    '    <button class="stop" id="__kcStop">Stop</button>',
    '    <button id="__kcProbe">Probe</button>',
    '  </div>',
    '  <pre id="__kcLog"></pre>',
    '</div>',
  ].join('');
  document.body.appendChild(panel);
  logBox   = panel.querySelector('#__kcLog');
  statLine = panel.querySelector('#__kcStat');
  skuBox   = panel.querySelector('#__kcSkus');

  // ── collapse / expand ──
  const body   = panel.querySelector('.bd');
  const toggle = panel.querySelector('#__kcToggle');
  const applyCollapsed = c => {
    body.style.display = c ? 'none' : '';
    toggle.textContent = c ? '+' : '–';
    toggle.title       = c ? 'Expand' : 'Collapse';
  };
  toggle.onclick = async e => {
    e.stopPropagation();                       // do not start a drag
    const ui = (await chrome.storage.local.get(UI_KEY))[UI_KEY] || {};
    ui.collapsed = body.style.display !== 'none';
    applyCollapsed(ui.collapsed);
    await chrome.storage.local.set({ [UI_KEY]: ui });
  };

  // ── drag by the blue header ──
  const head = panel.querySelector('h4');
  let drag = null;
  head.addEventListener('mousedown', e => {
    if (e.target === toggle) return;
    const r = panel.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!drag) return;
    panel.style.left   = Math.max(0, Math.min(window.innerWidth  - 80, e.clientX - drag.dx)) + 'px';
    panel.style.top    = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - drag.dy)) + 'px';
    panel.style.right  = 'auto';
    panel.style.bottom = 'auto';
  });
  document.addEventListener('mouseup', async () => {
    if (!drag) return;
    drag = null;
    const ui = (await chrome.storage.local.get(UI_KEY))[UI_KEY] || {};
    ui.left = parseInt(panel.style.left, 10);
    ui.top  = parseInt(panel.style.top, 10);
    await chrome.storage.local.set({ [UI_KEY]: ui });
  });

  // Put it back where it was left last time, and show the download notice unless
  // it has already been read and dismissed.
  chrome.storage.local.get(UI_KEY).then(res => {
    const ui = res[UI_KEY] || {};
    if (typeof ui.left === 'number' && typeof ui.top === 'number') {
      panel.style.left = ui.left + 'px';
      panel.style.top  = ui.top + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    }
    applyCollapsed(!!ui.collapsed);
    const notice = panel.querySelector('#__kcNotice');
    if (notice && !ui.saveNoticeRead) notice.style.display = 'block';
  });

  // ── buttons ──
  const noticeOk = panel.querySelector('#__kcNoticeOk');
  if (noticeOk) {
    noticeOk.onclick = async () => {
      panel.querySelector('#__kcNotice').style.display = 'none';
      const ui = (await chrome.storage.local.get(UI_KEY))[UI_KEY] || {};
      ui.saveNoticeRead = true;
      await chrome.storage.local.set({ [UI_KEY]: ui });
    };
  }

  // Ask whether a newer version exists. The background worker only actually goes
  // out once a day; the rest of the time this is answered from what it already
  // knows. Nothing here blocks the panel, and a failure shows nothing at all.
  chrome.runtime.sendMessage({ type: 'CHECK_UPDATE' }, info => {
    void chrome.runtime.lastError;
    if (!info || !info.updateAvailable || !info.latest) return;
    const el = panel.querySelector('#__kcUpdate');
    if (!el) return;
    el.textContent = 'Version ' + info.latest + ' is available'
      + (info.notes ? ' — ' + info.notes : '') + '. ';
    if (info.url) {
      const a = document.createElement('a');
      a.href = info.url; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = 'Download';
      el.appendChild(a);
    }
    el.style.display = 'block';
  });

  const blobBtn = panel.querySelector('#__kcBlobTest');
  if (blobBtn) blobBtn.onclick = () => blobSelfTest();

  if (mode.skuFilter) {
    panel.querySelector('#__kcScan').onclick = () => scanSkus(mode);
    // AUTO. Start has always saved the ticks on its way past, which was enough
    // while a run was the only thing that read them. A round that accepts on its
    // own never presses Start, so there has to be a way to put ticks and daily
    // caps away without starting anything. Accept tab only — see buildPanel.
    const save = panel.querySelector('#__kcSave');
    if (save) save.onclick = () => saveTicksAndCaps(mode);
    const prev = panel.querySelector('#__kcAutoPreview');
    if (prev) prev.onclick = () => autoPreview(mode);
  }

  panel.querySelector('#__kcStart').onclick = async () => {
    // ⚠️ A ROUND MAY ALREADY BE WORKING THIS LIST IN ANOTHER TAB. The worker
    // refuses to start a round's run while a by-hand one is going; this is the
    // same guard in the other direction. Without it, Start overwrites the shared
    // record and two loops work the same live orders, both counting into the same
    // totals — which is how a daily cap gets passed without anybody pressing
    // anything twice.
    // ⚠️ AND ONLY WHILE IT IS ACTUALLY ALIVE. Without an age test, a run whose tab
    // the seller closed left this record saying "running" for ever, and the Start
    // button refused for ever with it. The old wording made that worse: it told
    // them to switch accepting off, which is precisely what stops the worker ever
    // reaching the code that clears the record. Stop, here, is what clears it.
    const live = await getState();
    const lastMoved = live && (live.ts || live.startedAt || 0);
    if (live && live.running && live.auto && lastMoved
        && Date.now() - lastMoved < AUTO_STALL_MS) {
      await log('NOT STARTING — a check-in round is accepting orders in another tab right now. '
        + 'Press Stop here to halt it, then press Start again.');
      return;
    }
    if (live && live.running && live.auto) {
      await log('a round left a run behind that has stopped moving — clearing it and carrying on.');
    }
    const dryRun = DRY_RUN;
    const limit  = parseInt(panel.querySelector('#__kcLimit').value, 10) || 1;
    if (mode.skuFilter) await setFilter(mode, tickedSkus());
    const picked = mode.skuFilter ? await getFilter(mode) : [];
    await chrome.storage.local.set({ [LOG_KEY]: [] });
    await setState({
      mode: mode.id, running: true, dryRun, limit,
      done: 0, failed: 0, reloads: 0, startedAt: Date.now(),
    });
    await log('START (build ' + BUILD + ') — ' + mode.verb + ', ' + (dryRun ? 'DRY RUN' : 'LIVE') + ', limit ' + limit
      + (mode.skuFilter ? (picked.length ? ', SKUs: ' + picked.join(', ') : ', all SKUs') : ''));
    runLoop(mode);
  };

  panel.querySelector('#__kcStop').onclick = async () => {
    const s = (await getState()) || {};
    s.running = false;
    await setState(s);
    await log('STOP requested — will halt after the current order.');
  };

  panel.querySelector('#__kcProbe').onclick = async () => {
    const btns = actionRowButtons(mode);
    await log('PROBE (' + mode.verb + '): counter = ' + readPendingCount(mode)
      + ', row buttons found = ' + btns.length);
    for (let i = 0; i < Math.min(3, btns.length); i++) {
      await log('  [' + i + '] SKU "' + btns[i].sku + '" | ' + btns[i].ctx.text.slice(0, 70));
    }
    if (!mode.findRows) {
      const all = [...document.querySelectorAll('button, a, [role="button"]')]
        .filter(e => mode.labels.indexOf(txt(e).toLowerCase()) !== -1);
      await log('  matching elements on page = ' + all.length + ' (usable rows = ' + btns.length + ')');
    }
  };
}

function tickedSkus() {
  if (!skuBox) return [];
  return [...skuBox.querySelectorAll('input[type=checkbox]')]
    .filter(c => c.checked).map(c => c.dataset.sku);
}

// AUTO. Puts the ticks and the daily caps away without starting anything.
async function saveTicksAndCaps(mode) {
  if (!skuBox) return;
  await setFilter(mode, tickedSkus());
  // ⚠️ ONLY THE SKUs ON SCREEN ARE CHANGED. The panel can only show what is
  // waiting on the tab right now, so writing that list over the whole map deleted
  // the cap on every SKU that had already sold out for the day — and a deleted cap
  // does not read as "nothing left", it reads as "no limit on this one". Merging
  // is done inside saveCaps; this only says which SKUs the seller could see.
  const visible = [], values = {};
  for (const box of skuBox.querySelectorAll('input.cap')) {
    visible.push(box.dataset.sku);
    // A blank box means no cap. `type=number` will not hold "5abc", but reading it
    // strictly costs nothing and means the value can only ever be a whole number.
    const raw = String(box.value || '').trim();
    values[box.dataset.sku] = /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
  }
  const caps = RULES ? await RULES.saveCaps(AUTO_PORTAL, visible, values) : {};
  const ticked = tickedSkus();
  await log('saved — ' + (ticked.length ? ticked.length + ' SKU(s) ticked' : 'nothing ticked')
    + ', ' + Object.keys(caps).length + ' with a daily limit.');
  await autoPreview(mode);
}

// AUTO. What a round would do with these settings if one started this second.
// Not a switch and not a mode — this panel answering a question the seller would
// otherwise have to find out by letting it loose on real orders.
async function autoPreview(mode) {
  if (!RULES) return;
  const s = await RULES.settings();
  if (!s.enabled || !s.sites.flipkart) {
    await log('accepting on its own is switched OFF for Flipkart in settings.');
  }
  const secs = sectionsAllTrusted(mode, s);
  if (!secs.ok) { await log('a round would accept NOTHING here — ' + whyNoGroups(secs)); return; }
  await log('every group here is due soon enough: ' + secs.pills.join(', '));

  const ticked = await RULES.tickedSkus(mode.id);
  const caps   = await RULES.caps(AUTO_PORTAL);
  const tally  = await RULES.tallyToday(AUTO_PORTAL, Date.now());
  const ctx    = { ticked, settings: s, caps, tally, now: Date.now() };
  let orders = 0, presses = 0;
  const no = new Map();
  for (const r of actionRowButtons(mode)) {
    if (!Number.isFinite(r.count) || r.count < 1) {
      no.set('could not tell how many orders the row would take', (no.get('could not tell how many orders the row would take') || 0) + 1);
      continue;
    }
    const d = RULES.decide({ sku: r.sku, due: secs.pills[0], count: r.count }, ctx);
    if (d.ok) { presses += 1; orders += r.count; }
    else no.set(d.why, (no.get(d.why) || 0) + 1);
  }
  await log('right now a round would accept ' + orders + ' order(s) in ' + presses + ' press(es).');
  for (const [why, n] of no) await log('   ' + n + ' row(s) left alone: ' + why);
}

async function paint(mode, extra) {
  const s = await getState();
  if (!statLine) return;
  const pending = readPendingCount(mode);
  const tail = (pending != null ? ', on this tab ' + pending : '') + (extra ? ' ' + extra : '');
  statLine.textContent = (s && s.running)
    ? 'Running — done ' + s.done + ', failed ' + s.failed + tail
    : 'Idle' + tail;
}

// ── pagination ──────────────────────────────────────────────────────────────
// The list is paged, not endlessly scrolled: 20 rows per page with real page
// buttons underneath (data-testid page-1, page-2, ..., plus next/prev).
const pageButtons = () => [...document.querySelectorAll('[data-testid^="page-"]')]
  .filter(b => /^\d+$/.test(txt(b)));

// Clicks page number `i` (0-based) and waits for its rows to render.
async function gotoPage(mode, i) {
  const btns = pageButtons();
  if (!btns[i]) return false;
  await humanClick(btns[i]);
  await sleep(rand(900, 1600));
  await waitFor(() => actionRowButtons(mode).length > 0, 15000);
  return true;
}

// ── sections ────────────────────────────────────────────────────────────────
// A tab can also be split into switchable sections shown as pills above the list,
// e.g. "Breached Orders (11)" and "Dispatch by 12 PM, Tomorrow (48)" — 59 orders
// in total but only one section's rows on screen at a time, each with its own
// pages. Missing this is why a scan of 59 labels only ever found 11.
function sectionPills() {
  const all = [...document.querySelectorAll('div, span, button, li')]
    .filter(e => /^(Breached Orders|Dispatch by .{0,60}?)\s*\(\d+\)$/i.test(txt(e)) && isVisible(e));
  // A pill's own container matches the same text, so keep the innermost ones.
  return all.filter(e => !all.some(o => o !== e && e.contains(o)));
}

// ⚠️ THIS REPORTS SUCCESS IT HAS NOT CHECKED. The `waitFor` result is thrown away
// and `true` is returned whether or not the click landed or the rows appeared.
// Left alone deliberately: it is in daily use by the by-hand runs, and changing
// what it returns changes when those give up on a slow-loading section.
//
// NOTHING ABOUT DATES MAY EVER REST ON IT AGAIN. It once did — a round used the
// return value to believe it had moved into the group it was allowed to work, and
// so could end up accepting orders from a group it had refused. That is why the
// date check now covers the whole tab at once (see sectionsAllTrusted) instead of
// trusting a move. If you find yourself wanting to know whether a section switch
// worked, write a new function that actually looks.
async function gotoSection(mode, i) {
  const pills = sectionPills();
  if (!pills[i]) return false;
  await humanClick(pills[i], { native: true });
  await sleep(rand(1200, 2200));
  await waitFor(() => actionRowButtons(mode).length > 0, 15000);
  return true;
}

// AUTO. A section's heading carries a running count — "Dispatch by 12 PM,
// Tomorrow (48)" — and that count DROPS as orders are accepted, so a heading is
// only ever compared by the words in front of the count.
const pillLabel = t => String(t || '').replace(/\s*\(\d+\)\s*$/, '').trim();

// AUTO. ⚠️ A ROUND NEVER SWITCHES SECTIONS, AND THE REASON MATTERS.
//
// Flipkart shows the dispatch date ONLY on the group heading, never on a row. So
// to know when an order is due, you have to know which group is on screen. An
// earlier version pressed the heading it wanted and carried on — but `gotoSection`
// reports success whether or not the click landed, nothing on the page reliably
// says which heading is live, and the file's own note admits that pressing the
// heading that is ALREADY live may switch the filter off and show everything. Put
// together, that meant a run could work through a group the date filter had
// explicitly refused: orders due next week, accepted today.
//
// There is no way to fix that by checking harder, because the thing being checked
// is not on the page. So the question is not asked. Instead: if EVERY heading on
// the tab is one the seller allows, the whole tab is fair game and no switching is
// needed at all. If ANY heading is refused, the run stops and says which one.
// That is more cautious than the seller asked for — some allowed orders go
// untouched — but the alternative was a promise about dates that the page cannot
// keep. The log tells them exactly what stopped it and what to change.
// AUTO. What the "What it accepted for you" list should say an order was due.
// Every heading on the tab has already been checked and allowed by the time a
// click happens, so naming them all is honest — naming ONE of them, as an earlier
// version did, was a guess about which group the order came from.
function liveGroupLabel() {
  const pills = sectionPills().map(p => pillLabel(txt(p))).filter(Boolean);
  return pills.length === 1 ? pills[0] : pills.join(' / ');
}

// Why nothing on this tab can be accepted, in words that name the real reason and
// suggest something that will actually work. An earlier version said "could not
// read the dispatch date" for a date it had read perfectly and rejected for being
// far out, and told the seller to widen a setting that could not have helped.
function whyNoGroups(secs) {
  if (secs.none) {
    return 'this tab has no "Dispatch by …" headings, so there is no way to tell when '
         + 'these orders are due.';
  }
  if (secs.unseen) {
    return secs.unseen.total == null
      ? 'the "To Accept" count could not be read off this page, so there is no way to check '
        + 'that the group headings account for every order waiting here.'
      : 'the group headings add up to ' + secs.unseen.seen + ' orders but the tab says '
        + secs.unseen.total + '. Either the page was still redrawing, or there is a group '
        + 'here that cannot be read — and with it a set of dates nothing has checked.';
  }
  const b = secs.blocked;
  if (!b || !b.pill) return 'the groups on this tab could not be checked.';
  // `due: null` means the wording defeated the date reader, which is a different
  // problem from a date that was understood and found to be too far ahead.
  if (!b.due) {
    return '"' + b.pill + '" is on this tab and its date could not be read. Send me those '
         + 'exact words and I will teach it that wording.';
  }
  return '"' + b.pill + '" is on this tab and ' + b.why + '. Flipkart shows the date only on '
       + 'the heading, so there is no safe way to work one group and not another. Either widen '
       + '"due within" in settings, or clear that group by hand.';
}

function sectionsAllTrusted(mode, rules) {
  const pills = sectionPills().map(p => txt(p));
  if (!pills.length) return { ok: false, pills, blocked: null, none: true };

  // ⚠️ AND THE HEADINGS WE CAN SEE MUST BE ALL OF THEM. sectionPills() only knows
  // two wordings — "Breached Orders (n)" and "Dispatch by … (n)". A heading of any
  // other shape, and "Non-Breached Orders (30)" is one that exists, is simply
  // invisible to the loop above: every heading it CAN see passes, the tab is
  // declared safe, and the unseen group's orders — whose date nothing has read —
  // get worked. The whole date guarantee rests on this list being complete, and
  // nothing about the page makes it so.
  //
  // So the counts are made to add up. Every heading carries its own number and the
  // tab carries a total in its "To Accept" tile; if the parts do not sum to the
  // whole, there is a group we are not seeing and the run stops. One line of
  // arithmetic against a number already on screen, and it fails closed on any
  // heading Flipkart invents next.
  // ⚠️ NO TILE, NO RUN. Gating this on "if we could read the total" switched the
  // whole check off in exactly the case it is for: a page we cannot read properly.
  // Verified on the real tab, 2026-09-05 — "Dispatch by 12 PM, Today (6)" against
  // a "6 To Accept" tile — so the two do count the same thing.
  // ⚠️ COUNTED ONCE PER GROUP, NOT ONCE PER ELEMENT THAT LOOKS LIKE ONE. The same
  // group can appear twice on the page — as the filter pill above the list AND as a
  // header inside it; waitForRows already knows about the second kind and opens it.
  // Summing both doubled the total, which after A2 stopped the run every single
  // turn. Grouped by the words in front of the count, which is what names a group.
  const total = readPendingCount(mode);
  const byLabel = new Map();
  for (const p of pills) {
    const m = p.match(/\((\d+)\)\s*$/);
    if (m) byLabel.set(pillLabel(p), parseInt(m[1], 10));
  }
  let seen = 0;
  for (const n of byLabel.values()) seen += n;
  if (total == null || seen !== total) {
    return { ok: false, pills, unseen: { seen, total } };
  }

  for (const p of pills) {
    const v = RULES.allowedByDate(p, rules);
    if (!v.ok) return { ok: false, pills, blocked: { pill: p, why: v.why, due: v.due } };
  }
  return { ok: true, pills, blocked: null };
}

// ── SKU scan ────────────────────────────────────────────────────────────────
// Walks every section and every page inside it, tallying SKUs, then returns to the
// first section. Only the SKU text is kept, never element references — those die
// the moment the list changes.
async function scanAllPages(mode, onProgress) {
  const skus     = [];
  const pills    = sectionPills();
  const sections = Math.max(1, pills.length);

  for (let s = 0; s < sections; s++) {
    if (pills.length && !(await gotoSection(mode, s))) continue;
    for (let p = 0; ; p++) {
      if (p > 0 && !(await gotoPage(mode, p))) break;
      await waitFor(() => actionRowButtons(mode).length > 0, 15000);
      for (const r of actionRowButtons(mode)) skus.push(r.sku);
      if (onProgress) onProgress(skus.length, s + 1, sections, p + 1);
      // Re-read the page buttons every time: they only appear once that
      // section's data has loaded.
      if (p + 1 >= pageButtons().length) break;
    }
  }

  if (pills.length > 1) await gotoSection(mode, 0);
  else if (pageButtons().length > 1) await gotoPage(mode, 0);
  return skus;
}

async function scanSkus(mode) {
  const sections = Math.max(1, sectionPills().length);
  await log('scanning ' + sections + ' section(s) of orders…');
  const skus = await scanAllPages(mode, (n, s, t, p) =>
    paint(mode, '(section ' + s + '/' + t + ', page ' + p + ', ' + n + ' orders)'));
  const counts = new Map();
  for (const sku of skus) counts.set(sku, (counts.get(sku) || 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const previously = await getFilter(mode);

  // AUTO. The daily caps already saved, so re-scanning does not wipe them.
  const showCaps = RULES && mode.id === 'accept';
  const capMap = showCaps ? await RULES.caps(AUTO_PORTAL) : {};

  skuBox.innerHTML = '';
  for (const [sku, n] of sorted) {
    const line = document.createElement('div');
    const cb   = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.sku = sku;
    cb.checked = previously.indexOf(sku) !== -1;
    const name = document.createElement('span');
    name.textContent = sku;
    // AUTO. Blank means no cap at all. Only a round that accepts on its own reads
    // this — a run started by hand from this panel ignores it completely, because
    // somebody is sitting there watching that one.
    let cap = null;
    if (showCaps) {
      cap = document.createElement('input');
      cap.type = 'number'; cap.min = '0'; cap.className = 'cap';
      cap.dataset.sku = sku;
      cap.placeholder = '∞';
      cap.title = 'Most of this SKU to accept in one day when rounds accept on their own. '
                + '0 means none today. Leave blank for no limit.';
      // ⚠️ `>= 0`, NOT `> 0`. A cap of 0 means "none of this today". Rendering it as
      // an empty box meant the next Save read it as blank and deleted it — so the
      // one number that stops a SKU quietly set it free the next time the seller
      // pressed Scan SKUs.
      if (Number.isFinite(capMap[sku]) && capMap[sku] >= 0) cap.value = String(capMap[sku]);
    }
    const cnt = document.createElement('b');
    cnt.textContent = n + (n === 1 ? ' order' : ' orders');
    line.appendChild(cb); line.appendChild(name);
    if (cap) line.appendChild(cap);
    line.appendChild(cnt);
    skuBox.appendChild(line);
  }
  skuBox.style.display = sorted.length ? 'block' : 'none';
  await log('scan done — ' + skus.length + ' order(s) across ' + sorted.length + ' SKU(s):');
  for (const [sku, n] of sorted) await log('   ' + n + ' × ' + sku);
  await paint(mode);
}

// ── BLOB TEST (temporary diagnostic) ────────────────────────────────────────
// Reports what actually happens, rather than what anyone expects to happen.
async function blobProbe(url, why) {
  const started = Date.now();
  try {
    // NET-OK: nowhere. `url` is a blob: address — a file the Flipkart page has
    // already built inside this browser. Nothing leaves the machine.
    const res = await fetch(url);
    if (!res.ok) {
      await log('BLOB TEST (' + why + '): FAILED — the page answered ' + res.status);
      return false;
    }
    const buf = await res.arrayBuffer();
    await log('BLOB TEST (' + why + '): READ OK — ' + buf.byteLength + ' bytes, '
      + (res.headers.get('content-type') || 'unknown type')
      + ', took ' + (Date.now() - started) + 'ms');
    return true;
  } catch (e) {
    // "Failed to fetch" is what BOTH possible causes look like: the address was
    // thrown away before we got there, or this world is not allowed to read the
    // page's files at all. The own-blob probe tells those apart — if that one
    // came back READ OK at this page's address, then reading is allowed and the
    // only explanation left is that it was thrown away. The timing says how
    // narrow the window was.
    await log('BLOB TEST (' + why + '): FAILED after ' + (Date.now() - started) + 'ms — '
      + ((e && e.message) ? e.message : String(e)));
    return false;
  }
}

// Probe A — does a content script get a page-address blob, and can it read it?
// Needs no orders and no label; it makes its own tiny file and reads it back.
async function blobSelfTest() {
  const mine = URL.createObjectURL(new Blob(['kartaan click blob test'], { type: 'text/plain' }));
  await log('BLOB TEST (own blob): address is ' + mine.slice(0, 60));
  await log('  → ' + (mine.indexOf('blob:' + location.origin) === 0
    ? 'that IS this page address, so a label blob should be reachable too'
    : 'that is NOT this page address — reading a label blob is unlikely to work'));
  await blobProbe(mine, 'own blob');
  URL.revokeObjectURL(mine);
}

// Probe B — the real thing. The background worker hands over the actual label's
// address the instant the download appears; this reads it as fast as it can.
//
// The address arrives by TWO routes on purpose, and whichever lands first wins.
// A direct message is the quicker of the two but may be refused for want of a
// host permission, and storage is slower but is guaranteed to work because this
// extension already has that permission. A test that fails for the wrong reason
// is worse than no test.
let _blobSeen = '';
function onBlobUrl(url, route) {
  if (!url || url === _blobSeen) return;   // both routes fired — take the first
  _blobSeen = url;
  log('BLOB TEST (real label): address arrived via ' + route + ', reading it now…');
  blobProbe(url, 'real label');
}

if (BLOB_TEST) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'LABEL_BLOB_URL') onBlobUrl(msg.url, 'direct message');
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes._labelBlobUrl && changes._labelBlobUrl.newValue) {
      onBlobUrl(changes._labelBlobUrl.newValue, 'storage');
    }
  });
}

// ── human-like click ────────────────────────────────────────────────────────
function fire(el, type, x, y) {
  const Ev = type.indexOf('pointer') === 0 && window.PointerEvent ? PointerEvent : MouseEvent;
  el.dispatchEvent(new Ev(type, {
    bubbles: true, cancelable: true, composed: true, view: window,
    clientX: x, clientY: y, button: 0,
    buttons: (type === 'pointerdown' || type === 'mousedown') ? 1 : 0,
  }));
}

// When the panel sits over the row being clicked, the click simply does not land —
// the Accept row would not open at all until the panel was hidden, and then it
// opened in half a second. So get out of the way for the duration of any click
// that overlaps it, then come straight back.
function movePanelAsideFor(el) {
  if (!panel || !el || !el.getBoundingClientRect) return () => {};
  const a = panel.getBoundingClientRect(), b = el.getBoundingClientRect();
  const overlaps = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  if (!overlaps) return () => {};
  const was = panel.style.visibility;
  panel.style.visibility = 'hidden';
  return () => { panel.style.visibility = was; };
}

async function humanClick(el, opts) {
  const restorePanel = movePanelAsideFor(el);
  try {
    return await clickSequence(el, opts);
  } finally {
    restorePanel();
  }
}

async function clickSequence(el, opts) {
  // opts.native — exactly the sequence proved to work by hand on the Accept row:
  // instant scroll into view, a pause, then the element's own click and nothing
  // else. Adding smooth scrolling or synthetic hover events on top of it stopped
  // the row from opening, so nothing else belongs in this branch.
  if (opts && opts.native) {
    el.scrollIntoView({ block: 'center' });
    await sleep(rand(500, 1200));
    el.click();
    return;
  }

  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  await sleep(rand(400, 1100));                       // settle + look at the row
  const r = el.getBoundingClientRect();
  const x = r.left + r.width  * (0.28 + Math.random() * 0.44);
  const y = r.top  + r.height * (0.28 + Math.random() * 0.44);
  fire(el, 'pointerover', x, y); fire(el, 'mouseover', x, y);
  fire(el, 'mousemove', x + rand(-3, 3), y + rand(-2, 2));
  await sleep(rand(140, 480));                        // hover dwell
  fire(el, 'pointerdown', x, y); fire(el, 'mousedown', x, y);
  await sleep(rand(55, 165));                         // press duration
  fire(el, 'pointerup', x, y); fire(el, 'mouseup', x, y);
  fire(el, 'click', x, y);
  if (!(opts && opts.single) && typeof el.click === 'function') {
    // Belt-and-braces: some Flipkart controls bind only the framework's own
    // click handler, which the synthetic sequence above can miss.
    await sleep(rand(40, 90));
    el.click();
  }
}

// Occasional idle movement so the page does not only ever see click bursts.
async function idleFidget() {
  if (Math.random() < 0.35) {
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: rand(-120, 220), bubbles: true }));
    window.scrollBy({ top: rand(-90, 160), behavior: 'smooth' });
    await sleep(rand(250, 900));
  }
  if (Math.random() < 0.25) {
    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true, clientX: rand(200, 1200), clientY: rand(150, 700),
    }));
    await sleep(rand(150, 600));
  }
}

// ── confirmation dialog (Flipkart may or may not show one) ──────────────────
//
// The overlays already on screen. A round takes this before it clicks, so it can
// tell a box IT caused from one that was simply sitting there — a policy notice, a
// "what's new" tour, a rate-card change. This is the check the documents have been
// promising all along; it existed on the Meesho side only.
const MODAL_SELECTOR = '[class*="modal" i],[class*="dialog" i],[class*="popup" i],[role="dialog"]';
const openModals = () => [...document.querySelectorAll(MODAL_SELECTOR)].filter(isVisible);

// `opts.strict` — a round is driving. Then a box must be one that appeared AFTER
// our own click, and the words "ok" and "continue" are not accepted as evidence of
// an accept confirmation: they are the answer to far too many other questions.
// With somebody watching the panel, none of this changes.
// `opts.before` — the set of overlays taken BEFORE the click. It has to be passed
// in, not taken here: by the time this runs the accept click has already happened,
// so a box Flipkart put up quickly would be in the snapshot and read as "already
// open", and the confirmation would never be pressed. Meesho gets this right by
// taking its snapshot on the line above its own click.
async function confirmModalIfAny(opts) {
  const strict = !!(opts && opts.strict);
  const before = strict ? (opts.before || new Set(openModals())) : null;
  await sleep(rand(500, 1200));
  const wanted = strict
    ? ['yes', 'confirm', 'proceed', 'mark rtd', 'yes, mark rtd', 'yes, accept']
    : ['yes', 'confirm', 'proceed', 'ok', 'continue',
       'mark rtd', 'yes, mark rtd', 'accept', 'accept order', 'yes, accept'];
  const candidates = [...document.querySelectorAll('button, [role="button"]')].filter(el =>
    isVisible(el) && !isDisabled(el) && wanted.indexOf(txt(el).toLowerCase()) !== -1
    && (!strict || (() => {
      const box = el.closest(MODAL_SELECTOR);
      return box && !before.has(box);              // only a box we caused
    })()));
  // Only a button inside an overlay counts, and never one that belongs to a row —
  // otherwise "Accept" in the next row would be mistaken for a dialog button.
  const modalBtn = candidates.find(el =>
    el.closest('[class*="modal" i],[class*="dialog" i],[class*="popup" i],[role="dialog"]')
    && !rowContextFor(el));
  if (!modalBtn) return false;
  await log('  confirmation dialog → clicking "' + txt(modalBtn) + '"');
  await humanClick(modalBtn);
  await sleep(rand(700, 1600));
  return true;
}

// ── waiting / recovery ──────────────────────────────────────────────────────
// Waits for the order list to render. Flipkart's dashboard is slow and sometimes
// never finishes painting — in that case the page is reloaded and we wait again.
async function waitForRows(mode) {
  const deadline = Date.now() + PACE.rowWaitMs;
  while (Date.now() < deadline) {
    const s = await getState();
    if (!s || !s.running) return [];
    if (isLoggedOut()) return 'LOGGED_OUT';
    const btns = actionRowButtons(mode);
    if (btns.length) return btns;
    // The list may be inside a collapsed "Dispatch by ..." group — open it once.
    const group = [...document.querySelectorAll('div,button,span,[role="button"]')]
      .find(e => /^Dispatch by .{0,40}\(\d+\)$/i.test(txt(e)) && isVisible(e));
    if (group && !group.__kcOpened) { group.__kcOpened = true; group.click(); await sleep(1500); }
    await sleep(600);
  }
  return [];
}

async function reloadAndResume(mode, why) {
  const s = await getState();
  if (!s) return;
  s.reloads = (s.reloads || 0) + 1;
  await setState(s);
  await log('reload #' + s.reloads + ' — ' + why);
  if (s.reloads > PACE.maxReloads) {
    s.running = false; await setState(s);
    await log('STOPPED — too many reloads with nothing on screen.');
    return;
  }
  await sleep(rand(1200, 3000));
  if (!currentMode()) location.href = urlFor(mode);
  location.reload();
}

// AUTO. Every accepted order also goes to the settings page's round list. The
// panel's own log only exists while this tab does, and a round happens while the
// seller is somewhere else entirely.
function tellTheRoundLog(entry) {
  try {
    chrome.runtime.sendMessage({ type: 'ACCEPT_LOG', portal: 'Flipkart', ...entry },
      () => void chrome.runtime.lastError);
  } catch (e) { /* the worker is asleep — the panel log still has it */ }
}

// ── main loop ───────────────────────────────────────────────────────────────
let looping = false;

async function runLoop(mode) {
  if (looping) return;
  looping = true;
  // ⚠️ DECLARED OUT HERE, NOT INSIDE THE `try`. A `const` inside the try block is
  // not visible to the `finally`, so clearing it there threw a ReferenceError on
  // EVERY run — by-hand ones included — which skipped the tidy-up and left the
  // timer running. Caught by review before it reached anybody.
  let beatTimer = null;
  try {
    let sinceBreak  = 0;
    let breakAfter  = rand(PACE.breakEveryMin, PACE.breakEveryMax);
    let consecFails = 0;
    let pageHop     = 0;   // how far through the pages we have looked for a ticked SKU
    let sectionHop  = 0;   // and how far through the tab's sections
    const filter    = mode.skuFilter ? await getFilter(mode) : [];
    const wanted    = new Set(filter);

    // ── AUTO ─────────────────────────────────────────────────────────────────
    // All of this sits idle unless a round started the run. `autoRules` staying
    // null is what keeps the by-hand path exactly as it was.
    const s0 = await getState();
    // ⚠️ THE RECORD DECIDES, NOT WHETHER THE RULES HAPPENED TO LOAD. Reading this
    // as `s0.auto && RULES` meant that if kc-accept-rules.js failed to evaluate for
    // any reason, a run a ROUND had started would quietly run as though somebody
    // had pressed Start: no tab ownership, so every open Flipkart tab would run its
    // own copy; no date check; no caps; no per-run room check; and loose button
    // matching. The entire safety system is in that file, so its absence must stop
    // the run, never relax it.
    const wasAutoStarted = !!(s0 && s0.auto);
    if (wasAutoStarted && !RULES) {
      if (s0) { s0.running = false; await setState(s0); }
      await log('STOPPED — the rules this needs did not load, so nothing was accepted. '
        + 'Reload the extension at chrome://extensions and press F5 here.');
      looping = false;
      return;
    }
    const isAuto = wasAutoStarted;
    // Only the tab the round opened. Every other Flipkart tab that loads mid-run
    // stops here, before anything is read or clicked.
    if (isAuto && !await mayIRun()) { looping = false; return; }
    let autoRules = null;      // the seller's settings for accepting on its own
    let autoCaps  = null;      // the daily limit per SKU
    const autoSaidNo = new Set();   // reasons already written down, so they are not repeated

    // AUTO. Says "this run is still alive", at most every 45 seconds.
    //
    // ⚠️ IT RUNS ON ITS OWN TIMER, not only at the top of the loop. One order on
    // this tab means two full click sequences, a wait for the panel, a wait for
    // the confirmation and a wait for the row to clear — which in a tab the
    // browser has throttled to one tick a minute adds up to something like a
    // quarter of an hour between two turns of the loop. The worker treats twenty
    // minutes of silence as a dead run and clears it, and a cleared run that is
    // actually alive means the next round starts a SECOND copy on the same live
    // orders. A timer keeps beating through the waits; the top of the loop does not.
    const beat = async () => {
      try {
        const st = await getState();
        if (!st || !st.running || !st.auto) return;
        if (st.ts && Date.now() - st.ts < 45000) return;
        st.ts = Date.now();
        await setState(st);
      } catch (e) { /* a missed beat is not worth ending a run over */ }
    };
    if (isAuto) beatTimer = setInterval(beat, 30000);

    if (isAuto) {
      autoRules = await RULES.settings();
      autoCaps  = await RULES.caps(AUTO_PORTAL);
      await log('this run was started by a round — '
        + (autoRules.onlyTickedSkus
            ? (wanted.size ? wanted.size + ' SKU(s) ticked' : 'NO SKUs ticked, so nothing is allowed')
            : 'any SKU')
        + ', due within ' + autoRules.dueWithinDays + ' day(s)'
        + (autoRules.includeBreached ? ', late ones included' : ', late ones left alone')
        + ', at most ' + s0.limit + ' this time.');
      // Nothing is ticked and the seller said only ticked SKUs may be taken. Stop
      // before touching anything rather than working out one order at a time that
      // the answer is no.
      if (autoRules.onlyTickedSkus && !wanted.size) {
        s0.running = false; await setState(s0);
        await log('STOPPED — no SKUs are ticked, so a round is not allowed to accept anything. '
          + 'Press Scan SKUs, tick the ones you are happy to take, then Save ticks.');
        return;
      }
    }

    for (;;) {
      const s = await getState();
      if (!s || !s.running) { await log('stopped.'); break; }

      // AUTO. A heartbeat, at most once a minute. The worker decides a run has died
      // by looking at when this last moved, and a run that is merely SLOW must not
      // be mistaken for a dead one — in a hidden tab the browser can cut timers to
      // one tick a minute, so several minutes between two accepted orders is normal.
      // Clearing a live run would let the next round open a second copy of it on the
      // same live orders, which is the one thing all of this exists to prevent.
      // ⚠️ The top of the loop is NOT often enough on its own — one order can take
      // sixteen minutes in a throttled tab. `beat()` is also called from inside the
      // long waits; see its definition.
      if (isAuto) await beat();

      // AUTO. The off switch has to work on a run that is ALREADY GOING, which
      // means asking again every time round rather than once at the start. The
      // manual says unticking it stops the run after the order it is on; this is
      // the line that makes that true. It also catches a run resumed from stored
      // state hours later, after the seller switched the feature off.
      if (isAuto) {
        autoRules = await RULES.settings();
        if (!autoRules.enabled || !autoRules.sites[AUTO_PORTAL]) {
          s.running = false; await setState(s);
          await log('STOPPED — accepting has been switched off in settings.');
          break;
        }
      }

      // ⚠️ THE MANUAL SAYS IT WILL NOT KEEP GOING IN A TAB YOU ARE READING, and
      // refusing to START in one is a weaker promise: the seller can switch to this
      // tab five seconds after a round begins.
      //
      // It STOPS rather than waiting. An earlier version held still until the tab
      // was hidden again, which was wrong three ways: it had no time limit, its
      // heartbeat kept beating so the run never looked stalled — which made every
      // later round skip this portal's check-in, for as long as the tab stayed on
      // screen — and it sat above the off switch, so unticking the setting during a
      // hold did nothing. Stopping frees the portal at once and the next round picks
      // the work up when he has moved on. `hasFocus` as well as `visible`, so a tab
      // left showing in a window behind the editor does not count as being read.
      if (isAuto && document.visibilityState === 'visible' && document.hasFocus()) {
        s.running = false; await setState(s);
        await log('STOPPED — you came to this tab. It will pick this up at the next round.');
        break;
      }

      if (s.done >= s.limit) {
        s.running = false; await setState(s);
        await log('DONE — limit reached, ' + s.done + ' order(s) handled.');
        break;
      }
      if (isLoggedOut()) {
        s.running = false; await setState(s);
        await log('STOPPED — Flipkart session expired. Log in again, then press Start.');
        break;
      }
      if (!currentMode()) { await reloadAndResume(mode, 'not on the ' + mode.title + ' tab'); return; }

      const rows = await waitForRows(mode);
      if (rows === 'LOGGED_OUT') continue;
      if (!rows.length) {
        // Once the tab is empty Flipkart drops the counter chip altogether and
        // shows its "No orders ..." artwork, so a null count is not a failure —
        // check the empty-state message before treating this as a stalled page.
        if (readPendingCount(mode) === 0 || isEmptyState()) {
          s.running = false; await setState(s);
          await log('DONE — nothing left on this tab.');
          break;
        }
        await reloadAndResume(mode, 'no ' + mode.verb + ' buttons rendered'); return;
      }

      // The page is healthy again — clear the reload counter.
      if (s.reloads) { s.reloads = 0; await setState(s); }

      // AUTO. Are we allowed to touch ANYTHING on this tab? Re-asked every time
      // round, because the headings change as groups empty and a new one can
      // appear mid-run.
      //
      // ⚠️ FLIPKART SHOWS THE DISPATCH DATE ONLY ON THE HEADING, never on a row.
      // No heading means no date, and no date means no accept.
      if (isAuto) {
        let secs = sectionsAllTrusted(mode, autoRules);
        // Both the heading counts and the tab's own total drop as orders are
        // accepted, and Flipkart updates them separately — so a single glance can
        // catch the page mid-repaint and see a mismatch that is not real. Looked at
        // twice before it is treated as fatal; a group that genuinely cannot be read
        // is still there four seconds later.
        if (!secs.ok && secs.unseen) {
          await sleep(4000);
          secs = sectionsAllTrusted(mode, autoRules);
        }
        if (!secs.ok) {
          s.running = false; await setState(s);
          await log('STOPPED — ' + whyNoGroups(secs) + ' Nothing was accepted.');
          break;
        }
        if (!autoSaidNo.has('groups|' + secs.pills.join('|'))) {
          autoSaidNo.add('groups|' + secs.pills.join('|'));
          await log('every group on this tab is due soon enough: ' + secs.pills.join(', '));
        }
      }

      // Only the ticked SKUs, when a filter is set. The chosen SKUs may sit on a
      // later page, or in another section of the tab, so walk both before
      // concluding there is nothing left.
      let candidates = wanted.size ? rows.filter(r => wanted.has(r.sku)) : rows;

      // AUTO. On top of the tick, the seller's daily number for that SKU. Read
      // fresh every time round: the tally moves as this run accepts, and the caps
      // themselves may have been changed in the panel while it was going.
      if (isAuto) {
        const tally = await RULES.tallyToday(AUTO_PORTAL, Date.now());
        autoCaps = await RULES.caps(AUTO_PORTAL);
        const kept = [];
        for (const r of candidates) {
          // A row whose order count could not be read is refused outright. The
          // count is what the cap is measured in, so without it there is no cap.
          if (!Number.isFinite(r.count) || r.count < 1) {
            if (!autoSaidNo.has(r.sku + '|uncounted')) {
              autoSaidNo.add(r.sku + '|uncounted');
              await log('leaving alone: ' + r.sku + ' — could not tell how many orders '
                + 'this row would accept in one press');
            }
            continue;
          }
          const v = RULES.allowedByCap(r.sku, autoCaps, tally, r.count);
          const d = RULES.allowedByDayTotal(autoRules, tally, r.count);
          // And this run's own ceiling, checked BEFORE the press rather than after
          // it. Tested only at the top of the loop, a limit of 20 met by rows of 12
          // ended at 24 — and the settings page says "never more than".
          const room = (s.done + r.count) <= s.limit;
          if (v.ok && d.ok && room) { kept.push(r); continue; }
          const why = !room
            ? 'that would take ' + (s.done + r.count) + ' this run, past the ' + s.limit
              + ' you allow in one go'
            : (v.ok ? d.why : v.why);
          if (!autoSaidNo.has(r.sku + '|' + why)) {
            autoSaidNo.add(r.sku + '|' + why);
            await log('leaving alone: ' + r.sku + ' (' + r.count + ' order(s) in one press) — ' + why);
          }
        }
        candidates = kept;
      }
      if (!candidates.length) {
        const pages = pageButtons().length;
        pageHop += 1;
        if (pageHop < pages && await gotoPage(mode, pageHop)) {
          await log('no chosen SKUs on this page — page ' + (pageHop + 1) + ' of ' + pages);
          continue;
        }
        // AUTO uses the ordinary hop below, unchanged. It is safe here only
        // because every heading on this tab has already been checked and allowed
        // — moving between them cannot reach a group the date filter refused,
        // since there are none. That check is re-run at the top of every turn.
        const pills = sectionPills();
        sectionHop += 1;
        if (sectionHop < pills.length && await gotoSection(mode, sectionHop)) {
          pageHop = 0;
          await log('none left here — section ' + (sectionHop + 1) + ' of ' + pills.length
            + ': ' + txt(sectionPills()[sectionHop] || {}));
          continue;
        }
        s.running = false; await setState(s);
        await log('DONE — no more orders for the chosen SKUs.');
        break;
      }
      pageHop = 0; sectionHop = 0;   // found work here — start from this spot next time

      // Work mostly top-down, but not always the very first row.
      const pick  = candidates[Math.random() < 0.75 ? 0 : rand(0, Math.min(3, candidates.length))];
      // ⚠️ A ROUND LOGS THE SKU AND THE COUNT, NOT THE ROW. The row's text carries
      // the Order ID and FSN, and PRIVACY.md says only the SKU and the date are
      // read from these pages. A by-hand run keeps the fuller line: somebody is
      // sitting there and it is the line that tells them which order stalled.
      const label = isAuto
        ? pick.sku + ' — ' + pick.count + ' order(s) in one press'
        : pick.sku + ' — ' + pick.ctx.text.slice(0, 60);
      await paint(mode);
      await idleFidget();

      if (s.dryRun) {
        await log('(dry) would click ' + mode.verb + ' → ' + label);
        s.done += 1; await setState(s);
        await humanPause(700, 1400);
        continue;
      }

      await log('click ' + (s.done + 1) + '/' + s.limit + ' → ' + label);
      const before = readPendingCount(mode);
      // Taken now, before anything is pressed — see confirmModalIfAny.
      const modalsBefore = isAuto ? new Set(openModals()) : null;
      let preVerified = false;
      if (mode.act) {
        const acted = await mode.act(pick, { strict: isAuto });
        if (acted && mode.successOnAct) preVerified = true;
        if (!acted) {
          // Count it as a failure rather than retrying forever — an earlier
          // version looped on the same row indefinitely.
          consecFails += 1;
          const sf = await getState();
          if (sf) { sf.failed += 1; await setState(sf); }
          // A round refuses a row whenever more than one panel is open, and nothing
          // on the page reliably closes one. Two misses in a row is enough to say
          // the list is not in a state worth guessing at — reload it, which clears
          // every open panel, rather than spending the remaining three attempts
          // failing the same way and ending the run.
          if (isAuto && consecFails >= 2) {
            await reloadAndResume(mode, 'the list needs a clean look');
            return;
          }
          if (consecFails >= PACE.maxFails) {
            if (sf) { sf.running = false; await setState(sf); }
            await log('STOPPED — could not open ' + PACE.maxFails + ' rows in a row.');
            break;
          }
          await humanPause(1200, 2500);
          continue;
        }
      } else {
        await humanClick(pick.el);
      }
      await confirmModalIfAny({ strict: isAuto, before: modalsBefore });

      // Success = that row's button left the screen, or the tab counter dropped.
      const deadline = Date.now() + (mode.confirmWaitMs || PACE.confirmWaitMs);
      let ok = preVerified;
      while (!ok && Date.now() < deadline) {
        await sleep(500);
        // On a tab where opening a row re-renders it, the clicked element detaches
        // whether or not anything was accepted — so there the counter is the only
        // honest signal. Elsewhere the row leaving the screen is the signal.
        const rowGone = !document.contains(pick.el) || !isVisible(pick.el);
        if (!mode.act && rowGone) { ok = true; break; }
        const after = readPendingCount(mode);
        if (before != null && after != null && after < before) { ok = true; break; }
      }

      const st = await getState();
      if (!st) break;

      if (ok) {
        // ⚠️ ORDERS, NOT CLICKS. One press of "Accept All 12 Order(s)" is twelve
        // orders against the seller's limit, and counting it as one is how a cap
        // of five let twenty-one through.
        const took = isAuto ? pick.count : 1;
        st.done += took; consecFails = 0;
        await setState(st);
        await log('  ' + mode.verb + ' OK (' + st.done + ' done)');
        // AUTO. Count it against that SKU's daily number, and tell the settings
        // page — that log is where the seller looks to find out what happened
        // while they were somewhere else, and an accepted order is the one thing
        // they most need to be able to read back afterwards.
        if (isAuto) {
          const t = await RULES.noteAccepted(AUTO_PORTAL, pick.sku, Date.now(), took);
          await log('  took ' + took + ' order(s). ' + t.forSku + ' of this SKU today, '
            + t.total + ' on Flipkart today.');
          tellTheRoundLog({ accepted: took, sku: pick.sku, due: liveGroupLabel() });
        }
      } else {
        st.failed += 1; consecFails += 1;
        await setState(st);
        await log('  no change after click (fail ' + consecFails + '/' + PACE.maxFails + ')');
        if (consecFails >= PACE.maxFails) {
          st.running = false; await setState(st);
          await log('STOPPED — clicks are not doing anything. Press Probe and send me the log.');
          break;
        }
        await reloadAndResume(mode, 'click had no effect'); return;
      }

      sinceBreak += 1;
      await paint(mode);

      if (st.done % PACE.reloadEveryClicks === 0) {
        await reloadAndResume(mode, 'periodic refresh of the list'); return;
      }

      if (sinceBreak >= breakAfter) {
        const br = rand(PACE.breakMin, PACE.breakMax);
        await log('  pausing ' + Math.round(br / 1000) + 's');
        sinceBreak = 0; breakAfter = rand(PACE.breakEveryMin, PACE.breakEveryMax);
        await sleep(br);
      } else {
        await humanPause(PACE.betweenOrdersMin, PACE.betweenOrdersMax);
      }
    }
  } catch (err) {
    await log('ERROR: ' + ((err && err.message) ? err.message : String(err)));
    const s = await getState();
    if (s) { s.running = false; await setState(s); }
  } finally {
    looping = false;
    if (beatTimer) clearInterval(beatTimer);
    await paint(mode);
    // AUTO. Say how it ended. Every way of ENDING is a `break` or a throw, and
    // both land here with `running` already false.
    //
    // The one path that leaves here still running is a deliberate page reload
    // (`reloadAndResume` returns rather than breaking) — the run is not over, it
    // is about to carry on in the reloaded page, so it is not reported as ended.
    // If that reload never completes, the worker's stall check clears it and says
    // so; that is what the heartbeat is for.
    try {
      const fin = await getState();
      if (fin && fin.auto && !fin.running) {
        tellTheRoundLog({ finished: 'run ended', done: fin.done || 0, failed: fin.failed || 0 });
      }
    } catch (e) { /* nothing worth failing the run over */ }
  }
}

// ── boot ────────────────────────────────────────────────────────────────────
(async () => {
  // Only ever mount on the two Active Orders tabs — every other Flipkart page is
  // left completely untouched.
  const mount = async () => {
    const mode = currentMode();
    if (!mode) return;
    if (panel && panel.__kcMode !== mode.id) { panel.remove(); panel = null; }  // switched tab
    buildPanel(mode);
    panel.__kcMode = mode.id;
    const store = (await chrome.storage.local.get(LOG_KEY))[LOG_KEY] || [];
    if (logBox) logBox.textContent = store.slice(-80).join('\n');
    await paint(mode);
    const s = await getState();
    if (s && s.running && s.mode === mode.id) {
      await log('resuming after page load…');
      await sleep(rand(2000, 4500));   // let the list paint before touching it
      runLoop(mode);
    }
  };
  await mount();

  // AUTO. A round writes the run AFTER opening the tab, so on a tab that was already
  // loaded — one this feature used last time — the page never reloads and `mount`
  // never runs again. Without this the run would sit there announced and untouched
  // until something else happened to reload the page. `runLoop` asks the worker
  // whether this tab is the one it opened, so every other Flipkart tab that hears
  // the same change stops immediately.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STATE_KEY]) return;
    const now = changes[STATE_KEY].newValue;
    const was = changes[STATE_KEY].oldValue;
    if (!now || !now.running || !now.auto || looping) return;
    // Only the MOMENT a run begins. The heartbeat writes this record every forty-five
    // seconds, and without this every Flipkart tab open in the browser would wake up
    // and re-check itself each time one beat.
    if (was && was.running && was.auto && was.startedAt === now.startedAt) return;
    const m = currentMode();
    if (m && m.id === now.mode) setTimeout(() => runLoop(m), rand(2000, 4000));
  });

  window.addEventListener('hashchange', () => setTimeout(mount, 1200));
  // Pending Label and Pending RTD share a url, so switching between them fires no
  // hashchange — notice the swap by watching what is on screen, but never while a
  // run is in progress.
  setInterval(() => {
    if (looping || !panel) return;
    const m = currentMode();
    if (m && panel.__kcMode !== m.id) mount();
  }, 3000);
})();

}
