// The pop-up is only the Copy product details button; everything else is in the panel (panel.html).
//
// Copy product details stays here because it needs the toolbar press: pressing the icon on the product page
// gives Click (activeTab) that one page, for this one press, and a panel tab can never be given that.

'use strict';

// ── copy product details: only the page in front, only when this is pressed ──
// activeTab gives access to the current tab for this one press and no longer.
const copyBtn = document.getElementById('copyDetails');
const copyMsg = document.getElementById('copyMsg');

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  return ok;
}

copyBtn.addEventListener('click', async () => {
  copyMsg.textContent = 'Reading the page…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https:\/\/(www\.)?(amazon\.in|meesho\.com|flipkart\.com)\//i.test(tab.url || '')) {
      copyMsg.textContent = 'Open a product page on Amazon.in, Meesho or Flipkart first, then press this again.';
      return;
    }
    const [run] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/product-reader.js'] });
    const r = run && run.result;
    if (!r || !r.ok) {
      copyMsg.textContent = !r ? 'Could not read this page.'
        : r.reason === 'blocked' ? 'This page is showing a robot check. Finish it yourself, then press this again.'
        : r.reason === 'no-product' ? 'This page does not show a product. Open one product page and try again.'
        : 'Open a product page on Amazon.in, Meesho or Flipkart first.';
      return;
    }
    copyMsg.textContent = (await copyText(r.text))
      ? 'Copied, now paste it into your chat.'
      : 'Could not copy. Try pressing the button again.';
  } catch (e) {
    copyMsg.textContent = 'Could not read this page.';
  }
});
