# Edge Add-ons submission — what to paste where

Everything below is ready to copy into Partner Center. Nothing here needs changing
unless you want to reword it.

## Before you start

1. Register (free) at <https://partner.microsoft.com/dashboard/registration/> using
   your Microsoft account, and choose the **Microsoft Edge** program.
   There is no fee for Edge — unlike Chrome, which charges $5.
2. Build the upload file: `node tools/make-zip.js`, which produces
   `kartaan-click-1.1.0.zip` with `manifest.json` at the top level.

## Listing fields

**Name**
Kartaan Click

**Short description** (under 132 characters)
Free workflow fixes for seller and warehouse teams — the VMS packing box clears itself, and Flipkart orders go one click at a time.

**Description**
Kartaan Click removes small, repetitive clicks from the tools that seller and warehouse teams use all day. It is free, from Kartaan.

VMS packing screen — the AWB box clears itself:

On the SynLabs VMS operator screen, scanning an AWB starts the recording on its own. But stopping it leaves the old number sitting in the box. So between every two parcels you have to click Stop, wipe out the old AWB by hand, and click the box again before the scanner will type into it.

This extension does those last two steps for you. Click Stop, and the box empties itself and takes the cursor — the next parcel scans straight in. Over a shift, that is hundreds of clicks you no longer make.

Flipkart Active Orders — one order at a time, without you sitting there:

Flipkart's bulk buttons on Active Orders do not work, so every order has to be handled with its own individual click. When you have a hundred of them, that is an hour of clicking.

Kartaan Click puts a small panel on the Active Orders page that works through the list for you — marking orders ready to dispatch, printing shipping labels, or accepting new orders, depending on which tab you are on. You can scan your SKUs first and tick only the ones you want to work through. It never starts on its own: you press Start, you set how many to stop after, and you can press Stop at any time.

Printing labels saves each one into a Kartaan Click Labels folder inside your normal Downloads folder.

Privacy: it collects nothing, sends nothing, and contacts no server. No accounts, no tracking, no analytics. Everything it remembers stays in your own browser.

More free tools are on the way. Learn more at kartaan.com

**Category**
Productivity

**Privacy policy URL**
⚠️ NEEDS A PUBLIC HOME. The repository is private, so the GitHub link 404s for the
reviewer and the submission will be rejected. Publish the text of PRIVACY.md at a
public URL first — `https://kartaan.com/privacy` is the obvious one — and put that
URL here.

**Website**
https://kartaan.com

**Support / contact**
kartaan.com (the GitHub issues link cannot be used — private repo)

**Search terms**
vms, packing, awb, warehouse, barcode scanner, flipkart, seller tools

## Questions the review asks

**Does your extension use remote code?**
No. All code is in the package.

**Why do you need the permissions you request?**

*storage* — the Flipkart tool works through a long list of orders one at a time and
has to survive the page reloading mid-run. `storage` holds how far the run has got,
which SKUs the user ticked, where the panel was dragged to, and the panel's log.
All of it is local to the user's browser and none of it is transmitted.

*downloads* — the Print Labels tool exists to get shipping label files onto the
user's disk. `downloads` is used to file each label into a "Kartaan Click Labels"
folder inside the user's own Downloads folder and to report whether it saved
successfully. It is armed by the extension only in the seconds after the user
presses Print Labels, and is completely inert at all other times: downloads the
user starts themselves are never touched, renamed, moved, or cancelled.

*Host permissions* — two sites are declared, `https://*.synlabs.io/*` and
`https://seller.flipkart.com/*`. Both are required for the content scripts to run
on those pages. No other site is accessed.

**Is any user data collected?**
No. Nothing is sent anywhere; there is no server, no analytics and no account.

**Testing instructions for the reviewer**
Both tools sit behind logins the reviewer will not have — a SynLabs VMS operator
account and a Flipkart seller account — so the behaviour is best confirmed from the
source, which is small and has no network calls of any kind:

- `content/vms-awb.js` — about 90 lines. Reads and clears the text box with id
  `awbInput` on the VMS screen. No `fetch`, no `XMLHttpRequest`.
- `content/fk-orders.js` — the Flipkart panel. It only ever presses buttons that are
  already on the page, and only after the user presses Start. No `fetch`, no
  `XMLHttpRequest`.
- `background.js` — under 120 lines. Its only job is saving a shipping label. Every
  path in it returns immediately unless the panel armed it within the last 60
  seconds.

Searching the package for `fetch(`, `XMLHttpRequest` or any http URL other than
`seller.flipkart.com` and `kartaan.com` will return nothing.

## Screenshots

Edge asks for at least one, 1280x800 or 640x480. Use a shot of the VMS packing
screen with the extension popup open, and one of the Flipkart Active Orders panel.
Blur any real AWB numbers, order IDs and customer details first.
