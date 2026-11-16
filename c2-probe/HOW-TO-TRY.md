# Kartaan Click TEST - C2-0 label probe: how to try it (plain words)

What it is: a separate TEST copy of Click. It only WATCHES. It clicks nothing on your Flipkart panel, accepts nothing,
prints nothing. It never leaves your computer. It answers one question: can Click read the label PDF that Flipkart
makes when YOU press Print Labels?

## Before you start (once)
1. Chrome, open `chrome://extensions`, switch **Developer mode** on (top right).
2. **Switch the real Kartaan Click OFF** for this try (its toggle), so the two do not both file the label.
3. Press **Load unpacked** and pick the folder `D:\Click-r487\c2-probe` (Control will say if the folder has moved).
   You should see "Kartaan Click TEST - C2-0 label probe" with Click's icon and a red band with a T. No red "Errors" button.
4. Pin it (puzzle icon, pin) so the icon sits next to the address bar.

## The try (about 3 minutes)
1. Open Flipkart seller panel, **Orders, To Pack, Pending Label** (the page where each order has Print Labels).
2. Click the test icon. Press **Arm on this tab**. The icon shows a red **ON**. (It stays armed 10 minutes.)
3. On **ONE order only**, press **Print Labels yourself**, the way you always do.
4. Click the test icon again and read the box. What you should see:
   - `GOT A PDF, ... bytes, label for order OD..., via the blob watcher` and the icon says a green **PDF**. This is the good answer.
   - or `The page used a normal address, not a blob: https://...` (icon says **URL**) - also useful: the label is a normal address. This test copy does NOT fetch it (that could repeat Flipkart's own request on your account); tell Control and the next try is planned.
   - or only lines like `Chrome started a download: address type "blob"` and `A file was built...not a PDF` - the label was not caught. Do not press anything else; tell Control what the box says (take a screenshot).
5. A copy of the PDF is also put in `Downloads\Kartaan Click Labels` (named probe-C2-0-...). Flipkart's own download still happens as usual.
6. When done: press **Disarm**, then switch the TEST copy OFF in `chrome://extensions` and the real Click back ON.

## If something looks wrong
Press Disarm. Nothing else was changed anywhere. Screenshot the box and send it to Control.
