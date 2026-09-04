# Privacy Policy — Kartaan Click

Last updated: 4 September 2026

**This extension collects no data whatsoever.**

- It does not collect, store, or transmit personal information.
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
closes the tab again. Flipkart, Meesho and Amazon each judge a seller partly on how
often they are actually on the portal looking at their orders, and this does that
round for you. You choose the hours, how far apart the rounds are, and which
portals are included.

It clicks tabs and reads their names to find them. **It reads no order details, no
customer information and nothing about your account, and nothing from those pages
ever leaves your computer.**

If the portal shows a sign-in page, the round presses that page's own **Log in**
button once — browsers usually have the sign-in saved and that press walks straight
through. **It never types a password, never fills in a box, and never touches your
saved passwords.** If that does not get you in, it says so on the page, leaves the
tab for you, and moves on to the next portal.

Two things are written down, both in your own browser and neither sent anywhere: a
short list of what the last few rounds clicked, which you can clear at any time,
and — on Meesho only — the account code that Meesho itself puts in the address of
your orders page. That code is read from the address bar when you are on your own
Meesho panel, and is used for one thing: building the address a round opens, so you
are never asked to find and paste it yourself.

## Permissions

Here is exactly what each of the things it asks for is used for.

| Permission | What it is used for |
|---|---|
| `storage` | Remembering things between page loads on your own computer: whether a run is in progress and how far it has got, which SKUs you ticked, where you dragged the panel, and the panel's log. This is your browser's own storage. Nothing in it is sent anywhere. |
| `downloads` | Saving Flipkart shipping labels. When you print labels, the extension files each one into a **Kartaan Click Labels** folder inside your normal Downloads folder, and reports back whether it saved. |
| `alarms` | Knowing when the next portal check-in is due. A browser alarm is the only timer that survives the extension being put to sleep, which browsers do within about half a minute of it doing nothing. It holds one time and nothing else. |
| access to `kartaan.com` | Reading the version file described above, once a day, so the extension can tell you when a new version is out. It is used for nothing else, and no other website is contacted. |

The `downloads` permission is used **only** in the seconds after you press Print
Labels, and only for the label file itself. Downloads you start yourself are never
touched, renamed, moved, cancelled, or read.

Access to `supplier.meesho.com` and `sellercentral.amazon.in` is used **only** for
the portal check-in described above, and only while you have it switched on. On any
other page of those sites the extension does nothing at all.

The extension cannot save files anywhere outside your Downloads folder — browsers
do not allow that — and it cannot see or change your browser's own download
settings.

## Contact

Questions: [kartaan.com](https://kartaan.com)
