# Edge Add-ons submission — what to paste where

Everything below is ready to copy into Partner Center. Nothing here needs changing
unless you want to reword it.

## Before you start

1. Register (free) at <https://partner.microsoft.com/dashboard/registration/> using
   your Microsoft account, and choose the **Microsoft Edge** program.
   There is no fee for Edge — unlike Chrome, which charges $5.
2. Build the upload file: zip the **contents** of this folder (not the folder
   itself), so `manifest.json` sits at the top level of the zip.

## Listing fields

**Name**
Kartaan Seller Assist

**Short description** (under 132 characters)
Free workflow fixes for seller and warehouse tools. On the VMS packing screen, the AWB box clears itself when you stop.

**Description**
Kartaan Seller Assist removes small, repetitive clicks from the tools that seller and warehouse teams use all day. It is free, from Kartaan.

What it does today — VMS packing screen, auto-clear AWB:

On the SynLabs VMS operator screen, scanning an AWB starts the recording on its own. But stopping it leaves the old number sitting in the box. So between every two parcels you have to click Stop, wipe out the old AWB by hand, and click the box again before the scanner will type into it.

This extension does those last two steps for you. Click Stop, and the box empties itself and takes the cursor — the next parcel scans straight in. Over a shift, that is hundreds of clicks you no longer make.

It never clicks anything for you and never touches the recording itself. It waits for the page's own Stop to finish before clearing, so the AWB is always read before it disappears.

Privacy: it collects nothing, sends nothing, and contacts no server. No accounts, no tracking, no analytics. It runs only on synlabs.io, and on any page there without an AWB box it does nothing at all.

More free tools are on the way. Learn more at kartaan.com

**Category**
Productivity

**Privacy policy URL**
https://github.com/Jaiswalmagic1/kartaan-seller-assist/blob/main/PRIVACY.md

**Website**
https://kartaan.com

**Support / contact**
https://github.com/Jaiswalmagic1/kartaan-seller-assist/issues

**Search terms**
vms, packing, awb, warehouse, barcode scanner, seller tools

## Questions the review asks

**Does your extension use remote code?**
No. All code is in the package.

**Why do you need the permissions you request?**
The extension requests no browser permissions. It declares one site,
`https://*.synlabs.io/*`, which is required for its content script to run on the
VMS screen. Nothing else is accessed.

**Is any user data collected?**
No.

**Testing instructions for the reviewer**
The extension is only active on a SynLabs VMS operator screen, which requires an
operator login the reviewer will not have. Its behaviour can be confirmed from the
source: `content/vms-awb.js` is 90 lines, has no network calls of any kind, and
only reads and clears the text box with id `awbInput` on that page.

## Screenshots

Edge asks for at least one, 1280x800 or 640x480. Use a shot of the VMS packing
screen with the extension popup open. Blur any real AWB numbers first.
