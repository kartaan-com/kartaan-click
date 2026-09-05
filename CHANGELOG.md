# What changed, and when

Newest first. Every released version has an entry here — the repository refuses a
change whose version is not listed.

## 1.5.3 — 5 September 2026

A third independent review. It confirmed the by-hand Flipkart tool — the Start
button, Mark RTD, Print Labels, Accept — is untouched by all of this, checked hunk
by hunk against the last released version. The rest was fifteen findings, none of
them a crash and none on the by-hand path. Nothing was ever pushed or released.

**The pattern this time**, and it is worth naming: three fixes were made in the
engine and not in the switch beside it.

- **A cap of 0 was honoured by the rules and thrown away by the panel.** Setting a
  SKU to "none today" worked — until you pressed Scan SKUs again, when the box came
  back blank, and blank means "no limit". So the number that stops a SKU quietly set
  it free the next day. The panel now shows a 0 as a 0.
- **The new heading cross-check switched itself off** whenever the "To Accept" count
  could not be read — which is exactly the case it exists for. No count, no run.
- **The "a run nobody picked up is not a run" rule reached Meesho and not Flipkart**,
  so a Flipkart run that never got going still stopped that portal being checked in
  on, round after round.

**And the rest**

- **It now stops rather than waits when you come to the tab it is working in.** The
  previous version held still until you left — with no time limit, while telling the
  worker it was still alive, which stopped that portal being checked in on for as
  long as the tab stayed on screen. And unticking the setting during one of those
  holds did nothing. Stopping frees everything at once, and the next round picks the
  work up when you have moved on.
- A group heading count that disagrees with the tab's own total is now looked at
  twice before the run is stopped — both numbers drop as orders are accepted and
  Flipkart updates them separately, so a single glance can catch the page
  mid-redraw and stop a perfectly healthy run.
- If opening a row fails, what it opened is now closed again. Otherwise the next
  attempt saw two open rows, refused, and five refusals in a row ended the run over
  one transient miss.
- The round list says why nothing happened again after six hours, rather than once
  in the life of the install — switch a portal off months later and you would have
  had no line at all, in the very list you are told to look at.
- A run announced on a tab that was already open is now picked up straight away
  instead of waiting for something to reload the page.
- The store listing and the privacy policy now match the manual on what it presses
  and how far ahead it will go, and the 1.5.0 entry below has been marked where it
  described what that version was meant to do rather than what it did.

## 1.5.2 — 5 September 2026

A second independent review of 1.5.1. It confirmed the four serious faults from the
first review were properly fixed, and then found **twenty more** — including one
that would have broken every run on Flipkart, by-hand ones included. Neither 1.5.0
nor 1.5.1 was ever pushed or released.

**The one that broke everything**

- A stray word — a timer declared inside the wrong pair of brackets — meant the
  tidy-up at the end of every Flipkart run threw an error instead of running. The
  panel would have stopped on its last line, no "finished" would ever have been
  written, and a timer would have been left ticking. Found by reading, reproduced,
  fixed. **The by-hand Start button was affected too**, which is the part that has
  been in daily use for months.

**Three more that could have accepted the wrong orders**

- **It could take a row it had not decided on.** When only one row's panel was open
  it was used without checking whose row it was — and a panel left open by a failed
  attempt a moment earlier is still on screen. Most rows read "1 Order", so the
  count check could not tell them apart. A round now proves the row is the one it
  decided on, and takes nothing if two panels are open.
- **A group heading it did not recognise was invisible to it.** The date check only
  understood two wordings; anything else — "Non-Breached Orders (30)", for one —
  was not checked at all, and the tab was declared safe on the strength of the
  headings it could see. The headings' counts now have to add up to the number on
  the tab itself, so a group it cannot read stops the run.
- **Typing 0 against a SKU meant "no limit" instead of "none".** The one number
  somebody would type to stop a SKU for the day was the number that set it free.
  0 now means none; only a blank box removes a limit.

**And the rest**

- Closing a stray tab used to disable the by-hand Start button for good, and the
  message it showed told you to do the one thing that guaranteed it stayed stuck.
  Start now clears a run that has stopped moving, and says to press Stop.
- **It now holds still if you switch to the tab it is working in**, which is what
  the manual has been promising. It was only refusing to *start* in a tab you were
  reading.
- The per-run ceiling is checked before a press rather than after, so "never more
  than 20 in one go" is true even when a row covers twelve orders.
- A run that is announced but never actually picked up no longer counts as running
  — that had been quietly stopping the check-in round for that portal, over and
  over, and the check-in is the thing that notices you have been signed out.
- The reason nothing happened is written to the settings page **once**, not every
  twenty minutes, so it no longer pushes the check-in history out of the list.
- A hang while starting a run can no longer take the check-in timer down with it.
- The order count is read from the front of the row, where Flipkart puts it —
  a SKU named something like "MY-100 Orders-Pack" used to stop the run every time.
- Flipkart's confirmation step now notes what was on screen *before* it presses,
  not after, so a box that appears quickly is still answered.
- A missing or nonsensical order count is refused outright instead of being read as
  "one". "No longer breached" no longer reads as breached. A portal tab left open
  in a minimised window no longer blocks accepting for ever.
- README, the manual and the store listing corrected again: what one Flipkart press
  actually takes, the two ceilings, that orders you accept by hand are not counted
  against your limits, and that it opens rows and pages as well as pressing Accept.

## 1.5.1 — 5 September 2026

Everything an independent review found in 1.5.0, fixed. That review was asked to
be adversarial and it was: **four of its findings could have accepted orders that
were never agreed to.** 1.5.0 was never pushed or released, so nothing reached
anybody — but it is written down here because the same mistakes are easy to make
again.

**The four that could have accepted the wrong orders**

- **A Flipkart row is a GROUP, and one press took all of it.** The button says
  "Accept All 12 Order(s)" and the code counted that as one order. A daily limit of
  five could have taken twenty-one. Everything is now counted in orders, never
  presses: a row that would take more than the remaining allowance is left alone
  entirely, and just before pressing, the number on the button is checked against
  the number that was counted — if they differ, nothing is pressed.
- **It could have worked a group of orders it had been told to skip.** Flipkart puts
  the dispatch date on the group heading, and the old version pressed the heading it
  wanted and carried on — but nothing on the page reliably says which heading is
  live, and pressing the one already showing can switch the filter off and show
  everything. So the question is no longer asked: if every heading on the tab is due
  soon enough, it works the tab; if even one is too far out, it accepts nothing there
  and says which heading stopped it.
- **Meesho's confirmation step could have pressed the next order's Accept.** Every
  order row's button reads exactly "Accept", so accepting that word as a
  confirmation could not tell one from the other — and a re-drawn order list looked
  like a freshly opened box. "Accept" is off that list, and only a box that declares
  itself a dialog counts.
- **Meesho started a run in every open Pending tab at once**, including one being
  read. Two runs, one shared count, each losing the other's tally — which made the
  per-SKU limit exceedable just by having two tabs open. A run now only acts in the
  tab it was actually started in, and it will not start at all while that portal is
  open in front of you.

**Two ways the date reader said "already late", which means accept**

- The words **"Non-Breached Orders"** contain "breached", and that was enough.
- A **December date read in January** was corrected into last year's and came back
  as 36 days overdue, when it was 329 days away. The correction that did that has
  been removed: when the two readings of a bare date disagree, it now says nothing.

**And the rest**

- The off switch now works on a run already going — it is checked before every
  order — and the Meesho panel has a **Stop** button, which the manual had been
  promising it had.
- A new **daily ceiling per portal**, because a per-run limit is not a limit when
  rounds happen every 20 to 60 minutes. Counts every order accepted since the
  morning, including SKUs with no limit of their own.
- **Saving ticks no longer deletes limits it cannot see.** A SKU that had sold out
  for the day vanished from the list, and re-saving removed its limit — which reads
  as "no limit", not "nothing left". Only the SKUs on screen are changed now, and
  the cap boxes have been taken off the Print Labels tab, where saving them wiped
  the accept limits entirely.
- Flipkart's confirmation step now ignores boxes that were already open, the same
  way Meesho's does, and no longer treats "OK" or "Continue" as an accept.
- When a round cannot find the exact row it decided on, it takes nothing rather than
  the first one it can see.
- The "still alive" signal now beats on its own timer rather than once per order, so
  a genuinely slow run in a background tab is no longer mistaken for a dead one and
  cleared — which would have started a second run on the same orders.
- The settings page now shows the accept lines properly instead of "— nothing", and
  says plainly when nothing happened because the feature, the portal, or the SKU
  ticks were not set.
- Meesho's table reader copes with merged cells, refuses a card holding several
  orders behind one button, and stops if the date column does not line up with the
  rows.
- The manual, the privacy policy and the store listing were corrected where they
  described the code as safer than it was.

## 1.5.0 — 4 September 2026

**A new tool, and the first one that commits you to anything.** Everything before
this only ever rearranged your own screen. This one presses **Accept** on real
orders, which is a promise to dispatch them by a date — so it is built the opposite
way round to the rest: it assumes the answer is no, and it has to be told yes three
separate times before it touches anything.

- **Accepting orders on its own, on Flipkart and Meesho.** At the end of each
  portal check-in round, it works down the orders waiting to be accepted and
  presses Accept on the ones that pass rules you set. Off out of the box, and still
  doing nothing once switched on until you have ticked the SKUs you are happy for
  it to take on. Amazon is deliberately not in this — its orders move on by
  themselves once payment clears, and that is being looked at properly before
  anything is promised.
- **Two filters, both yours.** By **SKU** — tick the ones it may accept on the
  portal's own orders page, using the same list the Flipkart panel has always used.
  And by **when they are due** — accept what is due today, or today and tomorrow, or
  any number of days out, and choose separately whether orders already past their
  date are included. If today is the 4th and an order is due the 9th, it is left
  alone.
- **A daily number per SKU.** Beside each SKU you can put the most of it you are
  willing to take on in a day, because the real reason to cap anything is stock.
  Blank means no limit. The count starts again each morning.
- **If it cannot read a date, it does not accept the order.** Always, with no
  exception. On Flipkart the dispatch date is only ever on the group heading
  ("Dispatch by 12 PM, Tomorrow"), so a To Accept tab with no headings has nothing
  accepted on it at all. On Meesho the date is on each row, in a column found by its
  heading name rather than by counting across — if Meesho renames it, the run stops
  and says which one went missing.
- **It presses Accept and nothing else.** Not Cancel, and nothing inside a box that
  was already open when it clicked. If a confirmation box comes up because of its
  own click, it presses only a button whose whole label is one of a short fixed
  list — otherwise it presses nothing, writes down the box's exact words, and stops.
  *(Two of the claims in this 1.5.0 entry were not actually true of 1.5.0: the
  "already open" check did not exist on Flipkart, and "Accept" was on the
  confirmation list, where it could not be told apart from an order's own button.
  Both were fixed in 1.5.1 and 1.5.2. 1.5.0 was never pushed or released.)*
- **A new list on the settings page: what it accepted for you.** Every order,
  newest first, with its SKU and when it was due. That is the list to read after a
  day away.
- **The Flipkart panel gains a Save ticks button** and a small box beside each SKU
  for its daily number. Pressing **Start** by hand behaves exactly as it always has:
  none of the new rules apply to a run you are sitting and watching, and "nothing
  ticked" still means "work through all of them" there. For accepting on its own it
  means the opposite — nothing ticked, nothing accepted — and the panel says so on
  screen, because a list nobody has filled in is not permission.
- **A Meesho panel, on the Pending tab**, for the same job: scan the SKUs, tick
  them, set daily numbers, and ask what a round would do right now. It has no Start
  button on purpose — accepting happens on the round and nowhere else, because one
  way in is easier to keep safe than two.
- **A run that stops moving no longer blocks its portal.** A run whose tab was
  closed under it used to be able to say "running" for ever. Anything that has not
  moved for twenty minutes is now cleared, and the portal is free again.
- Check-in rounds now skip Meesho while a Meesho accept run is going, the same way
  they have always skipped Flipkart during a Flipkart run — two copies clicking the
  same live orders is exactly the thing that guard exists to stop.

## 1.4.14 — 4 September 2026

Found by opening the real Meesho panel and watching a real pop-up, rather than
reading the code and reasoning about it. The pop-up that came up was a credit
offer — *"Your Approved Limit is Expiring"*, with a **Withdraw Now!!** button in
the middle of it. A better test than anything that could have been invented.

- **The close cross was found and then missed by a hair.** Meesho draws that cross
  as a picture inside a box, both exactly 25 pixels square, both sitting in the
  same place, and neither with any words. Both matched, and the search took the
  first one in the page, which is the outer box — while Meesho has put the actual
  close handler on the picture inside it. A press on the box travels outwards, not
  inwards, so the handler never ran: the round found precisely the right spot and
  pressed a hair's breadth behind it, and the pop-up stayed open. Every way of
  finding an icon now takes the innermost one, which is the thing a person's click
  would land on — the same rule the order tabs have always used. Watched again
  afterwards on the same pop-up: it closes.
- **Words that commit you to something are now refused by name.** Nothing could
  have pressed "Withdraw Now!!" — a close button has to be wordless, or a bare
  cross, or an exact "go away" word, and it is none of those. But not one of the
  four rules that kept us off it was a rule that knew the word was dangerous, and
  that is a thin thing to rely on. Withdraw, Apply, Pay, Buy, Subscribe, Upgrade,
  Renew, Recharge, Activate, Participate, Claim, Redeem and Agree now join Accept
  on the list of words this will not press, matched anywhere in the label rather
  than only at the start — the real button began with a pointing-finger picture,
  which a test for what a label starts with would have sailed straight past.

Also confirmed on the live portals, pressing nothing: Meesho's On Hold, Pending
and Ready to Ship all resolve to the real tab buttons with a live order on screen,
and none of them to anything in the orders table.

## 1.4.13 — 4 September 2026

- **The check-in round no longer treats our own Flipkart panel as a pop-up.**
  Watched on the real Flipkart orders page rather than reasoned about: the order
  panel is 340 pixels wide, which on that screen is 19.9% of the window — one
  tenth of one per cent under the line at which a floating box starts counting as
  a pop-up. On any window narrower than about 1700 pixels it would have crossed
  that line, and a round would have started looking for a way to close our own
  panel. Nothing inside it would have been pressed — the minimise button has
  words on it, and the corner rule refuses anything with words — but our own
  furniture has no business being guessed at. It is now excluded by name, the
  same way the sign-in note already was.

## 1.4.12 — 4 September 2026

Everything in this version came out of an independent review of the check-in
feature by someone who had not written any of it. Twenty-six things were raised
and all of them are fixed here. Nothing about what the feature does has changed —
what changed is how carefully it does it, and how honestly it is described.

**The clicking is much less willing to guess.**

- **Pop-ups now have to be box-shaped.** "Lifted off the page and big enough to be
  in the way" also describes the strip across the top of every one of these
  portals and the menu down the side, and both were being treated as pop-ups to
  close. A pop-up now has to be at least a fifth of the window wide *and* an eighth
  of it tall. Page furniture is left alone.
- **The corner rule is fenced in.** Pressing a small wordless thing in a pop-up's
  top-right corner is the least certain thing in here. It must now also not sit
  inside a button that has words, not be inside a link to another page — an advert
  or a cross-sell tile is — and not be named in the page as a menu, a gear, a bell
  or anything else that lives in a corner. Clicks it worked out for itself are
  rationed to three for a whole visit, where the ceiling used to be nine.
- **The list of words it refuses now guards every way it looks**, not just one of
  them. A thing could be refused for its words and then pressed anyway a moment
  later because of its class name or its position.
- **"OK" is no longer pressed.** On a notice it means "go away"; on a question —
  *Cancel this order? Cancel / OK* — it is the answer, and nothing here can tell
  the two apart. Escape is tried instead.
- **"cross" is no longer read as a close button in a class name.** It matched
  cross-sell, cross-border and cross-listing, which on a marketplace are adverts.
- **Escape is not pressed while you are typing.**
- **Order tabs are no longer looked for inside the orders table.** "Pending" is a
  tab and also the status of every second row, and the row was sometimes closer to
  the top of the page.

**Signing in got stricter, not looser.**

- **It will not press a Log in button if there is anywhere on the page to type a
  password, a phone number or a code.** It never typed anything — but pressing a
  form's own button when the browser has already filled it in sends those saved
  details, and that is not what a promise about your passwords should mean.
- **"Continue" is no longer treated as a way in.** On Meesho's shop window it is
  the button beside a phone number box, so pressing it starts sending somebody an
  access code.

**Two ways it could have acted somewhere it should not.**

- **A tab number is not a name.** The list of tabs waiting to be signed in to kept
  raw tab numbers for ever, and browsers hand those numbers out again from the
  bottom each time they start — so a note left over from yesterday could have given
  a round permission to click about in an ordinary tab of yours. The list is now
  emptied when the browser starts, an entry goes the moment its tab is closed, and
  every entry says which portal and when, both of which are checked before it is
  believed.
- **The Flipkart order panel is checked for a second time**, at the last moment
  before a tab is opened, and on the sign-in resume path which had no such check at
  all. Starting a second copy of an order run on live orders is the one thing in
  here that would actually cost money.

**It can no longer stop without saying so.**

- **A round that fails no longer ends check-ins for good.** The next round was only
  set at the end of the last one, so anything going wrong in the middle stopped the
  feature silently — while the settings page went on showing a time for a round
  that was never coming.
- **A second timer now watches the first**, every fifteen minutes, and sets a round
  if none is due.
- **Only one round at a time.** The timer could go off while "Do one round now" was
  still going, and the two rounds shared one set of notes — which is where the
  duplicate tabs and the "the page never answered" lines came from.
- **Rounds are never closer together than ten minutes.** One minute was accepted,
  which is hundreds of automatic visits a day to your own account.
- **An order run that was interrupted no longer blocks Flipkart check-ins for
  ever.** A run whose tab was closed part way says "running" with nothing left to
  clear it.

**The manual and the store listing now say what the code actually does.** Three
documents said the round is inert on any tab you opened yourself. It is not: it
borrows a background tab you already have on that portal, which is the thing that
finally got past Meesho's sign-in, and it acts in a tab left open for you to sign
in to. What is true — and now what is written — is that it never acts in the tab
you are looking at. Five places still said the round closes the tab afterwards,
which stopped being true on 30 August. The privacy policy no longer says the Meesho
account code is only read while check-ins are on, because it is read whenever you
are on your own panel. And the settings page now says plainly that the random gaps
and pauses are there to resemble a person.

**The release rules were checked too, and one of them was for show.** The rule
meant to catch code contacting a server nobody had disclosed only recognised two
ways of writing a request, and would not have caught a single other one — including
a call already in this extension. It now checks every web address written anywhere
in the shipped code against a list, bans the ways of reaching a server this
extension does not use, and requires any request whose destination is not written
out on the spot to carry a note saying where it goes. The manifest description
length the store enforces is now checked here as well.

## 1.4.11 — 4 September 2026

- **Stopped mistaking "login" for your Meesho account code.** Meesho's own sign-in
  route sits in the very place the account code does, so `login` was learned as the
  code and a whole round was sent to the sign-in page because of it. A real code is
  a meaningless little string, so ordinary words are now refused — and refused
  again when one is used, so a wrong one already stored is ignored and puts itself
  right the next time you are on your panel.

## 1.4.10 — 4 September 2026

- **Fixed "Do one round now" appearing to hang with every tab sitting idle.**
  Since tabs are now left open, a round reuses one that is often already on the
  very page it wants — and telling a tab to go where it already is does nothing at
  all. On Flipkart it was worse: the order tab lives after the "#" in the address,
  and changing only that part moves the page without loading it. Either way no
  page load happened, so nothing ever reported back and the round waited out its
  full time on each portal in turn. A reused tab is now reloaded when the address
  leads to the same page.
- **The settings page no longer waits for the whole round.** It gets an answer
  straight away and the list fills in as each portal reports, so there is
  something to watch instead of "Running…" and silence.

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
