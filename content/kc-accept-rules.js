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
//
// ⚠️ "FAILS CLOSED" MEANS RETURNING NOTHING, NOT RETURNING SOMETHING SAFE-LOOKING.
// An independent review found two ways this file said "already late" — which
// means ACCEPT IT — about text it had not understood: the words "Non-Breached
// Orders", and a December date read in January. Both are fixed below and both
// have a test in the notes beside them. When adding a rule here, ask which way it
// fails, and if the answer is "it accepts", do not add it.

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
  maxPerRound:    20,      // a backstop on one run
  maxPerDay:      60,      // and a backstop on the whole day, per portal
};

// ⚠️ `onlyTickedSkus` DEFAULTS TO TRUE AND MUST STAY THAT WAY. With it on and
// nothing ticked, switching the whole feature on accepts nothing at all — the
// seller has to name the SKUs they are happy to take on before a single order is
// touched. That is the difference between a feature that is off by default and
// one that is safe by default, and it is the only thing standing between a
// mis-set filter and a warehouse full of orders somebody did not agree to.
//
// ⚠️ `maxPerDay` EXISTS BECAUSE `maxPerRound` ON ITS OWN IS NOT A CEILING. A round
// happens every 20-60 minutes across a 12-hour day, so "no more than 20 in one go"
// is really "no more than several hundred a day". A SKU with no cap of its own
// would otherwise have no limit at all. This is the limit that catches a rule set
// wrongly before it runs away.

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
// What it has actually been shown, on real pages, 2026-09-04/05:
//   Flipkart heading — "Dispatch by 12 PM, Tomorrow (5)"
//   Flipkart heading — "Dispatch by 12 PM, Today (6)"
//   Flipkart heading — "Breached Orders (11)"        (recorded in an earlier run)
//   Meesho cell      — "05 Sept Breaching Soon"
// Everything else below is handled on the same shapes. If a wording turns up that
// none of this reads, the order is left alone and its exact words go to the log —
// which is how the next wording gets added, with proof, rather than by guessing.

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

const MS_DAY = 24 * 60 * 60 * 1000;

// Beyond this many days either way, a bare day-and-month is not something this
// tool is willing to have an opinion about. It exists because the year is never
// printed: the further a date is from today, the more likely we have guessed the
// wrong year, and guessing wrong in the "already late" direction means ACCEPT.
const SANE_DAYS = 45;

// Midnight at the start of whatever day `d` falls in, in this browser's own time
// zone — which is the seller's. Comparing whole days rather than moments is the
// point: "due tomorrow" means the whole of tomorrow, not this time tomorrow.
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function daysBetween(fromTs, toTs) {
  return Math.round((startOfDay(new Date(toTs)) - startOfDay(new Date(fromTs))) / MS_DAY);
}

// A real day-and-month somewhere in the text: "05 Sept", "Sep 5", "5 September".
// Returns the whole number of days from today, or null.
//
// ⚠️ THE YEAR IS NEVER PRINTED, so it has to be worked out, and the two
// corrections below are EITHER/OR — never both. Applying them in sequence turned
// "05 Dec" seen on 10 January into "36 days ago, already late, accept it", when
// the truth was 329 days away. Both branches recompute from the same starting
// year, so chaining them is not a smaller version of the same idea; it is a
// different and wrong answer.
function readBareDate(text, now) {
  const dayFirst = text.match(/\b(\d{1,2})\s*(?:st|nd|rd|th)?\s+([a-z]{3,9})\b/);
  const monFirst = text.match(/\b([a-z]{3,9})\s+(\d{1,2})\s*(?:st|nd|rd|th)?\b/);
  const known = w => (MONTHS[w.slice(0, 4)] !== undefined ? MONTHS[w.slice(0, 4)]
                    : MONTHS[w.slice(0, 3)]);
  let day = null, month;
  if (dayFirst && known(dayFirst[2]) !== undefined) {
    day = parseInt(dayFirst[1], 10); month = known(dayFirst[2]);
  } else if (monFirst && known(monFirst[1]) !== undefined) {
    day = parseInt(monFirst[2], 10); month = known(monFirst[1]);
  }
  if (day === null || month === undefined || day < 1 || day > 31) return null;

  const year = new Date(now).getFullYear();
  let when = new Date(year, month, day);
  // A date that looks like it is nearly a year in the PAST is next year's, printed
  // without a year at the turn of the year: "02 Jan" seen on 28 December.
  if (daysBetween(now, when.getTime()) < -60) when = new Date(year + 1, month, day);
  // ⚠️ THERE IS DELIBERATELY NO MIRROR OF THAT. "05 Dec" read on 10 January is
  // genuinely ambiguous — it is either 329 days away or 36 days past — and the
  // two answers are "refuse" and "accept". Correcting it to last year picked the
  // accepting one, which is how a date nearly a year out came back as "already
  // late, take it". It is now left alone, lands far outside the sane window
  // below, and is refused. When the two readings disagree, say nothing.

  // The calendar rolls a bad day over — 31 April becomes 1 May — so a date that
  // did not survive the trip is one that was never real.
  if (when.getDate() !== day || when.getMonth() !== month) return null;

  const days = daysBetween(now, when.getTime());
  // Still absurd after the correction: we do not know what this says. Say nothing.
  if (days < -SANE_DAYS || days > SANE_DAYS) return null;
  return days;
}

// "Breached" means the deadline has already gone. But the word also appears
// INSIDE its own negation — Flipkart has a "Non-Breached Orders" grouping — and
// because a hyphen is a word boundary, `\bbreached\b` matched it happily and the
// answer came back "already late", which means accept. So the negation is looked
// for first and, when found, this says nothing at all rather than the opposite of
// the truth.
const NEGATED_BREACH = /\b(?:non|not|un|no longer|never|yet to be)[\s-]?breached\b/;
const BREACHED       = /\bbreached\b/;

// Returns { days, breached, how } or null when the wording cannot be read.
//   days     — whole days from today. 0 = today, 1 = tomorrow, -2 = two days ago.
//   breached — the deadline has already gone.
//   how      — which rule read it, so the log can say why.
//
// ⚠️ A REAL DATE IS PREFERRED OVER A LABEL, always. Meesho puts both in one cell
// ("05 Sept Breaching Soon"), and the date is the harder fact of the two.
function readDue(raw, nowTs) {
  const now  = typeof nowTs === 'number' ? nowTs : Date.now();
  const text = String(raw || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const dated = readBareDate(text, now);
  if (dated !== null) return { days: dated, breached: dated < 0, how: 'date' };

  if (/\btoday\b/.test(text))    return { days: 0, breached: false, how: 'today' };
  if (/\btomorrow\b/.test(text)) return { days: 1, breached: false, how: 'tomorrow' };

  // "Breaching Soon" is NOT breached — it is a warning that the deadline is close.
  // Checked in this order on purpose: one means leave it, the other means hurry.
  if (NEGATED_BREACH.test(text)) return null;
  if (BREACHED.test(text))       return { days: -1, breached: true, how: 'breached' };

  return null;
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
// A SKU with no number against it has no cap of its own — but `maxPerDay` still
// applies to it, so "no cap" is not "no limit".
//
// ⚠️ ONE CLICK IS NOT ALWAYS ONE ORDER. A Flipkart row is a GROUP: its button
// reads "Accept All 12 Order(s)" and one press takes all twelve. So everything
// here counts ORDERS and takes a `want` — how many this click would commit to —
// never a bare "one more". A cap of five stopped nothing at all while this
// counted clicks.

const dayStamp = ts => {
  const d = new Date(typeof ts === 'number' ? ts : Date.now());
  const p = n => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};

async function caps(portal) {
  const all = (await chrome.storage.local.get(CAPS_KEY))[CAPS_KEY] || {};
  return all[portal] || {};
}

// ⚠️ MERGE, NEVER REPLACE. The panel can only show the SKUs that happen to be
// waiting on the tab right now. Writing that list over the whole map deleted the
// cap on every SKU that had sold out for the day — and a deleted cap does not
// read as "nothing left", it reads as "no limit on this one", so the next round
// accepted it freely. Only what the seller can actually see is changed.
async function saveCaps(portal, visibleSkus, values) {
  const all  = (await chrome.storage.local.get(CAPS_KEY))[CAPS_KEY] || {};
  const kept = { ...(all[portal] || {}) };
  // ZERO IS A REAL ANSWER AND IT MEANS "NONE TODAY". It used to delete the cap,
  // which reads as "no limit on this one" — so the one number a seller would type
  // to stop a SKU was the number that set it free. Only a BLANK box removes a cap.
  for (const sku of visibleSkus) {
    const n = values[sku];
    if (Number.isFinite(n) && n >= 0) kept[sku] = Math.floor(n);
    else delete kept[sku];                    // the seller blanked this one
  }
  all[portal] = kept;
  await chrome.storage.local.set({ [CAPS_KEY]: all });
  return kept;
}

// How much of this portal's allowance has already gone today. A tally from an
// earlier day is not carried over — it is simply not this day's, so it counts as
// nothing and gets written over on the next accept.
async function tallyToday(portal, nowTs) {
  const key = TALLY_KEY[portal];
  const rec = (await chrome.storage.local.get(key))[key] || {};
  return rec.day === dayStamp(nowTs)
    ? { skus: rec.skus || {}, total: rec.total || 0 }
    : { skus: {}, total: 0 };
}

// ⚠️ ONE WRITER AT A TIME. This is a read, a change and a write with nothing
// holding the door, so two of them overlapping lose one increment — and every
// lost increment is one more order past the cap. Within a page they are queued
// behind each other here; ACROSS pages the answer is that only one tab is ever
// allowed to be running a portal's accept (see the tab ownership check in
// background.js). Both halves are needed; neither is enough alone.
let _writing = Promise.resolve();

function noteAccepted(portal, sku, nowTs, howMany) {
  const n = Number.isFinite(howMany) && howMany > 0 ? Math.floor(howMany) : 1;
  const run = async () => {
    const key   = TALLY_KEY[portal];
    const today = dayStamp(nowTs);
    const rec   = (await chrome.storage.local.get(key))[key] || {};
    const same  = rec.day === today;
    const skus  = same ? { ...(rec.skus || {}) } : {};
    const total = (same ? (rec.total || 0) : 0) + n;
    skus[sku]   = (skus[sku] || 0) + n;
    await chrome.storage.local.set({ [key]: { day: today, skus, total } });
    return { forSku: skus[sku], total };
  };
  // Queued, and a failure in one must not jam every write after it.
  const next = _writing.then(run, run);
  _writing = next.catch(() => {});
  return next;
}

// `want` is how many orders this one click would commit to.
// EVERY "how many" HERE FAILS CLOSED. `want` is the number of orders one press
// would commit to, and a module whose whole rule is that an unknown means no must
// not quietly read a missing, zero or fractional count as "one".
function countOrRefuse(want) {
  return (typeof want === 'number' && Number.isInteger(want) && want > 0) ? want : null;
}

function allowedByCap(sku, capMap, tally, want) {
  const n = countOrRefuse(want);
  if (n === null) return { ok: false, why: 'could not tell how many orders this would take' };
  const used = (tally.skus || {})[sku] || 0;
  const cap  = capMap[sku];
  // A stored 0 is a cap of none, not the absence of a cap.
  if (Number.isFinite(cap) && cap >= 0) {
    if (cap === 0) return { ok: false, why: 'you set this SKU to none for today' };
    if (used + n > cap) {
      return { ok: false, why: used >= cap
        ? 'its daily limit of ' + cap + ' is already used up'
        : 'that would take ' + (used + n) + ' of this SKU today, past your limit of ' + cap };
    }
    return { ok: true, why: used + ' of ' + cap + ' taken today' };
  }
  return { ok: true, why: 'no daily limit on this SKU' };
}

// The whole portal's allowance for the day, which applies to every SKU including
// the ones with no cap of their own.
function allowedByDayTotal(s, tally, want) {
  const n = countOrRefuse(want);
  if (n === null) return { ok: false, why: 'could not tell how many orders this would take' };
  const limit = Number.isFinite(s.maxPerDay) && s.maxPerDay > 0 ? s.maxPerDay : DEFAULTS.maxPerDay;
  const used  = tally.total || 0;
  if (used + n > limit) {
    return { ok: false, why: used >= limit
      ? "today's limit of " + limit + ' orders on this portal is already used up'
      : 'that would take ' + (used + n) + ' orders today, past your limit of ' + limit };
  }
  return { ok: true, why: used + ' of ' + limit + ' taken today on this portal' };
}

// ── the whole answer for one order ──────────────────────────────────────────
//
// Every reason is worked out even once one has already said no, because the log
// line is what the seller reads afterwards to understand why nothing happened,
// and "not ticked" alone is a poor answer when the date was wrong as well.
//
// `order.count` is how many orders this one press would accept — 1 on Meesho,
// and whatever the Flipkart row's "Accept All N Order(s)" button says.
function decide(order, ctx) {
  const want   = countOrRefuse(order.count);
  const bySku  = allowedBySku(order.sku, ctx.ticked, ctx.settings);
  const byDate = allowedByDate(order.due, ctx.settings, ctx.now);
  const byCap  = allowedByCap(order.sku, ctx.caps, ctx.tally, want);
  const byDay  = allowedByDayTotal(ctx.settings, ctx.tally, want);
  const all = [bySku, byDate, byCap, byDay];
  const ok  = all.every(r => r.ok);
  return {
    ok, want,
    why: ok ? all.map(r => r.why).join('; ')
            : all.filter(r => !r.ok).map(r => r.why).join('; '),
  };
}

return {
  SETTINGS_KEY, CAPS_KEY, FILTER_KEY, DEFAULTS,
  settings, tickedSkus, caps, saveCaps, tallyToday, noteAccepted,
  readDue, allowedByDate, allowedBySku, allowedByCap, allowedByDayTotal, decide,
  dayStamp, daysBetween,
};

})();
