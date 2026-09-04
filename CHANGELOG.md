# What changed, and when

Newest first. Every released version has an entry here — the repository refuses a
change whose version is not listed.

## 1.4.9 — 4 September 2026

- **Closes a pop-up whose close button is only a picture.** Meesho's promotion box
  — "Update Now!", with a Participate Now button — has a cross in its corner that
  is a drawing with no text, no label and no helpful name in the markup, so
  nothing could find it and the round sat behind it. Three more ways of finding
  the way out, tried in order: a close named in the markup (`close-icon`,
  `modal-close`), then a small, wordless, clickable thing tucked into the pop-up's
  top-right corner, which is a close button and is not anything else.
  - It must have **no words of its own**, so a real button like "Participate Now"
    can never be mistaken for it, and it is only ever looked for inside a box
    already judged to be a pop-up.
- **The "please sign in" message stays put.** Portals redraw the whole page after
  a sign-in step, which was throwing the message away along with everything else —
  so the one thing asking you to do something was the thing that vanished. It is
  now put back for the next half minute.

## 1.4.8 — 4 September 2026

- **A portal tab is left open when the round finishes.** Closing it meant the next
  round started from nothing again — the front door, the sign-in, the whole wall.
  Left open, the next round finds it and is already through. One tab per portal,
  sitting there signed in, and no login to get past again.
  - A tab that was yours to begin with is still put back on the page it was on.
    One the extension opened stays on the orders page, which is where the next
    round wants it anyway.
- **Pop-ups that do not announce themselves are now closed too.** Meesho's in
  particular are plain boxes floated over the page with none of the usual
  markings, and one of those over the order tabs stops a round dead. Anything
  *behaving* like a pop-up — lifted off the page, stacked above it, big enough to
  be in the way — is now looked at as well.
  - **This widens where it looks, not what it presses.** It is still only a close
    control, a bare cross, or one of the short list of words that can only mean
    "go away". Never Cancel, never Continue, never anything beginning with Accept.
  - If a box is plainly there but has no way out that can be found, it presses
    Escape — which closes most of them, and on a page with nothing open does
    nothing at all.

## 1.4.7 — 4 September 2026

- **A round uses a portal tab you already have open, instead of opening another
  one.** A brand new tab starts from nothing, which on Meesho means the shop
  window and a sign-in — the thing that had stopped every Meesho round. A tab you
  already have open is already signed in and already through the door, so the
  problem goes away rather than being worked around. It is also one fewer tab.
  - Your tab is **put back on the page it was on** when the round finishes, and it
    is never closed. Only a tab the extension opened itself gets closed.
  - **If you are looking at that portal right now, the round skips it.** Working in
    a page somebody is reading would take it out from under them — and there is
    nothing to prove anyway, since being on it is the very thing a check-in stands
    in for.
  - The list of rounds says which ones used your own tab.
- The three seller portals are now listed as sites the extension may ask the
  browser about, which is what lets it find an already-open tab. It is used for
  that and nothing else; tabs on any other site are never looked at.

## 1.4.6 — 4 September 2026

- **Meesho: being on the shop window is not being signed in.** `supplier.meesho.com`
  on its own is Meesho's advert for sellers, not your panel — no password box, no
  "sign in" anywhere, and no way through. Two rounds were spent hunting for an
  order tab on it. A round now knows that being signed in to Meesho means being
  somewhere under `/panel/`, and treats anything else as needing you: it presses
  Meesho's own Log in button, and if that does not work it leaves the tab asking
  you to sign in and picks up the moment you do.

## 1.4.5 — 4 September 2026

- **A sign-in page pauses a portal now, it does not drop it.** Three changes, all
  from watching a real round:
  - The round presses the portal's own **Log in** button once. Browsers usually
    have the sign-in saved and that press walks straight through. It never types a
    password, never fills a box, and never touches saved passwords.
  - If that does not get in, the tab is left open asking you to sign in — and
    **when you do, it picks up by itself in that tab** and finishes that portal's
    round there. You do not have to do anything else, and the portal is back to
    normal from the next round.
  - The other portals are checked as usual meanwhile, as before.
- **Meesho finds your account from any panel page, not just the orders one.** A
  round that landed on the panel home was reading nothing and going back to the
  front door next time. The code is in the address of every panel page and is now
  read from all of them.

## 1.4.4 — 4 September 2026

- **A round closes pop-ups that are in the way.** A "what's new" card or a cookie
  strip sitting over the order tabs was enough to stop a round. It now closes them
  first, and again if one appears while it is waiting.
  - Deliberately timid, and it stays that way: it only presses something that is
    both inside a box the page itself calls a dialog and says one of a short list
    of words that can only mean "go away" — Got it, OK, Close, Dismiss, No thanks,
    Not now, Skip. Never Cancel, never Continue, never Accept.
  - The settings page lists what it closed, so it is never doing this invisibly.
- **Fixed Meesho never answering.** A round tab was allowed exactly one page load,
  but Meesho's front door redirects into the panel — so the first attempt was
  carried off mid-sentence and the second was refused, and nothing ever reported
  back. A redirect chain now gets three hops, which is enough for a real way in and
  still short enough that a reload loop gets nowhere.
- The release rules now read every shipped script the way the browser will. A
  broken line got past every other rule while building this version — the package
  was well formed and the documents all matched, and the extension would simply
  have refused to load.

## 1.4.3 — 4 September 2026

- **Meesho now sorts itself out.** You no longer paste anything. The code Meesho
  puts in your orders page address belongs to your own account, and it is simply
  read from the address bar the first time you are on your Meesho panel and
  remembered. Rounds then go straight to your orders page.
- Until that has happened a Meesho round lands on the Meesho home page — and
  opening that is usually what teaches it, so the next round is right. The settings
  page says which of the two you are in.
- The address boxes are still there as an override, but you should not need them.
  Nothing about your account is sent anywhere; the code is kept in this browser
  only, and is used for nothing but building the address a round opens.

## 1.4.2 — 4 September 2026

- **A round now opens your orders page directly** instead of the portal's front
  door and clicking its way in. One less thing to get wrong, and it is what a
  person does when they have the page bookmarked.
- **You can set your own orders page address for each portal**, on the settings
  page. **Meesho has to be filled in:** its orders address contains a code
  belonging to your own account, so there is no address that works for everybody —
  open your orders page and copy what is in the address bar. Flipkart and Amazon
  have working built-in addresses and can be left empty.
- An address is only kept if it is a secure address on that portal's own site.
  Anything else is dropped rather than saved, so a round can never be sent off to
  another website by a typo or a link pasted from somewhere else.
- The click lists are shorter to match, because the first tab is now already open
  when the round starts: Flipkart is To Pack then back to To Accept, Meesho is On
  Hold, Pending, Ready to Ship, and Amazon is Pending then Unshipped.

## 1.4.1 — 4 September 2026

Fixes to portal check-ins, from the first real round on live portals.

- **One page load, one attempt.** These portals redirect on the way in — to a
  sign-in page, to a marketplace picker — and every redirect was starting the
  round again from nothing in the same tab. On Amazon that looked like the page
  reloading over and over. Permission to act is now handed out once per tab.
- **A portal that needs signing in is left alone, and says so.** Instead of being
  closed, its tab stays open with a line across the bottom asking you to sign in,
  and the round carries straight on to the next portal. The next round skips that
  portal while its tab is still open, so sign-in tabs cannot stack up all day —
  close the tab once you have signed in and it resumes.
- **Longer wait for the first thing on the page** — 30 seconds rather than 12.
  These are big portals and a cold start is not quick; the round was giving up
  before Flipkart had finished starting.
- **The log now names the page the round was actually looking at** when a step
  fails, so a wrong tab name can be told apart from a portal showing something
  else entirely.
- A round now stops the moment a page turns into a sign-in page, rather than
  waiting out the full timeout on a page that will never show an order tab.

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
