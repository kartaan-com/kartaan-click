# What changed, and when

Newest first. Every released version has an entry here — the repository refuses a
change whose version is not listed.

## 1.4.0 — 4 September 2026

- **New tool: portal check-ins.** Flipkart, Meesho and Amazon all take note of how
  often a seller is on the portal looking at their orders. This does that round for
  you: every so often it opens each portal behind whatever you are doing, clicks
  through the order tabs the way you would, and closes the tab again.
  - Flipkart: To Accept → To Pack → back to To Accept.
  - Meesho: Orders → On Hold → Pending → Ready to Ship.
  - Amazon: Manage Orders → Pending → Unshipped.
- **It is off until you switch it on**, and everything about it is yours to set: the
  gap between rounds (a random one each time, 20 to 60 minutes to begin with), the
  hours it may run in (9 AM to 9 PM to begin with), and which portals are included.
- **A settings page.** Right-click the extension's icon → Options. It holds the
  check-in settings, a "do one round now" button so you can watch it work instead of
  waiting, and a list of what the last rounds actually clicked.
- Written down plainly in the manual and on the settings page: the platforms count
  these visits because they are trying to measure *you*, so having the extension do
  the looking is a decision worth taking knowingly.
- New `alarms` permission — the only kind of timer that survives the extension being
  put to sleep, which browsers do within about half a minute of it doing nothing.
- The release rules now also check the settings page: any page the extension owns,
  and every script it loads, must exist and must be in the package. Before this,
  only the popup was checked, so a settings page could have shipped missing.

## 1.3.0 — 30 August 2026

- **Stop a recording from the keyboard.** On the VMS packing screen, press a key
  instead of reaching for the mouse and finding the Stop button between every
  parcel. **Enter** by default; change it to any other key from the extension's
  popup if your barcode scanner sends Enter of its own accord.
- It only acts while a recording is actually running, and ignores the key for the
  first moment of one, so a stray keystroke cannot cut a parcel short.
- Added the measured time saving to the README and the manual, from our own VMS
  scan timestamps rather than an estimate: 40 seconds a parcel before, 31 after,
  across 698 parcels.

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
