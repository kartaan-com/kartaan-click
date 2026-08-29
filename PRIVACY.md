# Privacy Policy — Kartaan Click

Last updated: 29 August 2026

**This extension collects no data whatsoever.**

- It does not collect, store, or transmit personal information.
- It does not contact any server. There is no backend, no analytics, no telemetry.
- It has no accounts and no login.
- It does not read your browsing history or your activity on any other site.

Everything it saves stays inside your own browser, on your own computer, and never
leaves it.

## What it actually does

The extension runs on two sites and nowhere else.

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

## Permissions

The extension asks for two browser permissions. Here is exactly what each is for.

| Permission | What it is used for |
|---|---|
| `storage` | Remembering things between page loads on your own computer: whether a run is in progress and how far it has got, which SKUs you ticked, where you dragged the panel, and the panel's log. This is your browser's own storage. Nothing in it is sent anywhere. |
| `downloads` | Saving Flipkart shipping labels. When you print labels, the extension files each one into a **Kartaan Click Labels** folder inside your normal Downloads folder, and reports back whether it saved. |

The `downloads` permission is used **only** in the seconds after you press Print
Labels, and only for the label file itself. Downloads you start yourself are never
touched, renamed, moved, cancelled, or read.

The extension cannot save files anywhere outside your Downloads folder — browsers
do not allow that — and it cannot see or change your browser's own download
settings.

## Contact

Questions: [kartaan.com](https://kartaan.com)
