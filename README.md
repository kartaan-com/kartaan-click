# Kartaan Click

Free browser extension that fixes small, repetitive annoyances in the tools sellers
and warehouse teams use all day. Built by Vishal Jaiswal at [Kartaan](https://kartaan.com), and free for
anyone to use.

## What it does today

### 1. VMS packing screen — the AWB box clears itself

On the SynLabs VMS operator screen, scanning an AWB starts the recording on its own.
But stopping it leaves the old number sitting in the box, so between every two
parcels you have to:

1. Click **Stop**
2. Wipe the old AWB out by hand
3. Click the box again before the scanner will type into it

This extension does steps 2 and 3 for you. Click Stop, and the box empties and takes
the cursor — the next parcel scans straight in. Over a shift that is hundreds of
clicks you no longer make.

It never clicks anything for you and never touches the recording itself. It waits
until the page's own Stop has finished before clearing, so the AWB is always read
before it disappears.

### 2. Flipkart Active Orders — one order at a time

Flipkart's bulk buttons on Active Orders do not work, so every order needs its own
individual click. With a hundred orders waiting that is an hour of clicking.

A small panel appears on the Active Orders page and works through the list for you.
Which job it does depends on the tab you are on:

| Tab | What it clicks |
|---|---|
| To Pack → Pending RTD | **Mark RTD** on each order |
| To Pack → Pending Label | **Print Labels** on each order |
| To Accept | **Accept** on each order |

On the label and accept tabs you can press **Scan SKUs** first, which lists every
SKU waiting with its order count, and tick only the ones you want to work through.

It never starts on its own. You press Start, you set how many orders to stop after,
and Stop halts it after the order it is on. It paces itself unevenly, the way a
person working down a list does, and if the page reloads mid-run it picks up where
it left off.

#### Printing labels — one browser setting

Browsers are usually set to ask where to save every file. While that is on, your
browser will ask for every single label and the run waits for you each time.

To make it hands-free:

- **Chrome** — Settings → Downloads → turn off "Ask where to save each file before downloading"
- **Edge** — Settings → Downloads → turn off "Ask me what to do with each download"

Labels then save on their own into **Downloads → Kartaan Click Labels**.

The panel says this on the labels tab too, and says it again if a label ever stalls
waiting for you. An extension cannot read or change that setting for you — only you
can.

## Install

### From the Microsoft Edge Add-ons store

Search for **Kartaan Click** and click Get. *(Listing pending review.)*

### From the ZIP

The source repository is private, so there is no public download link here. The
install file is distributed as a ZIP from kartaan.com or sent to you directly.

1. Unzip it somewhere you will not delete by accident
2. Open `chrome://extensions` (or `edge://extensions`)
3. Turn on **Developer mode** — top-right in Chrome, bottom-left in Edge
4. Click **Load unpacked** and pick the unzipped folder (the one with `manifest.json` in it)

Reload the tab you want to use it on. On the VMS screen, the browser console (F12)
shows a line starting `[Kartaan Click]` when it is active; on Flipkart Active Orders
the panel appears at the bottom-left.

### Building the ZIP

`node tools/make-zip.js` — packages the files Chrome needs and nothing else.

## Privacy

It collects nothing, sends nothing, and talks to no server. No accounts, no
tracking, no analytics. Everything it remembers — how far a run has got, which SKUs
you ticked, where you dragged the panel — stays in your own browser.

It asks for two permissions: `storage` to remember those things between page loads,
and `downloads` to save shipping labels into your Downloads folder. The downloads
permission is inert except in the seconds after you press Print Labels; files you
download yourself are never touched. See [PRIVACY.md](PRIVACY.md).

## Which sites it runs on

Only these two:

- `https://*.synlabs.io/*` — on any page there without an AWB box it does nothing.
- `https://seller.flipkart.com/*` — the panel only appears on Active Orders. Every
  other Flipkart page is left completely alone.

## Suggestions

Found another repetitive click worth killing? Open an issue with the site and the
steps you repeat. Code contributions are not accepted — this is maintained by
Kartaan.

## Regenerating the icons

`node tools/make-icons.js` — no dependencies, draws the PNGs from scratch.

## Licence

Copyright © 2026 Vishal Jaiswal (Kartaan). All rights reserved.

Free to use, not free to take. You may install and use it at no cost, and share
the download link. You may not copy, modify, redistribute, or publish it anywhere
else without written permission. See [LICENSE](LICENSE).
