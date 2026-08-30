# What changed, and when

Newest first. Every released version has an entry here — the repository refuses a
change whose version is not listed.

## 1.2.0 — 30 August 2026

- **The extension now tells you when a new version is out.** A ZIP install cannot
  update itself, so once a day it checks and shows a line in the popup and on the
  Flipkart panel, with a download link. Nothing installs itself.
- This is the first time the extension has ever contacted a server. It reads one
  small public file on kartaan.com and sends nothing about you.
- Shipping labels are now filed into **Downloads → Kartaan Click Labels** instead
  of loose in your Downloads folder.
- Added [MANUAL.md](MANUAL.md), a plain-English guide to every tool.

## 1.1.0 — 29 August 2026

- **Added the Flipkart Active Orders tools.** A panel that works down the order
  list one at a time, for the days when Flipkart's bulk actions do not go through:
  Mark RTD, Print Labels, and Accept orders. You can scan your SKUs first and pick
  only the ones you want. It never starts on its own.
- Fixed the packaging leaving the icons out of the ZIP, which affected every
  build before this one.

## 1.0.0 — 29 August 2026

- First release.
- **The VMS packing screen clears its own AWB box.** Stop the recording and the
  box empties itself and takes the cursor, so the next parcel scans straight in.
