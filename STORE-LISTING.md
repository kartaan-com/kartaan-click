# Edge Add-ons submission — what to paste where

Everything below is ready to copy into Partner Center. Nothing here needs changing
unless you want to reword it.

## Before you start

1. Register (free) at <https://partner.microsoft.com/dashboard/registration/> using
   your Microsoft account, and choose the **Microsoft Edge** program.
   There is no fee for Edge — unlike Chrome, which charges $5.
2. Build the upload file: `node tools/make-zip.js`, which produces
   `kartaan-click-1.4.0.zip` with `manifest.json` at the top level.

## Listing fields

**Name**
Kartaan Click

**Short description** (under 132 characters)
Free workflow fixes for seller and warehouse teams — the VMS packing box clears itself, and Flipkart orders go one click at a time.

**Description**
Kartaan Click removes small, repetitive clicks from the tools that seller and warehouse teams use all day. It is free, from Kartaan.

We are sellers ourselves. Every tool in here was built to solve a problem we ran into in our own warehouse, and then shared publicly so anyone else caught by the same thing can use it.

VMS packing screen — the AWB box clears itself:

On the SynLabs VMS operator screen, scanning an AWB starts the recording on its own. But stopping it leaves the old number sitting in the box. So between every two parcels you have to click Stop, wipe out the old AWB by hand, and click the box again before the scanner will type into it.

This extension does those last two steps for you. Click Stop, and the box empties itself and takes the cursor — the next parcel scans straight in. Over a shift, that is hundreds of clicks you no longer make.

Flipkart Active Orders — one order at a time, without you sitting there:

Flipkart's bulk actions on Active Orders normally work fine. But now and again they do not go through, and until they do, every order has to be handled with its own individual click. When you have a hundred of them, that is an hour of clicking.

Kartaan Click puts a small panel on the Active Orders page that works through the list for you — marking orders ready to dispatch, printing shipping labels, or accepting new orders, depending on which tab you are on. You can scan your SKUs first and tick only the ones you want to work through. It never starts on its own: you press Start, you set how many to stop after, and you can press Stop at any time.

Printing labels saves each one into a Kartaan Click Labels folder inside your normal Downloads folder.

Portal check-ins — off until you switch them on:

Flipkart, Meesho and Amazon all take note of how often a seller is actually on the portal looking at their orders. If you would rather not stop what you are doing to open three portals every half hour, Kartaan Click can do that round for you: it opens each one behind whatever you are working on, clicks through the order tabs, and closes the tab again.

You set the hours it may do this in, how far apart the rounds are, and which portals are included. It is off out of the box, it reads no order or customer details, and nothing from those pages ever leaves your computer.

Privacy: it collects nothing about you. No accounts, no tracking, no analytics. Everything it remembers stays in your own browser. It makes one network request in its life: once a day it reads a small public file on kartaan.com to see whether a newer version is out, so it can tell you. Nothing about you is sent in it.

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
https://kartaan.com — the contact details live there.
(Do NOT put a personal email address in this field. If Edge insists on an email
rather than a page, use a business address on the kartaan.com domain.)

**Search terms**
vms, packing, awb, warehouse, barcode scanner, flipkart, meesho, amazon, seller tools

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

*alarms* — the portal check-in feature has to know when the next round is due. A
browser alarm is the only timer that survives a Manifest V3 service worker being
suspended, which happens within about 30 seconds of idle. It stores one scheduled
time and is used for nothing else.

*Host permissions and content script matches* — `https://*.synlabs.io/*` and
`https://seller.flipkart.com/*` are required for the content scripts to run on
those pages. `https://supplier.meesho.com/*` and `https://sellercentral.amazon.in/*`
are required for the portal check-in content script, which is inert unless the user
has switched check-ins on and the tab is one the extension opened for a round; it
clicks the site's own order tabs and reads nothing else. `https://kartaan.com/*` is
used once a day to read a single small public file holding the current version
number, so users on a manual install can be told when a new version exists. Nothing
is sent in that request and no other site is accessed.

**Is any user data collected?**
No. There is no analytics, no tracking and no account. The extension makes exactly
one network request in its life cycle — a once-a-day read of
`https://kartaan.com/kartaan-click/version.json`, a small public file containing
the latest version number. It is a plain GET with no parameters, no identifiers
and no request body. Nothing about the user or their browsing is transmitted.

**Testing instructions for the reviewer**
Both tools sit behind logins the reviewer will not have — a SynLabs VMS operator
account and a Flipkart seller account — so the behaviour is best confirmed from the
source, which is small:

- `content/vms-awb.js` — about 90 lines. Reads and clears the text box with id
  `awbInput` on the VMS screen. No `fetch`, no `XMLHttpRequest`.
- `content/fk-orders.js` — the Flipkart panel. It only ever presses buttons that are
  already on the page, and only after the user presses Start. No `fetch`, no
  `XMLHttpRequest`.
- `background.js` — two jobs only: saving a shipping label, and the once-a-day
  version check. Every download path in it returns immediately unless the panel
  armed it within the last 60 seconds.
- `content/checkin.js` — the portal check-in. It asks the background worker whether
  the tab it is in was opened for a check-in round; on any tab the user opened
  themselves the answer is no and it does nothing for the life of the page. When
  the answer is yes it clicks a short, fixed list of the site's own tab names and
  reports back. No `fetch`, no `XMLHttpRequest`, and it reads no order data.
- `popup.js` — reads the result of that version check and puts it on screen.
- `options.js` — the settings page for check-ins. Reads and writes local settings
  only.

Searching the package finds two `fetch(` calls, and only one of them leaves the
machine:
- `background.js` — the version check described above. The only remote request in
  the extension.
- `content/fk-orders.js` — reads a `blob:` address, which is a file the Flipkart
  page has already built in local memory. Nothing leaves the machine. This one is
  a temporary diagnostic behind `const BLOB_TEST`, removed before submission.

There is no `XMLHttpRequest` anywhere. The only URLs in the package are
`seller.flipkart.com`, `supplier.meesho.com`, `sellercentral.amazon.in` — the three
seller portals the user already works on, opened only for a check-in round — and
`kartaan.com` for the version file.

## Screenshots

Edge asks for at least one, 1280x800 or 640x480. Use a shot of the VMS packing
screen with the extension popup open, and one of the Flipkart Active Orders panel.
Blur any real AWB numbers, order IDs and customer details first.
