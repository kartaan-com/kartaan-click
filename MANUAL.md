# Kartaan Click — how it works

A guide for anyone using it, whether or not you know anything about browser
extensions. Every tool in the extension is explained here. If a tool is not in
this guide, that is a mistake — the repository refuses a change that adds one
without it.

- [What this is](#what-this-is)
- [Installing it](#installing-it)
- [Tool 1 — the VMS packing screen clears its own AWB box](#tool-1--the-vms-packing-screen-clears-its-own-awb-box)
- [Tool 2 — Flipkart orders, one click at a time](#tool-2--flipkart-orders-one-click-at-a-time)
- [Getting updates](#getting-updates)
- [What it does with your information](#what-it-does-with-your-information)
- [When something goes wrong](#when-something-goes-wrong)

---

## What this is

Kartaan Click is a free browser extension that removes repeated clicking from the
websites seller and warehouse teams use all day.

It does not run in the background, it does not sync anything, and it has no
account. It sits quietly and does nothing at all until you are on one of the two
pages it works on.

It currently does two things. Both are described below.

---

## Installing it

1. Download the ZIP and unzip it somewhere you will not delete by accident —
   a permanent folder, not your Downloads.
2. Open `chrome://extensions` (or `edge://extensions` in Edge).
3. Turn on **Developer mode**. It is a switch at the top-right in Chrome, and at
   the bottom-left in Edge.
4. Click **Load unpacked**, and choose the folder you unzipped — the one with
   `manifest.json` directly inside it.

That is it. Reload any tab you already had open before it will work there.

> **Keep that folder.** The extension runs from those files, so deleting or moving
> the folder uninstalls it. It is also the folder you overwrite when an update
> comes out, which is what keeps your settings.

---

## Tool 1 — the VMS packing screen clears its own AWB box

**Where:** the SynLabs VMS operator screen (any `synlabs.io` address).

### Why it exists

We pack our own orders on this screen. Scanning an AWB starts the recording on its
own — but when you stop the recording, the old number is still sitting in the box.
So between every two parcels you have to:

1. Click **Stop**
2. Wipe the old number out by hand
3. Click the box again, because the scanner only types into the box you last
   clicked

### What it does instead

You click **Stop**. The box empties itself and takes the cursor. The next parcel
scans straight in.

Over a shift that is hundreds of clicks you no longer make.

### What it will not do

- It never clicks anything for you, including Stop. You are still in control of
  the recording.
- It never touches the recording itself.
- It waits until the page has finished with the number before clearing it, so the
  AWB is always read before it disappears.

There is nothing to set up for the clearing. It just works on that screen.

### Stopping a recording without the mouse

Between every parcel you had to move the mouse to the Stop button and click it.
You can press a key instead.

**Enter, by default.** Your hand is already there after a scan.

It is deliberately careful about when it listens:

- It does nothing at all unless a recording is actually running.
- It ignores the key for the first moment of a recording, so a stray keystroke
  cannot cut a parcel short before it has been filmed.
- Holding the key down does nothing. Neither does the key with Ctrl, Alt or
  Shift held.

**To change the key:** click the Kartaan Click icon in your browser's toolbar,
find *Stop recording with a key*, click **Change**, and press the key you want.
Escape cancels. Refresh the VMS tab afterwards.

**When you should change it:** if your barcode scanner sends Enter of its own
accord after each barcode. Some do. If yours does, Enter would try to stop the
recording the moment a scan starts it — pick a function key such as **F4**
instead, which no scanner sends.

Avoid plain letters and numbers: the scanner types those into the page, so one
could stop a recording by accident. The popup warns you if you pick one.

### What it saved us

Every parcel scanned into the VMS is timestamped, so we could measure this rather
than guess at it. Across the eleven working days before we started using it, the
median parcel took **41 seconds**. On the first day with it, **30 seconds** — 11
seconds quicker on every parcel, and faster than any of those eleven earlier days.

Over 500 parcels that is roughly an hour and a half of scanning you get back.

It is one day of 37 parcels against eleven days before it, so treat it as what we
actually saw rather than a laboratory result.

---

## Tool 2 — Flipkart orders, one click at a time

**Where:** `seller.flipkart.com`, on the **Active Orders** page only. Every other
Flipkart page is left completely alone.

### Why it exists

Flipkart's bulk actions on Active Orders normally work fine. But now and again
they do not go through, and until they do you are left handling every order with
its own individual click. With a hundred orders waiting, that is an hour of
clicking and nothing else.

We sell on Flipkart ourselves and hit this often enough to stop doing it by hand.
This is the tool we built for it, shared publicly so anyone caught by the same
thing can use it when they need to.

### What you see

A small dark panel appears at the bottom-left of the Active Orders page. Drag it
by its blue title bar to move it, and click the **–** in the corner to fold it
away. It remembers where you left it.

The panel does a different job depending on which tab you are on, and it works
this out by itself:

| The tab you are on | What the panel does |
|---|---|
| To Pack → **Pending RTD** | Clicks **Mark RTD** on each order |
| To Pack → **Pending Label** | Clicks **Print Labels** on each order |
| **To Accept** | Clicks **Accept** on each order |

### The buttons

**Scan SKUs** *(on the labels and accept tabs)*
Walks through every page and every section of the tab and counts what is waiting,
then lists each SKU with its number of orders and a tick box. Tick the ones you
want to work through and leave the rest. **Tick nothing and it does all of them.**

This is worth doing first — it also tells you the list is being read correctly
before anything gets clicked.

**Stop after \_\_\_ orders**
How many orders to handle before stopping on its own. Start small the first time.

**Start**
Begins. Nothing happens until you press this — the extension never starts a run by
itself, ever.

**Stop**
Stops after the order it is currently on, so it never abandons one halfway.

**Probe**
Looks at the page and reports what it can see, without clicking anything at all.
Use it whenever you are unsure, and always before a first run on a new tab. It
tells you how many orders it found. **If it says 0, do not press Start** — send
that line to Kartaan instead, because it means Flipkart has changed something.

**The log**
The black box at the bottom, showing what it is doing, one line per order. This is
the thing to copy if you ever need to report a problem.

### How it behaves while running

It is deliberately unhurried. It waits a random couple of seconds between orders,
takes a longer break every ten or so, and occasionally pauses for longer — it
works down the list the way a person does, not in a burst.

If the page freezes or Flipkart reloads it, the run picks up where it left off
rather than starting over or losing count. If your Flipkart session expires it
stops and tells you to log in again.

It stops on its own when the tab is empty, when it hits your limit, or when
several clicks in a row change nothing — that last one means something is wrong,
and it would rather stop than keep clicking.

### Printing labels — one browser setting worth changing

Browsers are normally set to ask you where to save every file. While that is on,
your browser will ask you for **every single label**, and the run waits for you
each time.

To make it hands-free:

- **Chrome** — Settings → Downloads → turn off *"Ask where to save each file
  before downloading"*
- **Edge** — Settings → Downloads → turn off *"Ask me what to do with each
  download"*

Labels then save on their own into **Downloads → Kartaan Click Labels**.

The panel reminds you of this on the labels tab, and again if a label ever stalls
waiting for you. The extension cannot see or change that setting itself, and it
cannot save files anywhere outside your Downloads folder — browsers do not allow
either.

If you would rather leave the setting alone, that is fine. The run simply pauses
at each label until you save it, and never clicks ahead in the meantime.

---

## Getting updates

Because this is installed from a ZIP rather than from a browser's store, it does
not update itself. Browsers only do that for extensions installed from their own
store, and there is no way around it on Windows.

So instead it tells you. Once a day it checks whether a newer version exists, and
when there is one a line appears in the extension's popup — click the extension's
icon to see it — and on the Flipkart panel, with a download link.

**To take an update:** unzip the new version **over your existing folder**, then
go to `chrome://extensions` and press the reload arrow on Kartaan Click. Keeping
the same folder is what keeps your settings and your panel position.

Nothing installs itself and nothing is forced on you.

---

## What it does with your information

Nothing leaves your computer, with one exception, described below.

- No account, no login, no analytics, no tracking.
- What it remembers — how far a run has got, which SKUs you ticked, where you
  dragged the panel — is stored by your own browser, on your own machine.
- It reads the pages named above only to find the buttons to press and to list
  your SKUs. That information is used on the page it came from and nowhere else.
- It asks the browser for two things: `storage`, to remember the items above
  between page loads, and `downloads`, used only to file a shipping label into
  your Downloads folder in the seconds after you press Print Labels. Files you
  download yourself are never touched, renamed, moved, or read.

**The one exception:** once a day it reads a small public file on kartaan.com to
find out the newest version number, so it can tell you. Nothing about you is sent
— it is the same kind of request as opening a web page.

The full detail is in [PRIVACY.md](PRIVACY.md).

---

## When something goes wrong

**The panel is not there on Flipkart**
Check you are on Active Orders, and press **F5**. If you have just installed or
updated the extension, a tab that was already open is still running the old copy
and needs refreshing.

**The panel's buttons do nothing at all**
Same cause, same fix: press **F5**. This happens after the extension is reloaded —
the copy running in an already-open tab is orphaned. The panel usually says so.
Note that going to the same address again is *not* enough; it has to be a refresh.

**Probe says 0 orders found**
Stop, and do not press Start. It means Flipkart has changed the page and the
extension no longer recognises the buttons. Send the Probe line to Kartaan.

**A label is stuck and the run is waiting**
Your browser is asking you where to save it — there will be a save box on screen.
Save it and the run continues. To stop being asked every time, change the setting
described under [printing labels](#printing-labels--one-browser-setting-worth-changing).

**It stopped and said the session expired**
Your Flipkart login timed out. Log in again and press Start; it carries on from
where it stopped.

**It stopped saying clicks are not doing anything**
It clicked several orders in a row with no effect, so it stopped rather than
continue blindly. Press Probe and send the log to Kartaan.

---

Questions, or a repetitive click you would like killed next:
[kartaan.com](https://kartaan.com)
