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

**2. Flipkart orders, one click at a time.**
Flipkart's bulk buttons on Active Orders do not work, so every order needs its own
individual click — an hour of clicking when a hundred are waiting. A small panel
works down the list for you:

| Tab | What it clicks |
|---|---|
| To Pack → Pending RTD | **Mark RTD** on each order |
| To Pack → Pending Label | **Print Labels** on each order |
| To Accept | **Accept** on each order |

You can scan your SKUs first and tick only the ones you want. It never starts on
its own — you press Start, you set how many to stop after, and Stop halts it after
the order it is on.

Full detail, including every button and what to do when something goes wrong, is
in **[the manual](MANUAL.md)**.

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
