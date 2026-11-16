// Shows one finished label PDF (number ?i= of the run named by ?k=, kept in session storage) in this tab, so the seller presses Print once.
'use strict';
(async () => {
  const q = new URLSearchParams(location.search), k = q.get('k'), raw = q.get('i'), i = /^\d+$/.test(raw) ? Number(raw) : -1;
  const all = /^kcPrintPdfs_[a-z]+_\d+$/.test(k) ? (await chrome.storage.session.get(k))[k] || [] : [];
  try {
    if (typeof all[i] !== 'string') throw new Error('gone');
    const bytes = Uint8Array.from(atob(all[i]), c => c.charCodeAt(0));
    location.replace(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
  } catch (e) { document.body.textContent = 'These labels are no longer here. Run the print again.'; }
})();
