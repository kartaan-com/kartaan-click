// ─── Kartaan Click — the rules for accepting an order on its own ─────────────
//
// WHY THIS FILE IS SEPARATE: two portals accept orders — Flipkart and Meesho —
// and they show the dispatch-by date in completely different places. Flipkart
// groups its orders under a heading ("Dispatch by 12 PM, Tomorrow (5)"); Meesho
// puts a date in a column on every row ("05 Sept"). The WORDING differs, but the
// DECISION — is this order due soon enough for me to take it on? — must be
// exactly the same on both, and it must be written down once so there is only
// ever one thing to get right, one thing to read, and one thing to correct.
//
// ⚠️ EVERYTHING HERE FAILS CLOSED. If a date cannot be read, the answer is NO.
// Accepting an order is a promise to dispatch it by a deadline; a wrong guess
// costs a real seller a real penalty. Refusing to accept something costs a few
// minutes of somebody's attention. Those two are not close, so every unknown
// goes the same way: leave it alone and say so in plain words.

window.KC_ACCEPT = (function () {
'use strict';

// ── where the seller's answers live ─────────────────────────────────────────
const SETTINGS_KEY = 'kcAutoAccept';    // the settings page writes this
const CAPS_KEY     = 'kcSkuCaps';       // { flipkart: {sku: n}, meesho: {sku: n} }
const TALLY_KEY    = { flipkart: 'kcAcceptTallyFlipkart', meesho: 'kcAcceptTallyMeesho' };

// A separate tally per portal ON PURPOSE. One shared record would be read and
// written by two runs that can be going at the same time, and the later write
// would quietly throw the earlier one away — which on a cap means accepting more
// than the seller allowed. Two records never touch each other.

const DEFAULTS = {
  enabled:        false,   // off out of the box, and off after every fresh install
  sites:          { flipkart: false, meesho: false },
  onlyTickedSkus: true,    // nothing ticked = accept NOTHING. See the note below.
  dueWithinDays:  1,       // 0 = only what is due today; 1 = today and tomorrow
  includeBreached: true,   // orders already past their date — usually the urgent ones
  maxPerRound:    20,      // a backstop; the real limit is the per-SKU one
};

// ⚠️ `onlyTickedSkus` DEFAULTS TO TRUE AND MUST STAY THAT WAY. With it on and
// nothing ticked, switching the whole feature on accepts nothing at all — the
// seller has to name the SKUs they are happy to take on before a single order is
// touched. That is the difference between a feature that is off by default and
// one that is safe by default, and it is the only thing standing between a
// mis-set filter and a warehouse full of orders somebody did not agree to.

async function settings() {
  const saved = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
  return { ...DEFAULTS, ...saved, sites: { ...DEFAULTS.sites, ...(saved.sites || {}) } };
}

// ── the date ────────────────────────────────────────────────────────────────
//
// Read a dispatch-by wording and say how many days away it is. Both portals'
// wordings go through this one function, so a wording that works on one is
// understood on the other for free.
//
// What it has actually been shown, on real pages, 2026-09-04:
//   Flipkart heading — "Dispatch by 12 PM, Tomorrow (5)"
//   Flipkart heading — "Breached Orders (11)"        (recorded in an earlier run)
//   Meesho cell      — "05 Sept Breaching Soon"
// Everything else below is a wording that has NOT been seen and is handled on
// the same shapes. If a wording turns up that none of this reads, the order is
// left alone and its exact words are written to the log — which is how the next
// wording gets added, rather than by guessing at it now.

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

const MS_DAY = 24 * 60 * 60 * 1000;

// Midnight at the start of whatever day `d` falls in, in this browser's own time
// zone — which is the seller's. Comparing whole days rather than moments is the
// point: "due tomorrow" means the whole of tomorrow, not this time tomorrow.
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function daysBetween(fromTs, toTs) {
  return Math.round((startOfDay(new Date(toTs)) - startOfDay(new Date(fromTs))) / MS_DAY);
}

// Returns { days, breached, how } or null when the wording cannot be read.
//   days     — whole days from today. 0 = today, 1 = tomorrow, -2 = two days ago.
//   breached — the portal itself says this one is already late.
//   how      — which rule read it, so the log can say why.
function readDue(raw, nowTs) {
  const now  = typeof nowTs === 'number' ? nowTs : Date.now();
  const text = String(raw || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!text) return null;

  // Already late. Flipkart says "Breached Orders"; Meesho puts "Breached" in the
  // same cell as the date. Either way the deadline is behind us.
  if (/\bbreached\b/.test(text)) return { days: -1, breached: true, how: 'breached' };

  // "Breaching Soon" is NOT breached — it is Meesho's warning that the deadline
  // is close, and it sits next to a real date which the rules below then read.
  // Checked in that order on purpose: "breaching" must never be mistaken for
  // "breached", because one means leave it and the other means hurry.

  if (/\btoday\b/.test(text))     return { days: 0, breached: false, how: 'today' };
  if (/\btomorrow\b/.test(text))  return { days: 1, breached: false, how: 'tomorrow' };

  // A day and a month, either way round: "05 Sept", "Sep 5", "5 September".
  // The year is never printed, so it is worked out: this year, unless that would
  // put the date well in the past, which at the turn of the year means next year.
  const dayFirst = text.match(/\b(\d{1,2})\s*(?:st|nd|rd|th)?\s+([a-z]{3,9})\b/);
  const monFirst = text.match(/\b([a-z]{3,9})\s+(\d{1,2})\s*(?:st|nd|rd|th)?\b/);
  let day = null, monName = null;
  if (dayFirst && MONTHS[dayFirst[2].slice(0, 4)] !== undefined) {
    day = parseInt(dayFirst[1], 10); monName = dayFirst[2];
  } else if (dayFirst && MONTHS[dayFirst[2].slice(0, 3)] !== undefined) {
    day = parseInt(dayFirst[1], 10); monName = dayFirst[2];
  } else if (monFirst && (MONTHS[monFirst[1].slice(0, 4)] !== undefined
                       || MONTHS[monFirst[1].slice(0, 3)] !== undefined)) {
    day = parseInt(monFirst[2], 10); monName = monFirst[1];
  }
  if (day === null || !monName) return null;

  // "sept" is four letters and its own key; every other month is read from its
  // first three. Checking the four-letter key first is what keeps "sept" from
  // being read as "sep" — they happen to agree, but the next such pair may not.
  const month = MONTHS[monName.slice(0, 4)] !== undefined
    ? MONTHS[monName.slice(0, 4)] : MONTHS[monName.slice(0, 3)];
  if (month === undefined || day < 1 || day > 31) return null;

  const nowDate = new Date(now);
  let when = new Date(nowDate.getFullYear(), month, day);
  // A date more than a couple of months behind us is not a date in the past —
  // it is next year's, printed without a year, at the turn of the year.
  if (daysBetween(now, when.getTime()) < -60) when = new Date(nowDate.getFullYear() + 1, month, day);
  // The mirror image: a date far ahead in early January is last year's.
  if (daysBetween(now, when.getTime()) > 300)  when = new Date(nowDate.getFullYear() - 1, month, day);

  // The calendar rolls a bad day over — 31 April becomes 1 May — so a date that
  // did not survive the trip is one that was never real.
  if (when.getDate() !== day || when.getMonth() !== month) return null;

  const days = daysBetween(now, when.getTime());
  return { days, breached: days < 0, how: 'date' };
}

// The answer, and the reason for it in words a person can read in a log.
function allowedByDate(raw, s, nowTs) {
  const due = readDue(raw, nowTs);
  if (!due) return { ok: false, why: 'could not read the dispatch date "' + String(raw || '').trim() + '"', due: null };
  if (due.breached) {
    return s.includeBreached
      ? { ok: true,  why: 'already past its date, and you allow those', due }
      : { ok: false, why: 'already past its date, and you do not allow those', due };
  }
  const limit = Number.isFinite(s.dueWithinDays) ? s.dueWithinDays : DEFAULTS.dueWithinDays;
  if (due.days > limit) {
    return { ok: false, why: 'due in ' + due.days + ' day(s), further out than the '
      + limit + ' day(s) you allow', due };
  }
  return { ok: true, why: 'due in ' + due.days + ' day(s)', due };
}

// ── the SKU ─────────────────────────────────────────────────────────────────
//
// The list of SKUs the seller has ticked is the SAME list the Flipkart panel has
// always used for its by-hand runs — kcOrdersFilter — so ticking a SKU means the
// same thing whichever way the order gets accepted. There is only one list to
// keep straight, which is the whole reason for not building a second one.
const FILTER_KEY = 'kcOrdersFilter';

async function tickedSkus(filterId) {
  const all = (await chrome.storage.local.get(FILTER_KEY))[FILTER_KEY] || {};
  return all[filterId] || [];
}

function allowedBySku(sku, ticked, s) {
  if (!s.onlyTickedSkus) return { ok: true, why: 'you accept any SKU' };
  if (!ticked.length) {
    return { ok: false, why: 'no SKUs are ticked yet, so nothing is allowed — '
      + 'press Scan SKUs on the orders page and tick the ones you are happy to take' };
  }
  return ticked.indexOf(sku) !== -1
    ? { ok: true,  why: 'you ticked this SKU' }
    : { ok: false, why: 'this SKU is not ticked' };
}

// ── the per-SKU cap ─────────────────────────────────────────────────────────
//
// His reason for wanting the limit attached to the SKU rather than to the run is
// STOCK: do not take on forty of something there are twelve of. So the cap counts
// PER DAY and starts again each morning, which is the only version of it that can
// be explained in one sentence. (A cap per run would mean almost nothing — a
// round happens every twenty to sixty minutes, so a cap of five per run is thirty
// rounds' worth of five.)
//
// A SKU with no number against it has no cap. That is deliberate: the tick box
// says "you may accept this", the number says "but not more than this many
// today", and most SKUs only need the first.

const dayStamp = ts => {
  const d = new Date(typeof ts === 'number' ? ts : Date.now());
  const p = n => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};

async function caps(portal) {
  const all = (await chrome.storage.local.get(CAPS_KEY))[CAPS_KEY] || {};
  return all[portal] || {};
}

async function setCaps(portal, map) {
  const all = (await chrome.storage.local.get(CAPS_KEY))[CAPS_KEY] || {};
  all[portal] = map;
  await chrome.storage.local.set({ [CAPS_KEY]: all });
}

// How many of this SKU have already been accepted today on this portal. A tally
// from any earlier day is not carried over — it is simply not this day's, so it
// counts as nothing and gets written over on the next accept.
async function tallyToday(portal, nowTs) {
  const key = TALLY_KEY[portal];
  const rec = (await chrome.storage.local.get(key))[key] || {};
  return rec.day === dayStamp(nowTs) ? (rec.skus || {}) : {};
}

async function noteAccepted(portal, sku, nowTs) {
  const key   = TALLY_KEY[portal];
  const today = dayStamp(nowTs);
  const rec   = (await chrome.storage.local.get(key))[key] || {};
  const skus  = rec.day === today ? { ...(rec.skus || {}) } : {};
  skus[sku]   = (skus[sku] || 0) + 1;
  await chrome.storage.local.set({ [key]: { day: today, skus } });
  return skus[sku];
}

function allowedByCap(sku, capMap, tally) {
  const cap = capMap[sku];
  if (!Number.isFinite(cap) || cap <= 0) return { ok: true, why: 'no daily limit on this SKU' };
  const used = tally[sku] || 0;
  return used < cap
    ? { ok: true,  why: used + ' of ' + cap + ' taken today' }
    : { ok: false, why: 'its daily limit of ' + cap + ' is already used up' };
}

// ── the whole answer for one order ──────────────────────────────────────────
//
// Every reason is worked out even once one has already said no, because the log
// line is what the seller reads afterwards to understand why nothing happened,
// and "not ticked" alone is a poor answer when the date was wrong as well.
function decide(order, ctx) {
  const bySku  = allowedBySku(order.sku, ctx.ticked, ctx.settings);
  const byDate = allowedByDate(order.due, ctx.settings, ctx.now);
  const byCap  = allowedByCap(order.sku, ctx.caps, ctx.tally);
  const ok = bySku.ok && byDate.ok && byCap.ok;
  const no = [bySku, byDate, byCap].filter(r => !r.ok).map(r => r.why);
  return { ok, why: ok ? [bySku.why, byDate.why, byCap.why].join('; ') : no.join('; ') };
}

return {
  SETTINGS_KEY, CAPS_KEY, FILTER_KEY, DEFAULTS,
  settings, tickedSkus, caps, setCaps, tallyToday, noteAccepted,
  readDue, allowedByDate, allowedBySku, allowedByCap, decide,
  dayStamp, daysBetween,
};

})();
