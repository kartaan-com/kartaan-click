# Kartaan Seller Assist

Free browser extension that fixes small, repetitive annoyances in the tools sellers
and warehouse teams use all day. Made by [Kartaan](https://kartaan.com) and free for
anyone to use.

## What it does today

**VMS packing screen — the AWB box clears itself.**

On the SynLabs VMS operator screen, scanning an AWB starts the recording on its own.
But stopping it leaves the old number sitting in the box, so between every two
parcels you have to:

1. Click **Stop**
2. Wipe the old AWB out by hand
3. Click the box again before the scanner will type into it

This extension does steps 2 and 3 for you. Click Stop, and the box empties and takes
the cursor — the next parcel scans straight in. Over a shift that is hundreds of
clicks you no longer make.

It never clicks anything for you and never touches the recording itself. It waits
until the page's own Stop has finished before clearing, so the AWB is always read
before it disappears.

## Install

### From the Microsoft Edge Add-ons store

Search for **Kartaan Seller Assist** and click Get. *(Listing pending review — the
manual install below works in the meantime, and in Chrome.)*

### Manually, in Chrome or Edge

1. **[Download the extension](https://github.com/kartaan-com/kartaan-seller-assist/archive/refs/heads/main.zip)** — one click, saves `kartaan-seller-assist-main.zip`
2. Unzip it somewhere you will not delete by accident
3. Open `chrome://extensions` (or `edge://extensions`)
4. Turn on **Developer mode** — top-right in Chrome, bottom-left in Edge
5. Click **Load unpacked** and pick the unzipped folder (the one with `manifest.json` in it)

Reload your VMS tab. Open the browser console (F12) and you should see a line
starting `[Kartaan Seller Assist]` confirming it is active.

## Privacy

It collects nothing, sends nothing, and talks to no server. No accounts, no
tracking, no analytics. It reads one text box on the VMS screen and clears it.
See [PRIVACY.md](PRIVACY.md).

## Which sites it runs on

Only `https://*.synlabs.io/*`. On any page there without an AWB box it does nothing
at all.

## Contributing

Found another repetitive click worth killing? Open an issue with the site and the
steps you repeat.

## Regenerating the icons

`node tools/make-icons.js` — no dependencies, draws the PNGs from scratch.

## Licence

MIT — see [LICENSE](LICENSE).
