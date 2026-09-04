# Kartaan Click — how it works

A guide for anyone using it, whether or not you know anything about browser
extensions. Every tool in the extension is explained here. If a tool is not in
this guide, that is a mistake — the repository refuses a change that adds one
without it.

- [What this is](#what-this-is)
- [Installing it](#installing-it)
- [Tool 1 — the VMS packing screen clears its own AWB box](#tool-1--the-vms-packing-screen-clears-its-own-awb-box)
- [Tool 2 — Flipkart orders, one click at a time](#tool-2--flipkart-orders-one-click-at-a-time)
- [Tool 3 — portal check-ins](#tool-3--portal-check-ins)
- [Getting updates](#getting-updates)
- [What it does with your information](#what-it-does-with-your-information)
- [When something goes wrong](#when-something-goes-wrong)

---

## What this is

Kartaan Click is a free browser extension that removes repeated clicking from the
websites seller and warehouse teams use all day.

It has no account and it syncs nothing. Two of its three tools sit quietly and do
nothing at all until you are on the page they work on. The third — portal
check-ins — does run on a timer, and it is switched off until you turn it on
yourself.

It currently does three things. All three are described below.

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

### Pop-ups in the way

Portals put things in front of you — a "what's new" card, a rate-us box, a cookie
strip. One of those sitting over the order tabs is enough to stop a round, so it
closes them first, and again if one appears while it is waiting.

Not every pop-up announces itself as one — Meesho's are often plain boxes floated
over the page — so anything *behaving* like one counts too: lifted off the page,
stacked above it, and big enough to be in the way.

That widens where it looks, **not what it presses**. It is deliberately timid,
because these are live seller portals: it only ever presses a close control, a bare
cross, or one of a short list of words that can only mean "go away" — Got it, OK,
Close, Dismiss, No thanks, Not now, Skip. It will not press Cancel, Continue, Done
or anything beginning with Accept. If a box is plainly there but has no way out
that can be found, it presses Escape, which closes most of them and on a page with
nothing open does nothing at all.

Whatever it closed is listed with the round on the settings page, so it is never
doing this out of sight.

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
than guess at it. Across the twelve working days before we started using it, the
median parcel took **40 seconds**. Over the first two days with it, **31 seconds**
— 9 seconds quicker on every parcel, and faster than any of those twelve earlier
days.

Over 500 parcels that is roughly an hour and a quarter of scanning you get back.

It is two days and 58 parcels against twelve days before them, so treat it as what
we actually saw rather than a laboratory result.

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

## Tool 3 — portal check-ins

**This one is switched off when you install it. Nothing happens until you turn it
on yourself.**

### Why it exists

Flipkart, Meesho and Amazon all keep an eye on how often a seller is actually on
the portal looking at their orders. They treat it as a sign that somebody is
minding the shop — that new orders will be seen and accepted quickly rather than
sitting there.

Doing that by hand means stopping whatever you are doing, opening three portals,
clicking through the order tabs, and closing them again — every half hour, all
day. That is a job in itself.

### What it does instead

Every so often it opens each portal you have chosen **behind whatever you are
working on**, clicks through the order tabs the way you would, and closes the tab
again. You are not interrupted and nothing takes your screen.

The round on each portal is:

| Portal | It opens | Then clicks |
|---|---|---|
| Flipkart | Active Orders → To Accept | To Pack → back to To Accept |
| Meesho | Orders | On Hold → Pending → Ready to Ship |
| Amazon | Manage Orders | Pending → Unshipped |

Those are the seller portals themselves — `seller.flipkart.com`,
`supplier.meesho.com` and `sellercentral.amazon.in`. It opens no other site, and it
uses your existing login on each; there is nowhere to enter a password and it never
asks for one.

### Setting it up

Right-click the extension's icon and choose **Options** (or open
`chrome://extensions`, find Kartaan Click, and click **Extension options**). You
get one page with everything on it:

| Setting | What it means | Starts as |
|---|---|---|
| Switch check-ins on | Nothing at all happens until this is ticked | Off |
| Check in every … to … minutes | A different, random gap each time, somewhere between the two numbers. Never the same beat over and over | 20 to 60 minutes |
| Only between … and … | Your working hours. Nothing runs outside them | 9 AM to 9 PM |
| Which portals | Tick the ones you sell on | All three |
| Your orders page on each portal | An override, rarely needed. See below | Empty — worked out for you |

Press **Save**. The page then tells you when the next round is due.

#### The orders page address — you should not need to touch this

A round opens your orders page directly rather than the portal's front door.
Flipkart's and Amazon's addresses are the same for every seller, so those are
built in.

Meesho's is not. Its orders address looks something like
`supplier.meesho.com/panel/v3/new/fulfillment/xxxxx/orders/pending`, and that
`xxxxx` is a code belonging to your own account — there is no address that works
for everybody.

**You do not have to find it.** The code is in the address bar every time you are
on your own Meesho panel, so it is read from there the first time you are and
remembered. Nothing is asked for and nothing is sent anywhere — it stays in this
browser and is used for nothing but building the address a round opens. The
settings page tells you whether it has been picked up yet.

Until it has, a Meesho round lands on the Meesho home page instead, and opening
that is usually what teaches it — so the round after that goes to the right place.

The three address boxes are an override for the rare case where a round is landing
somewhere wrong. Anything that is not a secure address on that portal's own site is
dropped rather than saved, so a mistyped or wrongly pasted link can never send a
round off to another website.

**Do one round now** runs a round immediately so you can watch it work rather than
waiting to find out. Underneath, **What the last rounds did** lists what each round
actually clicked.

### What it will not do

- **It will press the portal's own Log in button once**, because browsers usually
  have the sign-in saved and that one press walks straight through. It never types
  a password, never fills a box, and never touches your saved passwords. If the
  portal wants something typed, that is yours to do.
- **If it cannot get in, the portal is paused, not dropped.** The tab is left open
  with a line across the bottom asking you to sign in, and the round carries on to
  the next portal. **Sign in in that tab and it picks up by itself** — it finishes
  that portal's round there and then, and the next round treats it normally again.
  Later rounds skip that portal while it is still waiting, so sign-in tabs never
  pile up.
- **It does not work when your browser is closed.** It is a browser extension, not
  a service running somewhere — if the browser is shut, no rounds happen.
- **It does not read your orders.** It reads tab names to find them, and nothing
  else. No order details, no customer information, nothing about your account.
- **It does not accept, cancel, or change anything.** All it does is look.
- **It never touches a tab you opened.** Before it clicks anything it checks that
  the tab it is in is one the extension opened for a round. On your own tabs the
  answer is no and it does nothing for the life of that page.

### One thing to think about before you switch it on

The platforms count how often you open your orders because they are trying to
measure **you** — whether there is somebody paying attention to this shop. If the
extension does that looking for you, the number stops being about you.

Nothing here fakes data, breaks into anything, or hides what it is. It opens your
own portal, with your own login, and clicks your own tabs — the same pages you
would have opened yourself. But a platform looking closely could take the view that
an automatic round is not the same as a seller checking in. It is your shop and
your call; this is written down so you make it knowing where it stands. The same
warning is on the settings page.

### It uses a tab you already have open

Before opening anything, a round looks to see whether that portal is already open
in a tab of yours. If it is, it uses that one — a tab you already have is already
signed in, which a brand new one may not be, and it is one fewer tab on your
screen.

- **Nothing is ever closed.** Your tab is put back on the page it was on, and a tab
  the extension opened is left on your orders page — so the next round finds it
  already open and already signed in, and there is no login to get past again. One
  tab per portal, and no more than that.
- **If you are looking at that portal right now, the round skips it.** Working in a
  page you are reading would take it out from under you — and there is nothing to
  prove anyway, since being on it is the very thing a check-in stands in for.
- The list of rounds says which ones used your own tab.

### One page load, one attempt

A round does not reload a tab to try again. If a portal bounces it somewhere else
on the way in, that is the end of that portal for that round — it is picked up
again at the next one, in the tab that was left open.

### If a round stops early

The list at the bottom of the settings page will say something like:

```
stopped: could not find "Ready to Ship" on the page
            page: Orders · Meesho Supplier  —  supplier.meesho.com/panel/orders
```

That means the tab is called something else now — portals rename things. The
second line names the page it was actually looking at, which is what tells you
whether the word is wrong or whether the portal put a different page in front of
it. The words it looks for are a short list in the extension, and correcting them
is a small change. Report what it said and it gets fixed.

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
- It asks the browser for three things: `storage`, to remember the items above
  between page loads; `downloads`, used only to file a shipping label into your
  Downloads folder in the seconds after you press Print Labels — files you
  download yourself are never touched, renamed, moved, or read; and `alarms`,
  which holds the time the next portal check-in is due and nothing else.

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
