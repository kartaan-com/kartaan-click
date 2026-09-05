# Privacy Policy — Kartaan Click

Last updated: 4 September 2026

**Nothing you do is sent anywhere. There is no server to send it to.**

- It does not collect, store, or transmit personal information.
- A few things are remembered inside your own browser so the tools work at all —
  your settings, a short list of what the last few rounds did, the SKUs you ticked
  and what was accepted for you, and the Meesho account code Meesho itself puts in
  your address bar. Every one of them is listed below. None of them leaves your
  computer, and you can clear them.
- There is no backend, no analytics, no telemetry, and no tracking of any kind.
- It has no accounts and no login.
- It does not read your browsing history or your activity on any other site.

Everything it saves stays inside your own browser, on your own computer, and never
leaves it.

## The one time it contacts a server

Once a day, the extension reads a single small file at
`https://kartaan.com/kartaan-click/version.json` to find out whether a newer
version has been released, so it can tell you. That is the only network request it
ever makes.

It is a plain read of a public file. **Nothing about you is sent** — not your
identity, not what you were doing, not which sites you visit, not the contents of
any page. As with visiting any website, kartaan.com sees the request arrive, which
unavoidably means your IP address, and nothing is recorded against it.

If the check fails — you are offline, or the file is missing — nothing happens and
the extension carries on exactly as normal.

## What it actually does

The extension runs on the sites listed below and nowhere else.

### 1. The VMS packing screen — `https://*.synlabs.io/*`

On the VMS operator screen it watches the Record/Stop button's visible text. When a
recording stops, it clears the AWB text box on that page and puts the cursor in it.

The AWB number is read only to check whether the box is empty. It is never stored,
copied, or sent anywhere. It exists only in the page you are already looking at.

### 2. Flipkart Active Orders — `https://seller.flipkart.com/*`

On the Active Orders page it shows a small panel that will work through the order
list one order at a time — marking orders ready to dispatch, printing shipping
labels, or accepting orders — because Flipkart's own bulk buttons do not work.

Nothing happens until you press Start. It reads the order rows on screen to find
the buttons to press and to list your SKUs so you can choose which ones to work on.
That order information is only ever used on the page it came from and inside your
own browser. It is never sent anywhere.

On every other page of seller.flipkart.com the panel does not appear and the
extension does nothing.

### 3. Portal check-ins — `supplier.meesho.com` and `sellercentral.amazon.in`

**Off unless you switch it on**, from the extension's own settings page.

When it is on, the extension opens your seller portal every so often — behind
whatever you are doing — clicks through your order tabs the way you would, and
leaves the tab open. Flipkart, Meesho and Amazon each judge a seller partly on how
often they are actually on the portal looking at their orders, and this does that
round for you. You choose the hours, how far apart the rounds are, and which
portals are included.

It clicks tabs and reads their names to find them. **It reads no order details, no
customer information and nothing about your account, and nothing from those pages
ever leaves your computer.**

If the portal shows a sign-in page, the round presses that page's own **Log in**
button once — browsers usually have the sign-in saved and that press walks straight
through. **It never types a password, never fills in a box, and never touches your
saved passwords.** And it does not press even that button if there is anywhere on
the page to type a password, a phone number or a code: a page asking for any of
those is yours, not ours, and pressing Send or Log in on one would put your saved
details in — which is not what a promise about your passwords should mean. In that
case it says so on the page, leaves the tab for you, and moves on to the next
portal.

Two things are written down, both in your own browser and neither sent anywhere: a
short list of what the last few rounds clicked, which you can clear at any time,
and — on Meesho only — the account code that Meesho itself puts in the address of
your orders page. That code is read from the address bar when you are on your own
Meesho panel, and is used for one thing: building the address a round opens, so you
are never asked to find and paste it yourself.

### 4. Accepting orders — `seller.flipkart.com` and `supplier.meesho.com`

**Off unless you switch it on**, from the extension's own settings page — and even
switched on it accepts nothing until you have separately ticked the SKUs you are
willing to have accepted.

When it is on, at the end of a check-in round the extension works down the list of
orders waiting to be accepted on your Flipkart To Accept tab or your Meesho Pending
tab and presses **Accept** on the ones that pass rules you set: the SKU is one you
ticked, the order is due within the number of days you chose, and you have not
already reached the daily number you set for that SKU.

To do that it reads, from the order rows on those two pages only: **the SKU code
and the dispatch-by date**. On Flipkart the date is read from the group heading
above the list; on Meesho it is read from the Dispatch Date column. It does not
read customer names, addresses, phone numbers, order values or payment details, and
**nothing from those pages leaves your computer** — there is nowhere for it to go.

It presses **Accept** and nothing else. It does not press Cancel, and it does not
press a button inside any box that was already open on the page when it clicked.
If a confirmation box appears because of its own click, it presses only a button
whose whole label is one of a short fixed list; anything else and it presses
nothing at all, writes down the exact words that were on the box, and stops.

Four more things are written down, all in your own browser and none of them sent
anywhere: which SKUs you ticked, the daily number you set against each, how many of
each SKU have been accepted so far today, and a list of the orders it accepted.
You can clear the list from the settings page at any time.

Two smaller things are also written to the panel's own troubleshooting log on your
computer, and are worth naming rather than glossing over: if a box comes up that it
does not recognise, the words on that box are written down so you can see what it
refused to press; and a run you start by hand from the Flipkart panel logs the first
60 characters of the order row it is working on, which on that tab includes the
Order ID, so that a run which stalls can be traced to the order it stalled on. A run
started by a check-in round logs only the SKU and the number of orders. Both logs
stay on your computer and can be cleared.

## Permissions

Here is exactly what each of the things it asks for is used for.

| Permission | What it is used for |
|---|---|
| `storage` | Remembering things between page loads on your own computer: whether a run is in progress and how far it has got, which SKUs you ticked and the daily number you set against each, how many of each SKU have been accepted today, the list of orders that were accepted, where you dragged the panel, and the panel's log. This is your browser's own storage. Nothing in it is sent anywhere. |
| `downloads` | Saving Flipkart shipping labels. When you print labels, the extension files each one into a **Kartaan Click Labels** folder inside your normal Downloads folder, and reports back whether it saved. |
| `alarms` | Knowing when the next portal check-in is due. A browser alarm is the only timer that survives the extension being put to sleep, which browsers do within about half a minute of it doing nothing. It holds one time and nothing else. |
| access to `seller.flipkart.com`, `supplier.meesho.com`, `sellercentral.amazon.in` | Two things, both about your own seller portals: running the tools described above on those pages, and — before a check-in opens a new tab — asking the browser whether you already have that portal open, so it can use your tab instead of adding another. Tabs on any other site are never looked at. |
| access to `kartaan.com` | Reading the version file described above, once a day, so the extension can tell you when a new version is out. It is used for nothing else, and no other website is contacted. |

The `downloads` permission is used **only** in the seconds after you press Print
Labels, and only for the label file itself. Downloads you start yourself are never
touched, renamed, moved, cancelled, or read.

Access to `supplier.meesho.com` and `sellercentral.amazon.in` is used for the
portal check-in described above. On a page that is not part of a round the
extension does nothing at all, with one exception worth naming plainly: on any
Meesho panel page it reads the account code out of your address bar, whether or not
check-ins are switched on. That is so a round can find your orders page without
ever asking you for the code. It is the same code Meesho shows you in your own
address bar, it is kept in your browser, and it is sent nowhere.

A check-in also borrows a portal tab you already have open rather than adding a new
one, and if you are looking at that portal at the time it is left alone completely.
Nothing is ever closed: your own tab is put back on the page it was on, and a tab
the extension opened is left on your orders page so the next round can use it
instead of opening another.

The extension cannot save files anywhere outside your Downloads folder — browsers
do not allow that — and it cannot see or change your browser's own download
settings.

## Contact

Questions: [kartaan.com](https://kartaan.com)
