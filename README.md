# Kartaan Click

A free browser extension that removes small, repetitive clicks from the tools
seller and warehouse teams use all day. Built by Vishal Jaiswal at
[Kartaan](https://kartaan.com), and free for anyone to use.

### [⬇ Download the latest version](https://github.com/kartaan-com/kartaan-click/releases/latest/download/kartaan-click.zip)

That link always points at the newest release, so it never needs changing.

**New here? Read [the manual](MANUAL.md)** — it explains every tool in plain
English, with no assumed knowledge.

| | |
|---|---|
| 📖 [Manual](MANUAL.md) | What each tool does and how to use it |
| 📝 [What changed](CHANGELOG.md) | Every version, newest first |
| 🔒 [Privacy](PRIVACY.md) | What it does and does not do with your information |
| ⚖️ [Licence](LICENSE) | Free to use. Not free to take. |

---

## What it does

**1. The VMS packing screen clears its own AWB box.**
On the SynLabs VMS operator screen, scanning an AWB starts the recording by
itself — but stopping it leaves the old number in the box, so between every two
parcels you had to click Stop, wipe the number out by hand, and click the box
again before the scanner would work. Now you click Stop and the box empties itself
and takes the cursor. The next parcel scans straight in.

You can also **stop a recording by pressing a key** rather than reaching for the
mouse — Enter by default, changeable from the extension's popup if your scanner
already sends Enter.

We pack our own orders on that screen every day, which is how we came to build
this.

**2. Flipkart orders, one click at a time.**
Flipkart's bulk actions on Active Orders normally work fine. But now and then they
do not go through, and you are left processing orders one at a time — with a
hundred waiting, that is an hour of clicking and nothing else.

This was built for those days. We sell on Flipkart ourselves, and rather than sit
there clicking through a backlog by hand, a small panel works down the list:

| Tab | What it clicks |
|---|---|
| To Pack → Pending RTD | **Mark RTD** on each order |
| To Pack → Pending Label | **Print Labels** on each order |
| To Accept | **Accept** on each order |

You can scan your SKUs first and tick only the ones you want. It never starts on
its own — you press Start, you set how many to stop after, and Stop halts it after
the order it is on.

**3. Portal check-ins — off until you switch them on.**
Flipkart, Meesho and Amazon all take note of how often a seller is actually on the
portal looking at their orders. Doing that by hand means stopping what you are
doing to open three portals every half hour, all day.

Instead, this opens each portal behind whatever you are working on, clicks through
the order tabs the way you would, and leaves the tab open — one per portal, already
signed in, so the next round has no login to get past:

| Portal | The round |
|---|---|
| Flipkart | To Accept → To Pack → back to To Accept |
| Meesho | Orders → On Hold → Pending → Ready to Ship |
| Amazon | Manage Orders → Pending → Unshipped |

You set the hours (9 AM to 9 PM to begin with), the gap between rounds (a random
one each time, 20 to 60 minutes to begin with), and which portals are included. It
reads no order or customer details and it accepts, cancels and changes nothing —
all it does is look.

One thing worth knowing before you turn it on: the platforms count these visits
because they are trying to measure *you*. Nothing here fakes anything — it is your
login, your portal, your own tabs — but a platform could take the view that an
automatic round is not the same as a seller checking in. The manual says so too.

Full detail, including every button and what to do when something goes wrong, is
in **[the manual](MANUAL.md)**.

## What it actually saves

Measured on our own packing screen, not estimated.

Every parcel scanned into the VMS is timestamped, so the gap between one parcel
and the next is how long that parcel took. Comparing the eleven working days
before the extension with the first day using it:

| | Days | Parcels | Median time per parcel |
|---|---|---|---|
| 13–27 August, before | 12 | 640 | **40 seconds** |
| 29–30 August, with the extension | 2 | 58 | **31 seconds** |

That is **9 seconds off every parcel**. Both days using it came in faster than
every one of the twelve days before — the quickest of those was 36 seconds — so
it is not simply a good day.

**Over 500 parcels that is about an hour and a quarter.** Measured against our own
fastest day before the extension rather than the average, it is still about
40 minutes.

Being straight about the limits: this is two days and 58 parcels against twelve
days before it, and it is a before-and-after observation rather than a controlled
test — staff and order mix vary too. Gaps longer than five minutes were counted as
breaks and left out of both figures.

## Install

1. [Download the ZIP](https://github.com/kartaan-com/kartaan-click/releases/latest/download/kartaan-click.zip)
2. Unzip it somewhere permanent — not your Downloads folder
3. Open `chrome://extensions` (or `edge://extensions`)
4. Turn on **Developer mode** — top-right in Chrome, bottom-left in Edge
5. Click **Load unpacked** and pick the unzipped folder (the one with
   `manifest.json` in it)

Then refresh any tab you already had open.

*An Edge Add-ons store listing is pending review, which will make this a one-click
install for Edge users.*

## Updates

A ZIP install does not update itself — browsers only do that for extensions
installed from their own store, and self-hosted auto-update is not permitted on
Windows.

So the extension tells you instead. Once a day it checks whether a newer version
exists, and when there is one a line appears in the extension's popup and on the
Flipkart panel with a download link.

To take an update: unzip the new version **over your existing folder**, then press
the reload arrow at `chrome://extensions`. Keeping the same folder keeps your
settings and panel position.

## Which sites it runs on

Only these two:

- `https://*.synlabs.io/*` — on any page there without an AWB box it does nothing.
- `https://seller.flipkart.com/*` — the panel only appears on Active Orders. Every
  other Flipkart page is left completely alone.

## Privacy

It collects nothing about you. No accounts, no tracking, no analytics. Everything
it remembers — how far a run has got, which SKUs you ticked, where you dragged the
panel — stays in your own browser.

It asks for `storage` to remember those things between page loads, `downloads` to
save shipping labels into your Downloads folder, and access to `kartaan.com` for
the update check above. The downloads permission is inert except in the seconds
after you press Print Labels; files you download yourself are never touched.

It makes exactly one network request in its life: once a day it reads a small
public file on kartaan.com to see whether a newer version exists. Nothing about
you is sent in it. See [PRIVACY.md](PRIVACY.md).

## Suggestions

Found another repetitive click worth killing? Open an issue with the site and the
steps you repeat. Code contributions are not accepted — this is maintained by
Kartaan.

---

## For maintainers

### Building the ZIP

`node tools/make-zip.js` — packages the files the browser needs and nothing else.

### Releasing

`node tools/release.js` — checks the release rules, builds the package, and prints
the remaining steps. The release asset is always uploaded as `kartaan-click.zip`
so the download link at the top of this page never changes.

Before releasing: bump `version` in `manifest.json`, add its entry to
[CHANGELOG.md](CHANGELOG.md), and update the version file on kartaan.com so
existing users are told.

### The release rules

`node tools/check.js` — the rules this repository will not accept a change
without. It refuses a commit that adds a permission without explaining it in
PRIVACY.md and STORE-LISTING.md, leaves a file out of the package, contacts a
server the privacy policy does not name, adds a tool that MANUAL.md does not
explain, ships a version with no CHANGELOG entry, or builds a ZIP whose folders
came out wrong. `--release` adds the stricter checks that only matter when
submitting to a store.

It runs in two places, on purpose:

- **Before every commit**, once per machine, via
  `git config core.hooksPath .githooks`. A machine without that line set is not
  protected by the hook.
- **On every push to GitHub**, which nobody can skip. If the two ever disagree,
  believe GitHub.

Each rule is there because something actually went wrong once, and the reason is
written above it. Do not delete a rule to make a commit pass.

### Regenerating the icons

`node tools/make-icons.js` — no dependencies, draws the PNGs from scratch.

## Licence

Copyright © 2026 Vishal Jaiswal (Kartaan). All rights reserved.

**Free to use, not free to take.** You may install and use it at no cost and share
the download link. You may not copy, modify, redistribute, sell, or publish it
anywhere else without written permission. The source is public so that anyone can
read it and see what it does — that is not permission to reuse it. See
[LICENSE](LICENSE).
